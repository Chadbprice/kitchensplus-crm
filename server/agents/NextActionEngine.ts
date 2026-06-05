/**
 * NextActionEngine — deterministic rules engine for project next actions.
 *
 * For each active project, evaluates 15+ project state signals and produces:
 *   - primaryAction + primaryActionType
 *   - top 3 supportingActions
 *   - reason, urgency, confidence, requiresApproval, relatedEntities
 *
 * Rules are evaluated in priority order. The first matching rule wins the
 * primary slot. Remaining matching rules fill the supporting slots (up to 3).
 */

import { getDb } from "../db";
import { invokeLLM } from "../_core/llm";
import {
  projects, milestones, projectTasks, invoices, changeOrders,
  messages, subcontractors, subcontractorDocs, projectNextActions,
  approvalQueue, projectAssignments, projectRiskScores,
} from "../../drizzle/schema";
import { eq, and, lt, isNull, ne, desc, or, inArray, sql } from "drizzle-orm";
import { executeNextAction } from "./NextActionExecutor";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NextActionResult {
  primaryAction: string;
  primaryActionType: string;
  supportingActions: Array<{ action: string; actionType: string; reason: string }>;
  reason: string;
  urgency: "low" | "medium" | "high" | "critical";
  confidence: "low" | "medium" | "high";
  requiresApproval: boolean;
  relatedEntities: Array<{ type: string; id: number; label: string }>;
}

interface ProjectSignals {
  projectId: number;
  projectName: string;
  status: string;
  overdueInvoices: Array<{ id: number; invoiceNumber: string | null; amount: string; dueDate: Date | null }>;
  unsignedDepositInvoices: Array<{ id: number; invoiceNumber: string | null }>;
  blockedTasks: Array<{ id: number; title: string }>;
  delayedMilestones: Array<{ id: number; title: string; dueDate: Date | null }>;
  overdueMilestones: Array<{ id: number; title: string; dueDate: Date | null }>;
  pendingChangOrders: Array<{ id: number; changeOrderNumber: string; amount: string }>;
  communicationGapDays: number;
  lastOutboundAt: Date | null;
  expiredComplianceDocs: Array<{ id: number; docType: string; subName: string }>;
  pendingApprovals: number;
  riskLevel: string | null;
  overallRiskScore: number | null;
  noDepositInvoice: boolean;
  hasOnHoldStatus: boolean;
  daysSinceLastActivity: number;
  unansweredQuestions: Array<{ id: number; title: string }>;
}

// ── Rule interface ────────────────────────────────────────────────────────────

interface Rule {
  id: string;
  actionType: string;
  urgency: "low" | "medium" | "high" | "critical";
  confidence: "low" | "medium" | "high";
  requiresApproval: boolean;
  matches: (s: ProjectSignals) => boolean;
  action: (s: ProjectSignals) => string;
  reason: (s: ProjectSignals) => string;
  entities: (s: ProjectSignals) => Array<{ type: string; id: number; label: string }>;
}

// ── Rules (evaluated in priority order) ──────────────────────────────────────

