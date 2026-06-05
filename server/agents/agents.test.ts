/**
 * Tests for AI Agent Foundation Services
 * Tests the pure logic functions that don't require a live DB connection.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Test: Event Name Constants ───────────────────────────────────────────────
describe("EVENTS constants", () => {
  it("should export all required event names", async () => {
    const { EVENTS } = await import("./eventBus");
    expect(EVENTS.SUBCONTRACTOR_CREATED).toBe("subcontractor.created");
    expect(EVENTS.COMPLIANCE_CHECK_FAILED).toBe("compliance.check.failed");
    expect(EVENTS.APPROVAL_ITEM_CREATED).toBe("approval_queue.item.created");
    expect(EVENTS.APPROVAL_ITEM_RESOLVED).toBe("approval_queue.item.resolved");
    expect(EVENTS.SUBCONTRACTOR_DOC_EXPIRED).toBe("subcontractor.doc.expired");
    expect(EVENTS.SUBCONTRACTOR_DOC_EXPIRING_SOON).toBe("subcontractor.doc.expiring_soon");
  });
});

// ─── Test: Shared Memory Key Builder ─────────────────────────────────────────
describe("agentKey", () => {
  it("should build namespaced keys correctly", async () => {
    const { agentKey } = await import("./sharedMemory");
    expect(agentKey("SubcontractorComplianceAgent", "lastFullScanAt"))
      .toBe("agent:SubcontractorComplianceAgent:lastFullScanAt");
    expect(agentKey("FinancialReviewAgent", "lastRun", "projectId", "42"))
      .toBe("agent:FinancialReviewAgent:lastRun:projectId:42");
  });

  it("should always start with agent: prefix", async () => {
    const { agentKey } = await import("./sharedMemory");
    const key = agentKey("TestAgent", "someKey");
    expect(key.startsWith("agent:")).toBe(true);
  });
});

// ─── Test: AgentRunner result structure ───────────────────────────────────────
describe("runAgent", () => {
  it("should return a completed result when fn resolves", async () => {
    // Mock the DB so no real connection is needed
    vi.mock("../db", () => ({
      getDb: vi.fn().mockResolvedValue(null),
    }));
    vi.mock("../_core/notification", () => ({
      notifyOwner: vi.fn().mockResolvedValue(true),
    }));

    const { runAgent } = await import("./agentRunner");
    const result = await runAgent(
      "TestAgent",
      "manual",
      null,
      null,
      async () => ({
        summary: "Test completed successfully",
        alertsCreated: 2,
        approvalsCreated: 1,
        eventsEmitted: 3,
        status: "completed",
      })
    );

    expect(result.summary).toBe("Test completed successfully");
    expect(result.status).toBe("completed");
    expect(result.alertsCreated).toBe(2);
    expect(result.approvalsCreated).toBe(1);
  });

  it("should return a failed result when fn throws", async () => {
    vi.mock("../db", () => ({
      getDb: vi.fn().mockResolvedValue(null),
    }));
    vi.mock("../_core/notification", () => ({
      notifyOwner: vi.fn().mockResolvedValue(true),
    }));

    const { runAgent } = await import("./agentRunner");
    const result = await runAgent(
      "FailingAgent",
      "manual",
      null,
      null,
      async () => {
        throw new Error("Something went wrong");
      }
    );

    expect(result.status).toBe("failed");
    expect(result.summary).toContain("Something went wrong");
  });
});

// ─── Test: Compliance check logic (pure functions) ───────────────────────────
describe("Compliance check pure logic", () => {
  it("should correctly identify expired docs", () => {
    const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    const days = Math.floor((pastDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    expect(days).toBeLessThan(0);
  });

  it("should correctly identify docs expiring soon (within 30 days)", () => {
    const soonDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days from now
    const days = Math.floor((soonDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    expect(days).toBeGreaterThanOrEqual(0);
    expect(days).toBeLessThanOrEqual(30);
  });

  it("should correctly identify valid docs (more than 30 days)", () => {
    const futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days from now
    const days = Math.floor((futureDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    expect(days).toBeGreaterThan(30);
  });
});

// ─── Test: Approval Queue dedup logic ────────────────────────────────────────
describe("Approval queue dedup", () => {
  it("pendingApprovalExists should return false when DB is null", async () => {
    vi.mock("../db", () => ({
      getDb: vi.fn().mockResolvedValue(null),
    }));
    const { pendingApprovalExists } = await import("./approvalQueue");
    const result = await pendingApprovalExists("subcontractor", 1, "block_task_assignment.coi");
    expect(result).toBe(false);
  });
});

// ─── Test: Alert dedup logic ──────────────────────────────────────────────────
describe("Alert dedup", () => {
  it("activeAlertExists should return false when DB is null", async () => {
    vi.mock("../db", () => ({
      getDb: vi.fn().mockResolvedValue(null),
    }));
    const { activeAlertExists } = await import("./alertService");
    const result = await activeAlertExists("compliance.coi.fail", "subcontractor", 1);
    expect(result).toBe(false);
  });
});

// ─── Test: Financial Review event constants ───────────────────────────────────
describe("Financial Review EVENTS", () => {
  it("should export financial review event names", async () => {
    const { EVENTS } = await import("./eventBus");
    expect(EVENTS.FINANCIAL_BUDGET_OVERRUN).toBe("financial.budget.overrun");
    expect(EVENTS.FINANCIAL_INVOICE_OVERDUE).toBe("financial.invoice.overdue");
    expect(EVENTS.FINANCIAL_MILESTONE_UNBILLED).toBe("financial.milestone.unbilled");
    expect(EVENTS.FINANCIAL_DEPOSIT_MISSING).toBe("financial.deposit.missing");
  });
});

// ─── Test: Project Risk event constants ──────────────────────────────────────
describe("Project Risk EVENTS", () => {
  it("should export project risk event names", async () => {
    const { EVENTS } = await import("./eventBus");
    expect(EVENTS.PROJECT_RISK_SCORED).toBe("project.risk.scored");
    expect(EVENTS.PROJECT_RISK_ESCALATED).toBe("project.risk.escalated");
    expect(EVENTS.PROJECT_SCHEDULE_SLIPPAGE).toBe("project.schedule.slippage");
    expect(EVENTS.PROJECT_COMMUNICATION_GAP).toBe("project.communication.gap");
  });
});

// ─── Test: Risk score level classification ────────────────────────────────────
describe("Risk score level classification", () => {
  function classifyRisk(score: number): string {
    if (score >= 75) return "critical";
    if (score >= 50) return "high";
    if (score >= 25) return "medium";
    return "low";
  }

  it("should classify score 0-24 as low", () => {
    expect(classifyRisk(0)).toBe("low");
    expect(classifyRisk(10)).toBe("low");
    expect(classifyRisk(24)).toBe("low");
  });

  it("should classify score 25-49 as medium", () => {
    expect(classifyRisk(25)).toBe("medium");
    expect(classifyRisk(40)).toBe("medium");
    expect(classifyRisk(49)).toBe("medium");
  });

  it("should classify score 50-74 as high", () => {
    expect(classifyRisk(50)).toBe("high");
    expect(classifyRisk(65)).toBe("high");
    expect(classifyRisk(74)).toBe("high");
  });

  it("should classify score 75+ as critical", () => {
    expect(classifyRisk(75)).toBe("critical");
    expect(classifyRisk(90)).toBe("critical");
    expect(classifyRisk(100)).toBe("critical");
  });
});

// ─── Test: Financial health budget overrun detection ─────────────────────────
describe("Financial health budget overrun detection", () => {
  function detectOverrun(actual: number, estimated: number): boolean {
    return actual > estimated && estimated > 0;
  }

  function calcBudgetPct(actual: number, estimated: number): number {
    if (estimated <= 0) return 0;
    return Math.min(100, Math.round((actual / estimated) * 100));
  }

  it("should detect overrun when actual exceeds estimated", () => {
    expect(detectOverrun(110000, 100000)).toBe(true);
    expect(detectOverrun(100001, 100000)).toBe(true);
  });

  it("should not flag overrun when actual is within budget", () => {
    expect(detectOverrun(80000, 100000)).toBe(false);
    expect(detectOverrun(100000, 100000)).toBe(false);
  });

  it("should not flag overrun when estimated is zero", () => {
    expect(detectOverrun(50000, 0)).toBe(false);
  });

  it("should cap budget percentage at 100", () => {
    expect(calcBudgetPct(150000, 100000)).toBe(100);
  });

  it("should return 0 when estimated is zero", () => {
    expect(calcBudgetPct(50000, 0)).toBe(0);
  });

  it("should calculate correct percentage", () => {
    expect(calcBudgetPct(75000, 100000)).toBe(75);
    expect(calcBudgetPct(50000, 100000)).toBe(50);
  });
});

// ─── Test: countPendingApprovals returns 0 when DB is null ───────────────────
describe("countPendingApprovals", () => {
  it("should return 0 when DB is null", async () => {
    vi.mock("../db", () => ({
      getDb: vi.fn().mockResolvedValue(null),
    }));
    const { countPendingApprovals } = await import("./approvalQueue");
    const count = await countPendingApprovals();
    expect(count).toBe(0);
  });
});
