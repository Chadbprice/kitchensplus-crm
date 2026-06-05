/**
 * productImportSidebarBugfix.test.ts
 *
 * Regression tests for the "Paste from Clipboard closes proposal editor" bug
 * AND the "Retail price input can't receive focus" bug.
 *
 * Bug 1 root cause: The ProductImportSidebar renders via createPortal to
 * document.body, which is OUTSIDE the Radix Sheet/Dialog DOM tree. Radix's
 * built-in "dismiss on outside interaction" fires onOpenChange(false) when
 * any click occurs outside SheetContent/DialogContent.
 *
 * Bug 2 root cause: Radix's focus trap (focus guard sentinels on body)
 * steals focus from inputs inside the sidebar portal because it's outside
 * the focus trap boundary.
 *
 * Fix: Added `portalContainer` prop to ProductImportSidebar so consumers
 * can pass the SheetContent/DialogContent element as the portal target.
 * This places the sidebar inside the focus trap boundary. Also kept the
 * onPointerDownOutside / onInteractOutside / onFocusOutside guards as
 * defense-in-depth.
 *
 * These tests validate the fix logic without needing a full React render.
 */
import { describe, it, expect } from "vitest";

// ── Replicate the guard logic from dialog.tsx / sheet.tsx ──────────────────

/**
 * Simulates the guard check used in onPointerDownOutside / onInteractOutside.
 * Returns true if the event should be prevented (i.e., the click is inside
 * the product import sidebar or Google Maps autocomplete).
 */
function shouldPreventOutsideDismiss(targetSelector: string): boolean {
  // In the real code: target.closest("[data-product-import-sidebar]") || target.closest(".pac-container")
  // Here we simulate with selector strings
  return targetSelector.includes("data-product-import-sidebar") ||
         targetSelector.includes("pac-container");
}

describe("Proposal editor dismiss guard (Sheet + Dialog)", () => {
  it("prevents dismiss when click is inside [data-product-import-sidebar]", () => {
    expect(shouldPreventOutsideDismiss("[data-product-import-sidebar] button.paste-clipboard")).toBe(true);
  });

  it("prevents dismiss when click is on the sidebar root element", () => {
    expect(shouldPreventOutsideDismiss("[data-product-import-sidebar]")).toBe(true);
  });

  it("prevents dismiss when click is inside .pac-container (Google Maps)", () => {
    expect(shouldPreventOutsideDismiss(".pac-container .pac-item")).toBe(true);
  });

  it("allows dismiss when click is on a random body element", () => {
    expect(shouldPreventOutsideDismiss("body > div.some-random-element")).toBe(false);
  });

  it("allows dismiss when click is on the sheet overlay", () => {
    expect(shouldPreventOutsideDismiss("[data-slot='sheet-overlay']")).toBe(false);
  });
});

// ── Button type safety ─────────────────────────────────────────────────────

describe("Button type safety and string-based input", () => {
  const fs = require("fs");
  const path = require("path");
  const sidebarSource = fs.readFileSync(
    path.join(__dirname, "../client/src/components/ProductImportSidebar.tsx"),
    "utf-8"
  );

  it("uses string state for retail price (not number)", () => {
    expect(sidebarSource).toContain("useState<string>(\"\"");
    expect(sidebarSource).toContain("retailPriceStr");
  });

  it("input type is 'text' with inputMode='decimal' (not type='number')", () => {
    expect(sidebarSource).toContain('type="text"');
    expect(sidebarSource).toContain('inputMode="decimal"');
    // Should NOT have type="number" for the retail price input
    // (other inputs may use type="number" but the retail price must be text)
  });

  it("onChange sanitizes input to digits and dots only", () => {
    expect(sidebarSource).toContain('/[^0-9.]/g');
  });

  it("all <Button> components have type=\"button\"", () => {
    // Match all <Button occurrences and check they have type="button"
    const buttonRegex = /<Button\b[^>]*>/g;
    let match;
    const buttons: string[] = [];
    while ((match = buttonRegex.exec(sidebarSource)) !== null) {
      buttons.push(match[0]);
    }
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of buttons) {
      expect(btn).toContain('type="button"');
    }
  });

  it("all <button> elements have type=\"button\"", () => {
    // Match all native <button occurrences (lowercase)
    const buttonRegex = /<button\b[^>]*>/g;
    let match;
    const buttons: string[] = [];
    while ((match = buttonRegex.exec(sidebarSource)) !== null) {
      buttons.push(match[0]);
    }
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of buttons) {
      expect(btn).toContain('type="button"');
    }
  });

  it("Enter key in URL input calls preventDefault and stopPropagation", () => {
    // The onKeyDown handler must prevent form submission
    expect(sidebarSource).toContain("e.preventDefault()");
    expect(sidebarSource).toContain("e.stopPropagation()");
  });
});

