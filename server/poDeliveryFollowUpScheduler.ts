/**
 * PO Delivery Follow-Up Scheduler
 * Runs the PODeliveryFollowUpAgent daily to detect overdue purchase orders.
 */
import { runPODeliveryFollowUpAgent } from "./agents/poDeliveryFollowUpAgent";
import { PO_FOLLOWUP_INTERVAL_MS } from "../shared/operationalConfig";

let _started = false;

export function startPODeliveryFollowUpScheduler(): void {
  if (_started) return;
  _started = true;

  // Run once at startup (offset by 5 minutes to avoid startup congestion)
  setTimeout(() => {
    runPODeliveryFollowUpAgent("scheduled").catch((err) => {
      console.error("[PODeliveryFollowUpScheduler] Startup scan failed:", err);
    });
  }, 5 * 60 * 1000);

  // Then run every 24 hours
  setInterval(() => {
    runPODeliveryFollowUpAgent("scheduled").catch((err) => {
      console.error("[PODeliveryFollowUpScheduler] Scheduled scan failed:", err);
    });
  }, PO_FOLLOWUP_INTERVAL_MS);

  console.log(`[PODeliveryFollowUpScheduler] Scheduler started — runs every ${PO_FOLLOWUP_INTERVAL_MS / 3600000}h.`);
}
