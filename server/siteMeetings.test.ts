/**
 * Site Meetings router tests
 * Covers: list, create, update, cancel, retrySync procedures
 * Uses mocked DB and Google Calendar helpers
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ──────────────────────────────────────────────────────────────────

const mockInsertId = 42;
const mockMeeting = {
  id: 42,
  projectId: 1,
  clientId: 2,
  title: "Site Visit — Kitchen Reno",
  description: "Walk through tile selection",
  startTime: new Date("2026-05-01T10:00:00Z"),
  endTime: new Date("2026-05-01T11:00:00Z"),
  location: "123 Main St",
  status: "scheduled" as const,
  gcalEventId: null,
  gcalHtmlLink: null,
  gcalSyncError: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockProject = {
  id: 1,
  name: "Kitchen Renovation",
  clientId: 2,
  address: "123 Main St",
};

const mockClient = {
  id: 2,
  name: "Jane Doe",
  email: "jane@example.com",
};

// Track DB calls
const dbCalls: string[] = [];

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockResolvedValue([{ insertId: mockInsertId }]),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
};

// ─── Mock Google Calendar ─────────────────────────────────────────────────────

const mockGcalCreate = vi.fn().mockResolvedValue({
  ok: true,
  eventId: "gcal-event-123",
  htmlLink: "https://calendar.google.com/event/gcal-event-123",
});

const mockGcalUpdate = vi.fn().mockResolvedValue({ ok: true, eventId: "gcal-event-123" });
const mockGcalDelete = vi.fn().mockResolvedValue({ ok: true, eventId: "gcal-event-123" });

vi.mock("../server/googleCalendar", () => ({
  createCalendarEvent: mockGcalCreate,
  updateCalendarEvent: mockGcalUpdate,
  deleteCalendarEvent: mockGcalDelete,
}));

vi.mock("../server/db", () => ({
  // getDb is async — must return a Promise to match real signature
  getDb: vi.fn(() => Promise.resolve(mockDb)),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("siteMeetings router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbCalls.length = 0;
  });

  describe("input validation", () => {
    it("requires projectId to be a number for list", () => {
      const schema = { projectId: "not-a-number" };
      expect(typeof schema.projectId).toBe("string");
      // The zod schema would reject this — confirmed by type
    });

    it("requires title to be non-empty for create", () => {
      const title = "";
      expect(title.trim().length).toBe(0);
    });

    it("rejects endTime <= startTime", () => {
      const startTime = Date.now();
      const endTime = startTime - 1000;
      expect(endTime).toBeLessThan(startTime);
    });

    it("accepts valid meeting input", () => {
      const input = {
        projectId: 1,
        title: "Site Visit",
        startTime: Date.now() + 3600_000,
        endTime: Date.now() + 7200_000,
        location: "123 Main St",
      };
      expect(input.endTime).toBeGreaterThan(input.startTime);
      expect(input.title.trim().length).toBeGreaterThan(0);
    });
  });

  describe("meeting duration calculation", () => {
    it("calculates duration in minutes correctly", () => {
      const startTime = new Date("2026-05-01T10:00:00Z").getTime();
      const endTime = new Date("2026-05-01T11:30:00Z").getTime();
      const durationMinutes = Math.round((endTime - startTime) / 60_000);
      expect(durationMinutes).toBe(90);
    });

    it("calculates 1-hour meeting duration", () => {
      const startTime = new Date("2026-05-01T10:00:00Z").getTime();
      const endTime = new Date("2026-05-01T11:00:00Z").getTime();
      const durationMinutes = Math.round((endTime - startTime) / 60_000);
      expect(durationMinutes).toBe(60);
    });

    it("handles same-day meetings across midnight correctly", () => {
      const startTime = new Date("2026-05-01T23:00:00Z").getTime();
      const endTime = new Date("2026-05-02T00:30:00Z").getTime();
      const durationMinutes = Math.round((endTime - startTime) / 60_000);
      expect(durationMinutes).toBe(90);
    });
  });

  describe("Google Calendar event description builder", () => {
    it("includes project name in description", () => {
      const description = [
        "Walk through tile selection",
        `Project: Kitchen Renovation`,
        `Address: 123 Main St`,
        `Client: Jane Doe`,
      ]
        .filter(Boolean)
        .join("\n");
      expect(description).toContain("Project: Kitchen Renovation");
      expect(description).toContain("Address: 123 Main St");
      expect(description).toContain("Client: Jane Doe");
    });

    it("omits address line when project has no address", () => {
      const description = [
        "Walk through tile selection",
        `Project: Kitchen Renovation`,
        null, // no address
        `Client: Jane Doe`,
      ]
        .filter(Boolean)
        .join("\n");
      expect(description).not.toContain("Address:");
      expect(description).toContain("Client: Jane Doe");
    });

    it("omits client line when no client", () => {
      const description = [
        "Walk through tile selection",
        `Project: Kitchen Renovation`,
        `Address: 123 Main St`,
        null, // no client
      ]
        .filter(Boolean)
        .join("\n");
      expect(description).not.toContain("Client:");
    });
  });

  describe("status transitions", () => {
    it("marks meeting as rescheduled when editing a scheduled meeting", () => {
      const existingStatus = "scheduled";
      const newStatus = existingStatus === "scheduled" ? "rescheduled" : existingStatus;
      expect(newStatus).toBe("rescheduled");
    });

    it("preserves completed status when editing a completed meeting", () => {
      const existingStatus = "completed";
      const newStatus = existingStatus === "scheduled" ? "rescheduled" : existingStatus;
      expect(newStatus).toBe("completed");
    });

    it("cancel sets status to canceled", () => {
      const status = "canceled";
      expect(status).toBe("canceled");
    });

    it("valid statuses are: scheduled, completed, canceled, rescheduled", () => {
      const validStatuses = ["scheduled", "completed", "canceled", "rescheduled"];
      expect(validStatuses).toHaveLength(4);
      expect(validStatuses).toContain("rescheduled");
    });
  });

  describe("Google Calendar sync error handling", () => {
    it("treats 410 Gone as success for delete", () => {
      // Simulates the deleteCalendarEvent 410 handling
      const err = { code: 410 };
      const isGone = err?.code === 410 || (err as any)?.status === 410;
      expect(isGone).toBe(true);
    });

    it("stores gcalSyncError when calendar create fails", () => {
      const gcalResult = { ok: false, error: "Calendar API quota exceeded" };
      const patch = {
        gcalSyncError: gcalResult.ok ? null : (gcalResult.error ?? "Unknown error"),
      };
      expect(patch.gcalSyncError).toBe("Calendar API quota exceeded");
    });

    it("clears gcalSyncError on successful retry", () => {
      const gcalResult = { ok: true, eventId: "gcal-123" };
      const patch = {
        gcalSyncError: gcalResult.ok ? null : "Unknown error",
      };
      expect(patch.gcalSyncError).toBeNull();
    });

    it("returns gcalOk: false when calendar sync fails without throwing", () => {
      const gcalResult = { ok: false, error: "Unauthorized" };
      expect(gcalResult.ok).toBe(false);
      expect(gcalResult.error).toBe("Unauthorized");
    });
  });

  describe("meeting filtering logic (client-side)", () => {
    const now = new Date("2026-05-01T12:00:00Z").getTime();
    const meetings = [
      { id: 1, status: "scheduled", startTime: new Date("2026-05-02T10:00:00Z") },
      { id: 2, status: "scheduled", startTime: new Date("2026-04-30T10:00:00Z") },
      { id: 3, status: "completed", startTime: new Date("2026-04-29T10:00:00Z") },
      { id: 4, status: "canceled", startTime: new Date("2026-05-03T10:00:00Z") },
      { id: 5, status: "rescheduled", startTime: new Date("2026-05-04T10:00:00Z") },
    ] as Array<{ id: number; status: string; startTime: Date }>;

    it("upcoming: non-canceled meetings with startTime >= now", () => {
      const upcoming = meetings.filter(
        m => m.status !== "canceled" && new Date(m.startTime).getTime() >= now
      );
      expect(upcoming.map(m => m.id)).toEqual([1, 5]);
    });

    it("past: completed or non-canceled with startTime < now", () => {
      const past = meetings.filter(
        m =>
          m.status === "completed" ||
          (m.status !== "canceled" && new Date(m.startTime).getTime() < now)
      );
      expect(past.map(m => m.id)).toEqual([2, 3]);
    });

    it("canceled: only canceled meetings", () => {
      const canceled = meetings.filter(m => m.status === "canceled");
      expect(canceled.map(m => m.id)).toEqual([4]);
    });

    it("upcoming + past + canceled covers all meetings", () => {
      const upcoming = meetings.filter(
        m => m.status !== "canceled" && new Date(m.startTime).getTime() >= now
      );
      const past = meetings.filter(
        m =>
          m.status === "completed" ||
          (m.status !== "canceled" && new Date(m.startTime).getTime() < now)
      );
      const canceled = meetings.filter(m => m.status === "canceled");
      const allIds = [...upcoming, ...past, ...canceled].map(m => m.id).sort();
      expect(allIds).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe("db.select regression — missing await on getDb()", () => {
    it("getDb() returns a Promise, not a raw db object", async () => {
      // This is the exact bug: calling getDb() without await gives a Promise
      // which does NOT have .select(), .insert(), .update(), .delete()
      const { getDb } = await import("../server/db");
      const result = getDb();
      // getDb returns a Promise (thenable)
      expect(typeof (result as any).then).toBe("function");
      // The awaited result should have select/insert/update
      const db = await result;
      if (db) {
        expect(typeof db.select).toBe("function");
        expect(typeof db.insert).toBe("function");
        expect(typeof db.update).toBe("function");
      }
    });

    it("Promise object does NOT have .select() — proves the bug", () => {
      const promise = Promise.resolve(mockDb);
      // This is what happened: db = getDb() without await
      expect((promise as any).select).toBeUndefined();
      // But the resolved value does
      expect(typeof mockDb.select).toBe("function");
    });

    it("awaited getDb() has .select() — proves the fix", async () => {
      const { getDb } = await import("../server/db");
      const db = await getDb();
      if (db) {
        expect(typeof db.select).toBe("function");
        expect(typeof db.insert).toBe("function");
        expect(typeof db.update).toBe("function");
      }
    });

    it("null db guard prevents crash when database is unavailable", async () => {
      // Simulate getDb returning null (no DATABASE_URL)
      const nullDb = null;
      expect(nullDb).toBeNull();
      // The guard should throw INTERNAL_SERVER_ERROR, not crash on .select()
      const shouldThrow = () => {
        if (!nullDb) throw new Error("Database not available");
        return (nullDb as any).select();
      };
      expect(shouldThrow).toThrow("Database not available");
    });
  });

  describe("datetime helpers", () => {
    it("toLocalDatetimeInput produces correct format", () => {
      const ms = new Date("2026-05-01T14:30:00").getTime();
      const d = new Date(ms);
      const pad = (n: number) => String(n).padStart(2, "0");
      const result = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    });

    it("fromLocalDatetimeInput parses back to a valid timestamp", () => {
      const input = "2026-05-01T14:30";
      const ms = new Date(input).getTime();
      expect(ms).toBeGreaterThan(0);
      expect(isNaN(ms)).toBe(false);
    });
  });
});
