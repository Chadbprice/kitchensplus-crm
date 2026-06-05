/**
 * Project Risk Review AI System
 * Scores every active project across 6 risk dimensions.
 * Produces a composite risk score (0-100) and risk level badge.
 * Phase 1: 100% deterministic rules — no LLM calls.
 *
 * Risk Dimensions:
 *   1. ScheduleSlippage    — tasks overdue vs milestone dates
 *   2. CommunicationGap   — no messages/activity in N days
 *   3. StaleTask          — tasks in_progress with no recent updates
 *   4. MissingEvidence    — completed tasks with no photos/docs
 *   5. SubcontractorRisk  — non-compliant subs on active tasks
 *   6. BudgetRisk         — spend rate suggests overrun ahead
 */
import { getDb } from "../../db";
import {
  projects,
  projectTasks,
  milestones,
  messages,
  documents,
  subcontractors,
  projectRiskScores,
  taskAssignees,
} from "../../../drizzle/schema";
import { eq, and, inArray, gte, desc } from "drizzle-orm";
import { runAgent } from "../agentRunner";
import { createAlert, activeAlertExists, resolveAlertsForEntity } from "../alertService";
import { createApprovalItem, pendingApprovalExists } from "../approvalQueue";
import { emitEvent, EVENTS } from "../eventBus";
import { agentKey, memSet } from "../sharedMemory";
import { notifyOwner } from "../../_core/notification";
import {
  COMM_GAP_WARN_DAYS,
  COMM_GAP_CRITICAL_DAYS,
  STALE_TASK_WARN_DAYS,
  STALE_TASK_CRITICAL_DAYS,
  TASK_EVIDENCE_WINDOW_DAYS,
} from "../../../shared/operationalConfig";

const AGENT_NAME = "ProjectRiskAgent";

// Thresholds — imported from shared/operationalConfig.ts
const EVIDENCE_WINDOW_DAYS = TASK_EVIDENCE_WINDOW_DAYS;

