/**
 * Site Meetings router — project-level on-site meetings with clients.
 * Syncs to Google Calendar on create/update/cancel.
 */
import { z } from "zod/v4";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { siteMeetings, projects, clients } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from "../googleCalendar";

// ─── helpers ──────────────────────────────────────────────────────────────────

async function getProjectWithClient(projectId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

  let clientEmail: string | undefined;
  let clientName: string | undefined;
  if (project.clientId) {
    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, project.clientId))
      .limit(1);
    clientEmail = client?.email ?? undefined;
    clientName = client?.name ?? undefined;
  }
  return { project, clientEmail, clientName };
}

// ─── router ───────────────────────────────────────────────────────────────────

export const siteMeetingsRouter = router({
  /** List all site meetings for a project */
  list: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(siteMeetings)
        .where(eq(siteMeetings.projectId, input.projectId))
        .orderBy(desc(siteMeetings.startTime));
      return rows;
    }),

  /** Create a new site meeting and sync to Google Calendar */
  create: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        title: z.string().min(1),
        description: z.string().optional(),
        startTime: z.number(), // UTC ms
        endTime: z.number(),   // UTC ms
        location: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const { project, clientEmail, clientName } = await getProjectWithClient(input.projectId);

      // Insert CRM record first — calendar sync is best-effort
      const [result] = await db.insert(siteMeetings).values({
        projectId: input.projectId,
        clientId: project.clientId ?? undefined,
        title: input.title,
        description: input.description ?? null,
        startTime: new Date(input.startTime),
        endTime: new Date(input.endTime),
        location: input.location ?? null,
        status: "scheduled",
      });
      const insertId = (result as any).insertId as number;

      // Sync to Google Calendar
      const durationMinutes = Math.round((input.endTime - input.startTime) / 60_000);
      const description = [
        input.description,
        `Project: ${project.name}`,
        project.address ? `Address: ${project.address}` : null,
        clientName ? `Client: ${clientName}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const gcal = await createCalendarEvent({
        summary: input.title,
        description,
        startTime: new Date(input.startTime),
        durationMinutes,
        location: input.location ?? project.address ?? undefined,
        attendeeEmail: clientEmail,
      });

      // Store gcal result back on the record
      await db
        .update(siteMeetings)
        .set({
          gcalEventId: gcal.eventId ?? null,
          gcalHtmlLink: gcal.htmlLink ?? null,
          gcalSyncError: gcal.ok ? null : (gcal.error ?? "Unknown error"),
        })
        .where(eq(siteMeetings.id, insertId));

      const [created] = await db
        .select()
        .from(siteMeetings)
        .where(eq(siteMeetings.id, insertId))
        .limit(1);

      return { meeting: created, gcalOk: gcal.ok, gcalError: gcal.error };
    }),

  /** Update (edit / reschedule) a site meeting */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        startTime: z.number().optional(), // UTC ms
        endTime: z.number().optional(),   // UTC ms
        location: z.string().optional(),
        status: z.enum(["scheduled", "completed", "canceled", "rescheduled"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [existing] = await db
        .select()
        .from(siteMeetings)
        .where(eq(siteMeetings.id, input.id))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Site meeting not found" });

      const patch: Record<string, any> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.description !== undefined) patch.description = input.description;
      if (input.startTime !== undefined) patch.startTime = new Date(input.startTime);
      if (input.endTime !== undefined) patch.endTime = new Date(input.endTime);
      if (input.location !== undefined) patch.location = input.location;
      if (input.status !== undefined) patch.status = input.status;

      await db.update(siteMeetings).set(patch).where(eq(siteMeetings.id, input.id));

      // Sync to Google Calendar if event was previously synced
      let gcalOk = true;
      let gcalError: string | undefined;
      if (existing.gcalEventId) {
        const startTime = input.startTime ? new Date(input.startTime) : existing.startTime;
        const endMs = input.endTime ?? existing.endTime.getTime();
        const startMs = startTime.getTime();
        const durationMinutes = Math.round((endMs - startMs) / 60_000);

        const gcal = await updateCalendarEvent(existing.gcalEventId, {
          summary: input.title,
          description: input.description,
          startTime,
          durationMinutes,
          location: input.location,
        });
        gcalOk = gcal.ok;
        gcalError = gcal.error;

        await db
          .update(siteMeetings)
          .set({ gcalSyncError: gcal.ok ? null : (gcal.error ?? "Unknown error") })
          .where(eq(siteMeetings.id, input.id));
      }

      const [updated] = await db
        .select()
        .from(siteMeetings)
        .where(eq(siteMeetings.id, input.id))
        .limit(1);

      return { meeting: updated, gcalOk, gcalError };
    }),

  /** Cancel a site meeting and remove from Google Calendar */
  cancel: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [existing] = await db
        .select()
        .from(siteMeetings)
        .where(eq(siteMeetings.id, input.id))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Site meeting not found" });

      await db
        .update(siteMeetings)
        .set({ status: "canceled" })
        .where(eq(siteMeetings.id, input.id));

      // Remove from Google Calendar
      let gcalOk = true;
      let gcalError: string | undefined;
      if (existing.gcalEventId) {
        const gcal = await deleteCalendarEvent(existing.gcalEventId);
        gcalOk = gcal.ok;
        gcalError = gcal.error;
        if (!gcal.ok) {
          await db
            .update(siteMeetings)
            .set({ gcalSyncError: gcal.error ?? "Delete failed" })
            .where(eq(siteMeetings.id, input.id));
        }
      }

      const [canceled] = await db
        .select()
        .from(siteMeetings)
        .where(eq(siteMeetings.id, input.id))
        .limit(1);

      return { meeting: canceled, gcalOk, gcalError };
    }),

  /** Retry Google Calendar sync for a meeting that previously failed */
  retrySync: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [existing] = await db
        .select()
        .from(siteMeetings)
        .where(eq(siteMeetings.id, input.id))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Site meeting not found" });

      const { project, clientEmail, clientName } = await getProjectWithClient(existing.projectId);
      const durationMinutes = Math.round(
        (existing.endTime.getTime() - existing.startTime.getTime()) / 60_000
      );
      const description = [
        existing.description,
        `Project: ${project.name}`,
        project.address ? `Address: ${project.address}` : null,
        clientName ? `Client: ${clientName}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      let gcal;
      if (existing.gcalEventId) {
        gcal = await updateCalendarEvent(existing.gcalEventId, {
          summary: existing.title,
          description,
          startTime: existing.startTime,
          durationMinutes,
          location: existing.location ?? project.address ?? undefined,
        });
      } else {
        gcal = await createCalendarEvent({
          summary: existing.title,
          description,
          startTime: existing.startTime,
          durationMinutes,
          location: existing.location ?? project.address ?? undefined,
          attendeeEmail: clientEmail,
        });
      }

      await db
        .update(siteMeetings)
        .set({
          gcalEventId: gcal.eventId ?? existing.gcalEventId ?? null,
          gcalHtmlLink: gcal.htmlLink ?? existing.gcalHtmlLink ?? null,
          gcalSyncError: gcal.ok ? null : (gcal.error ?? "Unknown error"),
        })
        .where(eq(siteMeetings.id, input.id));

      const [updated] = await db
        .select()
        .from(siteMeetings)
        .where(eq(siteMeetings.id, input.id))
        .limit(1);

      return { meeting: updated, gcalOk: gcal.ok, gcalError: gcal.error };
    }),
});
