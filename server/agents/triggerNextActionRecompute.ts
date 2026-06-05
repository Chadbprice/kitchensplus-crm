/**
 * triggerNextActionRecompute — lightweight fire-and-forget helper.
 *
 * 1. Immediately marks the project's next action as stale (DB flag).
 * 2. Schedules a background recompute with a 30-second per-project cooldown
 *    to prevent rapid duplicate LLM calls when multiple mutations fire in
 *    quick succession (e.g. milestone update + payment in the same minute).
 *
 * Safe to call from any mutation — never throws, never blocks the caller.
 */

import { markNextActionStale, computeNextAction } from "./NextActionEngine";
import { NEXT_ACTION_RECOMPUTE_COOLDOWN_MS } from "../../shared/operationalConfig";

const COOLDOWN_MS = NEXT_ACTION_RECOMPUTE_COOLDOWN_MS;
const lastRecomputeMap = new Map<number, number>();

export async function triggerNextActionRecompute(projectId: number): Promise<void> {
  // Always mark stale immediately so the UI shows the correct freshness state
  try {
    await markNextActionStale(projectId);
  } catch (err) {
    console.error("[NextActionRecompute] Failed to mark stale:", err);
  }

  // Check cooldown — skip recompute if one ran recently for this project
  const now = Date.now();
  const lastRun = lastRecomputeMap.get(projectId) ?? 0;
  if (now - lastRun < COOLDOWN_MS) {
    console.log(`[NextActionRecompute] Cooldown active for project ${projectId}, skipping recompute (stale flag set)`);
    return;
  }

  // Record this recompute timestamp before starting (prevents races)
  lastRecomputeMap.set(projectId, now);

  // Fire-and-forget background recompute
  computeNextAction(projectId, true).then(() => {
    console.log(`[NextActionRecompute] Recomputed next action for project ${projectId}`);
  }).catch((err) => {
    console.error(`[NextActionRecompute] Recompute failed for project ${projectId}:`, err);
  });
}
