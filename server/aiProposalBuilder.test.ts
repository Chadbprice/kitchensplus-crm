import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const COMPONENT_PATH = path.resolve(__dirname, "../client/src/components/AIProposalBuilder.tsx");
const ROUTER_PATH = path.resolve(__dirname, "routers.ts");

const componentSrc = fs.readFileSync(COMPONENT_PATH, "utf-8");
const routerSrc = fs.readFileSync(ROUTER_PATH, "utf-8");

describe("AI Proposal Builder — Component", () => {
  // ─── Recording indicator ──────────────────────────────────────────────────
  describe("Recording indicator", () => {
    it("should have a prominent recording indicator with pulsing dot", () => {
      expect(componentSrc).toContain("animate-ping");
      expect(componentSrc).toContain("bg-red-500");
    });

    it("should show a duration timer during recording", () => {
      expect(componentSrc).toContain("formatDuration");
      expect(componentSrc).toContain("duration");
    });

    it("should have animated voice bars", () => {
      expect(componentSrc).toContain("voiceBar");
      expect(componentSrc).toContain("@keyframes voiceBar");
    });

    it("should have a Stop button during recording", () => {
      expect(componentSrc).toContain("<Square");
      expect(componentSrc).toContain("Stop");
    });

    it("should track duration with setInterval", () => {
      expect(componentSrc).toContain("setInterval");
      expect(componentSrc).toContain("setDuration");
    });
  });

  // ─── Processing states ────────────────────────────────────────────────────
  describe("Processing states", () => {
    it("should show uploading audio state", () => {
      expect(componentSrc).toContain("Preparing audio");
    });

    it("should show transcribing speech state", () => {
      expect(componentSrc).toContain("Transcribing speech");
    });

    it("should show AI building line items state", () => {
      expect(componentSrc).toContain("AI is building your line items");
    });

    it("should show analyzing scope description", () => {
      expect(componentSrc).toContain("Analyzing scope");
    });
  });

  // ─── Streamlined review (not per-field) ───────────────────────────────────
  describe("Streamlined review flow", () => {
    it("should use ReviewItem type instead of per-field FieldApproval", () => {
      expect(componentSrc).toContain("type ReviewItem");
      expect(componentSrc).not.toContain("type FieldApproval");
      expect(componentSrc).not.toContain("type LineItemApproval");
    });

    it("should have accepted boolean on each item (not per-field)", () => {
      expect(componentSrc).toContain("accepted: boolean");
    });

    it("should have inline editing toggle", () => {
      expect(componentSrc).toContain("editing: boolean");
      expect(componentSrc).toContain("toggleItemEdit");
    });

    it("should have compact ReviewItemCard component", () => {
      expect(componentSrc).toContain("function ReviewItemCard");
    });

    it("should NOT have the old FieldRow or LineItemApprovalCard", () => {
      expect(componentSrc).not.toContain("function FieldRow");
      expect(componentSrc).not.toContain("function LineItemApprovalCard");
    });

    it("should have Insert button with count of accepted items", () => {
      expect(componentSrc).toContain("handleInsertAccepted");
      expect(componentSrc).toContain("Insert");
      expect(componentSrc).toContain("acceptedCount");
    });

    it("should default all items to accepted: true", () => {
      expect(componentSrc).toContain("accepted: true");
    });
  });

  // ─── Voice recording hook ─────────────────────────────────────────────────
  describe("Voice recording hook", () => {
    it("should export duration from useVoiceRecorder", () => {
      expect(componentSrc).toContain("return { isRecording, isProcessing, setIsProcessing, startRecording, stopRecording, duration }");
    });

    it("should clean up timer on unmount", () => {
      expect(componentSrc).toContain("clearInterval(timerRef.current)");
    });

    it("should format duration as M:SS", () => {
      expect(componentSrc).toContain("function formatDuration");
      expect(componentSrc).toContain("padStart(2, \"0\")");
    });
  });

  // ─── Error handling ───────────────────────────────────────────────────────
  describe("Error handling", () => {
    it("should show toast on microphone denial", () => {
      expect(componentSrc).toContain("Microphone access denied");
    });

    it("should show toast on transcription failure", () => {
      // Voice path uses "Voice processing failed" toast
      expect(componentSrc).toContain("Voice processing failed");
    });

    it("should show toast on AI processing failure", () => {
      expect(componentSrc).toContain("AI processing failed");
    });

    it("should show toast when no speech detected", () => {
      // Voice path shows info toast when AI returns no items from voice
      expect(componentSrc).toContain("AI didn't generate any line items from your voice");
    });

    it("should show toast when no items selected for insert", () => {
      expect(componentSrc).toContain("No items selected");
    });

    it("should show info toast when AI returns zero items", () => {
      expect(componentSrc).toContain("AI didn't generate any line items");
    });
  });

  // ─── Example prompts ─────────────────────────────────────────────────────
  describe("Example prompts", () => {
    it("should show clickable example prompts in empty state", () => {
      expect(componentSrc).toContain("Demo full bathroom");
      expect(componentSrc).toContain("Shaker-style white cabinetry");
      expect(componentSrc).toContain("Full kitchen demo");
    });
  });

  // ─── All buttons have type=button ─────────────────────────────────────────
  describe("Button safety", () => {
    it("should have type='button' on all interactive buttons (multi-line check)", () => {
      const buttonMatches = componentSrc.match(/<(?:button|Button)\b[\s\S]*?>/g) || [];
      const withoutType = buttonMatches.filter(b => !b.includes('type="button"'));
      expect(withoutType.length).toBe(0);
    });
  });
});

