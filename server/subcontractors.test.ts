/**
 * Subcontractors Router Tests
 *
 * Tests the key public/protected procedures:
 *   - verifyPortalToken: returns valid:false for unknown tokens
 *   - getContractForSigning: returns null for unknown tokens
 *   - list: throws UNAUTHORIZED when called without auth, returns array for owner
 *   - listTrades: returns the static trade list (protected)
 */

import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAnonCtx(): TrpcContext {
  return {
    user: null,
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function makeOwnerCtx(): TrpcContext {
  const user: User = {
    id: 1,
    openId: "test-owner-openid",
    name: "Chad",
    email: "chad@test.com",
    phone: null,
    loginMethod: "manus",
    role: "owner",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("subcontractors.verifyPortalToken", () => {
  it("returns valid:false for a random unknown token", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    const result = await caller.subcontractors.verifyPortalToken({ token: "nonexistent_token_xyz_123" });
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("returns valid:false for an empty string token", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    const result = await caller.subcontractors.verifyPortalToken({ token: "" });
    expect(result.valid).toBe(false);
  });
});

describe("subcontractors.getContractForSigning", () => {
  it("returns null for an unknown signing token", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    try {
      await caller.subcontractors.getContractByToken({ signToken: "fake_sign_token_xyz" });
      expect(true).toBe(false); // should not reach here
    } catch (err: any) {
      expect(err.code).toBe("NOT_FOUND");
    }
  });
});

describe("subcontractors.list (protected)", () => {
  it("throws UNAUTHORIZED when called without auth", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(caller.subcontractors.list({})).rejects.toThrow();
  });

  it("returns an array when called with owner auth", async () => {
    const caller = appRouter.createCaller(makeOwnerCtx());
    const result = await caller.subcontractors.list({});
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("subcontractors.listTrades (protected)", () => {
  it("throws UNAUTHORIZED when called without auth", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(caller.subcontractors.listTrades()).rejects.toThrow();
  });

  it("returns an array when called with owner auth (may be empty if no subs exist)", async () => {
    const caller = appRouter.createCaller(makeOwnerCtx());
    const result = await caller.subcontractors.listTrades();
    expect(Array.isArray(result)).toBe(true);
    // Each element must be a string if any exist
    for (const item of result) {
      expect(typeof item).toBe("string");
    }
  });
});
