/**
 * PO Delivery Follow-Up Agent
 *
 * Scans purchase orders that are past their expectedDelivery date but have
 * not been marked as "delivered" (or later statuses). Generates approval-routed
 * follow-up drafts to the vendor.
 *
 * Runs daily via the poDeliveryFollowUpScheduler.
 *
 * Rules:
 *   - Only checks POs in statuses: sent, acknowledged (active, awaiting delivery)
 *   - Only checks POs with an expectedDelivery date that has passed
 *   - Dedup via pendingApprovalExists + 3-day sharedMemory cooldown per PO
 *   - Generates LLM-enriched follow-up draft with deterministic fallback
 *   - Routes to approval queue (owner must approve before sending)
 *   - Creates alert for POs overdue by 7+ days
 */

import { getDb } from "../db";
import {
  purchaseOrders,
  vendors,
  projects,
} from "../../drizzle/schema";
import { and, eq, lte, inArray } from "drizzle-orm";
import { runAgent } from "./agentRunner";
import { createApprovalItem, pendingApprovalExists } from "./approvalQueue";
import { createAlert, activeAlertExists } from "./alertService";
import { agentKey, memGet, memSet } from "./sharedMemory";
import { invokeLLM } from "../_core/llm";
import {
  PO_FOLLOWUP_COOLDOWN_DAYS,
  PO_CRITICAL_OVERDUE_DAYS,
} from "../../shared/operationalConfig";

const AGENT_NAME = "PODeliveryFollowUpAgent";
const COOLDOWN_MS = PO_FOLLOWUP_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
const CRITICAL_OVERDUE_DAYS = PO_CRITICAL_OVERDUE_DAYS;

/** Exported for tests */
export const CONFIG = {
  COOLDOWN_MS,
  CRITICAL_OVERDUE_DAYS,
};

// PO statuses that indicate the order is active and awaiting delivery
const AWAITING_DELIVERY_STATUSES = ["sent", "acknowledged"];

interface OverduePO {
  poId: number;
  poNumber: string | null;
  title: string | null;
  vendorId: number | null;
  vendorName: string;
  projectId: number;
  projectName: string;
  expectedDelivery: Date;
  daysOverdue: number;
  draftCreated: boolean;
  alertCreated: boolean;
}

