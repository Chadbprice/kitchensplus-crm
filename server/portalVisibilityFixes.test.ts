import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import * as fs from "fs";

// ─── Source contract tests: verify the fixes are in place ────────────────────
// These tests read the actual source code to verify the identity-linking fixes
// are present and correct, serving as regression guards.

const routersSource = fs.readFileSync("server/routers.ts", "utf-8");
const clientPortalSource = fs.readFileSync("server/routers/clientPortal.ts", "utf-8");
const projectDetailSource = fs.readFileSync("client/src/pages/owner/ProjectDetail.tsx", "utf-8");

describe("Bug Fix #1: documents.create auto-resolves leadId", () => {
  // Find the documents.create procedure section
  const createIdx = routersSource.indexOf("create: protectedProcedure.input(z.object({\n    projectId: z.number().optional(),\n    vendorId: z.number().optional(),\n    clientId: z.number().optional(),\n    leadId: z.number().optional(),");
  const createSection = routersSource.slice(createIdx, createIdx + 1200);

  it("documents.create input schema accepts leadId", () => {
    expect(createSection).toContain("leadId: z.number().optional()");
  });

  it("documents.create auto-resolves leadId from project", () => {
    expect(createSection).toContain("let resolvedLeadId = input.leadId ?? null");
    expect(createSection).toContain("if (!resolvedLeadId && input.projectId)");
    expect(createSection).toContain("projects.leadId");
  });

  it("documents.create inserts resolvedLeadId into the row", () => {
    expect(createSection).toContain("leadId: resolvedLeadId");
  });
});

describe("Bug Fix #1b: documents.upload auto-resolves leadId", () => {
  const uploadIdx = routersSource.indexOf("// alias used by Documents.tsx frontend\n  upload: protectedProcedure");
  const uploadSection = routersSource.slice(uploadIdx, uploadIdx + 1200);

  it("documents.upload input schema accepts leadId", () => {
    expect(uploadSection).toContain("leadId: z.number().optional()");
  });

  it("documents.upload auto-resolves leadId from project", () => {
    expect(uploadSection).toContain("let resolvedLeadId = input.leadId ?? null");
    expect(uploadSection).toContain("if (!resolvedLeadId && input.projectId)");
  });

  it("documents.upload inserts resolvedLeadId", () => {
    expect(uploadSection).toContain("leadId: resolvedLeadId");
  });
});

describe("Bug Fix #1c: documents.uploadFile auto-resolves leadId", () => {
  const uploadFileIdx = routersSource.indexOf("// Owner: upload a project document (base64");
  const uploadFileSection = routersSource.slice(uploadFileIdx, uploadFileIdx + 1500);

  it("documents.uploadFile input schema accepts leadId", () => {
    expect(uploadFileSection).toContain("leadId: z.number().optional()");
  });

  it("documents.uploadFile auto-resolves leadId from project", () => {
    expect(uploadFileSection).toContain("let resolvedLeadId = input.leadId ?? null");
    expect(uploadFileSection).toContain("if (!resolvedLeadId && input.projectId)");
  });

  it("documents.uploadFile inserts resolvedLeadId into the row", () => {
    expect(uploadFileSection).toContain("leadId: resolvedLeadId");
  });
});

describe("Bug Fix #1d: documents.uploadInspirationPhoto auto-resolves leadId", () => {
  const inspIdx = routersSource.indexOf("// Upload inspiration photo bytes directly from client");
  const inspSection = routersSource.slice(inspIdx, inspIdx + 1500);

  it("uploadInspirationPhoto input schema accepts leadId", () => {
    expect(inspSection).toContain("leadId: z.number().optional()");
  });

  it("uploadInspirationPhoto auto-resolves leadId from project", () => {
    expect(inspSection).toContain("let resolvedLeadId = input.leadId ?? null");
    expect(inspSection).toContain("if (!resolvedLeadId && input.projectId)");
  });

  it("uploadInspirationPhoto inserts resolvedLeadId", () => {
    expect(inspSection).toContain("leadId: resolvedLeadId");
  });
});

describe("Bug Fix #2: ProjectDetail.tsx passes leadId to uploadFile", () => {
  it("uploadDocMutation.mutate includes leadId from project", () => {
    // Find the uploadDocMutation.mutate call
    const mutateIdx = projectDetailSource.indexOf("uploadDocMutation.mutate({");
    const mutateSection = projectDetailSource.slice(mutateIdx, mutateIdx + 300);
    expect(mutateSection).toContain("leadId: project?.leadId");
  });
});

