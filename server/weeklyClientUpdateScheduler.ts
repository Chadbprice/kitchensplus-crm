/**
 * Weekly Client Update Scheduler
 * Runs every Monday at 8:00 AM to draft weekly project updates for approval.
 * Includes catch-up logic: if the server was down during the scheduled time,
 * it will run the agent on startup if the last run was > 6 days ago.
 */
import { runWeeklyClientUpdateAgent } from "./agents/weeklyClientUpdateAgent";
import { memGet, memSet, agentKey } from "./agents/sharedMemory";

let started = false;

const LAST_RUN_KEY = agentKey("WeeklyClientUpdateScheduler", "lastRun", "global");
const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;

export function startWeeklyClientUpdateScheduler(): void {
  if (started) return;
  started = true;

  function scheduleNext() {
    const now = new Date();
    const next = new Date(now);
    // Find next Monday at 08:00
    const daysUntilMonday = (1 - now.getDay() + 7) % 7 || 7;
    next.setDate(now.getDate() + daysUntilMonday);
    next.setHours(8, 0, 0, 0);
    const msUntilNext = next.getTime() - now.getTime();

    console.log(`[WeeklyClientUpdateScheduler] Next run: ${next.toISOString()} (in ${Math.round(msUntilNext / 3600000)}h)`);

    setTimeout(async () => {
      try {
        await runWeeklyClientUpdateAgent();
        await memSet(LAST_RUN_KEY, String(Date.now()));
      } catch (err) {
        console.error("[WeeklyClientUpdateScheduler] Error:", err);
      }
      scheduleNext();
    }, msUntilNext);
  }

  // Catch-up: if the last run was more than 6 days ago, run now (delayed 90s)
  setTimeout(async () => {
    try {
      const lastRun = await memGet(LAST_RUN_KEY);
      const lastRunTs = lastRun ? Number(lastRun) : 0;
      if (Date.now() - lastRunTs > SIX_DAYS_MS) {
        console.log("[WeeklyClientUpdateScheduler] Catch-up: last run was >6 days ago, running now...");
        await runWeeklyClientUpdateAgent();
        await memSet(LAST_RUN_KEY, String(Date.now()));
      }
    } catch (err) {
      console.error("[WeeklyClientUpdateScheduler] Catch-up error:", err);
    }
  }, 90_000);

  scheduleNext();
}
