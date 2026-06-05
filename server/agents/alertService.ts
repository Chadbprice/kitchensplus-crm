/**
 * Domain Alert Service
 * Persistent in-app alert feed. Alerts stay visible until dismissed or resolved.
 * Different from push notifications — these are queryable and stateful.
 */
import { getDb } from "../db";
import { domainAlerts } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

export interface CreateAlertOpts {
  agentName?: string;
  alertType: string;
  entityType: string;
  entityId: number;
  title: string;
  body?: string;
  severity?: "info" | "warning" | "critical";
  actionUrl?: string;
}

/** Create a new domain alert. Returns the new alert id, or null on error. */
export async function createAlert(opts: CreateAlertOpts): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const result = await db.insert(domainAlerts).values({
      agentName: opts.agentName,
      alertType: opts.alertType,
      entityType: opts.entityType,
      entityId: opts.entityId,
      title: opts.title,
      body: opts.body,
      severity: opts.severity ?? "warning",
      status: "active",
      actionUrl: opts.actionUrl,
    });
    return (result as any).insertId ?? null;
  } catch (err) {
    console.error("[AlertService] createAlert failed:", err);
    return null;
  }
}

/** Dismiss an alert (user action) */
export async function dismissAlert(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(domainAlerts)
    .set({ status: "dismissed", dismissedAt: new Date() })
    .where(eq(domainAlerts.id, id));
}

/** Resolve an alert (condition cleared) */
export async function resolveAlert(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(domainAlerts)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(eq(domainAlerts.id, id));
}

/** Get all active alerts, newest first */
export async function getActiveAlerts(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(domainAlerts)
    .where(eq(domainAlerts.status, "active"))
    .orderBy(desc(domainAlerts.createdAt))
    .limit(limit);
}

/** Count active alerts */
export async function countActiveAlerts(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select().from(domainAlerts).where(eq(domainAlerts.status, "active"));
  return rows.length;
}

/**
 * Dedup guard: check if an active alert of the same type already exists for this entity.
 * Call this before createAlert() to avoid flooding the alert feed on every scan.
 */
export async function activeAlertExists(
  alertType: string,
  entityType: string,
  entityId: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .select()
    .from(domainAlerts)
    .where(
      and(
        eq(domainAlerts.alertType, alertType),
        eq(domainAlerts.entityType, entityType),
        eq(domainAlerts.entityId, entityId),
        eq(domainAlerts.status, "active")
      )
    )
    .limit(1);
  return rows.length > 0;
}

/** Resolve all active alerts of a given type for an entity (condition cleared) */
export async function resolveAlertsForEntity(
  alertType: string,
  entityType: string,
  entityId: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(domainAlerts)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(
      and(
        eq(domainAlerts.alertType, alertType),
        eq(domainAlerts.entityType, entityType),
        eq(domainAlerts.entityId, entityId),
        eq(domainAlerts.status, "active")
      )
    );
}