const RULES: Rule[] = [
  // ── CRITICAL: Expired compliance docs ─────────────────────────────────────
  {
    id: "expired_compliance",
    actionType: "request_missing_compliance_doc",
    urgency: "critical",
    confidence: "high",
    requiresApproval: false,
    matches: (s) => s.expiredComplianceDocs.length > 0,
    action: (s) => `Request updated compliance documents from ${s.expiredComplianceDocs[0].subName} (${s.expiredComplianceDocs[0].docType})`,
    reason: (s) => `${s.expiredComplianceDocs.length} compliance document(s) are expired or expiring soon. Work cannot legally proceed without valid COI/workers comp.`,
    entities: (s) => s.expiredComplianceDocs.slice(0, 3).map((d) => ({ type: "compliance_doc", id: d.id, label: `${d.subName} — ${d.docType}` })),
  },

  // ── CRITICAL: Overdue invoice (> 7 days past due) ─────────────────────────
  {
    id: "overdue_invoice",
    actionType: "follow_up_overdue_deposit",
    urgency: "critical",
    confidence: "high",
    requiresApproval: false,
    matches: (s) => s.overdueInvoices.length > 0,
    action: (s) => `Follow up on overdue invoice ${s.overdueInvoices[0].invoiceNumber ?? `#${s.overdueInvoices[0].id}`} ($${Number(s.overdueInvoices[0].amount).toLocaleString()})`,
    reason: (s) => `${s.overdueInvoices.length} invoice(s) are past due. Cash flow is at risk.`,
    entities: (s) => s.overdueInvoices.slice(0, 3).map((i) => ({ type: "invoice", id: i.id, label: `Invoice ${i.invoiceNumber ?? i.id} — $${Number(i.amount).toLocaleString()}` })),
  },

  // ── HIGH: Unsigned deposit invoice (project can't start) ──────────────────
  {
    id: "unsigned_deposit",
    actionType: "follow_up_overdue_deposit",
    urgency: "high",
    confidence: "high",
    requiresApproval: false,
    matches: (s) => s.unsignedDepositInvoices.length > 0,
    action: (s) => `Follow up on unsigned deposit invoice ${s.unsignedDepositInvoices[0].invoiceNumber ?? `#${s.unsignedDepositInvoices[0].id}`}`,
    reason: (s) => `Deposit invoice has been sent but not signed/paid. Project cannot begin until deposit is collected.`,
    entities: (s) => s.unsignedDepositInvoices.slice(0, 2).map((i) => ({ type: "invoice", id: i.id, label: `Deposit Invoice ${i.invoiceNumber ?? i.id}` })),
  },

  // ── HIGH: Blocked tasks ────────────────────────────────────────────────────
  {
    id: "blocked_tasks",
    actionType: "request_client_decision",
    urgency: "high",
    confidence: "high",
    requiresApproval: false,
    matches: (s) => s.blockedTasks.length > 0,
    action: (s) => `Resolve blocked task: "${s.blockedTasks[0].title}"`,
    reason: (s) => `${s.blockedTasks.length} task(s) are blocked and preventing work from moving forward. Client decision or resource may be needed.`,
    entities: (s) => s.blockedTasks.slice(0, 3).map((t) => ({ type: "task", id: t.id, label: t.title })),
  },

  // ── HIGH: Delayed milestones ───────────────────────────────────────────────
  {
    id: "delayed_milestone",
    actionType: "notify_client_milestone_delay",
    urgency: "high",
    confidence: "high",
    requiresApproval: true,
    matches: (s) => s.delayedMilestones.length > 0,
    action: (s) => `Notify client of delay on milestone: "${s.delayedMilestones[0].title}"`,
    reason: (s) => `${s.delayedMilestones.length} milestone(s) are marked as delayed. Client should be informed proactively.`,
    entities: (s) => s.delayedMilestones.slice(0, 3).map((m) => ({ type: "milestone", id: m.id, label: m.title })),
  },

  // ── HIGH: Overdue milestones (past due date, not completed) ───────────────
  {
    id: "overdue_milestone",
    actionType: "request_subcontractor_eta",
    urgency: "high",
    confidence: "medium",
    requiresApproval: false,
    matches: (s) => s.overdueMilestones.length > 0,
    action: (s) => `Request updated ETA for overdue milestone: "${s.overdueMilestones[0].title}"`,
    reason: (s) => `${s.overdueMilestones.length} milestone(s) are past their due date without completion. Subcontractor ETA needed.`,
    entities: (s) => s.overdueMilestones.slice(0, 3).map((m) => ({ type: "milestone", id: m.id, label: m.title })),
  },

  // ── HIGH: Pending change orders awaiting client approval ──────────────────
  {
    id: "pending_change_order",
    actionType: "review_change_order_candidate",
    urgency: "high",
    confidence: "high",
    requiresApproval: false,
    matches: (s) => s.pendingChangOrders.length > 0,
    action: (s) => `Follow up on pending change order ${s.pendingChangOrders[0].changeOrderNumber} ($${Number(s.pendingChangOrders[0].amount).toLocaleString()})`,
    reason: (s) => `${s.pendingChangOrders.length} change order(s) are awaiting client approval. Work may be blocked until approved.`,
    entities: (s) => s.pendingChangOrders.slice(0, 3).map((co) => ({ type: "change_order", id: co.id, label: `CO ${co.changeOrderNumber} — $${Number(co.amount).toLocaleString()}` })),
  },

  // ── HIGH: Unanswered questions (RFI-type tasks) ───────────────────────────
  {
    id: "unanswered_questions",
    actionType: "request_client_decision",
    urgency: "high",
    confidence: "high",
    requiresApproval: false,
    matches: (s) => s.unansweredQuestions.length > 0,
    action: (s) => `Get client answer on: "${s.unansweredQuestions[0].title}"`,
    reason: (s) => `${s.unansweredQuestions.length} open question(s) need client response before work can proceed.`,
    entities: (s) => s.unansweredQuestions.slice(0, 3).map((t) => ({ type: "task", id: t.id, label: t.title })),
  },

  // ── MEDIUM: Communication gap > 7 days ────────────────────────────────────
  {
    id: "communication_gap",
    actionType: "send_weekly_client_update",
    urgency: "medium",
    confidence: "high",
    requiresApproval: true,
    matches: (s) => s.communicationGapDays >= 7,
    action: (s) => `Send weekly client update (${s.communicationGapDays} days since last outbound message)`,
    reason: (s) => `No outbound communication to client in ${s.communicationGapDays} days. Regular updates maintain trust and reduce inbound inquiries.`,
    entities: (s) => [],
  },

  // ── MEDIUM: High/critical risk score ──────────────────────────────────────
  {
    id: "high_risk",
    actionType: "review_project_risk",
    urgency: "medium",
    confidence: "medium",
    requiresApproval: false,
    matches: (s) => s.riskLevel === "high" || s.riskLevel === "critical",
    action: (s) => `Review and address ${s.riskLevel} risk factors on this project`,
    reason: (s) => `Project risk score is ${s.overallRiskScore}/100 (${s.riskLevel}). Review top risk factors and take corrective action.`,
    entities: (s) => [],
  },

  // ── MEDIUM: Project on hold ────────────────────────────────────────────────
  {
    id: "on_hold",
    actionType: "request_client_decision",
    urgency: "medium",
    confidence: "medium",
    requiresApproval: false,
    matches: (s) => s.hasOnHoldStatus,
    action: (s) => `Reach out to client to resolve on-hold status and restart project`,
    reason: (s) => `Project is on hold. Client decision or resource resolution needed to resume.`,
    entities: (s) => [],
  },

  // ── MEDIUM: No deposit invoice created yet ────────────────────────────────
  {
    id: "no_deposit_invoice",
    actionType: "follow_up_overdue_deposit",
    urgency: "medium",
    confidence: "high",
    requiresApproval: false,
    matches: (s) => s.noDepositInvoice && s.status === "active",
    action: (s) => `Create and send deposit invoice to start the project`,
    reason: (s) => `No deposit invoice has been created for this active project. Deposit collection should happen before work begins.`,
    entities: (s) => [],
  },

  // ── MEDIUM: Pending approvals in queue ────────────────────────────────────
  {
    id: "pending_approvals",
    actionType: "review_pending_approvals",
    urgency: "medium",
    confidence: "high",
    requiresApproval: false,
    matches: (s) => s.pendingApprovals > 0,
    action: (s) => `Review ${s.pendingApprovals} pending approval(s) in the queue`,
    reason: (s) => `There are ${s.pendingApprovals} items awaiting your approval. Delays in approval can block automated communications.`,
    entities: (s) => [],
  },

  // ── LOW: Quiet project (no activity in 14+ days) ──────────────────────────
  {
    id: "quiet_project",
    actionType: "schedule_walkthrough",
    urgency: "low",
    confidence: "low",
    requiresApproval: false,
    matches: (s) => s.daysSinceLastActivity >= 14 && s.status === "active",
    action: (s) => `Schedule a site walkthrough — no activity recorded in ${s.daysSinceLastActivity} days`,
    reason: (s) => `This project has been quiet for ${s.daysSinceLastActivity} days. A walkthrough or check-in call can uncover blockers early.`,
    entities: (s) => [],
  },

  // ── LOW: Default — project is progressing normally ────────────────────────
  {
    id: "default_healthy",
    actionType: "send_weekly_client_update",
    urgency: "low",
    confidence: "medium",
    requiresApproval: true,
    matches: (_s) => true,
    action: (_s) => `Send a brief client update to maintain momentum`,
    reason: (_s) => `No critical issues detected. Maintaining regular communication keeps the project relationship strong.`,
    entities: (_s) => [],
  },
];

