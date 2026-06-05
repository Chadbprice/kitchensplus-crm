/**
 * NextActionExecutor — converts a computed next action into a concrete
 * draft/queue item in the approval queue.
 *
 * Called automatically after every successful computeNextAction.
 * For each supported primaryActionType, it:
 *   1. Checks dedup (pendingApprovalExists + 6-hour sharedMemory cooldown)
 *   2. Resolves project/client/subcontractor context
 *   3. Generates a draft message (LLM with deterministic fallback)
 *   4. Creates an approval queue item with structured payload
 *
 * All actions require owner approval before execution.
 * Non-communication action types (review_project_risk, schedule_walkthrough, etc.)
 * are intentionally skipped — they are informational, not actionable drafts.
 */

import { getDb } from "../db";
import { projects, clients, leads, subcontractors, projectAssignments, subcontractorDocs } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { createApprovalItem, pendingApprovalExists } from "./approvalQueue";
import { memGet, memSet, agentKey } from "./sharedMemory";
import type { NextActionResult } from "./NextActionEngine";
import { NEXT_ACTION_EXECUTOR_COOLDOWN_HOURS } from "../../shared/operationalConfig";

const AGENT_NAME = "NextActionExecutor";
const COOLDOWN_MS = NEXT_ACTION_EXECUTOR_COOLDOWN_HOURS * 60 * 60 * 1000;

// ── Action types that produce sendable client communication drafts ────────────
// These map to approval queue action types defined in shared/commActionTypes.ts
export const EXECUTABLE_CLIENT_COMM_TYPES = [
  "send_weekly_client_update",
  "follow_up_overdue_deposit",
  "request_client_decision",
  "notify_client_milestone_delay",
  "review_change_order_candidate",
] as const;

// ── Action types that produce subcontractor/vendor communication drafts ──────
export const EXECUTABLE_SUB_COMM_TYPES = [
  "request_missing_compliance_doc",
  "request_subcontractor_eta",
] as const;

// ── All executable types ─────────────────────────────────────────────────────
const ALL_EXECUTABLE_TYPES = new Set<string>([
  ...EXECUTABLE_CLIENT_COMM_TYPES,
  ...EXECUTABLE_SUB_COMM_TYPES,
]);

// ── Approval queue action type mapping ───────────────────────────────────────
// Maps next-action primaryActionType → approval queue actionType
// Client comm types map to the existing sendCommunication-compatible types
const ACTION_TYPE_MAP: Record<string, string> = {
  send_weekly_client_update:      "weekly_client_update",
  follow_up_overdue_deposit:      "payment_reminder_client",
  request_client_decision:        "client_decision_request",
  notify_client_milestone_delay:  "milestone_delayed_client_message",
  review_change_order_candidate:  "change_order_followup",
  request_missing_compliance_doc: "compliance_doc_request",
  request_subcontractor_eta:      "subcontractor_eta_request",
};

// ── Context resolver ─────────────────────────────────────────────────────────

interface ProjectContext {
  projectId: number;
  projectName: string;
  projectStatus: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
}

async function resolveProjectContext(projectId: number): Promise<ProjectContext | null> {
  const db = await getDb();
  if (!db) return null;

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;

  let clientName = "Valued Client";
  let clientEmail: string | null = null;
  let clientPhone: string | null = null;

  if (project.clientId) {
    const [client] = await db.select().from(clients).where(eq(clients.id, project.clientId)).limit(1);
    if (client) {
      clientName = client.name ?? clientName;
      clientEmail = client.email ?? null;
      clientPhone = client.phone ?? null;
    }
  } else if (project.leadId) {
    const [lead] = await db.select().from(leads).where(eq(leads.id, project.leadId)).limit(1);
    if (lead) {
      clientName = lead.name ?? clientName;
      clientEmail = lead.email ?? null;
      clientPhone = lead.phone ?? null;
    }
  }

  return {
    projectId,
    projectName: project.name ?? "Renovation Project",
    projectStatus: project.status,
    clientName,
    clientEmail,
    clientPhone,
  };
}

interface SubcontractorContext {
  subId: number;
  companyName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
}