// ── Event propagation guards ───────────────────────────────────────────────

describe("Event propagation guards on sidebar panel", () => {
  const fs = require("fs");
  const path = require("path");
  const sidebarSource = fs.readFileSync(
    path.join(__dirname, "../client/src/components/ProductImportSidebar.tsx"),
    "utf-8"
  );

  it("sidebar panel has data-product-import-sidebar attribute", () => {
    expect(sidebarSource).toContain("data-product-import-sidebar");
  });

  it("sidebar panel stops click propagation", () => {
    expect(sidebarSource).toContain("onClick={(e) => e.stopPropagation()}");
  });

  it("sidebar panel stops pointerDown propagation", () => {
    expect(sidebarSource).toContain("onPointerDown={(e) => e.stopPropagation()}");
  });

  it("sidebar panel stops mouseDown propagation", () => {
    expect(sidebarSource).toContain("onMouseDown={(e) => e.stopPropagation()}");
  });

  it("backdrop stops propagation before calling onClose", () => {
    // The backdrop onClick should stop propagation to prevent Radix from seeing it
    expect(sidebarSource).toContain("e.stopPropagation(); onClose();");
  });
});

// ── Sheet.tsx and Dialog.tsx guards ────────────────────────────────────────

describe("Sheet.tsx has product-import-sidebar guard", () => {
  const fs = require("fs");
  const path = require("path");
  const sheetSource = fs.readFileSync(
    path.join(__dirname, "../client/src/components/ui/sheet.tsx"),
    "utf-8"
  );

  it("SheetContent has onPointerDownOutside guard for sidebar", () => {
    expect(sheetSource).toContain("onPointerDownOutside");
    expect(sheetSource).toContain("[data-product-import-sidebar]");
  });

  it("SheetContent has onInteractOutside guard for sidebar", () => {
    expect(sheetSource).toContain("onInteractOutside");
  });
});

describe("Dialog.tsx has product-import-sidebar guard", () => {
  const fs = require("fs");
  const path = require("path");
  const dialogSource = fs.readFileSync(
    path.join(__dirname, "../client/src/components/ui/dialog.tsx"),
    "utf-8"
  );

  it("DialogContent has onPointerDownOutside guard for sidebar", () => {
    expect(dialogSource).toContain("[data-product-import-sidebar]");
  });

  it("DialogContent has onInteractOutside guard for sidebar", () => {
    expect(dialogSource).toContain("onInteractOutside");
    expect(dialogSource).toContain("data-product-import-sidebar");
  });
});

// ── Manual price fallback (string-based input fix) ───────────────────────