describe("Bug Fix #2b: ProjectDetail.tsx invoice create uses project.leadId", () => {
  it("createMilestoneInvoice.mutate uses project.leadId (not just clientId)", () => {
    const mutateIdx = projectDetailSource.indexOf("createMilestoneInvoice.mutate({");
    const mutateSection = projectDetailSource.slice(mutateIdx, mutateIdx + 300);
    // Should use project.leadId as primary, with clientId as fallback
    expect(mutateSection).toContain("leadId: project.leadId");
  });
});

describe("Bug Fix #3: getRecentActivity queries documents by leadId OR projectId", () => {
  const activityIdx = clientPortalSource.indexOf("getRecentActivity:");
  const activitySection = clientPortalSource.slice(activityIdx, activityIdx + 2500);

  it("builds document conditions array with leadId", () => {
    expect(activitySection).toContain("docConditions");
    expect(activitySection).toContain("eq(documents.leadId, leadId)");
  });

  it("also includes projectId in document conditions", () => {
    expect(activitySection).toContain("eq(documents.projectId, projectId)");
  });

  it("uses or() to combine conditions", () => {
    expect(activitySection).toContain("or(...docConditions)");
  });
});

describe("Bug Fix #3b: getRecentPhotos queries by leadId OR projectId", () => {
  const photosIdx = clientPortalSource.indexOf("getRecentPhotos:");
  const photosSection = clientPortalSource.slice(photosIdx, photosIdx + 2500);

  it("fetches client projects for projectId fallback", () => {
    expect(photosSection).toContain("clientProjects");
    expect(photosSection).toContain("clientProjectIds");
  });

  it("builds photo conditions with leadId", () => {
    expect(photosSection).toContain("photoConditions");
    expect(photosSection).toContain("eq(documents.leadId, leadId)");
  });

  it("includes projectId via inArray for photos", () => {
    expect(photosSection).toContain("inArray(documents.projectId, clientProjectIds)");
  });

  it("combines conditions with or() and filters by photo docType", () => {
    expect(photosSection).toContain("or(...photoConditions)");
    expect(photosSection).toContain("eq(documents.docType, \"photo\")");
  });
});

describe("Bug Fix #4: getMyDocuments filters compliance in project-scoped branch", () => {
  const docsIdx = clientPortalSource.indexOf("getMyDocuments:");
  const docsSection = clientPortalSource.slice(docsIdx, docsIdx + 1500);

  it("project-scoped branch filters out compliance docs", () => {
    // The project-scoped branch should now filter hidden types
    const projectBranch = docsSection.slice(docsSection.indexOf("if (input?.projectId)"), docsSection.indexOf("// Return docs linked by leadId"));
    expect(projectBranch).toContain("hiddenTypes");
    expect(projectBranch).toContain("compliance");
    expect(projectBranch).toContain("filter");
  });
});

describe("Bug Fix #5: getMyProject and getMyProjectById use projectId for lastDoc", () => {
  it("getMyProject lastDocRows query uses or() with projectId", () => {
    const myProjectIdx = clientPortalSource.indexOf("getMyProject: publicProcedure.query");
    const myProjectSection = clientPortalSource.slice(myProjectIdx, myProjectIdx + 3000);
    const lastDocLine = myProjectSection.slice(myProjectSection.indexOf("lastDocRows"));
    expect(lastDocLine).toContain("or(eq(documents.leadId, leadId), eq(documents.projectId, project.id))");
  });

  it("getMyProjectById lastDocRows query uses or() with projectId", () => {
    const byIdIdx = clientPortalSource.indexOf("getMyProjectById: publicProcedure.input");
    const byIdSection = clientPortalSource.slice(byIdIdx, byIdIdx + 3000);
    const lastDocLine = byIdSection.slice(byIdSection.indexOf("lastDocRows"));
    expect(lastDocLine).toContain("or(eq(documents.leadId, leadId), eq(documents.projectId, project.id))");
  });
});

// ─── Structural tests: verify procedures exist on the router ─────────────────