// ── Signal collector ──────────────────────────────────────────────────────────

async function collectSignals(projectId: number): Promise<ProjectSignals | null> {
  const db = await getDb();
  if (!db) return null;

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Project basics
  const [project] = await db.select({
    id: projects.id,
    name: projects.name,
    status: projects.status,
    updatedAt: projects.updatedAt,
  }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;

  // Overdue invoices (status = 'overdue' OR (status = 'sent' AND dueDate < now))
  const overdueInvoices = await db.select({
    id: invoices.id,
    invoiceNumber: invoices.invoiceNumber,
    amount: invoices.amount,
    dueDate: invoices.dueDate,
  }).from(invoices).where(
    and(
      eq(invoices.projectId, projectId),
      or(
        eq(invoices.status, "overdue"),
        and(eq(invoices.status, "sent"), lt(invoices.dueDate, now))
      )
    )
  ).limit(5);

  // Unsigned deposit invoices (sent but not paid, contractRequired = true, not signed)
  const unsignedDepositInvoices = await db.select({
    id: invoices.id,
    invoiceNumber: invoices.invoiceNumber,
  }).from(invoices).where(
    and(
      eq(invoices.projectId, projectId),
      eq(invoices.invoiceType, "deposit"),
      eq(invoices.status, "sent"),
      eq(invoices.contractRequired, true),
      eq(invoices.contractSigned, false),
    )
  ).limit(3);

  // No deposit invoice at all
  const depositInvoiceCount = await db.select({ count: sql<number>`COUNT(*)` })
    .from(invoices)
    .where(and(eq(invoices.projectId, projectId), eq(invoices.invoiceType, "deposit")));
  const noDepositInvoice = Number(depositInvoiceCount[0]?.count ?? 0) === 0;

  // Blocked tasks
  const blockedTasks = await db.select({ id: projectTasks.id, title: projectTasks.title })
    .from(projectTasks)
    .where(and(eq(projectTasks.projectId, projectId), eq(projectTasks.status, "blocked")))
    .limit(5);

  // Unanswered question tasks
  const unansweredQuestions = await db.select({ id: projectTasks.id, title: projectTasks.title })
    .from(projectTasks)
    .where(and(
      eq(projectTasks.projectId, projectId),
      sql`${projectTasks.isQuestion} = 1`,
      ne(projectTasks.status, "completed"),
    ))
    .limit(5);

  // Delayed milestones
  const delayedMilestones = await db.select({ id: milestones.id, title: milestones.title, dueDate: milestones.dueDate })
    .from(milestones)
    .where(and(eq(milestones.projectId, projectId), eq(milestones.status, "delayed")))
    .limit(5);

  // Overdue milestones (past due date, not completed)
  const overdueMilestones = await db.select({ id: milestones.id, title: milestones.title, dueDate: milestones.dueDate })
    .from(milestones)
    .where(and(
      eq(milestones.projectId, projectId),
      ne(milestones.status, "completed"),
      lt(milestones.dueDate, now),
      isNull(milestones.completedAt),
    ))
    .limit(5);

  // Pending change orders (sent, awaiting approval)
  const pendingChangOrders = await db.select({
    id: changeOrders.id,
    changeOrderNumber: changeOrders.changeOrderNumber,
    amount: changeOrders.amount,
  }).from(changeOrders).where(
    and(eq(changeOrders.projectId, projectId), eq(changeOrders.status, "sent"))
  ).limit(5);

  // Communication gap — last outbound client message
  const [lastMsg] = await db.select({ sentAt: messages.sentAt, createdAt: messages.createdAt })
    .from(messages)
    .where(and(
      eq(messages.projectId, projectId),
      eq(messages.direction, "outbound"),
      eq(messages.threadType, "client"),
    ))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  const lastOutboundAt = lastMsg?.sentAt ?? lastMsg?.createdAt ?? null;
  const communicationGapDays = lastOutboundAt
    ? Math.floor((now.getTime() - new Date(lastOutboundAt).getTime()) / (24 * 60 * 60 * 1000))
    : 999;

  // Expired compliance docs (subcontractors assigned to this project)
  const assignedSubRows = await db.select({ assigneeId: projectAssignments.assigneeId })
    .from(projectAssignments)
    .where(and(
      eq(projectAssignments.projectId, projectId),
      eq(projectAssignments.assigneeType, "vendor"),
    ))
    .limit(20);
  const subIds = assignedSubRows.map((r) => r.assigneeId);

  let expiredComplianceDocs: Array<{ id: number; docType: string; subName: string }> = [];
  if (subIds.length > 0) {
    const expiredDocs = await db.select({
      id: subcontractorDocs.id,
      docType: subcontractorDocs.docType,
      subcontractorId: subcontractorDocs.subcontractorId,
    }).from(subcontractorDocs).where(
      and(
        inArray(subcontractorDocs.subcontractorId, subIds),
        or(
          eq(subcontractorDocs.status, "expired"),
          lt(subcontractorDocs.expiryDate, now),
        )
      )
    ).limit(5);

    if (expiredDocs.length > 0) {
      const subNames = await db.select({ id: subcontractors.id, companyName: subcontractors.companyName })
        .from(subcontractors)
        .where(inArray(subcontractors.id, expiredDocs.map((d) => d.subcontractorId)));
      const nameMap = new Map(subNames.map((s) => [s.id, s.companyName]));
      expiredComplianceDocs = expiredDocs.map((d) => ({
        id: d.id,
        docType: d.docType,
        subName: nameMap.get(d.subcontractorId) ?? `Sub #${d.subcontractorId}`,
      }));
    }
  }

  // Pending approvals in queue for this project
  const [approvalCount] = await db.select({ count: sql<number>`COUNT(*)` })
    .from(approvalQueue)
    .where(and(
      eq(approvalQueue.entityId, projectId),
      eq(approvalQueue.status, "pending"),
    ));
  const pendingApprovals = Number(approvalCount?.count ?? 0);

  // Latest risk score
  const [riskRow] = await db.select({
    riskLevel: projectRiskScores.riskLevel,
    overallRiskScore: projectRiskScores.overallRiskScore,
  }).from(projectRiskScores)
    .where(eq(projectRiskScores.projectId, projectId))
    .orderBy(desc(projectRiskScores.scoredAt))
    .limit(1);

  // Days since last project activity
  const daysSinceLastActivity = Math.floor(
    (now.getTime() - new Date(project.updatedAt).getTime()) / (24 * 60 * 60 * 1000)
  );

  return {
    projectId,
    projectName: project.name,
    status: project.status,
    overdueInvoices,
    unsignedDepositInvoices,
    blockedTasks,
    delayedMilestones,
    overdueMilestones,
    pendingChangOrders,
    communicationGapDays,
    lastOutboundAt,
    expiredComplianceDocs,
    pendingApprovals,
    riskLevel: riskRow?.riskLevel ?? null,
    overallRiskScore: riskRow?.overallRiskScore ?? null,
    noDepositInvoice,
    hasOnHoldStatus: project.status === "on_hold",
    daysSinceLastActivity,
    unansweredQuestions,
  };
}

// ── AI explanation enrichment ─────────────────────────────────────────────────

async function enrichWithAI(
  result: Omit<NextActionResult, "reason">,
  signals: ProjectSignals,
  baseReason: string,
): Promise<string> {
  try {
    const prompt = `You are the AI COO for Kitchens Plus Upstate, a luxury kitchen renovation company.

Project: "${signals.projectName}" (status: ${signals.status})

The system has determined the primary next action is:
"${result.primaryAction}"

Base reason: ${baseReason}

Key signals:
- Communication gap: ${signals.communicationGapDays} days since last client message
- Blocked tasks: ${signals.blockedTasks.length}
- Overdue invoices: ${signals.overdueInvoices.length}
- Delayed milestones: ${signals.delayedMilestones.length}
- Pending change orders: ${signals.pendingChangOrders.length}
- Risk level: ${signals.riskLevel ?? "unknown"}
- Unanswered questions: ${signals.unansweredQuestions.length}

Write a concise 1-2 sentence explanation (max 200 chars) of why this action is the most important right now. Be direct and specific. No fluff.`;

    const response = await invokeLLM({
      messages: [{ role: "user", content: prompt }],
    });
    const text = response?.choices?.[0]?.message?.content?.trim() ?? "";
    return text.length > 10 ? text : baseReason;
  } catch {
    return baseReason;
  }
}

// ── Main compute function ─────────────────────────────────────────────────────

export async function computeNextAction(
  projectId: number,
  enrichWithExplanation = true,
): Promise<NextActionResult | null> {
  const db = await getDb();
  if (!db) return null;

  const signals = await collectSignals(projectId);
  if (!signals) return null;

  // Evaluate all rules
  const matchingRules = RULES.filter((r) => r.matches(signals));
  if (matchingRules.length === 0) return null;

  const [primaryRule, ...rest] = matchingRules;

  const baseReason = primaryRule.reason(signals);
  const supportingActions = rest.slice(0, 3).map((r) => ({
    action: r.action(signals),
    actionType: r.actionType,
    reason: r.reason(signals),
  }));

  const partialResult = {
    primaryAction: primaryRule.action(signals),
    primaryActionType: primaryRule.actionType,
    supportingActions,
    urgency: primaryRule.urgency,
    confidence: primaryRule.confidence,
    requiresApproval: primaryRule.requiresApproval,
    relatedEntities: primaryRule.entities(signals),
  };

  // Enrich reason with AI (non-blocking, falls back to base reason on failure)
  const reason = enrichWithExplanation
    ? await enrichWithAI(partialResult, signals, baseReason)
    : baseReason;

  const result: NextActionResult = { ...partialResult, reason };

  // Persist to DB (upsert: delete old, insert new)
  await db.delete(projectNextActions).where(eq(projectNextActions.projectId, projectId));
  await db.insert(projectNextActions).values({
    projectId,
    primaryAction: result.primaryAction,
    primaryActionType: result.primaryActionType,
    supportingActions: JSON.stringify(result.supportingActions),
    reason: result.reason,
    urgency: result.urgency,
    confidence: result.confidence,
    requiresApproval: result.requiresApproval,
    relatedEntities: JSON.stringify(result.relatedEntities),
    rulesVersion: "1.0",
    isStale: false,
  });

  // ── Action Execution Layer: generate draft/queue item if applicable ──────
  // Fire-and-forget — never blocks the recompute result
  executeNextAction(projectId, result).catch((err) => {
    console.error(`[NextActionEngine] Executor failed for project ${projectId}:`, err);
  });

  return result;
}

/**
 * Mark a project's next action as stale (triggers recompute on next read).
 */
export async function markNextActionStale(projectId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(projectNextActions)
    .set({ isStale: true })
    .where(eq(projectNextActions.projectId, projectId));
}

/**
 * Get the latest persisted next action for a project (without recomputing).
 */
export async function getNextAction(projectId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(projectNextActions)
    .where(eq(projectNextActions.projectId, projectId))
    .orderBy(desc(projectNextActions.computedAt))
    .limit(1);
  if (!row) return null;
  return {
    ...row,
    supportingActions: row.supportingActions ? JSON.parse(row.supportingActions) : [],
    relatedEntities: row.relatedEntities ? JSON.parse(row.relatedEntities) : [],
  };
}
