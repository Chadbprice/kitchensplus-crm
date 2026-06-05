/**
 * Arrival Watch Scheduler
 * Runs the ArrivalWatchAgent every 2 hours to detect late arrivals and no-shows.
 */
import { runArrivalWatchAgent } from "./agents/arrivalWatchAgent";
import { ARRIVAL_WATCH_INTERVAL_MS } from "../shared/operationalConfig";

let _started = false;

export function startArrivalWatchScheduler(): void {
  if (_started) return;
  _started = true;

  // Run once at startup (offset by 4 minutes to avoid startup congestion)
  setTimeout(() => {
    runArrivalWatchAgent("scheduled").catch((err) => {
      console.error("[ArrivalWatchScheduler] Startup scan failed:", err);
    });
  }, 4 * 60 * 1000);

  // Then run every 2 hours
  setInterval(() => {
    runArrivalWatchAgent("scheduled").catch((err) => {
      console.error("[ArrivalWatchScheduler] Scheduled scan failed:", err);
    });
  }, ARRIVAL_WATCH_INTERVAL_MS);

  console.log(`[ArrivalWatchScheduler] Scheduler started — runs every ${ARRIVAL_WATCH_INTERVAL_MS / 60000} minutes.`);
}