async function resolveSubcontractorContext(projectId: number, relatedEntities: Array<{ type: string; id: number; label: string }>): Promise<SubcontractorContext | null> {
  const db = await getDb();
  if (!db) return null;

  // Try to find subcontractor from related entities
  const complianceEntity = relatedEntities.find(e => e.type === "compliance_doc");
  const milestoneEntity = relatedEntities.find(e => e.type === "milestone");

  // Get assigned subcontractors for this project
  const assignments = await db.select({ assigneeId: projectAssignments.assigneeId })
    .from(projectAssignments)
    .where(and(
      eq(projectAssignments.projectId, projectId),
      eq(projectAssignments.assigneeType, "vendor"),
    ))
    .limit(10);

  if (assignments.length === 0) return null;

  // If we have a compliance doc entity, find the subcontractor who owns it
  let targetSubId: number | null = null;
  if (complianceEntity) {
    const [doc] = await db.select({ subcontractorId: subcontractorDocs.subcontractorId })
      .from(subcontractorDocs)
      .where(eq(subcontractorDocs.id, complianceEntity.id))
      .limit(1);
    if (doc) targetSubId = doc.subcontractorId;
  }

  // Fallback: use first assigned subcontractor
  if (!targetSubId) targetSubId = assignments[0].assigneeId;

  const [sub] = await db.select().from(subcontractors).where(eq(subcontractors.id, targetSubId)).limit(1);
  if (!sub) return null;

  return {
    subId: sub.id,
    companyName: sub.companyName,
    contactName: sub.contactName ?? null,
    email: sub.email ?? null,
    phone: sub.phone ?? null,
  };
}

// ── Draft generators ─────────────────────────────────────────────────────────

async function generateClientDraft(
  actionType: string,
  primaryAction: string,
  reason: string,
  ctx: ProjectContext,
): Promise<{ subject: string; draftMessage: string }> {
  const firstName = ctx.clientName.split(" ")[0];

  // Deterministic fallback drafts per action type
  const fallbacks: Record<string, { subject: string; draftMessage: string }> = {
    send_weekly_client_update: {
      subject: `Weekly Update — ${ctx.projectName}`,
      draftMessage: `Hi ${firstName},\n\nWe hope you're doing well. Here's a quick update on your ${ctx.projectName} project. Work is progressing and we wanted to keep you in the loop.\n\nWe'll share more details soon. As always, please don't hesitate to reach out with any questions.\n\nWarm regards,\nKitchens Plus Upstate`,
    },
    follow_up_overdue_deposit: {
      subject: `Payment Reminder — ${ctx.projectName}`,
      draftMessage: `Hi ${firstName},\n\nWe wanted to follow up regarding an outstanding invoice for your ${ctx.projectName} project. We understand things can get busy, and we're here to help if you have any questions about the balance.\n\nPlease let us know if there's anything we can do to assist. We're looking forward to continuing your project.\n\nWarm regards,\nKitchens Plus Upstate`,
    },
    request_client_decision: {
      subject: `Your Input Needed — ${ctx.projectName}`,
      draftMessage: `Hi ${firstName},\n\nWe have a few items on your ${ctx.projectName} project that need your input before we can move forward. We want to make sure everything aligns with your vision.\n\nWould you have a moment to review and share your thoughts? We're happy to walk through the options together.\n\nWarm regards,\nKitchens Plus Upstate`,
    },
    notify_client_milestone_delay: {
      subject: `Project Update — ${ctx.projectName}`,
      draftMessage: `Hi ${firstName},\n\nWe wanted to keep you informed about your ${ctx.projectName} project. A phase has experienced a brief delay, and we're actively working to resolve it. We'll update you as soon as we have a revised timeline.\n\nWe appreciate your patience and are committed to delivering exceptional results.\n\nWarm regards,\nKitchens Plus Upstate`,
    },
    review_change_order_candidate: {
      subject: `Change Order Follow-Up — ${ctx.projectName}`,
      draftMessage: `Hi ${firstName},\n\nWe have a pending change order for your ${ctx.projectName} project that's awaiting your review. We want to make sure you have all the information you need to make a decision.\n\nPlease take a moment to review when you get a chance, and let us know if you have any questions.\n\nWarm regards,\nKitchens Plus Upstate`,
    },
  };

  const fallback = fallbacks[actionType] ?? {
    subject: `Update — ${ctx.projectName}`,
    draftMessage: `Hi ${firstName},\n\nWe have an update regarding your ${ctx.projectName} project. ${primaryAction}\n\nPlease don't hesitate to reach out with any questions.\n\nWarm regards,\nKitchens Plus Upstate`,
  };

  // Try LLM enrichment
  try {
    const prompt = `You are a luxury renovation company's client communication specialist for Kitchens Plus Upstate.

Project: ${ctx.projectName}
Client: ${ctx.clientName}
Action needed: ${primaryAction}
Reason: ${reason}

Write a brief, warm, professional email (2-3 short paragraphs).
- Start with "Hi ${firstName},"
- Be specific about what needs attention
- Tone: premium, warm, reassuring — like a private designer keeping their client informed
- Do NOT include placeholder text like [DATE] or [CONTACT INFO]
- Do NOT include a subject line — just the email body
- Sign off as "Kitchens Plus Upstate"
- Keep it under 200 words`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You write premium client communication for a luxury renovation company. Be concise and warm." },
        { role: "user", content: prompt },
      ],
    });
    const text = response?.choices?.[0]?.message?.content?.trim() ?? "";
    if (text.length > 30) {
      return { subject: fallback.subject, draftMessage: text };
    }
  } catch {
    // Fall through to deterministic draft
  }

  return fallback;
}

