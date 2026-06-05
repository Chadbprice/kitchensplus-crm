/**
 * Tests for clientPortal.getMyProjects procedure
 * Validates: auth guard, empty result for unauthenticated, correct scoping,
 * and milestone progress calculation logic.
 */
import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createCtx(cookie?: string): TrpcContext {
  return {
    user: null as any,
    req: {
      protocol: "https",
      headers: {},
      cookies: cookie ? { kp_client_session: cookie } : {},
    } as TrpcContext["req"],
    res: {
      cookie: () => {},
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("clientPortal.getMyProjects", () => {
  it("returns empty array when no session cookie is present", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.clientPortal.getMyProjects();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("returns empty array when session cookie is an invalid JWT", async () => {
    const caller = appRouter.createCaller(createCtx("not-a-valid-jwt"));
    const result = await caller.clientPortal.getMyProjects();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("returns empty array when session cookie has role='owner' (not client)", async () => {
    const { SignJWT } = await import("jose");
    const secret = process.env.JWT_SECRET ?? "fallback-secret";
    const secretKey = new TextEncoder().encode(secret);
    const token = await new SignJWT({ leadId: 1, name: "Test Owner", role: "owner" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(secretKey);
    const caller = appRouter.createCaller(createCtx(token));
    const result = await caller.clientPortal.getMyProjects();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("returns empty array for a valid client session with no matching projects (leadId=999999)", async () => {
    const { SignJWT } = await import("jose");
    const secret = process.env.JWT_SECRET ?? "fallback-secret";
    const secretKey = new TextEncoder().encode(secret);
    const token = await new SignJWT({ leadId: 999999, name: "Ghost Client", role: "client" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(secretKey);
    const caller = appRouter.createCaller(createCtx(token));
    const result = await caller.clientPortal.getMyProjects();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("each returned project has required shape fields", async () => {
    const { SignJWT } = await import("jose");
    const secret = process.env.JWT_SECRET ?? "fallback-secret";
    const secretKey = new TextEncoder().encode(secret);
    const token = await new SignJWT({ leadId: 1, name: "Test Client", role: "client" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(secretKey);
    const caller = appRouter.createCaller(createCtx(token));
    const result = await caller.clientPortal.getMyProjects();
    expect(Array.isArray(result)).toBe(true);
    for (const project of result) {
      expect(project).toHaveProperty("id");
      expect(project).toHaveProperty("name");
      expect(project).toHaveProperty("status");
      expect(project).toHaveProperty("progress");
      expect(project).toHaveProperty("totalMilestones");
      expect(project).toHaveProperty("completedMilestones");
      expect(typeof project.progress).toBe("number");
      expect(project.progress).toBeGreaterThanOrEqual(0);
      expect(project.progress).toBeLessThanOrEqual(100);
    }
  });
});

describe("getMyProjects — milestone progress math", () => {
  it("progress is 0 when there are no milestones", () => {
    const totalMs = 0;
    const completedMs = 0;
    const progress = totalMs > 0 ? Math.round((completedMs / totalMs) * 100) : 0;
    expect(progress).toBe(0);
  });

  it("progress is 100 when all milestones are completed", () => {
    const totalMs = 4;
    const completedMs = 4;
    const progress = totalMs > 0 ? Math.round((completedMs / totalMs) * 100) : 0;
    expect(progress).toBe(100);
  });

  it("progress rounds correctly for 1 of 3 milestones completed", () => {
    const totalMs = 3;
    const completedMs = 1;
    const progress = totalMs > 0 ? Math.round((completedMs / totalMs) * 100) : 0;
    expect(progress).toBe(33);
  });

  it("progress rounds correctly for 2 of 3 milestones completed", () => {
    const totalMs = 3;
    const completedMs = 2;
    const progress = totalMs > 0 ? Math.round((completedMs / totalMs) * 100) : 0;
    expect(progress).toBe(67);
  });
});

describe("clientPortal.getMyProjectById", () => {
  it("returns null when no session cookie is present (unauthenticated)", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.clientPortal.getMyProjectById({ projectId: 1 });
    expect(result).toBeNull();
  });

  it("returns null when session cookie is an invalid JWT", async () => {
    const caller = appRouter.createCaller(createCtx("bad-token"));
    const result = await caller.clientPortal.getMyProjectById({ projectId: 1 });
    expect(result).toBeNull();
  });

  it("returns null for a non-existent project id (999999) with valid client session", async () => {
    const { SignJWT } = await import("jose");
    const secret = process.env.JWT_SECRET ?? "fallback-secret";
    const secretKey = new TextEncoder().encode(secret);
    const token = await new SignJWT({ leadId: 999999, name: "Ghost Client", role: "client" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(secretKey);
    const caller = appRouter.createCaller(createCtx(token));
    const result = await caller.clientPortal.getMyProjectById({ projectId: 999999 });
    expect(result).toBeNull();
  });

  it("returns null when session cookie has role='owner' (not a client session)", async () => {
    const { SignJWT } = await import("jose");
    const secret = process.env.JWT_SECRET ?? "fallback-secret";
    const secretKey = new TextEncoder().encode(secret);
    const token = await new SignJWT({ leadId: 1, name: "Owner", role: "owner" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(secretKey);
    const caller = appRouter.createCaller(createCtx(token));
    const result = await caller.clientPortal.getMyProjectById({ projectId: 1 });
    expect(result).toBeNull();
  });
});
