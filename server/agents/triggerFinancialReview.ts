/**
 * triggerFinancialReview.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin helper that fires a single-project FinancialReviewAgent run in response
 * to a domain event (invoice created, payment received, change order approved).
 *
 * Idempotency: we store a "last triggered at" timestamp per project in the
 * shared memory layer. If a run was triggered for the same project within the
 * last COOLDOWN_MS milliseconds we skip it — the scheduled 24-hour sweep will
 * catch anything we miss.
 */

import { emitEvent } from "./eventBus";
import { memGet, memSet } from "./sharedMemory";
import { runFinancialReviewAgent } from "./FinancialReviewAgent/index";
import { FINANCIAL_REVIEW_COOLDOWN_MS } from "../../shared/operationalConfig";

const COOLDOWN_MS = FINANCIAL_REVIEW_COOLDOWN_MS;

export async function triggerFinancialReview(
  projectId: number,
  eventName: string,
  entityId?: number
): Promise<void> {
  const memKey = `financial_review:last_triggered:${projectId}`;

  try {
    // ── Idempotency check ──────────────────────────────────────────────────
    const lastTriggered = await memGet(memKey);
    if (lastTriggered) {
      const elapsed = Date.now() - new Date(lastTriggered).getTime();
      if (elapsed < COOLDOWN_MS) {
        console.log(
          `[triggerFinancialReview] Skipping project ${projectId} — ran ${Math.round(elapsed / 1000)}s ago (cooldown: ${COOLDOWN_MS / 1000}s)`
        );
        return;
      }
    }

    // ── Record trigger timestamp before running ────────────────────────────
    await memSet(memKey, new Date().toISOString());

    // ── Emit domain event ──────────────────────────────────────────────────
    await emitEvent(eventName as any, "project", projectId, {
      entityId: entityId ?? null,
      triggeredAt: new Date().toISOString(),
      source: "event_trigger",
    });

    // ── Run agent for this project only ────────────────────────────────────
    console.log(
      `[triggerFinancialReview] Running for project ${projectId} (event: ${eventName}, entity: ${entityId ?? "n/a"})`
    );
    await runFinancialReviewAgent("triggered", projectId);
  } catch (err: any) {
    // Never let a trigger failure break the calling mutation
    console.error(
      `[triggerFinancialReview] Non-fatal error for project ${projectId}:`,
      err?.message
    );
  }
}
