/**
 * Phase 4 — Sub / Vendor Operations Tests
 *
 * Tests for:
 *   - ArrivalWatchAgent: threshold constants, event type filtering
 *   - PODeliveryFollowUpAgent: config constants, status filtering
 *   - COO Dashboard sub/vendor ops section: data shape, priority injection
 *   - COMM_ACTION_TYPES sync for po_delivery_followup
 *   - EventBus new event constants
 */
import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";

const serverDir = path.resolve(__dirname, "..");
const agentsDir = __dirname;

// ── ArrivalWatchAgent ──────────────────────────────────────────────────────────

describe("ArrivalWatchAgent", () => {
  it("exports THRESHOLDS with correct values", async () => {
    const { THRESHOLDS } = await import("./arrivalWatchAgent");
    expect(THRESHOLDS.LATE_THRESHOLD_MS).toBe(1 * 60 * 60 * 1000); // 1 hour
    expect(THRESHOLDS.NOSHOW_THRESHOLD_MS).toBe(4 * 60 * 60 * 1000); // 4 hours
    expect(THRESHOLDS.LOOKBACK_MS).toBe(24 * 60 * 60 * 1000); // 24 hours
  });

  it("only watches crew_assignment and vendor_visit event types", async () => {
    const source = fs.readFileSync(path.join(agentsDir, "arrivalWatchAgent.ts"), "utf-8");
    expect(source).toContain('"crew_assignment"');
    expect(source).toContain('"vendor_visit"');
    // Should NOT watch milestone, delivery, inspection, consultation, other
    expect(source).not.toContain('"milestone"');
    expect(source).not.toContain('"inspection"');
  });

  it("uses dedup via activeAlertExists before creating alerts", async () => {
    const source = fs.readFileSync(path.join(agentsDir, "arrivalWatchAgent.ts"), "utf-8");
    expect(source).toContain("activeAlertExists");
  });

  it("emits ARRIVAL_LATE and ARRIVAL_NOSHOW events", async () => {
    const source = fs.readFileSync(path.join(agentsDir, "arrivalWatchAgent.ts"), "utf-8");
    expect(source).toContain("EVENTS.ARRIVAL_LATE");
    expect(source).toContain("EVENTS.ARRIVAL_NOSHOW");
  });

  it("resolves crew and vendor assignee names", async () => {
    const source = fs.readFileSync(path.join(agentsDir, "arrivalWatchAgent.ts"), "utf-8");
    expect(source).toContain("crewMembers");
    expect(source).toContain("subcontractors");
  });
});

// ── PODeliveryFollowUpAgent ────────────────────────────────────────────────────

describe("PODeliveryFollowUpAgent", () => {
  it("exports CONFIG with correct values", async () => {
    const { CONFIG } = await import("./poDeliveryFollowUpAgent");
    expect(CONFIG.COOLDOWN_MS).toBe(3 * 24 * 60 * 60 * 1000); // 3 days
    expect(CONFIG.CRITICAL_OVERDUE_DAYS).toBe(7);
  });

  it("only checks POs in sent/acknowledged statuses", async () => {
    const source = fs.readFileSync(path.join(agentsDir, "poDeliveryFollowUpAgent.ts"), "utf-8");
    expect(source).toContain('"sent"');
    expect(source).toContain('"acknowledged"');
    // Should NOT check draft, approved, delivered, invoiced, paid, cancelled
    expect(source).not.toMatch(/AWAITING_DELIVERY_STATUSES.*"draft"/);
    expect(source).not.toMatch(/AWAITING_DELIVERY_STATUSES.*"delivered"/);
  });

  it("uses dedup via pendingApprovalExists + sharedMemory cooldown", async () => {
    const source = fs.readFileSync(path.join(agentsDir, "poDeliveryFollowUpAgent.ts"), "utf-8");
    expect(source).toContain("pendingApprovalExists");
    expect(source).toContain("memGet");
    expect(source).toContain("memSet");
    expect(source).toContain("COOLDOWN_MS");
  });

  it("creates alerts for POs overdue by 7+ days", async () => {
    const source = fs.readFileSync(path.join(agentsDir, "poDeliveryFollowUpAgent.ts"), "utf-8");
    expect(source).toContain("CRITICAL_OVERDUE_DAYS");
    expect(source).toContain("createAlert");
  });

  it("generates LLM-enriched follow-up drafts with deterministic fallback", async () => {
    const source = fs.readFileSync(path.join(agentsDir, "poDeliveryFollowUpAgent.ts"), "utf-8");
    expect(source).toContain("invokeLLM");
    expect(source).toContain("Kitchens Plus Upstate");
    expect(source).toContain("fallback");
  });
});

// ── EventBus new constants ─────────────────────────────────────────────────────

