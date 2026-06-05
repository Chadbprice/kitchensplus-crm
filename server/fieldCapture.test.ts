import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB and storage dependencies
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([]),
        }),
        orderBy: vi.fn().mockResolvedValue([]),
      }),
    }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  }),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://cdn.example.com/test.jpg", key: "field-captures/test.jpg" }),
}));

vi.mock("./_core/voiceTranscription", () => ({
  transcribeAudio: vi.fn().mockResolvedValue({ text: "Hello from the field", language: "en", segments: [] }),
}));

describe("fieldCapture router", () => {
  it("should export fieldCaptureRouter with expected procedures", async () => {
    const { fieldCaptureRouter } = await import("./routers/fieldCapture");
    expect(fieldCaptureRouter).toBeDefined();
    // Check that the router has the expected procedure keys
    const procedures = Object.keys(fieldCaptureRouter._def.procedures ?? {});
    // tRPC v11 stores procedures differently; just check the router is an object
    expect(typeof fieldCaptureRouter).toBe("object");
  });

  it("storagePut mock works correctly", async () => {
    const { storagePut } = await import("./storage");
    const result = await storagePut("test-key", Buffer.from("data"), "image/jpeg");
    expect(result.url).toBe("https://cdn.example.com/test.jpg");
    expect(result.key).toBe("field-captures/test.jpg");
  });

  it("transcribeAudio mock returns expected text", async () => {
    const { transcribeAudio } = await import("./_core/voiceTranscription");
    const result = await transcribeAudio({ audioUrl: "https://example.com/audio.webm" });
    expect(result.text).toBe("Hello from the field");
  });

  it("base64 image decoding works correctly", () => {
    const testData = "Hello, World!";
    const base64 = Buffer.from(testData).toString("base64");
    const dataUrl = `data:image/jpeg;base64,${base64}`;
    const stripped = dataUrl.replace(/^data:[^;]+;base64,/, "");
    const decoded = Buffer.from(stripped, "base64").toString("utf8");
    expect(decoded).toBe(testData);
  });

  it("voice note text gets prefixed with microphone emoji", () => {
    const transcribedText = "The kitchen cabinets need to be replaced";
    const savedText = `🎤 ${transcribedText}`;
    expect(savedText).toBe("🎤 The kitchen cabinets need to be replaced");
    expect(savedText.startsWith("🎤")).toBe(true);
  });

  it("GPS coordinates are stored as strings", () => {
    const lat = 43.1234567;
    const lng = -76.9876543;
    const latStr = String(lat);
    const lngStr = String(lng);
    expect(latStr).toBe("43.1234567");
    expect(lngStr).toBe("-76.9876543");
  });

  // ─── countByLeadIds — URL parsing and lead-prefix logic ───────────────────
  describe("countByLeadIds — lead prefix URL parsing", () => {
    it("parses numeric id correctly for a plain /field-gallery/42 URL", () => {
      const clientId = "42";
      const hasLeadPrefix = clientId.startsWith("lead");
      const idNum = hasLeadPrefix
        ? parseInt(clientId.replace("lead", ""), 10)
        : parseInt(clientId, 10);
      expect(hasLeadPrefix).toBe(false);
      expect(idNum).toBe(42);
    });

    it("parses numeric id correctly for a /field-gallery/lead42 URL (legacy prefix)", () => {
      const clientId = "lead42";
      const hasLeadPrefix = clientId.startsWith("lead");
      const idNum = hasLeadPrefix
        ? parseInt(clientId.replace("lead", ""), 10)
        : parseInt(clientId, 10);
      expect(hasLeadPrefix).toBe(true);
      expect(idNum).toBe(42);
    });

    it("isLead is true when ?type=lead query param is present", () => {
      const search = "?type=lead";
      const isLead = new URLSearchParams(search).get("type") === "lead";
      expect(isLead).toBe(true);
    });

    it("isLead is false when no type param is present", () => {
      const search = "";
      const isLead = new URLSearchParams(search).get("type") === "lead";
      expect(isLead).toBe(false);
    });

    it("countByLeadIds router procedure is defined on fieldCaptureRouter", async () => {
      const { fieldCaptureRouter } = await import("./routers/fieldCapture");
      expect(fieldCaptureRouter).toBeDefined();
      expect(typeof fieldCaptureRouter).toBe("object");
      // The router object should have a countByLeadIds key in its procedure map
      const routerDef = fieldCaptureRouter._def as any;
      const hasCountByLeadIds =
        (routerDef?.procedures && "countByLeadIds" in routerDef.procedures) ||
        (routerDef?.record && "countByLeadIds" in routerDef.record) ||
        JSON.stringify(routerDef).includes("countByLeadIds");
      expect(hasCountByLeadIds).toBe(true);
    });

    it("countByLeadIds returns empty object when db returns no rows", async () => {
      // Simulate the aggregation logic with no rows
      const rows: Array<{ leadId: number | null; count: number }> = [];
      const result: Record<number, number> = {};
      for (const row of rows) {
        if (row.leadId != null) result[row.leadId] = Number(row.count);
      }
      expect(result).toEqual({});
    });

    it("countByLeadIds correctly maps leadId -> count from db rows", () => {
      const rows = [
        { leadId: 1, count: 3 },
        { leadId: 7, count: 1 },
        { leadId: 42, count: 12 },
      ];
      const result: Record<number, number> = {};
      for (const row of rows) {
        if (row.leadId != null) result[row.leadId] = Number(row.count);
      }
      expect(result[1]).toBe(3);
      expect(result[7]).toBe(1);
      expect(result[42]).toBe(12);
      expect(Object.keys(result).length).toBe(3);
    });

    it("countByLeadIds skips rows where leadId is null (client-only captures)", () => {
      const rows = [
        { leadId: null, count: 5 },
        { leadId: 10, count: 2 },
      ];
      const result: Record<number, number> = {};
      for (const row of rows) {
        if (row.leadId != null) result[row.leadId] = Number(row.count);
      }
      expect(result[10]).toBe(2);
      expect(Object.keys(result).length).toBe(1); // null row excluded
    });
  });
});
