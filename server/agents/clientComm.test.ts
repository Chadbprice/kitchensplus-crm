/**
 * Phase 3 — Client Communication Automation Tests
 *
 * Covers:
 * - Branded email template generation
 * - Weekly client update agent hardening (lead name fix, catch-up)
 * - Milestone communication LLM enrichment
 * - Quiet-period proactive update agent
 * - Communication flow contracts
 */
import { describe, it, expect } from "vitest";
import { wrapInBrandedTemplate } from "./brandedEmailTemplate";
import type { BrandedEmailOptions } from "./brandedEmailTemplate";
import { QUIET_PERIOD_DAYS } from "./quietPeriodUpdateAgent";
import path from "path";
import fs from "fs";

const AGENTS_DIR = path.resolve(__dirname);
const SERVER_DIR = path.resolve(__dirname, "..");

// ── Branded Email Template ────────────────────────────────────────────────────

describe("Branded Email Template", () => {
  it("generates valid HTML with all required brand elements", () => {
    const html = wrapInBrandedTemplate({
      recipientName: "John",
      subject: "Weekly Update",
      body: "Hi John,\n\nYour project is progressing well.\n\nWarm regards,\nKitchens Plus Upstate",
    });

    // Brand elements
    expect(html).toContain("Kitchens Plus Upstate");
    expect(html).toContain("Renovations &amp; Design");
    expect(html).toContain("#BF9A3B"); // Gold accent
    expect(html).toContain("#2E2F2A"); // Dark header/footer
    expect(html).toContain("#F5EDE7"); // Light background
    expect(html).toContain("Georgia,serif"); // Typography
    expect(html).toContain("kitchensplusupstate.com");
    expect(html).toContain("All rights reserved");
  });

  it("converts newlines to <br> tags", () => {
    const html = wrapInBrandedTemplate({
      recipientName: "Jane",
      subject: "Test",
      body: "Line 1\nLine 2\nLine 3",
    });

    expect(html).toContain("Line 1<br>Line 2<br>Line 3");
  });

  it("includes CTA button when provided", () => {
    const html = wrapInBrandedTemplate({
      recipientName: "Jane",
      subject: "Test",
      body: "Check this out",
      ctaLabel: "View Your Project",
      ctaUrl: "https://example.com/portal",
    });

    expect(html).toContain("View Your Project");
    expect(html).toContain("https://example.com/portal");
    expect(html).toContain("border-radius:50px"); // Rounded CTA button
  });

  it("omits CTA button when not provided", () => {
    const html = wrapInBrandedTemplate({
      recipientName: "Jane",
      subject: "Test",
      body: "No CTA here",
    });

    // Should not have any <a> tags with CTA styling (except footer link)
    expect(html).not.toContain("border-radius:50px");
  });

  it("uses client contact block for non-subcontractor emails", () => {
    const html = wrapInBrandedTemplate({
      recipientName: "Jane",
      subject: "Test",
      body: "Client email",
      isSubcontractor: false,
    });

    expect(html).toContain("+1 (833) 518-4811");
    expect(html).toContain("(864) 567-8777");
    expect(html).toContain("all messages go to our full team");
  });

  it("uses subcontractor contact block for subcontractor emails", () => {
    const html = wrapInBrandedTemplate({
      recipientName: "Mike",
      subject: "Compliance",
      body: "Sub email",
      isSubcontractor: true,
    });

    expect(html).toContain("(864) 567-8777");
    expect(html).not.toContain("+1 (833) 518-4811");
    expect(html).toContain("reply to this email or call Chad");
  });

  it("produces valid HTML document structure", () => {
    const html = wrapInBrandedTemplate({
      recipientName: "Test",
      subject: "Test",
      body: "Test body",
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html>");
    expect(html).toContain("</html>");
    expect(html).toContain("<meta charset=\"utf-8\"");
    expect(html).toContain("viewport");
  });
});

// ── Weekly Client Update Agent Contracts ──────────────────────────────────────

describe("Weekly Client Update Agent Contracts", () => {
  it("exports runWeeklyClientUpdateAgent function", async () => {
    const mod = await import("./weeklyClientUpdateAgent");
    expect(typeof mod.runWeeklyClientUpdateAgent).toBe("function");
  });

  it("uses lead.name (not firstName/lastName) for lead resolution", () => {
    const source = fs.readFileSync(
      path.join(AGENTS_DIR, "weeklyClientUpdateAgent.ts"),
      "utf-8"
    );
    expect(source).toContain("lead.name");
    expect(source).not.toContain("lead.firstName");
    expect(source).not.toContain("lead.lastName");
  });
});

// ── Milestone Communication Contracts ─────────────────────────────────────────

describe("Milestone Communication Contracts", () => {
  it("exports triggerMilestoneCommunication function", async () => {
    const mod = await import("./triggerMilestoneCommunication");
    expect(typeof mod.triggerMilestoneCommunication).toBe("function");
  });

  it("uses lead.name (not firstName/lastName) for lead resolution", () => {
    const source = fs.readFileSync(
      path.join(AGENTS_DIR, "triggerMilestoneCommunication.ts"),
      "utf-8"
    );
    expect(source).toContain("lead.name");
    expect(source).not.toContain("lead.firstName");
    expect(source).not.toContain("lead.lastName");
  });

  it("includes LLM enrichment with invokeLLM call", () => {
    const source = fs.readFileSync(
      path.join(AGENTS_DIR, "triggerMilestoneCommunication.ts"),
      "utf-8"
    );
    expect(source).toContain("invokeLLM");
    expect(source).toContain("luxury renovation");
    expect(source).toContain("premium, warm, reassuring");
  });

  it("gathers project context (milestones, tasks) for LLM enrichment", () => {
    const source = fs.readFileSync(
      path.join(AGENTS_DIR, "triggerMilestoneCommunication.ts"),
      "utf-8"
    );
    expect(source).toContain("allMilestones");
    expect(source).toContain("recentTasks");
    expect(source).toContain("completedMilestones");
    expect(source).toContain("upcomingMilestones");
  });
});

// ── Quiet-Period Proactive Update Agent ───────────────────────────────────────

describe("Quiet-Period Proactive Update Agent", () => {
  it("exports runQuietPeriodUpdateAgent function", async () => {
    const mod = await import("./quietPeriodUpdateAgent");
    expect(typeof mod.runQuietPeriodUpdateAgent).toBe("function");
  });

  it("exports configurable QUIET_PERIOD_DAYS constant", () => {
    expect(typeof QUIET_PERIOD_DAYS).toBe("number");
    expect(QUIET_PERIOD_DAYS).toBeGreaterThan(0);
    expect(QUIET_PERIOD_DAYS).toBeLessThanOrEqual(14);
  });

  it("defaults to 5-day quiet period threshold", () => {
    expect(QUIET_PERIOD_DAYS).toBe(5);
  });

  it("uses pendingApprovalExists for dedup", () => {
    const source = fs.readFileSync(
      path.join(AGENTS_DIR, "quietPeriodUpdateAgent.ts"),
      "utf-8"
    );
    expect(source).toContain("pendingApprovalExists");
    expect(source).toContain("weekly_client_update");
  });

  it("uses sharedMemory cooldown (3-day via shared config)", () => {
    const source = fs.readFileSync(
      path.join(AGENTS_DIR, "quietPeriodUpdateAgent.ts"),
      "utf-8"
    );
    expect(source).toContain("COOLDOWN_MS");
    // Cooldown is now imported from shared/operationalConfig as QUIET_PERIOD_COOLDOWN_DAYS
    expect(source).toContain("QUIET_PERIOD_COOLDOWN_DAYS");
    expect(source).toContain("operationalConfig");
  });

  it("generates LLM-enriched drafts with fallback", () => {
    const source = fs.readFileSync(
      path.join(AGENTS_DIR, "quietPeriodUpdateAgent.ts"),
      "utf-8"
    );
    expect(source).toContain("invokeLLM");
    expect(source).toContain("proactive check-in");
    expect(source).toContain("Warm regards");
  });

  it("routes drafts to approval queue with metadata", () => {
    const source = fs.readFileSync(
      path.join(AGENTS_DIR, "quietPeriodUpdateAgent.ts"),
      "utf-8"
    );
    expect(source).toContain("createApprovalItem");
    expect(source).toContain("trigger: \"quiet_period\"");
    expect(source).toContain("daysSinceContact");
  });

  it("logs agent runs for observability", () => {
    const source = fs.readFileSync(
      path.join(AGENTS_DIR, "quietPeriodUpdateAgent.ts"),
      "utf-8"
    );
    expect(source).toContain("logAgentRun");
    expect(source).toContain("QuietPeriodUpdateAgent");
  });
});

// ── Scheduler Contracts ───────────────────────────────────────────────────────

describe("Quiet-Period Scheduler", () => {
  it("exports startQuietPeriodScheduler function", async () => {
    const mod = await import("../quietPeriodScheduler");
    expect(typeof mod.startQuietPeriodScheduler).toBe("function");
  });

  it("includes startup catch-up logic", () => {
    const source = fs.readFileSync(
      path.join(SERVER_DIR, "quietPeriodScheduler.ts"),
      "utf-8"
    );
    expect(source).toContain("catch-up");
    expect(source).toContain("runQuietPeriodUpdateAgent");
  });
});

describe("Weekly Client Update Scheduler Hardening", () => {
  it("exports startWeeklyClientUpdateScheduler function", async () => {
    const mod = await import("../weeklyClientUpdateScheduler");
    expect(typeof mod.startWeeklyClientUpdateScheduler).toBe("function");
  });

  it("includes catch-up logic for missed runs", () => {
    const source = fs.readFileSync(
      path.join(SERVER_DIR, "weeklyClientUpdateScheduler.ts"),
      "utf-8"
    );
    expect(source).toContain("Catch-up");
    expect(source).toContain("memGet");
    expect(source).toContain("memSet");
    expect(source).toContain("SIX_DAYS_MS");
  });
});

// ── Branded Email in sendCommunication ────────────────────────────────────────

describe("sendCommunication uses branded template", () => {
  it("imports wrapInBrandedTemplate in agents router", () => {
    const source = fs.readFileSync(
      path.join(SERVER_DIR, "routers", "agents.ts"),
      "utf-8"
    );
    expect(source).toContain("wrapInBrandedTemplate");
    expect(source).toContain("brandedEmailTemplate");
  });

  it("detects subcontractor communication types for template variant", () => {
    const source = fs.readFileSync(
      path.join(SERVER_DIR, "routers", "agents.ts"),
      "utf-8"
    );
    expect(source).toContain("isSubComm");
    expect(source).toContain("compliance_doc_request");
    expect(source).toContain("subcontractor_eta_request");
  });
});

// ── Server Bootstrap Registration ─────────────────────────────────────────────

describe("Server bootstrap registers all communication schedulers", () => {
  it("registers quiet-period scheduler in server bootstrap", () => {
    const source = fs.readFileSync(
      path.join(SERVER_DIR, "_core", "index.ts"),
      "utf-8"
    );
    expect(source).toContain("startQuietPeriodScheduler");
    expect(source).toContain("quietPeriodScheduler");
  });

  it("registers weekly client update scheduler in server bootstrap", () => {
    const source = fs.readFileSync(
      path.join(SERVER_DIR, "_core", "index.ts"),
      "utf-8"
    );
    expect(source).toContain("startWeeklyClientUpdateScheduler");
  });
});
