/**
 * operationalConfig.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates that shared/operationalConfig.ts exports all required constants
 * with sensible default values, and that key agent files import from it
 * rather than using inline hardcoded constants.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SHARED_CONFIG_PATH = path.resolve(__dirname, "../../shared/operationalConfig.ts");
const AGENTS_DIR = path.resolve(__dirname);
const SERVER_DIR = path.resolve(__dirname, "..");

// ── 1. Config module exports ──────────────────────────────────────────────────

describe("shared/operationalConfig — exports", () => {
  let config: Record<string, unknown>;

  it("module can be imported", async () => {
    config = await import("../../shared/operationalConfig");
    expect(config).toBeDefined();
  });

  it("exports STALE_NEXT_ACTION_HOURS as a positive number", async () => {
    const { STALE_NEXT_ACTION_HOURS } = await import("../../shared/operationalConfig");
    expect(typeof STALE_NEXT_ACTION_HOURS).toBe("number");
    expect(STALE_NEXT_ACTION_HOURS).toBeGreaterThan(0);
  });

  it("exports STALE_NEXT_ACTION_ALERT_THRESHOLD as a positive number", async () => {
    const { STALE_NEXT_ACTION_ALERT_THRESHOLD } = await import("../../shared/operationalConfig");
    expect(typeof STALE_NEXT_ACTION_ALERT_THRESHOLD).toBe("number");
    expect(STALE_NEXT_ACTION_ALERT_THRESHOLD).toBeGreaterThan(0);
  });

  it("exports NEXT_ACTION_EXECUTOR_COOLDOWN_HOURS as a positive number", async () => {
    const { NEXT_ACTION_EXECUTOR_COOLDOWN_HOURS } = await import("../../shared/operationalConfig");
    expect(typeof NEXT_ACTION_EXECUTOR_COOLDOWN_HOURS).toBe("number");
    expect(NEXT_ACTION_EXECUTOR_COOLDOWN_HOURS).toBeGreaterThan(0);
  });

  it("exports QUIET_PERIOD_DAYS as a positive number", async () => {
    const { QUIET_PERIOD_DAYS } = await import("../../shared/operationalConfig");
    expect(typeof QUIET_PERIOD_DAYS).toBe("number");
    expect(QUIET_PERIOD_DAYS).toBeGreaterThan(0);
  });

  it("exports QUIET_PERIOD_COOLDOWN_DAYS as a positive number", async () => {
    const { QUIET_PERIOD_COOLDOWN_DAYS } = await import("../../shared/operationalConfig");
    expect(typeof QUIET_PERIOD_COOLDOWN_DAYS).toBe("number");
    expect(QUIET_PERIOD_COOLDOWN_DAYS).toBeGreaterThan(0);
  });

  it("exports WEEKLY_UPDATE_COOLDOWN_DAYS as a positive number", async () => {
    const { WEEKLY_UPDATE_COOLDOWN_DAYS } = await import("../../shared/operationalConfig");
    expect(typeof WEEKLY_UPDATE_COOLDOWN_DAYS).toBe("number");
    expect(WEEKLY_UPDATE_COOLDOWN_DAYS).toBeGreaterThan(0);
  });

  it("exports ARRIVAL_LATE_HOURS as a positive number", async () => {
    const { ARRIVAL_LATE_HOURS } = await import("../../shared/operationalConfig");
    expect(typeof ARRIVAL_LATE_HOURS).toBe("number");
    expect(ARRIVAL_LATE_HOURS).toBeGreaterThan(0);
  });

  it("exports ARRIVAL_NOSHOW_HOURS greater than ARRIVAL_LATE_HOURS", async () => {
    const { ARRIVAL_LATE_HOURS, ARRIVAL_NOSHOW_HOURS } = await import("../../shared/operationalConfig");
    expect(ARRIVAL_NOSHOW_HOURS).toBeGreaterThan(ARRIVAL_LATE_HOURS);
  });

  it("exports ARRIVAL_WATCH_INTERVAL_MS as a positive number", async () => {
    const { ARRIVAL_WATCH_INTERVAL_MS } = await import("../../shared/operationalConfig");
    expect(typeof ARRIVAL_WATCH_INTERVAL_MS).toBe("number");
    expect(ARRIVAL_WATCH_INTERVAL_MS).toBeGreaterThan(0);
  });

  it("exports PO_CRITICAL_OVERDUE_DAYS as a positive number", async () => {
    const { PO_CRITICAL_OVERDUE_DAYS } = await import("../../shared/operationalConfig");
    expect(typeof PO_CRITICAL_OVERDUE_DAYS).toBe("number");
    expect(PO_CRITICAL_OVERDUE_DAYS).toBeGreaterThan(0);
  });

  it("exports PO_FOLLOWUP_COOLDOWN_DAYS as a positive number", async () => {
    const { PO_FOLLOWUP_COOLDOWN_DAYS } = await import("../../shared/operationalConfig");
    expect(typeof PO_FOLLOWUP_COOLDOWN_DAYS).toBe("number");
    expect(PO_FOLLOWUP_COOLDOWN_DAYS).toBeGreaterThan(0);
  });

  it("exports NEXT_ACTION_RECOMPUTE_COOLDOWN_MS as a positive number", async () => {
    const { NEXT_ACTION_RECOMPUTE_COOLDOWN_MS } = await import("../../shared/operationalConfig");
    expect(typeof NEXT_ACTION_RECOMPUTE_COOLDOWN_MS).toBe("number");
    expect(NEXT_ACTION_RECOMPUTE_COOLDOWN_MS).toBeGreaterThan(0);
  });

  it("exports MILESTONE_COMM_COOLDOWN_MS as a positive number", async () => {
    const { MILESTONE_COMM_COOLDOWN_MS } = await import("../../shared/operationalConfig");
    expect(typeof MILESTONE_COMM_COOLDOWN_MS).toBe("number");
    expect(MILESTONE_COMM_COOLDOWN_MS).toBeGreaterThan(0);
  });

  it("exports FINANCIAL_REVIEW_COOLDOWN_MS as a positive number", async () => {
    const { FINANCIAL_REVIEW_COOLDOWN_MS } = await import("../../shared/operationalConfig");
    expect(typeof FINANCIAL_REVIEW_COOLDOWN_MS).toBe("number");
    expect(FINANCIAL_REVIEW_COOLDOWN_MS).toBeGreaterThan(0);
  });

  it("exports PROJECT_SUMMARY_COOLDOWN_MS as a positive number", async () => {
    const { PROJECT_SUMMARY_COOLDOWN_MS } = await import("../../shared/operationalConfig");
    expect(typeof PROJECT_SUMMARY_COOLDOWN_MS).toBe("number");
    expect(PROJECT_SUMMARY_COOLDOWN_MS).toBeGreaterThan(0);
  });

  it("exports COMPLIANCE_REMINDER_THRESHOLDS_DAYS as a non-empty array", async () => {
    const { COMPLIANCE_REMINDER_THRESHOLDS_DAYS } = await import("../../shared/operationalConfig");
    expect(Array.isArray(COMPLIANCE_REMINDER_THRESHOLDS_DAYS)).toBe(true);
    expect(COMPLIANCE_REMINDER_THRESHOLDS_DAYS.length).toBeGreaterThan(0);
  });
});

// ── 2. Default value sanity checks ────────────────────────────────────────────

describe("shared/operationalConfig — default values", () => {
  it("STALE_NEXT_ACTION_HOURS defaults to 48", async () => {
    const { STALE_NEXT_ACTION_HOURS } = await import("../../shared/operationalConfig");
    expect(STALE_NEXT_ACTION_HOURS).toBe(48);
  });

  it("QUIET_PERIOD_DAYS defaults to 5", async () => {
    const { QUIET_PERIOD_DAYS } = await import("../../shared/operationalConfig");
    expect(QUIET_PERIOD_DAYS).toBe(5);
  });

  it("ARRIVAL_LATE_HOURS defaults to 1", async () => {
    const { ARRIVAL_LATE_HOURS } = await import("../../shared/operationalConfig");
    expect(ARRIVAL_LATE_HOURS).toBe(1);
  });

  it("ARRIVAL_NOSHOW_HOURS defaults to 4", async () => {
    const { ARRIVAL_NOSHOW_HOURS } = await import("../../shared/operationalConfig");
    expect(ARRIVAL_NOSHOW_HOURS).toBe(4);
  });

  it("NEXT_ACTION_EXECUTOR_COOLDOWN_HOURS defaults to 6", async () => {
    const { NEXT_ACTION_EXECUTOR_COOLDOWN_HOURS } = await import("../../shared/operationalConfig");
    expect(NEXT_ACTION_EXECUTOR_COOLDOWN_HOURS).toBe(6);
  });

  it("STALE_NEXT_ACTION_ALERT_THRESHOLD defaults to 3", async () => {
    const { STALE_NEXT_ACTION_ALERT_THRESHOLD } = await import("../../shared/operationalConfig");
    expect(STALE_NEXT_ACTION_ALERT_THRESHOLD).toBe(3);
  });
});

// ── 3. Agent files import from shared config ──────────────────────────────────

describe("shared/operationalConfig — agent wiring", () => {
  it("arrivalWatchAgent imports from operationalConfig", () => {
    const source = fs.readFileSync(path.join(AGENTS_DIR, "arrivalWatchAgent.ts"), "utf-8");
    expect(source).toContain("operationalConfig");
    expect(source).toContain("ARRIVAL_LATE_HOURS");
    expect(source).toContain("ARRIVAL_NOSHOW_HOURS");
  });

  it("poDeliveryFollowUpAgent imports from operationalConfig", () => {
    const source = fs.readFileSync(path.join(AGENTS_DIR, "poDeliveryFollowUpAgent.ts"), "utf-8");
    expect(source).toContain("operationalConfig");
    expect(source).toContain("PO_FOLLOWUP_COOLDOWN_DAYS");
    expect(source).toContain("PO_CRITICAL_OVERDUE_DAYS");
  });

  it("quietPeriodUpdateAgent imports from operationalConfig", () => {
    const source = fs.readFileSync(path.join(AGENTS_DIR, "quietPeriodUpdateAgent.ts"), "utf-8");
    expect(source).toContain("operationalConfig");
    expect(source).toContain("QUIET_PERIOD_DAYS");
    expect(source).toContain("QUIET_PERIOD_COOLDOWN_DAYS");
  });

  it("NextActionExecutor imports from operationalConfig", () => {
    const source = fs.readFileSync(path.join(AGENTS_DIR, "NextActionExecutor.ts"), "utf-8");
    expect(source).toContain("operationalConfig");
    expect(source).toContain("NEXT_ACTION_EXECUTOR_COOLDOWN_HOURS");
  });

  it("triggerMilestoneCommunication imports from operationalConfig", () => {
    const source = fs.readFileSync(path.join(AGENTS_DIR, "triggerMilestoneCommunication.ts"), "utf-8");
    expect(source).toContain("operationalConfig");
    expect(source).toContain("MILESTONE_COMM_COOLDOWN_MS");
  });

  it("triggerFinancialReview imports from operationalConfig", () => {
    const source = fs.readFileSync(path.join(AGENTS_DIR, "triggerFinancialReview.ts"), "utf-8");
    expect(source).toContain("operationalConfig");
    expect(source).toContain("FINANCIAL_REVIEW_COOLDOWN_MS");
  });

  it("ProjectSummaryAgent imports from operationalConfig", () => {
    const source = fs.readFileSync(path.join(AGENTS_DIR, "ProjectSummaryAgent.ts"), "utf-8");
    expect(source).toContain("operationalConfig");
    expect(source).toContain("PROJECT_SUMMARY_COOLDOWN_MS");
  });

  it("weeklyClientUpdateAgent imports from operationalConfig", () => {
    const source = fs.readFileSync(path.join(AGENTS_DIR, "weeklyClientUpdateAgent.ts"), "utf-8");
    expect(source).toContain("operationalConfig");
    expect(source).toContain("WEEKLY_UPDATE_COOLDOWN_DAYS");
  });

  it("arrivalWatchScheduler imports from operationalConfig", () => {
    const source = fs.readFileSync(path.join(SERVER_DIR, "arrivalWatchScheduler.ts"), "utf-8");
    expect(source).toContain("operationalConfig");
    expect(source).toContain("ARRIVAL_WATCH_INTERVAL_MS");
  });

  it("poDeliveryFollowUpScheduler imports from operationalConfig", () => {
    const source = fs.readFileSync(path.join(SERVER_DIR, "poDeliveryFollowUpScheduler.ts"), "utf-8");
    expect(source).toContain("operationalConfig");
    expect(source).toContain("PO_FOLLOWUP_INTERVAL_MS");
  });

  it("complianceReminder imports from operationalConfig", () => {
    const source = fs.readFileSync(path.join(SERVER_DIR, "complianceReminder.ts"), "utf-8");
    expect(source).toContain("operationalConfig");
    expect(source).toContain("COMPLIANCE_REMINDER_THRESHOLDS_DAYS");
  });

  it("coo.ts router imports from operationalConfig", () => {
    const source = fs.readFileSync(path.join(SERVER_DIR, "routers/coo.ts"), "utf-8");
    expect(source).toContain("operationalConfig");
    expect(source).toContain("STALE_NEXT_ACTION_HOURS");
    expect(source).toContain("STALE_NEXT_ACTION_ALERT_THRESHOLD");
  });

  it("triggerNextActionRecompute imports from operationalConfig", () => {
    const source = fs.readFileSync(path.join(AGENTS_DIR, "triggerNextActionRecompute.ts"), "utf-8");
    expect(source).toContain("operationalConfig");
    expect(source).toContain("NEXT_ACTION_RECOMPUTE_COOLDOWN_MS");
  });
});