describe("Client Portal router structure", () => {
  const portalRouter = (appRouter as any)._def.procedures;

  it("clientPortal.getMyDocuments exists", () => {
    expect(portalRouter["clientPortal.getMyDocuments"]).toBeDefined();
  });

  it("clientPortal.getMyProposals exists", () => {
    expect(portalRouter["clientPortal.getMyProposals"]).toBeDefined();
  });

  it("clientPortal.getPaymentSummary exists", () => {
    expect(portalRouter["clientPortal.getPaymentSummary"]).toBeDefined();
  });

  it("clientPortal.getMyProjects exists", () => {
    expect(portalRouter["clientPortal.getMyProjects"]).toBeDefined();
  });

  it("clientPortal.getMyProjectById exists", () => {
    expect(portalRouter["clientPortal.getMyProjectById"]).toBeDefined();
  });

  it("clientPortal.getRecentActivity exists", () => {
    expect(portalRouter["clientPortal.getRecentActivity"]).toBeDefined();
  });

  it("clientPortal.getRecentPhotos exists", () => {
    expect(portalRouter["clientPortal.getRecentPhotos"]).toBeDefined();
  });

  it("clientPortal.downloadInvoicePdf exists", () => {
    expect(portalRouter["clientPortal.downloadInvoicePdf"]).toBeDefined();
  });

  it("clientPortal.getMyFinancialHealth exists", () => {
    expect(portalRouter["clientPortal.getMyFinancialHealth"]).toBeDefined();
  });
});

describe("Documents router structure", () => {
  const procedures = (appRouter as any)._def.procedures;

  it("documents.create exists", () => {
    expect(procedures["documents.create"]).toBeDefined();
  });

  it("documents.upload exists", () => {
    expect(procedures["documents.upload"]).toBeDefined();
  });

  it("documents.uploadFile exists", () => {
    expect(procedures["documents.uploadFile"]).toBeDefined();
  });

  it("documents.uploadInspirationPhoto exists", () => {
    expect(procedures["documents.uploadInspirationPhoto"]).toBeDefined();
  });
});

// ─── Identity model consistency tests ────────────────────────────────────────

describe("Identity model: all portal queries use leadId as primary key", () => {
  it("getMyEstimates queries by leadId", () => {
    const idx = clientPortalSource.indexOf("getMyEstimates:");
    const section = clientPortalSource.slice(idx, idx + 1000);
    expect(section).toContain("estimates.leadId, leadId");
  });

  it("getMyProposals queries by leadId", () => {
    const idx = clientPortalSource.indexOf("getMyProposals:");
    const section = clientPortalSource.slice(idx, idx + 1000);
    expect(section).toContain("estimates.leadId, leadId");
  });

  it("getMyProjects queries by leadId", () => {
    const idx = clientPortalSource.indexOf("getMyProjects: publicProcedure.query");
    const section = clientPortalSource.slice(idx, idx + 1000);
    expect(section).toContain("projects.leadId, leadId");
  });

  it("getPaymentSummary queries estimates by leadId", () => {
    const idx = clientPortalSource.indexOf("getPaymentSummary:");
    const section = clientPortalSource.slice(idx, idx + 1500);
    expect(section).toContain("estimates.leadId, leadId");
  });

  it("downloadInvoicePdf verifies invoice belongs to client via leadId", () => {
    const idx = clientPortalSource.indexOf("downloadInvoicePdf:");
    const section = clientPortalSource.slice(idx, idx + 1500);
    expect(section).toContain("inv.leadId !== leadId");
  });
});

// ─── Client-facing button/CTA audit ─────────────────────────────────────────

describe("Client portal CTA audit: all buttons wired to real procedures", () => {
  const paymentsSource = fs.readFileSync("client/src/pages/client/ClientPayments.tsx", "utf-8");
  const docsSource = fs.readFileSync("client/src/pages/client/ClientDocuments.tsx", "utf-8");
  const proposalsSource = fs.readFileSync("client/src/pages/client/ClientProposals.tsx", "utf-8");
  const messagesSource = fs.readFileSync("client/src/pages/client/ClientMessages.tsx", "utf-8");
  const inspirationSource = fs.readFileSync("client/src/pages/client/ClientInspirationGallery.tsx", "utf-8");

  it("ClientPayments: Pay Now button opens squarePaymentUrl", () => {
    expect(paymentsSource).toContain("squarePaymentUrl");
    expect(paymentsSource).toContain("window.open(inv.squarePaymentUrl");
  });

  it("ClientPayments: Download PDF button calls downloadInvoicePdf", () => {
    expect(paymentsSource).toContain("clientPortal.downloadInvoicePdf");
  });

  it("ClientPayments: fallback toast for missing payment link", () => {
    expect(paymentsSource).toContain("Payment link coming soon");
  });

  it("ClientDocuments: file links use fileUrl", () => {
    expect(docsSource).toContain("doc.fileUrl");
  });

  it("ClientProposals: links to proposal view", () => {
    expect(proposalsSource).toContain("/client/proposal/");
  });

  it("ClientMessages: send button calls sendPortalMessage", () => {
    expect(messagesSource).toContain("clientPortal.sendPortalMessage");
  });

  it("ClientInspirationGallery: upload calls addInspirationItem", () => {
    expect(inspirationSource).toContain("clientPortal.addInspirationItem");
  });
});
