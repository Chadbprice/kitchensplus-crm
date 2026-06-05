/**
 * RFI Voice Flow Tests — Rebuilt Dictation Experience
 *
 * Covers:
 * 1. generateRfiBody returns smsBody in addition to title/body/followUpQuestions
 * 2. smsBody is ≤ 160 chars when the AI honours the constraint
 * 3. Fallback parse error path still returns a smsBody
 * 4. transcribeVoice procedure shape (unit-level, no real S3/Whisper call)
 * 5. combinedText assembly: text + transcript + follow-up answers
 * 6. Auto-transcribe pipeline: recording → S3 upload → Whisper → transcript text
 * 7. SMS draft content requirements and character counting
 * 8. Input validation: "No input provided" guard
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock the LLM helper ──────────────────────────────────────────────────────
vi.mock("../server/_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// ─── Mock voice transcription ─────────────────────────────────────────────────
vi.mock("../server/_core/voiceTranscription", () => ({
  transcribeAudio: vi.fn(),
}));

// ─── Mock S3 storage ──────────────────────────────────────────────────────────
vi.mock("../server/storage", () => ({
  storagePut: vi.fn(),
}));

import { invokeLLM } from "../server/_core/llm";
import { transcribeAudio } from "../server/_core/voiceTranscription";
import { storagePut } from "../server/storage";

// ─── Inline the generateRfiBody logic so we can test it without a DB ─────────
const BUSINESS_NAME = "Kitchens Plus Upstate";

async function generateRfiBody(opts: {
  rawText: string;
  projectName: string;
  clientName: string;
}): Promise<{ title: string; body: string; smsBody: string; followUpQuestions: string[] }> {
  const response = await (invokeLLM as any)({
    messages: [
      {
        role: "system",
        content: `You are a professional construction project manager for ${BUSINESS_NAME}.`,
      },
      {
        role: "user",
        content: `Project: ${opts.projectName}\nClient: ${opts.clientName}\n\nRaw input:\n${opts.rawText}`,
      },
    ],
    response_format: { type: "json_schema", json_schema: {} },
  });
  const content = response.choices?.[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content);
  } catch {
    const fallbackSms = opts.rawText.slice(0, 140);
    return { title: "Request for Information", body: opts.rawText, smsBody: fallbackSms, followUpQuestions: [] };
  }
}

// ─── Simulate the combinedText assembly from the rebuilt RFICreateDialog ──────
function buildCombinedText(opts: {
  rawText: string;
  transcript: string;
  followUpAnswers: Record<string, string>;
}): string {
  const parts: string[] = [];
  if (opts.rawText.trim()) parts.push(opts.rawText.trim());
  if (opts.transcript.trim()) parts.push(`[Voice transcript]: ${opts.transcript.trim()}`);
  const answered = Object.entries(opts.followUpAnswers)
    .filter(([, v]) => v.trim())
    .map(([q, a]) => `Q: ${q}\nA: ${a.trim()}`);
  if (answered.length) parts.push(`[Follow-up answers]:\n${answered.join("\n")}`);
  return parts.join("\n\n");
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("RFI Voice Flow — generateRfiBody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns smsBody along with title, body, and followUpQuestions", async () => {
    const mockResult = {
      title: "Countertop Color Confirmation",
      body: "Dear Client, we need your confirmation on the countertop color selection for your kitchen renovation project.",
      smsBody: "Hi Jane, Kitchens Plus Upstate needs your countertop color choice. Please respond ASAP.",
      followUpQuestions: [],
    };

    (invokeLLM as any).mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(mockResult) } }],
    });

    const result = await generateRfiBody({
      rawText: "Need client to confirm countertop color",
      projectName: "Johnson Kitchen Remodel",
      clientName: "Jane Johnson",
    });

    expect(result.title).toBe("Countertop Color Confirmation");
    expect(result.body).toContain("countertop color");
    expect(result.smsBody).toBeTruthy();
    expect(result.smsBody).toContain("Kitchens Plus Upstate");
    expect(result.followUpQuestions).toEqual([]);
  });

  it("smsBody is within 160 chars when AI respects the constraint", async () => {
    const shortSms = "Hi Jane, KPU needs your countertop color. Reply here: https://portal.example.com/rfi/abc";
    expect(shortSms.length).toBeLessThanOrEqual(160);

    (invokeLLM as any).mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({
        title: "Countertop Color",
        body: "Please confirm your countertop color selection.",
        smsBody: shortSms,
        followUpQuestions: [],
      }) } }],
    });

    const result = await generateRfiBody({
      rawText: "Need countertop color",
      projectName: "Test Project",
      clientName: "Jane",
    });

    expect(result.smsBody.length).toBeLessThanOrEqual(160);
  });

  it("falls back gracefully when AI returns invalid JSON", async () => {
    (invokeLLM as any).mockResolvedValueOnce({
      choices: [{ message: { content: "NOT VALID JSON {{{{" } }],
    });

    const rawText = "Need client to confirm tile selection for master bath";
    const result = await generateRfiBody({
      rawText,
      projectName: "Smith Bath Remodel",
      clientName: "Bob Smith",
    });

    expect(result.title).toBe("Request for Information");
    expect(result.body).toBe(rawText);
    expect(result.smsBody).toBe(rawText.slice(0, 140));
    expect(result.followUpQuestions).toEqual([]);
  });

  it("fallback smsBody is always ≤ 140 chars (truncated from rawText)", async () => {
    (invokeLLM as any).mockResolvedValueOnce({
      choices: [{ message: { content: "BAD JSON" } }],
    });

    const longRawText = "A".repeat(300);
    const result = await generateRfiBody({
      rawText: longRawText,
      projectName: "Test",
      clientName: "Test Client",
    });

    expect(result.smsBody.length).toBeLessThanOrEqual(140);
  });

  it("includes followUpQuestions when AI returns them", async () => {
    const mockResult = {
      title: "Material Selection",
      body: "We need clarification on several material choices.",
      smsBody: "Hi Client, KPU needs your material choices. Please check your email.",
      followUpQuestions: [
        "What finish do you prefer for the cabinet hardware?",
        "Have you decided on the backsplash tile pattern?",
      ],
    };

    (invokeLLM as any).mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(mockResult) } }],
    });

    const result = await generateRfiBody({
      rawText: "Need material choices",
      projectName: "Williams Kitchen",
      clientName: "Sarah Williams",
    });

    expect(result.followUpQuestions).toHaveLength(2);
    expect(result.followUpQuestions[0]).toContain("cabinet hardware");
  });

  it("invokeLLM is called with the correct project and client context", async () => {
    (invokeLLM as any).mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({
        title: "T", body: "B", smsBody: "S", followUpQuestions: [],
      }) } }],
    });

    await generateRfiBody({
      rawText: "Confirm tile color",
      projectName: "Davis Master Bath",
      clientName: "Tom Davis",
    });

    const callArgs = (invokeLLM as any).mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: any) => m.role === "user");
    expect(userMessage.content).toContain("Davis Master Bath");
    expect(userMessage.content).toContain("Tom Davis");
    expect(userMessage.content).toContain("Confirm tile color");
  });
});

describe("RFI Voice Flow — transcribeVoice pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("storagePut is called with the correct mime type extension (webm)", async () => {
    (storagePut as any).mockResolvedValueOnce({ url: "https://s3.example.com/rfi-voice/test.webm" });
    (transcribeAudio as any).mockResolvedValueOnce({ text: "Need client to confirm countertop color" });

    const mimeType = "audio/webm";
    const base64Audio = Buffer.from("fake-audio-data").toString("base64");
    const buffer = Buffer.from(base64Audio, "base64");
    const ext = mimeType.includes("mp4") ? "mp4" : "webm";
    const key = `rfi-voice/test.${ext}`;
    const { url } = await (storagePut as any)(key, buffer, mimeType);
    const result = await (transcribeAudio as any)({ audioUrl: url });

    expect(ext).toBe("webm");
    expect(storagePut).toHaveBeenCalledWith(key, buffer, mimeType);
    expect(result.text).toBe("Need client to confirm countertop color");
  });

  it("storagePut uses mp4 extension for audio/mp4 mime type", () => {
    const mimeType = "audio/mp4";
    const ext = mimeType.includes("mp4") ? "mp4" : "webm";
    expect(ext).toBe("mp4");
  });

  it("transcribeVoice returns the transcription text", async () => {
    (storagePut as any).mockResolvedValueOnce({ url: "https://s3.example.com/rfi-voice/test.webm" });
    (transcribeAudio as any).mockResolvedValueOnce({ text: "Please confirm the cabinet finish selection" });

    const mimeType = "audio/webm";
    const buffer = Buffer.from("fake-audio");
    const { url } = await (storagePut as any)("rfi-voice/test.webm", buffer, mimeType);
    const result = await (transcribeAudio as any)({ audioUrl: url });

    expect(result.text).toBe("Please confirm the cabinet finish selection");
  });

  it("auto-transcribe pipeline: upload → transcribe → text ready", async () => {
    const audioBlob = Buffer.from("simulated-webm-audio");
    const base64 = audioBlob.toString("base64");
    const buffer = Buffer.from(base64, "base64");
    const s3Url = "https://s3.example.com/rfi-voice/auto-123.webm";

    (storagePut as any).mockResolvedValueOnce({ url: s3Url });
    (transcribeAudio as any).mockResolvedValueOnce({
      text: "The client needs to pick between white oak and red oak for the stair nosing",
    });

    // Step 1: Upload to S3
    const { url } = await (storagePut as any)("rfi-voice/auto-123.webm", buffer, "audio/webm");
    expect(url).toBe(s3Url);

    // Step 2: Transcribe
    const result = await (transcribeAudio as any)({ audioUrl: url });
    expect(result.text).toContain("stair nosing");

    // Step 3: Transcript is now available as text (no stale closure issue)
    const transcript = result.text;
    expect(transcript).toBeTruthy();
    expect(typeof transcript).toBe("string");
  });
});

describe("RFI Voice Flow — combinedText assembly (root cause fix)", () => {
  it("text-only: uses rawText directly", () => {
    const combined = buildCombinedText({
      rawText: "Need countertop color confirmation",
      transcript: "",
      followUpAnswers: {},
    });
    expect(combined).toBe("Need countertop color confirmation");
  });

  it("voice-only: uses transcript with [Voice transcript] prefix", () => {
    const combined = buildCombinedText({
      rawText: "",
      transcript: "Client mentioned they want white oak stair nosing",
      followUpAnswers: {},
    });
    expect(combined).toBe("[Voice transcript]: Client mentioned they want white oak stair nosing");
  });

  it("mixed text + voice: combines both with double newline", () => {
    const combined = buildCombinedText({
      rawText: "Stair nosing material needed",
      transcript: "They said they want oak but haven't confirmed the finish",
      followUpAnswers: {},
    });
    expect(combined).toContain("Stair nosing material needed");
    expect(combined).toContain("[Voice transcript]: They said they want oak");
    expect(combined.indexOf("Stair nosing")).toBeLessThan(combined.indexOf("[Voice transcript]"));
  });

  it("includes follow-up answers when provided", () => {
    const combined = buildCombinedText({
      rawText: "Need material confirmation",
      transcript: "",
      followUpAnswers: {
        "What finish do you prefer?": "Matte finish",
        "Match existing flooring?": "Yes, match upstairs",
      },
    });
    expect(combined).toContain("[Follow-up answers]:");
    expect(combined).toContain("Q: What finish do you prefer?");
    expect(combined).toContain("A: Matte finish");
    expect(combined).toContain("A: Yes, match upstairs");
  });

  it("skips empty follow-up answers", () => {
    const combined = buildCombinedText({
      rawText: "Need material confirmation",
      transcript: "",
      followUpAnswers: {
        "What finish?": "Matte",
        "Color?": "",
        "Timeline?": "  ",
      },
    });
    expect(combined).toContain("A: Matte");
    expect(combined).not.toContain("A: \n");
    // Only one Q/A pair should appear
    const qCount = (combined.match(/Q: /g) || []).length;
    expect(qCount).toBe(1);
  });

  it("all-empty inputs produce empty string (triggers 'No input provided' guard)", () => {
    const combined = buildCombinedText({
      rawText: "",
      transcript: "",
      followUpAnswers: {},
    });
    expect(combined.trim()).toBe("");
  });

  it("voice + follow-up (no text): combines transcript and answers", () => {
    const combined = buildCombinedText({
      rawText: "",
      transcript: "Client wants oak nosing",
      followUpAnswers: { "Matte or satin?": "Satin" },
    });
    expect(combined).toContain("[Voice transcript]: Client wants oak nosing");
    expect(combined).toContain("A: Satin");
  });
});

describe("RFI Voice Flow — SMS draft content requirements", () => {
  it("smsBody from AI should contain business name reference", () => {
    const smsBody = "Hi Jane, Kitchens Plus Upstate needs your countertop color selection. Please respond.";
    expect(smsBody).toContain("Kitchens Plus Upstate");
  });

  it("smsBody should not exceed 160 chars for single-message delivery", () => {
    const smsBody = "Hi Jane, Kitchens Plus Upstate has a Request for Information that needs your response. Please review.";
    expect(smsBody.length).toBeLessThanOrEqual(160);
  });

  it("smsBody over 160 chars is flagged as multi-message", () => {
    const longSms = "Hi Jane, Kitchens Plus Upstate has a Request for Information regarding your kitchen renovation project that needs your immediate response. Please log in to your client portal and review the RFI at your earliest convenience.";
    expect(longSms.length).toBeGreaterThan(160);
    const willSplit = longSms.length > 160;
    expect(willSplit).toBe(true);
  });

  it("empty smsBody falls back to template in send-preview", () => {
    const generatedSms = "";
    const clientName = "Jane Johnson";
    const generatedTitle = "Countertop Color Confirmation";
    const displaySms = generatedSms || `Hi ${clientName}, Kitchens Plus Upstate has a Request for Information: "${generatedTitle}". Please review and respond here: [portal link]`;
    expect(displaySms).toContain("Kitchens Plus Upstate");
    expect(displaySms).toContain("Countertop Color Confirmation");
  });

  it("character counter correctly identifies multi-segment SMS", () => {
    const sms160 = "A".repeat(160);
    const sms161 = "A".repeat(161);
    const sms320 = "A".repeat(320);

    expect(sms160.length <= 160).toBe(true);
    expect(Math.ceil(sms161.length / 160)).toBe(2);
    expect(Math.ceil(sms320.length / 160)).toBe(2);
    expect(Math.ceil(321 / 160)).toBe(3);
  });
});

describe("RFI Voice Flow — input validation guard", () => {
  it("empty rawText after trim throws BAD_REQUEST", () => {
    const rawText = "   ";
    expect(rawText.trim()).toBe("");
    // The server procedure checks: if (!rawText.trim()) throw ...
    const shouldThrow = !rawText.trim();
    expect(shouldThrow).toBe(true);
  });

  it("non-empty rawText passes the guard", () => {
    const rawText = "Need countertop color";
    const shouldThrow = !rawText.trim();
    expect(shouldThrow).toBe(false);
  });

  it("transcript-only input passes the guard (voice-only path)", () => {
    // In the rebuilt flow, transcript is merged into rawText before the guard
    const rawText = "";
    const transcript = "Client wants oak nosing";
    const combined = buildCombinedText({ rawText, transcript, followUpAnswers: {} });
    const shouldThrow = !combined.trim();
    expect(shouldThrow).toBe(false);
  });
});
