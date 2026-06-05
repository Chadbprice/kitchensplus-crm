/**
 * shared/operationalConfig.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for all operational thresholds and timing constants
 * used across agents, schedulers, and the COO Dashboard.
 *
 * HOW TO TUNE:
 *   1. Edit the value here.
 *   2. All consumers automatically pick up the change on next restart.
 *   3. Do not duplicate these values in individual agent files — import from here.
 *
 * CATEGORIES:
 *   - Next Action Engine   — when actions go stale, alert thresholds
 *   - Communication        — quiet-period detection, draft cooldowns
 *   - Compliance           — expiry warning windows
 *   - Risk                 — communication gap, stale task detection
 *   - Financial            — payment gap warnings
 *   - Arrival / Scheduling — late/no-show detection
 *   - Vendor / PO          — overdue delivery detection
 *   - Trigger Cooldowns    — per-trigger debounce windows
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Next Action Engine ────────────────────────────────────────────────────────

/** Hours after which a computed next action is considered stale.
 *  Used in COO Dashboard "Next Action Status" and Best Path Forward alert. */
export const STALE_NEXT_ACTION_HOURS = 48;

/** Number of active projects with stale/missing next actions that triggers
 *  a top-priority Best Path Forward recommendation to recompute. */
export const STALE_NEXT_ACTION_ALERT_THRESHOLD = 3;

/** Hours cooldown per project per action type before the NextActionExecutor
 *  will generate another draft for the same action. Prevents draft spam. */
export const NEXT_ACTION_EXECUTOR_COOLDOWN_HOURS = 6;

// ── Communication ─────────────────────────────────────────────────────────────

/** Days of no client communication before the QuietPeriodUpdateAgent
 *  generates a proactive check-in draft for owner approval. */
export const QUIET_PERIOD_DAYS = 5;

/** Days cooldown before the QuietPeriodUpdateAgent will generate another
 *  proactive check-in for the same project. */
export const QUIET_PERIOD_COOLDOWN_DAYS = 3;

/** Days between weekly client update runs per project (enforced via sharedMemory).
 *  Prevents duplicate weekly updates if the scheduler runs multiple times. */
export const WEEKLY_UPDATE_COOLDOWN_DAYS = 6;

// ── Compliance ────────────────────────────────────────────────────────────────

/** Days before document expiry to show a warning alert in compliance checks. */
export const COMPLIANCE_WARN_DAYS = 30;

/** Days before document expiry to escalate to a critical alert. */
export const COMPLIANCE_CRITICAL_DAYS = 7;

/** Days-before-expiry windows for sending compliance reminder emails/SMS.
 *  Each value triggers one reminder cycle. */
export const COMPLIANCE_REMINDER_THRESHOLDS_DAYS = [30, 15, 3];

// ── Risk ──────────────────────────────────────────────────────────────────────

/** Days with no project messages before ProjectRiskAgent raises a warning. */
export const COMM_GAP_WARN_DAYS = 5;

/** Days with no project messages before ProjectRiskAgent raises a critical alert. */
export const COMM_GAP_CRITICAL_DAYS = 10;

/** Days an in-progress task can go without an update before a warning is raised. */
export const STALE_TASK_WARN_DAYS = 7;

/** Days an in-progress task can go without an update before a critical alert is raised. */
export const STALE_TASK_CRITICAL_DAYS = 14;

/** Days after task completion within which supporting documentation should be uploaded. */
export const TASK_EVIDENCE_WINDOW_DAYS = 3;

// ── Financial ─────────────────────────────────────────────────────────────────

/** Days with no payment on an active project before FinancialReviewAgent warns. */
export const PAYMENT_GAP_WARN_DAYS = 30;

/** Days with no payment on an active project before FinancialReviewAgent goes critical. */
export const PAYMENT_GAP_CRITICAL_DAYS = 60;

// ── Arrival / Scheduling ──────────────────────────────────────────────────────

/** Hours past scheduled start before a crew/vendor is flagged as "late" (warning). */
export const ARRIVAL_LATE_HOURS = 1;

/** Hours past scheduled start before a crew/vendor is flagged as "no-show" (critical). */
export const ARRIVAL_NOSHOW_HOURS = 4;

/** How often the ArrivalWatchScheduler runs (milliseconds). */
export const ARRIVAL_WATCH_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

// ── Vendor / Purchase Orders ──────────────────────────────────────────────────

/** Days past expected delivery date before a PO is flagged as critically overdue. */
export const PO_CRITICAL_OVERDUE_DAYS = 7;

/** Days cooldown before the PODeliveryFollowUpAgent sends another follow-up
 *  for the same purchase order. */
export const PO_FOLLOWUP_COOLDOWN_DAYS = 3;

/** How often the PODeliveryFollowUpScheduler runs (milliseconds). */
export const PO_FOLLOWUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Trigger Cooldowns ─────────────────────────────────────────────────────────

/** Cooldown (ms) for the next-action recompute trigger — prevents rapid
 *  re-triggers from multiple mutations in quick succession. */
export const NEXT_ACTION_RECOMPUTE_COOLDOWN_MS = 30_000; // 30 seconds

/** Cooldown (ms) for the milestone communication trigger per milestone per status. */
export const MILESTONE_COMM_COOLDOWN_MS = 60_000; // 60 seconds

/** Cooldown (ms) for the financial review trigger per project. */
export const FINANCIAL_REVIEW_COOLDOWN_MS = 60_000; // 60 seconds

/** Cooldown (ms) for the ProjectSummaryAgent per project. */
export const PROJECT_SUMMARY_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
