/**
 * ProductImportSidebar
 *
 * Single-panel 440px import tool rendered via React Portal at z-[200].
 *
 * Workflow:
 *   1. Select supplier (activates it, shows "Open in New Tab" button)
 *   2. Click "Open [Supplier] in New Tab" → browse to product
 *   3. Copy product URL in browser
 *   4. Return to CRM → click "Paste from Clipboard" (or paste manually)
 *   5. Scrape auto-triggers → shows Retail / SC Tax 8% / Total breakdown
 *   6. Click "Add to Line Item" → retail + 8% tax passed as unit price
 *
 * SC Sales Tax: 8% flat on all products.
 * Line item price = Math.round(retail * 1.08 * 100) / 100
 */
import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  X, ExternalLink, ShoppingCart, Loader2, Search, Package,
  ImageOff, Store, AlertCircle, Globe, Clipboard, AlertTriangle,
} from "lucide-react";

const GOLD = "#BF9A3B";
const SC_TAX_RATE = 0.08;

function withTax(retail: number): number {
  return Math.round(retail * (1 + SC_TAX_RATE) * 100) / 100;
}

function taxAmount(retail: number): number {
  return Math.round(retail * SC_TAX_RATE * 100) / 100;
}

interface Supplier {
  name: string;
  url: string;
  isHD: boolean;
}

const HOME_DEPOT: Supplier = {
  name: "The Home Depot",
  url: "https://www.homedepot.com/",
  isHD: true,
};

const SUPPLIERS: Supplier[] = [
  HOME_DEPOT,
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

export type ImportedProduct = {
  title: string;
  imageUrl: string;
  price: number | null;
  description: string;
  sourceUrl: string;
  sourceName: string;
  priceUnconfirmed?: boolean;
};

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (product: ImportedProduct) => void;
  /** If set, the sidebar opens pre-focused on this supplier */
  defaultSupplier?: string;
  /**
   * Portal target element. When the sidebar is rendered inside a Radix
   * Sheet/Dialog, pass the SheetContent element so the sidebar lives
   * inside the focus-trap boundary and inputs can receive focus.
   * Falls back to document.body.
   */
  portalContainer?: HTMLElement | null;
}

/** Detect which supplier a URL belongs to, if any */
function detectSupplierFromUrl(url: string): Supplier | null {
  try {
    const host = new URL(url).hostname.replace("www.", "").toLowerCase();
    return SUPPLIERS.find(s => {
      try {
        return new URL(s.url).hostname.replace("www.", "").toLowerCase() === host;
      } catch { return false; }
    }) ?? null;
  } catch { return null; }
}

/** Map raw tRPC / fetch error messages to user-friendly strings */
function friendlyError(rawMessage: string): string {
  if (/blocked|403|bot|challenge|captcha/i.test(rawMessage)) {
    return "This supplier's website blocked the automatic import. Open the product page in a new tab, copy the URL, and paste it here.";
  }
  if (/429|rate.?limit/i.test(rawMessage)) {
    return "Too many requests — please wait a moment and try again.";
  }
  if (/timeout|timed out/i.test(rawMessage)) {
    return "The request timed out. The supplier's site may be slow — try again.";
  }
  if (/CORS|Failed to fetch|NetworkError/i.test(rawMessage)) {
    return "Network error — the server could not reach the supplier's website.";
  }
  if (/HTTP 4\d\d|HTTP 5\d\d/i.test(rawMessage)) {
    return `The supplier's website returned an error. Try opening the product page directly.`;
  }
  return rawMessage || "Could not import product. Try opening the product page in a new tab.";
}

