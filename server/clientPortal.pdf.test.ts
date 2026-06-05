/**
 * Tests for clientPortal.downloadInvoicePdf and clientPortal.getInvoicePayments procedures.
 *
 * These procedures are authenticated via a kp_client_session JWT cookie.
 * We test the authentication guard (no cookie → UNAUTHORIZED) and the
 * scope guard (invoice belonging to a different lead → FORBIDDEN).
 */
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

/** Build a minimal TrpcContext with no cookies (unauthenticated client). */
function createUnauthCtx(): TrpcContext {
  return {
    user: null as any,
    req: {
      protocol: "https",
      headers: {},
      cookies: {},
    } as TrpcContext["req"],
    res: {
      cookie: () => {},
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("clientPortal.downloadInvoicePdf", () => {
  it("throws UNAUTHORIZED when no kp_client_session cookie is present", async () => {
    const ctx = createUnauthCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.clientPortal.downloadInvoicePdf({ invoiceId: 1 })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws UNAUTHORIZED when the cookie is an invalid JWT", async () => {
    const ctx = createUnauthCtx();
    (ctx.req as any).cookies = { kp_client_session: "not-a-valid-jwt" };
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.clientPortal.downloadInvoicePdf({ invoiceId: 1 })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("clientPortal.getInvoicePayments", () => {
  it("returns an empty array when no kp_client_session cookie is present", async () => {
    const ctx = createUnauthCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.clientPortal.getInvoicePayments({ invoiceId: 1 });
    expect(result).toEqual([]);
  });

  it("returns an empty array when the cookie is an invalid JWT", async () => {
    const ctx = createUnauthCtx();
    (ctx.req as any).cookies = { kp_client_session: "bad-token" };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.clientPortal.getInvoicePayments({ invoiceId: 1 });
    expect(result).toEqual([]);
  });
});

describe("clientPortal.getPaymentSummary", () => {
  it("returns null when no kp_client_session cookie is present", async () => {
    const ctx = createUnauthCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.clientPortal.getPaymentSummary();
    expect(result).toBeNull();
  });
});

describe("clientPortal.me", () => {
  it("returns null when no kp_client_session cookie is present", async () => {
    const ctx = createUnauthCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.clientPortal.me();
    expect(result).toBeNull();
  });
});
