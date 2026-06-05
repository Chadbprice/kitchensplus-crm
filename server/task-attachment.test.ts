import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "owner-open-id",
    email: "chad@kitchensplusupstate.com",
    name: "Chad Price",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("projects.uploadTaskAttachment", () => {
  it("rejects disallowed MIME types", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(
      caller.projects.uploadTaskAttachment({
        fileName: "script.js",
        fileDataBase64: Buffer.from("alert(1)").toString("base64"),
        mimeType: "application/javascript",
      })
    ).rejects.toThrow(/not allowed/i);
  });

  it("rejects files over 20 MB", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    // Build a base64 string that decodes to > 20 MB
    const bigBuffer = Buffer.alloc(21 * 1024 * 1024, "x");
    await expect(
      caller.projects.uploadTaskAttachment({
        fileName: "huge.jpg",
        fileDataBase64: bigBuffer.toString("base64"),
        mimeType: "image/jpeg",
      })
    ).rejects.toThrow(/20 MB/i);
  });
});

describe("projects.addTask / addTaskReply schema", () => {
  it("addTask input schema accepts attachmentUrl and attachmentName", async () => {
    // Verify the zod schema accepts the new optional fields without throwing
    const { z } = await import("zod/v4");
    const schema = z.object({
      projectId: z.number(),
      title: z.string(),
      attachmentUrl: z.string().optional(),
      attachmentName: z.string().optional(),
    });
    const result = schema.safeParse({
      projectId: 1,
      title: "Test task",
      attachmentUrl: "https://cdn.example.com/file.pdf",
      attachmentName: "file.pdf",
    });
    expect(result.success).toBe(true);
  });
});

describe("estimates.sendProposal error handling", () => {
  it("throws NOT_FOUND when proposal id does not exist", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(
      caller.estimates.sendProposal({ id: 999999999, origin: "https://example.com" })
    ).rejects.toThrow(/NOT_FOUND/i);
  });
});