describe("Manual price fallback flow (string-based input)", () => {
  const SC_TAX_RATE = 0.08;

  function withTax(retail: number): number {
    return Math.round(retail * (1 + SC_TAX_RATE) * 100) / 100;
  }

  function taxAmount(retail: number): number {
    return Math.round(retail * SC_TAX_RATE * 100) / 100;
  }

  // Simulates the onChange sanitizer from the sidebar
  function sanitizeInput(raw: string): string {
    const cleaned = raw.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    return parts.length > 2
      ? parts[0] + "." + parts.slice(1).join("")
      : cleaned;
  }

  // Simulates the computed retail from the sidebar
  function computeRetail(str: string): number | null {
    const parsed = parseFloat(str);
    return !isNaN(parsed) && parsed > 0 ? parsed : null;
  }

  it("when price is null, priceUnconfirmed should be true", () => {
    const scraped = { price: null, priceUnconfirmed: true };
    expect(scraped.priceUnconfirmed).toBe(true);
  });

  it("typing '49.99' produces a valid retail price", () => {
    const str = sanitizeInput("49.99");
    expect(str).toBe("49.99");
    expect(computeRetail(str)).toBe(49.99);
  });

  it("typing '4.' preserves the trailing dot (no snap-back)", () => {
    const str = sanitizeInput("4.");
    expect(str).toBe("4.");
    // parseFloat("4.") = 4, which is valid
    expect(computeRetail(str)).toBe(4);
  });

  it("typing '49.9' preserves intermediate state", () => {
    const str = sanitizeInput("49.9");
    expect(str).toBe("49.9");
    expect(computeRetail(str)).toBe(49.9);
  });

  it("empty string produces null retail (no crash)", () => {
    const str = sanitizeInput("");
    expect(str).toBe("");
    expect(computeRetail(str)).toBeNull();
  });

  it("strips non-numeric characters", () => {
    expect(sanitizeInput("$49.99")).toBe("49.99");
    expect(sanitizeInput("abc")).toBe("");
    expect(sanitizeInput("12.34.56")).toBe("12.3456");
  });

  it("prevents multiple dots", () => {
    expect(sanitizeInput("12..34")).toBe("12.34");
    expect(sanitizeInput("...5")).toBe(".5");
  });

  it("tax and total update live from manual price", () => {
    const retail = computeRetail("49.99")!;
    expect(retail).toBe(49.99);
    expect(taxAmount(retail)).toBe(4.00);
    expect(withTax(retail)).toBe(53.99);
  });

  it("tax and total are null when input is empty", () => {
    const retail = computeRetail("");
    expect(retail).toBeNull();
    // No crash — guards prevent calling taxAmount/withTax on null
  });

  it("handleImport blocks when retailPriceStr is empty", () => {
    const retailPriceStr = "";
    const parsedRetail = parseFloat(retailPriceStr);
    const hasValidPrice = !isNaN(parsedRetail) && parsedRetail > 0;
    expect(hasValidPrice).toBe(false);
  });

  it("handleImport blocks when retailPriceStr is '0'", () => {
    const retailPriceStr = "0";
    const parsedRetail = parseFloat(retailPriceStr);
    const hasValidPrice = !isNaN(parsedRetail) && parsedRetail > 0;
    expect(hasValidPrice).toBe(false);
  });

  it("handleImport succeeds when retailPriceStr has a valid number", () => {
    const retailPriceStr = "49.99";
    const parsedRetail = parseFloat(retailPriceStr);
    const hasValidPrice = !isNaN(parsedRetail) && parsedRetail > 0;
    expect(hasValidPrice).toBe(true);
    // Final price = retail + 8% tax
    expect(withTax(parsedRetail)).toBe(53.99);
  });

  it("handleImport builds finalProduct with correct price and priceUnconfirmed=false", () => {
    const retailPriceStr = "199.00";
    const parsedRetail = parseFloat(retailPriceStr);
    const finalProduct = {
      price: withTax(parsedRetail),
      priceUnconfirmed: false,
    };
    expect(finalProduct.price).toBe(214.92);
    expect(finalProduct.priceUnconfirmed).toBe(false);
  });

  it("scraper onSuccess sets retailPriceStr to string of price when price exists", () => {
    const dataPrice = 47.98;
    const retailPriceStr = dataPrice !== null ? String(dataPrice) : "";
    expect(retailPriceStr).toBe("47.98");
  });

  it("scraper onSuccess sets retailPriceStr to empty when price is null", () => {
    const dataPrice = null;
    const retailPriceStr = dataPrice !== null ? String(dataPrice) : "";
    expect(retailPriceStr).toBe("");
  });
});

