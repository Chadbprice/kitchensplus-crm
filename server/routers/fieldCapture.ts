import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { fieldCaptures, clients } from "../../drizzle/schema";
import { eq, desc, or, asc, inArray, sql } from "drizzle-orm";
import { leads } from "../../drizzle/schema";
import { storagePut } from "../storage";
import { transcribeAudio } from "../_core/voiceTranscription";

// Admin-only guard — matches the role values used in routers.ts ("owner" | "admin")
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

export const fieldCaptureRouter = router({
  // Upload a photo (base64 data URI) or save a typed note
  create: adminProcedure
    .input(
      z.object({
        clientId: z.number().optional(),
        leadId: z.number().optional(),
        type: z.enum(["photo", "note"]),
        photoDataUrl: z.string().optional(), // "data:image/jpeg;base64,..."
        photoMime: z.string().optional().default("image/jpeg"),
        noteText: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        capturedAt: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      let photoUrl: string | undefined;
      let photoKey: string | undefined;

      if (input.type === "photo" && input.photoDataUrl) {
        const base64Data = input.photoDataUrl.replace(/^data:[^;]+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const ext = (input.photoMime ?? "image/jpeg").split("/")[1] ?? "jpg";
        const key = `field-captures/${Date.now()}-${randomSuffix()}.${ext}`;
        const result = await storagePut(key, buffer, input.photoMime ?? "image/jpeg");
        photoUrl = result.url;
        photoKey = result.key;
      }

      const capturedAt = input.capturedAt ? new Date(input.capturedAt) : new Date();

      await db.insert(fieldCaptures).values({
        clientId: input.clientId ?? null,
        leadId: input.leadId ?? null,
        type: input.type,
        photoUrl: photoUrl ?? null,
        photoKey: photoKey ?? null,
        noteText: input.noteText ?? null,
        latitude: input.latitude ? String(input.latitude) : null,
        longitude: input.longitude ? String(input.longitude) : null,
        capturedAt,
      });

      return { success: true };
    }),

  // Transcribe a voice recording (base64 webm) and save as a note
  transcribeVoice: adminProcedure
    .input(
      z.object({
        audioDataUrl: z.string(), // "data:audio/webm;base64,..."
        clientId: z.number().optional(),
        leadId: z.number().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        capturedAt: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Upload audio to S3 so transcription service can access it via URL
      const base64Data = input.audioDataUrl.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      const key = `field-captures/voice-${Date.now()}-${randomSuffix()}.webm`;
      const { url: audioUrl } = await storagePut(key, buffer, "audio/webm");

      // Transcribe
      const result = await transcribeAudio({ audioUrl, language: "en" });
      const text = result.text?.trim() ?? "";

      if (!text) throw new TRPCError({ code: "UNPROCESSABLE_CONTENT", message: "No speech detected" });

      const capturedAt = input.capturedAt ? new Date(input.capturedAt) : new Date();

      await db.insert(fieldCaptures).values({
        clientId: input.clientId ?? null,
        leadId: input.leadId ?? null,
        type: "note",
        noteText: `🎤 ${text}`,
        latitude: input.latitude ? String(input.latitude) : null,
        longitude: input.longitude ? String(input.longitude) : null,
        capturedAt,
      });

      return { success: true, text: `🎤 ${text}` };
    }),

  // List all captures for a client
  listByClient: adminProcedure
    .input(
      z.object({
        clientId: z.number().optional(),
        leadId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = [];
      if (input.clientId) conditions.push(eq(fieldCaptures.clientId, input.clientId));
      if (input.leadId) conditions.push(eq(fieldCaptures.leadId, input.leadId));

      if (conditions.length === 0) return [];

      return db
        .select()
        .from(fieldCaptures)
        .where(conditions.length === 1 ? conditions[0] : or(...conditions))
        .orderBy(desc(fieldCaptures.capturedAt));
    }),

  // List all clients (for the field capture client picker)
  // Merges both the clients table and the leads table so all contacts appear
  listClients: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const [clientRows, leadRows] = await Promise.all([
      db.select({ id: clients.id, name: clients.name, email: clients.email, phone: clients.phone, address: clients.address }).from(clients),
      db.select({ id: leads.id, name: leads.name, email: leads.email, phone: leads.phone, address: leads.address }).from(leads),
    ]);

    // Deduplicate by email — prefer client record over lead record
    const seen = new Set<string>();
    const merged: Array<{ id: number; name: string; email: string | null; phone: string | null; address: string | null; source: "client" | "lead" }> = [];

    for (const row of clientRows) {
      const key = row.email?.toLowerCase() ?? `client:${row.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push({ ...row, source: "client" as const });
      }
    }
    for (const row of leadRows) {
      const key = row.email?.toLowerCase() ?? `lead:${row.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push({ ...row, source: "lead" as const });
      }
    }

    return merged.sort((a, b) => a.name.localeCompare(b.name));
  }),

  // Upload multiple photos from device library (base64 array)
  uploadMultiple: adminProcedure
    .input(
      z.object({
        clientId: z.number().optional(),
        leadId: z.number().optional(),
        photos: z.array(
          z.object({
            dataUrl: z.string(),   // "data:image/jpeg;base64,..."
            mime: z.string().default("image/jpeg"),
            capturedAt: z.string().optional(),
          })
        ).min(1).max(20),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const results: { success: boolean; photoUrl?: string }[] = [];

      for (const photo of input.photos) {
        const base64Data = photo.dataUrl.replace(/^data:[^;]+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const ext = (photo.mime ?? "image/jpeg").split("/")[1] ?? "jpg";
        const key = `field-captures/${Date.now()}-${randomSuffix()}.${ext}`;
        const { url: photoUrl, key: photoKey } = await storagePut(key, buffer, photo.mime ?? "image/jpeg");

        const capturedAt = photo.capturedAt ? new Date(photo.capturedAt) : new Date();

        await db.insert(fieldCaptures).values({
          clientId: input.clientId ?? null,
          leadId: input.leadId ?? null,
          type: "photo",
          photoUrl,
          photoKey,
          noteText: null,
          latitude: null,
          longitude: null,
          capturedAt,
        });

        results.push({ success: true, photoUrl });
      }

      return { uploaded: results.length, results };
    }),

  // Toggle clientVisible on a field capture
  toggleClientVisible: adminProcedure
    .input(z.object({ id: z.number(), clientVisible: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(fieldCaptures)
        .set({ clientVisible: input.clientVisible ? 1 : 0 } as any)
        .where(eq(fieldCaptures.id, input.id));
      return { success: true };
    }),

  // Return photo+note counts for a batch of leadIds (used by lead cards)
  countByLeadIds: adminProcedure
    .input(z.object({ leadIds: z.array(z.number()).min(1).max(200) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return {};
      const rows = await db
        .select({
          leadId: fieldCaptures.leadId,
          count: sql<number>`count(*)`,
        })
        .from(fieldCaptures)
        .where(inArray(fieldCaptures.leadId, input.leadIds))
        .groupBy(fieldCaptures.leadId);
      // Return a map: leadId -> total count
      const result: Record<number, number> = {};
      for (const row of rows) {
        if (row.leadId != null) result[row.leadId] = Number(row.count);
      }
      return result;
    }),

  // Delete a capture
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(fieldCaptures).where(eq(fieldCaptures.id, input.id));
      return { success: true };
    }),
});
