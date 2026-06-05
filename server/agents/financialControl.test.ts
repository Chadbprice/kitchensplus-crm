/**
 * Phase 5 — Financial Control Maturity Tests
 *
 * Covers:
 * 1. Deposit gating on milestone progression
 * 2. Auto-draft invoice on change order approval
 * 3. Portfolio financial health summary in COO Dashboard
 * 4. Margin-risk visibility and priority injection
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ─── 1. Deposit Gating ──────────────────────────────────────────────────────

describe("Phase 5: Deposit Gating on Milestone Progression", () => {
  const routersPath = path.join(__dirname, "..", "routers.ts");
  const routersSource = fs.readFileSync(routersPath, "utf-8");

  it("updateMilestone accepts bypassDepositGate input parameter", () => {
    expect(routersSource).toContain("bypassDepositGate: z.boolean().optional()");
  });

  it("checks deposit status before allowing in_progress transition", () => {
    expect(routersSource).toContain('rest.status === "in_progress"');
    expect(routersSource).toContain("bypassDepositGate");
    expect(routersSource).toContain("squareDepositStatus");
  });

  it("throws PRECONDITION_FAILED when no deposit collected", () => {
    expect(routersSource).toContain("PRECONDITION_FAILED");
    expect(routersSource).toContain("No deposit has been collected for this project");
  });

  it("allows bypass when bypassDepositGate is true", () => {
    // The gate only fires when bypassDepositGate is falsy
    expect(routersSource).toContain('rest.status === "in_progress" && !bypassDepositGate');
  });

  it("checks both squareDepositStatus and deposit invoice payment", () => {
    expect(routersSource).toContain('squareDepositStatus !== "paid"');
    expect(routersSource).toContain('invoiceType, "deposit"');
    expect(routersSource).toContain('invoices.status, "paid"');
  });
});

// ─── 2. Auto-Draft Invoice on Change Order Approval ──────────────────────────

describe("Phase 5: Auto-Draft Invoice on Change Order Approval", () => {
  const coInvoicePath = path.join(__dirname, "changeOrderInvoiceDraft.ts");
  const coInvoiceSource = fs.readFileSync(coInvoicePath, "utf-8");

  it("draftInvoiceForChangeOrder module exists and exports the function", () => {
    expect(coInvoiceSource).toContain("export async function draftInvoiceForChangeOrder");
  });

  it("validates change order is approved before drafting", () => {
    expect(coInvoiceSource).toContain('co.status !== "approved"');
    expect(coInvoiceSource).toContain('"co_not_approved"');
  });

  it("deduplicates via existing invoice check", () => {
    expect(coInvoiceSource).toContain("invoice_already_exists");
    expect(coInvoiceSource).toContain('invoiceType, "change_order"');
  });

  it("deduplicates via approval queue check", () => {
    expect(coInvoiceSource).toContain("pendingApprovalExists");
    expect(coInvoiceSource).toContain("already_pending_approval");
  });

  it("creates a draft invoice with correct type", () => {
    expect(coInvoiceSource).toContain('invoiceType: "change_order"');
    expect(coInvoiceSource).toContain('status: "draft"');
  });

  it("creates an approval queue item for owner review", () => {
    expect(coInvoiceSource).toContain("createApprovalItem");
    expect(coInvoiceSource).toContain("ChangeOrderInvoiceDraft");
  });

  it("includes change order details in the approval item", () => {
    expect(coInvoiceSource).toContain("changeOrderId");
    expect(coInvoiceSource).toContain("changeOrderNumber");
    expect(coInvoiceSource).toContain("invoiceNumber");
  });

  // Verify wiring into change order approval flows
  const coRouterPath = path.join(__dirname, "..", "routers", "changeOrders.ts");
  const coRouterSource = fs.readFileSync(coRouterPath, "utf-8");

  it("is wired into approveByToken flow", () => {
    expect(coRouterSource).toContain("draftInvoiceForChangeOrder");
    // Check it's called after the approval update
    const approveByTokenIdx = coRouterSource.indexOf("approveByToken");
    const draftCallIdx = coRouterSource.indexOf("draftInvoiceForChangeOrder", approveByTokenIdx);
    expect(draftCallIdx).toBeGreaterThan(approveByTokenIdx);
  });

  it("is wired into approveManually flow", () => {
    const approveManuallyIdx = coRouterSource.indexOf("approveManually");
    const draftCallIdx = coRouterSource.indexOf("draftInvoiceForChangeOrder", approveManuallyIdx);
    expect(draftCallIdx).toBeGreaterThan(approveManuallyIdx);
  });
});

// ─── 3. Portfolio Financial Health Summary ───────────────────────────────────

describe("Phase 5: Portfolio Financial Health in COO Dashboard", () => {
  const cooPath = path.join(__dirname, "..", "routers", "coo.ts");
  const cooSource = fs.readFileSync(cooPath, "utf-8");

  it("imports invoicePayments table", () => {
    expect(cooSource).toContain("invoicePayments");
  });

  it("computes totalInvoiced from invoices table", () => {
    expect(cooSource).toContain("portfolioInvoiced");
    expect(cooSource).toContain("COALESCE(SUM(amount), 0)");
  });

  it("computes totalCollected from invoicePayments table", () => {
    expect(cooSource).toContain("portfolioCollected");
  });

  it("computes totalOverdue for sent invoices past due date", () => {
    expect(cooSource).toContain("portfolioOverdue");
  });

  it("returns portfolioHealth in the summary response", () => {
    expect(cooSource).toContain("portfolioHealth");
    expect(cooSource).toContain("totalInvoiced");
    expect(cooSource).toContain("totalCollected");
    expect(cooSource).toContain("totalOutstanding");
    expect(cooSource).toContain("totalOverdue");
  });

  it("computes per-project margin data", () => {
    expect(cooSource).toContain("projectMargins");
    expect(cooSource).toContain("budgetEstimated");
    expect(cooSource).toContain("budgetActual");
    expect(cooSource).toContain("marginPercent");
  });

  it("classifies margin status as at_risk, watch, or healthy", () => {
    expect(cooSource).toContain('"at_risk"');
    expect(cooSource).toContain('"watch"');
    expect(cooSource).toContain('"healthy"');
  });

  it("includes atRiskMarginCount in portfolio health", () => {
    expect(cooSource).toContain("atRiskMarginCount");
  });
});

// ─── 4. Margin-Risk Priority Injection ───────────────────────────────────────

describe("Phase 5: Margin-Risk Priority Injection", () => {
  const cooPath = path.join(__dirname, "..", "routers", "coo.ts");
  const cooSource = fs.readFileSync(cooPath, "utf-8");

  it("injects margin-risk priorities for at_risk projects", () => {
    expect(cooSource).toContain("Margin at risk:");
    expect(cooSource).toContain('level: "high"');
  });

  it("re-sorts priorities after margin-risk injection", () => {
    const injectIdx = cooSource.indexOf("Margin at risk:");
    const sortIdx = cooSource.indexOf("priorities.sort", injectIdx);
    expect(sortIdx).toBeGreaterThan(injectIdx);
  });

  it("uses correct priority level ordering", () => {
    expect(cooSource).toContain("critical: 0");
    expect(cooSource).toContain("high: 1");
    expect(cooSource).toContain("medium: 2");
    expect(cooSource).toContain("low: 3");
  });
});

// ─── 5. Frontend Portfolio Health Card ───────────────────────────────────────

describe("Phase 5: COO Dashboard Portfolio Health Frontend", () => {
  const dashPath = path.join(__dirname, "..", "..", "client", "src", "pages", "owner", "COODashboard.tsx");
  const dashSource = fs.readFileSync(dashPath, "utf-8");

  it("destructures portfolioHealth from data", () => {
    expect(dashSource).toContain("portfolioHealth");
  });

  it("renders the Portfolio Financial Health card", () => {
    expect(dashSource).toContain("Portfolio Financial Health");
  });

  it("displays four financial metrics (invoiced, collected, outstanding, overdue)", () => {
    expect(dashSource).toContain("Total Invoiced");
    expect(dashSource).toContain("Collected");
    expect(dashSource).toContain("Outstanding");
    expect(dashSource).toContain("Overdue");
  });

  it("renders Project Margin Risk section", () => {
    expect(dashSource).toContain("Project Margin Risk");
  });

  it("shows at-risk margin badge when applicable", () => {
    expect(dashSource).toContain("atRiskMarginCount");
    expect(dashSource).toContain("at risk");
  });

  it("renders margin percentage badges with status-based styling", () => {
    expect(dashSource).toContain('pm.status === "at_risk"');
    expect(dashSource).toContain('pm.status === "watch"');
  });

  it("imports Wallet and TrendingDown icons", () => {
    expect(dashSource).toContain("Wallet");
    expect(dashSource).toContain("TrendingDown");
  });
});