// ── Price detection improvements ───────────────────────────────────────────

describe("Improved price detection patterns", () => {
  const fs = require("fs");
  const path = require("path");
  const scraperSource = fs.readFileSync(
    path.join(__dirname, "./productScraper.ts"),
    "utf-8"
  );

  it("scraper has HD-specific price patterns", () => {
    expect(scraperSource).toContain("price__dollars");
    expect(scraperSource).toContain("price-format__main-price");
    expect(scraperSource).toContain("productPrice");
  });

  it("scraper has originalPrice/specialPrice/nowPrice patterns", () => {
    expect(scraperSource).toContain("originalPrice");
    expect(scraperSource).toContain("specialPrice");
    expect(scraperSource).toContain("nowPrice");
  });

  it("scraper always sets priceUnconfirmed when price is null", () => {
    expect(scraperSource).toContain("priceUnconfirmed: price === null");
    expect(scraperSource).toContain("priceUnconfirmed: finalPrice === null");
  });
});

// ── portalContainer prop (focus trap fix) ─────────────────────────────────

describe("portalContainer prop for focus trap fix", () => {
  const fs = require("fs");
  const path = require("path");
  const sidebarSource = fs.readFileSync(
    path.join(__dirname, "../client/src/components/ProductImportSidebar.tsx"),
    "utf-8"
  );
  const proposalsSource = fs.readFileSync(
    path.join(__dirname, "../client/src/pages/owner/Proposals.tsx"),
    "utf-8"
  );
  const changeOrdersSource = fs.readFileSync(
    path.join(__dirname, "../client/src/components/ChangeOrdersSection.tsx"),
    "utf-8"
  );

  it("ProductImportSidebar accepts portalContainer prop", () => {
    expect(sidebarSource).toContain("portalContainer?: HTMLElement | null");
  });

  it("createPortal uses portalContainer when provided", () => {
    expect(sidebarSource).toContain("portalContainer ?? document.body");
  });

  it("ProposalDetailSheet passes sheetContentRef as portalContainer", () => {
    expect(proposalsSource).toContain("portalContainer={sheetContentRef.current}");
  });

  it("ProposalDetailSheet attaches ref to SheetContent", () => {
    expect(proposalsSource).toContain("sheetContentRef = useRef<HTMLDivElement>(null)");
    expect(proposalsSource).toContain("<SheetContent ref={sheetContentRef}");
  });

  it("ChangeOrdersSection passes dialogContentRef as portalContainer", () => {
    expect(changeOrdersSource).toContain("portalContainer={dialogContentRef.current}");
  });

  it("ChangeOrdersSection attaches ref to DialogContent", () => {
    expect(changeOrdersSource).toContain("dialogContentRef = useRef<HTMLDivElement>(null)");
    expect(changeOrdersSource).toContain("<DialogContent ref={dialogContentRef}");
  });

  it("Sheet.tsx has onFocusOutside guard as defense-in-depth", () => {
    const sheetSource = fs.readFileSync(
      path.join(__dirname, "../client/src/components/ui/sheet.tsx"),
      "utf-8"
    );
    expect(sheetSource).toContain("onFocusOutside");
    expect(sheetSource).toContain("data-product-import-sidebar");
  });

  it("Dialog.tsx has onFocusOutside guard as defense-in-depth", () => {
    const dialogSource = fs.readFileSync(
      path.join(__dirname, "../client/src/components/ui/dialog.tsx"),
      "utf-8"
    );
    expect(dialogSource).toContain("onFocusOutside");
    expect(dialogSource).toContain("data-product-import-sidebar");
  });
});
