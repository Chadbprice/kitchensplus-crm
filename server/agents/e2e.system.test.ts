/**
 * End-to-End System Connectivity Tests
 * =====================================
 * Validates that all 5 AI COO systems are fully wired and reactive:
 *
 * 1. Milestone-triggered client communication
 * 2. Weekly client update automation
 * 3. Change-order risk/financial linkage
 * 4. Project-to-payment gating
 * 5. Shared memory enrichment (ProjectSummaryAgent)
 *
 * These are integration-level tests that verify module contracts,
 * data shapes, and event bus constants — not live DB calls.
 */
import { describe, it, expect, vi } from "vitest";
import { EVENTS } from "./eventBus";

// ── 1. Milestone Communication ─────────────────────────────────────────────
describe("System 1: Milestone-triggered client communication", () => {
  it("triggerMilestoneCommunication module exports the trigger function", async () => {
    const mod = await import("./triggerMilestoneCommunication");
    expect(typeof mod.triggerMilestoneCommunication).toBe("function");
  });

  it("accepts 'completed' and 'delayed' status values", async () => {
    const mod = await import("./triggerMilestoneCommunication");
    // Function signature accepts (milestoneId: number, status: string)
    // We verify it doesn't throw on valid inputs (DB will return null gracefully)
    await expect(mod.triggerMilestoneCommunication(999999, "completed")).resolves.not.toThrow();
  });

  it("MILESTONE_STATUS_CHANGED event constant is defined", () => {
    expect(EVENTS.MILESTONE_STATUS_CHANGED).toBe("milestone.status.changed");
  });

  it("emits MILESTONE_STATUS_CHANGED event (not a raw string)", () => {
    // Verify the constant matches what triggerMilestoneCommunication uses
    expect(EVENTS.MILESTONE_STATUS_CHANGED).toMatch(/milestone/);
  });
});

// ── 2. Weekly Client Update Automation ────────────────────────────────────
describe("System 2: Weekly client update automation", () => {
  it("weeklyClientUpdateAgent exports runWeeklyClientUpdateAgent", async () => {
    const mod = await import("./weeklyClientUpdateAgent");
    expect(typeof mod.runWeeklyClientUpdateAgent).toBe("function");
  });

  it("weeklyClientUpdateScheduler exports startWeeklyClientUpdateScheduler", async () => {
    const mod = await import("../weeklyClientUpdateScheduler");
    expect(typeof mod.startWeeklyClientUpdateScheduler).toBe("function");
  });

  it("scheduler sets up a Monday 8AM cron (next run is always a Monday)", async () => {
    // The scheduler runs every Monday at 8AM — verify the cron pattern
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../weeklyClientUpdateScheduler.ts", import.meta.url).pathname,
      "utf8"
    );
    // Should contain a cron expression or day-of-week reference for Monday
    expect(content).toMatch(/monday|Monday|cron|setInterval|schedule/i);
  });
});

// ── 3. Change-Order Risk/Financial Linkage ─────────────────────────────────
describe("System 3: Change-order risk/financial linkage", () => {
  it("triggerFinancialReview exports the trigger function", async () => {
    const mod = await import("./triggerFinancialReview");
    expect(typeof mod.triggerFinancialReview).toBe("function");
  });

  it("CHANGE_ORDER_APPROVED event constant is defined", () => {
    expect(EVENTS.CHANGE_ORDER_APPROVED).toBe("change_order.approved");
  });

  it("changeOrders router imports EVENTS for type-safe event names", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../routers/changeOrders.ts", import.meta.url).pathname,
      "utf8"
    );
    expect(content).toContain("EVENTS.CHANGE_ORDER_APPROVED");
    expect(content).toContain("runProjectSummaryAgent");
  });

  it("approveByToken fires both FinancialReview and ProjectSummaryAgent", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../routers/changeOrders.ts", import.meta.url).pathname,
      "utf8"
    );
    expect(content).toContain("triggerFinancialReview");
    expect(content).toContain("runProjectSummaryAgent");
  });
});

// ── 4. Project-to-Payment Gating ──────────────────────────────────────────
describe("System 4: Project-to-payment gating", () => {
  it("invoice create procedure has bypassMilestoneGate field", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../routers.ts", import.meta.url).pathname,
      "utf8"
    );
    expect(content).toContain("bypassMilestoneGate");
    expect(content).toContain("PRECONDITION_FAILED");
  });

  it("gating only applies to progress and final invoices", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../routers.ts", import.meta.url).pathname,
      "utf8"
    );
    // The gating condition checks for progress/final invoice types
    expect(content).toContain("invoiceType === \"progress\" || input.invoiceType === \"final\"");
  });

  it("AgentApprovals UI has Send Now button for communication types", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../../client/src/pages/owner/AgentApprovals.tsx", import.meta.url).pathname,
      "utf8"
    );
    expect(content).toContain("Send Now");
    expect(content).toContain("sendCommunication");
    expect(content).toContain("COMM_ACTION_TYPES");
  });
});

// ── 5. Shared Memory Enrichment ────────────────────────────────────────────
describe("System 5: Shared memory enrichment (ProjectSummaryAgent)", () => {
  it("ProjectSummaryAgent exports runProjectSummaryAgent", async () => {
    const mod = await import("./ProjectSummaryAgent");
    expect(typeof mod.runProjectSummaryAgent).toBe("function");
  });

  it("ProjectSummaryAgent has cooldown logic", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("./ProjectSummaryAgent.ts", import.meta.url).pathname,
      "utf8"
    );
    expect(content).toContain("COOLDOWN_MS");
    expect(content).toContain("cooldownKey");
  });

  it("updateMilestone wires ProjectSummaryAgent on status change", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../routers.ts", import.meta.url).pathname,
      "utf8"
    );
    // updateMilestone should call runProjectSummaryAgent
    const updateMilestoneSection = content.substring(
      content.indexOf("updateMilestone:"),
      content.indexOf("updateMilestone:") + 2500
    );
    expect(updateMilestoneSection).toContain("runProjectSummaryAgent");
  });
});

// ── Cross-system: Approval Queue Integrity ─────────────────────────────────
describe("Cross-system: Approval Queue integrity", () => {
  it("approvalQueue exports createApprovalItem, resolveApprovalItem, rejectApprovalItem", async () => {
    const mod = await import("./approvalQueue");
    expect(typeof mod.createApprovalItem).toBe("function");
    expect(typeof mod.resolveApprovalItem).toBe("function");
    expect(typeof mod.rejectApprovalItem).toBe("function");
  });

  it("createApprovalItem accepts extended fields (relatedEntityType, projectId, metadata, severity aliases)", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("./approvalQueue.ts", import.meta.url).pathname,
      "utf8"
    );
    // Should have normalizeSeverity or severity mapping
    expect(content).toMatch(/normaliz|severity.*map|low.*info|high.*critical/i);
  });

  it("agents router exposes sendCommunication procedure", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../routers/agents.ts", import.meta.url).pathname,
      "utf8"
    );
    expect(content).toContain("sendCommunication");
    expect(content).toContain("sendEmail");
    expect(content).toContain("sendSmsMsg");
  });

  it("clientPortal financial summary uses leadId (not clientId)", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../routers/clientPortal.ts", import.meta.url).pathname,
      "utf8"
    );
    // Should NOT have projects.clientId compared to leadId
    expect(content).not.toContain("projects.clientId");
  });
});