async function generateSubcontractorDraft(
  actionType: string,
  primaryAction: string,
  reason: string,
  projectCtx: ProjectContext,
  subCtx: SubcontractorContext,
): Promise<{ subject: string; draftMessage: string }> {
  const contactName = subCtx.contactName ?? subCtx.companyName;

  const fallbacks: Record<string, { subject: string; draftMessage: string }> = {
    request_missing_compliance_doc: {
      subject: `Compliance Documents Needed — ${projectCtx.projectName}`,
      draftMessage: `Hi ${contactName},\n\nWe need updated compliance documentation for your work on the ${projectCtx.projectName} project. Please provide the required documents at your earliest convenience so we can keep the project moving forward.\n\nIf you have any questions about what's needed, please don't hesitate to reach out.\n\nThank you,\nKitchens Plus Upstate`,
    },
    request_subcontractor_eta: {
      subject: `ETA Request — ${projectCtx.projectName}`,
      draftMessage: `Hi ${contactName},\n\nWe're checking in on the status of your current work on the ${projectCtx.projectName} project. A milestone is past its scheduled date and we'd like to get an updated ETA so we can coordinate the rest of the project timeline.\n\nPlease let us know your expected completion date when you get a chance.\n\nThank you,\nKitchens Plus Upstate`,
    },
  };

  return fallbacks[actionType] ?? {
    subject: `Follow-Up — ${projectCtx.projectName}`,
    draftMessage: `Hi ${contactName},\n\n${primaryAction}\n\nPlease let us know if you have any questions.\n\nThank you,\nKitchens Plus Upstate`,
  };
}

// ── Main executor ────────────────────────────────────────────────────────────

/**
 * Execute a computed next action by generating a draft and routing it
 * to the approval queue. Safe to call repeatedly — dedup prevents duplicates.
 *
 * @param projectId - The project this next action belongs to
 * @param result - The computed NextActionResult
 * @returns true if a draft was created, false if skipped (dedup/unsupported)
 */
