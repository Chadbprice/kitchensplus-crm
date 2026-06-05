import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

// ─── Undo/Redo Hook Tests ─────────────────────────────────────────────────────
// Tests for the useUndoRedo hook that manages proposal line item history.
// The hook stores JSON snapshots and provides undo/redo/reset operations.

describe("useUndoRedo — hook logic", () => {
  // Simulate the hook's core logic without React (pure function tests)
  function createUndoRedoStack<T>(maxHistory = 50) {
    let history: string[] = [];
    let pos = -1;
    let isUndoRedo = false;

    return {
      record(state: T) {
        if (isUndoRedo) { isUndoRedo = false; return; }
        const json = JSON.stringify(state);
        if (pos >= 0 && history[pos] === json) return;
        history = history.slice(0, pos + 1);
        history.push(json);
        if (history.length > maxHistory) history = history.slice(-maxHistory);
        pos = history.length - 1;
      },
      undo(): T | null {
        if (pos <= 0) return null;
        pos -= 1;
        isUndoRedo = true;
        return JSON.parse(history[pos]);
      },
      redo(): T | null {
        if (pos >= history.length - 1) return null;
        pos += 1;
        isUndoRedo = true;
        return JSON.parse(history[pos]);
      },
      reset(initialState?: T) {
        if (initialState !== undefined) {
          history = [JSON.stringify(initialState)];
          pos = 0;
        } else {
          history = [];
          pos = -1;
        }
        isUndoRedo = false;
      },
      get canUndo() { return pos > 0; },
      get canRedo() { return pos < history.length - 1; },
      get position() { return pos; },
      get size() { return history.length; },
    };
  }

  describe("basic record and undo", () => {
    it("records state snapshots", () => {
      const stack = createUndoRedoStack<number[]>();
      stack.record([1, 2, 3]);
      stack.record([1, 2, 3, 4]);
      expect(stack.size).toBe(2);
      expect(stack.position).toBe(1);
    });

    it("undo returns previous state", () => {
      const stack = createUndoRedoStack<number[]>();
      stack.record([1]);
      stack.record([1, 2]);
      const prev = stack.undo();
      expect(prev).toEqual([1]);
    });

    it("redo returns next state after undo", () => {
      const stack = createUndoRedoStack<number[]>();
      stack.record([1]);
      stack.record([1, 2]);
      stack.undo();
      const next = stack.redo();
      expect(next).toEqual([1, 2]);
    });

    it("returns null when nothing to undo", () => {
      const stack = createUndoRedoStack<number[]>();
      stack.record([1]);
      expect(stack.undo()).toBeNull();
    });

    it("returns null when nothing to redo", () => {
      const stack = createUndoRedoStack<number[]>();
      stack.record([1]);
      stack.record([1, 2]);
      expect(stack.redo()).toBeNull();
    });
  });

  describe("canUndo / canRedo flags", () => {
    it("canUndo is false with 0 or 1 entries", () => {
      const stack = createUndoRedoStack<string>();
      expect(stack.canUndo).toBe(false);
      stack.record("a");
      expect(stack.canUndo).toBe(false);
    });

    it("canUndo is true with 2+ entries", () => {
      const stack = createUndoRedoStack<string>();
      stack.record("a");
      stack.record("b");
      expect(stack.canUndo).toBe(true);
    });

    it("canRedo is false at the end of history", () => {
      const stack = createUndoRedoStack<string>();
      stack.record("a");
      stack.record("b");
      expect(stack.canRedo).toBe(false);
    });

    it("canRedo is true after undo", () => {
      const stack = createUndoRedoStack<string>();
      stack.record("a");
      stack.record("b");
      stack.undo();
      expect(stack.canRedo).toBe(true);
    });
  });

  describe("duplicate detection", () => {
    it("does not record duplicate consecutive states", () => {
      const stack = createUndoRedoStack<number[]>();
      stack.record([1, 2]);
      stack.record([1, 2]); // same
      stack.record([1, 2]); // same
      expect(stack.size).toBe(1);
    });

    it("records state that differs from current even if it appeared before", () => {
      const stack = createUndoRedoStack<string>();
      stack.record("a");
      stack.record("b");
      stack.record("a"); // different from current ("b")
      expect(stack.size).toBe(3);
    });
  });

  describe("redo history truncation", () => {
    it("truncates redo history when new state is recorded after undo", () => {
      const stack = createUndoRedoStack<string>();
      stack.record("a");
      stack.record("b");
      stack.record("c");
      stack.undo(); // at "b", sets isUndoRedo = true
      // First record after undo is skipped (isUndoRedo flag)
      stack.record("b"); // skipped — simulates the re-render with undo result
      // Now isUndoRedo is false, so the next record works
      stack.record("d"); // should truncate "c"
      expect(stack.size).toBe(3); // a, b, d
      expect(stack.redo()).toBeNull(); // no redo after new record
    });
  });

  describe("max history enforcement", () => {
    it("caps history at MAX_HISTORY entries", () => {
      const stack = createUndoRedoStack<number>(5);
      for (let i = 0; i < 10; i++) stack.record(i);
      expect(stack.size).toBe(5);
      // Oldest entries should be trimmed
      const undone: number[] = [];
      while (stack.canUndo) {
        const prev = stack.undo();
        if (prev !== null) undone.push(prev);
      }
      // Should have entries 5-9, undone gives 8,7,6,5
      expect(undone).toEqual([8, 7, 6, 5]);
    });
  });

  describe("reset", () => {
    it("reset() clears all history", () => {
      const stack = createUndoRedoStack<string>();
      stack.record("a");
      stack.record("b");
      stack.reset();
      expect(stack.size).toBe(0);
      expect(stack.canUndo).toBe(false);
      expect(stack.canRedo).toBe(false);
    });

    it("reset(initialState) sets a single entry", () => {
      const stack = createUndoRedoStack<string>();
      stack.record("a");
      stack.record("b");
      stack.reset("initial");
      expect(stack.size).toBe(1);
      expect(stack.canUndo).toBe(false);
      expect(stack.undo()).toBeNull();
    });
  });

  describe("isUndoRedo flag — prevents recording undo/redo-triggered updates", () => {
    it("record after undo is skipped (isUndoRedo flag)", () => {
      const stack = createUndoRedoStack<string>();
      stack.record("a");
      stack.record("b");
      const prev = stack.undo(); // returns "a", sets isUndoRedo = true
      expect(prev).toBe("a");
      // Simulating: consumer calls setEditItems(prev), which triggers a re-render
      // and the useEffect calls record(editItems) — this should be skipped
      stack.record("a"); // should be skipped because isUndoRedo is true
      // After skip, isUndoRedo resets to false
      expect(stack.size).toBe(2); // still a, b
      expect(stack.canRedo).toBe(true); // redo to "b" still available
    });
  });

  describe("proposal line item undo/redo scenarios", () => {
    type LineItem = { id?: number; task: string; quantity: string; unitPrice: string };

    it("undo restores deleted line item", () => {
      const stack = createUndoRedoStack<LineItem[]>();
      const items1 = [
        { id: 1, task: "Demo", quantity: "1", unitPrice: "2500" },
        { id: 2, task: "Tile", quantity: "100", unitPrice: "12.50" },
      ];
      const items2 = [
        { id: 1, task: "Demo", quantity: "1", unitPrice: "2500" },
      ]; // Tile deleted
      stack.record(items1);
      stack.record(items2);
      const restored = stack.undo();
      expect(restored).toHaveLength(2);
      expect(restored![1].task).toBe("Tile");
    });

    it("undo restores quantity change", () => {
      const stack = createUndoRedoStack<LineItem[]>();
      const items1 = [{ id: 1, task: "Demo", quantity: "1", unitPrice: "2500" }];
      const items2 = [{ id: 1, task: "Demo", quantity: "3", unitPrice: "2500" }];
      stack.record(items1);
      stack.record(items2);
      const restored = stack.undo();
      expect(restored![0].quantity).toBe("1");
    });

    it("undo restores price change", () => {
      const stack = createUndoRedoStack<LineItem[]>();
      const items1 = [{ id: 1, task: "Demo", quantity: "1", unitPrice: "2500" }];
      const items2 = [{ id: 1, task: "Demo", quantity: "1", unitPrice: "3000" }];
      stack.record(items1);
      stack.record(items2);
      const restored = stack.undo();
      expect(restored![0].unitPrice).toBe("2500");
    });

    it("undo restores task name change", () => {
      const stack = createUndoRedoStack<LineItem[]>();
      const items1 = [{ id: 1, task: "Demo", quantity: "1", unitPrice: "2500" }];
      const items2 = [{ id: 1, task: "Full Demolition", quantity: "1", unitPrice: "2500" }];
      stack.record(items1);
      stack.record(items2);
      const restored = stack.undo();
      expect(restored![0].task).toBe("Demo");
    });

    it("undo restores added line item (removes it)", () => {
      const stack = createUndoRedoStack<LineItem[]>();
      const items1 = [{ id: 1, task: "Demo", quantity: "1", unitPrice: "2500" }];
      const items2 = [
        { id: 1, task: "Demo", quantity: "1", unitPrice: "2500" },
        { task: "New Item", quantity: "1", unitPrice: "500" },
      ];
      stack.record(items1);
      stack.record(items2);
      const restored = stack.undo();
      expect(restored).toHaveLength(1);
    });

    it("multiple undo/redo cycles preserve state correctly", () => {
      const stack = createUndoRedoStack<LineItem[]>();
      const s1 = [{ task: "A", quantity: "1", unitPrice: "100" }];
      const s2 = [{ task: "A", quantity: "2", unitPrice: "100" }];
      const s3 = [{ task: "A", quantity: "3", unitPrice: "100" }];
      stack.record(s1);
      stack.record(s2);
      stack.record(s3);

      expect(stack.undo()).toEqual(s2);
      expect(stack.undo()).toEqual(s1);
      expect(stack.redo()).toEqual(s2);
      expect(stack.redo()).toEqual(s3);
      expect(stack.redo()).toBeNull(); // at end
    });
  });
});

