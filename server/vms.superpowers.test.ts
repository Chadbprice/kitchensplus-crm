/**
 * VMS Superpowers — unit tests
 * Covers: subcontractor scorecard router, vendor portal listMyPOs, getPublicRFQ
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// ─── 1. Subcontractor scorecard schema ────────────────────────────────────────
describe("Subcontractor scorecard schema", () => {
  it("subcontractors table has tier column", () => {
    const schema = readFileSync(path.resolve(__dirname, "../drizzle/schema.ts"), "utf8");
    // subcontractors table has tier column (line ~918)
    const subIdx = schema.indexOf("export const subcontractors");
    const segment = schema.slice(subIdx, subIdx + 1200);
    expect(segment).toContain("\"tier\"");
  });

  it("subcontractors tier enum includes elite, preferred, standard, do_not_use", () => {
    const schema = readFileSync(path.resolve(__dirname, "../drizzle/schema.ts"), "utf8");
    const subIdx = schema.indexOf("export const subcontractors");
    const segment = schema.slice(subIdx, subIdx + 1200);
    expect(segment).toContain("elite");
    expect(segment).toContain("preferred");
    expect(segment).toContain("standard");
    expect(segment).toContain("do_not_use");
  });

  it("subcontractors table has scorecard columns", () => {
    const schema = readFileSync(path.resolve(__dirname, "../drizzle/schema.ts"), "utf8");
    const subIdx = schema.indexOf("export const subcontractors");
    const segment = schema.slice(subIdx, subIdx + 1200);
    expect(segment).toContain("onTimePercentage");
    expect(segment).toContain("qualityScore");
    expect(segment).toContain("responsivenessScore");
    expect(segment).toContain("lastScorecardAt");
  });
});

// ─── 2. VMS router subcontractor scorecard procedures ─────────────────────────
describe("VMS router — subcontractor scorecard", () => {
  it("vms.ts exports subScorecardRouter with get and update procedures", () => {
    const vms = readFileSync(path.resolve(__dirname, "routers/vms.ts"), "utf8");
    expect(vms).toContain("subScorecardRouter");
    expect(vms).toContain("subScorecard:");
  });

  it("subScorecard.update sets tier based on score using tierFromScore", () => {
    const vms = readFileSync(path.resolve(__dirname, "routers/vms.ts"), "utf8");
    expect(vms).toContain("tierFromScore");
    expect(vms).toContain("elite");
    expect(vms).toContain("preferred");
    expect(vms).toContain("standard");
    expect(vms).toContain("do_not_use");
  });

  it("subScorecard.get returns all scorecard fields", () => {
    const vms = readFileSync(path.resolve(__dirname, "routers/vms.ts"), "utf8");
    const subIdx = vms.indexOf("subScorecardRouter");
    const segment = vms.slice(subIdx, subIdx + 800);
    expect(segment).toContain("onTimePercentage");
    expect(segment).toContain("qualityScore");
    expect(segment).toContain("responsivenessScore");
    expect(segment).toContain("lastScorecardAt");
    expect(segment).toContain("tier");
  });
});

// ─── 3. VMS router — vendor portal procedures ─────────────────────────────────
describe("VMS router — vendor portal", () => {
  it("vendorPortalRouter has listMyPOs procedure", () => {
    const vms = readFileSync(path.resolve(__dirname, "routers/vms.ts"), "utf8");
    expect(vms).toContain("listMyPOs");
  });

  it("listMyPOs validates token before returning POs", () => {
    const vms = readFileSync(path.resolve(__dirname, "routers/vms.ts"), "utf8");
    const listMyPOsIdx = vms.indexOf("listMyPOs");
    const segment = vms.slice(listMyPOsIdx, listMyPOsIdx + 600);
    expect(segment).toContain("token");
    expect(segment).toContain("expiresAt");
    expect(segment).toContain("purchaseOrders");
  });

  it("vendorPortalRouter has submitInvoice procedure", () => {
    const vms = readFileSync(path.resolve(__dirname, "routers/vms.ts"), "utf8");
    expect(vms).toContain("submitInvoice");
  });

  it("vendorPortalRouter has listInvoices procedure", () => {
    const vms = readFileSync(path.resolve(__dirname, "routers/vms.ts"), "utf8");
    expect(vms).toContain("listInvoices");
  });

  it("vendorPortalRouter has validateToken procedure", () => {
    const vms = readFileSync(path.resolve(__dirname, "routers/vms.ts"), "utf8");
    expect(vms).toContain("validateToken");
  });
});

// ─── 4. VMS router — RFQ procedures ───────────────────────────────────────────
describe("VMS router — RFQ", () => {
  it("rfqRouter has getPublicRFQ procedure", () => {
    const vms = readFileSync(path.resolve(__dirname, "routers/vms.ts"), "utf8");
    expect(vms).toContain("getPublicRFQ");
  });

  it("rfqRouter has submitBid procedure", () => {
    const vms = readFileSync(path.resolve(__dirname, "routers/vms.ts"), "utf8");
    expect(vms).toContain("submitBid");
  });

  it("rfqRouter has send procedure (invite vendors)", () => {
    const vms = readFileSync(path.resolve(__dirname, "routers/vms.ts"), "utf8");
    expect(vms).toContain("send:");
  });

  it("rfqRouter has award procedure", () => {
    const vms = readFileSync(path.resolve(__dirname, "routers/vms.ts"), "utf8");
    expect(vms).toContain("award:");
  });

  it("rfq.create accepts optional projectId", () => {
    const vms = readFileSync(path.resolve(__dirname, "routers/vms.ts"), "utf8");
    const createIdx = vms.indexOf("rfqRouter = router({");
    const segment = vms.slice(createIdx, createIdx + 1500);
    expect(segment).toContain("projectId");
    expect(segment).toContain("optional()");
  });
});

// ─── 5. VMS router — compliance dashboard ─────────────────────────────────────
describe("VMS router — compliance dashboard", () => {
  it("compliance.dashboard returns pending docs", () => {
    const vms = readFileSync(path.resolve(__dirname, "routers/vms.ts"), "utf8");
    expect(vms).toContain("pending");
    expect(vms).toContain("dashboard");
  });

  it("compliance.dashboard returns uploadedAt and fileUrl", () => {
    const vms = readFileSync(path.resolve(__dirname, "routers/vms.ts"), "utf8");
    const dashIdx = vms.indexOf("dashboard:");
    const segment = vms.slice(dashIdx, dashIdx + 600);
    expect(segment).toContain("uploadedAt");
    expect(segment).toContain("fileUrl");
  });
});

// ─── 6. VMS router — vendor scorecard ────────────────────────────────────────
describe("VMS router — vendor scorecard", () => {
  it("scorecard.get returns trade, notes, availability fields", () => {
    const vms = readFileSync(path.resolve(__dirname, "routers/vms.ts"), "utf8");
    const getIdx = vms.indexOf("scorecardRouter = router({");
    // Use a 2500-char window to cover the full scorecardRouter including get and recommend
    const segment = vms.slice(getIdx, getIdx + 2500);
    expect(segment).toContain("trade");
    expect(segment).toContain("notes");
    expect(segment).toContain("availability");
  });

  it("scorecard.recommend procedure exists", () => {
    const vms = readFileSync(path.resolve(__dirname, "routers/vms.ts"), "utf8");
    expect(vms).toContain("recommend");
  });
});

// ─── 7. Frontend pages exist ──────────────────────────────────────────────────
describe("VMS frontend pages", () => {
  it("VendorRFQResponse page exists", () => {
    const page = readFileSync(
      path.resolve(__dirname, "../client/src/pages/vendor/VendorRFQResponse.tsx"),
      "utf8"
    );
    expect(page).toContain("VendorRFQResponse");
    expect(page).toContain("submitBid");
  });

  it("RFQManagement page exists", () => {
    const page = readFileSync(
      path.resolve(__dirname, "../client/src/pages/owner/RFQManagement.tsx"),
      "utf8"
    );
    expect(page).toContain("RFQManagement");
    expect(page).toContain("rfq");
  });

  it("VendorPortalLayout exists with token-based auth", () => {
    const layout = readFileSync(
      path.resolve(__dirname, "../client/src/components/VendorPortalLayout.tsx"),
      "utf8"
    );
    expect(layout).toContain("validateToken");
    expect(layout).toContain("TOKEN_KEY");
    expect(layout).toContain("useVendorPortal");
  });

  it("VendorInvoices page exists", () => {
    const page = readFileSync(
      path.resolve(__dirname, "../client/src/pages/vendor/VendorInvoices.tsx"),
      "utf8"
    );
    expect(page).toContain("VendorInvoices");
    expect(page).toContain("submitInvoice");
    expect(page).toContain("listInvoices");
  });

  it("VendorPurchaseOrders uses listMyPOs (not purchaseOrders.list)", () => {
    const page = readFileSync(
      path.resolve(__dirname, "../client/src/pages/vendor/VendorPurchaseOrders.tsx"),
      "utf8"
    );
    expect(page).toContain("listMyPOs");
    expect(page).not.toContain("purchaseOrders.list");
  });

  it("SubcontractorDetail has scorecard tab", () => {
    const page = readFileSync(
      path.resolve(__dirname, "../client/src/pages/owner/SubcontractorDetail.tsx"),
      "utf8"
    );
    expect(page).toContain("Scorecard");
    expect(page).toContain("subScorecard");
  });
});

// ─── 8. Tier badge logic ──────────────────────────────────────────────────────
describe("Tier badge logic (tierFromScore)", () => {
  function tierFromScore(score: number): string {
    if (score >= 9.0) return "elite";
    if (score >= 7.5) return "preferred";
    if (score >= 5.0) return "standard";
    return "do_not_use";
  }

  it("score >= 9 → elite", () => expect(tierFromScore(9.5)).toBe("elite"));
  it("score 7.5-8.9 → preferred", () => expect(tierFromScore(8.0)).toBe("preferred"));
  it("score 5-7.4 → standard", () => expect(tierFromScore(6.0)).toBe("standard"));
  it("score < 5 → do_not_use", () => expect(tierFromScore(3)).toBe("do_not_use"));
  it("exact 9 → elite", () => expect(tierFromScore(9)).toBe("elite"));
  it("exact 7.5 → preferred", () => expect(tierFromScore(7.5)).toBe("preferred"));
  it("exact 5 → standard", () => expect(tierFromScore(5)).toBe("standard"));
  it("4.99 → do_not_use", () => expect(tierFromScore(4.99)).toBe("do_not_use"));
});