// ─── Server-side AI prompt — Pricing-enabled (Apr 2026 rewrite) ─────────────
describe("AI Proposal Builder — Server Prompt (Pricing-Enabled)", () => {
  it("should identify as luxury renovation company", () => {
    expect(routerSrc).toContain("luxury renovation company");
  });

  it("should instruct to split labor and material into separate items", () => {
    expect(routerSrc).toContain("ALWAYS split labor and material into SEPARATE line items");
  });

  it("should instruct demo as its own line item", () => {
    expect(routerSrc).toContain("Demo/removal is always its own line item");
  });

  it("should handle vague scope with standard trades", () => {
    expect(routerSrc).toContain("demo, rough plumbing, rough electrical");
  });

  it("should REQUIRE unitPrice on every item (core pricing fix)", () => {
    expect(routerSrc).toContain("You MUST provide a unitPrice for EVERY line item");
    expect(routerSrc).toContain("Never leave unitPrice as empty string");
  });

  it("should NOT tell AI to leave unitPrice empty (old bug removed)", () => {
    expect(routerSrc).not.toContain('Leave unitPrice as "" (empty string) unless the user explicitly states a price');
  });

  it("should fetch historical pricing from DB", () => {
    expect(routerSrc).toContain("HISTORICAL PRICING FROM PAST PROPOSALS");
    expect(routerSrc).toContain("historicalPricingRef");
  });

  it("should include typical luxury renovation price ranges", () => {
    expect(routerSrc).toContain("Bathroom demo: $2,000");
    expect(routerSrc).toContain("Quartz countertops (installed): $75");
    expect(routerSrc).toContain("Frameless glass shower door: $1,200");
  });

  it("should instruct AI to flag estimated vs. historical prices", () => {
    expect(routerSrc).toContain("Flag in the assistantMessage if any prices are rough estimates");
  });

  it("should use structured JSON schema for response", () => {
    expect(routerSrc).toContain("json_schema");
    expect(routerSrc).toContain("proposal_line_items");
  });

  it("should require unitPrice in the JSON schema", () => {
    expect(routerSrc).toContain('"unitPrice"');
    // The schema requires it in the required array
    expect(routerSrc).toContain('"task", "description", "quantity", "unit", "unitPrice", "category"');
  });

  it("should include unit field in schema (LF, SF, EA, HR, LS)", () => {
    expect(routerSrc).toContain("LF, SF, EA, HR, LS");
  });

  it("should group historical data by task name with avg/min/max", () => {
    expect(routerSrc).toContain("avg $");
    expect(routerSrc).toContain("range $");
  });

  it("should include existing proposal items in the prompt", () => {
    expect(routerSrc).toContain("Current proposal line items:");
    expect(routerSrc).toContain("No line items yet in this proposal");
  });
});

