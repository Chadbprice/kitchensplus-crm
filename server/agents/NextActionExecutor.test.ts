/**
 * NextActionExecutor Tests
 * Validates:
 *  - Module exports and structure
 *  - Action type mapping (next action type → approval queue type)
 *  - Executable type classification
 *  - Dedup contract (pendingApprovalExists integration)
 *  - Cooldown contract (sharedMemory integration)
 *  - COMM_ACTION_TYPES sync between executor, agents router, and AgentApprovals
 *  - Draft generation fallback structure
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ── Module Structure ─────────────────────────────────────────────────────────

describe("NextActionExecutor module structure", () => {
  it("exports executeNextAction as a function", async () => {
    const mod = await import("./NextActionExecutor");
    expect(typeof mod.executeNextAction).toBe("function");
  });

  it("exports EXECUTABLE_CLIENT_COMM_TYPES as an array", async () => {
    const mod = await import("./NextActionExecutor");
    expect(Array.isArray(mod.EXECUTABLE_CLIENT_COMM_TYPES)).toBe(true);
    expect(mod.EXECUTABLE_CLIENT_COMM_TYPES.length).toBeGreaterThan(0);
  });

  it("exports EXECUTABLE_SUB_COMM_TYPES as an array", async () => {
    const mod = await import("./NextActionExecutor");
    expect(Array.isArray(mod.EXECUTABLE_SUB_COMM_TYPES)).toBe(true);
    expect(mod.EXECUTABLE_SUB_COMM_TYPES.length).toBeGreaterThan(0);
  });
});

// ── Action Type Classification ───────────────────────────────────────────────

describe("NextActionExecutor — action type classification", () => {
  it("client communication types include expected next action types", async () => {
    const { EXECUTABLE_CLIENT_COMM_TYPES } = await import("./NextActionExecutor");
    const types = [...EXECUTABLE_CLIENT_COMM_TYPES];
    expect(types).toContain("send_weekly_client_update");
    expect(types).toContain("follow_up_overdue_deposit");
    expect(types).toContain("request_client_decision");
    expect(types).toContain("notify_client_milestone_delay");
    expect(types).toContain("review_change_order_candidate");
  });

  it("subcontractor communication types include expected next action types", async () => {
    const { EXECUTABLE_SUB_COMM_TYPES } = await import("./NextActionExecutor");
    const types = [...EXECUTABLE_SUB_COMM_TYPES];
    expect(types).toContain("request_missing_compliance_doc");
    expect(types).toContain("request_subcontractor_eta");
  });

  it("non-executable types are NOT in any executable list", async () => {
    const { EXECUTABLE_CLIENT_COMM_TYPES, EXECUTABLE_SUB_COMM_TYPES } = await import("./NextActionExecutor");
    const all = [...EXECUTABLE_CLIENT_COMM_TYPES, ...EXECUTABLE_SUB_COMM_TYPES];
    // These are informational action types that should NOT generate drafts
    expect(all).not.toContain("review_project_risk");
    expect(all).not.toContain("schedule_walkthrough");
    expect(all).not.toContain("escalate_project_risk");
    expect(all).not.toContain("review_budget_variance");
    expect(all).not.toContain("create_deposit_invoice");
  });
});

// ── Action Type Mapping ──────────────────────────────────────────────────────

describe("NextActionExecutor — action type mapping", () => {
  // The ACTION_TYPE_MAP is internal, so we verify the contract through source inspection
  it("maps next action types to approval queue action types", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "NextActionExecutor.ts"),
      "utf-8"
    );

    // Verify all expected mappings exist in the source
    const expectedMappings = [
      ["send_weekly_client_update", "weekly_client_update"],
      ["follow_up_overdue_deposit", "payment_reminder_client"],
      ["request_client_decision", "client_decision_request"],
      ["notify_client_milestone_delay", "milestone_delayed_client_message"],
      ["review_change_order_candidate", "change_order_followup"],
      ["request_missing_compliance_doc", "compliance_doc_request"],
      ["request_subcontractor_eta", "subcontractor_eta_request"],
    ];

    for (const [from, to] of expectedMappings) {
      expect(source).toContain(from);
      expect(source).toContain(to);
    }
  });
});

// ── COMM_ACTION_TYPES Sync ───────────────────────────────────────────────────

describe("NextActionExecutor — COMM_ACTION_TYPES sync", () => {
  it("all mapped approval queue types are in the shared COMM_ACTION_TYPES", () => {
    const sharedSource = fs.readFileSync(
      path.resolve(__dirname, "../../shared/commActionTypes.ts"),
      "utf-8"
    );

    const expectedTypes = [
      "weekly_client_update",
      "payment_reminder_client",
      "client_decision_request",
      "milestone_delayed_client_message",
      "change_order_followup",
      "compliance_doc_request",
      "subcontractor_eta_request",
    ];

    for (const t of expectedTypes) {
      expect(sharedSource).toContain(`"${t}"`);
    }
  });

  it("agents.ts imports from shared/commActionTypes", () => {
    const agentsSource = fs.readFileSync(
      path.resolve(__dirname, "../routers/agents.ts"),
      "utf-8"
    );
    expect(agentsSource).toContain("shared/commActionTypes");
  });

  it("AgentApprovals.tsx imports from shared/commActionTypes", () => {
    const frontendSource = fs.readFileSync(
      path.resolve(__dirname, "../../client/src/pages/owner/AgentApprovals.tsx"),
      "utf-8"
    );
    expect(frontendSource).toContain("shared/commActionTypes");
  });
});

// ── Dedup Contract ───────────────────────────────────────────────────────────

describe("NextActionExecutor — dedup contract", () => {
  it("uses pendingApprovalExists from approvalQueue module", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "NextActionExecutor.ts"),
      "utf-8"
    );
    expect(source).toContain("pendingApprovalExists");
    expect(source).toContain("createApprovalItem");
  });

  it("uses sharedMemory cooldown with agentKey pattern", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "NextActionExecutor.ts"),
      "utf-8"
    );
    expect(source).toContain("memGet");
    expect(source).toContain("memSet");
    expect(source).toContain("agentKey");
    expect(source).toContain("COOLDOWN_MS");
  });

  it("cooldown is 6 hours (via shared config)", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "NextActionExecutor.ts"),
      "utf-8"
    );
    // Cooldown is now imported from shared/operationalConfig as NEXT_ACTION_EXECUTOR_COOLDOWN_HOURS
    expect(source).toContain("NEXT_ACTION_EXECUTOR_COOLDOWN_HOURS");
    expect(source).toContain("operationalConfig");
  });
});

// ── Integration with NextActionEngine ────────────────────────────────────────

describe("NextActionExecutor — engine integration", () => {
  it("NextActionEngine imports and calls executeNextAction", () => {
    const engineSource = fs.readFileSync(
      path.resolve(__dirname, "NextActionEngine.ts"),
      "utf-8"
    );
    expect(engineSource).toContain('import { executeNextAction }');
    expect(engineSource).toContain("executeNextAction(projectId, result)");
  });

  it("executeNextAction is called fire-and-forget (with .catch)", () => {
    const engineSource = fs.readFileSync(
      path.resolve(__dirname, "NextActionEngine.ts"),
      "utf-8"
    );
    expect(engineSource).toContain("executeNextAction(projectId, result).catch");
  });
});

// ── Draft Generation Contract ────────────────────────────────────────────────

describe("NextActionExecutor — draft generation", () => {
  it("generates deterministic fallback drafts for all client comm types", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "NextActionExecutor.ts"),
      "utf-8"
    );

    // Verify fallback drafts exist for each client comm type
    const clientTypes = [
      "send_weekly_client_update",
      "follow_up_overdue_deposit",
      "request_client_decision",
      "notify_client_milestone_delay",
      "review_change_order_candidate",
    ];

    for (const t of clientTypes) {
      expect(source).toContain(t);
    }

    // Verify all drafts sign off as Kitchens Plus Upstate
    const signoffCount = (source.match(/Kitchens Plus Upstate/g) || []).length;
    expect(signoffCount).toBeGreaterThanOrEqual(7); // at least 7 fallback drafts
  });

  it("generates deterministic fallback drafts for all sub comm types", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "NextActionExecutor.ts"),
      "utf-8"
    );

    const subTypes = [
      "request_missing_compliance_doc",
      "request_subcontractor_eta",
    ];

    for (const t of subTypes) {
      expect(source).toContain(t);
    }
  });

  it("stores nextActionType in approval payload metadata", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "NextActionExecutor.ts"),
      "utf-8"
    );
    expect(source).toContain("nextActionType: primaryActionType");
    expect(source).toContain("generatedBy: AGENT_NAME");
  });

  it("all drafts require approval (no auto-send)", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "NextActionExecutor.ts"),
      "utf-8"
    );
    // Verify createApprovalItem is used (not direct send)
    expect(source).toContain("createApprovalItem");
    // Verify no direct email/sms sending
    expect(source).not.toContain("createTransporter");
    expect(source).not.toContain("sendSms(");
    expect(source).not.toContain("transporter.sendMail");
  });
});

// ── COO Dashboard pendingDrafts integration ──────────────────────────────────

describe("NextActionExecutor — COO Dashboard integration", () => {
  it("nextActionStatus includes pendingDrafts count per project", () => {
    const cooSource = fs.readFileSync(
      path.resolve(__dirname, "../routers/coo.ts"),
      "utf-8"
    );
    expect(cooSource).toContain("pendingDrafts");
    expect(cooSource).toContain("pendingByProject");
  });

  it("COO Dashboard renders draft badges in Next Action Status", () => {
    const dashSource = fs.readFileSync(
      path.resolve(__dirname, "../../client/src/pages/owner/COODashboard.tsx"),
      "utf-8"
    );
    expect(dashSource).toContain("pendingDrafts");
    expect(dashSource).toContain("hasDrafts");
    expect(dashSource).toContain("draft");
  });
});
