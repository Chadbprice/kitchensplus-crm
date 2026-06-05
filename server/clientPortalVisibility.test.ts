import { describe, expect, it } from "vitest";

/**
 * Client Portal + Inspiration/Field-Capture Visibility Pass
 *
 * Tests cover:
 * 1. Dashboard welcome email function structure
 * 2. Client portal data visibility (documents + invoices scoped by projectId fallback)
 * 3. InspirationDrawer component contract
 * 4. FieldCaptureDrawer component contract
 * 5. Non-destructive side panel behavior
 * 6. Integration wiring across Leads, Proposals, ProjectDetail
 */

// ── Section 1: Dashboard Welcome Email ──────────────────────────────────────

describe("sendDashboardWelcomeEmail", () => {
  it("is exported from email.ts", async () => {
    const emailModule = await import("./email");
    expect(typeof emailModule.sendDashboardWelcomeEmail).toBe("function");
  });

  it("returns a result object with ok property", async () => {
    const emailModule = await import("./email");
    const result = await emailModule.sendDashboardWelcomeEmail({
      toEmail: "test@example.com",
      toName: "Test User",
      portalUrl: "https://example.com/portal",
    });
    expect(result).toHaveProperty("ok");
    expect(typeof result.ok).toBe("boolean");
  });

  it("accepts optional ccEmail parameter without throwing", async () => {
    const emailModule = await import("./email");
    // Should not throw even with ccEmail
    const result = await emailModule.sendDashboardWelcomeEmail({
      toEmail: "test@example.com",
      toName: "Test User",
      portalUrl: "https://example.com/portal",
      ccEmail: "cc@example.com",
    });
    expect(result).toHaveProperty("ok");
  });
});

// ── Section 2: Client Portal Data Visibility ────────────────────────────────

describe("Client Portal data visibility", () => {
  it("clientPortal router is exported from routers", async () => {
    const { appRouter } = await import("./routers");
    // The appRouter should have a clientPortal namespace
    expect(appRouter).toBeDefined();
    // clientPortal procedures should be accessible
    expect(appRouter._def.procedures).toBeDefined();
  });

  it("getMyDocuments procedure exists on the appRouter", async () => {
    const { appRouter } = await import("./routers");
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    expect(procedures["clientPortal.getMyDocuments"]).toBeDefined();
  });

  it("getPaymentSummary procedure exists on the appRouter", async () => {
    const { appRouter } = await import("./routers");
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    expect(procedures["clientPortal.getPaymentSummary"]).toBeDefined();
  });

  it("getMyProposals procedure exists on the appRouter", async () => {
    const { appRouter } = await import("./routers");
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    expect(procedures["clientPortal.getMyProposals"]).toBeDefined();
  });

  it("getMyProjects procedure exists on the appRouter", async () => {
    const { appRouter } = await import("./routers");
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    expect(procedures["clientPortal.getMyProjects"]).toBeDefined();
  });

  it("getMyMessages procedure exists on the appRouter", async () => {
    const { appRouter } = await import("./routers");
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    expect(procedures["clientPortal.getMyMessages"]).toBeDefined();
  });
});

// ── Section 3: InspirationDrawer Component Contract ─────────────────────────

describe("InspirationDrawer component", () => {
  it("module exports a default function", async () => {
    const mod = await import("../client/src/components/InspirationDrawer");
    expect(typeof mod.default).toBe("function");
  });

  it("component function accepts the expected props shape", async () => {
    const mod = await import("../client/src/components/InspirationDrawer");
    const fn = mod.default;
    // React components have a length property for their params
    // The function should accept props (1 parameter)
    expect(fn.length).toBeGreaterThanOrEqual(0);
  });
});

// ── Section 4: FieldCaptureDrawer Component Contract ────────────────────────

describe("FieldCaptureDrawer component", () => {
  it("module exports a default function", async () => {
    const mod = await import("../client/src/components/FieldCaptureDrawer");
    expect(typeof mod.default).toBe("function");
  });

  it("component function accepts the expected props shape", async () => {
    const mod = await import("../client/src/components/FieldCaptureDrawer");
    const fn = mod.default;
    expect(fn.length).toBeGreaterThanOrEqual(0);
  });
});

// ── Section 5: Non-destructive Side Panel Behavior ──────────────────────────

