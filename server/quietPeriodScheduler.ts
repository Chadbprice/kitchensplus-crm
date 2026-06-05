/**
 * Quiet-Period Proactive Update Scheduler
 * Runs once daily at 9:00 AM to check for communication gaps
 * and draft proactive client check-ins.
 */
import { runQuietPeriodUpdateAgent } from "./agents/quietPeriodUpdateAgent";

let _started = false;

export function startQuietPeriodScheduler(): void {
  if (_started) return;
  _started = true;

  function scheduleNext() {
    const now = new Date();
    const next = new Date(now);
    // Next run at 09:00 tomorrow (or today if before 09:00)
    next.setHours(9, 0, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    const msUntilNext = next.getTime() - now.getTime();

    console.log(`[QuietPeriodScheduler] Next run: ${next.toISOString()} (in ${Math.round(msUntilNext / 3600000)}h)`);

    setTimeout(async () => {
      try {
        await runQuietPeriodUpdateAgent();
      } catch (err) {
        console.error("[QuietPeriodScheduler] Error:", err);
      }
      scheduleNext();
    }, msUntilNext);
  }

  // Also run once on startup (delayed 2 minutes) to catch up
  setTimeout(async () => {
    try {
      console.log("[QuietPeriodScheduler] Running startup catch-up scan...");
      await runQuietPeriodUpdateAgent();
    } catch (err) {
      console.error("[QuietPeriodScheduler] Startup catch-up error:", err);
    }
  }, 2 * 60 * 1000);

  scheduleNext();
  console.log("[QuietPeriodScheduler] Quiet-period proactive update scheduler started");
}