// Risk score weights (must sum to 100)
const WEIGHTS = {
  schedule:       25,
  communication:  20,
  staleTask:      20,
  evidence:       10,
  subcontractor:  15,
  budget:         10,
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface DimensionScore {
  dimension: string;
  score: number;   // 0-100 (higher = more risk)
  notes: string;
  severity: "none" | "info" | "warning" | "critical";
}

interface ProjectRiskResult {
  projectId: number;
  projectName: string;
  dimensions: DimensionScore[];
  overallRiskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  topRiskFactor: string;
  newAlerts: number;
  newApprovals: number;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function daysSince(date: Date | string | null | undefined): number {
  if (!date) return 0;
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}

function daysUntil(date: Date | string | null | undefined): number {
  if (!date) return 9999;
  return Math.floor((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

// ─── Dimension 1: Schedule Slippage ──────────────────────────────────────────

function scoreScheduleSlippage(tasks: any[], projectMilestones: any[]): DimensionScore {
  const activeTasks = tasks.filter((t) => !["completed", "cancelled"].includes(t.status));
  const overdueTasks = activeTasks.filter((t) => t.dueDate && daysUntil(t.dueDate) < 0);
  const delayedMilestones = projectMilestones.filter(
    (m) => m.status !== "completed" && m.dueDate && daysUntil(m.dueDate) < 0
  );

  if (activeTasks.length === 0) {
    return { dimension: "schedule", score: 0, notes: "No active tasks", severity: "none" };
  }

  const overdueRatio = overdueTasks.length / activeTasks.length;
  const maxOverdueDays = overdueTasks.length > 0
    ? Math.max(...overdueTasks.map((t) => Math.abs(daysUntil(t.dueDate))))
    : 0;

  // Score: ratio of overdue tasks (0-60) + milestone delays (0-40)
  const taskScore = clamp(overdueRatio * 60);
  const milestoneScore = clamp(delayedMilestones.length * 20, 0, 40);
  const score = clamp(taskScore + milestoneScore);

  const severity: DimensionScore["severity"] =
    score >= 70 ? "critical" : score >= 40 ? "warning" : score >= 15 ? "info" : "none";

  const notes = overdueTasks.length > 0
    ? `${overdueTasks.length}/${activeTasks.length} tasks overdue (max ${maxOverdueDays} days late)${delayedMilestones.length > 0 ? `, ${delayedMilestones.length} milestone${delayedMilestones.length === 1 ? "" : "s"} delayed` : ""}`
    : delayedMilestones.length > 0
    ? `${delayedMilestones.length} milestone${delayedMilestones.length === 1 ? "" : "s"} delayed`
    : "Schedule on track";

  return { dimension: "schedule", score, notes, severity };
}

// ─── Dimension 2: Communication Gap ──────────────────────────────────────────

function scoreCommunicationGap(projectMessages: any[], project: any): DimensionScore {
  if (project.status !== "active") {
    return { dimension: "communication", score: 0, notes: "Project not active", severity: "none" };
  }

  if (projectMessages.length === 0) {
    const projectAge = daysSince(project.createdAt);
    if (projectAge > COMM_GAP_CRITICAL_DAYS) {
      return {
        dimension: "communication",
        score: 80,
        notes: `No messages ever recorded on active project (${projectAge} days old)`,
        severity: "critical",
      };
    }
    return { dimension: "communication", score: 20, notes: "No messages yet — project is new", severity: "info" };
  }

  const lastMessage = projectMessages.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];
  const gapDays = daysSince(lastMessage.createdAt);

  if (gapDays >= COMM_GAP_CRITICAL_DAYS) {
    return {
      dimension: "communication",
      score: clamp(50 + (gapDays - COMM_GAP_CRITICAL_DAYS) * 3),
      notes: `No project messages in ${gapDays} days`,
      severity: "critical",
    };
  }
  if (gapDays >= COMM_GAP_WARN_DAYS) {
    return {
      dimension: "communication",
      score: clamp(20 + (gapDays - COMM_GAP_WARN_DAYS) * 6),
      notes: `Communication gap: ${gapDays} days since last message`,
      severity: "warning",
    };
  }
  return {
    dimension: "communication",
    score: clamp(gapDays * 3),
    notes: `Last message ${gapDays} day${gapDays === 1 ? "" : "s"} ago`,
    severity: "none",
  };
}

// ─── Dimension 3: Stale Tasks ─────────────────────────────────────────────────

function scoreStaleTask(tasks: any[]): DimensionScore {
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress");

  if (inProgressTasks.length === 0) {
    return { dimension: "staleTask", score: 0, notes: "No in-progress tasks", severity: "none" };
  }

  const staleTasks = inProgressTasks.filter((t) => daysSince(t.updatedAt) >= STALE_TASK_WARN_DAYS);
  const criticalStaleTasks = inProgressTasks.filter((t) => daysSince(t.updatedAt) >= STALE_TASK_CRITICAL_DAYS);

  if (staleTasks.length === 0) {
    return {
      dimension: "staleTask",
      score: 0,
      notes: `${inProgressTasks.length} task${inProgressTasks.length === 1 ? "" : "s"} in progress — all recently updated`,
      severity: "none",
    };
  }

  const staleRatio = staleTasks.length / inProgressTasks.length;
  const maxStaleDays = Math.max(...staleTasks.map((t) => daysSince(t.updatedAt)));
  const score = clamp(staleRatio * 60 + (criticalStaleTasks.length > 0 ? 30 : 0));

  return {
    dimension: "staleTask",
    score,
    notes: `${staleTasks.length}/${inProgressTasks.length} in-progress tasks stale (oldest: ${maxStaleDays} days without update)`,
    severity: criticalStaleTasks.length > 0 ? "critical" : "warning",
  };
}

// ─── Dimension 4: Missing Evidence ───────────────────────────────────────────

function scoreMissingEvidence(tasks: any[], projectDocs: any[]): DimensionScore {
  const recentlyCompleted = tasks.filter(
    (t) => t.status === "completed" && t.completedAt && daysSince(t.completedAt) <= 14
  );

  if (recentlyCompleted.length === 0) {
    return { dimension: "evidence", score: 0, notes: "No recently completed tasks to check", severity: "none" };
  }

  // Tasks completed more than EVIDENCE_WINDOW_DAYS ago should have docs
  const tasksNeedingEvidence = recentlyCompleted.filter(
    (t) => daysSince(t.completedAt) > EVIDENCE_WINDOW_DAYS
  );

  if (tasksNeedingEvidence.length === 0) {
    return { dimension: "evidence", score: 0, notes: "Recently completed tasks within evidence window", severity: "none" };
  }

  // Check which tasks have associated docs (by task attachment or project docs uploaded after completion)
  const tasksWithEvidence = tasksNeedingEvidence.filter(
    (t) => t.attachmentUrl || projectDocs.some(
      (d) => d.docType === "photo" && new Date(d.createdAt) >= new Date(t.completedAt)
    )
  );

  const missingCount = tasksNeedingEvidence.length - tasksWithEvidence.length;
  if (missingCount === 0) {
    return {
      dimension: "evidence",
      score: 0,
      notes: "All completed tasks have evidence",
      severity: "none",
    };
  }

  const missingRatio = missingCount / tasksNeedingEvidence.length;
  const score = clamp(missingRatio * 70);

  return {
    dimension: "evidence",
    score,
    notes: `${missingCount}/${tasksNeedingEvidence.length} completed tasks missing photos/docs`,
    severity: score >= 50 ? "warning" : "info",
  };
}

// ─── Dimension 5: Subcontractor Risk ─────────────────────────────────────────

async function scoreSubcontractorRisk(tasks: any[]): Promise<DimensionScore> {
  const db = await getDb();
  if (!db) return { dimension: "subcontractor", score: 0, notes: "DB unavailable", severity: "none" };

  const activeTasks = tasks.filter((t) => !["completed", "cancelled"].includes(t.status));
  if (activeTasks.length === 0) {
    return { dimension: "subcontractor", score: 0, notes: "No active tasks", severity: "none" };
  }

  // Get all subcontractor IDs assigned to active tasks
  const subIds = activeTasks
    .map((t) => parseInt(t.assignedTo ?? "0"))
    .filter((id) => id > 0);

  if (subIds.length === 0) {
    return { dimension: "subcontractor", score: 0, notes: "No subcontractors on active tasks", severity: "none" };
  }

  const uniqueSubIds = [...new Set(subIds)];
  const assignedSubs = await db
    .select()
    .from(subcontractors)
    .where(inArray(subcontractors.id, uniqueSubIds));

  const nonCompliant = assignedSubs.filter(
    (s) => s.complianceStatus && !["compliant", "pending"].includes(s.complianceStatus)
  );

  if (nonCompliant.length === 0) {
    return {
      dimension: "subcontractor",
      score: 0,
      notes: `${assignedSubs.length} subcontractor${assignedSubs.length === 1 ? "" : "s"} on active tasks — all compliant`,
      severity: "none",
    };
  }

  const ratio = nonCompliant.length / assignedSubs.length;
  const score = clamp(ratio * 80);
  const names = nonCompliant.map((s) => s.companyName || s.name).join(", ");

  return {
    dimension: "subcontractor",
    score,
    notes: `${nonCompliant.length}/${assignedSubs.length} subs on active tasks have compliance issues (${names})`,
    severity: score >= 60 ? "critical" : "warning",
  };
}

// ─── Dimension 6: Budget Risk ─────────────────────────────────────────────────

function scoreBudgetRisk(project: any): DimensionScore {
  const estimated = parseFloat(project.budgetEstimated ?? "0");
  const actual = parseFloat(project.budgetActual ?? "0");

  if (estimated <= 0 || actual <= 0) {
    return { dimension: "budget", score: 0, notes: "Insufficient budget data for risk scoring", severity: "none" };
  }

  const spentRatio = actual / estimated;

  // If project is active and we've spent >80% of budget, flag it
  if (spentRatio >= 1.0) {
    return {
      dimension: "budget",
      score: clamp(50 + (spentRatio - 1.0) * 100),
      notes: `Over budget: spent $${actual.toLocaleString()} of $${estimated.toLocaleString()} (${(spentRatio * 100).toFixed(0)}%)`,
      severity: "critical",
    };
  }
  if (spentRatio >= 0.85) {
    return {
      dimension: "budget",
      score: clamp((spentRatio - 0.85) * 300),
      notes: `Budget risk: ${(spentRatio * 100).toFixed(0)}% spent — approaching limit`,
      severity: "warning",
    };
  }
  return {
    dimension: "budget",
    score: 0,
    notes: `Budget healthy: ${(spentRatio * 100).toFixed(0)}% spent`,
    severity: "none",
  };
}

// ─── Composite Scorer ─────────────────────────────────────────────────────────

function computeOverallScore(dimensions: DimensionScore[]): {
  overallRiskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  topRiskFactor: string;
} {
  const dimMap: Record<string, number> = {
    schedule:      WEIGHTS.schedule,
    communication: WEIGHTS.communication,
    staleTask:     WEIGHTS.staleTask,
    evidence:      WEIGHTS.evidence,
    subcontractor: WEIGHTS.subcontractor,
    budget:        WEIGHTS.budget,
  };

  const overallRiskScore = clamp(
    Math.round(
      dimensions.reduce((sum, d) => sum + (d.score * (dimMap[d.dimension] ?? 10)) / 100, 0)
    )
  );

  const riskLevel: "low" | "medium" | "high" | "critical" =
    overallRiskScore >= 70 ? "critical"
    : overallRiskScore >= 45 ? "high"
    : overallRiskScore >= 20 ? "medium"
    : "low";

  const topDim = dimensions.sort((a, b) => b.score - a.score)[0];
  const topRiskFactor = topDim?.score > 0 ? topDim.dimension : "none";

  return { overallRiskScore, riskLevel, topRiskFactor };
}

// ─── Per-Project Orchestrator ─────────────────────────────────────────────────

async function runRiskScoringForProject(project: any): Promise<ProjectRiskResult> {
  const db = await getDb();
  if (!db) throw new Error("No DB");

  const [tasks, projectMilestones, projectMessages, projectDocs] = await Promise.all([
    db.select().from(projectTasks).where(eq(projectTasks.projectId, project.id)),
    db.select().from(milestones).where(eq(milestones.projectId, project.id)),
    db.select().from(messages).where(eq(messages.projectId, project.id)),
    db.select().from(documents).where(eq(documents.projectId, project.id)),
  ]);

  // Score all 6 dimensions
  const scheduleDim    = scoreScheduleSlippage(tasks, projectMilestones);
  const commDim        = scoreCommunicationGap(projectMessages, project);
  const staleDim       = scoreStaleTask(tasks);
  const evidenceDim    = scoreMissingEvidence(tasks, projectDocs);
  const subDim         = await scoreSubcontractorRisk(tasks);
  const budgetDim      = scoreBudgetRisk(project);

  const dimensions: DimensionScore[] = [scheduleDim, commDim, staleDim, evidenceDim, subDim, budgetDim];
  const { overallRiskScore, riskLevel, topRiskFactor } = computeOverallScore([...dimensions]);

  // Persist risk score snapshot
  await db.insert(projectRiskScores).values({
    projectId: project.id,
    scheduleRisk:      scheduleDim.score,
    communicationRisk: commDim.score,
    staleTaskRisk:     staleDim.score,
    evidenceRisk:      evidenceDim.score,
    subcontractorRisk: subDim.score,
    budgetRisk:        budgetDim.score,
    overallRiskScore,
    riskLevel,
    topRiskFactor,
    notes: dimensions
      .filter((d) => d.severity !== "none")
      .map((d) => `${d.dimension}: ${d.notes}`)
      .join("; ") || undefined,
  });

  // Emit risk scored event
  await emitEvent(EVENTS.PROJECT_RISK_SCORED, "project", project.id, {
    overallRiskScore,
    riskLevel,
    topRiskFactor,
  });

  let newAlerts = 0;
  let newApprovals = 0;

  // ── Create alerts for significant risk dimensions ─────────────────────────
  for (const dim of dimensions) {
    if (dim.severity === "none") {
      await resolveAlertsForEntity(`risk.${dim.dimension}`, "project", project.id);
      continue;
    }

    const alertType = `risk.${dim.dimension}.${dim.severity}`;
    const alreadyAlerted = await activeAlertExists(alertType, "project", project.id);

    if (!alreadyAlerted) {
      await createAlert({
        agentName: AGENT_NAME,
        alertType,
        entityType: "project",
        entityId: project.id,
        title: `${project.name}: ${dim.dimension.replace(/([A-Z])/g, " $1").trim()} risk — ${dim.notes}`,
        body: `Project risk dimension "${dim.dimension}" flagged on "${project.name}". ${dim.notes}`,
        severity: dim.severity as "info" | "warning" | "critical",
        actionUrl: `/projects/${project.id}`,
      });
      newAlerts++;

      // Emit specific events for key dimensions
      if (dim.dimension === "schedule" && dim.severity !== "none") {
        await emitEvent(EVENTS.PROJECT_SCHEDULE_SLIPPAGE, "project", project.id, { score: dim.score, notes: dim.notes });
      } else if (dim.dimension === "communication" && dim.severity !== "none") {
        await emitEvent(EVENTS.PROJECT_COMMUNICATION_GAP, "project", project.id, { score: dim.score, notes: dim.notes });
      } else if (dim.dimension === "staleTask" && dim.severity !== "none") {
        await emitEvent(EVENTS.PROJECT_STALE_TASK, "project", project.id, { score: dim.score, notes: dim.notes });
      } else if (dim.dimension === "evidence" && dim.severity !== "none") {
        await emitEvent(EVENTS.PROJECT_MISSING_EVIDENCE, "project", project.id, { score: dim.score, notes: dim.notes });
      }
    }
  }

  // ── Approval queue for critical overall risk ──────────────────────────────
  if (riskLevel === "critical") {
    const actionType = "project.risk.critical_review";
    const alreadyPending = await pendingApprovalExists("project", project.id, actionType);
    if (!alreadyPending) {
      await createApprovalItem({
        agentName: AGENT_NAME,
        actionType,
        entityType: "project",
        entityId: project.id,
        title: `CRITICAL RISK: ${project.name} — Risk Score ${overallRiskScore}/100`,
        description: `Project "${project.name}" has reached a critical risk level (score: ${overallRiskScore}/100). Top risk factor: ${topRiskFactor}. Immediate review recommended.\n\n${dimensions.filter((d) => d.severity === "critical").map((d) => `• ${d.dimension}: ${d.notes}`).join("\n")}`,
        severity: "critical",
        payload: {
          projectId: project.id,
          overallRiskScore,
          riskLevel,
          topRiskFactor,
          dimensions: dimensions.map((d) => ({ dimension: d.dimension, score: d.score, notes: d.notes })),
        },
      });
      newApprovals++;

      await emitEvent(EVENTS.PROJECT_RISK_ESCALATED, "project", project.id, {
        overallRiskScore,
        riskLevel,
        topRiskFactor,
      });
    }
  }

  return {
    projectId: project.id,
    projectName: project.name,
    dimensions,
    overallRiskScore,
    riskLevel,
    topRiskFactor,
    newAlerts,
    newApprovals,
  };
}

// ─── Main Agent Entry Point ───────────────────────────────────────────────────

export async function runProjectRiskAgent(
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
      return { summary: "No active projects to score", status: "completed" };
    }

    const results: ProjectRiskResult[] = [];
    let totalAlerts = 0;
    let totalApprovals = 0;

    for (const project of activeProjects) {
      try {
        const result = await runRiskScoringForProject(project);
        results.push(result);
        totalAlerts += result.newAlerts;
        totalApprovals += result.newApprovals;
      } catch (err) {
        console.error(`[ProjectRiskAgent] Error scoring project ${project.id}:`, err);
      }
    }

    // Update last scan timestamp
    await memSet(agentKey(AGENT_NAME, "lastFullScanAt"), new Date().toISOString());

    // Notify owner if critical projects found
    if (totalApprovals > 0) {
      const criticalProjects = results
        .filter((r) => r.newApprovals > 0)
        .map((r) => `${r.projectName} (score: ${r.overallRiskScore}/100)`)
        .join(", ");
      await notifyOwner({
        title: `Project Risk Alert: ${totalApprovals} Critical Project${totalApprovals === 1 ? "" : "s"} Need Review`,
        content: `The Project Risk Agent has flagged critical risk levels requiring your attention.\n\nCritical projects: ${criticalProjects}\n\nPlease review the Approval Queue in the CRM.`,
      });
    }

    const low = results.filter((r) => r.riskLevel === "low").length;
    const medium = results.filter((r) => r.riskLevel === "medium").length;
    const high = results.filter((r) => r.riskLevel === "high").length;
    const critical = results.filter((r) => r.riskLevel === "critical").length;

    return {
      summary: `Scored ${results.length} project${results.length === 1 ? "" : "s"}. Low: ${low}, Medium: ${medium}, High: ${high}, Critical: ${critical}. ${totalAlerts} new alert${totalAlerts === 1 ? "" : "s"}, ${totalApprovals} new approval item${totalApprovals === 1 ? "" : "s"}.`,
      details: {
        totalScored: results.length,
        distribution: { low, medium, high, critical },
        results: results.map((r) => ({
          projectId: r.projectId,
          projectName: r.projectName,
          overallRiskScore: r.overallRiskScore,
          riskLevel: r.riskLevel,
          topRiskFactor: r.topRiskFactor,
          dimensions: r.dimensions.map((d) => ({ dimension: d.dimension, score: d.score, notes: d.notes })),
        })),
      },
      alertsCreated: totalAlerts,
      approvalsCreated: totalApprovals,
      eventsEmitted: totalAlerts + results.length,
      status: "completed",
    };
  });
}
