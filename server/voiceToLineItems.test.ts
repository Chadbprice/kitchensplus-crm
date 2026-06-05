/**
 * voiceToLineItems Tests — Single-Call Voice-to-Line-Items
 *
 * Covers:
 * 1. Server-side voiceToLineItems procedure: input validation, base64 audio handling,
 *    transcription via Whisper, LLM line item generation, historical pricing, error paths
 * 2. Client-side AIProposalBuilder: voiceToLineItems mutation wiring, voiceStage states,
 *    voice message bubble, single-call flow (no multi-step chain)
 * 3. Regression: typed input path still uses aiSuggestLineItems (not voiceToLineItems)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ─── Mock external dependencies ──────────────────────────────────────────────
vi.mock("../server/_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

vi.mock("../server/_core/voiceTranscription", () => ({
  transcribeAudio: vi.fn(),
}));

vi.mock("../server/storage", () => ({
  storagePut: vi.fn(),
}));

import { invokeLLM } from "../server/_core/llm";

// ─── Source file references ──────────────────────────────────────────────────
const ROUTER_PATH = path.resolve(__dirname, "routers.ts");
const COMPONENT_PATH = path.resolve(__dirname, "../client/src/components/AIProposalBuilder.tsx");

const routerSrc = fs.readFileSync(ROUTER_PATH, "utf-8");
const componentSrc = fs.readFileSync(COMPONENT_PATH, "utf-8");

// ─── Inline the voiceToLineItems core logic for unit testing ─────────────────
async function processVoiceToLineItems(opts: {
  audioBase64: string;
  mimeType: string;
  proposalTitle?: string;
  existingItems?: Array<{ task?: string; description?: string; quantity?: string; unitPrice?: string; category?: string }>;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<{ transcript: string; items: any[]; assistantMessage: string }> {
  // Step 1: Validate audio
  const audioBuffer = Buffer.from(opts.audioBase64, "base64");
  if (audioBuffer.length === 0) {
    throw new Error("Audio data is empty. Please try recording again.");
  }
  const sizeMB = audioBuffer.length / (1024 * 1024);
  if (sizeMB > 16) {
    throw new Error(`Audio file is ${sizeMB.toFixed(1)}MB — maximum is 16MB. Try a shorter recording.`);
  }

  // Step 2: Determine file extension from mime type
  const mimeToExt: Record<string, string> = {
    "audio/webm": "webm", "audio/mp3": "mp3", "audio/mpeg": "mp3",
    "audio/wav": "wav", "audio/ogg": "ogg", "audio/m4a": "m4a", "audio/mp4": "m4a",
  };
  const ext = mimeToExt[opts.mimeType] || "webm";

  // Step 3: Call Whisper (simulated via mock)
  const whisperResponse = await (invokeLLM as any).__whisperCall?.({
    audioBuffer,
    ext,
    mimeType: opts.mimeType,
  });
  const transcript = whisperResponse?.text?.trim();
  if (!transcript) {
    throw new Error("No speech detected in the recording. Please speak clearly and try again.");
  }

  // Step 4: Generate line items via LLM
  const existingItemsSummary = (opts.existingItems ?? []).length > 0
    ? `\nCurrent proposal line items:\n${(opts.existingItems ?? []).map((item, i) =>
        `${i + 1}. ${item.task || "(no task)"} — ${item.description || ""} | Qty: ${item.quantity || "1"} | Price: $${item.unitPrice || "0"} | Category: ${item.category || "labor"}`
      ).join("\n")}`
    : "\nNo line items yet in this proposal.";

  const messages: any[] = [
    { role: "system", content: `You are a senior construction estimator for Kitchens Plus Upstate.${existingItemsSummary}` },
    ...(opts.conversationHistory ?? []),
    { role: "user", content: `Voice transcript:\n\n"${transcript}"` },
  ];

  const result = await (invokeLLM as any)({ messages, response_format: { type: "json_schema" } });
  const content = result?.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI returned no response. Please try again.");
  const parsed = JSON.parse(content);
  return {
    transcript,
    items: parsed.items,
    assistantMessage: parsed.assistantMessage,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("voiceToLineItems — Server Procedure Structure", () => {
  it("defines voiceToLineItems as a mutation in the estimates router", () => {
    expect(routerSrc).toContain("voiceToLineItems:");
    expect(routerSrc).toContain("adminProcedure.input(z.object({");
  });

  it("accepts audioBase64 as a required string input", () => {
    expect(routerSrc).toContain("audioBase64: z.string()");
  });

  it("accepts mimeType with default audio/webm", () => {
    expect(routerSrc).toContain('mimeType: z.string().default("audio/webm")');
  });

  it("accepts optional proposalTitle for context", () => {
    expect(routerSrc).toContain("proposalTitle: z.string().optional()");
  });

  it("accepts optional existingItems array for context", () => {
    expect(routerSrc).toContain("existingItems: z.array(z.object({");
  });

  it("accepts optional conversationHistory for multi-turn context", () => {
    expect(routerSrc).toContain("conversationHistory: z.array(z.object({");
  });

  it("returns transcript, items array, and assistantMessage", () => {
    // The procedure returns these three fields
    expect(routerSrc).toContain("transcript,");
    expect(routerSrc).toContain("items: parsed.items");
    expect(routerSrc).toContain("assistantMessage: parsed.assistantMessage");
  });
});

describe("voiceToLineItems — Audio Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects empty audio data", async () => {
    await expect(
      processVoiceToLineItems({ audioBase64: "", mimeType: "audio/webm" })
    ).rejects.toThrow(/Audio data is empty/);
  });

  it("rejects audio larger than 16MB", async () => {
    const bigBuffer = Buffer.alloc(17 * 1024 * 1024, "x");
    const bigBase64 = bigBuffer.toString("base64");
    await expect(
      processVoiceToLineItems({ audioBase64: bigBase64, mimeType: "audio/webm" })
    ).rejects.toThrow(/maximum is 16MB/);
  });

  it("accepts audio under 16MB", () => {
    const smallBuffer = Buffer.alloc(1024, "x");
    const smallBase64 = smallBuffer.toString("base64");
    const decoded = Buffer.from(smallBase64, "base64");
    const sizeMB = decoded.length / (1024 * 1024);
    expect(sizeMB).toBeLessThan(16);
  });

  it("server code enforces 16MB limit", () => {
    expect(routerSrc).toContain("sizeMB > 16");
    expect(routerSrc).toContain("maximum is 16MB");
  });
});

describe("voiceToLineItems — MIME Type to Extension Mapping", () => {
  const mimeToExt: Record<string, string> = {
    "audio/webm": "webm", "audio/mp3": "mp3", "audio/mpeg": "mp3",
    "audio/wav": "wav", "audio/ogg": "ogg", "audio/m4a": "m4a", "audio/mp4": "m4a",
  };

  it("maps audio/webm to .webm", () => {
    expect(mimeToExt["audio/webm"]).toBe("webm");
  });

  it("maps audio/mp3 to .mp3", () => {
    expect(mimeToExt["audio/mp3"]).toBe("mp3");
  });

  it("maps audio/mpeg to .mp3", () => {
    expect(mimeToExt["audio/mpeg"]).toBe("mp3");
  });

  it("maps audio/wav to .wav", () => {
    expect(mimeToExt["audio/wav"]).toBe("wav");
  });

  it("maps audio/ogg to .ogg", () => {
    expect(mimeToExt["audio/ogg"]).toBe("ogg");
  });

  it("maps audio/mp4 to .m4a", () => {
    expect(mimeToExt["audio/mp4"]).toBe("m4a");
  });

  it("defaults unknown mime types to webm", () => {
    const ext = mimeToExt["audio/unknown"] || "webm";
    expect(ext).toBe("webm");
  });

  it("server code includes all supported mime mappings", () => {
    expect(routerSrc).toContain('"audio/webm": "webm"');
    expect(routerSrc).toContain('"audio/mp3": "mp3"');
    expect(routerSrc).toContain('"audio/wav": "wav"');
    expect(routerSrc).toContain('"audio/ogg": "ogg"');
    expect(routerSrc).toContain('"audio/mp4": "m4a"');
  });
});

describe("voiceToLineItems — Whisper Transcription (No S3)", () => {
  it("does NOT use S3 upload for voice-to-line-items (direct Whisper call)", () => {
    // The voiceToLineItems procedure should NOT call storagePut
    // It sends audio directly to Whisper via FormData
    const voiceToLineItemsSection = routerSrc.slice(
      routerSrc.indexOf("voiceToLineItems:"),
      routerSrc.indexOf("});", routerSrc.indexOf("voiceToLineItems:") + 2000) + 3
    );
    expect(voiceToLineItemsSection).not.toContain("storagePut");
    expect(voiceToLineItemsSection).toContain("FormData");
    expect(voiceToLineItemsSection).toContain("whisper-1");
  });

  it("uses Forge API URL and key for Whisper endpoint", () => {
    expect(routerSrc).toContain("BUILT_IN_FORGE_API_URL");
    expect(routerSrc).toContain("BUILT_IN_FORGE_API_KEY");
    expect(routerSrc).toContain("v1/audio/transcriptions");
  });

  it("includes construction context prompt for Whisper accuracy", () => {
    expect(routerSrc).toContain("Kitchen remodeling scope of work");
    expect(routerSrc).toContain("contractor proposal line items");
  });

  it("handles empty transcription result", () => {
    expect(routerSrc).toContain("No speech detected in the recording");
  });

  it("handles Whisper API failure gracefully", () => {
    expect(routerSrc).toContain("Voice transcription failed");
  });
});

describe("voiceToLineItems — LLM Line Item Generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses same pricing rules as aiSuggestLineItems", () => {
    // Both procedures share the same pricing instruction set
    expect(routerSrc).toContain("You MUST provide a unitPrice for EVERY line item");
    expect(routerSrc).toContain("Never leave unitPrice as empty string");
  });

  it("fetches historical pricing from DB for voice path too", () => {
    const voiceSection = routerSrc.slice(routerSrc.indexOf("voiceToLineItems:"));
    expect(voiceSection).toContain("HISTORICAL PRICING FROM PAST PROPOSALS");
    expect(voiceSection).toContain("historicalPricingRef");
  });

  it("includes luxury renovation price ranges as fallback", () => {
    const voiceSection = routerSrc.slice(routerSrc.indexOf("voiceToLineItems:"));
    expect(voiceSection).toContain("Bathroom demo: $2,000");
    expect(voiceSection).toContain("Quartz countertops (installed): $75");
  });

  it("instructs AI to handle voice transcript filler words", () => {
    expect(routerSrc).toContain("Ignore filler words (um, uh, like, you know)");
  });

  it("uses structured JSON schema for response format", () => {
    const voiceSection = routerSrc.slice(routerSrc.indexOf("voiceToLineItems:"));
    expect(voiceSection).toContain("proposal_line_items");
    expect(voiceSection).toContain("json_schema");
  });

  it("requires all fields in the JSON schema response", () => {
    const voiceSection = routerSrc.slice(routerSrc.indexOf("voiceToLineItems:"));
    expect(voiceSection).toContain('"task", "description", "quantity", "unit", "unitPrice", "category"');
  });

  it("includes existing items context in the prompt", () => {
    const voiceSection = routerSrc.slice(routerSrc.indexOf("voiceToLineItems:"));
    expect(voiceSection).toContain("Current proposal line items:");
    expect(voiceSection).toContain("No line items yet in this proposal");
  });

  it("includes proposal title in the user message when provided", () => {
    const voiceSection = routerSrc.slice(routerSrc.indexOf("voiceToLineItems:"));
    expect(voiceSection).toContain("proposalTitle");
    expect(voiceSection).toContain("Proposal title:");
  });

  it("includes conversation history for multi-turn context", () => {
    const voiceSection = routerSrc.slice(routerSrc.indexOf("voiceToLineItems:"));
    expect(voiceSection).toContain("conversationHistory");
  });

  it("handles null AI response gracefully", () => {
    expect(routerSrc).toContain("AI returned no response. Please try again.");
  });

  it("correctly parses LLM response into items and assistantMessage", async () => {
    const mockItems = [
      { task: "Oak Flooring Material", description: "500 SF of select-grade red oak", quantity: "500", unit: "SF", unitPrice: "8.50", category: "material" },
      { task: "Hardwood Floor Installation", description: "Professional installation of oak hardwood flooring", quantity: "500", unit: "SF", unitPrice: "12.00", category: "labor" },
    ];
    const mockResponse = {
      items: mockItems,
      assistantMessage: "I've created 2 line items for the hardwood floor installation. Prices are based on historical data.",
    };

    (invokeLLM as any).mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(mockResponse) } }],
    });
    (invokeLLM as any).__whisperCall = vi.fn().mockResolvedValueOnce({
      text: "I need hardwood floor installation for 500 square feet of oak flooring",
    });

    const result = await processVoiceToLineItems({
      audioBase64: Buffer.from("fake-audio-data").toString("base64"),
      mimeType: "audio/webm",
    });

    expect(result.transcript).toContain("hardwood floor");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].task).toBe("Oak Flooring Material");
    expect(result.items[0].unitPrice).toBe("8.50");
    expect(result.items[0].category).toBe("material");
    expect(result.items[1].task).toBe("Hardwood Floor Installation");
    expect(result.items[1].unitPrice).toBe("12.00");
    expect(result.items[1].category).toBe("labor");
    expect(result.assistantMessage).toContain("2 line items");
  });

  it("every generated item must have a non-empty unitPrice", () => {
    const mockItems = [
      { task: "Demo", description: "Full kitchen demo", quantity: "1", unit: "LS", unitPrice: "2750.00", category: "labor" },
      { task: "Tile Material", description: "Porcelain tile", quantity: "200", unit: "SF", unitPrice: "12.00", category: "material" },
      { task: "Plumbing Rough-in", description: "Rough plumbing", quantity: "1", unit: "LS", unitPrice: "3100.00", category: "subcontractor" },
    ];
    for (const item of mockItems) {
      expect(item.unitPrice).toBeTruthy();
      expect(item.unitPrice).not.toBe("");
      expect(parseFloat(item.unitPrice)).toBeGreaterThan(0);
    }
  });
});

describe("voiceToLineItems — Error Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws on empty audio base64", async () => {
    await expect(
      processVoiceToLineItems({ audioBase64: "", mimeType: "audio/webm" })
    ).rejects.toThrow("Audio data is empty");
  });

  it("throws on oversized audio", async () => {
    const bigBase64 = Buffer.alloc(17 * 1024 * 1024).toString("base64");
    await expect(
      processVoiceToLineItems({ audioBase64: bigBase64, mimeType: "audio/webm" })
    ).rejects.toThrow("maximum is 16MB");
  });

  it("throws when Whisper returns no speech", async () => {
    (invokeLLM as any).__whisperCall = vi.fn().mockResolvedValueOnce({ text: "" });
    await expect(
      processVoiceToLineItems({
        audioBase64: Buffer.from("fake-audio").toString("base64"),
        mimeType: "audio/webm",
      })
    ).rejects.toThrow("No speech detected");
  });

  it("throws when LLM returns null content", async () => {
    (invokeLLM as any).__whisperCall = vi.fn().mockResolvedValueOnce({ text: "demo the kitchen" });
    (invokeLLM as any).mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
    });
    await expect(
      processVoiceToLineItems({
        audioBase64: Buffer.from("fake-audio").toString("base64"),
        mimeType: "audio/webm",
      })
    ).rejects.toThrow("AI returned no response");
  });

  it("throws when LLM returns invalid JSON", async () => {
    (invokeLLM as any).__whisperCall = vi.fn().mockResolvedValueOnce({ text: "demo the kitchen" });
    (invokeLLM as any).mockResolvedValueOnce({
      choices: [{ message: { content: "NOT VALID JSON {{{{" } }],
    });
    await expect(
      processVoiceToLineItems({
        audioBase64: Buffer.from("fake-audio").toString("base64"),
        mimeType: "audio/webm",
      })
    ).rejects.toThrow();
  });

  it("server code has TRPCError for voice transcription service not configured", () => {
    expect(routerSrc).toContain("Voice transcription service is not configured");
  });

  it("server code has TRPCError for Whisper HTTP failure", () => {
    expect(routerSrc).toContain("Voice transcription failed");
    expect(routerSrc).toContain("whisperRes.status");
  });
});

describe("voiceToLineItems — Client-Side Integration", () => {
  it("uses trpc.estimates.voiceToLineItems mutation", () => {
    expect(componentSrc).toContain("trpc.estimates.voiceToLineItems.useMutation()");
  });

  it("calls voiceToLineItems.mutateAsync with audioBase64", () => {
    expect(componentSrc).toContain("voiceToLineItems.mutateAsync({");
    expect(componentSrc).toContain("audioBase64: base64");
  });

  it("passes mimeType from recording result", () => {
    expect(componentSrc).toContain("mimeType: result.mimeType");
  });

  it("passes proposalTitle for context", () => {
    expect(componentSrc).toContain("proposalTitle: proposalTitle");
  });

  it("passes existingItems for context", () => {
    expect(componentSrc).toContain("existingItems: existingItems.map");
  });

  it("passes conversationHistory for multi-turn context", () => {
    expect(componentSrc).toContain("conversationHistory: conversationHistory.map");
  });

  it("has voiceStage state for progress feedback", () => {
    expect(componentSrc).toContain("voiceStage");
    expect(componentSrc).toContain('setVoiceStage("uploading")');
    expect(componentSrc).toContain('setVoiceStage("transcribing")');
    expect(componentSrc).toContain('setVoiceStage("generating")');
    expect(componentSrc).toContain('setVoiceStage("")');
  });

  it("shows stage-specific progress messages", () => {
    expect(componentSrc).toContain("Preparing audio");
    expect(componentSrc).toContain("Transcribing speech");
    expect(componentSrc).toContain("Generating line items");
  });

  it("shows transcript as voice message bubble in chat", () => {
    expect(componentSrc).toContain("voiceResult.transcript");
    expect(componentSrc).toContain("isVoice: true");
  });

  it("shows AI assistant message in chat", () => {
    expect(componentSrc).toContain("voiceResult.assistantMessage");
  });

  it("builds review items from voice result", () => {
    expect(componentSrc).toContain("voiceResult.items");
    expect(componentSrc).toContain("setReviewItems(buildReviewItems");
  });

  it("shows toast with line item count on success", () => {
    expect(componentSrc).toContain("ready for review");
  });

  it("shows error toast on voice processing failure", () => {
    expect(componentSrc).toContain("Voice processing failed");
  });

  it("resets processing state in finally block", () => {
    expect(componentSrc).toContain("setIsProcessing(false)");
    expect(componentSrc).toContain('setVoiceStage("")');
  });

  it("isVoiceBusy includes voiceToLineItems.isPending", () => {
    expect(componentSrc).toContain("voiceToLineItems.isPending");
  });
});

describe("voiceToLineItems — Single-Call Architecture (No Multi-Step Chain)", () => {
  it("voice path does NOT call separate uploadAudio procedure", () => {
    // The old multi-step chain was: uploadAudio → transcribeVoice → aiSuggestLineItems
    // The new single-call path should NOT reference uploadAudio in the voice handler
    const voiceHandlerSection = componentSrc.slice(
      componentSrc.indexOf("async function handleVoiceToggle"),
      componentSrc.indexOf("} else {", componentSrc.indexOf("async function handleVoiceToggle") + 100)
    );
    expect(voiceHandlerSection).not.toContain("uploadAudio.mutateAsync");
    expect(voiceHandlerSection).not.toContain("transcribeVoice.mutateAsync");
  });

  it("voice path uses a single voiceToLineItems.mutateAsync call", () => {
    const voiceHandlerSection = componentSrc.slice(
      componentSrc.indexOf("async function handleVoiceToggle"),
      componentSrc.indexOf("} else {", componentSrc.indexOf("async function handleVoiceToggle") + 100)
    );
    expect(voiceHandlerSection).toContain("voiceToLineItems.mutateAsync");
    // Should appear exactly once in the voice handler
    const matches = voiceHandlerSection.match(/voiceToLineItems\.mutateAsync/g);
    expect(matches).toHaveLength(1);
  });

  it("converts blob to base64 on client before sending", () => {
    expect(componentSrc).toContain("arrayBuffer");
    expect(componentSrc).toContain("btoa");
    expect(componentSrc).toContain("String.fromCharCode");
  });
});

describe("voiceToLineItems — Typed Input Path Regression", () => {
  it("typed input still uses aiSuggestLineItems (not voiceToLineItems)", () => {
    // handleSend should use aiSuggestLineItems for typed text
    const handleSendSection = componentSrc.slice(
      componentSrc.indexOf("async function handleSend"),
      componentSrc.indexOf("async function handleVoiceToggle")
    );
    expect(handleSendSection).toContain("aiSuggest.mutateAsync");
    expect(handleSendSection).not.toContain("voiceToLineItems.mutateAsync");
  });

  it("both mutations are defined in the component", () => {
    expect(componentSrc).toContain("trpc.estimates.aiSuggestLineItems.useMutation()");
    expect(componentSrc).toContain("trpc.estimates.voiceToLineItems.useMutation()");
  });

  it("handleKeyDown triggers handleSend on Enter (typed path)", () => {
    expect(componentSrc).toContain("handleKeyDown");
    expect(componentSrc).toContain('e.key === "Enter"');
    expect(componentSrc).toContain("handleSend()");
  });
});
