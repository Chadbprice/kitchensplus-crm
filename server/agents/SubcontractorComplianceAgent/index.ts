/**
 * Subcontractor Compliance AI System
 * Orchestrates 5 specialist checks for every active subcontractor.
 * Phase 1: 100% deterministic rules — no LLM calls.
 *
 * Checks:
 *   1. COI (Certificate of Insurance) — expiry + approval status
 *   2. Workers' Comp — expiry + approval status
 *   3. License — licenseNumber field populated
 *   4. W9 — w9 doc on file
 *   5. Contract — signed contract for any active project task
 */
import { getDb } from "../../db";
import {
  subcontractors,
  subcontractorDocs,
  subcontractorContracts,
  projectTasks,
  complianceChecks,
} from "../../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { runAgent, AgentResult } from "../agentRunner";
import { createAlert, activeAlertExists, resolveAlertsForEntity } from "../alertService";
import { createApprovalItem, pendingApprovalExists, autoResolveApprovalItem } from "../approvalQueue";
import { emitEvent, EVENTS } from "../eventBus";
import { agentKey, memSet, memGet } from "../sharedMemory";
import { notifyOwner } from "../../_core/notification";
import {
  COMPLIANCE_WARN_DAYS,
  COMPLIANCE_CRITICAL_DAYS,
} from "../../../shared/operationalConfig";

const AGENT_NAME = "SubcontractorComplianceAgent";
const WARN_DAYS = COMPLIANCE_WARN_DAYS;
const CRITICAL_DAYS = COMPLIANCE_CRITICAL_DAYS;

// ─── Types ────────────────────────────────────────────────────────────────────

interface CheckResult {
  checkType: "coi" | "workers_comp" | "license" | "w9" | "contract";
  result: "pass" | "warn" | "fail" | "missing";
  daysUntilExpiry?: number;
  docId?: number;
  notes: string;
}

interface SubResult {
  subId: number;
  subName: string;
  checks: CheckResult[];
  overallStatus: "compliant" | "expiring_soon" | "expired" | "missing" | "pending";
  newAlerts: number;
  newApprovals: number;
}

// ─── Individual Check Functions ───────────────────────────────────────────────

