/**
 * Arrival / No-Show Watch Agent
 *
 * Scans schedule events that are past their start time but still in
 * "scheduled" status (not confirmed, in_progress, completed, or cancelled).
 * Creates alerts + approval queue items for events that look like no-shows.
 *
 * Runs on a 2-hour cycle via the arrivalWatchScheduler.
 *
 * Rules:
 *   - Only checks events from the past 24 hours (avoids re-alerting old events)
 *   - Only checks crew_assignment and vendor_visit event types
 *   - Creates a warning alert if event is 1+ hours past start with no status update
 *   - Creates a critical alert if event is 4+ hours past start
 *   - Dedup via activeAlertExists to prevent duplicate alerts
 *   - Emits ARRIVAL_MISSED event for downstream agents
 */

import { getDb } from "../db";
import {
  scheduleEvents,
  crewMembers,
  subcontractors,
} from "../../drizzle/schema";
import { and, eq, lte, inArray, gte } from "drizzle-orm";
import { runAgent } from "./agentRunner";
import { createAlert, activeAlertExists } from "./alertService";
import { emitEvent, EVENTS } from "./eventBus";
import { agentKey, memSet } from "./sharedMemory";
import {
  ARRIVAL_LATE_HOURS,
  ARRIVAL_NOSHOW_HOURS,
} from "../../shared/operationalConfig";

const AGENT_NAME = "ArrivalWatchAgent";
const LATE_THRESHOLD_MS = ARRIVAL_LATE_HOURS * 60 * 60 * 1000;
const NOSHOW_THRESHOLD_MS = ARRIVAL_NOSHOW_HOURS * 60 * 60 * 1000;
const LOOKBACK_MS = 24 * 60 * 60 * 1000;           // Only check last 24 hours

/** Exported for tests */
export const THRESHOLDS = {
  LATE_THRESHOLD_MS,
  NOSHOW_THRESHOLD_MS,
  LOOKBACK_MS,
};

const WATCHABLE_EVENT_TYPES = ["crew_assignment", "vendor_visit"] as const;

interface ArrivalIssue {
  eventId: number;
  eventTitle: string;
  eventType: string;
  projectId: number | null;
  assigneeType: string | null;
  assigneeId: number | null;
  assigneeName: string;
  startTime: Date;
  hoursLate: number;
  severity: "warning" | "critical";
  alertCreated: boolean;
}

export async function runArrivalWatchAgent(
  runType: "scheduled" | "triggered" | "manual" = "scheduled"
): Promise<void> {
  await runAgent(AGENT_NAME, runType, null, null, async (_logId) => {
    const db = await getDb();
    if (!db) return { summary: "No database connection", status: "failed" };

    const now = new Date();
    const lookbackStart = new Date(now.getTime() - LOOKBACK_MS);
    const lateThreshold = new Date(now.getTime() - LATE_THRESHOLD_MS);

    // Find events that started before the late threshold and are still "scheduled"
    const overdueEvents = await db
      .select()
      .from(scheduleEvents)
      .where(
        and(
          inArray(scheduleEvents.eventType, [...WATCHABLE_EVENT_TYPES]),
          eq(scheduleEvents.status, "scheduled"),
          lte(scheduleEvents.startTime, lateThreshold),
          gte(scheduleEvents.startTime, lookbackStart)
        )
      );

    if (overdueEvents.length === 0) {
      return { summary: "No arrival issues detected", status: "completed" };
    }

    const issues: ArrivalIssue[] = [];

    for (const event of overdueEvents) {
      const hoursLate = (now.getTime() - event.startTime.getTime()) / (1000 * 60 * 60);
      const severity: "warning" | "critical" = hoursLate >= NOSHOW_THRESHOLD_MS / (1000 * 60 * 60) ? "critical" : "warning";

      // Resolve assignee name
      let assigneeName = "Unknown";
      if (event.assigneeType === "crew" && event.assigneeId) {
        const [crew] = await db.select().from(crewMembers).where(eq(crewMembers.id, event.assigneeId)).limit(1);
        if (crew) assigneeName = crew.name;
      } else if (event.assigneeType === "vendor" && event.assigneeId) {
        const [sub] = await db.select().from(subcontractors).where(eq(subcontractors.id, event.assigneeId)).limit(1);
        if (sub) assigneeName = sub.companyName;
      }

      // Dedup check
      const alertType = `arrival.${severity === "critical" ? "noshow" : "late"}.${event.id}`;
      const alreadyAlerted = await activeAlertExists(alertType, "schedule_event", event.id);

      let alertCreated = false;
      if (!alreadyAlerted) {
        await createAlert({
          agentName: AGENT_NAME,
          alertType,
          entityType: "schedule_event",
          entityId: event.id,
          title: severity === "critical"
            ? `NO-SHOW: ${assigneeName} — ${event.title}`
            : `LATE: ${assigneeName} — ${event.title} (${Math.round(hoursLate)}h overdue)`,
          body: `${event.eventType === "crew_assignment" ? "Crew" : "Vendor"} "${assigneeName}" was scheduled for "${event.title}" at ${event.startTime.toLocaleString()} but has not checked in. ${hoursLate >= 4 ? "This is now a potential no-show." : "Please confirm arrival status."}`,
          severity,
          actionUrl: event.projectId ? `/projects/${event.projectId}` : "/schedule",
        });
        alertCreated = true;

        // Emit event for downstream agents
        await emitEvent(
          severity === "critical" ? EVENTS.ARRIVAL_NOSHOW : EVENTS.ARRIVAL_LATE,
          "schedule_event",
          event.id,
          {
            assigneeType: event.assigneeType,
            assigneeId: event.assigneeId,
            assigneeName,
            hoursLate: Math.round(hoursLate * 10) / 10,
            projectId: event.projectId,
          }
        );
      }

      issues.push({
        eventId: event.id,
        eventTitle: event.title,
        eventType: event.eventType,
        projectId: event.projectId,
        assigneeType: event.assigneeType,
        assigneeId: event.assigneeId,
        assigneeName,
        startTime: event.startTime,
        hoursLate: Math.round(hoursLate * 10) / 10,
        severity,
        alertCreated,
      });
    }

    const newAlerts = issues.filter((i) => i.alertCreated).length;
    const critical = issues.filter((i) => i.severity === "critical").length;

    // Update last scan timestamp
    await memSet(agentKey(AGENT_NAME, "lastScanAt"), new Date().toISOString());

    return {
      summary: `Found ${issues.length} arrival issue${issues.length === 1 ? "" : "s"} (${critical} no-show${critical === 1 ? "" : "s"}). ${newAlerts} new alert${newAlerts === 1 ? "" : "s"} created.`,
      details: { issues },
      alertsCreated: newAlerts,
      status: "completed",
    };
  });
}