export async function executeNextAction(
  projectId: number,
  result: NextActionResult,
): Promise<boolean> {
  const { primaryActionType, primaryAction, reason, urgency, relatedEntities } = result;

  // Skip non-executable action types
  if (!ALL_EXECUTABLE_TYPES.has(primaryActionType)) {
    return false;
  }

  const approvalActionType = ACTION_TYPE_MAP[primaryActionType];
  if (!approvalActionType) return false;

  // ── Dedup: check if a pending approval already exists for this action type + project
  const alreadyPending = await pendingApprovalExists("project", projectId, approvalActionType);
  if (alreadyPending) {
    console.log(`[${AGENT_NAME}] Skipping — pending approval already exists for project ${projectId} / ${approvalActionType}`);
    return false;
  }

  // ── Cooldown: prevent rapid re-drafting (6 hours per project per action type)
  const cooldownKey = agentKey(AGENT_NAME, String(projectId), primaryActionType);
  const lastRun = await memGet(cooldownKey);
  if (lastRun && Date.now() - Number(lastRun) < COOLDOWN_MS) {
    console.log(`[${AGENT_NAME}] Cooldown active for project ${projectId} / ${primaryActionType}`);
    return false;
  }

  // ── Resolve context
  const projectCtx = await resolveProjectContext(projectId);
  if (!projectCtx) return false;

  // ── Generate draft based on action type category
  const isClientComm = (EXECUTABLE_CLIENT_COMM_TYPES as readonly string[]).includes(primaryActionType);
  const isSubComm = (EXECUTABLE_SUB_COMM_TYPES as readonly string[]).includes(primaryActionType);

  let title: string;
  let description: string;
  let severity: "info" | "warning" | "critical";
  let payload: Record<string, unknown>;

  if (isClientComm) {
    const { subject, draftMessage } = await generateClientDraft(
      primaryActionType, primaryAction, reason, projectCtx,
    );

    // Map urgency to severity
    severity = urgency === "critical" ? "critical" : urgency === "high" ? "warning" : "info";

    title = `📋 ${primaryAction}`;
    description = `Project: ${projectCtx.projectName} | Client: ${projectCtx.clientName}${projectCtx.clientEmail ? ` (${projectCtx.clientEmail})` : ""}${projectCtx.clientPhone ? ` | ${projectCtx.clientPhone}` : ""}\n\n---\nDRAFT MESSAGE:\n${draftMessage}`;

    payload = {
      projectId,
      projectName: projectCtx.projectName,
      clientName: projectCtx.clientName,
      clientEmail: projectCtx.clientEmail,
      clientPhone: projectCtx.clientPhone,
      subject,
      draftMessage,
      nextActionType: primaryActionType,
      generatedBy: AGENT_NAME,
    };
  } else if (isSubComm) {
    const subCtx = await resolveSubcontractorContext(projectId, relatedEntities);

    const { subject, draftMessage } = await generateSubcontractorDraft(
      primaryActionType, primaryAction, reason, projectCtx,
      subCtx ?? { subId: 0, companyName: "Subcontractor", contactName: null, email: null, phone: null },
    );

    severity = urgency === "critical" ? "critical" : "warning";

    title = `📋 ${primaryAction}`;
    description = `Project: ${projectCtx.projectName}${subCtx ? ` | Sub: ${subCtx.companyName}` : ""}${subCtx?.email ? ` (${subCtx.email})` : ""}${subCtx?.phone ? ` | ${subCtx.phone}` : ""}\n\n---\nDRAFT MESSAGE:\n${draftMessage}`;

    payload = {
      projectId,
      projectName: projectCtx.projectName,
      subcontractorName: subCtx?.companyName ?? "Subcontractor",
      subcontractorEmail: subCtx?.email ?? null,
      subcontractorPhone: subCtx?.phone ?? null,
      clientEmail: subCtx?.email ?? null,  // sendCommunication uses clientEmail field
      clientPhone: subCtx?.phone ?? null,  // sendCommunication uses clientPhone field
      clientName: subCtx?.contactName ?? subCtx?.companyName ?? "Subcontractor",
      subject,
      draftMessage,
      nextActionType: primaryActionType,
      generatedBy: AGENT_NAME,
    };
  } else {
    return false;
  }

  // ── Create approval queue item
  await createApprovalItem({
    agentName: AGENT_NAME,
    actionType: approvalActionType,
    severity,
    title,
    description,
    relatedEntityType: "project",
    relatedEntityId: projectId,
    projectId,
    metadata: JSON.stringify(payload),
  });

  // ── Record cooldown
  await memSet(cooldownKey, String(Date.now()));

  console.log(`[${AGENT_NAME}] Created draft for project ${projectId} — ${approvalActionType}`);
  return true;
}