export default function ProductImportSidebar({ open, onClose, onImport, defaultSupplier, portalContainer }: Props) {
  const [activeSupplier, setActiveSupplier] = useState<Supplier | null>(
    defaultSupplier ? (SUPPLIERS.find(s => s.name === defaultSupplier) ?? null) : null
  );
  const [productUrl, setProductUrl] = useState("");
  const [scraped, setScraped] = useState<ImportedProduct | null>(null);
  // retailPrice is a string so the user can type freely ("4.", "49.9", etc.)
  // Only parsed to number when computing tax or on import.
  const [retailPriceStr, setRetailPriceStr] = useState<string>("");
  const [isFetching, setIsFetching] = useState(false);

  // When the panel opens with a defaultSupplier, pre-select it
  useEffect(() => {
    if (open && defaultSupplier) {
      const s = SUPPLIERS.find(sup => sup.name === defaultSupplier);
      if (s) setActiveSupplier(s);
    }
    if (!open) {
      setScraped(null);
      setProductUrl("");
      setRetailPriceStr("");
      setIsFetching(false);
    }
  }, [open, defaultSupplier]);

  const scrapeServer = trpc.estimates.scrapeProduct.useMutation({
    onSuccess: (data) => {
      const sourceName = activeSupplier?.name
        ?? detectSupplierFromUrl(productUrl)?.name
        ?? (() => { try { return new URL(productUrl).hostname.replace("www.", ""); } catch { return "Unknown"; } })();
      const retail = data.price ?? null;
      setRetailPriceStr(retail !== null ? String(retail) : "");
      setScraped({
        ...data,
        price: retail !== null ? withTax(retail) : null,
        sourceName,
        priceUnconfirmed: data.priceUnconfirmed ?? retail === null,
      });
      setIsFetching(false);
    },
    onError: (e) => {
      toast.error(friendlyError(e.message));
      setIsFetching(false);
    },
  });

  const triggerScrape = useCallback((url: string) => {
    let normalized = url.trim();
    if (!normalized) { toast.warning("Paste a product URL first"); return; }
    if (!normalized.startsWith("http")) normalized = "https://" + normalized;
    setProductUrl(normalized);
    setScraped(null);
    setRetailPriceStr("");
    setIsFetching(true);

    // Auto-detect supplier
    const detected = detectSupplierFromUrl(normalized);
    if (detected && (!activeSupplier || activeSupplier.name !== detected.name)) {
      setActiveSupplier(detected);
    }

    scrapeServer.mutate({ url: normalized });
  }, [activeSupplier, scrapeServer]);

  const handleFetch = useCallback(() => {
    triggerScrape(productUrl);
  }, [productUrl, triggerScrape]);

  async function handlePasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = text.trim();
      if (!trimmed) { toast.info("Clipboard is empty"); return; }
      // Check if it looks like a URL
      const looksLikeUrl = trimmed.startsWith("http") || trimmed.includes(".");
      if (!looksLikeUrl) {
        toast.warning("Clipboard content doesn't look like a URL — paste it manually");
        setProductUrl(trimmed);
        return;
      }
      setProductUrl(trimmed);
      // Auto-detect supplier
      const detected = detectSupplierFromUrl(trimmed);
      if (detected) setActiveSupplier(detected);
      // Auto-trigger scrape
      triggerScrape(trimmed);
    } catch {
      toast.info("Clipboard access denied — paste the URL manually into the field below");
    }
  }

  function handleImport() {
    if (!scraped) return;
    // Parse the current retail string to get the final number
    const parsedRetail = parseFloat(retailPriceStr);
    const hasValidPrice = !isNaN(parsedRetail) && parsedRetail > 0;
    if (!hasValidPrice) {
      toast.warning("Please enter the retail price before adding to the proposal.");
      return;
    }
    // Build the final product with the correct price (retail + 8% tax)
    const finalProduct: ImportedProduct = {
      ...scraped,
      price: withTax(parsedRetail),
      priceUnconfirmed: false,
    };
    onImport(finalProduct);
    setScraped(null);
    setRetailPriceStr("");
    setProductUrl("");
    toast.success("Product added as line item!");
  }

  function selectSupplier(s: Supplier) {
    setActiveSupplier(s);
    setScraped(null);
    setRetailPriceStr("");
    setProductUrl("");
  }

  if (!open) return null;

  // Computed tax breakdown — parse the string each render (cheap, always in sync)
  const parsedRetail = parseFloat(retailPriceStr);
  const currentRetail = !isNaN(parsedRetail) && parsedRetail > 0 ? parsedRetail : null;
  const computedTax = currentRetail !== null ? taxAmount(currentRetail) : null;
  const computedTotal = currentRetail !== null ? withTax(currentRetail) : null;

  const panel = (
    <div
      data-product-import-sidebar
      className="fixed inset-0 flex items-stretch"
      style={{ zIndex: 200, pointerEvents: "none" }}
    >
      {/* Transparent backdrop — click to close sidebar only, not the parent Sheet/Dialog */}
      <div
        className="absolute inset-0"
        style={{ pointerEvents: "auto" }}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      />

      {/* Single-panel sidebar — anchored to the right edge */}
      <div
        data-product-import-sidebar
        className="absolute inset-y-0 right-0 flex flex-col shadow-2xl overflow-hidden"
        style={{
          width: "440px",
          pointerEvents: "auto",
          background: "#1A1B17",
          borderLeft: "1px solid rgba(191,154,59,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-border/40 shrink-0"
          style={{ background: "#252620" }}
        >
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
            <span className="font-semibold text-sm" style={{ color: "#F5F0E8" }}>
              Import Product
            </span>
            {activeSupplier && (
              <Badge
                className="text-[10px] px-1.5 py-0 h-4"
                style={{ background: `${GOLD}20`, color: GOLD, border: `1px solid ${GOLD}40` }}
              >
                {activeSupplier.name}
              </Badge>
            )}
          </div>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Supplier grid */}
          <div className="px-4 pt-4 pb-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Select Supplier
            </p>
            <div className="grid grid-cols-2 gap-2">
              {/* Home Depot — featured */}
              <button
                type="button"
                className="col-span-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all border"
                style={{
                  background: activeSupplier?.isHD ? `${GOLD}18` : "#2A2B26",
                  borderColor: activeSupplier?.isHD ? `${GOLD}70` : "transparent",
                }}
                onClick={() => selectSupplier(HOME_DEPOT)}
              >
                <div
                  className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "#F96302" }}
                >
                  <Store className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">The Home Depot</p>
                  <p className="text-[10px] text-muted-foreground">Open in new tab → copy URL → paste below</p>
                </div>
                {activeSupplier?.isHD && (
                  <div className="h-2 w-2 rounded-full shrink-0" style={{ background: GOLD }} />
                )}
              </button>

              {/* Other suppliers */}
              {SUPPLIERS.filter(s => !s.isHD).map(s => (
                <button
                  type="button"
                  key={s.name}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-all border"
                  style={{
                    background: activeSupplier?.name === s.name ? "#2E2F2A" : "transparent",
                    borderColor: activeSupplier?.name === s.name ? `${GOLD}40` : "transparent",
                  }}
                  onClick={() => selectSupplier(s)}
                >
                  <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-xs text-foreground truncate">{s.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Open in New Tab + instruction */}
          {activeSupplier && (
            <div className="px-4 pb-4 space-y-2">
              <Button
                type="button"
                className="w-full h-9 gap-2 font-semibold text-sm"
                style={{ background: GOLD, color: "#1A1B17" }}
                onClick={() => window.open(activeSupplier.url, "_blank")}
              >
                <ExternalLink className="h-4 w-4" />
                Open {activeSupplier.name} in New Tab
              </Button>
              <p className="text-[11px] text-center text-muted-foreground">
                Browse to a product → copy the URL → paste it below
              </p>
            </div>
          )}

          {/* URL paste + clipboard + fetch */}
          <div className="px-4 pb-4 space-y-2 border-t border-border/20 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Paste Product URL
            </p>

            {/* Clipboard paste button */}
            <Button
              type="button"
              variant="outline"
              className="w-full h-8 gap-2 text-xs"
              style={{ borderColor: `${GOLD}40`, color: GOLD }}
              onClick={handlePasteFromClipboard}
              disabled={isFetching}
            >
              <Clipboard className="h-3.5 w-3.5" />
              Paste from Clipboard
            </Button>

            {/* Manual URL input + search */}
            <div className="flex gap-2">
              <Input
                className="h-8 text-xs flex-1"
                placeholder="https://www.homedepot.com/p/..."
                value={productUrl}
                onChange={e => {
                  setProductUrl(e.target.value);
                  const detected = detectSupplierFromUrl(e.target.value);
                  if (detected) setActiveSupplier(detected);
                }}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); handleFetch(); } }}
              />
              <Button
                type="button"
                size="sm"
                className="h-8 px-3 shrink-0"
                style={{ background: GOLD, color: "#1A1B17" }}
                disabled={isFetching}
                onClick={handleFetch}
              >
                {isFetching
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Search className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {/* Loading */}
          {isFetching && (
            <div className="px-4 py-6 flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: GOLD }} />
              <p className="text-xs">Fetching product details…</p>
              <p className="text-[10px] text-muted-foreground/60">This may take a few seconds</p>
            </div>
          )}

          {/* Product preview */}
          {scraped && !isFetching && (
            <div className="px-4 py-4 space-y-3 border-t border-border/20">
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: GOLD }}>
                Product Preview
              </p>

              {/* Price unconfirmed warning */}
              {scraped.priceUnconfirmed && (
                <div
                  className="flex items-start gap-2 rounded-lg p-2.5 text-xs"
                  style={{ background: "#3A2E1A", border: "1px solid rgba(191,154,59,0.35)" }}
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: GOLD }} />
                  <p style={{ color: "#D4B96A" }}>
                    Price could not be detected automatically. Enter the retail price below to calculate tax and total.
                  </p>
                </div>
              )}

              {/* Product image */}
              {scraped.imageUrl ? (
                <img
                  src={scraped.imageUrl}
                  alt={scraped.title}
                  className="w-full rounded-lg object-contain bg-white"
                  style={{ maxHeight: "160px" }}
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div
                  className="w-full h-20 rounded-lg flex items-center justify-center"
                  style={{ background: "#2E2F2A" }}
                >
                  <ImageOff className="h-6 w-6 text-muted-foreground/40" />
                </div>
              )}

              {/* Product info */}
              <div>
                <p className="text-sm font-medium text-foreground leading-tight">
                  {scraped.title || "Untitled Product"}
                </p>
                {scraped.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                    {scraped.description}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs text-muted-foreground/60">Source:</span>
                  <span className="text-xs text-muted-foreground">{scraped.sourceName}</span>
                  <a href={scraped.sourceUrl} target="_blank" rel="noreferrer" className="ml-auto">
                    <ExternalLink className="h-3 w-3 text-muted-foreground/50 hover:text-muted-foreground transition-colors" />
                  </a>
                </div>
              </div>

              {/* Retail price override — string-controlled for smooth typing */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">
                  Retail Price ($)
                  {scraped.priceUnconfirmed && !currentRetail && <span style={{ color: GOLD }}> *</span>}
                </span>
                <Input
                  className="h-7 text-xs"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={retailPriceStr}
                  placeholder="0.00"
                  style={scraped.priceUnconfirmed && !currentRetail ? { borderColor: `${GOLD}60` } : {}}
                  onKeyDown={e => {
                    // Prevent Enter from submitting any parent form
                    if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); }
                  }}
                  onChange={e => {
                    // Allow only valid decimal number characters
                    const raw = e.target.value;
                    // Strip anything that isn't a digit, dot, or leading minus
                    const cleaned = raw.replace(/[^0-9.]/g, "");
                    // Prevent multiple dots
                    const parts = cleaned.split(".");
                    const safe = parts.length > 2
                      ? parts[0] + "." + parts.slice(1).join("")
                      : cleaned;
                    setRetailPriceStr(safe);
                  }}
                />
              </div>

              {/* Tax breakdown */}
              {currentRetail !== null && currentRetail > 0 && (
                <div
                  className="rounded-lg p-3 space-y-1.5"
                  style={{ background: "#252620", border: "1px solid rgba(191,154,59,0.2)" }}
                >
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Retail Price</span>
                    <span>${currentRetail.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>SC Sales Tax (8%)</span>
                    <span>+${computedTax?.toFixed(2)}</span>
                  </div>
                  <div
                    className="flex justify-between text-sm font-semibold pt-1 border-t border-border/30"
                    style={{ color: GOLD }}
                  >
                    <span>Line Item Total</span>
                    <span>${computedTotal?.toFixed(2)}</span>
                  </div>
                </div>
              )}

              {/* Add to Line Item */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="flex-1 h-9 text-xs gap-1.5 font-semibold"
                  style={{ background: GOLD, color: "#1A1B17" }}
                  onClick={handleImport}
                >
                  <Package className="h-3.5 w-3.5" />
                  Add to Line Item
                  {computedTotal !== null && (
                    <span className="ml-1 opacity-80">(${computedTotal.toFixed(2)})</span>
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-9 w-9 p-0"
                  onClick={() => window.open(scraped.sourceUrl, "_blank")}
                  title="Open product page"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* Empty state — no supplier selected */}
          {!activeSupplier && !scraped && !isFetching && (
            <div className="px-4 py-8 flex flex-col items-center gap-4">
              <div
                className="h-14 w-14 rounded-2xl flex items-center justify-center"
                style={{ background: `${GOLD}15`, border: `1px solid ${GOLD}30` }}
              >
                <Store className="h-7 w-7" style={{ color: GOLD }} />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold text-foreground">Select a Supplier</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Choose a supplier above, open their site in a new tab, browse to a product,
                  copy the URL, and paste it here.
                </p>
              </div>
              <div
                className="rounded-lg p-3 w-full text-xs space-y-1"
                style={{ background: "#252620", border: `1px solid ${GOLD}20` }}
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: GOLD }} />
                  <div className="space-y-0.5 text-muted-foreground">
                    <p className="text-foreground font-medium">Quick import steps:</p>
                    <p>1. Select a supplier above</p>
                    <p>2. Click "Open in New Tab" to browse</p>
                    <p>3. Copy the product page URL</p>
                    <p>4. Click "Paste from Clipboard" here</p>
                    <p className="text-muted-foreground/60 pt-0.5">
                      Price will include 8% SC sales tax automatically.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );

  return createPortal(panel, portalContainer ?? document.body);
}
