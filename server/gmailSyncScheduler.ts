/**
 * gmailSyncScheduler.ts
 * Runs Gmail sync for both accounts every hour.
 * First run is delayed 60 seconds after server start to let the DB warm up.
 */

import { syncAllGmailAccounts } from "./gmailSync";

const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const INITIAL_DELAY_MS = 60 * 1000;       // 60 seconds after server start

async function runSync() {
  try {
    console.log("[GmailSyncScheduler] Starting scheduled Gmail sync...");
    const results = await syncAllGmailAccounts();
    const total = results.reduce((s, r) => s + r.newMessages, 0);
    console.log(`[GmailSyncScheduler] Sync complete. New messages: ${total}`);
    for (const r of results) {
      if (r.errors.length) {
        console.warn(`[GmailSyncScheduler] ${r.account} errors:`, r.errors.join("; "));
      }
    }
  } catch (err: any) {
    console.error("[GmailSyncScheduler] Sync failed:", err?.message ?? err);
  }
}

export function startGmailSyncScheduler() {
  console.log("[GmailSyncScheduler] Gmail sync scheduler started (runs every hour, first run in 60s)");
  // Initial run after server warms up
  setTimeout(() => {
    runSync();
    // Then repeat every hour
    setInterval(runSync, SYNC_INTERVAL_MS);
  }, INITIAL_DELAY_MS);
}
