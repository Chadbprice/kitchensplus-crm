/**
 * Financial Review Scan Scheduler
 * Runs the FinancialReviewAgent every 24 hours.
 */
import { runFinancialReviewAgent } from "./agents/FinancialReviewAgent";

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function startFinancialReviewScheduler(): void {
  console.log("[FinancialReviewScan] Scheduler started — runs every 24 hours.");

  // Run once on startup (after a short delay to let DB warm up)
  setTimeout(async () => {
    try {
      await runFinancialReviewAgent("scheduled");
    } catch (err) {
      console.error("[FinancialReviewScan] Initial scan failed:", err);
    }
  }, 15_000); // 15 second delay on startup

  // Then run every 24 hours
  setInterval(async () => {
    try {
      await runFinancialReviewAgent("scheduled");
    } catch (err) {
      console.error("[FinancialReviewScan] Scheduled scan failed:", err);
    }
  }, INTERVAL_MS);
}
