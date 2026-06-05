/**
 * Approval Queue Service
 * Creates and resolves human-approval items.
 * Any agent action requiring owner sign-off goes through this service.
 */
import { getDb } from "../db";
import { approvalQueue } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { emitEvent, EVENTS } from "./eventBus";

export interface CreateApprovalOpts {
  agentName: string;
  actionType: string;
  /** DB column: entityType — use this OR relatedEntityType (aliases) */
  entityType?: string;
  entityId?: number;
  /** Alias for entityType — accepted for backward compat */
  relatedEntityType?: string;
  /** Alias for entityId — accepted for backward compat */
  relatedEntityId?: number;
  /** Optional project context stored in payload */
  projectId?: number;
  title: string;
  description?: string;
  /**
   * Severity levels. "low" maps to "info", "medium" maps to "warning",
   * "high" maps to "critical" — the DB enum only has info/warning/critical.
   */
  severity?: "info" | "warning" | "critical" | "low" | "medium" | "high";
  payload?: Record<string, unknown>;
  /**
   * Extra JSON metadata string (communication drafts, contact info, etc.)
   * Merged into payload automatically.
   */
  metadata?: string;
  expiresAt?: Date;
}

/** Normalize extended severity values to the DB enum */
function normalizeSeverity(s: CreateApprovalOpts["severity"]): "info" | "warning" | "critical" {
  if (s === "low") return "info";
  if (s === "medium") return "warning";
  if (s === "high") return "critical";
  return (s as "info" | "warning" | "critical") ?? "warning";
}

/** Create a new approval queue item. Returns the new item id, or null on error. */
export async function createApprovalItem(opts: CreateApprovalOpts): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  // Resolve entity fields — support both naming conventions
  const entityType = opts.entityType ?? opts.relatedEntityType;
  const entityId = opts.entityId ?? opts.relatedEntityId;

  // Merge metadata string into payload object
  let payload = opts.payload ?? {};
  if (opts.metadata) {
    try {
      const parsed = JSON.parse(opts.metadata);
      payload = { ...payload, ...parsed };
    } catch {
      payload = { ...payload, _metadata: opts.metadata };
    }
  }
  if (opts.projectId) {
    payload = { ...payload, projectId: opts.projectId };
  }

  const severity = normalizeSeverity(opts.severity);

  try {
    const result = await db.insert(approvalQueue).values({
      agentName: opts.agentName,
      actionType: opts.actionType,
      entityType: entityType,
      entityId: entityId,
      title: opts.title,
      description: opts.description,
      severity,
      status: "pending",
      payload: Object.keys(payload).length > 0 ? JSON.stringify(payload) : undefined,
      expiresAt: opts.expiresAt,
    });
    const newId = (result as any).insertId ?? null;

    // Emit event so other agents can react
    await emitEvent(EVENTS.APPROVAL_ITEM_CREATED, "approval_queue", newId ?? 0, {
      agentName: opts.agentName,
      actionType: opts.actionType,
      severity,
    });

    return newId;
  } catch (err) {
    console.error("[ApprovalQueue] createApprovalItem failed:", err);
    return null;
  }
}

/** Approve an item */
export async function resolveApprovalItem(
  id: number,
  resolvedBy: number,
  note?: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(approvalQueue)
    .set({ status: "approved", resolvedBy, resolvedAt: new Date(), resolutionNote: note })
    .where(eq(approvalQueue.id, id));
  await emitEvent(EVENTS.APPROVAL_ITEM_RESOLVED, "approval_queue", id, { resolution: "approved" });
}

/** Reject an item */
export async function rejectApprovalItem(
  id: number,
  resolvedBy: number,
  note?: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(approvalQueue)
    .set({ status: "rejected", resolvedBy, resolvedAt: new Date(), resolutionNote: note })
    .where(eq(approvalQueue.id, id));
  await emitEvent(EVENTS.APPROVAL_ITEM_RESOLVED, "approval_queue", id, { resolution: "rejected" });
}

/** Auto-resolve an item (condition cleared by agent) */
export async function autoResolveApprovalItem(id: number, note: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(approvalQueue)
    .set({ status: "auto_resolved", resolvedAt: new Date(), resolutionNote: note })
    .where(eq(approvalQueue.id, id));
}

/** Count pending items */
export async function countPendingApprovals(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select()
    .from(approvalQueue)
    .where(eq(approvalQueue.status, "pending"));
  return rows.length;
}

/** Check if a pending item already exists for a given entity + actionType (dedup guard) */
export async function pendingApprovalExists(
  entityType: string,
  entityId: number,
  actionType: string
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .select()
    .from(approvalQueue)
    .where(
      and(
        eq(approvalQueue.entityType, entityType),
        eq(approvalQueue.entityId, entityId),
        eq(approvalQueue.actionType, actionType),
        eq(approvalQueue.status, "pending")
      )
    )
    .limit(1);
  return rows.length > 0;
}
