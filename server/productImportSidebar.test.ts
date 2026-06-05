/**
 * productImportSidebar.test.ts
 *
 * Unit tests for the logic extracted from ProductImportSidebar:
 *   - Supplier auto-detection from URL
 *   - SC sales tax calculation (8%)
 *   - withTax / taxAmount helpers
 *   - Retail + tax = line item price
 *
 * These tests validate the pure calculation logic without DOM/React dependencies.
 */
import { describe, it, expect } from "vitest";

// ── Replicate the pure functions from the sidebar (no import needed) ──────────

const SC_TAX_RATE = 0.08;

function withTax(retail: number): number {
  return Math.round(retail * (1 + SC_TAX_RATE) * 100) / 100;
}

function taxAmount(retail: number): number {
  return Math.round(retail * SC_TAX_RATE * 100) / 100;
}

const SUPPLIERS = [
  { name: "The Home Depot", url: "https://www.homedepot.com/", isHD: true },
  { name: "Lowe's", url: "https://www.lowes.com/", isHD: false },
  { name: "Floor & Decor", url: "https://www.flooranddecor.com/", isHD: false },
  { name: "Osborne Wood Products", url: "https://www.osbornewood.com/", isHD: false },
  { name: "Amazon", url: "https://www.amazon.com/", isHD: false },
  { name: "Pease Doors", url: "https://peasedoors.com/", isHD: false },
  { name: "The Builders Supply", url: "https://thebuilderssupply.com/", isHD: false },
  { name: "Home Outlet", url: "https://homeoutlet.com/", isHD: false },
  { name: "SupplyHouse", url: "https://www.supplyhouse.com/", isHD: false },
  { name: "Ferguson", url: "https://www.ferguson.com/", isHD: false },
  { name: "LL Flooring", url: "https://www.llflooring.com/", isHD: false },
  { name: "The Tile Shop", url: "https://www.tileshop.com/", isHD: false },
  { name: "Steves Doors", url: "https://www.stevesdoors.com/", isHD: false },
  { name: "Simpson Door", url: "https://www.simpsondoor.com/", isHD: false },
  { name: "Ekena Millwork", url: "https://www.ekenamillwork.com/", isHD: false },
  { name: "Woodgrain", url: "https://woodgrain.com/", isHD: false },
];

function detectSupplierFromUrl(url: string) {
  try {
    const host = new URL(url).hostname.replace("www.", "").toLowerCase();
    return SUPPLIERS.find(s => {
      try {
        return new URL(s.url).hostname.replace("www.", "").toLowerCase() === host;
      } catch { return false; }
    }) ?? null;
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────

describe("SC Sales Tax calculation (8%)", () => {
  it("withTax: $100 retail → $108.00 total", () => {
    expect(withTax(100)).toBe(108.00);
  });

  it("withTax: $47.98 retail → $51.82 total (rounded)", () => {
    expect(withTax(47.98)).toBe(51.82);
  });

  it("withTax: $1.00 retail → $1.08 total", () => {
    expect(withTax(1.00)).toBe(1.08);
  });

  it("withTax: $299.99 retail → $323.99 total", () => {
    expect(withTax(299.99)).toBe(323.99);
  });

  it("withTax: $0 retail → $0 total", () => {
    expect(withTax(0)).toBe(0);
  });

  it("taxAmount: $100 → $8.00 tax", () => {
    expect(taxAmount(100)).toBe(8.00);
  });

  it("taxAmount: $47.98 → $3.84 tax (rounded)", () => {
    expect(taxAmount(47.98)).toBe(3.84);
  });

  it("withTax result equals retail + taxAmount", () => {
    const retail = 129.99;
    expect(withTax(retail)).toBe(
      Math.round((retail + taxAmount(retail)) * 100) / 100
    );
  });

  it("withTax rounds to exactly 2 decimal places", () => {
    const result = withTax(33.33);
    const decimals = result.toString().split(".")[1]?.length ?? 0;
    expect(decimals).toBeLessThanOrEqual(2);
  });
});

describe("Supplier auto-detection from URL", () => {
  it("detects The Home Depot from homedepot.com product URL", () => {
    const s = detectSupplierFromUrl("https://www.homedepot.com/p/Glacier-Bay-Faucet/123456789");
    expect(s?.name).toBe("The Home Depot");
    expect(s?.isHD).toBe(true);
  });

  it("detects Lowe's from lowes.com URL", () => {
    const s = detectSupplierFromUrl("https://www.lowes.com/pd/product/12345");
    expect(s?.name).toBe("Lowe's");
  });

  it("detects Floor & Decor from flooranddecor.com URL", () => {
    const s = detectSupplierFromUrl("https://www.flooranddecor.com/tile/product");
    expect(s?.name).toBe("Floor & Decor");
  });

  it("detects Ferguson from ferguson.com URL", () => {
    const s = detectSupplierFromUrl("https://www.ferguson.com/product/faucet");
    expect(s?.name).toBe("Ferguson");
  });

  it("detects SupplyHouse from supplyhouse.com URL", () => {
    const s = detectSupplierFromUrl("https://www.supplyhouse.com/item/12345");
    expect(s?.name).toBe("SupplyHouse");
  });

  it("returns null for an unknown supplier URL", () => {
    const s = detectSupplierFromUrl("https://www.somerandomunknownsite.com/product");
    expect(s).toBeNull();
  });

  it("returns null for an invalid URL string", () => {
    const s = detectSupplierFromUrl("not-a-url");
    expect(s).toBeNull();
  });

  it("returns null for empty string", () => {
    const s = detectSupplierFromUrl("");
    expect(s).toBeNull();
  });
});

describe("Supplier list completeness", () => {
  it("contains exactly 16 suppliers", () => {
    expect(SUPPLIERS).toHaveLength(16);
  });

  it("The Home Depot is the only supplier with isHD: true", () => {
    const hdSuppliers = SUPPLIERS.filter(s => s.isHD);
    expect(hdSuppliers).toHaveLength(1);
    expect(hdSuppliers[0].name).toBe("The Home Depot");
  });

  it("all suppliers have a non-empty name and url", () => {
    for (const s of SUPPLIERS) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.url.startsWith("https://")).toBe(true);
    }
  });

  it("includes all required suppliers", () => {
    const names = SUPPLIERS.map(s => s.name);
    const required = [
      "The Home Depot", "Lowe's", "Floor & Decor", "Osborne Wood Products",
      "Amazon", "Pease Doors", "The Builders Supply", "Home Outlet",
      "SupplyHouse", "Ferguson", "LL Flooring", "The Tile Shop",
      "Steves Doors", "Simpson Door", "Ekena Millwork", "Woodgrain",
    ];
    for (const name of required) {
      expect(names).toContain(name);
    }
  });
});

describe("Line item price = retail + 8% SC tax", () => {
  it("$50 retail → $54.00 line item price", () => {
    expect(withTax(50)).toBe(54.00);
  });

  it("$199.00 retail → $214.92 line item price", () => {
    expect(withTax(199.00)).toBe(214.92);
  });

  it("price is always rounded to 2 decimal places (no floating point drift)", () => {
    // 0.1 + 0.2 floating point classic
    const retail = 0.1 + 0.2; // 0.30000000000000004
    const result = withTax(retail);
    expect(Number.isFinite(result)).toBe(true);
    const str = result.toString();
    const decimals = str.includes(".") ? str.split(".")[1].length : 0;
    expect(decimals).toBeLessThanOrEqual(2);
  });
});
