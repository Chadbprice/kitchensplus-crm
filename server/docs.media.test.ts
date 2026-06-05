/**
 * Tests for documents.uploadFile and documents.getDesignNotesByLead procedures.
 * These are the two new procedures added to support the owner-side
 * "Docs & Media" tab on the ProjectDetail page.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn(),
}));

vi.mock("nanoid", () => ({
  nanoid: () => "test-nano-id",
}));

import { getDb } from "./db";
import { storagePut } from "./storage";
import { appRouter } from "./routers";

function makeOwnerCtx() {
  return {
    user: { id: 1, name: "Chad Price", role: "owner" },
    req: { cookies: {} } as any,
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as any,
  };
}

function makeUserCtx() {
  return {
    user: { id: 2, name: "Regular User", role: "user" },
    req: { cookies: {} } as any,
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as any,
  };
}

// ── documents.uploadFile ─────────────────────────────────────────────────────

describe("documents.uploadFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads a file to S3 and inserts a document row", async () => {
    const mockInsert = vi.fn().mockResolvedValue([{}]);
    // select() is called twice: first for leadId resolution (from→where→limit→resolve),
    // then for LAST_INSERT_ID (from→resolve)
    const mockSelect = vi.fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ leadId: 5 }]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockResolvedValue([{ newId: 42 }]),
      });
    const mockDb = {
      insert: vi.fn().mockReturnValue({ values: mockInsert }),
      select: mockSelect,
    };
    (getDb as any).mockResolvedValue(mockDb);
    (storagePut as any).mockResolvedValue({ url: "https://cdn.example.com/test.jpg" });

    const caller = appRouter.createCaller(makeOwnerCtx() as any);
    const result = await caller.documents.uploadFile({
      projectId: 1,
      fileName: "test.jpg",
      fileDataBase64: "data:image/jpeg;base64,/9j/4AAQ",
      mimeType: "image/jpeg",
      docType: "photo",
      description: "Test photo",
    });

    expect(storagePut).toHaveBeenCalledWith(
      expect.stringContaining("projects/1/photo/"),
      expect.any(Buffer),
      "image/jpeg"
    );
    expect(mockDb.insert).toHaveBeenCalled();
    expect(result).toMatchObject({ url: "https://cdn.example.com/test.jpg" });
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(makeUserCtx() as any);
    await expect(
      caller.documents.uploadFile({
        projectId: 1,
        fileName: "test.pdf",
        fileDataBase64: "data:application/pdf;base64,JVBERi0x",
        mimeType: "application/pdf",
        docType: "contract",
      })
    ).rejects.toThrow();
  });

  it("handles missing projectId gracefully (uses 'general' path)", async () => {
    const mockInsert = vi.fn().mockResolvedValue([{}]);
    // No projectId → no leadId resolution query, just LAST_INSERT_ID
    const mockSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockResolvedValue([{ newId: 99 }]),
    });
    const mockDb = {
      insert: vi.fn().mockReturnValue({ values: mockInsert }),
      select: mockSelect,
    };
    (getDb as any).mockResolvedValue(mockDb);
    (storagePut as any).mockResolvedValue({ url: "https://cdn.example.com/general.pdf" });

    const caller = appRouter.createCaller(makeOwnerCtx() as any);
    const result = await caller.documents.uploadFile({
      fileName: "contract.pdf",
      fileDataBase64: "data:application/pdf;base64,JVBERi0x",
      mimeType: "application/pdf",
      docType: "contract",
    });

    expect(storagePut).toHaveBeenCalledWith(
      expect.stringContaining("projects/general/contract/"),
      expect.any(Buffer),
      "application/pdf"
    );
    expect(result.url).toBe("https://cdn.example.com/general.pdf");
  });
});

// ── documents.getDesignNotesByLead ───────────────────────────────────────────

describe("documents.getDesignNotesByLead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns design notes for the given leadId", async () => {
    const mockNotes = [
      { id: 1, leadId: 5, room: "Kitchen", note: "Quartz countertops", createdAt: new Date(), updatedAt: new Date() },
      { id: 2, leadId: 5, room: "Bathroom", note: "Walk-in shower", createdAt: new Date(), updatedAt: new Date() },
    ];
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockNotes),
          }),
        }),
      }),
    };
    (getDb as any).mockResolvedValue(mockDb);

    const caller = appRouter.createCaller(makeOwnerCtx() as any);
    const result = await caller.documents.getDesignNotesByLead({ leadId: 5 });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ room: "Kitchen", note: "Quartz countertops" });
    expect(result[1]).toMatchObject({ room: "Bathroom", note: "Walk-in shower" });
  });

  it("returns empty array when no notes exist", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };
    (getDb as any).mockResolvedValue(mockDb);

    const caller = appRouter.createCaller(makeOwnerCtx() as any);
    const result = await caller.documents.getDesignNotesByLead({ leadId: 999 });

    expect(result).toEqual([]);
  });

  it("returns empty array when db is unavailable", async () => {
    (getDb as any).mockResolvedValue(null);

    const caller = appRouter.createCaller(makeOwnerCtx() as any);
    const result = await caller.documents.getDesignNotesByLead({ leadId: 1 });

    expect(result).toEqual([]);
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(makeUserCtx() as any);
    await expect(
      caller.documents.getDesignNotesByLead({ leadId: 1 })
    ).rejects.toThrow();
  });
});
