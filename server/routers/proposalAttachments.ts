import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { proposalAttachments, fieldCaptures } from "../../drizzle/schema";
import { eq, asc, sql, inArray } from "drizzle-orm";
import { storagePut } from "../storage";

// Admin-only guard
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = (ctx.user as any)?.role;
  if (role !== "owner" && role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Owner access required" });
  }
  return next({ ctx });
});

function randomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}

export const proposalAttachmentsRouter = router({
  // List all attachments for a proposal (with field capture photo data if linked)
  listByEstimate: adminProcedure
    .input(z.object({ estimateId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(proposalAttachments)
        .where(eq(proposalAttachments.estimateId, input.estimateId))
        .orderBy(asc(proposalAttachments.sortOrder), asc(proposalAttachments.createdAt));
      return rows;
    }),

  // Attach a field capture photo to a proposal
  attachFieldCapture: adminProcedure
    .input(
      z.object({
        estimateId: z.number(),
        fieldCaptureId: z.number(),
        clientVisible: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Fetch the field capture to get its URL
      const [fc] = await db
        .select()
        .from(fieldCaptures)
        .where(eq(fieldCaptures.id, input.fieldCaptureId));

      if (!fc || !fc.photoUrl) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Field capture photo not found" });
      }

      // Check not already attached
      const existing = await db
        .select()
        .from(proposalAttachments)
        .where(eq(proposalAttachments.estimateId, input.estimateId));
      const alreadyAttached = existing.find((a) => a.fieldCaptureId === input.fieldCaptureId);
      if (alreadyAttached) {
        return { success: true, id: alreadyAttached.id, alreadyExists: true };
      }

      const [result] = await db.insert(proposalAttachments).values({
        estimateId: input.estimateId,
        fieldCaptureId: input.fieldCaptureId,
        fileUrl: fc.photoUrl,
        fileKey: fc.photoKey ?? null,
        fileName: `field-capture-${input.fieldCaptureId}.jpg`,
        clientVisible: input.clientVisible ? 1 : 0,
        sortOrder: existing.length,
      });

      return { success: true, id: (result as any).insertId };
    }),

  // Upload a file directly from computer (proposal-level or line-item-specific)
  uploadDirect: adminProcedure
    .input(
      z.object({
        estimateId: z.number(),
        lineItemId: z.number().optional(),  // undefined = estimate-level, set = line-item attachment
        dataUrl: z.string(),   // "data:image/jpeg;base64,..."
        mime: z.string().default("image/jpeg"),
        fileName: z.string().optional(),
        clientVisible: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const base64Data = input.dataUrl.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      const ext = (input.mime ?? "image/jpeg").split("/")[1] ?? "jpg";
      const key = `proposal-attachments/${input.estimateId}-${Date.now()}-${randomSuffix()}.${ext}`;
      const { url: fileUrl, key: fileKey } = await storagePut(key, buffer, input.mime ?? "image/jpeg");

      const existing = await db
        .select()
        .from(proposalAttachments)
        .where(eq(proposalAttachments.estimateId, input.estimateId));

      const [result] = await db.insert(proposalAttachments).values({
        estimateId: input.estimateId,
        lineItemId: input.lineItemId ?? null,
        fieldCaptureId: null,
        fileUrl,
        fileKey,
        fileName: input.fileName ?? `attachment-${Date.now()}.${ext}`,
        clientVisible: input.clientVisible ? 1 : 0,
        sortOrder: existing.length,
      });

      return { success: true, id: (result as any).insertId, fileUrl };
    }),

  // Toggle client visibility on a proposal attachment
  toggleClientVisible: adminProcedure
    .input(z.object({ id: z.number(), clientVisible: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(proposalAttachments)
        .set({ clientVisible: input.clientVisible ? 1 : 0 } as any)
        .where(eq(proposalAttachments.id, input.id));
      return { success: true };
    }),

  // Remove an attachment from a proposal
  remove: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(proposalAttachments).where(eq(proposalAttachments.id, input.id));
      return { success: true };
    }),

  // Public: list only client-visible attachments for a proposal (used by client portal)
  listClientVisible: publicProcedure
    .input(z.object({ estimateId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(proposalAttachments)
        .where(
          sql`${proposalAttachments.estimateId} = ${input.estimateId} AND ${proposalAttachments.clientVisible} = 1`
        )
        .orderBy(asc(proposalAttachments.sortOrder), asc(proposalAttachments.createdAt));
      // Return only non-sensitive fields to public callers
      return rows.map(({ fileUrl, fileName, lineItemId, sortOrder, id, createdAt }) => ({
        id, fileUrl, fileName, lineItemId, sortOrder, createdAt,
      }));
    }),

  // Batch count attachments for a list of estimate IDs (used for the badge on proposal cards)
  countByEstimateIds: adminProcedure
    .input(z.object({ estimateIds: z.array(z.number()) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return {} as Record<number, number>;
      if (!input.estimateIds.length) return {} as Record<number, number>;
      const rows = await db
        .select({
          estimateId: proposalAttachments.estimateId,
          count: sql<number>`COUNT(*)`,
        })
        .from(proposalAttachments)
        .where(inArray(proposalAttachments.estimateId, input.estimateIds))
        .groupBy(proposalAttachments.estimateId);
      const result: Record<number, number> = {};
      for (const row of rows) {
        if (row.estimateId != null) result[row.estimateId] = Number(row.count);
      }
      return result;
    }),
});
