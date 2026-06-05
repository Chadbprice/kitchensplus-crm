/**
 * Financial Review AI System
 * Orchestrates 5 specialist financial checks across all active projects.
 * Phase 1: 100% deterministic rules — no LLM calls.
 *
 * Checks per project:
 *   1. BudgetOverrunCheck   — budgetActual vs budgetEstimated
 *   2. OverdueInvoiceCheck  — sent invoices past their due date
 *   3. UnbilledMilestoneCheck — completed milestones with no invoice
 *   4. PaymentGapCheck      — large time gap since last payment on active project
 *   5. DepositStatusCheck   — deposit not collected on active/planning project
 */
import { getDb } from "../../db";
import {
  projects,
  invoices,
  invoicePayments,
  milestones,
  financialSnapshots,
} from "../../../drizzle/schema";
import { eq, and, inArray, isNull, lte, gt } from "drizzle-orm";
import { runAgent, AgentResult } from "../agentRunner";
import { createAlert, activeAlertExists, resolveAlertsForEntity } from "../alertService";
import { createApprovalItem, pendingApprovalExists } from "../approvalQueue";
import { emitEvent, EVENTS } from "../eventBus";
import { agentKey, memSet } from "../sharedMemory";
import { notifyOwner } from "../../_core/notification";
import {
  PAYMENT_GAP_WARN_DAYS,
  PAYMENT_GAP_CRITICAL_DAYS,
} from "../../../shared/operationalConfig";

const AGENT_NAME = "FinancialReviewAgent";

// Thresholds — payment gap from shared/operationalConfig.ts
const OVERRUN_WARN_PCT   = 10;   // warn at 10% over budget
const OVERRUN_CRITICAL_PCT = 25; // critical at 25% over budget

// ─── Types ────────────────────────────────────────────────────────────────────

type FinancialCheckType = "budget_overrun" | "overdue_invoice" | "unbilled_milestone" | "payment_gap" | "deposit_missing";
type CheckResult = "pass" | "warn" | "fail";

interface FinancialCheck {
  checkType: FinancialCheckType;
  result: CheckResult;
  value?: number;
  notes: string;
  severity?: "info" | "warning" | "critical";
}

interface ProjectFinancialResult {
  projectId: number;
  projectName: string;
  checks: FinancialCheck[];
  financialHealth: "healthy" | "watch" | "warning" | "critical";
  totalInvoiced: number;
  totalCollected: number;
  totalOverdue: number;
  overdueInvoiceCount: number;
  unbilledMilestoneCount: number;
  depositCollected: boolean;
  overrunPercent: number | null;
  newAlerts: number;
  newApprovals: number;
}