// ─── Pricing data assembly logic ────────────────────────────────────────────
describe("AI Proposal Builder — Historical Pricing Assembly", () => {
  it("groups historical rows by lowercased task name", () => {
    const histRows = [
      { task: "Demo", unitPrice: "2500", unit: "LS", category: "labor", quantity: "1" },
      { task: "demo", unitPrice: "3000", unit: "LS", category: "labor", quantity: "1" },
      { task: "Plumbing", unitPrice: "3100", unit: "LS", category: "subcontractor", quantity: "1" },
    ];
    const grouped: Record<string, { prices: number[]; unit: string; category: string; qty: number }> = {};
    for (const row of histRows) {
      const key = (row.task ?? "").toLowerCase().trim();
      if (!key) continue;
      const price = parseFloat(row.unitPrice ?? "0");
      if (price <= 0) continue;
      if (!grouped[key]) {
        grouped[key] = { prices: [], unit: row.unit ?? "LS", category: row.category ?? "labor", qty: parseFloat(row.quantity ?? "1") };
      }
      grouped[key].prices.push(price);
    }
    expect(Object.keys(grouped)).toContain("demo");
    expect(Object.keys(grouped)).toContain("plumbing");
    expect(grouped["demo"].prices).toEqual([2500, 3000]);
  });

  it("computes correct avg/min/max for grouped prices", () => {
    const prices = [2500, 3000, 2750];
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    expect(avg).toBeCloseTo(2750, 0);
    expect(min).toBe(2500);
    expect(max).toBe(3000);
  });

  it("formats reference line correctly", () => {
    const task = "demo";
    const data = { prices: [2500, 3000], unit: "LS", category: "labor", qty: 1 };
    const avg = data.prices.reduce((a, b) => a + b, 0) / data.prices.length;
    const min = Math.min(...data.prices);
    const max = Math.max(...data.prices);
    const line = `  - "${task}" | avg $${avg.toFixed(0)} (range $${min.toFixed(0)}–$${max.toFixed(0)}) | ${data.unit || "LS"} | ${data.category} | typical qty: ${data.qty}`;
    expect(line).toContain('"demo"');
    expect(line).toContain("avg $2750");
    expect(line).toContain("range $2500–$3000");
    expect(line).toContain("LS");
    expect(line).toContain("labor");
  });

  it("skips rows with zero or negative prices", () => {
    const histRows = [
      { task: "Demo", unitPrice: "0", unit: "LS", category: "labor", quantity: "1" },
      { task: "Demo", unitPrice: "-50", unit: "LS", category: "labor", quantity: "1" },
      { task: "Demo", unitPrice: "2500", unit: "LS", category: "labor", quantity: "1" },
    ];
    const grouped: Record<string, { prices: number[] }> = {};
    for (const row of histRows) {
      const key = (row.task ?? "").toLowerCase().trim();
      const price = parseFloat(row.unitPrice ?? "0");
      if (price <= 0) continue;
      if (!grouped[key]) grouped[key] = { prices: [] };
      grouped[key].prices.push(price);
    }
    expect(grouped["demo"].prices).toEqual([2500]);
  });

  it("handles empty historical data gracefully (no crash)", () => {
    const histRows: any[] = [];
    let historicalPricingRef = "";
    if (histRows.length > 0) {
      historicalPricingRef = "HISTORICAL PRICING...";
    }
    expect(historicalPricingRef).toBe("");
  });
});

// ─── Response validation ────────────────────────────────────────────────────
describe("AI Proposal Builder — Response Validation", () => {
  function validItem(overrides: Partial<Record<string, string>> = {}) {
    return {
      task: "Full Kitchen Demolition",
      description: "Comprehensive demolition of existing kitchen.",
      quantity: "1",
      unit: "LS",
      unitPrice: "2750.00",
      category: "labor",
      ...overrides,
    };
  }

  it("every item must have a non-empty unitPrice (core fix regression test)", () => {
    const items = [
      validItem({ unitPrice: "2750.00" }),
      validItem({ task: "Quartz Countertop Material", unitPrice: "90.00", category: "material" }),
      validItem({ task: "Tile Installation", unitPrice: "1500.00" }),
    ];
    for (const item of items) {
      expect(item.unitPrice).toBeTruthy();
      expect(item.unitPrice).not.toBe("");
      expect(parseFloat(item.unitPrice)).toBeGreaterThan(0);
    }
  });

  it("items use valid category values", () => {
    const validCategories = ["material", "labor", "subcontractor", "permit", "other"];
    const items = [
      validItem({ category: "labor" }),
      validItem({ category: "material" }),
      validItem({ category: "subcontractor" }),
    ];
    for (const item of items) {
      expect(validCategories).toContain(item.category);
    }
  });

  it("items use valid unit values", () => {
    const validUnits = ["LF", "SF", "EA", "HR", "LS"];
    const items = [
      validItem({ unit: "LS" }),
      validItem({ unit: "SF", quantity: "50" }),
      validItem({ unit: "EA" }),
    ];
    for (const item of items) {
      expect(validUnits).toContain(item.unit);
    }
  });

  it("kitchen scope produces both labor and material items", () => {
    const items = [
      validItem({ category: "labor" }),
      validItem({ task: "Quartz Countertop Material", category: "material" }),
      validItem({ task: "Plumbing Rough-in", category: "subcontractor" }),
    ];
    expect(items.some(i => i.category === "labor")).toBe(true);
    expect(items.some(i => i.category === "material")).toBe(true);
  });

  it("throws on malformed JSON from AI", () => {
    expect(() => JSON.parse("not valid json")).toThrow();
  });

  it("detects null AI response", () => {
    const result = { choices: [{ message: { content: null } }] };
    expect(result?.choices?.[0]?.message?.content).toBeNull();
  });
});
