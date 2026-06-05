/**
 * Project Risk Scan Scheduler
 * Runs the ProjectRiskAgent every 24 hours.
 */
import { runProjectRiskAgent } from "./agents/ProjectRiskAgent";

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function startProjectRiskScheduler(): void {
  console.log("[ProjectRiskScan] Scheduler started — runs every 24 hours.");

  // Run once on startup (after a short delay to let DB warm up)
  setTimeout(async () => {
    try {
      await runProjectRiskAgent("scheduled");
    } catch (err) {
      console.error("[ProjectRiskScan] Initial scan failed:", err);
    }
  }, 20_000); // 20 second delay on startup (after financial review)

  // Then run every 24 hours
  setInterval(async () => {
    try {
      await runProjectRiskAgent("scheduled");
    } catch (err) {
      console.error("[ProjectRiskScan] Scheduled scan failed:", err);
    }
  }, INTERVAL_MS);
}