export async function runPODeliveryFollowUpAgent(
  runType: "scheduled" | "triggered" | "manual" = "scheduled"
): Promise<void> {
  await runAgent(AGENT_NAME, runType, null, null, async (_logId) => {
    const db = await getDb();
    if (!db) return { summary: "No database connection", status: "failed" };

    const now = new Date();

    // Find POs past expected delivery that are still in active statuses
    const overduePOs = await db
      .select()
      .from(purchaseOrders)
      .where(
        and(
          inArray(purchaseOrders.status, AWAITING_DELIVERY_STATUSES),
          lte(purchaseOrders.expectedDelivery, now)
        )
      );

    if (overduePOs.length === 0) {
      return { summary: "No overdue purchase orders", status: "completed" };
    }

    const results: OverduePO[] = [];
    let draftsCreated = 0;
    let alertsCreated = 0;

    for (const po of overduePOs) {
      const daysOverdue = Math.floor(
        (now.getTime() - new Date(po.expectedDelivery!).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Resolve vendor name
      let vendorName = "Vendor";
      if (po.vendorId) {
        const [vendor] = await db.select().from(vendors).where(eq(vendors.id, po.vendorId)).limit(1);
        if (vendor) vendorName = vendor.companyName;
      }

      // Resolve project name
      let projectName = "Project";
      const [project] = await db.select().from(projects).where(eq(projects.id, po.projectId)).limit(1);
      if (project) projectName = project.name ?? projectName;

      let draftCreated = false;
      let alertCreated = false;

      // ── Create follow-up draft (with dedup + cooldown) ──────────────────────
      const actionType = "po_delivery_followup";
      const alreadyPending = await pendingApprovalExists("purchase_order", po.id, actionType);

      if (!alreadyPending) {
        const cooldownKey = agentKey(AGENT_NAME, String(po.id));
        const lastRun = await memGet(cooldownKey);
        const cooldownActive = lastRun && Date.now() - Number(lastRun) < COOLDOWN_MS;

        if (!cooldownActive) {
          // Generate draft
          const { subject, draftMessage } = await generateFollowUpDraft(
            vendorName, po.poNumber ?? `PO-${po.id}`, po.title ?? "Materials Order",
            projectName, daysOverdue
          );

          await createApprovalItem({
            agentName: AGENT_NAME,
            actionType,
            entityType: "purchase_order",
            entityId: po.id,
            projectId: po.projectId,
            title: `📦 Follow up on overdue PO: ${po.poNumber ?? `PO-${po.id}`} — ${vendorName}`,
            description: `PO "${po.title ?? po.poNumber}" for project "${projectName}" is ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} past expected delivery.\n\n---\nDRAFT MESSAGE:\n${draftMessage}`,
            severity: daysOverdue >= CRITICAL_OVERDUE_DAYS ? "critical" : "warning",
            payload: {
              poId: po.id,
              poNumber: po.poNumber,
              vendorId: po.vendorId,
              vendorName,
              projectId: po.projectId,
              projectName,
              subject,
              draftMessage,
              daysOverdue,
              nextActionType: "po_delivery_followup",
              generatedBy: AGENT_NAME,
            },
          });

          await memSet(cooldownKey, String(Date.now()));
          draftCreated = true;
          draftsCreated++;
        }
      }

      // ── Create alert for severely overdue POs ───────────────────────────────
      if (daysOverdue >= CRITICAL_OVERDUE_DAYS) {
        const alertType = `po.delivery.overdue.${po.id}`;
        const alreadyAlerted = await activeAlertExists(alertType, "purchase_order", po.id);
        if (!alreadyAlerted) {
          await createAlert({
            agentName: AGENT_NAME,
            alertType,
            entityType: "purchase_order",
            entityId: po.id,
            title: `OVERDUE PO: ${po.poNumber ?? `PO-${po.id}`} — ${vendorName} (${daysOverdue}d late)`,
            body: `Purchase order "${po.title ?? po.poNumber}" for project "${projectName}" is ${daysOverdue} days past expected delivery. Vendor: ${vendorName}. This may impact project timeline.`,
            severity: "critical",
            actionUrl: `/purchase-orders`,
          });
          alertCreated = true;
          alertsCreated++;
        }
      }

      results.push({
        poId: po.id,
        poNumber: po.poNumber,
        title: po.title,
        vendorId: po.vendorId,
        vendorName,
        projectId: po.projectId,
        projectName,
        expectedDelivery: po.expectedDelivery!,
        daysOverdue,
        draftCreated,
        alertCreated,
      });
    }

    await memSet(agentKey(AGENT_NAME, "lastScanAt"), new Date().toISOString());

    return {
      summary: `Found ${results.length} overdue PO${results.length === 1 ? "" : "s"}. ${draftsCreated} follow-up draft${draftsCreated === 1 ? "" : "s"} created, ${alertsCreated} alert${alertsCreated === 1 ? "" : "s"} created.`,
      details: { overduePOs: results },
      draftsCreated,
      alertsCreated,
      status: "completed",
    };
  });
}

// ── Draft generation ──────────────────────────────────────────────────────────

async function generateFollowUpDraft(
  vendorName: string,
  poNumber: string,
  poTitle: string,
  projectName: string,
  daysOverdue: number,
): Promise<{ subject: string; draftMessage: string }> {
  const subject = `Delivery Status — ${poNumber} (${projectName})`;

  const fallback = `Hi ${vendorName} Team,\n\nWe're reaching out regarding purchase order ${poNumber} ("${poTitle}") for the ${projectName} project. The expected delivery date has passed by ${daysOverdue} day${daysOverdue === 1 ? "" : "s"}, and we'd like to get an updated status.\n\nCould you please confirm the current delivery timeline? We want to ensure our project schedule stays on track.\n\nThank you for your prompt attention to this.\n\nBest regards,\nKitchens Plus Upstate`;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You write professional vendor follow-up emails for a luxury renovation company (Kitchens Plus Upstate). Be firm but courteous. Keep it under 150 words.",
        },
        {
          role: "user",
          content: `Write a follow-up email to vendor "${vendorName}" about purchase order ${poNumber} ("${poTitle}") for the "${projectName}" project. It is ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} past the expected delivery date. Ask for an updated delivery timeline. Start with "Hi ${vendorName} Team," and sign off as "Kitchens Plus Upstate". Do NOT include a subject line.`,
        },
      ],
    });
    const text = response?.choices?.[0]?.message?.content?.trim() ?? "";
    if (text.length > 30) {
      return { subject, draftMessage: text };
    }
  } catch {
    // Fall through to deterministic draft
  }

  return { subject, draftMessage: fallback };
}
