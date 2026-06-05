import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// Mock storagePut so tests don't hit real S3
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://cdn.example.com/test-photo.jpg", key: "projects/1/inspiration/abc-test.jpg" }),
}));

// Mock getDb to return a fake db
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue({ insertId: 42 }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([
            {
              id: 42,
              projectId: 1,
              docType: "inspiration",
              fileName: "kitchen-inspo.jpg",
              fileUrl: "https://cdn.example.com/test-photo.jpg",
              fileKey: "projects/1/inspiration/abc-test.jpg",
              mimeType: "image/jpeg",
              roomTag: "Kitchen",
              description: "Love this cabinet style",
              uploadedByClient: true,
              createdAt: new Date(),
            },
          ]),
          limit: vi.fn().mockResolvedValue([
            {
              id: 42,
              uploadedBy: 99,
            },
          ]),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({}),
    }),
  }),
}));

import { appRouter } from "./routers";

function makeOwnerCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "owner-open-id",
      name: "Chad Price",
      email: "chad@cpenterprisessc.com",
      loginMethod: "manus",
      role: "owner" as any,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeClientCtx(): TrpcContext {
  return {
    user: {
      id: 99,
      openId: "client-open-id",
      name: "Jane Homeowner",
      email: "jane@example.com",
      loginMethod: "magic_link",
      role: "client" as any,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("documents.uploadInspirationPhoto", () => {
  it("uploads a photo and returns id + url", async () => {
    const caller = appRouter.createCaller(makeClientCtx());
    const result = await caller.documents.uploadInspirationPhoto({
      projectId: 1,
      fileName: "kitchen-inspo.jpg",
      fileDataBase64: "data:image/jpeg;base64,/9j/4AAQSkZJRgAB",
      mimeType: "image/jpeg",
      fileSize: 12345,
      roomTag: "Kitchen",
      description: "Love this cabinet style",
    });
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("url");
    expect(typeof result.url).toBe("string");
  });
});

describe("documents.listInspirationPhotos", () => {
  it("returns inspiration photos for a project", async () => {
    const caller = appRouter.createCaller(makeOwnerCtx());
    const photos = await caller.documents.listInspirationPhotos({ projectId: 1 });
    expect(Array.isArray(photos)).toBe(true);
    if (photos.length > 0) {
      expect(photos[0]).toHaveProperty("docType", "inspiration");
      expect(photos[0]).toHaveProperty("fileUrl");
    }
  });
});

describe("documents.deleteInspirationPhoto", () => {
  it("allows owner to delete any inspiration photo", async () => {
    const caller = appRouter.createCaller(makeOwnerCtx());
    const result = await caller.documents.deleteInspirationPhoto({ id: 42 });
    expect(result).toEqual({ success: true });
  });
});
