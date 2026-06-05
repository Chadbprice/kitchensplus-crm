/**
 * Domain Event Bus
 * Persists domain events to the database for agent consumption.
 * Agents poll getUnprocessedEvents() and call markEventProcessed() when done.
 */
import { getDb } from "../db";
import { domainEvents } from "../../drizzle/schema";
import { eq, isNull, and } from "drizzle-orm";

export type DomainEventPayload = Record<string, unknown>;

// ─── Event Name Constants ─────────────────────────────────────────────────────
export const EVENTS = {
  // Subcontractor lifecycle
  SUBCONTRACTOR_CREATED:          "subcontractor.created",
  SUBCONTRACTOR_DOC_UPLOADED:     "subcontractor.doc.uploaded",
  SUBCONTRACTOR_DOC_APPROVED:     "subcontractor.doc.approved",
  SUBCONTRACTOR_DOC_EXPIRED:      "subcontractor.doc.expired",
  SUBCONTRACTOR_DOC_EXPIRING_SOON:"subcontractor.doc.expiring_soon",
  SUBCONTRACTOR_TASK_ASSIGNED:    "subcontractor.task.assigned",
  // Compliance
  COMPLIANCE_CHECK_FAILED:        "compliance.check.failed",
  // Approval queue
  APPROVAL_ITEM_CREATED:          "approval_queue.item.created",
  APPROVAL_ITEM_RESOLVED:         "approval_queue.item.resolved",
  // Financial Review
  FINANCIAL_BUDGET_OVERRUN:       "financial.budget.overrun",
  FINANCIAL_INVOICE_OVERDUE:      "financial.invoice.overdue",
  FINANCIAL_MILESTONE_UNBILLED:   "financial.milestone.unbilled",
  FINANCIAL_PAYMENT_GAP:          "financial.payment.gap",
  FINANCIAL_DEPOSIT_MISSING:      "financial.deposit.missing",
  // Project Risk
  PROJECT_RISK_SCORED:            "project.risk.scored",
  PROJECT_RISK_ESCALATED:         "project.risk.escalated",
  PROJECT_SCHEDULE_SLIPPAGE:      "project.schedule.slippage",
  PROJECT_COMMUNICATION_GAP:      "project.communication.gap",
  PROJECT_STALE_TASK:             "project.task.stale",
  PROJECT_MISSING_EVIDENCE:       "project.evidence.missing",
  // Milestone
  MILESTONE_STATUS_CHANGED:       "milestone.status.changed",
  // Change Order
  CHANGE_ORDER_APPROVED:          "change_order.approved",
  // Arrival Watch
  ARRIVAL_LATE:                   "arrival.late",
  ARRIVAL_NOSHOW:                 "arrival.noshow",
  // PO Delivery
  PO_DELIVERY_OVERDUE:            "po.delivery.overdue",
} as const;

export type EventName = typeof EVENTS[keyof typeof EVENTS];

// ─── Emit ─────────────────────────────────────────────────────────────────────
export async function emitEvent(
  eventName: EventName | string,
  entityType: string,
  entityId: number,
  payload: DomainEventPayload = {}
): Promise<number | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const result = await db.insert(domainEvents).values({
      eventName,
      entityType,
      entityId,
      payload: JSON.stringify(payload),
    });
    return (result as any).insertId ?? null;
  } catch (err) {
    console.error("[EventBus] emit failed:", err);
    return null;
  }
}

// ─── Get Unprocessed ──────────────────────────────────────────────────────────
export async function getUnprocessedEvents(eventName?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = eventName
    ? and(isNull(domainEvents.processedAt), eq(domainEvents.eventName, eventName))
    : isNull(domainEvents.processedAt);
  return db.select().from(domainEvents).where(conditions);
}

// ─── Mark Processed ───────────────────────────────────────────────────────────
export async function markEventProcessed(eventId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(domainEvents)
    .set({ processedAt: new Date() })
    .where(eq(domainEvents.id, eventId));
}
