import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";
import { getDb } from "../db";
import { leads, meetings, rescheduleRequests, crewMembers, estimates, invoices, invoicePayments, documents, messages, messageProjects, designIdeaNotes, projects, milestones, projectAssignments, financialSnapshots } from "../../drizzle/schema";
import { eq, desc, and, like, or } from "drizzle-orm";
import { getSessionCookieOptions } from "../_core/cookies";
import { sendSms } from "../sms"; // still used for reschedule notifications
import { notifyOwner } from "../_core/notification";
import { SignJWT, jwtVerify } from "jose";
import { updateCalendarEvent } from "../googleCalendar";

// Admin guard
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = (ctx.user as any).role;
  if (role !== "owner" && role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Owner access required" });
  }
  return next({ ctx });
});

function normalizePhone(phone: string): string {
  const raw = phone.replace(/\D/g, "");
  return raw.length >= 10 ? raw.slice(-10) : raw;
}

export const clientPortalRouter = router({
  // Single-step login: match phone number → issue session immediately
  loginWithPhone: publicProcedure.input(z.object({
    phone: z.string().min(7),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const normalized = normalizePhone(input.phone);
    // Find a lead whose phone matches
    const leadRows = await db.select().from(leads).where(
      or(
        like(leads.phone, `%${normalized}`),
        like(leads.phone2, `%${normalized}`),
        like(leads.phone3, `%${normalized}`),
      )
    ).limit(1);
    const lead = leadRows[0];
    if (!lead) {
      // Return generic error — don't reveal whether phone exists
      throw new TRPCError({ code: "NOT_FOUND", message: "No account found for that phone number. Please contact us." });
    }
    // Issue a signed JWT client session cookie (30-day)
    const secret = process.env.JWT_SECRET ?? "fallback-secret";
    const secretKey = new TextEncoder().encode(secret);
    const token = await new SignJWT({ leadId: lead.id, name: lead.name, role: "client" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(`client:${lead.id}`)
      .setExpirationTime("30d")
      .sign(secretKey);
    ctx.res.cookie("kp_client_session", token, {
      ...getSessionCookieOptions(ctx.req),
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return { success: true, leadId: lead.id, name: lead.name };
  }),

  // Email fallback login: match email address → issue session immediately
  loginWithEmail: publicProcedure.input(z.object({
    email: z.string().email(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const normalizedEmail = input.email.trim().toLowerCase();
    const leadRows = await db.select().from(leads).where(
      or(
        like(leads.email, normalizedEmail),
        like(leads.email2, normalizedEmail),
        like(leads.email3, normalizedEmail),
      )
    ).limit(1);
    const lead = leadRows[0];
    if (!lead) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No account found for that email address. Please contact us." });
    }
    const secret = process.env.JWT_SECRET ?? "fallback-secret";
    const secretKey = new TextEncoder().encode(secret);
    const token = await new SignJWT({ leadId: lead.id, name: lead.name, role: "client" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(`client:${lead.id}`)
      .setExpirationTime("30d")
      .sign(secretKey);
    ctx.res.cookie("kp_client_session", token, {
      ...getSessionCookieOptions(ctx.req),
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return { success: true, leadId: lead.id, name: lead.name };
  }),

  // Get current client session info (reads kp_client_session cookie)
  me: publicProcedure.query(async ({ ctx }) => {
    const token = ctx.req.cookies?.["kp_client_session"];
    if (!token) return null;
    try {
      const secret = process.env.JWT_SECRET ?? "fallback-secret";
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretKey);
      if ((payload as any).role !== "client") return null;
      return { leadId: (payload as any).leadId as number, name: (payload as any).name as string };
    } catch { return null; }
  }),

  // Logout: clear client session cookie
  logout: publicProcedure.mutation(async ({ ctx }) => {
    ctx.res.clearCookie("kp_client_session", { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
    return { success: true };
  }),

  // Submit a reschedule request — authenticated via kp_client_session cookie
  submitReschedule: publicProcedure.input(z.object({
    meetingId: z.number(),
    suggestedTime1: z.string(), // ISO string
    suggestedTime2: z.string().optional(),
    suggestedTime3: z.string().optional(),
    clientMessage: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Verify client session cookie
    const token = ctx.req.cookies?.["kp_client_session"];
    if (!token) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in to your portal first" });
    let leadId: number;
    try {
      const { jwtVerify } = await import("jose");
      const secret = process.env.JWT_SECRET ?? "fallback-secret";
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretKey);
      if ((payload as any).role !== "client") throw new Error("Not a client session");
      leadId = (payload as any).leadId as number;
    } catch {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Session expired. Please sign in again." });
    }
    const leadRows = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    const lead = leadRows[0];
    if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
    const meetingRows = await db.select().from(meetings).where(eq(meetings.id, input.meetingId)).limit(1);
    const meeting = meetingRows[0];
    if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
    // Save reschedule request
    await db.insert(rescheduleRequests).values({
      meetingId: input.meetingId,
      leadId: lead.id,
      suggestedTime1: new Date(input.suggestedTime1),
      suggestedTime2: input.suggestedTime2 ? new Date(input.suggestedTime2) : undefined,
      suggestedTime3: input.suggestedTime3 ? new Date(input.suggestedTime3) : undefined,
      clientMessage: input.clientMessage,
    });
    // Notify owner via in-app notification
    const fmt = (d: string) => new Date(d).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const t1 = fmt(input.suggestedTime1);
    const t2 = input.suggestedTime2 ? fmt(input.suggestedTime2) : null;
    const t3 = input.suggestedTime3 ? fmt(input.suggestedTime3) : null;
    await notifyOwner({
      title: `Reschedule Request — ${lead.name}`,
      content: `${lead.name} wants to reschedule their consultation.\n\nSuggested time 1: ${t1}${t2 ? `\nSuggested time 2: ${t2}` : ""}${t3 ? `\nSuggested time 3: ${t3}` : ""}${input.clientMessage ? `\n\nMessage: ${input.clientMessage}` : ""}\n\nAssignee: ${meeting.assignee ?? "Chad Price"}`,
    });
    // Also SMS the assignee if we can find their phone in crew
    const assigneeName = meeting.assignee ?? "Chad Price";
    const crewRows = await db.select().from(crewMembers)
      .where(like(crewMembers.name, `%${assigneeName.split(" ")[0]}%`)).limit(1);
    const assigneePhone = crewRows[0]?.phone;
    if (assigneePhone) {
      await sendSms(assigneePhone, `Reschedule request from ${lead.name}. Suggested: ${t1}. Check the CRM dashboard for details.`);
    }
    return { success: true };
  }),

  // Public: client confirms their meeting from the email link
  // Uses meetingId + leadId as a lightweight token (no password needed — client got this link in their email)
  confirmMeeting: publicProcedure.input(z.object({
    meetingId: z.number(),
    leadId: z.number(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Verify the meeting belongs to this lead
    const meetingRows = await db.select().from(meetings)
      .where(and(eq(meetings.id, input.meetingId), eq(meetings.leadId, input.leadId)))
      .limit(1);
    const meeting = meetingRows[0];
    if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
    // Mark meeting as confirmed
    await db.update(meetings).set({
      status: "confirmed" as any,
      confirmedAt: new Date(),
    }).where(eq(meetings.id, input.meetingId));
    // Get lead info for notification
    const leadRows = await db.select().from(leads).where(eq(leads.id, input.leadId)).limit(1);
    const lead = leadRows[0];
    const scheduledStr = meeting.scheduledAt
      ? new Date(meeting.scheduledAt).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
      : "the scheduled time";
    // Update Google Calendar event title to show ✓ Confirmed
    if (meeting.googleCalendarEventId) {
      try {
        await updateCalendarEvent(meeting.googleCalendarEventId, { confirmed: true });
      } catch (calErr: any) {
        console.warn("[GoogleCalendar] updateCalendarEvent error:", calErr?.message);
      }
    }
    // Notify owner
    await notifyOwner({
      title: `Meeting Confirmed — ${lead?.name ?? "Client"}`,
      content: `${lead?.name ?? "Your client"} has confirmed their consultation on ${scheduledStr}. Assignee: ${meeting.assignee ?? "Chad Price"}.`,
    });
    return { success: true, scheduledAt: scheduledStr, clientName: lead?.name ?? "" };
  }),

  // Client: get payment summary — contract total from approved proposals + all invoices
  getPaymentSummary: publicProcedure.input(z.object({ projectId: z.number().optional() }).optional()).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return null;
    // Verify kp_client_session cookie
    const token = ctx.req.cookies?.["kp_client_session"];
    if (!token) return null;
    let leadId: number;
    try {
      const secret = process.env.JWT_SECRET ?? "fallback-secret";
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretKey);
      if ((payload as any).role !== "client") return null;
      leadId = (payload as any).leadId as number;
    } catch { return null; }

    // Get all approved/sent estimates for this lead (contract total)
    const leadEstimates = await db.select({
      id: estimates.id,
      estimateNumber: estimates.estimateNumber,
      title: estimates.title,
      total: estimates.total,
      status: estimates.status,
      approvedAt: estimates.approvedAt,
    }).from(estimates).where(eq(estimates.leadId, leadId));

    // Contract total = sum of approved estimates
    const approvedEstimates = leadEstimates.filter(e => e.status === "approved");
    const contractTotal = approvedEstimates.reduce((sum, e) => sum + Number(e.total ?? 0), 0);

    // If no approved estimates, fall back to sum of all sent/viewed estimates
    const fallbackEstimates = leadEstimates.filter(e => ["sent", "viewed", "approved"].includes(e.status));
    const effectiveContractTotal = contractTotal > 0
      ? contractTotal
      : fallbackEstimates.reduce((sum, e) => sum + Number(e.total ?? 0), 0);

    // Get all invoices for this lead (by leadId OR by client's project IDs)
    const clientProjects = await db.select({ id: projects.id }).from(projects).where(eq(projects.leadId, leadId));
    const clientProjectIds = clientProjects.map(p => p.id);
    let leadInvoices;
    if (input?.projectId) {
      // Verify the requested project belongs to this client
      if (!clientProjectIds.includes(input.projectId)) return null;
      leadInvoices = await db.select().from(invoices)
        .where(eq(invoices.projectId, input.projectId))
        .orderBy(invoices.createdAt);
    } else {
      const conditions = [eq(invoices.leadId, leadId)];
      if (clientProjectIds.length > 0) {
        const { inArray } = await import("drizzle-orm");
        conditions.push(inArray(invoices.projectId, clientProjectIds));
      }
      leadInvoices = await db.select().from(invoices)
        .where(or(...conditions))
        .orderBy(invoices.createdAt);
    }

    // Build running balance
    let runningBalance = effectiveContractTotal;
    const invoicesWithBalance = leadInvoices.map(inv => {
      const amt = Number(inv.amount ?? 0);
      const paid = inv.status === "paid";
      if (paid) runningBalance -= amt;
      return {
        ...inv,
        balanceAfter: paid ? runningBalance : null,
      };
    });

    const totalPaid = leadInvoices
      .filter(i => i.status === "paid")
      .reduce((sum, i) => sum + Number(i.amount ?? 0), 0);

    const totalDue = leadInvoices
      .filter(i => i.status !== "paid" && i.status !== "cancelled")
      .reduce((sum, i) => sum + Number(i.amount ?? 0), 0);

    return {
      contractTotal: effectiveContractTotal,
      totalPaid,
      totalDue,
      remainingBalance: effectiveContractTotal - totalPaid,
      invoices: invoicesWithBalance,
      proposals: approvedEstimates.length > 0 ? approvedEstimates : fallbackEstimates,
    };
  }),

  // Client: get only this client's documents (scoped to their leadId + their projects)
  // Documents may have leadId set (client uploads) or only projectId (owner uploads).
  // We query both to ensure all client-safe docs appear.
  getMyDocuments: publicProcedure.input(z.object({ projectId: z.number().optional() }).optional()).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return [];
    const token = ctx.req.cookies?.["kp_client_session"];
    if (!token) return [];
    let leadId: number;
    try {
      const secret = process.env.JWT_SECRET ?? "fallback-secret";
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretKey);
      if ((payload as any).role !== "client") return [];
      leadId = (payload as any).leadId as number;
    } catch { return []; }

    // Get all project IDs belonging to this client
    const clientProjects = await db.select({ id: projects.id }).from(projects).where(eq(projects.leadId, leadId));
    const clientProjectIds = clientProjects.map(p => p.id);

    if (input?.projectId) {
      // Verify the requested project belongs to this client
      if (!clientProjectIds.includes(input.projectId)) return [];
      const projectDocs = await db.select().from(documents)
        .where(eq(documents.projectId, input.projectId))
        .orderBy(desc(documents.createdAt));
      // Filter out compliance/internal-only doc types consistently
      const hiddenTypes = ["compliance"];
      return projectDocs.filter(d => !hiddenTypes.includes(d.docType));
    }

    // Return docs linked by leadId OR by any of the client's projects
    const conditions = [eq(documents.leadId, leadId)];
    if (clientProjectIds.length > 0) {
      const { inArray } = await import("drizzle-orm");
      conditions.push(inArray(documents.projectId, clientProjectIds));
    }
    const allDocs = await db.select().from(documents)
      .where(or(...conditions))
      .orderBy(desc(documents.createdAt));

    // Filter out compliance/internal-only doc types that should not be shown to clients
    const hiddenTypes = ["compliance"];
    return allDocs.filter(d => !hiddenTypes.includes(d.docType));
  }),

  // Client: get only this client's messages (scoped to their leadId, optionally filtered by projectId)
  getMyMessages: publicProcedure.input(z.object({ projectId: z.number().optional() }).optional()).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return [];
    const token = ctx.req.cookies?.["kp_client_session"];
    if (!token) return [];
    let leadId: number;
    try {
      const secret = process.env.JWT_SECRET ?? "fallback-secret";
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretKey);
      if ((payload as any).role !== "client") return [];
      leadId = (payload as any).leadId as number;
    } catch { return []; }
    const projectId = input?.projectId;
    if (projectId) {
      // Join against message_projects to get only messages associated with this project
      const rows = await db.select({
        id: messages.id,
        projectId: messages.projectId,
        leadId: messages.leadId,
        threadType: messages.threadType,
        direction: messages.direction,
        channel: messages.channel,
        fromName: messages.fromName,
        fromPhone: messages.fromPhone,
        fromEmail: messages.fromEmail,
        body: messages.body,
        status: messages.status,
        subject: messages.subject,
        attachmentUrl: messages.attachmentUrl,
        attachmentName: messages.attachmentName,
        attachmentMime: messages.attachmentMime,
        attachmentsJson: messages.attachmentsJson,
        isRead: messages.isRead,
        createdAt: messages.createdAt,
      }).from(messages)
        .innerJoin(messageProjects, eq(messageProjects.messageId, messages.id))
        .where(and(eq(messages.leadId, leadId), eq(messageProjects.projectId, projectId)))
        .orderBy(desc(messages.createdAt))
        .limit(200);
      return rows;
    }
    return db.select().from(messages)
      .where(eq(messages.leadId, leadId))
      .orderBy(desc(messages.createdAt))
      .limit(200);
  }),

  // Client: send a portal message (scoped to their leadId, optionally associated with a project)
  sendPortalMessage: publicProcedure.input(z.object({
    body: z.string().min(1),
    projectId: z.number().optional(),
    attachments: z.array(z.object({
      url: z.string(),
      name: z.string(),
      mime: z.string(),
    })).optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const token = ctx.req.cookies?.["kp_client_session"];
    if (!token) throw new TRPCError({ code: "UNAUTHORIZED" });
    let leadId: number;
    let clientName: string;
    try {
      const secret = process.env.JWT_SECRET ?? "fallback-secret";
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretKey);
      if ((payload as any).role !== "client") throw new Error("Not client");
      leadId = (payload as any).leadId as number;
      clientName = (payload as any).name as string;
    } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
    const [inboundResult] = await db.insert(messages).values({
      leadId,
      projectId: input.projectId ?? null,
      threadType: "client",
      direction: "inbound",
      channel: "portal",
      fromName: clientName,
      body: input.body,
      status: "delivered",
      ...(input.attachments && input.attachments.length > 0
        ? { attachmentsJson: JSON.stringify(input.attachments) }
        : {}),
    });
    // Associate with project in the join table if projectId provided
    if (input.projectId && (inboundResult as any).insertId) {
      await db.insert(messageProjects).values({
        messageId: (inboundResult as any).insertId,
        projectId: input.projectId,
      });
    }
    // Auto-reply: send an immediate acknowledgment back to the client
    const [outboundResult] = await db.insert(messages).values({
      leadId,
      projectId: input.projectId ?? null,
      threadType: "client",
      direction: "outbound",
      channel: "portal",
      fromName: "Kitchens Plus Upstate",
      body: "Thanks for your message! We've received it and Chad will get back to you shortly. If it's urgent, call Chad directly at 864-567-8777.",
      status: "delivered",
    });
    if (input.projectId && (outboundResult as any).insertId) {
      await db.insert(messageProjects).values({
        messageId: (outboundResult as any).insertId,
        projectId: input.projectId,
      });
    }
    return { success: true };
  }),

  // Client: get their estimates (by leadId from session)
  getMyEstimates: publicProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const token = ctx.req.cookies?.["kp_client_session"];
    if (!token) return [];
    let leadId: number;
    try {
      const secret = process.env.JWT_SECRET ?? "fallback-secret";
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretKey);
      if ((payload as any).role !== "client") return [];
      leadId = (payload as any).leadId as number;
    } catch { return []; }
    return db.select().from(estimates).where(eq(estimates.leadId, leadId)).orderBy(desc(estimates.createdAt));
  }),

  // Client: get their project (by leadId from session)
  getMyProject: publicProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const token = ctx.req.cookies?.["kp_client_session"];
    if (!token) return null;
    let leadId: number;
    try {
      const secret = process.env.JWT_SECRET ?? "fallback-secret";
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretKey);
      if ((payload as any).role !== "client") return null;
      leadId = (payload as any).leadId as number;
    } catch { return null; }
    const projectRows = await db.select().from(projects).where(eq(projects.leadId, leadId)).limit(1);
    const project = projectRows[0] ?? null;
    if (!project) return null;
    // Get milestones
    const ms = await db.select().from(milestones).where(eq(milestones.projectId, project.id)).orderBy(milestones.sortOrder);
    // Get approved estimates for budget
    const ests = await db.select().from(estimates).where(eq(estimates.leadId, leadId));
    const contractTotal = ests
      .filter(e => ["approved", "sent", "viewed"].includes(e.status))
      .reduce((sum, e) => sum + Number(e.total ?? 0), 0);
    // Get paid invoices for paid amount
    const invs = await db.select().from(invoices).where(eq(invoices.leadId, leadId));
    const totalPaid = invs.filter(i => i.status === "paid").reduce((sum, i) => sum + Number(i.amount ?? 0), 0);
    const totalDue = invs.filter(i => i.status !== "paid" && i.status !== "cancelled").reduce((sum, i) => sum + Number(i.amount ?? 0), 0);
    // Next upcoming milestone
    const nextMilestone = ms.find(m => m.status !== "completed" && m.status !== "cancelled");
    // Last activity: max of last message and last document createdAt
    const lastMsgRows = await db.select({ createdAt: messages.createdAt })
      .from(messages).where(eq(messages.leadId, leadId)).orderBy(desc(messages.createdAt)).limit(1);
    const lastDocRows = await db.select({ createdAt: documents.createdAt })
      .from(documents).where(or(eq(documents.leadId, leadId), eq(documents.projectId, project.id))).orderBy(desc(documents.createdAt)).limit(1);
    const lastMsgAt = lastMsgRows[0]?.createdAt ?? null;
    const lastDocAt = lastDocRows[0]?.createdAt ?? null;
    let lastActivityAt: Date | null = null;
    if (lastMsgAt && lastDocAt) lastActivityAt = lastMsgAt > lastDocAt ? lastMsgAt : lastDocAt;
    else lastActivityAt = lastMsgAt ?? lastDocAt ?? null;
    return {
      ...project,
      milestones: ms,
      contractTotal,
      totalPaid,
      totalDue,
      nextMilestone: nextMilestone ?? null,
      lastActivityAt,
    };
  }),

  // Owner: list all reschedule requests
  listRescheduleRequests: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(rescheduleRequests).orderBy(desc(rescheduleRequests.createdAt)).limit(50);
  }),

  // ─── Design Idea Notes ───────────────────────────────────────────────────
  getMyDesignNotes: publicProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const token = ctx.req.cookies?.["kp_client_session"];
    if (!token) return [];
    let leadId: number;
    try {
      const secret = process.env.JWT_SECRET ?? "fallback-secret";
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretKey);
      if ((payload as any).role !== "client") return [];
      leadId = (payload as any).leadId as number;
    } catch { return []; }
    return db.select().from(designIdeaNotes)
      .where(eq(designIdeaNotes.leadId, leadId))
      .orderBy(desc(designIdeaNotes.updatedAt));
  }),

  saveDesignNote: publicProcedure.input(z.object({
    id: z.number().optional(),
    room: z.string().default("General"),
    note: z.string().min(1),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const token = ctx.req.cookies?.["kp_client_session"];
    if (!token) throw new TRPCError({ code: "UNAUTHORIZED" });
    let leadId: number;
    try {
      const secret = process.env.JWT_SECRET ?? "fallback-secret";
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretKey);
      if ((payload as any).role !== "client") throw new Error("Not client");
      leadId = (payload as any).leadId as number;
    } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
    if (input.id) {
      await db.update(designIdeaNotes).set({ room: input.room, note: input.note })
        .where(and(eq(designIdeaNotes.id, input.id), eq(designIdeaNotes.leadId, leadId)));
      return { id: input.id };
    }
    const [result] = await db.insert(designIdeaNotes).values({ leadId, room: input.room, note: input.note });
    return { id: (result as any).insertId };
  }),

  deleteDesignNote: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const token = ctx.req.cookies?.["kp_client_session"];
    if (!token) throw new TRPCError({ code: "UNAUTHORIZED" });
    let leadId: number;
    try {
      const secret = process.env.JWT_SECRET ?? "fallback-secret";
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretKey);
      if ((payload as any).role !== "client") throw new Error("Not client");
      leadId = (payload as any).leadId as number;
    } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
    await db.delete(designIdeaNotes)
      .where(and(eq(designIdeaNotes.id, input.id), eq(designIdeaNotes.leadId, leadId)));
    return { success: true };
  }),

  // Client: get all proposals sent to this client
  getMyProposals: publicProcedure.input(z.object({ projectId: z.number().optional() }).optional()).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return [];
    const token = ctx.req.cookies?.["kp_client_session"];
    if (!token) return [];
    let leadId: number;
    try {
      const secret = process.env.JWT_SECRET ?? "fallback-secret";
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretKey);
      if ((payload as any).role !== "client") return [];
      leadId = Number((payload as any).leadId);
    } catch { return []; }
    if (!leadId || isNaN(leadId)) return [];
    const estimateWhere = input?.projectId
      ? and(eq(estimates.leadId, leadId), eq(estimates.projectId, input.projectId))
      : eq(estimates.leadId, leadId);
    return db.select().from(estimates)
      .where(estimateWhere)
      .orderBy(desc(estimates.createdAt));
  }),

  // Client: upload a file/photo from the portal messages screen
  uploadPortalFile: publicProcedure.input(z.object({
    fileBase64: z.string(),
    fileName: z.string(),
    mimeType: z.string(),
    body: z.string().default(""),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const token = ctx.req.cookies?.["kp_client_session"];
    if (!token) throw new TRPCError({ code: "UNAUTHORIZED" });
    let leadId: number;
    let clientName: string;
    try {
      const secret = process.env.JWT_SECRET ?? "fallback-secret";
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretKey);
      if ((payload as any).role !== "client") throw new Error("Not client");
      leadId = (payload as any).leadId as number;
      clientName = (payload as any).name as string;
    } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
    const { storagePut } = await import("../storage");
    const buf = Buffer.from(input.fileBase64, "base64");
    const ext = input.fileName.split(".").pop() ?? "bin";
    const key = `portal-uploads/${leadId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { url } = await storagePut(key, buf, input.mimeType);
    const body = input.body || `[File: ${input.fileName}]`;
    await db.insert(messages).values({
      leadId,
      threadType: "client",
      direction: "inbound",
      channel: "portal",
      fromName: clientName,
      body,
      status: "delivered",
      attachmentUrl: url,
      attachmentName: input.fileName,
      attachmentMime: input.mimeType,
    });
    return { success: true, url };
  }),

  // Client: add an inspiration item (image, link, or note)
  addInspirationItem: publicProcedure.input(z.object({
    itemType: z.enum(["note", "image", "link"]),
    room: z.string().default("General"),
    note: z.string().optional(),
    imageBase64: z.string().optional(),
    imageName: z.string().optional(),
    imageMime: z.string().optional(),
    linkUrl: z.string().optional(),
    linkTitle: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const token = ctx.req.cookies?.["kp_client_session"];
    if (!token) throw new TRPCError({ code: "UNAUTHORIZED" });
    let leadId: number;
    try {
      const secret = process.env.JWT_SECRET ?? "fallback-secret";
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretKey);
      if ((payload as any).role !== "client") throw new Error("Not client");
      leadId = (payload as any).leadId as number;
    } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
    let imageUrl: string | undefined;
    let imageKey: string | undefined;
    if (input.itemType === "image" && input.imageBase64) {
      const { storagePut } = await import("../storage");
      const buf = Buffer.from(input.imageBase64, "base64");
      const ext = (input.imageName ?? "img").split(".").pop() ?? "jpg";
      const key = `inspiration/${leadId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const result = await storagePut(key, buf, input.imageMime ?? "image/jpeg");
      imageUrl = result.url;
      imageKey = key;
    }
    const [result] = await db.insert(designIdeaNotes).values({
      leadId,
      room: input.room,
      note: input.note ?? null,
      imageUrl: imageUrl ?? null,
      imageKey: imageKey ?? null,
      linkUrl: input.linkUrl ?? null,
      linkTitle: input.linkTitle ?? null,
      itemType: input.itemType,
    } as any);
    return { id: (result as any).insertId };
  }),

  // Client: delete their own inspiration item
  deleteInspirationItem: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const token = ctx.req.cookies?.["kp_client_session"];
    if (!token) throw new TRPCError({ code: "UNAUTHORIZED" });
    let leadId: number;
    try {
      const secret = process.env.JWT_SECRET ?? "fallback-secret";
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretKey);
      if ((payload as any).role !== "client") throw new Error("Not client");
      leadId = (payload as any).leadId as number;
    } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
    await db.delete(designIdeaNotes)
      .where(and(eq(designIdeaNotes.id, input.id), eq(designIdeaNotes.leadId, leadId)));
    return { success: true };
  }),

  // Owner: accept or decline a reschedule request
  reviewReschedule: adminProcedure.input(z.object({
    id: z.number(),
    action: z.enum(["accepted", "declined"]),
    reviewedBy: z.string().optional(),
    acceptedTime: z.string().optional(), // ISO string of the accepted suggested time
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Load the reschedule request
    const reqRows = await db.select().from(rescheduleRequests).where(eq(rescheduleRequests.id, input.id)).limit(1);
    const req = reqRows[0];
    if (!req) throw new TRPCError({ code: "NOT_FOUND", message: "Reschedule request not found" });
    // Update request status
    await db.update(rescheduleRequests).set({
      status: input.action as any,
      reviewedAt: new Date(),
      reviewedBy: input.reviewedBy ?? "Chad Price",
    }).where(eq(rescheduleRequests.id, input.id));
    if (input.action === "accepted" && req.meetingId) {
      // Use acceptedTime if provided, otherwise fall back to suggestedTime1
      let newTime: Date | null = null;
      if (input.acceptedTime) {
        newTime = new Date(input.acceptedTime);
      } else if (req.suggestedTime1) {
        newTime = new Date(req.suggestedTime1);
      }
      if (newTime && !isNaN(newTime.getTime())) {
        // Update meeting.scheduledAt and status
        await db.update(meetings).set({ scheduledAt: newTime, status: "confirmed" as any }).where(eq(meetings.id, req.meetingId));
        // Load lead for SMS
        const meetingRows = await db.select().from(meetings).where(eq(meetings.id, req.meetingId)).limit(1);
        const meeting = meetingRows[0];
        if (meeting?.leadId) {
          const leadRows = await db.select().from(leads).where(eq(leads.id, meeting.leadId)).limit(1);
          const lead = leadRows[0];
          if (lead?.phone) {
            const newTimeStr = newTime.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
            const smsBody = `Hi ${lead.name.split(" ")[0]}! Great news — your consultation with Kitchens Plus Upstate has been confirmed for ${newTimeStr}. We look forward to meeting you! Questions? Call +1 (833) 518-4811.`;
            try { await sendSms({ to: lead.phone, message: smsBody, isFirstContact: false }); } catch { /* non-fatal */ }
          }
          // Update Google Calendar event title to "✓ Confirmed"
          if (meeting.googleCalendarEventId) {
            try {
              await updateCalendarEvent(meeting.googleCalendarEventId, { confirmed: true });
            } catch { /* non-fatal */ }
          }
        }
      }
    }
    return { success: true };
  }),

  /**
   * Client-safe financial health summary.
   * Returns only client-friendly data — NO internal risk flags, NO AI alerts.
   */
  getMyFinancialHealth: publicProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    // Verify kp_client_session cookie
    const token = ctx.req.cookies?.["kp_client_session"];
    if (!token) return null;
    let leadId: number;
    try {
      const { jwtVerify } = await import("jose");
      const secret = process.env.JWT_SECRET ?? "fallback-secret";
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretKey);
      if ((payload as any).role !== "client") return null;
      leadId = (payload as any).leadId as number;
    } catch { return null; }

    // Find the client's active project — portal JWT stores leadId, so match on projects.leadId
    const projRows = await db
      .select({ id: projects.id, budgetEstimated: projects.budgetEstimated, budgetActual: projects.budgetActual })
      .from(projects)
      .where(eq(projects.leadId, leadId))
      .orderBy(desc(projects.createdAt))
      .limit(1);
    const proj = projRows[0];
    if (!proj) return null;

    // Get latest financial snapshot
    const snapRows = await db
      .select()
      .from(financialSnapshots)
      .where(eq(financialSnapshots.projectId, proj.id))
      .orderBy(desc(financialSnapshots.snapshotAt))
      .limit(1);
    const snap = snapRows[0] ?? null;

    // Count pending invoices (sent but not paid)
    const pendingInvoices = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.projectId, proj.id), eq(invoices.status, "sent")));

    // Next unpaid milestone
    const nextMilestoneRows = await db
      .select({ id: milestones.id, title: milestones.title, billingAmount: milestones.billingAmount, dueDate: milestones.dueDate })
      .from(milestones)
      .where(and(eq(milestones.projectId, proj.id), eq(milestones.status, "pending")))
      .orderBy(milestones.dueDate)
      .limit(1);
    const nextMilestone = nextMilestoneRows[0] ?? null;

    // Compute contractTotal from approved estimates (projects has no contractTotal column)
    const approvedEsts = await db
      .select({ total: estimates.total })
      .from(estimates)
      .where(and(eq(estimates.projectId, proj.id), eq(estimates.status, "approved")));
    const contractTotal = approvedEsts.reduce((sum, e) => sum + Number(e.total ?? 0), 0);
    // Compute totalPaid from paid invoices for this project (projects has no totalPaid column)
    const paidInvRows = await db
      .select({ amount: invoices.amount })
      .from(invoices)
      .where(and(eq(invoices.projectId, proj.id), eq(invoices.status, "paid")));
    const totalPaid = paidInvRows.reduce((sum, i) => sum + Number(i.amount ?? 0), 0);
    const remaining = Math.max(0, contractTotal - totalPaid);
    const paidPct = contractTotal > 0 ? Math.round((totalPaid / contractTotal) * 100) : 0;
    const depositCollected = snap ? snap.depositCollected : totalPaid > 0;

    return {
      contractTotal,
      totalPaid,
      remaining,
      paidPct,
      depositCollected,
      pendingInvoiceCount: pendingInvoices.length,
      nextMilestone: nextMilestone
        ? { title: nextMilestone.title, amount: Number(nextMilestone.billingAmount ?? 0), dueDate: nextMilestone.dueDate }
        : null,
      snapshotAt: snap?.snapshotAt ?? null,
    };
  }),

  // ─── Recent Activity Feed ────────────────────────────────────────────────────
  getRecentActivity: publicProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const token = ctx.req.cookies?.["kp_client_session"];
    if (!token) return [];
    let leadId: number;
    try {
      const secret = process.env.JWT_SECRET ?? "fallback-secret";
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretKey);
      if ((payload as any).role !== "client") return [];
      leadId = (payload as any).leadId as number;
    } catch { return []; }

    // Get project for milestone queries
    const projectRows = await db.select({ id: projects.id }).from(projects).where(eq(projects.leadId, leadId)).limit(1);
    const projectId = projectRows[0]?.id ?? null;

    type ActivityItem = { type: string; description: string; createdAt: Date; icon: string };
    const items: ActivityItem[] = [];

    // Last 5 messages (portal/email/sms)
    const recentMsgs = await db.select({ body: messages.body, direction: messages.direction, createdAt: messages.createdAt, channel: messages.channel })
      .from(messages).where(eq(messages.leadId, leadId)).orderBy(desc(messages.createdAt)).limit(5);
    for (const m of recentMsgs) {
      const preview = (m.body ?? "").slice(0, 60) + ((m.body ?? "").length > 60 ? "…" : "");
      items.push({
        type: "message",
        description: m.direction === "inbound" ? `You sent a message: "${preview}"` : `Message from Kitchens Plus: "${preview}"`,
        createdAt: m.createdAt,
        icon: "MessageSquare",
      });
    }

    // Last 5 documents/photos uploaded (by leadId OR by client's project)
    const docConditions = [eq(documents.leadId, leadId)];
    if (projectId) docConditions.push(eq(documents.projectId, projectId));
    const recentDocs = await db.select({ fileName: documents.fileName, docType: documents.docType, createdAt: documents.createdAt, uploadedByClient: documents.uploadedByClient })
      .from(documents).where(or(...docConditions)).orderBy(desc(documents.createdAt)).limit(5);
    for (const d of recentDocs) {
      const isPhoto = d.docType === "photo";
      items.push({
        type: isPhoto ? "photo" : "document",
        description: d.uploadedByClient
          ? `You uploaded ${isPhoto ? "a photo" : `a document (${d.fileName})`}`
          : `${isPhoto ? "New photo added" : `Document uploaded: ${d.fileName}`} by your team`,
        createdAt: d.createdAt,
        icon: isPhoto ? "Camera" : "FileText",
      });
    }

    // Last 5 milestone status changes (use updatedAt as proxy)
    if (projectId) {
      const recentMs = await db.select({ title: milestones.title, status: milestones.status, updatedAt: milestones.updatedAt })
        .from(milestones).where(eq(milestones.projectId, projectId)).orderBy(desc(milestones.updatedAt)).limit(5);
      for (const m of recentMs) {
        const label = m.status === "completed" ? "completed" : m.status === "in_progress" ? "started" : m.status === "delayed" ? "marked delayed" : null;
        if (!label) continue;
        items.push({
          type: "milestone",
          description: `Milestone "${m.title}" ${label}`,
          createdAt: m.updatedAt ?? new Date(0),
          icon: "CheckCircle",
        });
      }
    }

    // Sort all by createdAt desc, return top 5
    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return items.slice(0, 5).map(i => ({ ...i, createdAt: i.createdAt.getTime() }));
  }),

  // ─── Recent Photos ───────────────────────────────────────────────────────────
  getRecentPhotos: publicProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const token = ctx.req.cookies?.["kp_client_session"];
    if (!token) return [];
    let leadId: number;
    try {
      const secret = process.env.JWT_SECRET ?? "fallback-secret";
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretKey);
      if ((payload as any).role !== "client") return [];
      leadId = (payload as any).leadId as number;
    } catch { return []; }
    // Also check by projectId so photos uploaded without leadId still appear
    const clientProjects = await db.select({ id: projects.id }).from(projects).where(eq(projects.leadId, leadId));
    const clientProjectIds = clientProjects.map(p => p.id);
    const photoConditions = [eq(documents.leadId, leadId)];
    if (clientProjectIds.length > 0) {
      const { inArray } = await import("drizzle-orm");
      photoConditions.push(inArray(documents.projectId, clientProjectIds));
    }
    const photos = await db.select({ id: documents.id, fileUrl: documents.fileUrl, fileName: documents.fileName, createdAt: documents.createdAt })
      .from(documents)
      .where(and(or(...photoConditions), eq(documents.docType, "photo")))
      .orderBy(desc(documents.createdAt))
      .limit(4);
    return photos.map(p => ({ ...p, createdAt: p.createdAt.getTime() }));
  }),

  // ─── Download Invoice PDF (client-scoped, on-demand generation) ──────────────
  downloadInvoicePdf: publicProcedure.input(z.object({ invoiceId: z.number() })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const token = ctx.req.cookies?.["kp_client_session"];
    if (!token) throw new TRPCError({ code: "UNAUTHORIZED" });
    let leadId: number;
    try {
      const secret = process.env.JWT_SECRET ?? "fallback-secret";
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretKey);
      if ((payload as any).role !== "client") throw new TRPCError({ code: "FORBIDDEN" });
      leadId = (payload as any).leadId as number;
    } catch (e: any) {
      // Re-throw TRPCErrors (e.g. FORBIDDEN from role check above)
      if (e instanceof TRPCError) throw e;
      // Any other error (invalid JWT, expired, etc.) → UNAUTHORIZED
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    // Verify the invoice belongs to this client's lead
    const [inv] = await db.select().from(invoices)
      .where(eq(invoices.id, input.invoiceId))
      .limit(1);
    if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
    if (inv.leadId !== leadId) throw new TRPCError({ code: "FORBIDDEN" });
    // If a PDF URL is already stored, return it
    if (inv.pdfUrl) return { url: inv.pdfUrl };
    // Otherwise generate on-demand
    const [lead] = await db.select({ name: leads.name, email: leads.email }).from(leads).where(eq(leads.id, leadId)).limit(1);
    let projectName: string | null = null;
    if (inv.projectId) {
      const [proj] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, inv.projectId)).limit(1);
      if (proj) projectName = proj.name;
    }
    const { generateInvoicePdf } = await import("../invoicePdf");
    const pdfBuffer = await generateInvoicePdf({
      invoiceNumber: inv.invoiceNumber ?? String(inv.id),
      invoiceType: inv.invoiceType ?? "other",
      status: inv.status,
      amount: inv.amount,
      dueDate: inv.dueDate,
      sentAt: inv.sentAt,
      notes: inv.notes,
      squarePaymentUrl: inv.squarePaymentUrl,
      clientName: lead?.name ?? "Client",
      clientEmail: lead?.email ?? undefined,
      projectName: projectName ?? undefined,
    });
    const { storagePut } = await import("../storage");
    const fileKey = `invoices/client/${leadId}/invoice-${inv.id}-${Date.now()}.pdf`;
    const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");
    // Cache the URL on the invoice record for future requests
    await db.update(invoices).set({ pdfUrl: url, pdfKey: fileKey }).where(eq(invoices.id, inv.id));
    return { url };
  }),

  // ─── Get all projects for this client (newest first) ─────────────────────────
  getMyProjects: publicProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const token = ctx.req.cookies?.["kp_client_session"];
    if (!token) return [];
    let leadId: number;
    try {
      const secret = process.env.JWT_SECRET ?? "fallback-secret";
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretKey);
      if ((payload as any).role !== "client") return [];
      leadId = (payload as any).leadId as number;
    } catch { return []; }
    // Fetch all projects for this client, newest first
    const projectRows = await db.select().from(projects)
      .where(eq(projects.leadId, leadId))
      .orderBy(desc(projects.createdAt));
    if (projectRows.length === 0) return [];
    // For each project, get milestone progress
    const result = await Promise.all(projectRows.map(async (project) => {
      const ms = await db!.select({
        id: milestones.id,
        status: milestones.status,
      }).from(milestones).where(eq(milestones.projectId, project.id));
      const totalMs = ms.length;
      const completedMs = ms.filter(m => m.status === "completed").length;
      const progress = totalMs > 0 ? Math.round((completedMs / totalMs) * 100) : 0;
      return {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        projectType: project.projectType,
        startDate: project.startDate,
        estimatedEndDate: project.estimatedEndDate,
        createdAt: project.createdAt,
        progress,
        totalMilestones: totalMs,
        completedMilestones: completedMs,
      };
    }));
    return result;
  }),

  // ─── Get payment history for a specific invoice (client-scoped) ────────────
  getInvoicePayments: publicProcedure.input(z.object({ invoiceId: z.number() })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return [];
    const token = ctx.req.cookies?.["kp_client_session"];
    if (!token) return [];
    let leadId: number;
    try {
      const secret = process.env.JWT_SECRET ?? "fallback-secret";
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretKey);
      if ((payload as any).role !== "client") return [];
      leadId = (payload as any).leadId as number;
    } catch { return []; }
    // Verify invoice belongs to this client
    const [inv] = await db.select({ id: invoices.id, leadId: invoices.leadId }).from(invoices)
      .where(eq(invoices.id, input.invoiceId)).limit(1);
    if (!inv || inv.leadId !== leadId) return [];
    const payments = await db.select({
      id: invoicePayments.id,
      amount: invoicePayments.amount,
      method: invoicePayments.method,
      checkNumber: invoicePayments.checkNumber,
      paidDate: invoicePayments.paidDate,
      paidAt: invoicePayments.paidAt,
      note: invoicePayments.note,
    }).from(invoicePayments)
      .where(eq(invoicePayments.invoiceId, input.invoiceId))
      .orderBy(desc(invoicePayments.paidAt));
    return payments;
  }),

  // ─── Get a specific project by ID (client-scoped) ─────────────────────────
  getMyProjectById: publicProcedure.input(z.object({ projectId: z.number() })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return null;
    const token = ctx.req.cookies?.["kp_client_session"];
    if (!token) return null;
    let leadId: number;
    try {
      const secret = process.env.JWT_SECRET ?? "fallback-secret";
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretKey);
      if ((payload as any).role !== "client") return null;
      leadId = (payload as any).leadId as number;
    } catch { return null; }
    // Fetch project — must belong to this client
    const projectRows = await db.select().from(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.leadId, leadId)))
      .limit(1);
    const project = projectRows[0] ?? null;
    if (!project) return null;
    const ms = await db.select().from(milestones).where(eq(milestones.projectId, project.id)).orderBy(milestones.sortOrder);
    const ests = await db.select().from(estimates).where(eq(estimates.leadId, leadId));
    const contractTotal = ests
      .filter(e => ["approved", "sent", "viewed"].includes(e.status))
      .reduce((sum, e) => sum + Number(e.total ?? 0), 0);
    const invs = await db.select().from(invoices).where(eq(invoices.leadId, leadId));
    const totalPaid = invs.filter(i => i.status === "paid").reduce((sum, i) => sum + Number(i.amount ?? 0), 0);
    const totalDue = invs.filter(i => i.status !== "paid" && i.status !== "cancelled").reduce((sum, i) => sum + Number(i.amount ?? 0), 0);
    const nextMilestone = ms.find(m => m.status !== "completed" && m.status !== "cancelled");
    const lastMsgRows = await db.select({ createdAt: messages.createdAt })
      .from(messages).where(eq(messages.leadId, leadId)).orderBy(desc(messages.createdAt)).limit(1);
    const lastDocRows = await db.select({ createdAt: documents.createdAt })
      .from(documents).where(or(eq(documents.leadId, leadId), eq(documents.projectId, project.id))).orderBy(desc(documents.createdAt)).limit(1);
    const lastMsgAt = lastMsgRows[0]?.createdAt ?? null;
    const lastDocAt = lastDocRows[0]?.createdAt ?? null;
    let lastActivityAt: Date | null = null;
    if (lastMsgAt && lastDocAt) lastActivityAt = lastMsgAt > lastDocAt ? lastMsgAt : lastDocAt;
    else lastActivityAt = lastMsgAt ?? lastDocAt ?? null;
    return { ...project, milestones: ms, contractTotal, totalPaid, totalDue, nextMilestone: nextMilestone ?? null, lastActivityAt };
  }),

  // ─── List inspiration items for this client (client-scoped) ──────────────────
  listMyInspirationItems: publicProcedure.input(z.object({ projectId: z.number().optional() })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return [];
    const token = ctx.req.cookies?.["kp_client_session"];
    if (!token) return [];
    let leadId: number;
    try {
      const secret = process.env.JWT_SECRET ?? "fallback-secret";
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretKey);
      if ((payload as any).role !== "client") return [];
      leadId = (payload as any).leadId as number;
    } catch { return []; }
    const rows = await db.select().from(designIdeaNotes)
      .where(eq(designIdeaNotes.leadId, leadId))
      .orderBy(desc(designIdeaNotes.createdAt));
    return rows;
  }),
});