// ─── Helper: days since a date ────────────────────────────────────────────────

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function daysUntil(date: Date): number {
  return Math.floor((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// ─── Check 1: Budget Overrun ──────────────────────────────────────────────────

function checkBudgetOverrun(project: any): FinancialCheck {
  const estimated = parseFloat(project.budgetEstimated ?? "0");
  const actual = parseFloat(project.budgetActual ?? "0");

  if (estimated <= 0) {
    return { checkType: "budget_overrun", result: "pass", notes: "No budget estimate set" };
  }
  if (actual <= 0) {
    return { checkType: "budget_overrun", result: "pass", notes: "No actual spend recorded yet" };
  }

  const overrunPct = ((actual - estimated) / estimated) * 100;

  if (overrunPct >= OVERRUN_CRITICAL_PCT) {
    return {
      checkType: "budget_overrun",
      result: "fail",
      value: overrunPct,
      severity: "critical",
      notes: `Budget overrun: ${overrunPct.toFixed(1)}% over estimate ($${actual.toLocaleString()} vs $${estimated.toLocaleString()})`,
    };
  }
  if (overrunPct >= OVERRUN_WARN_PCT) {
    return {
      checkType: "budget_overrun",
      result: "warn",
      value: overrunPct,
      severity: "warning",
      notes: `Budget approaching overrun: ${overrunPct.toFixed(1)}% over estimate`,
    };
  }
  return {
    checkType: "budget_overrun",
    result: "pass",
    value: overrunPct,
    notes: `Budget on track (${overrunPct >= 0 ? "+" : ""}${overrunPct.toFixed(1)}%)`,
  };
}

// ─── Check 2: Overdue Invoices ────────────────────────────────────────────────

function checkOverdueInvoices(projectInvoices: any[]): { check: FinancialCheck; overdueAmount: number; overdueCount: number } {
  const now = new Date();
  const overdue = projectInvoices.filter(
    (inv) => inv.status === "sent" && inv.dueDate && new Date(inv.dueDate) < now
  );

  const overdueAmount = overdue.reduce((sum, inv) => {
    const paid = parseFloat(inv.amountPaid ?? "0");
    const total = parseFloat(inv.amount ?? "0");
    return sum + Math.max(0, total - paid);
  }, 0);

  if (overdue.length === 0) {
    return {
      check: { checkType: "overdue_invoice", result: "pass", notes: "No overdue invoices" },
      overdueAmount: 0,
      overdueCount: 0,
    };
  }

  const mostOverdueDays = Math.max(...overdue.map((inv) => daysSince(new Date(inv.dueDate))));
  const severity: "warning" | "critical" = mostOverdueDays > 30 ? "critical" : "warning";

  return {
    check: {
      checkType: "overdue_invoice",
      result: "fail",
      value: overdueAmount,
      severity,
      notes: `${overdue.length} overdue invoice${overdue.length === 1 ? "" : "s"} totaling $${overdueAmount.toLocaleString()} (oldest: ${mostOverdueDays} days overdue)`,
    },
    overdueAmount,
    overdueCount: overdue.length,
  };
}

// ─── Check 3: Unbilled Milestones ─────────────────────────────────────────────

function checkUnbilledMilestones(projectMilestones: any[], projectInvoices: any[]): { check: FinancialCheck; unbilledCount: number } {
  const billedMilestoneIds = new Set(
    projectInvoices
      .filter((inv) => inv.milestoneId && inv.status !== "cancelled")
      .map((inv) => inv.milestoneId)
  );

  const unbilled = projectMilestones.filter(
    (m) =>
      m.status === "completed" &&
      m.billingAmount &&
      parseFloat(m.billingAmount) > 0 &&
      !billedMilestoneIds.has(m.id)
  );

  if (unbilled.length === 0) {
    return {
      check: { checkType: "unbilled_milestone", result: "pass", notes: "All completed milestones have been invoiced" },
      unbilledCount: 0,
    };
  }

  const unbilledAmount = unbilled.reduce((sum, m) => sum + parseFloat(m.billingAmount ?? "0"), 0);
  return {
    check: {
      checkType: "unbilled_milestone",
      result: "warn",
      value: unbilledAmount,
      severity: "warning",
      notes: `${unbilled.length} completed milestone${unbilled.length === 1 ? "" : "s"} not yet invoiced (total: $${unbilledAmount.toLocaleString()})`,
    },
    unbilledCount: unbilled.length,
  };
}

// ─── Check 4: Payment Gap ─────────────────────────────────────────────────────

function checkPaymentGap(project: any, payments: any[]): FinancialCheck {
  if (project.status !== "active") {
    return { checkType: "payment_gap", result: "pass", notes: "Project not active — payment gap check skipped" };
  }

  if (payments.length === 0) {
    // No payments at all — check if project has been active for a while
    const projectAge = daysSince(new Date(project.createdAt));
    if (projectAge > PAYMENT_GAP_CRITICAL_DAYS) {
      return {
        checkType: "payment_gap",
        result: "fail",
        value: projectAge,
        severity: "critical",
        notes: `Active project with no payments recorded (${projectAge} days since creation)`,
      };
    }
    if (projectAge > PAYMENT_GAP_WARN_DAYS) {
      return {
        checkType: "payment_gap",
        result: "warn",
        value: projectAge,
        severity: "warning",
        notes: `Active project with no payments in ${projectAge} days`,
      };
    }
    return { checkType: "payment_gap", result: "pass", notes: "No payments yet — project is new" };
  }

  const lastPayment = payments.sort(
    (a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()
  )[0];
  const gapDays = daysSince(new Date(lastPayment.paidAt));

  if (gapDays > PAYMENT_GAP_CRITICAL_DAYS) {
    return {
      checkType: "payment_gap",
      result: "fail",
      value: gapDays,
      severity: "critical",
      notes: `No payment received in ${gapDays} days on active project`,
    };
  }
  if (gapDays > PAYMENT_GAP_WARN_DAYS) {
    return {
      checkType: "payment_gap",
      result: "warn",
      value: gapDays,
      severity: "warning",
      notes: `Payment gap: ${gapDays} days since last payment`,
    };
  }
  return {
    checkType: "payment_gap",
    result: "pass",
    notes: `Last payment ${gapDays} days ago`,
  };
}

// ─── Check 5: Deposit Status ──────────────────────────────────────────────────

function checkDepositStatus(project: any, projectInvoices: any[]): FinancialCheck {
  if (!["planning", "active"].includes(project.status)) {
    return { checkType: "deposit_missing", result: "pass", notes: "Project not in planning/active — deposit check skipped" };
  }

  // Check if Square deposit is paid
  if (project.squareDepositStatus === "paid") {
    return { checkType: "deposit_missing", result: "pass", notes: "Square deposit collected" };
  }

  // Check if any deposit invoice is paid
  const depositInvoice = projectInvoices.find(
    (inv) => inv.invoiceType === "deposit" && inv.status === "paid"
  );
  if (depositInvoice) {
    return { checkType: "deposit_missing", result: "pass", notes: "Deposit invoice paid" };
  }

  // Check if deposit invoice exists but is unpaid
  const pendingDeposit = projectInvoices.find(
    (inv) => inv.invoiceType === "deposit" && ["draft", "sent"].includes(inv.status)
  );
  if (pendingDeposit) {
    return {
      checkType: "deposit_missing",
      result: "warn",
      severity: "warning",
      notes: `Deposit invoice ${pendingDeposit.status} but not yet paid`,
    };
  }

  // Project is active with no deposit at all
  if (project.status === "active") {
    return {
      checkType: "deposit_missing",
      result: "fail",
      severity: "critical",
      notes: "Active project with no deposit collected or invoiced",
    };
  }

  return {
    checkType: "deposit_missing",
    result: "warn",
    severity: "info",
    notes: "No deposit invoice created yet",
  };
}

// ─── Per-Project Orchestrator ─────────────────────────────────────────────────

async function runChecksForProject(project: any): Promise<ProjectFinancialResult> {
  const db = await getDb();
  if (!db) throw new Error("No DB");

  const [projectInvoices, projectMilestones, payments] = await Promise.all([
    db.select().from(invoices).where(eq(invoices.projectId, project.id)),
    db.select().from(milestones).where(eq(milestones.projectId, project.id)),
    db.select().from(invoicePayments).where(eq(invoicePayments.projectId, project.id)),
  ]);

  // Run all 5 checks
  const budgetCheck = checkBudgetOverrun(project);
  const { check: overdueCheck, overdueAmount, overdueCount } = checkOverdueInvoices(projectInvoices);
  const { check: unbilledCheck, unbilledCount } = checkUnbilledMilestones(projectMilestones, projectInvoices);
  const paymentGapCheck = checkPaymentGap(project, payments);
  const depositCheck = checkDepositStatus(project, projectInvoices);

  const checks: FinancialCheck[] = [budgetCheck, overdueCheck, unbilledCheck, paymentGapCheck, depositCheck];

  // Compute totals
  const totalInvoiced = projectInvoices
    .filter((inv) => inv.status !== "cancelled")
    .reduce((sum, inv) => sum + parseFloat(inv.amount ?? "0"), 0);
  const totalCollected = payments.reduce((sum, p) => sum + parseFloat(p.amount ?? "0"), 0);
  const depositCollected =
    project.squareDepositStatus === "paid" ||
    projectInvoices.some((inv) => inv.invoiceType === "deposit" && inv.status === "paid");
  const overrunPct =
    budgetCheck.value !== undefined && parseFloat(project.budgetEstimated ?? "0") > 0
      ? budgetCheck.value
      : null;

  // Determine overall financial health
  const hasCritical = checks.some((c) => c.result === "fail" && c.severity === "critical");
  const hasFail = checks.some((c) => c.result === "fail");
  const hasWarn = checks.some((c) => c.result === "warn");
  let financialHealth: ProjectFinancialResult["financialHealth"] = "healthy";
  if (hasCritical) financialHealth = "critical";
  else if (hasFail) financialHealth = "warning";
  else if (hasWarn) financialHealth = "watch";

  // Persist snapshot
  await db.insert(financialSnapshots).values({
    projectId: project.id,
    budgetEstimated: project.budgetEstimated,
    budgetActual: project.budgetActual,
    totalInvoiced: String(totalInvoiced),
    totalCollected: String(totalCollected),
    totalOverdue: String(overdueAmount),
    overdueInvoiceCount: overdueCount,
    unbilledMilestoneCount: unbilledCount,
    depositCollected,
    overrunPercent: overrunPct !== null ? String(overrunPct.toFixed(2)) : undefined,
    financialHealth,
    notes: checks.filter((c) => c.result !== "pass").map((c) => c.notes).join("; ") || undefined,
  });

  let newAlerts = 0;
  let newApprovals = 0;

  // ── Create alerts and approval items ─────────────────────────────────────────
  for (const check of checks) {
    if (check.result === "pass") {
      await resolveAlertsForEntity(`financial.${check.checkType}`, "project", project.id);
      continue;
    }

    const alertType = `financial.${check.checkType}.${check.result}`;
    const severity = check.severity ?? (check.result === "fail" ? "warning" : "info");
    const alreadyAlerted = await activeAlertExists(alertType, "project", project.id);

    if (!alreadyAlerted) {
      await createAlert({
        agentName: AGENT_NAME,
        alertType,
        entityType: "project",
        entityId: project.id,
        title: `${project.name}: ${check.notes}`,
        body: `Financial review flagged an issue on project "${project.name}". ${check.notes}`,
        severity: severity as "info" | "warning" | "critical",
        actionUrl: `/projects/${project.id}`,
      });
      newAlerts++;

      await emitEvent(
        check.checkType === "budget_overrun" ? EVENTS.FINANCIAL_BUDGET_OVERRUN
          : check.checkType === "overdue_invoice" ? EVENTS.FINANCIAL_INVOICE_OVERDUE
          : check.checkType === "unbilled_milestone" ? EVENTS.FINANCIAL_MILESTONE_UNBILLED
          : check.checkType === "payment_gap" ? EVENTS.FINANCIAL_PAYMENT_GAP
          : EVENTS.FINANCIAL_DEPOSIT_MISSING,
        "project",
        project.id,
        { checkType: check.checkType, result: check.result, notes: check.notes, severity }
      );
    }

    // Approval queue for critical issues
    if (severity === "critical") {
      const actionType = `financial.review.${check.checkType}`;
      const alreadyPending = await pendingApprovalExists("project", project.id, actionType);
      if (!alreadyPending) {
        await createApprovalItem({
          agentName: AGENT_NAME,
          actionType,
          entityType: "project",
          entityId: project.id,
          title: `CRITICAL: ${project.name} — ${check.notes}`,
          description: `The Financial Review Agent detected a critical financial issue on project "${project.name}". ${check.notes}. Please review and take action.`,
          severity: "critical",
          payload: {
            projectId: project.id,
            checkType: check.checkType,
            result: check.result,
            notes: check.notes,
          },
        });
        newApprovals++;
      }
    }
  }

  return {
    projectId: project.id,
    projectName: project.name,
    checks,
    financialHealth,
    totalInvoiced,
    totalCollected,
    totalOverdue: overdueAmount,
    overdueInvoiceCount: overdueCount,
    unbilledMilestoneCount: unbilledCount,
    depositCollected,
    overrunPercent: overrunPct,
    newAlerts,
    newApprovals,
  };
}

// ─── Main Agent Entry Point ───────────────────────────────────────────────────

export async function runFinancialReviewAgent(
  runType: "scheduled" | "triggered" | "manual" = "scheduled",
  targetProjectId?: number
): Promise<void> {
  await runAgent(AGENT_NAME, runType, targetProjectId ? "project" : null, targetProjectId ?? null, async (_logId) => {
    const db = await getDb();
    if (!db) return { summary: "No database connection", status: "failed" };

    const activeProjects = targetProjectId
      ? await db.select().from(projects).where(eq(projects.id, targetProjectId))
      : await db.select().from(projects).where(
          inArray(projects.status, ["planning", "active"])
        );

    if (activeProjects.length === 0) {
      return { summary: "No active projects to review", status: "completed" };
    }

    const results: ProjectFinancialResult[] = [];
    let totalAlerts = 0;
    let totalApprovals = 0;

    for (const project of activeProjects) {
      try {
        const result = await runChecksForProject(project);
        results.push(result);
        totalAlerts += result.newAlerts;
        totalApprovals += result.newApprovals;
      } catch (err) {
        console.error(`[FinancialReviewAgent] Error reviewing project ${project.id}:`, err);
      }
    }

    // Update last scan timestamp
    await memSet(agentKey(AGENT_NAME, "lastFullScanAt"), new Date().toISOString());

    // Notify owner if critical issues found
    if (totalApprovals > 0) {
      const criticalProjects = results
        .filter((r) => r.newApprovals > 0)
        .map((r) => r.projectName)
        .join(", ");
      await notifyOwner({
        title: `Financial Alert: ${totalApprovals} Critical Issue${totalApprovals === 1 ? "" : "s"} Require Review`,
        content: `The Financial Review Agent found critical financial issues requiring your attention.\n\nAffected projects: ${criticalProjects}\n\nPlease review the Approval Queue in the CRM.`,
      });
    }

    const healthy = results.filter((r) => r.financialHealth === "healthy").length;
    const issues = results.length - healthy;

    return {
      summary: `Reviewed ${results.length} project${results.length === 1 ? "" : "s"}. ${healthy} healthy, ${issues} with financial issues. ${totalAlerts} new alert${totalAlerts === 1 ? "" : "s"}, ${totalApprovals} new approval item${totalApprovals === 1 ? "" : "s"}.`,
      details: {
        totalReviewed: results.length,
        healthy,
        issues,
        results: results.map((r) => ({
          projectId: r.projectId,
          projectName: r.projectName,
          financialHealth: r.financialHealth,
          totalInvoiced: r.totalInvoiced,
          totalCollected: r.totalCollected,
          totalOverdue: r.totalOverdue,
          overrunPercent: r.overrunPercent,
          checks: r.checks.map((c) => ({ type: c.checkType, result: c.result, notes: c.notes })),
        })),
      },
      alertsCreated: totalAlerts,
      approvalsCreated: totalApprovals,
      eventsEmitted: totalAlerts,
      status: "completed",
    };
  });
}
