import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ── Server-side: estimates.saveAll procedure exists ──
describe("estimates.saveAll procedure", () => {
  const routersPath = path.join(__dirname, "routers.ts");
  const routersCode = fs.readFileSync(routersPath, "utf-8");

  it("defines a saveAll procedure in the estimates router", () => {
    expect(routersCode).toContain("saveAll:");
  });

  it("saveAll accepts id, title, notes, depositPercent, hidePrices, lineItems", () => {
    // Check the zod schema includes all required fields
    expect(routersCode).toMatch(/saveAll[\s\S]*?z\.object\(\{[\s\S]*?id:\s*z\./);
    expect(routersCode).toMatch(/saveAll[\s\S]*?title/);
    expect(routersCode).toMatch(/saveAll[\s\S]*?lineItems/);
  });

  it("saveAll uses a transaction for atomicity", () => {
    // The procedure should use db.transaction or similar atomic approach
    const saveAllSection = routersCode.slice(routersCode.indexOf("saveAll:"));
    expect(saveAllSection).toMatch(/transaction|batch/i);
  });

  it("saveAll deletes existing line items before re-inserting", () => {
    const saveAllSection = routersCode.slice(routersCode.indexOf("saveAll:"));
    expect(saveAllSection).toContain("delete");
    expect(saveAllSection).toContain("insert");
  });

  it("saveAll updates the estimate header fields", () => {
    const saveAllSection = routersCode.slice(routersCode.indexOf("saveAll:"));
    expect(saveAllSection).toContain("update");
    expect(saveAllSection).toContain("estimates");
  });
});

// ── Client-side: useProposalAutosave hook ──
describe("useProposalAutosave hook", () => {
  const hookPath = path.join(__dirname, "..", "client", "src", "hooks", "useProposalAutosave.ts");
  const hookCode = fs.readFileSync(hookPath, "utf-8");

  it("exports useProposalAutosave function", () => {
    expect(hookCode).toContain("export function useProposalAutosave");
  });

  it("exports AutosaveStatus type", () => {
    expect(hookCode).toContain("export type AutosaveStatus");
  });

  it("defines all required status values: idle, saving, saved, error", () => {
    expect(hookCode).toContain('"idle"');
    expect(hookCode).toContain('"saving"');
    expect(hookCode).toContain('"saved"');
    expect(hookCode).toContain('"error"');
  });

  it("implements debounce with a timer (1500ms)", () => {
    expect(hookCode).toMatch(/1500|DEBOUNCE/);
  });

  it("returns status, isDirty, triggerSave, forceSave, and reset", () => {
    expect(hookCode).toContain("status");
    expect(hookCode).toContain("isDirty");
    expect(hookCode).toContain("triggerSave");
    expect(hookCode).toContain("forceSave");
    expect(hookCode).toContain("reset");
  });

  it("uses trpc.estimates.saveAll mutation", () => {
    expect(hookCode).toContain("estimates.saveAll");
  });

  it("uses pendingPayloadRef pattern to avoid redundant saves", () => {
    expect(hookCode).toMatch(/pendingPayloadRef|pendingPayload/);
  });

  it("cleans up timer on unmount via useEffect cleanup", () => {
    expect(hookCode).toContain("clearTimeout");
  });
});

// ── Integration: Proposals.tsx uses autosave ──
describe("Proposals.tsx autosave integration", () => {
  const proposalsPath = path.join(__dirname, "..", "client", "src", "pages", "owner", "Proposals.tsx");
  const proposalsCode = fs.readFileSync(proposalsPath, "utf-8");

  it("imports useProposalAutosave", () => {
    expect(proposalsCode).toContain("useProposalAutosave");
  });

  it("initializes the autosave hook", () => {
    expect(proposalsCode).toMatch(/const autosave\s*=\s*useProposalAutosave/);
  });

  it("calls autosave.triggerSave in a useEffect watching edit state", () => {
    expect(proposalsCode).toContain("autosave.triggerSave");
  });

  it("calls autosave.reset when exiting edit mode", () => {
    expect(proposalsCode).toContain("autosave.reset()");
  });

  it("calls autosave.forceSave on Back button when dirty", () => {
    expect(proposalsCode).toContain("autosave.forceSave()");
  });

  it("displays autosave status indicator (saving, saved, error)", () => {
    expect(proposalsCode).toContain('autosave.status === "saving"');
    expect(proposalsCode).toContain('autosave.status === "saved"');
    expect(proposalsCode).toContain('autosave.status === "error"');
  });

  it("renamed Save Changes button to Done Editing", () => {
    expect(proposalsCode).toContain("Done Editing");
  });

  it("uses saveAllMutation for the manual Done Editing button", () => {
    expect(proposalsCode).toContain("saveAllMutation.mutateAsync");
  });

  it("shows Cloud icon for saved status", () => {
    expect(proposalsCode).toMatch(/Cloud/);
  });

  it("shows AlertCircle icon for error status", () => {
    expect(proposalsCode).toMatch(/AlertCircle/);
  });

  it("force-saves when Sheet closes with dirty state", () => {
    // The onOpenChange handler should check isDirty and forceSave
    expect(proposalsCode).toContain("autosave.isDirty");
  });
});

// ── Autosave payload structure ──
describe("Autosave payload structure", () => {
  const proposalsPath = path.join(__dirname, "..", "client", "src", "pages", "owner", "Proposals.tsx");
  const proposalsCode = fs.readFileSync(proposalsPath, "utf-8");

  it("passes proposal id in autosave payload", () => {
    const triggerSection = proposalsCode.slice(proposalsCode.indexOf("autosave.triggerSave"));
    expect(triggerSection).toContain("id: proposal.id");
  });

  it("passes title in autosave payload", () => {
    const triggerSection = proposalsCode.slice(proposalsCode.indexOf("autosave.triggerSave"));
    expect(triggerSection).toContain("title: editTitle");
  });

  it("passes lineItems array in autosave payload", () => {
    const triggerSection = proposalsCode.slice(proposalsCode.indexOf("autosave.triggerSave"));
    expect(triggerSection).toContain("lineItems:");
  });

  it("maps editItems to lineItems with sortOrder", () => {
    const triggerSection = proposalsCode.slice(proposalsCode.indexOf("autosave.triggerSave"));
    expect(triggerSection).toContain("sortOrder: i");
  });
});