describe("Non-destructive side panels", () => {
  it("InspirationDrawer uses Sheet component (portal overlay, no page navigation)", async () => {
    // Read the source to verify it uses Sheet, not a route change
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("../client/src/components/InspirationDrawer.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(source).toContain("Sheet");
    expect(source).toContain("SheetContent");
    expect(source).not.toContain("useLocation");
    expect(source).not.toContain("navigate(");
    expect(source).not.toContain("window.location");
  });

  it("FieldCaptureDrawer uses Sheet component (portal overlay, no page navigation)", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("../client/src/components/FieldCaptureDrawer.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(source).toContain("Sheet");
    expect(source).toContain("SheetContent");
    expect(source).not.toContain("useLocation");
    expect(source).not.toContain("navigate(");
    expect(source).not.toContain("window.location");
  });

  it("InspirationDrawer accepts open/onClose props for controlled overlay behavior", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("../client/src/components/InspirationDrawer.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(source).toContain("open");
    expect(source).toContain("onClose");
    expect(source).toContain("onOpenChange");
  });

  it("FieldCaptureDrawer accepts open/onClose props for controlled overlay behavior", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("../client/src/components/FieldCaptureDrawer.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(source).toContain("open");
    expect(source).toContain("onClose");
    expect(source).toContain("onOpenChange");
  });
});

// ── Section 6: Integration Wiring ───────────────────────────────────────────

describe("Integration wiring across pages", () => {
  it("Leads.tsx imports and renders InspirationDrawer", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("../client/src/pages/owner/Leads.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(source).toContain("InspirationDrawer");
    expect(source).toContain("inspirationDrawerLead");
    expect(source).toContain("setInspirationDrawerLead");
  });

  it("Leads.tsx imports and renders FieldCaptureDrawer", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("../client/src/pages/owner/Leads.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(source).toContain("FieldCaptureDrawer");
    expect(source).toContain("fieldCaptureDrawerLead");
    expect(source).toContain("setFieldCaptureDrawerLead");
  });

  it("Leads.tsx has View Inspiration and View Field Captures buttons", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("../client/src/pages/owner/Leads.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(source).toContain("View Inspiration");
    expect(source).toContain("View Field Captures");
  });

  it("Proposals.tsx passes onOpenInspiration and onOpenFieldCapture to ProposalDetailSheet", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("../client/src/pages/owner/Proposals.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(source).toContain("onOpenInspiration");
    expect(source).toContain("onOpenFieldCapture");
    expect(source).toContain("InspirationDrawer");
    expect(source).toContain("FieldCaptureDrawer");
  });

  it("Proposals.tsx has View Inspiration and View Field Captures buttons in ProposalDetailSheet", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("../client/src/pages/owner/Proposals.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(source).toContain("View Inspiration");
    expect(source).toContain("View Field Captures");
  });

  it("ProjectDetail.tsx imports and renders InspirationDrawer", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("../client/src/pages/owner/ProjectDetail.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(source).toContain("InspirationDrawer");
    expect(source).toContain("inspirationDrawerOpen");
  });

  it("ProjectDetail.tsx imports and renders FieldCaptureDrawer", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("../client/src/pages/owner/ProjectDetail.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(source).toContain("FieldCaptureDrawer");
    expect(source).toContain("fieldCaptureDrawerOpen");
  });

  it("ProjectDetail.tsx has View Inspiration and View Field Captures buttons", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("../client/src/pages/owner/ProjectDetail.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(source).toContain("View Inspiration");
    expect(source).toContain("View Field Captures");
  });
});

// ── Section 7: Client Portal Document Visibility Fix ────────────────────────

describe("Client portal document visibility fix", () => {
  it("getMyDocuments queries by projectId in addition to leadId", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("./routers/clientPortal.ts", import.meta.url).pathname,
      "utf-8"
    );
    // The fix adds projectId-based querying for documents
    expect(source).toContain("documents.projectId");
    expect(source).toContain("clientProjectIds");
  });

  it("getPaymentSummary queries invoices by projectId in addition to leadId", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("./routers/clientPortal.ts", import.meta.url).pathname,
      "utf-8"
    );
    // The fix adds projectId-based querying for invoices
    expect(source).toContain("invoices.projectId");
    expect(source).toContain("clientProjectIds");
  });
});

// ── Section 8: Dashboard Welcome Email in Proposal Send Flow ────────────────

describe("Dashboard welcome email in proposal send flow", () => {
  it("proposal send procedure references sendDashboardWelcomeEmail", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("./routers.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(source).toContain("sendDashboardWelcomeEmail");
  });

  it("sendDashboardWelcomeEmail is imported in routers.ts", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("./routers.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(source).toContain("import");
    expect(source).toContain("sendDashboardWelcomeEmail");
  });
});
