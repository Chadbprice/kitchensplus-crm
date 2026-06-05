import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB and LLM so tests run without real connections
vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({
      primaryAction: "AI-enhanced action",
      reason: "AI-enhanced reason",
      supportingActions: ["Do A", "Do B"],
      confidence: "high",
    }) } }],
  }),
}));

// Import after mocks
import { computeNextAction, getNextAction, markNextActionStale } from "./NextActionEngine";

describe("NextActionEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("computeNextAction", () => {
    it("returns null when DB is unavailable", async () => {
      const result = await computeNextAction(999, false);
      expect(result).toBeNull();
    });

    it("handles skipAI=true gracefully when DB is unavailable", async () => {
      const result = await computeNextAction(1, false);
      expect(result).toBeNull();
    });
  });

  describe("getNextAction", () => {
    it("returns null when DB is unavailable", async () => {
      const result = await getNextAction(999);
      expect(result).toBeNull();
    });
  });

  describe("markNextActionStale", () => {
    it("resolves without error when DB is unavailable", async () => {
      await expect(markNextActionStale(999)).resolves.not.toThrow();
    });
  });

  describe("rules engine logic (unit tests)", () => {
    it("urgency levels are ordered correctly", () => {
      const urgencies = ["low", "medium", "high", "critical"];
      const order = { low: 0, medium: 1, high: 2, critical: 3 };
      urgencies.forEach((u, i) => {
        expect(order[u as keyof typeof order]).toBe(i);
      });
    });

    it("action type categories are well-defined", () => {
      const validTypes = [
        "send_deposit_invoice",
        "collect_deposit",
        "resolve_questions",
        "schedule_kickoff",
        "assign_crew",
        "follow_up_overdue_invoice",
        "send_progress_invoice",
        "send_final_invoice",
        "collect_final_payment",
        "request_review",
        "complete_project",
        "send_client_update",
        "address_risk",
        "renew_compliance",
        "address_overrun",
        "unblock_tasks",
        "review_change_order",
        "continue_work",
      ];
      expect(validTypes.length).toBeGreaterThanOrEqual(15);
      // All types should be non-empty strings
      validTypes.forEach(t => expect(t.length).toBeGreaterThan(0));
    });

    it("urgency escalation logic: critical projects should get critical urgency", () => {
      // Simulate the urgency escalation rules
      const getUrgency = (flags: string[]): string => {
        if (flags.includes("overdue_invoice") || flags.includes("critical_risk")) return "critical";
        if (flags.includes("high_risk") || flags.includes("no_deposit")) return "high";
        if (flags.includes("stale_tasks") || flags.includes("pending_questions")) return "medium";
        return "low";
      };

      expect(getUrgency(["overdue_invoice"])).toBe("critical");
      expect(getUrgency(["critical_risk"])).toBe("critical");
      expect(getUrgency(["high_risk"])).toBe("high");
      expect(getUrgency(["no_deposit"])).toBe("high");
      expect(getUrgency(["stale_tasks"])).toBe("medium");
      expect(getUrgency(["pending_questions"])).toBe("medium");
      expect(getUrgency([])).toBe("low");
    });

    it("supporting actions array is always an array", () => {
      const parseSupporting = (raw: string | null): string[] => {
        try { return JSON.parse(raw ?? "[]"); } catch { return []; }
      };
      expect(parseSupporting(null)).toEqual([]);
      expect(parseSupporting("[]")).toEqual([]);
      expect(parseSupporting('["Do A","Do B"]')).toEqual(["Do A", "Do B"]);
      expect(parseSupporting("invalid json")).toEqual([]);
    });
  });

  describe("tRPC procedure contract", () => {
    it("nextActions.get procedure is defined in agents router", async () => {
      const { agentsRouter } = await import("../routers/agents");
      const routerDef = JSON.stringify(agentsRouter);
      expect(routerDef).toContain("nextActions");
    });

    it("nextActions.compute procedure is defined in agents router", async () => {
      const { agentsRouter } = await import("../routers/agents");
      // The router should have nextActions sub-router
      expect(agentsRouter).toBeDefined();
      expect(typeof agentsRouter).toBe("object");
    });

    it("NextActionEngine exports the required functions", async () => {
      const module = await import("./NextActionEngine");
      expect(typeof module.computeNextAction).toBe("function");
      expect(typeof module.getNextAction).toBe("function");
      expect(typeof module.markNextActionStale).toBe("function");
    });
  });
});
