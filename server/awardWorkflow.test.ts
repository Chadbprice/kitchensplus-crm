/**
 * Award Workflow Tests
 * Validates the sendAward, listAwardsBySubcontractor, portalRespondAward,
 * and proposalAttachments.listClientVisible procedures.
 */
import { describe, it, expect } from "vitest";
import { subcontractorsRouter } from "./routers/subcontractors";
import { proposalAttachmentsRouter } from "./routers/proposalAttachments";

describe("Subcontractors Router — Award Workflow", () => {
  it("exports sendAward procedure", () => {
    expect(subcontractorsRouter._def.procedures.sendAward).toBeDefined();
  });

  it("exports listAwards procedure", () => {
    expect(subcontractorsRouter._def.procedures.listAwards).toBeDefined();
  });

  it("exports portalRespondAward procedure", () => {
    expect(subcontractorsRouter._def.procedures.portalRespondAward).toBeDefined();
  });

  it("sendAward is a mutation (not a query)", () => {
    const proc = subcontractorsRouter._def.procedures.sendAward;
    // tRPC mutations have _def.type === 'mutation'
    expect(proc._def.type).toBe("mutation");
  });

  it("portalRespondAward is a mutation", () => {
    const proc = subcontractorsRouter._def.procedures.portalRespondAward;
    expect(proc._def.type).toBe("mutation");
  });

  it("listAwards is a query", () => {
    const proc = subcontractorsRouter._def.procedures.listAwards;
    expect(proc._def.type).toBe("query");
  });
});

describe("ProposalAttachments Router — Client Visible", () => {
  it("exports listClientVisible procedure", () => {
    expect(proposalAttachmentsRouter._def.procedures.listClientVisible).toBeDefined();
  });

  it("listClientVisible is a query", () => {
    const proc = proposalAttachmentsRouter._def.procedures.listClientVisible;
    expect(proc._def.type).toBe("query");
  });
});