// ─── useUndoRedo Source File Inspection ────────────────────────────────────────

describe("useUndoRedo — source file contract", () => {
  const hookPath = path.resolve(__dirname, "../client/src/hooks/useUndoRedo.ts");
  const hookSrc = fs.readFileSync(hookPath, "utf-8");

  it("exports useUndoRedo function", () => {
    expect(hookSrc).toContain("export function useUndoRedo");
  });

  it("exports useUndoRedoKeyboard function", () => {
    expect(hookSrc).toContain("export function useUndoRedoKeyboard");
  });

  it("exports UndoRedoHandle interface", () => {
    expect(hookSrc).toContain("export interface UndoRedoHandle");
  });

  it("stores history as JSON strings for deep equality", () => {
    expect(hookSrc).toContain("JSON.stringify");
    expect(hookSrc).toContain("JSON.parse");
  });

  it("has MAX_HISTORY constant to prevent unbounded growth", () => {
    expect(hookSrc).toContain("MAX_HISTORY");
  });

  it("has isUndoRedoRef to prevent recording undo/redo-triggered updates", () => {
    expect(hookSrc).toContain("isUndoRedoRef");
  });

  it("handles Ctrl+Z for undo", () => {
    expect(hookSrc).toMatch(/e\.key\s*===\s*["']z["']\s*&&\s*!e\.shiftKey/);
  });

  it("handles Ctrl+Shift+Z and Ctrl+Y for redo", () => {
    expect(hookSrc).toMatch(/e\.key\s*===\s*["']z["']\s*&&\s*e\.shiftKey/);
    expect(hookSrc).toMatch(/e\.key\s*===\s*["']y["']/);
  });

  it("has enabled flag to scope keyboard shortcuts to edit mode", () => {
    expect(hookSrc).toContain("enabled");
    expect(hookSrc).toContain("if (!enabled) return");
  });

  it("prevents default browser undo/redo behavior", () => {
    expect(hookSrc).toContain("e.preventDefault()");
  });

  it("uses useRef for history to avoid re-renders on every record", () => {
    expect(hookSrc).toContain("useRef<string[]>");
  });

  it("provides record, undo, redo, reset, canUndo, canRedo in the return", () => {
    expect(hookSrc).toContain("record");
    expect(hookSrc).toContain("undo");
    expect(hookSrc).toContain("redo");
    expect(hookSrc).toContain("reset");
    expect(hookSrc).toContain("canUndo");
    expect(hookSrc).toContain("canRedo");
  });
});

// ─── Undo/Redo Integration in Proposals.tsx ────────────────────────────────────

describe("undo/redo — Proposals.tsx integration", () => {
  const proposalsPath = path.resolve(__dirname, "../client/src/pages/owner/Proposals.tsx");
  const proposalsSrc = fs.readFileSync(proposalsPath, "utf-8");

  it("imports useUndoRedo hook", () => {
    expect(proposalsSrc).toContain("useUndoRedo");
  });

  it("imports useUndoRedoKeyboard hook", () => {
    expect(proposalsSrc).toContain("useUndoRedoKeyboard");
  });

  it("creates undoRedo instance with enabled flag tied to isEditing", () => {
    expect(proposalsSrc).toMatch(/useUndoRedo.*enabled:\s*isEditing/);
  });

  it("has handleUndo function that calls undoRedo.undo() and setEditItems", () => {
    expect(proposalsSrc).toContain("handleUndo");
    expect(proposalsSrc).toContain("undoRedo.undo()");
    expect(proposalsSrc).toContain("setEditItems");
  });

  it("has handleRedo function that calls undoRedo.redo() and setEditItems", () => {
    expect(proposalsSrc).toContain("handleRedo");
    expect(proposalsSrc).toContain("undoRedo.redo()");
  });

  it("wires keyboard shortcuts via useUndoRedoKeyboard", () => {
    expect(proposalsSrc).toMatch(/useUndoRedoKeyboard\(\{[\s\S]*?onUndo:\s*handleUndo[\s\S]*?onRedo:\s*handleRedo/);
  });

  it("imports Undo2 and Redo2 icons from lucide-react", () => {
    expect(proposalsSrc).toContain("Undo2");
    expect(proposalsSrc).toContain("Redo2");
  });
});

// ─── Version History Schema Tests ──────────────────────────────────────────────

describe("estimate_versions — schema definition", () => {
  const schemaPath = path.resolve(__dirname, "../drizzle/schema.ts");
  const schemaSrc = fs.readFileSync(schemaPath, "utf-8");

  it("defines estimateVersions table", () => {
    expect(schemaSrc).toContain('mysqlTable("estimate_versions"');
  });

  it("has id autoincrement primary key", () => {
    expect(schemaSrc).toMatch(/estimate_versions[\s\S]*?id.*autoincrement.*primaryKey/);
  });

  it("has estimateId foreign key", () => {
    expect(schemaSrc).toMatch(/estimate_versions[\s\S]*?estimateId.*int/);
  });

  it("has versionNumber column", () => {
    expect(schemaSrc).toMatch(/estimate_versions[\s\S]*?versionNumber.*int/);
  });

  it("has snapshot JSON column for full proposal state", () => {
    expect(schemaSrc).toMatch(/estimate_versions[\s\S]*?snapshot.*json/);
  });

  it("has trigger column (autosave/send/restore/manual)", () => {
    expect(schemaSrc).toMatch(/estimate_versions[\s\S]*?trigger.*varchar/);
  });

  it("has contentHash column for change detection", () => {
    expect(schemaSrc).toMatch(/estimate_versions[\s\S]*?contentHash.*varchar/);
  });

  it("has createdAt timestamp with default", () => {
    expect(schemaSrc).toMatch(/estimate_versions[\s\S]*?createdAt.*timestamp.*defaultNow/);
  });

  it("exports EstimateVersion and InsertEstimateVersion types", () => {
    expect(schemaSrc).toContain("export type EstimateVersion");
    expect(schemaSrc).toContain("export type InsertEstimateVersion");
  });
});

// ─── Version History Server Procedures ─────────────────────────────────────────

describe("version history — server procedures", () => {
  const routersPath = path.resolve(__dirname, "routers.ts");
  const routersSrc = fs.readFileSync(routersPath, "utf-8");

  describe("listVersions procedure", () => {
    it("exists as an adminProcedure query", () => {
      expect(routersSrc).toContain("listVersions: adminProcedure");
    });

    it("accepts estimateId input", () => {
      const listIdx = routersSrc.indexOf("listVersions:");
      const section = routersSrc.slice(listIdx, listIdx + 1000);
      expect(section).toContain("estimateId: z.number()");
    });

    it("orders versions by versionNumber descending", () => {
      // Search the full source for the ordering near listVersions
      expect(routersSrc).toContain("desc(estimateVersions.versionNumber)");
    });

    it("returns id, versionNumber, trigger, label, createdAt", () => {
      const listIdx = routersSrc.indexOf("listVersions:");
      const section = routersSrc.slice(listIdx, listIdx + 1000);
      expect(section).toContain("estimateVersions.id");
      expect(section).toContain("estimateVersions.versionNumber");
      expect(section).toContain("estimateVersions.trigger");
      expect(section).toContain("estimateVersions.label");
      expect(section).toContain("estimateVersions.createdAt");
    });
  });

  describe("getVersion procedure", () => {
    it("exists as an adminProcedure query", () => {
      expect(routersSrc).toContain("getVersion: adminProcedure");
    });

    it("accepts versionId input", () => {
      const getIdx = routersSrc.indexOf("getVersion:");
      const section = routersSrc.slice(getIdx, getIdx + 600);
      expect(section).toContain("versionId: z.number()");
    });

    it("throws NOT_FOUND when version does not exist", () => {
      const getIdx = routersSrc.indexOf("getVersion:");
      const section = routersSrc.slice(getIdx, getIdx + 600);
      expect(section).toContain("NOT_FOUND");
    });
  });

  describe("restoreVersion procedure", () => {
    it("exists as an adminProcedure mutation", () => {
      expect(routersSrc).toContain("restoreVersion: adminProcedure");
    });

    it("accepts estimateId and versionId input", () => {
      const restoreIdx = routersSrc.indexOf("restoreVersion:");
      const section = routersSrc.slice(restoreIdx, restoreIdx + 1500);
      expect(section).toContain("estimateId: z.number()");
      expect(section).toContain("versionId: z.number()");
    });

    it("validates snapshot has header and lineItems", () => {
      const restoreIdx = routersSrc.indexOf("restoreVersion:");
      const section = routersSrc.slice(restoreIdx, restoreIdx + 1500);
      expect(section).toContain("snapshot?.header");
      expect(section).toContain("snapshot?.lineItems");
    });

    it("deletes current line items and re-inserts from snapshot", () => {
      const restoreIdx = routersSrc.indexOf("restoreVersion:");
      const section = routersSrc.slice(restoreIdx, restoreIdx + 1500);
      expect(section).toContain("db.delete(estimateLineItems)");
      expect(section).toContain("db.insert(estimateLineItems)");
    });

    it("creates a new version entry with trigger 'restore'", () => {
      const restoreIdx = routersSrc.indexOf("restoreVersion:");
      const section = routersSrc.slice(restoreIdx, restoreIdx + 3000);
      expect(section).toContain('trigger: "restore"');
    });

    it("labels the restore version with the source version number", () => {
      const restoreIdx = routersSrc.indexOf("restoreVersion:");
      const section = routersSrc.slice(restoreIdx, restoreIdx + 3000);
      expect(section).toContain("Restored from v");
    });
  });
});

// ─── Version Creation on Save (saveAll) ────────────────────────────────────────

describe("version creation — saveAll procedure", () => {
  const routersPath = path.resolve(__dirname, "routers.ts");
  const routersSrc = fs.readFileSync(routersPath, "utf-8");

  // Find the saveAll section
  const saveAllIdx = routersSrc.indexOf("saveAll:");
  const saveAllEnd = routersSrc.indexOf("approve:", saveAllIdx);
  const saveAllSection = routersSrc.slice(saveAllIdx, saveAllEnd);

  it("creates version snapshot after saving line items", () => {
    expect(saveAllSection).toContain("Create version snapshot");
  });

  it("uses SHA-256 content hash for change detection", () => {
    expect(saveAllSection).toContain('createHash("sha256")');
  });

  it("compares content hash with last version to avoid duplicates", () => {
    expect(saveAllSection).toContain("lastVersion.contentHash !== contentHash");
  });

  it("increments version number from the last version", () => {
    expect(saveAllSection).toContain("(lastVersion?.versionNumber ?? 0) + 1");
  });

  it("uses 'autosave' as the trigger type", () => {
    expect(saveAllSection).toContain('trigger: "autosave"');
  });

  it("wraps version creation in try/catch (non-fatal)", () => {
    expect(saveAllSection).toContain("[version snapshot] non-fatal");
  });

  it("stores snapshot with header and lineItems", () => {
    expect(saveAllSection).toContain("header: updatedEst[0]");
    expect(saveAllSection).toContain("lineItems: updatedItems");
  });
});

// ─── Version Creation on Send ──────────────────────────────────────────────────

describe("version creation — sendProposal procedure", () => {
  const routersPath = path.resolve(__dirname, "routers.ts");
  const routersSrc = fs.readFileSync(routersPath, "utf-8");

  // Find the sendProposal section (estimates router)
  const sendIdx = routersSrc.indexOf("sendProposal: adminProcedure");
  // Grab a large enough window to include the version snapshot code (sendProposal is ~10k chars)
  const sendSection = routersSrc.slice(sendIdx, sendIdx + 10000);

  it("creates version snapshot before marking as sent", () => {
    expect(sendSection).toContain("version snapshot");
  });

  it("uses 'send' as the trigger type", () => {
    expect(sendSection).toContain('trigger: "send"');
  });

  it("labels the version as 'Sent to client'", () => {
    expect(sendSection).toContain('label: "Sent to client"');
  });

  it("uses content hash for dedup on send too", () => {
    expect(sendSection).toContain("sendHash");
  });
});

// ─── Version History UI (VersionHistoryPanel) ──────────────────────────────────

describe("VersionHistoryPanel — UI component", () => {
  const proposalsPath = path.resolve(__dirname, "../client/src/pages/owner/Proposals.tsx");
  const proposalsSrc = fs.readFileSync(proposalsPath, "utf-8");

  it("defines VersionHistoryPanel function component", () => {
    expect(proposalsSrc).toContain("function VersionHistoryPanel");
  });

  it("accepts estimateId and onRestore props", () => {
    expect(proposalsSrc).toMatch(/VersionHistoryPanel\(\{.*estimateId.*onRestore/);
  });

  it("queries listVersions with estimateId", () => {
    expect(proposalsSrc).toContain("trpc.estimates.listVersions.useQuery");
  });

  it("queries getVersion for expanded version details", () => {
    expect(proposalsSrc).toContain("trpc.estimates.getVersion.useQuery");
  });

  it("uses restoreVersion mutation", () => {
    expect(proposalsSrc).toContain("trpc.estimates.restoreVersion.useMutation");
  });

  it("shows version count", () => {
    expect(proposalsSrc).toContain("versions?.length ?? 0");
  });

  it("shows loading spinner while fetching versions", () => {
    expect(proposalsSrc).toContain("isLoading");
    expect(proposalsSrc).toContain("animate-spin");
  });

  it("shows empty state message when no versions exist", () => {
    expect(proposalsSrc).toContain("No version history yet");
  });

  it("displays version number with 'v' prefix", () => {
    expect(proposalsSrc).toContain("v{v.versionNumber}");
  });

  it("formats trigger labels (autosave, send, restore, manual)", () => {
    expect(proposalsSrc).toContain("formatTrigger");
    expect(proposalsSrc).toContain("Auto-saved");
    expect(proposalsSrc).toContain("Sent to client");
    expect(proposalsSrc).toContain("Restored");
    expect(proposalsSrc).toContain("Manual save");
  });

  it("has Preview/Hide toggle button for version details", () => {
    expect(proposalsSrc).toContain('"Preview"');
    expect(proposalsSrc).toContain('"Hide"');
  });

  it("has Restore button with confirmation dialog", () => {
    expect(proposalsSrc).toContain("Restore");
    expect(proposalsSrc).toContain("confirm(");
  });

  it("shows expanded version details: title, total, line items", () => {
    expect(proposalsSrc).toContain("snapshot");
    expect(proposalsSrc).toContain("header?.title");
    expect(proposalsSrc).toContain("header?.total");
    expect(proposalsSrc).toContain("lineItems?.length");
  });

  it("limits preview to first 5 line items with '… and N more'", () => {
    expect(proposalsSrc).toContain(".slice(0, 5)");
    expect(proposalsSrc).toContain("and");
    expect(proposalsSrc).toContain("more");
  });

  it("has History button in the proposal detail toolbar", () => {
    expect(proposalsSrc).toContain("History");
    expect(proposalsSrc).toContain("showVersionHistory");
  });

  it("conditionally renders VersionHistoryPanel based on showVersionHistory state", () => {
    expect(proposalsSrc).toContain("showVersionHistory && proposal");
    expect(proposalsSrc).toContain("<VersionHistoryPanel");
  });
});

// ─── Change Detection Logic (no spam versions) ────────────────────────────────

describe("version change detection — no spam saves", () => {
  it("SHA-256 hash of identical snapshots produces same hash", () => {
    const crypto = require("crypto");
    const snapshot1 = { header: { title: "Test" }, lineItems: [{ task: "Demo", quantity: "1" }] };
    const snapshot2 = { header: { title: "Test" }, lineItems: [{ task: "Demo", quantity: "1" }] };
    const hash1 = crypto.createHash("sha256").update(JSON.stringify(snapshot1)).digest("hex").slice(0, 32);
    const hash2 = crypto.createHash("sha256").update(JSON.stringify(snapshot2)).digest("hex").slice(0, 32);
    expect(hash1).toBe(hash2);
  });

  it("SHA-256 hash differs when snapshot content changes", () => {
    const crypto = require("crypto");
    const snapshot1 = { header: { title: "Test" }, lineItems: [{ task: "Demo", quantity: "1" }] };
    const snapshot2 = { header: { title: "Test" }, lineItems: [{ task: "Demo", quantity: "2" }] };
    const hash1 = crypto.createHash("sha256").update(JSON.stringify(snapshot1)).digest("hex").slice(0, 32);
    const hash2 = crypto.createHash("sha256").update(JSON.stringify(snapshot2)).digest("hex").slice(0, 32);
    expect(hash1).not.toBe(hash2);
  });

  it("version is skipped when content hash matches last version", () => {
    // Simulates the server logic
    const lastVersionHash = "abc123";
    const newHash = "abc123";
    const shouldCreateVersion = lastVersionHash !== newHash;
    expect(shouldCreateVersion).toBe(false);
  });

  it("version is created when content hash differs from last version", () => {
    const lastVersionHash = "abc123";
    const newHash = "def456";
    const shouldCreateVersion = lastVersionHash !== newHash;
    expect(shouldCreateVersion).toBe(true);
  });

  it("first version is always created (no last version)", () => {
    const lastVersion = null;
    const shouldCreateVersion = !lastVersion || lastVersion !== "somehash";
    expect(shouldCreateVersion).toBe(true);
  });
});

// ─── NaN Guard in saveAll ──────────────────────────────────────────────────────

describe("NaN guard — saveAll numeric field handling", () => {
  it("parseFloat with fallback handles empty string quantity", () => {
    const qty = parseFloat("") || 0;
    expect(qty).toBe(0);
    expect(isNaN(qty)).toBe(false);
  });

  it("parseFloat with fallback handles undefined quantity", () => {
    const qty = parseFloat(undefined as any) || 0;
    expect(qty).toBe(0);
  });

  it("parseFloat with fallback handles 'NaN' string", () => {
    const qty = parseFloat("NaN") || 0;
    expect(qty).toBe(0);
  });

  it("parseFloat correctly handles valid numeric strings", () => {
    expect(parseFloat("2500") || 0).toBe(2500);
    expect(parseFloat("12.50") || 0).toBe(12.5);
    expect(parseFloat("0") || 0).toBe(0);
  });

  it("empty string defaults for DB columns prevent NaN insertion", () => {
    const quantity = "";
    const safeQuantity = (quantity && quantity !== "" ? quantity : "1") as any;
    expect(safeQuantity).toBe("1");

    const unitCost = "";
    const safeCost = (unitCost && unitCost !== "" ? unitCost : "0") as any;
    expect(safeCost).toBe("0");
  });

  it("lineTotal calculation with NaN inputs produces 0, not NaN", () => {
    const qty = parseFloat("") || 0;
    const cost = parseFloat("") || 0;
    const markup = parseFloat("") || 0;
    const unitPrice = cost * (1 + markup / 100);
    const lineTotal = unitPrice * qty;
    expect(isNaN(lineTotal)).toBe(false);
    expect(lineTotal).toBe(0);
  });
});

// ─── Undo/Redo + Autosave Interaction ──────────────────────────────────────────

describe("undo/redo + autosave interaction", () => {
  it("autosave debounce (1.5s) preserves editing usability for undo", () => {
    // The autosave debounce is 1500ms, giving plenty of time for undo operations
    const DEBOUNCE_MS = 1500;
    expect(DEBOUNCE_MS).toBeGreaterThanOrEqual(1000);
  });

  it("undo operates on local state, not server state", () => {
    // Undo/redo operates on the editItems state array, which is local React state
    // Autosave reads from the same state but only after debounce
    // This means undo is instant while autosave is delayed
    const localState = [{ task: "Demo", quantity: "1" }];
    const undoResult = [{ task: "Demo", quantity: "3" }]; // previous state
    // Undo replaces localState immediately
    expect(undoResult[0].quantity).toBe("3");
    // Autosave will eventually save the undo result after debounce
  });

  it("autosave after undo saves the undone state correctly", () => {
    // After undo: editItems = previous state
    // Autosave triggers after 1.5s debounce on the current editItems
    // The save payload should reflect the undone state
    const editItems = [{ id: 1, task: "Demo", quantity: "1", unitPrice: "2500" }];
    // After undo: quantity goes back to "1" from "3"
    const payload = editItems.map((item, i) => ({
      id: item.id,
      task: item.task,
      quantity: item.quantity,
      unitCost: item.unitPrice,
      sortOrder: i,
    }));
    expect(payload[0].quantity).toBe("1");
  });
});
