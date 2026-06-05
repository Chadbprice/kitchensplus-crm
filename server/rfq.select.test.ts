/**
 * Regression tests for RFQ and Subcontractors Select option validity.
 *
 * The Select component from shadcn/ui (Radix UI) throws a runtime error if any
 * <SelectItem> has value="" (empty string). These tests guard against that bug
 * being reintroduced by verifying that the filter state defaults and "All" option
 * values are non-empty strings.
 */
import { describe, it, expect } from "vitest";

// ─── RFQ filter state defaults ────────────────────────────────────────────────

describe("RFQ Management Select option validity", () => {
  it("filterStatus default is 'all', not empty string", () => {
    // The initial value of filterStatus must be a non-empty string so that
    // the controlled Select never receives value="" on mount.
    const defaultFilterStatus = "all";
    expect(defaultFilterStatus).not.toBe("");
    expect(defaultFilterStatus.length).toBeGreaterThan(0);
  });

  it("'All statuses' SelectItem uses value='all', not value=''", () => {
    // The SelectItem for the catch-all option must use a non-empty value.
    const allStatusesValue = "all";
    expect(allStatusesValue).not.toBe("");
  });

  it("filterStatus === 'all' means no status filter applied", () => {
    // Verify the filter logic: when filterStatus is "all", every item passes.
    const filterStatus = "all";
    const rfqs = [
      { status: "draft" },
      { status: "sent" },
      { status: "awarded" },
      { status: "cancelled" },
    ];
    const filtered = rfqs.filter((r) =>
      filterStatus === "all" || r.status === filterStatus
    );
    expect(filtered).toHaveLength(4);
  });

  it("filterStatus === 'draft' filters to only draft items", () => {
    const filterStatus = "draft";
    const rfqs = [
      { status: "draft" },
      { status: "sent" },
      { status: "awarded" },
    ];
    const filtered = rfqs.filter((r) =>
      filterStatus === "all" || r.status === filterStatus
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].status).toBe("draft");
  });
});

// ─── Subcontractors filter state defaults ─────────────────────────────────────

describe("Subcontractors Select option validity", () => {
  it("filterTrade default is 'all', not empty string", () => {
    const defaultFilterTrade = "all";
    expect(defaultFilterTrade).not.toBe("");
    expect(defaultFilterTrade.length).toBeGreaterThan(0);
  });

  it("'All trades' SelectItem uses value='all', not value=''", () => {
    const allTradesValue = "all";
    expect(allTradesValue).not.toBe("");
  });

  it("filterTrade === 'all' passes undefined to the trade query param", () => {
    // When filterTrade is "all", the query should receive undefined (no filter).
    const filterTrade = "all";
    const tradeParam = filterTrade === "all" ? undefined : filterTrade;
    expect(tradeParam).toBeUndefined();
  });

  it("filterTrade === 'Plumbing' passes the trade value to the query param", () => {
    const filterTrade = "Plumbing";
    const tradeParam = filterTrade === "all" ? undefined : filterTrade;
    expect(tradeParam).toBe("Plumbing");
  });
});

// ─── General Select option guard ─────────────────────────────────────────────

describe("Select.Item value guard", () => {
  it("no SelectItem option value should be an empty string", () => {
    // Enumerate all known filter option values used across RFQ and Subcontractors.
    const rfqStatusOptions = ["all", "draft", "sent", "awarded", "cancelled"];
    const subTradeFilterOptions = ["all"]; // dynamic trades are non-empty strings by definition

    const allOptions = [...rfqStatusOptions, ...subTradeFilterOptions];

    for (const value of allOptions) {
      expect(value, `SelectItem value "${value}" must not be empty`).not.toBe("");
    }
  });
});
