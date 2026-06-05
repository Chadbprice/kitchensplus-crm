/**
 * Agent Runner
 * Wraps every agent execution with run-log bookkeeping and error handling.
 * All agents MUST use runAgent() instead of calling their logic directly.
 */
import { getDb } from "../db";
import { agentRunLog } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";

export interface AgentResult {
  summary: string;
  details?: Record<string, unknown>;
  alertsCreated?: number;
  approvalsCreated?: number;
  eventsEmitted?: number;
  status?: "completed" | "partial" | "failed";
}

export async function runAgent(
  agentName: string,
  runType: "scheduled" | "triggered" | "manual",
  entityType: string | null,
  entityId: number | null,
  fn: (logId: number) => Promise<AgentResult>
): Promise<AgentResult> {
  const db = await getDb();
  const startedAt = Date.now();
  let logId: number | null = null;

  // Insert "running" log row
  if (db) {
    try {
      const result = await db.insert(agentRunLog).values({
        agentName,
        runType,
        status: "running",
        entityType: entityType ?? undefined,
        entityId: entityId ?? undefined,
        startedAt: new Date(startedAt),
      });
      logId = (result as any).insertId ?? null;
    } catch (err) {
      console.error(`[AgentRunner] Failed to create run log for ${agentName}:`, err);
    }
  }

  let outcome: AgentResult = {
    summary: "Agent did not complete",
    status: "failed",
  };

  try {
    outcome = await fn(logId ?? 0);
    outcome.status = outcome.status ?? "completed";
  } catch (err: any) {
    console.error(`[AgentRunner] ${agentName} threw an error:`, err);
    outcome = {
      summary: `Agent failed with error: ${err?.message ?? String(err)}`,
      status: "failed",
    };
    // Notify owner of unexpected failures
    try {
      await notifyOwner({
        title: `AI Agent Error: ${agentName}`,
        content: `The ${agentName} encountered an unexpected error: ${err?.message ?? String(err)}`,
      });
    } catch (_) {}
  }

  // Update log row with outcome
  if (db && logId) {
    try {
      await db
        .update(agentRunLog)
        .set({
          status: outcome.status ?? "completed",
          summary: outcome.summary,
          details: outcome.details ? JSON.stringify(outcome.details) : undefined,
          alertsCreated: outcome.alertsCreated ?? 0,
          approvalsCreated: outcome.approvalsCreated ?? 0,
          eventsEmitted: outcome.eventsEmitted ?? 0,
          durationMs: Date.now() - startedAt,
          completedAt: new Date(),
        })
        .where(eq(agentRunLog.id, logId));
    } catch (err) {
      console.error(`[AgentRunner] Failed to update run log for ${agentName}:`, err);
    }
  }

  console.log(
    `[AgentRunner] ${agentName} ${outcome.status} in ${Date.now() - startedAt}ms — ${outcome.summary}`
  );

  return outcome;
}

/**
 * Lightweight log helper used by agents that manage their own run lifecycle.
 * Returns the new log row ID (or 0 on failure).
 */
export async function logAgentRun(
  agentName: string,
  status: "started" | "completed" | "failed" | "running",
  details: Record<string, unknown>,
  existingId?: number
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  try {
    if (existingId && existingId > 0) {
      await db.update(agentRunLog).set({
        status: status === "started" ? "running" : status,
        details: JSON.stringify(details),
        completedAt: status !== "started" && status !== "running" ? new Date() : undefined,
      } as any).where(eq(agentRunLog.id, existingId));
      return existingId;
    } else {
      const result = await db.insert(agentRunLog).values({
        agentName,
        runType: "scheduled",
        status: status === "started" ? "running" : status,
        details: JSON.stringify(details),
        startedAt: new Date(),
      });
      return (result as any).insertId ?? 0;
    }
  } catch (err) {
    console.error(`[logAgentRun] Failed for ${agentName}:`, err);
    return 0;
  }
}