function daysUntil(date: Date): number {
  return Math.floor((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function checkDocExpiry(
  docs: any[],
  docType: "coi" | "workers_comp",
  checkType: "coi" | "workers_comp"
): CheckResult {
  const approved = docs.filter((d) => d.docType === docType && d.status === "approved");
  const pending = docs.filter((d) => d.docType === docType && d.status === "pending");

  if (approved.length === 0) {
    if (pending.length > 0) {
      return { checkType, result: "warn", notes: `${docType.toUpperCase()} pending review`, docId: pending[0].id };
    }
    return { checkType, result: "missing", notes: `No approved ${docType.toUpperCase()} on file` };
  }

  // Find the doc with the latest expiry
  const latest = approved.sort((a, b) => {
    if (!a.expiryDate) return 1;
    if (!b.expiryDate) return -1;
    return new Date(b.expiryDate).getTime() - new Date(a.expiryDate).getTime();
  })[0];

  if (!latest.expiryDate) {
    return { checkType, result: "pass", notes: `${docType.toUpperCase()} approved (no expiry date)`, docId: latest.id };
  }

  const days = daysUntil(new Date(latest.expiryDate));

  if (days < 0) {
    return {
      checkType, result: "fail",
      daysUntilExpiry: days,
      docId: latest.id,
      notes: `${docType.toUpperCase()} expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`,
    };
  }
  if (days <= WARN_DAYS) {
    return {
      checkType, result: "warn",
      daysUntilExpiry: days,
      docId: latest.id,
      notes: `${docType.toUpperCase()} expires in ${days} day${days === 1 ? "" : "s"}`,
    };
  }
  return {
    checkType, result: "pass",
    daysUntilExpiry: days,
    docId: latest.id,
    notes: `${docType.toUpperCase()} valid for ${days} days`,
  };
}

function checkLicense(sub: any): CheckResult {
  if (sub.licenseNumber && sub.licenseNumber.trim().length > 0) {
    return { checkType: "license", result: "pass", notes: `License on file: ${sub.licenseNumber}` };
  }
  return { checkType: "license", result: "missing", notes: "No license number on file" };
}

function checkW9(docs: any[]): CheckResult {
  const w9 = docs.filter((d) => d.docType === "w9");
  if (w9.length > 0) {
    const approved = w9.find((d) => d.status === "approved");
    if (approved) return { checkType: "w9", result: "pass", notes: "W-9 approved", docId: approved.id };
    return { checkType: "w9", result: "warn", notes: "W-9 on file but not yet approved", docId: w9[0].id };
  }
  return { checkType: "w9", result: "missing", notes: "No W-9 on file" };
}

function checkContract(contracts: any[], tasks: any[]): CheckResult {
  const activeTasks = tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");
  if (activeTasks.length === 0) {
    return { checkType: "contract", result: "pass", notes: "No active tasks — contract not required" };
  }
  const signed = contracts.find((c) => c.status === "signed");
  if (signed) {
    return { checkType: "contract", result: "pass", notes: "Signed contract on file", docId: signed.id };
  }
  const sent = contracts.find((c) => c.status === "sent");
  if (sent) {
    return { checkType: "contract", result: "warn", notes: "Contract sent but not yet signed", docId: sent.id };
  }
  return { checkType: "contract", result: "missing", notes: "No contract — sub has active tasks" };
}

// ─── Per-Sub Orchestrator ─────────────────────────────────────────────────────

async function runChecksForSub(sub: any): Promise<SubResult> {
  const db = await getDb();
  if (!db) throw new Error("No DB");

  const docs = await db.select().from(subcontractorDocs).where(eq(subcontractorDocs.subcontractorId, sub.id));
  const contracts = await db.select().from(subcontractorContracts).where(eq(subcontractorContracts.subcontractorId, sub.id));
  const tasks = await db.select().from(projectTasks).where(eq(projectTasks.assignedTo, String(sub.id)));

  const checks: CheckResult[] = [
    checkDocExpiry(docs, "coi", "coi"),
    checkDocExpiry(docs, "workers_comp", "workers_comp"),
    checkLicense(sub),
    checkW9(docs),
    checkContract(contracts, tasks),
  ];

  // Persist check results
  for (const check of checks) {
    await db.insert(complianceChecks).values({
      subcontractorId: sub.id,
      docId: check.docId,
      checkType: check.checkType,
      result: check.result,
      daysUntilExpiry: check.daysUntilExpiry,
      notes: check.notes,
    });
  }

  // Compute overall status
  const hasExpired = checks.some((c) => c.result === "fail");
  const hasMissing = checks.some((c) => c.result === "missing");
  const hasWarn = checks.some((c) => c.result === "warn");
  let overallStatus: SubResult["overallStatus"] = "compliant";
  if (hasExpired) overallStatus = "expired";
  else if (hasMissing) overallStatus = "missing";
  else if (hasWarn) overallStatus = "expiring_soon";

  // Update subcontractor compliance status
  await db
    .update(subcontractors)
    .set({ complianceStatus: overallStatus === "compliant" ? "compliant" : overallStatus, lastComplianceCheckAt: new Date() })
    .where(eq(subcontractors.id, sub.id));

  let newAlerts = 0;
  let newApprovals = 0;
  const activeTasks = tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");
  const hasActiveTasks = activeTasks.length > 0;

  // ── Create alerts for failing checks ──────────────────────────────────────
  for (const check of checks) {
    if (check.result === "pass") {
      // Resolve any existing alert for this check type
      await resolveAlertsForEntity(
        `compliance.${check.checkType}.issue`,
        "subcontractor",
        sub.id
      );
      continue;
    }

    const alertType = `compliance.${check.checkType}.${check.result}`;
    const severity: "info" | "warning" | "critical" =
      check.result === "fail" && hasActiveTasks ? "critical"
      : check.result === "fail" ? "warning"
      : check.result === "missing" && hasActiveTasks ? "warning"
      : "info";

    const alreadyAlerted = await activeAlertExists(alertType, "subcontractor", sub.id);
    if (!alreadyAlerted) {
      await createAlert({
        agentName: AGENT_NAME,
        alertType,
        entityType: "subcontractor",
        entityId: sub.id,
        title: `${sub.companyName || sub.name}: ${check.notes}`,
        body: `Subcontractor compliance issue detected. Check: ${check.checkType.toUpperCase()}. ${check.notes}`,
        severity,
        actionUrl: `/subcontractors/${sub.id}`,
      });
      newAlerts++;

      // Emit domain event
      await emitEvent(EVENTS.COMPLIANCE_CHECK_FAILED, "subcontractor", sub.id, {
        checkType: check.checkType,
        result: check.result,
        notes: check.notes,
        severity,
      });
    }

    // ── Create approval queue item for critical issues ─────────────────────
    if (severity === "critical") {
      const actionType = `block_task_assignment.${check.checkType}`;
      const alreadyPending = await pendingApprovalExists("subcontractor", sub.id, actionType);
      if (!alreadyPending) {
        await createApprovalItem({
          agentName: AGENT_NAME,
          actionType,
          entityType: "subcontractor",
          entityId: sub.id,
          title: `CRITICAL: ${sub.companyName || sub.name} — ${check.notes}`,
          description: `This subcontractor has active project tasks but their ${check.checkType.toUpperCase()} is ${check.result}. Review and decide whether to proceed or pause task assignments.`,
          severity: "critical",
          payload: {
            subcontractorId: sub.id,
            checkType: check.checkType,
            result: check.result,
            activeTaskCount: activeTasks.length,
            notes: check.notes,
          },
        });
        newApprovals++;
      }
    }
  }

  return { subId: sub.id, subName: sub.companyName || sub.name, checks, overallStatus, newAlerts, newApprovals };
}

// ─── Main Agent Entry Point ───────────────────────────────────────────────────

export async function runSubcontractorComplianceAgent(
  runType: "scheduled" | "triggered" | "manual" = "scheduled",
  targetSubId?: number
): Promise<void> {
  await runAgent(AGENT_NAME, runType, targetSubId ? "subcontractor" : null, targetSubId ?? null, async (_logId) => {
    const db = await getDb();
    if (!db) return { summary: "No database connection", status: "failed" };

    const query = db.select().from(subcontractors);
    const allSubs = targetSubId
      ? await db.select().from(subcontractors).where(eq(subcontractors.id, targetSubId))
      : await db.select().from(subcontractors).where(eq(subcontractors.isActive, true));

    if (allSubs.length === 0) {
      return { summary: "No active subcontractors to check", status: "completed" };
    }

    const results: SubResult[] = [];
    let totalAlerts = 0;
    let totalApprovals = 0;

    for (const sub of allSubs) {
      try {
        const result = await runChecksForSub(sub);
        results.push(result);
        totalAlerts += result.newAlerts;
        totalApprovals += result.newApprovals;
      } catch (err) {
        console.error(`[ComplianceAgent] Error checking sub ${sub.id}:`, err);
      }
    }

    // Update last scan timestamp in shared memory
    await memSet(agentKey(AGENT_NAME, "lastFullScanAt"), new Date().toISOString());

    // Notify owner if any new critical approvals were created
    if (totalApprovals > 0) {
      const criticalSubs = results
        .filter((r) => r.newApprovals > 0)
        .map((r) => r.subName)
        .join(", ");
      await notifyOwner({
        title: `Compliance Alert: ${totalApprovals} Critical Issue${totalApprovals === 1 ? "" : "s"} Require Approval`,
        content: `The Subcontractor Compliance Agent found critical compliance issues requiring your review.\n\nAffected subcontractors: ${criticalSubs}\n\nPlease review the Approval Queue in the CRM.`,
      });
    }

    const compliant = results.filter((r) => r.overallStatus === "compliant").length;
    const issues = results.length - compliant;

    return {
      summary: `Checked ${results.length} subcontractor${results.length === 1 ? "" : "s"}. ${compliant} compliant, ${issues} with issues. ${totalAlerts} new alert${totalAlerts === 1 ? "" : "s"}, ${totalApprovals} new approval item${totalApprovals === 1 ? "" : "s"}.`,
      details: {
        totalChecked: results.length,
        compliant,
        issues,
        results: results.map((r) => ({
          subId: r.subId,
          subName: r.subName,
          overallStatus: r.overallStatus,
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