describe("EventBus Phase 4 constants", () => {
  it("includes ARRIVAL_LATE and ARRIVAL_NOSHOW events", async () => {
    const { EVENTS } = await import("./eventBus");
    expect(EVENTS.ARRIVAL_LATE).toBe("arrival.late");
    expect(EVENTS.ARRIVAL_NOSHOW).toBe("arrival.noshow");
  });

  it("includes PO_DELIVERY_OVERDUE event", async () => {
    const { EVENTS } = await import("./eventBus");
    expect(EVENTS.PO_DELIVERY_OVERDUE).toBe("po.delivery.overdue");
  });
});

// ── COMM_ACTION_TYPES sync ─────────────────────────────────────────────────────

describe("COMM_ACTION_TYPES includes po_delivery_followup", () => {
  it("shared/commActionTypes.ts includes po_delivery_followup", () => {
    const source = fs.readFileSync(
      path.resolve(serverDir, "..", "shared", "commActionTypes.ts"),
      "utf-8"
    );
    expect(source).toContain('"po_delivery_followup"');
  });

  it("backend agents.ts imports from shared/commActionTypes", () => {
    const source = fs.readFileSync(path.join(serverDir, "routers", "agents.ts"), "utf-8");
    expect(source).toContain("shared/commActionTypes");
  });
});

// ── COO Dashboard sub/vendor ops section ───────────────────────────────────────

describe("COO Dashboard sub/vendor ops", () => {
  it("coo.ts imports purchaseOrders, vendors, vendorInvoices, scheduleEvents, crewMembers", () => {
    const source = fs.readFileSync(path.join(serverDir, "routers", "coo.ts"), "utf-8");
    expect(source).toContain("purchaseOrders");
    expect(source).toContain("vendors");
    expect(source).toContain("vendorInvoices");
    expect(source).toContain("scheduleEvents");
    expect(source).toContain("crewMembers");
  });

  it("coo.ts returns subVendorOps with overduePOs, unreviewedInvoices, arrivalIssues", () => {
    const source = fs.readFileSync(path.join(serverDir, "routers", "coo.ts"), "utf-8");
    expect(source).toContain("subVendorOps");
    expect(source).toContain("overduePOs");
    expect(source).toContain("unreviewedInvoices");
    expect(source).toContain("arrivalIssues");
  });

  it("coo.ts fastActions includes overduePOCount, arrivalIssueCount, unreviewedInvoiceCount", () => {
    const source = fs.readFileSync(path.join(serverDir, "routers", "coo.ts"), "utf-8");
    expect(source).toContain("overduePOCount");
    expect(source).toContain("arrivalIssueCount");
    expect(source).toContain("unreviewedInvoiceCount");
  });

  it("coo.ts injects arrival no-show priorities as critical", () => {
    const source = fs.readFileSync(path.join(serverDir, "routers", "coo.ts"), "utf-8");
    // Check that arrival issues >= 4h are injected as critical priorities
    expect(source).toContain("hoursLate >= 4");
    expect(source).toContain('category: "Arrival"');
  });

  it("coo.ts injects overdue PO priorities as high", () => {
    const source = fs.readFileSync(path.join(serverDir, "routers", "coo.ts"), "utf-8");
    expect(source).toContain("daysOverdue >= 7");
    expect(source).toContain('category: "Vendor"');
  });

  it("COODashboard.tsx renders the Trade Partner Ops card", () => {
    const source = fs.readFileSync(
      path.resolve(serverDir, "..", "client", "src", "pages", "owner", "COODashboard.tsx"),
      "utf-8"
    );
    expect(source).toContain("Trade Partner Ops");
    expect(source).toContain("subVendorOps");
  });

  it("COODashboard.tsx shows arrival issues with NO-SHOW and LATE badges", () => {
    const source = fs.readFileSync(
      path.resolve(serverDir, "..", "client", "src", "pages", "owner", "COODashboard.tsx"),
      "utf-8"
    );
    expect(source).toContain("NO-SHOW");
    expect(source).toContain("LATE");
  });

  it("COODashboard.tsx shows overdue POs with days overdue badge", () => {
    const source = fs.readFileSync(
      path.resolve(serverDir, "..", "client", "src", "pages", "owner", "COODashboard.tsx"),
      "utf-8"
    );
    expect(source).toContain("overduePOs");
    expect(source).toContain("daysOverdue");
  });

  it("COODashboard.tsx shows unreviewed vendor invoices", () => {
    const source = fs.readFileSync(
      path.resolve(serverDir, "..", "client", "src", "pages", "owner", "COODashboard.tsx"),
      "utf-8"
    );
    expect(source).toContain("vendor invoice");
    expect(source).toContain("awaiting review");
  });
});

// ── Scheduler registration ─────────────────────────────────────────────────────

describe("Phase 4 scheduler registration", () => {
  it("arrivalWatchScheduler is registered in server bootstrap", () => {
    const source = fs.readFileSync(path.join(serverDir, "_core", "index.ts"), "utf-8");
    expect(source).toContain("startArrivalWatchScheduler");
  });

  it("poDeliveryFollowUpScheduler is registered in server bootstrap", () => {
    const source = fs.readFileSync(path.join(serverDir, "_core", "index.ts"), "utf-8");
    expect(source).toContain("startPODeliveryFollowUpScheduler");
  });
});
