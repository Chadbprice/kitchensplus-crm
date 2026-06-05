import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";
import { getDb } from "./db";
import {
  leads, clients, vendors, vendorContacts, vendorDocs, crewMembers, projects, milestones,
  projectAssignments, estimates, estimateLineItems, purchaseOrders, poLineItems,
  vendorQuotes, messages, documents, invoices, invoicePayments, scheduleEvents, projectTypes,
  appSettings, automationLogs, meetings, crewTimeLogs, crewSetFees, projectTasks, gmailSyncState,
  designIdeaNotes, invoiceDocuments, messageSummaries,
  taskAssignees, taskCategories, projectSummaries, proposalAttachments, rfis,
  ownerRescheduleProposals, subcontractorAwardCandidates, subcontractors,
  estimateVersions,
} from "../drizzle/schema";
import { clientPortalRouter } from "./routers/clientPortal";
import { fieldCaptureRouter } from "./routers/fieldCapture";
import { proposalAttachmentsRouter } from "./routers/proposalAttachments";
import { taskResponseRouter } from "./routers/taskResponse";
import { rfiRouter } from "./routers/rfi";
import { changeOrdersRouter } from "./routers/changeOrders";
import { rfiThreadsRouter } from "./routers/rfiThreads";
import { vmsRouter } from "./routers/vms";
import { subcontractorsRouter } from "./routers/subcontractors";
import { agentsRouter } from "./routers/agents";
import { cooRouter } from "./routers/coo";
import { siteMeetingsRouter } from "./routers/siteMeetings";
import { triggerFinancialReview } from "./agents/triggerFinancialReview";
import { triggerMilestoneCommunication } from "./agents/triggerMilestoneCommunication";
import { runProjectSummaryAgent } from "./agents/ProjectSummaryAgent";
import { triggerNextActionRecompute } from "./agents/triggerNextActionRecompute";
import { eq, desc, asc, and, like, or, sql, inArray } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { transcribeAudio } from "./_core/voiceTranscription";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import { sendSms } from "./sms";
import { createPaymentLink } from "./payments";
import { createCalendarEvent, updateCalendarEvent } from "./googleCalendar";

// ─── Admin guard ─────────────────────────────────────────────────────────────
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = (ctx.user as any).role;
  if (role !== "owner" && role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Owner access required" });
  }
  return next({ ctx });
});

// ─── Leads router ─────────────────────────────────────────────────────────────
const leadsRouter = router({
  list: adminProcedure.input(z.object({
    status: z.string().optional(),
    search: z.string().optional(),
  }).optional()).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    // Fetch all leads, then attach the latest meeting's status/confirmedAt for each
    const allLeads = await db.select().from(leads).orderBy(desc(leads.createdAt));
    // Fetch all meetings in one query to avoid N+1
    const allMeetings = await db.select({
      id: meetings.id,
      leadId: meetings.leadId,
      status: meetings.status,
      confirmedAt: meetings.confirmedAt,
      scheduledAt: meetings.scheduledAt,
    }).from(meetings).orderBy(desc(meetings.createdAt));
    // Map: leadId -> latest meeting
    const latestMeetingByLead = new Map<number, typeof allMeetings[0]>();
    for (const m of allMeetings) {
      if (!latestMeetingByLead.has(m.leadId)) latestMeetingByLead.set(m.leadId, m);
    }
    // Also fetch clientId for each lead by matching email to clients table
    const allClients = await db.select({ id: clients.id, email: clients.email }).from(clients);
    const clientByEmail = new Map<string, number>();
    for (const c of allClients) {
      if (c.email) clientByEmail.set(c.email.toLowerCase(), c.id);
    }
    return allLeads
      .filter(lead => !lead.archivedAt)
      .map(lead => ({
        ...lead,
        latestMeeting: latestMeetingByLead.get(lead.id) ?? null,
        clientId: lead.email ? (clientByEmail.get(lead.email.toLowerCase()) ?? null) : null,
      }));
  }),

  // Check if a lead has any connected data before deleting
  checkConnectedData: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { hasData: false, counts: {} };
    const [estCount] = await db.select({ c: sql<number>`count(*)` }).from(estimates).where(eq(estimates.leadId, input.id));
    const [projCount] = await db.select({ c: sql<number>`count(*)` }).from(projects).where(eq(projects.leadId, input.id));
    const [msgCount] = await db.select({ c: sql<number>`count(*)` }).from(messages).where(eq(messages.leadId, input.id));
    const counts = { estimates: Number(estCount.c), projects: Number(projCount.c), messages: Number(msgCount.c) };
    return { hasData: Object.values(counts).some(v => v > 0), counts };
  }),

  // Archive a lead (soft delete)
  archive: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(leads).set({ archivedAt: new Date() } as any).where(eq(leads.id, input.id));
    return { success: true };
  }),

  // Unarchive a lead
  unarchive: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(leads).set({ archivedAt: null } as any).where(eq(leads.id, input.id));
    return { success: true };
  }),

  // Delete a lead and all connected data
  deleteWithData: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(messages).where(eq(messages.leadId, input.id));
    const projRows = await db.select({ id: projects.id }).from(projects).where(eq(projects.leadId, input.id));
    for (const proj of projRows) {
      await db.delete(milestones).where(eq(milestones.projectId, proj.id));
      await db.delete(projectAssignments).where(eq(projectAssignments.projectId, proj.id));
      await db.delete(projectTasks).where(eq(projectTasks.projectId, proj.id));
    }
    await db.delete(projects).where(eq(projects.leadId, input.id));
    await db.delete(estimates).where(eq(estimates.leadId, input.id));
    await db.delete(meetings).where(eq(meetings.leadId, input.id));
    await db.delete(leads).where(eq(leads.id, input.id));
    return { success: true };
  }),

  // List archived leads
  listArchived: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(leads).where(sql`${leads.archivedAt} IS NOT NULL`).orderBy(desc(leads.archivedAt));
  }),

  get: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const result = await db.select().from(leads).where(eq(leads.id, input.id)).limit(1);
    return result[0] ?? null;
  }),

  create: adminProcedure.input(z.object({
    name: z.string(),
    email: z.string().optional(),
    email2: z.string().optional(),
    email3: z.string().optional(),
    phone: z.string().optional(),
    phone2: z.string().optional(),
    phone3: z.string().optional(),
    projectType: z.string().optional(),
    source: z.string().optional(),
    notes: z.string().optional(),
    address: z.string().optional(),
    addressPlaceId: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(leads).values({
      name: input.name,
      email: input.email,
      email2: input.email2,
      email3: input.email3,
      phone: input.phone,
      phone2: input.phone2,
      phone3: input.phone3,
      projectType: input.projectType,
      source: input.source,
      notes: input.notes,
      address: input.address,
      addressPlaceId: input.addressPlaceId,
      status: "new",
    });
    const [{ newId }] = await db.select({ newId: sql<number>`LAST_INSERT_ID()` }).from(leads).limit(1);
    return { id: newId };
  }),

  update: adminProcedure.input(z.object({
    id: z.number(),
    name: z.string().optional(),
    email: z.string().optional(),
    email2: z.string().optional(),
    email3: z.string().optional(),
    phone: z.string().optional(),
    phone2: z.string().optional(),
    phone3: z.string().optional(),
    projectType: z.string().optional(),
    status: z.enum(["new","consultation_scheduled","visited","quoted","won","lost"]).optional(),
    source: z.string().optional(),
    notes: z.string().optional(),
    address: z.string().optional(),
    addressPlaceId: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, ...data } = input;
    await db.update(leads).set(data as any).where(eq(leads.id, id));
    return { success: true };
  }),

  delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(leads).where(eq(leads.id, input.id));
    return { success: true };
  }),

  updateInternalNotes: adminProcedure.input(z.object({
    id: z.number(),
    internalNotes: z.string(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(leads).set({ internalNotes: input.internalNotes }).where(eq(leads.id, input.id));
    return { success: true };
  }),

  convertToProject: adminProcedure.input(z.object({
    leadId: z.number(),
    projectName: z.string().optional(),
    startDate: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const leadRows = await db.select().from(leads).where(eq(leads.id, input.leadId)).limit(1);
    const lead = leadRows[0];
    if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
    // Find or create client record
    let clientId: number | undefined;
    if (lead.email) {
      const existing = await db.select({ id: clients.id }).from(clients).where(eq(clients.email, lead.email)).limit(1);
      if (existing[0]) {
        clientId = existing[0].id;
      } else {
        await db.insert(clients).values({
          name: lead.name,
          email: lead.email,
          email2: (lead as any).email2,
          email3: (lead as any).email3,
          phone: lead.phone,
          phone2: (lead as any).phone2,
          phone3: (lead as any).phone3,
          address: lead.address,
        });
        const [{ newClientId }] = await db.select({ newClientId: sql<number>`LAST_INSERT_ID()` }).from(clients).limit(1);
        clientId = newClientId;
      }
    }
    // Assign a color for the project (cycle through palette)
    const palette = ["#D4A853","#6B8E6B","#7B9BB5","#C47B5A","#9B7BC4","#5AB5A8","#C45A7B","#8BB57B"];
    const allProjects = await db.select({ id: projects.id }).from(projects);
    const color = palette[allProjects.length % palette.length];
    await db.insert(projects).values({
      leadId: input.leadId,
      clientId,
      name: input.projectName ?? `${lead.name} — ${lead.projectType ?? "Project"}`,
      projectType: lead.projectType,
      address: lead.address,
      status: "planning",
      color,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
    });
    const [{ newProjectId }] = await db.select({ newProjectId: sql<number>`LAST_INSERT_ID()` }).from(projects).limit(1);
    // Mark lead as won
    await db.update(leads).set({ status: "won" }).where(eq(leads.id, input.leadId));
    return { projectId: newProjectId };
  }),

  sendDashboardLink: adminProcedure.input(z.object({
    leadId: z.number(),
    origin: z.string(), // window.location.origin from frontend
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const leadRows = await db.select().from(leads).where(eq(leads.id, input.leadId)).limit(1);
    const lead = leadRows[0];
    if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });

    const encodedName = encodeURIComponent(lead.name ?? "");
    const portalUrl = `${input.origin}/client/project?name=${encodedName}`;
    const firstName = lead.name?.split(" ")[0] ?? "there";

    let emailSent = false;
    let smsSent = false;
    let emailError: string | undefined;
    let smsError: string | undefined;

    // Send email
    const emailAddresses = [lead.email, (lead as any).email2, (lead as any).email3].filter(Boolean) as string[];
    if (emailAddresses.length > 0) {
      try {
        const { createTransporter } = await import("./email");
        const transporter = createTransporter();
        await transporter.sendMail({
          from: `"Kitchens Plus Upstate" <chad@kitchensplusupstate.com>`,
          replyTo: "chad@kitchensplusupstate.com",
          to: emailAddresses.join(", "),
          subject: "Your Kitchens Plus Client Dashboard",
          html: `
            <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #fff; color: #2E2F2A;">
              <div style="background: #2E2F2A; padding: 28px 32px; text-align: center;">
                <h1 style="color: #BF9A3B; font-size: 22px; margin: 0; letter-spacing: 2px;">KITCHENS PLUS UPSTATE</h1>
                <p style="color: #ccc; font-size: 12px; margin: 4px 0 0; letter-spacing: 1px;">RENOVATIONS &amp; DESIGN</p>
              </div>
              <div style="padding: 32px;">
                <p style="font-size: 16px; margin: 0 0 16px;">Hi ${firstName},</p>
                <p style="font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
                  Your personal client dashboard is ready. Here's what you can do:
                </p>
                <table style="width: 100%; margin: 0 0 24px; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 10px 12px; font-size: 14px; line-height: 1.5; color: #444; border-bottom: 1px solid #f0ece4;">
                      <strong style="color: #2E2F2A;">📋 Review Proposals</strong><br/>View and approve project proposals, see line-item details, and sign contracts.
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 12px; font-size: 14px; line-height: 1.5; color: #444; border-bottom: 1px solid #f0ece4;">
                      <strong style="color: #2E2F2A;">📸 Share Inspiration</strong><br/>Upload photos of kitchens, finishes, and styles you love — we'll use them to guide your design.
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 12px; font-size: 14px; line-height: 1.5; color: #444; border-bottom: 1px solid #f0ece4;">
                      <strong style="color: #2E2F2A;">💬 Message Our Team</strong><br/>Send questions, share files, and stay in the loop — all from one place.
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 12px; font-size: 14px; line-height: 1.5; color: #444;">
                      <strong style="color: #2E2F2A;">📊 Track Progress</strong><br/>Follow your project milestones, view invoices, and see what's coming next.
                    </td>
                  </tr>
                </table>
                <div style="text-align: center; margin: 28px 0;">
                  <a href="${portalUrl}" style="background: #BF9A3B; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 4px; font-size: 15px; font-weight: 600; letter-spacing: 0.5px; display: inline-block;">View Your Dashboard</a>
                </div>
                <div style="background: linear-gradient(135deg, #2E2F2A 0%, #3a3b35 100%); border-radius: 8px; padding: 24px; margin: 0 0 24px; text-align: center;">
                  <p style="color: #BF9A3B; font-size: 16px; font-weight: 600; margin: 0 0 8px; letter-spacing: 0.5px;">✨ Start Your Inspiration Board</p>
                  <p style="color: #ccc; font-size: 13px; line-height: 1.5; margin: 0 0 16px;">Snap photos of kitchens you love, save Pinterest links, or upload images from magazines. We'll use your board to bring your vision to life.</p>
                  <a href="${input.origin}/client/inspiration" style="background: transparent; color: #BF9A3B; text-decoration: none; padding: 10px 24px; border-radius: 4px; font-size: 14px; font-weight: 600; letter-spacing: 0.5px; display: inline-block; border: 1.5px solid #BF9A3B;">Open Inspiration Board →</a>
                </div>
                <p style="font-size: 13px; color: #666; margin: 0 0 8px;">Or copy this link into your browser:</p>
                <p style="font-size: 12px; color: #BF9A3B; word-break: break-all; margin: 0 0 24px;">${portalUrl}</p>
                <div style="background: #f9f6f0; border-left: 3px solid #BF9A3B; padding: 14px 16px; margin: 0 0 24px; border-radius: 0 4px 4px 0;">
                  <p style="font-size: 13px; font-weight: 600; color: #2E2F2A; margin: 0 0 6px;">How to log in:</p>
                  <p style="font-size: 13px; color: #555; margin: 0; line-height: 1.6;">Simply enter the mobile phone number we have on file for you. No password needed — your phone number is your key to the portal.</p>
                </div>
                <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
                <p style="font-size: 13px; color: #888; margin: 0;">Questions? Call or text Chad at <strong>(864) 567-8777</strong> or reply to this email.</p>
              </div>
            </div>
          `,
          text: `Hi ${firstName},\n\nYour Kitchens Plus client dashboard is ready:\n${portalUrl}\n\nHow to log in:\nSimply enter the mobile phone number we have on file for you. No password needed — your phone number is your key to the portal.\n\nQuestions? Call or text Chad at (864) 567-8777.`,
        });
        emailSent = true;
      } catch (e: any) { emailError = e?.message ?? "Email failed"; }
    }

    // Send SMS to all phone numbers
    const phones = [lead.phone, (lead as any).phone2, (lead as any).phone3].filter(Boolean) as string[];
    if (phones.length > 0) {
      try {
        const smsBody = `Hi ${firstName}, this is Kitchens Plus Upstate. Your personal client portal is now ready. You can review your proposal, track your project progress, and message our team directly at: ${portalUrl} — We look forward to working with you, ${firstName}!`;
        // Send to primary phone; additional phones get the same message
        for (const phone of phones) {
          const result = await sendSms({ to: phone, message: smsBody, isFirstContact: true });
          if (result.success) smsSent = true;
          else if (!smsSent) smsError = result.error;
        }
      } catch (e: any) { smsError = e?.message ?? "SMS failed"; }
    }

    return { emailSent, smsSent, emailError, smsError };
  }),

  // ─── AI Lead Intake ──────────────────────────────────────────────────────────
  aiExtract: adminProcedure
    .input(z.object({
      // One of these must be provided
      text: z.string().optional(),          // pasted text
      fileDataUrl: z.string().optional(),   // base64 data URL of PDF or image
      fileMime: z.string().optional(),      // mime type of the file
      // Optional: answer to a previous follow-up question
      followUpAnswer: z.object({
        question: z.string(),
        answer: z.string(),
      }).optional(),
      // Previously extracted fields so the LLM can merge
      previousFields: z.record(z.string(), z.any()).optional(),
    }))
    .mutation(async ({ input }) => {
      const systemPrompt = `You are an AI assistant for Kitchens Plus Upstate, a kitchen and bathroom renovation company.
Your job is to extract lead contact information from the provided content and return it as structured JSON.

Extract these fields (leave null if not found or uncertain):
- name: full name of the homeowner(s)
- phone: primary phone number (digits only, no formatting)
- phone2: second phone number if present
- phone3: third phone number if present
- email: primary email address
- email2: second email address if present
- email3: third email address if present
- address: property address (full address as a string)
- projectType: type of project (e.g. "Kitchen Remodel", "Bathroom Remodel", "Full Renovation", "Cabinet Refacing")
- source: how they found us (one of: website, referral, google, facebook, instagram, yard_sign, other)
- notes: any other relevant notes about the project or client
- followUpQuestions: array of strings — questions to ask the user to fill in missing important fields

IMPORTANT:
- For followUpQuestions, only ask about fields that are truly missing AND important (name, phone, email, address, projectType).
- Do NOT ask about source or notes — those are optional.
- If a field is clearly present in the content, do NOT ask about it.
- Return at most 3 follow-up questions.
- Phone numbers: extract digits only (e.g. "8645550000" not "(864) 555-0000").
- If the content mentions multiple people, use the homeowner as the primary contact.`;

      const userParts: any[] = [];

      if (input.followUpAnswer) {
        userParts.push({ type: "text", text: `Previous question: "${input.followUpAnswer.question}"\nAnswer: "${input.followUpAnswer.answer}"` });
      }
      if (input.previousFields && Object.keys(input.previousFields).length > 0) {
        userParts.push({ type: "text", text: `Previously extracted fields: ${JSON.stringify(input.previousFields)}` });
      }
      if (input.text) {
        userParts.push({ type: "text", text: `Content to extract from:\n${input.text}` });
      }
      if (input.fileDataUrl && input.fileMime) {
        if (input.fileMime === "application/pdf") {
          userParts.push({ type: "file_url", file_url: { url: input.fileDataUrl, mime_type: "application/pdf" } });
        } else {
          userParts.push({ type: "image_url", image_url: { url: input.fileDataUrl, detail: "high" } });
        }
      }

      if (userParts.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No content provided for extraction" });
      }

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userParts },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "lead_extraction",
            strict: true,
            schema: {
              type: "object",
              properties: {
                name: { type: ["string", "null"] },
                phone: { type: ["string", "null"] },
                phone2: { type: ["string", "null"] },
                phone3: { type: ["string", "null"] },
                email: { type: ["string", "null"] },
                email2: { type: ["string", "null"] },
                email3: { type: ["string", "null"] },
                address: { type: ["string", "null"] },
                projectType: { type: ["string", "null"] },
                source: { type: ["string", "null"] },
                notes: { type: ["string", "null"] },
                followUpQuestions: { type: "array", items: { type: "string" } },
              },
              required: ["name", "phone", "phone2", "phone3", "email", "email2", "email3", "address", "projectType", "source", "notes", "followUpQuestions"],
              additionalProperties: false,
            },
          },
        },
      });

      const raw = response?.choices?.[0]?.message?.content ?? "{}";
      try {
        return JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw)) as {
          name: string | null;
          phone: string | null;
          phone2: string | null;
          phone3: string | null;
          email: string | null;
          email2: string | null;
          email3: string | null;
          address: string | null;
          projectType: string | null;
          source: string | null;
          notes: string | null;
          followUpQuestions: string[];
        };
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI returned invalid JSON" });
      }
    }),

  transcribeAndExtract: adminProcedure
    .input(z.object({
      audioDataUrl: z.string(), // base64 data URL of audio
      audioMime: z.string().default("audio/webm"),
    }))
    .mutation(async ({ input }) => {
      // Upload audio to S3 first so transcribeAudio can access it via URL
      const ext = input.audioMime.includes("mp4") ? "mp4" : input.audioMime.includes("mp3") ? "mp3" : input.audioMime.includes("wav") ? "wav" : "webm";
      const base64 = input.audioDataUrl.replace(/^data:[^;]+;base64,/, "");
      const audioBuffer = Buffer.from(base64, "base64");
      const fileKey = `ai-intake-audio/${nanoid()}.${ext}`;
      const { url: audioUrl } = await storagePut(fileKey, audioBuffer, input.audioMime);

      // Transcribe
      const transcription = await transcribeAudio({ audioUrl, language: "en", prompt: "Kitchen renovation lead contact information" });
      const transcript = transcription.text ?? "";

      // Now extract fields from the transcript
      // Re-use the same LLM extraction logic inline
      const systemPrompt = `You are an AI assistant for Kitchens Plus Upstate, a kitchen and bathroom renovation company.
The following is a voice dictation from the owner describing a new lead. Extract the contact information and return structured JSON.

Extract these fields (leave null if not found):
- name, phone, phone2, phone3, email, email2, email3, address, projectType, source, notes
- followUpQuestions: array of questions for any missing important fields (name, phone, email, address, projectType only; max 3)

Phone numbers: digits only. Return at most 3 follow-up questions.`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Voice dictation transcript:\n${transcript}` },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "lead_extraction",
            strict: true,
            schema: {
              type: "object",
              properties: {
                name: { type: ["string", "null"] },
                phone: { type: ["string", "null"] },
                phone2: { type: ["string", "null"] },
                phone3: { type: ["string", "null"] },
                email: { type: ["string", "null"] },
                email2: { type: ["string", "null"] },
                email3: { type: ["string", "null"] },
                address: { type: ["string", "null"] },
                projectType: { type: ["string", "null"] },
                source: { type: ["string", "null"] },
                notes: { type: ["string", "null"] },
                followUpQuestions: { type: "array", items: { type: "string" } },
              },
              required: ["name", "phone", "phone2", "phone3", "email", "email2", "email3", "address", "projectType", "source", "notes", "followUpQuestions"],
              additionalProperties: false,
            },
          },
        },
      });

      const raw = response?.choices?.[0]?.message?.content ?? "{}";
      try {
        const extracted = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
        return { transcript, ...extracted };
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI returned invalid JSON" });
      }
    }),
});

// ─── Meetings router ────────────────────────────────────────────────────────────────
const meetingsRouter = router({
  getByLead: adminProcedure.input(z.object({ leadId: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(meetings).where(eq(meetings.leadId, input.leadId)).orderBy(desc(meetings.createdAt));
  }),

  create: adminProcedure.input(z.object({
    leadId: z.number(),
    scheduledAt: z.string().optional(),
    durationMinutes: z.number().min(15).max(480).optional(),
    assignee: z.string().optional(),
    internalNotes: z.string().optional(),
    aiNotes: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Get lead info for calendar event title
    const leadRows = await db.select().from(leads).where(eq(leads.id, input.leadId)).limit(1);
    const lead = leadRows[0];
    await db.insert(meetings).values({
      leadId: input.leadId,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
      assignee: input.assignee ?? "Chad Price",
      internalNotes: input.internalNotes,
      aiNotes: input.aiNotes,
      status: "scheduled",
    });
    // Use LAST_INSERT_ID() — more reliable than parsing the drizzle result object
    const [{ meetingId }] = await db.select({ meetingId: sql<number>`LAST_INSERT_ID()` }).from(meetings).limit(1);
    const safeId = Number(meetingId);
    // Update lead status to consultation_scheduled
    await db.update(leads).set({ status: "consultation_scheduled", firstContactSentAt: new Date() }).where(eq(leads.id, input.leadId));
    // Create Google Calendar event (non-blocking — failure doesn’t break meeting creation)
    if (input.scheduledAt && lead) {
      try {
        const calResult = await createCalendarEvent({
          summary: `Consultation — ${lead.name}`,
          description: [
            `Lead: ${lead.name}`,
            lead.phone ? `Phone: ${lead.phone}` : "",
            lead.email ? `Email: ${lead.email}` : "",
            lead.address ? `Address: ${lead.address}` : "",
            lead.projectType ? `Project type: ${lead.projectType}` : "",
            input.internalNotes ? `Notes: ${input.internalNotes}` : "",
            `Assignee: ${input.assignee ?? "Chad Price"}`,
          ].filter(Boolean).join("\n"),
          startTime: new Date(input.scheduledAt),
          durationMinutes: input.durationMinutes ?? 60,
          location: lead.address ?? undefined,
          attendeeEmail: lead.email ?? undefined,
        });
        if (calResult.ok && calResult.eventId) {
          await db.update(meetings).set({ googleCalendarEventId: calResult.eventId }).where(eq(meetings.id, safeId));
        } else {
          console.warn("[GoogleCalendar] Event creation failed:", calResult.error);
        }
      } catch (calErr: any) {
        console.warn("[GoogleCalendar] Unexpected error:", calErr?.message);
      }
    }
    return { id: safeId };
  }),

  sendFirstContact: adminProcedure.input(z.object({
    leadId: z.number(),
    meetingId: z.number(),
    sendEmail: z.boolean().default(true),
    sendSms: z.boolean().default(true),
    origin: z.string().optional(), // frontend passes window.location.origin
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Get lead and meeting
    const leadRows = await db.select().from(leads).where(eq(leads.id, input.leadId)).limit(1);
    const lead = leadRows[0];
    if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
    const meetingRows = await db.select().from(meetings).where(eq(meetings.id, input.meetingId)).limit(1);
    const meeting = meetingRows[0];
    if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });

    const assignee = meeting.assignee ?? "Chad Price";
    const scheduledStr = meeting.scheduledAt
      ? new Date(meeting.scheduledAt).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
      : "a time to be confirmed";

    // Build AI-personalized message using aiNotes if provided
    let personalizedNote = "";
    if (meeting.aiNotes) {
      try {
        const { invokeLLM } = await import("./_core/llm");
        const aiResp = await invokeLLM({
          messages: [
            { role: "system", content: "You are a friendly assistant for Kitchens Plus Upstate, a luxury kitchen, bath & whole-house renovation company in Upstate SC. Write a warm, concise 1-2 sentence personal note to add to a first-contact message. Use the context provided. Do NOT include greetings or sign-offs — just the personal note." },
            { role: "user", content: `Context about this client: ${meeting.aiNotes}` },
          ],
        });
        personalizedNote = (aiResp as any)?.choices?.[0]?.message?.content ?? "";
      } catch { personalizedNote = ""; }
    }

    let emailSent = false;
    let smsSent = false;
    let emailError: string | undefined;
    let smsError: string | undefined;

    // Send email
    if (input.sendEmail && lead.email) {
      try {
        const { sendFirstContactEmail } = await import("./email");
        const origin = input.origin ?? "https://kitchensplusupstate.com";
        const encodedName = encodeURIComponent(lead.name ?? "");
        const portalUrl = `${origin}/client/project?name=${encodedName}`;
        const rescheduleUrl = `${origin}/client/reschedule?meetingId=${input.meetingId}&date=${encodeURIComponent(scheduledStr)}`;
        const confirmUrl = `${origin}/client/confirm-meeting?meetingId=${input.meetingId}&leadId=${input.leadId}`;
        await sendFirstContactEmail({
          to: [lead.email, lead.email2, lead.email3].filter(Boolean) as string[],
          clientName: lead.name,
          assignee,
          scheduledAt: scheduledStr,
          address: lead.address ?? "",
          personalizedNote,
          projectType: lead.projectType ?? "renovation",
          portalUrl,
          rescheduleUrl,
          confirmUrl,
        });
        emailSent = true;
      } catch (e: any) { emailError = e?.message ?? "Email failed"; }
    }

    // Send SMS
    if (input.sendSms && lead.phone) {
      try {
        const smsBody = `Hi ${lead.name.split(" ")[0]}, this is Kitchens Plus Upstate. Your consultation appointment is confirmed for ${scheduledStr} at ${lead.address ?? "your property"}. ${personalizedNote ? personalizedNote + " " : ""}We look forward to meeting you, ${lead.name.split(" ")[0]}!`;
        const smsResult = await sendSms({ to: lead.phone, message: smsBody, isFirstContact: true });
        smsSent = smsResult.success;
        if (!smsResult.success) smsError = smsResult.error;
      } catch (e: any) { smsError = e?.message ?? "SMS failed"; }
    }

    // Mark meeting as sent
    await db.update(meetings).set({ emailSent: emailSent ? 1 : 0, smsSent: smsSent ? 1 : 0 }).where(eq(meetings.id, input.meetingId));

    return { emailSent, smsSent, emailError, smsError };
  }),

  updateStatus: adminProcedure.input(z.object({
    id: z.number(),
    status: z.enum(["scheduled", "completed", "cancelled"]),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(meetings).set({ status: input.status as any }).where(eq(meetings.id, input.id));
    return { success: true };
  }),

  listAll: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({
        id: meetings.id,
        leadId: meetings.leadId,
        scheduledAt: meetings.scheduledAt,
        status: meetings.status,
        assignee: meetings.assignee,
        leadName: leads.name,
        leadPhone: leads.phone,
      })
      .from(meetings)
      .leftJoin(leads, eq(meetings.leadId, leads.id))
      .where(sql`${meetings.scheduledAt} IS NOT NULL`)
      .orderBy(asc(meetings.scheduledAt));
    return rows;
  }),

  // ── OWNER-INITIATED RESCHEDULE ──────────────────────────────────────────────
  // Chad proposes a new time → client gets SMS + email with confirm/reject link
  proposeReschedule: adminProcedure.input(z.object({
    meetingId: z.number(),
    leadId: z.number(),
    proposedTime: z.string(), // ISO string
    note: z.string().optional(),
    origin: z.string(), // window.location.origin for building the confirm URL
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Load lead for contact info
    const leadRows = await db.select().from(leads).where(eq(leads.id, input.leadId)).limit(1);
    const lead = leadRows[0];
    if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
    // Generate a secure confirm token
    const { nanoid: nid } = await import("nanoid");
    const confirmToken = nid(48);
    // Insert the proposal
    await db.insert(ownerRescheduleProposals).values({
      meetingId: input.meetingId,
      leadId: input.leadId,
      proposedTime: new Date(input.proposedTime),
      note: input.note ?? null,
      confirmToken,
      status: "pending",
    } as any);
    const [{ newId }] = await db.select({ newId: sql<number>`LAST_INSERT_ID()` }).from(ownerRescheduleProposals).limit(1);
    // Build confirm/reject URLs
    const confirmUrl = `${input.origin}/reschedule-confirm?token=${confirmToken}&action=confirm`;
    const rejectUrl = `${input.origin}/reschedule-confirm?token=${confirmToken}&action=reject`;
    const proposedDate = new Date(input.proposedTime);
    const dateStr = proposedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
    const timeStr = proposedDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York" });
    const firstName = lead.name.split(" ")[0];
    let emailSent = false;
    let smsSent = false;
    let emailError: string | undefined;
    let smsError: string | undefined;
    // Send email
    const allEmails = [lead.email, (lead as any).email2, (lead as any).email3].filter(Boolean) as string[];
    if (allEmails.length > 0) {
      try {
        const { createTransporter, GMAIL_FROM_USER } = await import("./email");
        const transporter = createTransporter();
        const noteHtml = input.note ? `<p style="color:#555;font-style:italic;">${input.note}</p>` : "";
        await transporter.sendMail({
          from: `"Kitchens Plus Upstate" <${GMAIL_FROM_USER}>`,
          to: allEmails.join(", "),
          subject: `Consultation Reschedule Request — ${dateStr}`,
          html: `
            <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#fff;padding:40px;">
              <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663481717136/NJbAuvnBiksaabdpS5d8M3/kitchensplus_logo_0e432498.webp" alt="Kitchens Plus Upstate" style="height:48px;margin-bottom:24px;" />
              <h2 style="color:#1a1a1a;font-size:22px;margin-bottom:8px;">Consultation Reschedule Request</h2>
              <p style="color:#444;">Hi ${firstName},</p>
              <p style="color:#444;">We need to reschedule your upcoming consultation. We'd like to propose a new time:</p>
              <div style="background:#f9f6f0;border-left:4px solid #BF9A3B;padding:16px 20px;margin:24px 0;border-radius:4px;">
                <p style="margin:0;font-size:18px;font-weight:bold;color:#1a1a1a;">${dateStr}</p>
                <p style="margin:4px 0 0;font-size:16px;color:#555;">${timeStr}</p>
              </div>
              ${noteHtml}
              <p style="color:#444;">Please confirm or request another time:</p>
              <div style="margin:28px 0;display:flex;gap:12px;">
                <a href="${confirmUrl}" style="background:#BF9A3B;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;">✓ Confirm This Time</a>
                &nbsp;&nbsp;
                <a href="${rejectUrl}" style="background:#f5f5f5;color:#555;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;">Request Another Time</a>
              </div>
              <p style="color:#888;font-size:13px;">If you have questions, reply to this email or call us directly.</p>
              <hr style="border:none;border-top:1px solid #eee;margin:32px 0;" />
              <p style="color:#aaa;font-size:12px;">Kitchens Plus Upstate · Premium Kitchen Renovations</p>
            </div>
          `,
        });
        emailSent = true;
      } catch (e: any) { emailError = e?.message ?? "Email failed"; }
    }
    // Send SMS
    const allPhones = [lead.phone, (lead as any).phone2, (lead as any).phone3].filter(Boolean) as string[];
    if (allPhones.length > 0) {
      try {
        const smsBody = `Hi ${firstName}, Kitchens Plus Upstate needs to reschedule your consultation to ${dateStr} at ${timeStr}. Confirm: ${confirmUrl} | Request another time: ${rejectUrl}`;
        const smsResult = await sendSms({ to: allPhones[0], message: smsBody });
        smsSent = smsResult.success;
        if (!smsResult.success) smsError = smsResult.error;
      } catch (e: any) { smsError = e?.message ?? "SMS failed"; }
    }
    return { id: newId, confirmToken, emailSent, smsSent, emailError, smsError };
  }),

  // List pending owner reschedule proposals (for showing status badges on lead cards)
  listPendingRescheduleProposals: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(ownerRescheduleProposals)
      .where(eq(ownerRescheduleProposals.status, "pending"))
      .orderBy(desc(ownerRescheduleProposals.createdAt));
  }),

  // Public: verify token and return proposal details for the client confirmation page
  getProposalByToken: publicProcedure.input(z.object({ token: z.string() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select().from(ownerRescheduleProposals)
      .where(eq(ownerRescheduleProposals.confirmToken, input.token)).limit(1);
    if (!rows[0]) return null;
    const proposal = rows[0];
    // Fetch lead name
    const leadRows = await db.select({ name: leads.name }).from(leads).where(eq(leads.id, proposal.leadId)).limit(1);
    return { ...proposal, leadName: leadRows[0]?.name ?? "" };
  }),

  // Public: client confirms the proposed time
  confirmProposalByToken: publicProcedure.input(z.object({ token: z.string() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const rows = await db.select().from(ownerRescheduleProposals)
      .where(eq(ownerRescheduleProposals.confirmToken, input.token)).limit(1);
    const proposal = rows[0];
    if (!proposal) throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
    if (proposal.status !== "pending") return { alreadyActed: true, status: proposal.status };
    // Update proposal status
    await db.update(ownerRescheduleProposals)
      .set({ status: "confirmed", confirmedAt: new Date() } as any)
      .where(eq(ownerRescheduleProposals.id, proposal.id));
    // Update the meeting's scheduledAt
    await db.update(meetings)
      .set({ scheduledAt: proposal.proposedTime, status: "confirmed", confirmedAt: new Date() } as any)
      .where(eq(meetings.id, proposal.meetingId));
    // Update Google Calendar event if one exists
    const meetingRows = await db.select().from(meetings).where(eq(meetings.id, proposal.meetingId)).limit(1);
    const meeting = meetingRows[0];
    if (meeting?.googleCalendarEventId) {
      try {
        await updateCalendarEvent(meeting.googleCalendarEventId, {
          startTime: proposal.proposedTime.toISOString(),
          confirmed: true,
        });
      } catch (e) { /* non-fatal */ }
    }
    // Notify owner
    const leadRows = await db.select({ name: leads.name }).from(leads).where(eq(leads.id, proposal.leadId)).limit(1);
    const leadName = leadRows[0]?.name ?? "Client";
    const dateStr = proposal.proposedTime.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
    const timeStr = proposal.proposedTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York" });
    try {
      const { notifyOwner } = await import("./_core/notification");
      await notifyOwner({ title: `✓ ${leadName} confirmed reschedule`, content: `${leadName} confirmed the rescheduled consultation for ${dateStr} at ${timeStr}.` });
    } catch (e) { /* non-fatal */ }
    return { alreadyActed: false, status: "confirmed" };
  }),

  // Public: client rejects the proposed time (requests another)
  rejectProposalByToken: publicProcedure.input(z.object({ token: z.string(), message: z.string().optional() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const rows = await db.select().from(ownerRescheduleProposals)
      .where(eq(ownerRescheduleProposals.confirmToken, input.token)).limit(1);
    const proposal = rows[0];
    if (!proposal) throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
    if (proposal.status !== "pending") return { alreadyActed: true, status: proposal.status };
    await db.update(ownerRescheduleProposals)
      .set({ status: "rejected", rejectedAt: new Date() } as any)
      .where(eq(ownerRescheduleProposals.id, proposal.id));
    // Notify owner
    const leadRows = await db.select({ name: leads.name }).from(leads).where(eq(leads.id, proposal.leadId)).limit(1);
    const leadName = leadRows[0]?.name ?? "Client";
    try {
      const { notifyOwner } = await import("./_core/notification");
      await notifyOwner({ title: `⚠ ${leadName} requested another time`, content: `${leadName} could not make the proposed reschedule time${input.message ? `: "${input.message}"` : ". Please propose a new time."} ` });
    } catch (e) { /* non-fatal */ }
    return { alreadyActed: false, status: "rejected" };
  }),

});

// ─── Projects router ──────────────────────────────────────────────────────────
const projectsRouter = router({
  list: adminProcedure.input(z.object({
    status: z.string().optional(),
    clientId: z.number().optional(),
  }).optional()).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    // Exclude archived projects from the default list
    return db.select().from(projects)
      .where(sql`${projects.archivedAt} IS NULL`)
      .orderBy(desc(projects.createdAt));
  }),

  // Archive a project (soft delete — moves to archive in Settings)
  archive: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(projects).set({ archivedAt: new Date() } as any).where(eq(projects.id, input.id));
    return { success: true };
  }),

  // Restore an archived project back to the active list
  restore: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(projects).set({ archivedAt: null } as any).where(eq(projects.id, input.id));
    return { success: true };
  }),

  // List all archived projects (for Settings > Archived Projects)
  listArchived: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(projects)
      .where(sql`${projects.archivedAt} IS NOT NULL`)
      .orderBy(desc(projects.archivedAt));
  }),

  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const result = await db.select().from(projects).where(eq(projects.id, input.id)).limit(1);
    return result[0] ?? null;
  }),

  create: adminProcedure.input(z.object({
    name: z.string(),
    clientId: z.number().optional(),
    leadId: z.number().optional(),
    projectType: z.string().optional(),
    address: z.string().optional(),
    description: z.string().optional(),
    scopeOfWork: z.string().optional(),
    budgetEstimated: z.string().optional(),
    depositPercent: z.string().optional(),
    startDate: z.string().optional(),
    estimatedEndDate: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(projects).values({
      name: input.name,
      clientId: input.clientId,
      leadId: input.leadId,
      projectType: input.projectType,
      address: input.address,
      description: input.description,
      scopeOfWork: input.scopeOfWork,
      budgetEstimated: input.budgetEstimated as any,
      depositPercent: input.depositPercent as any ?? "50.00",
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      estimatedEndDate: input.estimatedEndDate ? new Date(input.estimatedEndDate) : undefined,
      status: "planning",
    });
    const [{ newId }] = await db.select({ newId: sql<number>`LAST_INSERT_ID()` }).from(projects).limit(1);
    return { id: newId };
  }),

  update: adminProcedure.input(z.object({
    id: z.number(),
    name: z.string().optional(),
    status: z.enum(["planning","active","on_hold","completed","cancelled"]).optional(),
    projectType: z.string().optional(),
    address: z.string().optional(),
    description: z.string().optional(),
    scopeOfWork: z.string().optional(),
    budgetEstimated: z.string().optional(),
    budgetActual: z.string().optional(),
    depositPercent: z.string().optional(),
    startDate: z.string().optional(),
    estimatedEndDate: z.string().optional(),
    actualEndDate: z.string().optional(),
    aiUpdateFrequency: z.enum(["daily","every_few_days","weekly","manual"]).optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, startDate, estimatedEndDate, actualEndDate, ...rest } = input;
    const updateData: any = { ...rest };
    if (startDate) updateData.startDate = new Date(startDate);
    if (estimatedEndDate) updateData.estimatedEndDate = new Date(estimatedEndDate);
    if (actualEndDate) updateData.actualEndDate = new Date(actualEndDate);
    await db.update(projects).set(updateData).where(eq(projects.id, id));
    return { success: true };
  }),

  getMilestones: protectedProcedure.input(z.object({ projectId: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(milestones).where(eq(milestones.projectId, input.projectId)).orderBy(milestones.sortOrder);
  }),

  createMilestone: adminProcedure.input(z.object({
    projectId: z.number(),
    title: z.string(),
    description: z.string().optional(),
    dueDate: z.string().optional(),
    billingAmount: z.string().optional(),
    sortOrder: z.number().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(milestones).values({
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      billingAmount: input.billingAmount as any,
      sortOrder: input.sortOrder ?? 0,
    });
    const [{ newId }] = await db.select({ newId: sql<number>`LAST_INSERT_ID()` }).from(milestones).limit(1);
    return { id: newId };
  }),

  updateMilestone: adminProcedure.input(z.object({
    id: z.number(),
    status: z.enum(["pending","in_progress","completed","delayed"]).optional(),
    completedAt: z.string().optional(),
    bypassDepositGate: z.boolean().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, completedAt, bypassDepositGate, ...rest } = input;
    // ── Deposit gating: warn when starting work without deposit ────────
    if (rest.status === "in_progress" && !bypassDepositGate) {
      const [ms] = await db.select({ projectId: milestones.projectId }).from(milestones).where(eq(milestones.id, id)).limit(1);
      if (ms?.projectId) {
        const [proj] = await db.select({ squareDepositStatus: projects.squareDepositStatus, status: projects.status }).from(projects).where(eq(projects.id, ms.projectId)).limit(1);
        if (proj && proj.status === "active" && proj.squareDepositStatus !== "paid") {
          // Check if any deposit invoice is paid
          const [depositPaid] = await db.select({ id: invoices.id }).from(invoices)
            .where(and(eq(invoices.projectId, ms.projectId), eq(invoices.invoiceType, "deposit"), eq(invoices.status, "paid")))
            .limit(1);
          if (!depositPaid) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "No deposit has been collected for this project. Collect the deposit before starting milestone work, or use the override option.",
            });
          }
        }
      }
    }
    const updateData: any = { ...rest };
    if (completedAt) updateData.completedAt = new Date(completedAt);
    await db.update(milestones).set(updateData).where(eq(milestones.id, id));
    // Fire-and-forget: milestone communication draft + project summary enrichment
    if (rest.status === "completed" || rest.status === "delayed") {
      triggerMilestoneCommunication(id, rest.status).catch(console.error);
    }
    if (rest.status) {
      const db2 = await getDb();
      if (db2) {
        const [ms] = await db2.select({ projectId: milestones.projectId }).from(milestones).where(eq(milestones.id, id)).limit(1);
        if (ms) runProjectSummaryAgent(ms.projectId).catch(console.error);
        // ── Event-triggered Next Action recompute ──────────────────────────
        if (ms) void triggerNextActionRecompute(ms.projectId);
      }
    }
    return { success: true };
  }),

  // ── Project Tasks ──────────────────────────────────────────────────────────
  listTasks: adminProcedure.input(z.object({ projectId: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    const tasks = await db.select().from(projectTasks).where(eq(projectTasks.projectId, input.projectId)).orderBy(asc(projectTasks.sortOrder), asc(projectTasks.createdAt));
    // Attach assignees to each task
    if (tasks.length === 0) return tasks.map(t => ({ ...t, assignees: [] }));
    const taskIds = tasks.map(t => t.id);
    const allAssignees = await db.select().from(taskAssignees).where(inArray(taskAssignees.taskId, taskIds));
    return tasks.map(t => ({
      ...t,
      assignees: allAssignees.filter(a => a.taskId === t.id),
    }));
  }),

  updateTask: adminProcedure.input(z.object({
    id: z.number(),
    status: z.enum(["pending","in_progress","completed","blocked"]).optional(),
    notes: z.string().optional(),
    assignedTo: z.number().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    dueDate: z.string().optional(),
    attachmentUrl: z.string().nullable().optional(),
    attachmentName: z.string().nullable().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, dueDate, ...rest } = input;
    const updateData: any = { ...rest };
    if (dueDate) updateData.dueDate = new Date(dueDate);
    if (rest.status === "completed") updateData.completedAt = new Date();
    else if (rest.status && rest.status !== "completed") updateData.completedAt = null;
    await db.update(projectTasks).set(updateData).where(eq(projectTasks.id, id));
    // ── Event-triggered Next Action recompute (task status changes only) ─────
    if (rest.status) {
      const [task] = await db.select({ projectId: projectTasks.projectId }).from(projectTasks).where(eq(projectTasks.id, id)).limit(1);
      if (task?.projectId) void triggerNextActionRecompute(task.projectId);
    }
    return { success: true };
  }),

  addTask: adminProcedure.input(z.object({
    projectId: z.number(),
    title: z.string(),
    description: z.string().optional(),
    category: z.string().optional(),
    dueDate: z.string().optional(),
    attachmentUrl: z.string().optional(),
    attachmentName: z.string().optional(),
    assignees: z.array(z.object({
      assigneeType: z.enum(["lead","vendor","crew","custom"]),
      assigneeId: z.number().optional(),
      name: z.string(),
      email: z.string().optional(),
      phone: z.string().optional(),
    })).optional(),
    origin: z.string().optional(), // window.location.origin — used to build the one-click response URL
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [inserted] = await db.insert(projectTasks).values({
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      category: input.category,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      attachmentUrl: input.attachmentUrl,
      attachmentName: input.attachmentName,
      status: "pending",
    } as any);
    const taskId = (inserted as any).insertId as number;
    const isQuestion = (input.category ?? "").toLowerCase().includes("question");
    // Generate a response token for question tasks so recipients can reply with one click
    let responseToken: string | undefined;
    if (isQuestion) {
      const crypto = await import("crypto");
      responseToken = crypto.randomBytes(24).toString("hex");
      await db.update(projectTasks).set({ responseToken } as any).where(eq(projectTasks.id, taskId));
    }
    // Insert assignees and send notifications
    const notifyResults: string[] = [];
    if (input.assignees && input.assignees.length > 0) {
      for (const a of input.assignees) {
        await db.insert(taskAssignees).values({
          taskId,
          assigneeType: a.assigneeType,
          assigneeId: a.assigneeId,
          name: a.name,
          email: a.email,
          phone: a.phone,
          notifiedAt: new Date(),
        });
        // Auto-save custom assignees to the project roster
        if (a.assigneeType === "custom" && (a.email || a.phone)) {
          try {
            const { projectCustomAssignees } = await import("../drizzle/schema");
            const [existing] = await db.select().from(projectCustomAssignees)
              .where(and(eq(projectCustomAssignees.projectId, input.projectId), eq(projectCustomAssignees.name, a.name)))
              .limit(1);
            if (existing) {
              await db.update(projectCustomAssignees).set({ email: a.email, phone: a.phone }).where(eq(projectCustomAssignees.id, existing.id));
            } else {
              await db.insert(projectCustomAssignees).values({ projectId: input.projectId, name: a.name, email: a.email, phone: a.phone });
            }
          } catch (_) {}
        }
        // Build message body — question tasks ask for a reply
        // Build the one-click response URL (uses window.location.origin passed from frontend, or falls back to the app domain)
        const appOrigin = (input as any).origin ?? "https://kitchenscrm-njbauvnb.manus.space";
        const responseUrl = responseToken ? `${appOrigin}/task-response/${responseToken}` : null;
        const smsBody = isQuestion
          ? `Hi ${a.name}, this is Kitchens Plus Upstate. We have a question about your project: "${input.title}"${input.description ? ` — ${input.description}` : ""}. Tap here to answer in one click: ${responseUrl ?? ""} \n\nOr simply reply to this message. Call Chad at 864-567-8777. Reply STOP to opt out.`
          : `Hi ${a.name}, this is Kitchens Plus Upstate. You have been assigned a new task on your project: "${input.title}".${input.description ? ` Details: ${input.description}` : ""} Thank you for your continued partnership. Call Chad at 864-567-8777. Reply STOP to opt out.`;
        const emailSubject = isQuestion ? `Question for You: ${input.title}` : `Task Assigned: ${input.title}`;
        const emailHtml = isQuestion
          ? `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e8e0d0;border-radius:8px;overflow:hidden;">
              <div style="background:#2E2F2A;padding:20px 28px;text-align:center;">
                <h1 style="color:#BF9A3B;font-size:20px;margin:0;letter-spacing:2px;font-family:Georgia,serif;">KITCHENS PLUS UPSTATE</h1>
                <p style="color:#ccc;font-size:11px;margin:4px 0 0;letter-spacing:1px;">RENOVATIONS &amp; DESIGN</p>
              </div>
              <div style="padding:28px;">
                <p style="font-size:18px;font-weight:bold;color:#2E2F2A;margin:0 0 12px;">We have a question for you</p>
                <p style="font-size:15px;color:#444;margin:0 0 20px;">Hi ${a.name},</p>
                <div style="background:#FFF8EC;border-left:4px solid #BF9A3B;padding:16px 20px;border-radius:0 6px 6px 0;margin:0 0 20px;">
                  <p style="font-size:15px;font-weight:600;color:#2E2F2A;margin:0 0 8px;">${input.title}</p>
                  ${input.description ? `<p style="font-size:14px;color:#555;margin:0;">${input.description}</p>` : ""}
                </div>
                ${responseUrl ? `
                <div style="text-align:center;margin:0 0 20px;">
                  <a href="${responseUrl}" style="display:inline-block;background:#BF9A3B;color:#fff;font-size:16px;font-weight:bold;padding:14px 32px;border-radius:8px;text-decoration:none;letter-spacing:0.5px;">&#9654; Answer Here</a>
                  <p style="font-size:12px;color:#aaa;margin:8px 0 0;">Tap the button above to respond in one click — no login required.</p>
                </div>` : ""}
                <p style="font-size:14px;color:#555;margin:0 0 12px;">Or simply reply directly to this email — your response will be recorded on your project either way.</p>
                ${input.dueDate ? `<p style="font-size:13px;color:#888;margin:0 0 20px;">Response needed by: <strong>${new Date(input.dueDate).toLocaleDateString()}</strong></p>` : ""}
                <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
                <p style="font-size:12px;color:#aaa;">Kitchens Plus Upstate &middot; Call Chad at 864-567-8777 &middot; kitchensplusupstate.com<br/>To opt out of SMS notifications, reply STOP to any text message.</p>
              </div>
            </div>`
          : `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
              <h2 style="color:#C8A84B;">Task Assigned</h2>
              <p>Hi ${a.name},</p>
              <p>You have been assigned a task on a Kitchens Plus Upstate project.</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                <tr><td style="padding:8px;font-weight:bold;">Task:</td><td style="padding:8px;">${input.title}</td></tr>
                ${input.description ? `<tr><td style="padding:8px;font-weight:bold;">Details:</td><td style="padding:8px;">${input.description}</td></tr>` : ""}
                ${input.dueDate ? `<tr><td style="padding:8px;font-weight:bold;">Due:</td><td style="padding:8px;">${new Date(input.dueDate).toLocaleDateString()}</td></tr>` : ""}
              </table>
              <p style="color:#888;font-size:12px;">Kitchens Plus Upstate &middot; +1 (833) 518-4811</p>
            </div>`;
        // Send SMS notification
        if (a.phone) {
          try {
            const { sendSms } = await import("./sms");
            await sendSms({ to: a.phone, message: smsBody, isFirstContact: !isQuestion });
            notifyResults.push(`SMS sent to ${a.name}`);
          } catch (e) { notifyResults.push(`SMS failed for ${a.name}`); }
        }
        // Send email notification
        if (a.email) {
          try {
            const { createTransporter, GMAIL_FROM_USER } = await import("./email");
            const transporter = createTransporter();
            await transporter.sendMail({
              from: `"Chad Price — Kitchens Plus Upstate" <${GMAIL_FROM_USER}>`,
              replyTo: GMAIL_FROM_USER,
              to: a.email,
              subject: emailSubject,
              html: emailHtml,
            });
            notifyResults.push(`Email sent to ${a.name}`);
          } catch (e) { notifyResults.push(`Email failed for ${a.name}`); }
        }
      }
    }
    // Mark task as a question if applicable
    if (isQuestion) {
      await db.update(projectTasks).set({ isQuestion: 1 as any, questionReminderSentAt: new Date() } as any).where(eq(projectTasks.id, taskId));
    }
    return { success: true, taskId, notifyResults };
  }),

  completeTask: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Get task and its assignees
    const [task] = await db.select().from(projectTasks).where(eq(projectTasks.id, input.id)).limit(1);
    if (!task) throw new TRPCError({ code: "NOT_FOUND" });
    await db.update(projectTasks).set({ status: "completed", completedAt: new Date() }).where(eq(projectTasks.id, input.id));
    const assignees = await db.select().from(taskAssignees).where(eq(taskAssignees.taskId, input.id));
    const notifyResults: string[] = [];
    for (const a of assignees) {
      if (a.phone) {
        try {
          const { sendSms } = await import("./sms");
          await sendSms({
            to: a.phone,
            message: `Hi ${a.name}, this is Kitchens Plus Upstate. The task "${task.title}" has been marked complete. Thank you for your prompt attention.`,
            isFirstContact: false,
          });
          notifyResults.push(`SMS sent to ${a.name}`);
        } catch (e) { notifyResults.push(`SMS failed for ${a.name}`); }
      }
      if (a.email) {
        try {
          const { createTransporter } = await import("./email");
          const transporter = createTransporter();
          await transporter.sendMail({
            from: `"Kitchens Plus Upstate" <${process.env.GMAIL_USER || "noreply@kitchensplus.com"}>`,
            to: a.email,
            subject: `Task Complete: ${task.title}`,
            html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
              <h2 style="color:#4CAF7D;">✅ Task Completed</h2>
              <p>Hi ${a.name},</p>
              <p>The task <strong>${task.title}</strong> has been marked complete.</p>
              <p style="color:#888;font-size:12px;">Kitchens Plus Upstate · Greenville, SC</p>
            </div>`,
          });
          notifyResults.push(`Email sent to ${a.name}`);
        } catch (e) { notifyResults.push(`Email failed for ${a.name}`); }
      }
    }
    return { success: true, notifyResults };
  }),

  deleteTask: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(taskAssignees).where(eq(taskAssignees.taskId, input.id));
    await db.delete(projectTasks).where(eq(projectTasks.id, input.id));
    return { success: true };
  }),

  uploadTaskAttachment: adminProcedure.input(z.object({
    fileName: z.string(),
    fileDataBase64: z.string(),
    mimeType: z.string(),
  })).mutation(async ({ input }) => {
    const ALLOWED_MIME = [
      "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic",
      "application/pdf",
    ];
    if (!ALLOWED_MIME.includes(input.mimeType)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `File type '${input.mimeType}' is not allowed.` });
    }
    const base64Data = input.fileDataBase64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    if (buffer.length > 20 * 1024 * 1024) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "File exceeds 20 MB limit." });
    }
    const fileKey = `task-attachments/${nanoid(12)}-${input.fileName}`;
    const { url: fileUrl } = await storagePut(fileKey, buffer, input.mimeType);
    return { url: fileUrl, name: input.fileName, mimeType: input.mimeType };
  }),

  getTaskAssignees: adminProcedure.input(z.object({ taskId: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(taskAssignees).where(eq(taskAssignees.taskId, input.taskId));
  }),

  addTaskAssignee: adminProcedure.input(z.object({
    taskId: z.number(),
    assigneeType: z.enum(["lead","vendor","crew","custom"]),
    assigneeId: z.number().optional(),
    name: z.string(),
    email: z.string().optional(),
    phone: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(taskAssignees).values({ ...input, notifiedAt: new Date() });
    return { success: true };
  }),

  removeTaskAssignee: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(taskAssignees).where(eq(taskAssignees.id, input.id));
    return { success: true };
  }),

  getCategories: adminProcedure.input(z.object({ projectId: z.number().optional() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    // Return global categories + project-specific ones
    const cats = await db.select().from(taskCategories).orderBy(asc(taskCategories.name));
    return cats.filter(c => c.projectId === null || c.projectId === input.projectId);
  }),

  addCategory: adminProcedure.input(z.object({
    name: z.string(),
    projectId: z.number().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [existing] = await db.select().from(taskCategories).where(eq(taskCategories.name, input.name)).limit(1);
    if (existing) return { success: true, id: existing.id, name: existing.name };
    const [inserted] = await db.insert(taskCategories).values({ name: input.name, projectId: input.projectId });
    return { success: true, id: (inserted as any).insertId, name: input.name };
  }),

  // ── AI Project Summary ─────────────────────────────────────────────────────────
  getProjectSummary: adminProcedure.input(z.object({ projectId: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(projectSummaries).where(eq(projectSummaries.projectId, input.projectId)).limit(1);
    return row ?? null;
  }),

  // ── Custom Assignee Roster ────────────────────────────────────────────────
  getCustomAssignees: adminProcedure.input(z.object({ projectId: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    const { projectCustomAssignees } = await import("../drizzle/schema");
    return db.select().from(projectCustomAssignees)
      .where(eq(projectCustomAssignees.projectId, input.projectId))
      .orderBy(asc(projectCustomAssignees.name));
  }),

  saveCustomAssignee: adminProcedure.input(z.object({
    projectId: z.number(),
    name: z.string(),
    email: z.string().optional(),
    phone: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { projectCustomAssignees } = await import("../drizzle/schema");
    // Upsert by projectId + name
    const [existing] = await db.select().from(projectCustomAssignees)
      .where(and(eq(projectCustomAssignees.projectId, input.projectId), eq(projectCustomAssignees.name, input.name)))
      .limit(1);
    if (existing) {
      await db.update(projectCustomAssignees)
        .set({ email: input.email, phone: input.phone })
        .where(eq(projectCustomAssignees.id, existing.id));
      return { id: existing.id, updated: true };
    }
    await db.insert(projectCustomAssignees).values({ projectId: input.projectId, name: input.name, email: input.email, phone: input.phone });
    const [{ newId }] = await db.select({ newId: sql<number>`LAST_INSERT_ID()` }).from(projectCustomAssignees).limit(1);
    return { id: newId, updated: false };
  }),

  // ── Task Replies ─────────────────────────────────────────────────────────────
  getTaskReplies: adminProcedure.input(z.object({ taskId: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    const { taskReplies } = await import("../drizzle/schema");
    return db.select().from(taskReplies)
      .where(eq(taskReplies.taskId, input.taskId))
      .orderBy(asc(taskReplies.createdAt));
  }),

  addTaskReply: adminProcedure.input(z.object({
    taskId: z.number(),
    projectId: z.number(),
    repliedBy: z.string(),
    replyChannel: z.enum(["email","sms","portal","manual"]).default("manual"),
    replyText: z.string(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { taskReplies } = await import("../drizzle/schema");
    await db.insert(taskReplies).values({
      taskId: input.taskId,
      projectId: input.projectId,
      repliedBy: input.repliedBy,
      replyChannel: input.replyChannel,
      replyText: input.replyText,
    });
    // Also log as a message in the project messages thread
    const [task] = await db.select().from(projectTasks).where(eq(projectTasks.id, input.taskId)).limit(1);
    await db.insert(messages).values({
      projectId: input.projectId,
      leadId: null,
      direction: "inbound",
      channel: "portal",
      body: `[Reply to task "${task?.title ?? "task"}"] ${input.replyText}`,
      sentBy: input.repliedBy,
      createdAt: new Date(),
    } as any);
    return { success: true };
  }),

  generateProjectSummary: adminProcedure.input(z.object({
    projectId: z.number(),
    forceRegenerate: z.boolean().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Check for cached summary
    if (!input.forceRegenerate) {
      const [existing] = await db.select().from(projectSummaries).where(eq(projectSummaries.projectId, input.projectId)).limit(1);
      if (existing) return { summary: existing.summary, generatedAt: existing.generatedAt, cached: true };
    }
    // Gather project context
    const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
    if (!project) throw new TRPCError({ code: "NOT_FOUND" });
    const allTasks = await db.select().from(projectTasks).where(eq(projectTasks.projectId, input.projectId)).orderBy(asc(projectTasks.sortOrder));
    const allMilestones = await db.select().from(milestones).where(eq(milestones.projectId, input.projectId)).orderBy(asc(milestones.sortOrder));
    const recentMessages = await db.select().from(messages).where(eq(messages.projectId, input.projectId)).orderBy(desc(messages.createdAt)).limit(20);
    const taskSummary = allTasks.length === 0 ? "No tasks yet."
      : allTasks.map(t => `- [${t.status}] ${t.title}${t.category ? ` (${t.category})` : ""}`).join("\n");
    const milestoneSummary = allMilestones.length === 0 ? "No milestones yet."
      : allMilestones.map(m => `- [${m.status}] ${m.title}${m.billingAmount ? ` ($${Number(m.billingAmount).toLocaleString()})` : ""}`).join("\n");
    const msgSummary = recentMessages.length === 0 ? "No recent communications."
      : recentMessages.slice(0, 5).map(m => `- [${m.channel}/${m.direction}] ${(m.body ?? "").slice(0, 120)}`).join("\n");
    const prompt = `You are a professional project manager assistant for a kitchen renovation company. Write a concise, professional 3-5 sentence project status summary for the owner based on the following data.

Project: ${project.name}
Status: ${project.status}
Type: ${project.projectType ?? "Kitchen renovation"}
Budget: ${project.budgetEstimated ? `$${Number(project.budgetEstimated).toLocaleString()}` : "Not set"}
Start: ${project.startDate ? new Date(project.startDate).toLocaleDateString() : "TBD"}
Est. End: ${project.estimatedEndDate ? new Date(project.estimatedEndDate).toLocaleDateString() : "TBD"}

Milestones:\n${milestoneSummary}

Tasks:\n${taskSummary}

Recent Communications:\n${msgSummary}

Write a clear, professional summary covering: current status, progress on milestones/tasks, any notable communications, and what comes next. Do not use bullet points.`;
    const llmResult = await invokeLLM({
      messages: [
        { role: "system", content: "You are a professional project management assistant for a kitchen renovation company. Write concise, professional project summaries." },
        { role: "user", content: prompt },
      ],
    });
    const summary = llmResult?.choices?.[0]?.message?.content?.trim() ?? "[Summary unavailable]";
    await db.insert(projectSummaries).values({
      projectId: input.projectId,
      summary,
      model: "gemini-2.5-flash",
    }).onDuplicateKeyUpdate({ set: { summary, generatedAt: new Date(), model: "gemini-2.5-flash" } });
    return { summary, generatedAt: new Date(), cached: false };
  }),
});

// ─── Clients router ───────────────────────────────────────────────────────────
const clientsRouter = router({
  list: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(clients)
      .where(sql`${clients.archivedAt} IS NULL`)
      .orderBy(desc(clients.createdAt));
  }),

  // Check if a client has any connected data before deleting
  checkConnectedData: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { hasData: false, counts: {} };
    const [projCount] = await db.select({ c: sql<number>`count(*)` }).from(projects).where(eq(projects.clientId, input.id));
    const [estCount] = await db.select({ c: sql<number>`count(*)` }).from(estimates).where(eq(estimates.clientId, input.id));
    const [msgCount] = await db.select({ c: sql<number>`count(*)` }).from(messages).where(eq(messages.clientId, input.id));
    const counts = { projects: Number(projCount.c), estimates: Number(estCount.c), messages: Number(msgCount.c) };
    return { hasData: Object.values(counts).some(v => v > 0), counts };
  }),

  // Archive a client (soft delete)
  archive: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(clients).set({ archivedAt: new Date() } as any).where(eq(clients.id, input.id));
    return { success: true };
  }),

  // Unarchive a client
  unarchive: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(clients).set({ archivedAt: null } as any).where(eq(clients.id, input.id));
    return { success: true };
  }),

  // Delete a client and all connected data
  deleteWithData: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(messages).where(eq(messages.clientId, input.id));
    const projRows = await db.select({ id: projects.id }).from(projects).where(eq(projects.clientId, input.id));
    for (const proj of projRows) {
      await db.delete(milestones).where(eq(milestones.projectId, proj.id));
      await db.delete(projectAssignments).where(eq(projectAssignments.projectId, proj.id));
      await db.delete(projectTasks).where(eq(projectTasks.projectId, proj.id));
    }
    await db.delete(projects).where(eq(projects.clientId, input.id));
    await db.delete(estimates).where(eq(estimates.clientId, input.id));
    await db.delete(clients).where(eq(clients.id, input.id));
    return { success: true };
  }),

  // List archived clients
  listArchived: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(clients).where(sql`${clients.archivedAt} IS NOT NULL`).orderBy(desc(clients.archivedAt));
  }),

  // Simple delete (no connected data)
  delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(clients).where(eq(clients.id, input.id));
    return { success: true };
  }),

  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const result = await db.select().from(clients).where(eq(clients.id, input.id)).limit(1);
    return result[0] ?? null;
  }),

  create: adminProcedure.input(z.object({
    name: z.string(),
    email: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    notes: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(clients).values(input);
    const [{ newId }] = await db.select({ newId: sql<number>`LAST_INSERT_ID()` }).from(clients).limit(1);
    return { id: newId };
  }),

  sendMagicLink: adminProcedure.input(z.object({
    clientId: z.number(),
    origin: z.string(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const token = nanoid(32);
    const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await db.update(clients).set({
      magicLinkToken: token,
      magicLinkExpiry: expiry,
    }).where(eq(clients.id, input.clientId));
    const link = `${input.origin}/auth/magic?token=${token}`;
    return { link, token };
  }),

  verifyMagicLink: publicProcedure.input(z.object({ token: z.string() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const result = await db.select().from(clients)
      .where(eq(clients.magicLinkToken, input.token))
      .limit(1);
    const client = result[0];
    if (!client) return null;
    if (client.magicLinkExpiry && new Date() > client.magicLinkExpiry) return null;
    return { clientId: client.id, name: client.name, email: client.email };
  }),

  /**
   * Sync Prior Emails — searches ALL Gmail workspace history for a client's
   * email address(es) and imports any threads not yet in the messages table.
   * Searches both watched addresses (chad@cpenterprisessc.com and
   * chad@kitchensplusupstate.com) going back 2 years.
   */
  syncPriorEmails: adminProcedure.input(z.object({
    clientId: z.number(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // Get client info
    const [client] = await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1);
    if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });

    const clientEmail = client.email;
    if (!clientEmail) return { imported: 0, message: "Client has no email address on file" };

    // Also find the associated lead to get email2/email3 and any linked project
    const { leads: leadsTable, projects: projectsTable } = await import("../drizzle/schema");
    const allLeads = await db.select().from(leadsTable)
      .where(or(eq(leadsTable.email, clientEmail), eq(leadsTable.email2 ?? "", clientEmail), eq(leadsTable.email3 ?? "", clientEmail)))
      .limit(5);
    const leadId = allLeads[0]?.id ?? null;

    // Collect all email addresses to search for
    const emailsToSearch = new Set<string>([clientEmail.toLowerCase()]);
    for (const lead of allLeads) {
      if (lead.email2) emailsToSearch.add(lead.email2.toLowerCase());
      if (lead.email3) emailsToSearch.add(lead.email3.toLowerCase());
    }

    // Find linked project (if any)
    let projectId: number | null = null;
    if (leadId) {
      const [proj] = await db.select({ id: projectsTable.id }).from(projectsTable)
        .where(eq(projectsTable.leadId, leadId)).limit(1);
      projectId = proj?.id ?? null;
    }

    const CLIENT_ID = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    const CLIENT_SECRET = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    const REFRESH_TOKEN = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
    if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
      return { imported: 0, message: "Gmail credentials not configured" };
    }

    // Get OAuth access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: REFRESH_TOKEN,
        grant_type: "refresh_token",
      }),
    });
    const tokenData = await tokenRes.json() as any;
    const accessToken = tokenData.access_token;
    if (!accessToken) return { imported: 0, message: "Could not obtain Gmail access token" };

    const WATCHED = ["chad@cpenterprisessc.com", "chad@kitchensplusupstate.com"];
    const decodeB64 = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
    const extractBody = (payload: any): string => {
      if (!payload) return "";
      if (payload.body?.data) return decodeB64(payload.body.data);
      if (payload.parts) {
        const plain = payload.parts.find((p: any) => p.mimeType === "text/plain" && p.body?.data);
        if (plain) return decodeB64(plain.body.data);
        const html = payload.parts.find((p: any) => p.mimeType === "text/html" && p.body?.data);
        if (html) return decodeB64(html.body.data).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        for (const p of payload.parts) { const t = extractBody(p); if (t) return t; }
      }
      return "";
    };
    const getHdr = (hdrs: any[], name: string) => hdrs?.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
    const parseEmail = (raw: string) => { const m = raw.match(/<([^>]+)>/); return (m ? m[1] : raw).trim().toLowerCase(); };

    // Go back 2 years
    const twoYearsAgo = Math.floor((Date.now() - 2 * 365 * 24 * 60 * 60 * 1000) / 1000);

    let totalImported = 0;

    for (const searchEmail of emailsToSearch) {
      const query = encodeURIComponent(`(from:${searchEmail} OR to:${searchEmail}) after:${twoYearsAgo}`);
      let pageToken: string | undefined;
      const allMsgIds: string[] = [];

      do {
        const listRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=500${pageToken ? `&pageToken=${pageToken}` : ""}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const listData = await listRes.json() as any;
        const msgs = listData.messages ?? [];
        allMsgIds.push(...msgs.map((m: any) => m.id).filter(Boolean));
        pageToken = listData.nextPageToken ?? undefined;
      } while (pageToken);

      for (const msgId of allMsgIds) {
        // Skip already imported
        const [existing] = await db.select({ id: messages.id }).from(messages)
          .where(eq(messages.gmailMessageId, msgId)).limit(1);
        if (existing) continue;

        try {
          const msgRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          const msg = await msgRes.json() as any;
          const hdrs = msg.payload?.headers ?? [];
          const fromRaw = getHdr(hdrs, "from");
          const toRaw = getHdr(hdrs, "to");
          const subject = getHdr(hdrs, "subject");
          const dateStr = getHdr(hdrs, "date");
          const body = extractBody(msg.payload);
          if (!body.trim()) continue;

          const fromEmail = parseEmail(fromRaw);
          const fromName = fromRaw.replace(/<[^>]+>/, "").trim().replace(/^"|"$/g, "");
          const isOutbound = WATCHED.includes(fromEmail);
          const sentAt = dateStr ? new Date(dateStr) : new Date(Number(msg.internalDate));

          await db.insert(messages).values({
            leadId: leadId ?? undefined,
            clientId: input.clientId,
            projectId: projectId ?? undefined,
            threadType: "client",
            direction: isOutbound ? "outbound" : "inbound",
            channel: "email",
            fromName: fromName || undefined,
            fromEmail,
            toEmail: toRaw || undefined,
            body: body.slice(0, 10000),
            subject: subject || undefined,
            gmailMessageId: msgId,
            gmailThreadId: msg.threadId ?? undefined,
            accountEmail: "chad@kitchensplusupstate.com",
            status: "received",
            isRead: false,
            sentAt,
            createdAt: sentAt,
          } as any);
          totalImported++;
        } catch (_) {
          // Skip individual message errors
        }
      }
    }

    return { imported: totalImported, message: `Imported ${totalImported} email${totalImported === 1 ? "" : "s"} from Gmail history` };
  }),
});

// ─── Vendors router ───────────────────────────────────────────────────────────
const vendorsRouter = router({
  list: protectedProcedure.input(z.object({
    trade: z.string().optional(),
    availability: z.string().optional(),
  }).optional()).query(async () => {
    const db = await getDb();
    if (!db) return [];
    const vendorList = await db.select().from(vendors).where(eq(vendors.isActive, true)).orderBy(vendors.companyName);
    const vendorsWithContacts = await Promise.all(
      vendorList.map(async (v) => {
        const contacts = await db.select().from(vendorContacts).where(eq(vendorContacts.vendorId, v.id));
        return { ...v, contacts };
      })
    );
    return vendorsWithContacts;
  }),

  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const result = await db.select().from(vendors).where(eq(vendors.id, input.id)).limit(1);
    if (!result[0]) return null;
    const contacts = await db.select().from(vendorContacts).where(eq(vendorContacts.vendorId, input.id));
    return { ...result[0], contacts };
  }),

  create: adminProcedure.input(z.object({
    companyName: z.string(),
    companyEmail: z.string().optional(),
    website: z.string().optional(),
    trade: z.string().optional(),
    notes: z.string().optional(),
    contacts: z.array(z.object({
      contactName: z.string(),
      phone: z.string().optional(),
      email: z.string().optional(),
      receivePhoneMessages: z.boolean().default(true),
      receiveEmailMessages: z.boolean().default(true),
    })),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { contacts, ...vendorData } = input;
    await db.insert(vendors).values(vendorData as any);
    const [{ newId }] = await db.select({ newId: sql<number>`LAST_INSERT_ID()` }).from(vendors).limit(1);
    // Filter out blank contact rows (no name, phone, or email)
    const validContacts = contacts.filter(c => c.contactName || c.phone || c.email);
    if (validContacts.length > 0) {
      await db.insert(vendorContacts).values(
        validContacts.map(c => ({
          vendorId: newId,
          contactName: c.contactName,
          phone: c.phone || null,
          email: c.email || null,
          receivePhoneMessages: c.receivePhoneMessages ?? true,
          receiveEmailMessages: c.receiveEmailMessages ?? true,
        }))
      );
    }
    return { id: newId };
  }),

  update: adminProcedure.input(z.object({
    id: z.number(),
    companyName: z.string().optional(),
    companyEmail: z.string().optional(),
    website: z.string().optional(),
    trade: z.string().optional(),
    notes: z.string().optional(),
    contacts: z.array(z.object({
      id: z.number().optional(),
      contactName: z.string(),
      phone: z.string().optional(),
      email: z.string().optional(),
      receivePhoneMessages: z.boolean().default(true),
      receiveEmailMessages: z.boolean().default(true),
    })).optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, contacts, ...vendorData } = input;
    await db.update(vendors).set(vendorData as any).where(eq(vendors.id, id));
    if (contacts !== undefined) {
      await db.delete(vendorContacts).where(eq(vendorContacts.vendorId, id));
      if (contacts.length > 0) {
        await db.insert(vendorContacts).values(
          contacts.map(c => ({
            vendorId: id,
            contactName: c.contactName,
            phone: c.phone || null,
            email: c.email || null,
            receivePhoneMessages: c.receivePhoneMessages,
            receiveEmailMessages: c.receiveEmailMessages,
          }))
        );
      }
    }
    return { success: true };
  }),

  updateContact: adminProcedure.input(z.object({
    id: z.number(),
    contactName: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    receivePhoneMessages: z.boolean().optional(),
    receiveEmailMessages: z.boolean().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, ...data } = input;
    await db.update(vendorContacts).set(data).where(eq(vendorContacts.id, id));
    return { success: true };
  }),

  deleteContact: adminProcedure.input(z.object({
    id: z.number(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Check if this is the only contact for the vendor
    const contact = await db.select().from(vendorContacts).where(eq(vendorContacts.id, input.id)).limit(1);
    if (!contact[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
    const vendorId = contact[0].vendorId;
    const contactCount = await db.select({ count: sql<number>`COUNT(*)` }).from(vendorContacts).where(eq(vendorContacts.vendorId, vendorId));
    if (contactCount[0].count <= 1) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Vendor must have at least one contact" });
    }
    await db.delete(vendorContacts).where(eq(vendorContacts.id, input.id));
    return { success: true };
  }),

  getDocs: protectedProcedure.input(z.object({ vendorId: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(vendorDocs).where(eq(vendorDocs.vendorId, input.vendorId));
  }),

  updateDoc: adminProcedure.input(z.object({
    id: z.number(),
    status: z.enum(["pending","approved","expired","rejected"]).optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, ...data } = input;
    await db.update(vendorDocs).set(data).where(eq(vendorDocs.id, id));
    return { success: true };
  }),

  getQuotes: protectedProcedure.input(z.object({ projectId: z.number().optional(), vendorId: z.number().optional() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    if (input.vendorId) return db.select().from(vendorQuotes).where(eq(vendorQuotes.vendorId, input.vendorId));
    if (input.projectId) return db.select().from(vendorQuotes).where(eq(vendorQuotes.projectId, input.projectId));
    return db.select().from(vendorQuotes).orderBy(desc(vendorQuotes.createdAt));
  }),

  submitQuote: protectedProcedure.input(z.object({
    vendorId: z.number(),
    projectId: z.number().optional(),
    title: z.string(),
    amount: z.string(),
    description: z.string().optional(),
    validUntil: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(vendorQuotes).values({
      vendorId: input.vendorId,
      projectId: input.projectId ?? 0,
      amount: input.amount as any,
      description: input.description ?? input.title,
      notes: input.title,
      validUntil: input.validUntil ? new Date(input.validUntil) : undefined,
      status: 'submitted',
    });
    const [{ newId }] = await db.select({ newId: sql<number>`LAST_INSERT_ID()` }).from(vendorQuotes).limit(1);
    return { id: newId };
  }),
  delete: adminProcedure.input(z.object({ vendorId: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(vendorContacts).where(eq(vendorContacts.vendorId, input.vendorId));
    await db.delete(vendors).where(eq(vendors.id, input.vendorId));
    return { success: true };
  }),
});

// ─── Estimates router ─────────────────────────────────────────────────────────
const estimatesRouter = router({
  list: adminProcedure.input(z.object({
    projectId: z.number().optional(),
    clientId: z.number().optional(),
  }).optional()).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(estimates).orderBy(desc(estimates.createdAt));
  }),

  get: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const est = await db.select().from(estimates).where(eq(estimates.id, input.id)).limit(1);
    const items = await db.select().from(estimateLineItems).where(eq(estimateLineItems.estimateId, input.id)).orderBy(estimateLineItems.sortOrder);
    const role = (ctx.user as any)?.role;
    const isAdmin = role === "owner" || role === "admin";
    // Strip internal-only fields from line items for non-admin callers (client portal, public links)
    const safeItems = isAdmin
      ? items
      : items.map(({ internalCost: _ic, subcontractorId: _sid, selfPerformed: _sp, ...rest }) => rest);
    return { ...(est[0] ?? null), lineItems: safeItems };
  }),

  create: adminProcedure.input(z.object({
    projectId: z.number().optional(),
    leadId: z.number().optional(),
    clientId: z.number().optional(),
    title: z.string(),
    notes: z.string().optional(),
    depositPercent: z.string().optional(),
    taxRate: z.string().optional(),
    validUntil: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // ── Auto-generate KP-YYYY-NNN proposal number ───────────────────────────
    const year = new Date().getFullYear();
    const yearPrefix = `KP-${year}-`;
    const existing = await db
      .select({ estimateNumber: estimates.estimateNumber })
      .from(estimates)
      .where(sql`estimateNumber LIKE ${yearPrefix + '%'}`);
    let maxSeq = 0;
    for (const row of existing) {
      const parts = (row.estimateNumber ?? "").split("-");
      const seq = parseInt(parts[2] ?? "0", 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
    const estimateNumber = `KP-${year}-${String(maxSeq + 1).padStart(3, "0")}`;
    // ────────────────────────────────────────────────────────────────────────

    await db.insert(estimates).values({
      ...input,
      estimateNumber,
      depositPercent: input.depositPercent as any ?? "50.00",
      taxRate: input.taxRate as any ?? "0.00",
      validUntil: input.validUntil ? new Date(input.validUntil) : undefined,
      status: "draft",
    });
    const [{ newId }] = await db.select({ newId: sql<number>`LAST_INSERT_ID()` }).from(estimates).limit(1);
    return { id: newId, estimateNumber };
  }),

  update: adminProcedure.input(z.object({
    id: z.number(),
    title: z.string().optional(),
    status: z.enum(["draft","sent","viewed","approved","rejected","expired"]).optional(),
    notes: z.string().optional(),
    depositPercent: z.string().optional(),
    taxRate: z.string().optional(),
    subtotal: z.string().optional(),
    total: z.string().optional(),
    depositAmount: z.string().optional(),
    hidePrices: z.number().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, ...data } = input;
    await db.update(estimates).set(data as any).where(eq(estimates.id, id));
    return { success: true };
  }),

  addLineItem: adminProcedure.input(z.object({
    estimateId: z.number(),
    task: z.string().optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    quantity: z.string().optional(),
    unit: z.string().optional(),
    unitCost: z.string(),
    markupPercent: z.string().optional(),
    showMarkup: z.boolean().optional(),
    productUrl: z.string().optional(),
    productSource: z.string().optional(),
    imageUrl: z.string().optional(),
    sortOrder: z.number().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const qty = parseFloat(input.quantity ?? "1");
    const cost = parseFloat(input.unitCost);
    const markup = parseFloat(input.markupPercent ?? "0");
    const unitPrice = cost * (1 + markup / 100);
    const lineTotal = unitPrice * qty;
    await db.insert(estimateLineItems).values({
      estimateId: input.estimateId,
      task: input.task,
      description: input.description,
      category: input.category,
      quantity: input.quantity as any ?? "1.00",
      unit: input.unit,
      unitCost: input.unitCost as any,
      markupPercent: input.markupPercent as any ?? "0.00",
      unitPrice: unitPrice.toFixed(2) as any,
      lineTotal: lineTotal.toFixed(2) as any,
      showMarkup: input.showMarkup ?? false,
      productUrl: input.productUrl,
      productSource: input.productSource,
      imageUrl: input.imageUrl,
      sortOrder: input.sortOrder ?? 0,
    });
    const [{ newLineItemId }] = await db.select({ newLineItemId: sql<number>`LAST_INSERT_ID()` }).from(estimateLineItems).limit(1);
    // Recalculate estimate totals
    const items = await db.select().from(estimateLineItems).where(eq(estimateLineItems.estimateId, input.estimateId));
    const subtotal = items.reduce((sum, item) => sum + parseFloat(String(item.lineTotal ?? 0)), 0);
    const est = await db.select().from(estimates).where(eq(estimates.id, input.estimateId)).limit(1);
    const taxRate = parseFloat(String(est[0]?.taxRate ?? 0));
    const taxAmount = subtotal * taxRate / 100;
    const total = subtotal + taxAmount;
    const depositPercent = parseFloat(String(est[0]?.depositPercent ?? 50));
    const depositAmount = total * depositPercent / 100;
    await db.update(estimates).set({
      subtotal: subtotal.toFixed(2) as any,
      taxAmount: taxAmount.toFixed(2) as any,
      total: total.toFixed(2) as any,
      depositAmount: depositAmount.toFixed(2) as any,
    }).where(eq(estimates.id, input.estimateId));
    return { id: newLineItemId };
  }),

  deleteLineItem: adminProcedure.input(z.object({ id: z.number(), estimateId: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(estimateLineItems).where(eq(estimateLineItems.id, input.id));
    return { success: true };
  }),

  /** Atomic save: header + all line items in one call (used by autosave).
   *  Uses upsert strategy: UPDATE existing items by id, INSERT new items,
   *  DELETE removed items. Preserves internal-only fields (internalCost,
   *  subcontractorId, selfPerformed, clientApproved) that the editor
   *  doesn't touch. */
  saveAll: adminProcedure.input(z.object({
    id: z.number(),
    title: z.string(),
    notes: z.string().optional(),
    depositPercent: z.string().optional(),
    hidePrices: z.number().optional(),
    lineItems: z.array(z.object({
      id: z.number().optional(),          // existing line-item id (undefined = new)
      task: z.string().optional(),
      description: z.string().optional(),
      category: z.string().optional(),
      quantity: z.string().optional(),
      unit: z.string().optional(),
      unitCost: z.string(),
      markupPercent: z.string().optional(),
      showMarkup: z.boolean().optional(),
      productUrl: z.string().optional(),
      productSource: z.string().optional(),
      imageUrl: z.string().optional(),
      sortOrder: z.number().optional(),
    })),
    _savedAt: z.number(), // client timestamp to detect stale saves
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, lineItems, _savedAt, ...headerData } = input;

    // 1. Update header
    await db.update(estimates).set(headerData as any).where(eq(estimates.id, id));

    // 2. Fetch existing line items so we can diff
    const existing = await db.select().from(estimateLineItems)
      .where(eq(estimateLineItems.estimateId, id));
    const existingMap = new Map(existing.map(e => [e.id, e]));

    // 3. Track which existing IDs are still present
    const keptIds = new Set<number>();

    for (let i = 0; i < lineItems.length; i++) {
      const li = lineItems[i];
      const qty = parseFloat(li.quantity ?? "1") || 0;
      const cost = parseFloat(li.unitCost) || 0;
      const markup = parseFloat(li.markupPercent ?? "0") || 0;
      const unitPrice = cost * (1 + markup / 100);
      const lineTotal = unitPrice * qty;

      const editableFields = {
        task: li.task,
        description: li.description,
        category: li.category,
        quantity: (li.quantity && li.quantity !== "" ? li.quantity : "1") as any,
        unit: li.unit,
        unitCost: (li.unitCost && li.unitCost !== "" ? li.unitCost : "0") as any,
        markupPercent: (li.markupPercent && li.markupPercent !== "" ? li.markupPercent : "0") as any,
        unitPrice: unitPrice.toFixed(2) as any,
        lineTotal: lineTotal.toFixed(2) as any,
        showMarkup: li.showMarkup ?? false,
        productUrl: li.productUrl,
        productSource: li.productSource,
        imageUrl: li.imageUrl,
        sortOrder: li.sortOrder ?? i,
      };

      if (li.id && existingMap.has(li.id)) {
        // UPDATE existing item — preserves internalCost, subcontractorId, selfPerformed, clientApproved
        keptIds.add(li.id);
        await db.update(estimateLineItems).set(editableFields).where(eq(estimateLineItems.id, li.id));
      } else {
        // INSERT new item
        await db.insert(estimateLineItems).values({
          estimateId: id,
          ...editableFields,
        });
      }
    }

    // 4. Delete items that were removed by the user
    for (const ex of existing) {
      if (!keptIds.has(ex.id)) {
        await db.delete(estimateLineItems).where(eq(estimateLineItems.id, ex.id));
      }
    }

    // 5. Recalculate totals
    const items = await db.select().from(estimateLineItems).where(eq(estimateLineItems.estimateId, id));
    const subtotal = items.reduce((sum, item) => sum + parseFloat(String(item.lineTotal ?? 0)), 0);
    const est = await db.select().from(estimates).where(eq(estimates.id, id)).limit(1);
    const taxRate = parseFloat(String(est[0]?.taxRate ?? 0));
    const taxAmount = subtotal * taxRate / 100;
    const total = subtotal + taxAmount;
    const depositPercent = parseFloat(String(est[0]?.depositPercent ?? 50));
    const depositAmount = total * depositPercent / 100;
    await db.update(estimates).set({
      subtotal: subtotal.toFixed(2) as any,
      taxAmount: taxAmount.toFixed(2) as any,
      total: total.toFixed(2) as any,
      depositAmount: depositAmount.toFixed(2) as any,
    }).where(eq(estimates.id, id));
    // 6. Create version snapshot (change detection via content hash)
    try {
      const crypto = await import("crypto");
      const updatedEst = await db.select().from(estimates).where(eq(estimates.id, id)).limit(1);
      const updatedItems = await db.select().from(estimateLineItems).where(eq(estimateLineItems.estimateId, id));
      const snapshotData = { header: updatedEst[0], lineItems: updatedItems };
      const snapshotJson = JSON.stringify(snapshotData);
      const contentHash = crypto.createHash("sha256").update(snapshotJson).digest("hex").slice(0, 32);
      // Check if last version has same hash (skip duplicate)
      const [lastVersion] = await db.select().from(estimateVersions)
        .where(eq(estimateVersions.estimateId, id))
        .orderBy(desc(estimateVersions.versionNumber))
        .limit(1);
      if (!lastVersion || lastVersion.contentHash !== contentHash) {
        const nextVersion = (lastVersion?.versionNumber ?? 0) + 1;
        await db.insert(estimateVersions).values({
          estimateId: id,
          versionNumber: nextVersion,
          snapshot: snapshotData,
          trigger: "autosave",
          contentHash,
        });
      }
    } catch (vErr) {
      console.error("[version snapshot] non-fatal:", vErr);
    }
    return { success: true, savedAt: _savedAt };
  }),

  approve: publicProcedure.input(z.object({ id: z.number(), token: z.string().optional() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const approvedAt = new Date();
    await db.update(estimates).set({ status: "approved", approvedAt }).where(eq(estimates.id, input.id));

    // ── Auto-create project if none exists, then seed tasks from line items ──
    try {
      const [est] = await db.select().from(estimates).where(eq(estimates.id, input.id)).limit(1);
      if (!est) return { success: true };

      // Resolve or create the project
      let projectId: number | undefined;
      const projectCondition = est.leadId
        ? eq(projects.leadId, est.leadId)
        : est.clientId
          ? eq(projects.clientId, est.clientId!)
          : null;

      if (projectCondition) {
        const existing = await db.select({ id: projects.id }).from(projects).where(projectCondition).limit(1);
        if (existing.length > 0) {
          projectId = existing[0].id;
        } else {
          // Auto-create project
          let projectName = est.title ?? "New Project";
          let projectAddress: string | undefined;
          if (est.leadId) {
            const [leadRow] = await db.select().from(leads).where(eq(leads.id, est.leadId)).limit(1);
            if (leadRow) {
              projectAddress = leadRow.address ?? undefined;
              projectName = est.title ?? `${leadRow.name} — ${leadRow.projectType ?? "Project"}`;
            }
          } else if (est.clientId) {
            const [clientRow] = await db.select().from(clients).where(eq(clients.id, est.clientId!)).limit(1);
            projectAddress = clientRow?.address ?? undefined;
            projectName = est.title ?? `${clientRow?.name ?? "Client"} — Project`;
          }
          const palette = ["#D4A853","#6B8E6B","#7B9BB5","#C47B5A","#9B7BC4","#5AB5A8","#C45A7B","#8BB57B"];
          const allProj = await db.select({ id: projects.id }).from(projects);
          const color = palette[allProj.length % palette.length];
          await db.insert(projects).values({
            leadId: est.leadId ?? undefined,
            clientId: est.clientId ?? undefined,
            name: projectName,
            address: projectAddress,
            status: "planning",
            color,
          });
          const [{ newProjId }] = await db.select({ newProjId: sql<number>`LAST_INSERT_ID()` }).from(projects).limit(1);
          projectId = newProjId;
        }
      }

      // Seed one task per line item as "In-House Work"
      if (projectId) {
        const lineItems = await db.select().from(estimateLineItems)
          .where(eq(estimateLineItems.estimateId, input.id))
          .orderBy(estimateLineItems.sortOrder);

        for (let i = 0; i < lineItems.length; i++) {
          const li = lineItems[i];
          const taskTitle = li.task ?? li.description ?? `Line Item ${i + 1}`;
          // Skip if a task for this line item already exists
          const existingTask = li.id
            ? await db.select({ id: projectTasks.id }).from(projectTasks)
                .where(eq(projectTasks.estimateLineItemId, li.id)).limit(1)
            : [];
          if (existingTask.length > 0) continue;

          const noteParts: string[] = [];
          if (li.description && li.description !== taskTitle) noteParts.push(li.description);
          if (li.quantity && parseFloat(String(li.quantity)) !== 1) noteParts.push(`Qty: ${li.quantity}${li.unit ? " " + li.unit : ""}`);
          if (li.unitPrice && parseFloat(String(li.unitPrice)) > 0) {
            const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
            noteParts.push(`Unit Price: ${fmt.format(parseFloat(String(li.unitPrice)))}`);
          }

          await db.insert(projectTasks).values({
            projectId,
            estimateId: input.id,
            estimateLineItemId: li.id,
            title: taskTitle.slice(0, 255),
            description: li.description ?? undefined,
            category: "In-House Work", // Always In-House Work regardless of line item category
            quantity: li.quantity ? String(li.quantity) : undefined,
            unit: li.unit ?? undefined,
            notes: noteParts.length > 0 ? noteParts.join(" | ") : undefined,
            status: "pending",
            sortOrder: i,
          });
        }
      }
    } catch (taskErr: any) {
      // Non-blocking — approval still succeeds even if task seeding fails
      console.error("[ProposalApprove] Task seeding failed (non-blocking):", taskErr?.message);
    }
    // ── Auto-create award candidates for line items with subcontractorId assigned ──
    try {
      const db2 = await getDb();
      if (db2) {
        const [est2] = await db2.select().from(estimates).where(eq(estimates.id, input.id)).limit(1);
        const lineItems2 = await db2.select().from(estimateLineItems)
          .where(eq(estimateLineItems.estimateId, input.id));
        const projectId2 = est2?.projectId ?? undefined;
        for (const li of lineItems2) {
          if (!li.subcontractorId) continue;
          // Skip if already exists
          const existing = await db2.select({ id: subcontractorAwardCandidates.id })
            .from(subcontractorAwardCandidates)
            .where(and(
              eq(subcontractorAwardCandidates.estimateId, input.id),
              eq(subcontractorAwardCandidates.lineItemId, li.id),
              eq(subcontractorAwardCandidates.subcontractorId, li.subcontractorId),
            )).limit(1);
          if (existing.length > 0) continue;
          await db2.insert(subcontractorAwardCandidates).values({
            estimateId: input.id,
            lineItemId: li.id,
            subcontractorId: li.subcontractorId,
            projectId: projectId2,
            scopeDescription: li.task ?? li.description ?? undefined,
            agreedAmount: li.lineTotal ?? "0.00" as any,
            status: "assigned",
          });
        }
      }
    } catch (awardErr: any) {
      console.error("[ProposalApprove] Award candidate creation failed (non-blocking):", awardErr?.message);
    }
    return { success: true };
  }),
  // ── Update internal costing fields on a line item (never returned to client) ──
  updateLineItemCost: adminProcedure.input(z.object({
    id: z.number(),
    internalCost: z.string().optional(),
    subcontractorId: z.number().nullable().optional(),
    selfPerformed: z.boolean().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const updates: Record<string, any> = {};
    if (input.internalCost !== undefined) updates.internalCost = input.internalCost;
    if (input.subcontractorId !== undefined) updates.subcontractorId = input.subcontractorId;
    if (input.selfPerformed !== undefined) updates.selfPerformed = input.selfPerformed ? 1 : 0;
    if (Object.keys(updates).length > 0) {
      await db.update(estimateLineItems).set(updates).where(eq(estimateLineItems.id, input.id));
    }
    return { success: true };
  }),
  // ── Get internal costing summary for an estimate ──
  getInternalCostSummary: adminProcedure.input(z.object({ estimateId: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const [est] = await db.select().from(estimates).where(eq(estimates.id, input.estimateId)).limit(1);
    if (!est) return null;
    const items = await db.select().from(estimateLineItems)
      .where(eq(estimateLineItems.estimateId, input.estimateId));
    const totalRevenue = items.reduce((s, li) => s + parseFloat(String(li.lineTotal ?? 0)), 0);
    const totalInternalCost = items.reduce((s, li) => s + parseFloat(String(li.internalCost ?? 0)), 0);
    const grossProfit = totalRevenue - totalInternalCost;
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    // Get subcontractor names for assigned items
    const subIds = [...new Set(items.filter(li => li.subcontractorId).map(li => li.subcontractorId!))];
    const subRows = subIds.length > 0
      ? await db.select({ id: subcontractors.id, companyName: subcontractors.companyName })
          .from(subcontractors).where(inArray(subcontractors.id, subIds))
      : [];
    const subMap = new Map(subRows.map(s => [s.id, s.companyName]));
    const lineItemsWithCost = items.map(li => ({
      id: li.id,
      task: li.task,
      description: li.description,
      lineTotal: parseFloat(String(li.lineTotal ?? 0)),
      internalCost: parseFloat(String(li.internalCost ?? 0)),
      selfPerformed: li.selfPerformed === 1,
      subcontractorId: li.subcontractorId,
      subcontractorName: li.subcontractorId ? (subMap.get(li.subcontractorId) ?? null) : null,
      margin: parseFloat(String(li.lineTotal ?? 0)) > 0
        ? ((parseFloat(String(li.lineTotal ?? 0)) - parseFloat(String(li.internalCost ?? 0))) / parseFloat(String(li.lineTotal ?? 0))) * 100
        : 0,
    }));
    return {
      estimateId: input.estimateId,
      totalRevenue,
      totalInternalCost,
      grossProfit,
      grossMargin,
      lineItems: lineItemsWithCost,
    };
  }),
  // ── Award candidates management ──
  listAwardCandidates: adminProcedure.input(z.object({ estimateId: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    const candidates = await db.select().from(subcontractorAwardCandidates)
      .where(eq(subcontractorAwardCandidates.estimateId, input.estimateId));
    if (candidates.length === 0) return [];
    const subIds = [...new Set(candidates.map(c => c.subcontractorId))];
    const subRows = await db.select({ id: subcontractors.id, companyName: subcontractors.companyName, trade: subcontractors.trade, tier: subcontractors.tier })
      .from(subcontractors).where(inArray(subcontractors.id, subIds));
    const subMap = new Map(subRows.map(s => [s.id, s]));
    return candidates.map(c => ({
      ...c,
      subcontractor: subMap.get(c.subcontractorId) ?? null,
    }));
  }),
  updateAwardCandidate: adminProcedure.input(z.object({
    id: z.number(),
    status: z.enum(["estimated","assigned","awarded","accepted","deposit_funded","complete","voided"]).optional(),
    agreedAmount: z.string().optional(),
    notes: z.string().optional(),
    contractId: z.number().nullable().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, ...updates } = input;
    const setData: Record<string, any> = { ...updates };
    if (updates.status === "awarded") setData.awardedAt = new Date();
    if (updates.status === "accepted") setData.acceptedAt = new Date();
    await db.update(subcontractorAwardCandidates).set(setData).where(eq(subcontractorAwardCandidates.id, id));
    return { success: true };
  }),
  delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(estimateLineItems).where(eq(estimateLineItems.estimateId, input.id));
    await db.delete(estimates).where(eq(estimates.id, input.id));
    return { success: true };
  }),

  // AI notes suggestion based on past proposals
  getAiNotes: adminProcedure.input(z.object({
    clientId: z.number().optional(),
    projectType: z.string().optional(),
    title: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) return { suggestion: "" };
    // Fetch last 3 approved/sent estimates for context
    const pastEstimates = await db.select().from(estimates)
      .where(eq(estimates.status, "approved"))
      .orderBy(desc(estimates.createdAt))
      .limit(3);
    const pastNotes = pastEstimates.map(e => `Title: ${e.title}\nNotes: ${e.notes ?? ""}`).join("\n\n");
    const { invokeLLM } = await import("./_core/llm");
    const response = await invokeLLM({
      messages: [
        { role: "system", content: `You are an assistant for Kitchens Plus Upstate, a luxury kitchen, bath & whole-house renovation company in Upstate SC. Write professional, friendly proposal notes. Be concise and use bullet points. Include payment terms (50% deposit), scope clarity, and any relevant context. Keep it under 150 words.` },
        { role: "user", content: `Generate proposal notes for:\nProject Type: ${input.projectType ?? "renovation"}\nTitle: ${input.title ?? "Renovation Proposal"}\n\nPast approved proposal notes for context:\n${pastNotes || "No past proposals yet."}\n\nWrite notes that can be edited as needed.` },
      ],
    });
    const suggestion = (response as any)?.choices?.[0]?.message?.content ?? "";
    return { suggestion };
  }),

  // Send proposal via email + SMS
  sendProposal: adminProcedure.input(z.object({
    id: z.number(),
    origin: z.string(),
    /** When true, CC chad@cpenterprisessc.com on the proposal email */
    ccOwner: z.boolean().optional(),
    /** IDs of proposalAttachments rows to include as email attachments (max 5, total ≤ 10 MB) */
    attachmentIds: z.array(z.number()).max(5).optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const est = await db.select().from(estimates).where(eq(estimates.id, input.id)).limit(1);
    if (!est[0]) throw new TRPCError({ code: "NOT_FOUND" });
    const e = est[0];
    // Get client info
    let clientEmail = "";
    let clientName = "";
    let clientPhone = "";
    if (e.clientId) {
      const cl = await db.select().from(clients).where(eq(clients.id, e.clientId)).limit(1);
      clientEmail = cl[0]?.email ?? "";
      clientName = cl[0]?.name ?? "Client";
      clientPhone = cl[0]?.phone ?? "";
    } else if (e.leadId) {
      const lead = await db.select().from(leads).where(eq(leads.id, e.leadId)).limit(1);
      clientEmail = lead[0]?.email ?? "";
      clientName = lead[0]?.name ?? "Client";
      clientPhone = lead[0]?.phone ?? "";
    }
    // ── Pre-flight: require a valid email address ────────────────────────────
    if (!clientEmail || !clientEmail.includes("@")) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Cannot send proposal — ${clientName} has no email address on file. Add an email to their lead record first.`,
      });
    }
    // ─────────────────────────────────────────────────────────────────────────
    const portalUrl = `${input.origin}/client/proposal/${e.id}`;

    // ── Generate branded PDF ─────────────────────────────────────────────────
    let pdfBuffer: Buffer | undefined;
    let pdfUrl: string | undefined;
    let pdfKey: string | undefined;
    try {
      const { generateProposalPdf } = await import("./proposalPdf");
      const { storagePut } = await import("./storage");
      const lineItems = await db.select().from(estimateLineItems)
        .where(eq(estimateLineItems.estimateId, e.id))
        .orderBy(estimateLineItems.sortOrder);
      // Pre-fetch product thumbnails for line items that have an imageUrl
      const lineItemsWithImages = await Promise.all(lineItems.map(async li => {
        let imageBuffer: Buffer | null = null;
        if (li.imageUrl) {
          try {
            const imgRes = await fetch(li.imageUrl, { signal: AbortSignal.timeout(5000) });
            if (imgRes.ok) imageBuffer = Buffer.from(await imgRes.arrayBuffer());
          } catch { /* skip if image fetch fails */ }
        }
        return { ...li, imageBuffer };
      }));
      pdfBuffer = await generateProposalPdf({
        estimateNumber: e.estimateNumber ?? `PROP-${e.id}`,
        title: e.title ?? "Renovation Proposal",
        clientName,
        clientEmail: clientEmail || undefined,
        clientPhone: clientPhone || undefined,
        clientAddress: e.leadId
          ? (await db.select().from(leads).where(eq(leads.id, e.leadId)).limit(1))[0]?.address ?? undefined
          : (await db.select().from(clients).where(eq(clients.id, e.clientId!)).limit(1))[0]?.address ?? undefined,
        notes: e.notes ?? undefined,
        validUntil: e.validUntil ?? null,
        createdAt: e.createdAt ?? null,
        subtotal: parseFloat(String(e.subtotal ?? 0)),
        taxRate: parseFloat(String(e.taxRate ?? 0)),
        taxAmount: parseFloat(String(e.taxAmount ?? 0)),
        depositPercent: parseFloat(String(e.depositPercent ?? 50)),
        depositAmount: parseFloat(String(e.depositAmount ?? 0)),
        total: parseFloat(String(e.total ?? 0)),
        lineItems: lineItemsWithImages.map(li => ({
          task: li.task,
          description: li.description,
          category: li.category,
          quantity: li.quantity,
          unitCost: li.unitCost,
          markupPercent: li.markupPercent,
          showMarkup: li.showMarkup,
          imageUrl: li.imageUrl,
          productUrl: li.productUrl,
          productSource: li.productSource,
          imageBuffer: li.imageBuffer,
        })),
        showPrices: !e.hidePrices,  // respect the Show Prices to Client toggle
      });
      const fileKey = `proposals/${e.estimateNumber ?? `prop-${e.id}`}-${Date.now()}.pdf`;
      const stored = await storagePut(fileKey, pdfBuffer, "application/pdf");
      pdfUrl = stored.url;
      pdfKey = stored.key;
      // Persist PDF url on the estimate record
      await db.update(estimates).set({ pdfUrl, pdfKey }).where(eq(estimates.id, e.id));
    } catch (pdfErr: any) {
      console.error("[PDF] Generation failed (non-blocking):", pdfErr?.message ?? pdfErr);
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── Download any operator-selected attachments to include in the email ─────
    const additionalAttachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
    if (input.attachmentIds?.length) {
      const attRows = await db
        .select()
        .from(proposalAttachments)
        .where(and(
          eq(proposalAttachments.estimateId, e.id),
          inArray(proposalAttachments.id, input.attachmentIds),
          eq(proposalAttachments.clientVisible as any, 1),
        ));
      let totalBytes = 0;
      for (const att of attRows) {
        try {
          const resp = await fetch(att.fileUrl, { signal: AbortSignal.timeout(10000) });
          if (!resp.ok) continue;
          const buf = Buffer.from(await resp.arrayBuffer());
          if (totalBytes + buf.byteLength > 10 * 1024 * 1024) break; // cap at 10 MB total
          totalBytes += buf.byteLength;
          const ext = (att.fileName ?? "file").split(".").pop() ?? "bin";
          const contentType = ["pdf"].includes(ext) ? "application/pdf" :
            ["jpg","jpeg"].includes(ext) ? "image/jpeg" :
            ["png"].includes(ext) ? "image/png" :
            ["gif"].includes(ext) ? "image/gif" :
            ["webp"].includes(ext) ? "image/webp" : "application/octet-stream";
          additionalAttachments.push({ filename: att.fileName ?? `attachment-${att.id}.${ext}`, content: buf, contentType });
        } catch { /* skip files that fail to download */ }
      }
    }
    // ────────────────────────────────────────────────────────────────────────
    const { sendProposalEmail, sendDashboardWelcomeEmail } = await import("./email");
    const emailResult = await sendProposalEmail({
      toEmail: clientEmail,
      toName: clientName,
      proposalNumber: e.estimateNumber ?? `PROP-${e.id}`,
      proposalTitle: e.title ?? "Renovation Proposal",
      totalAmount: parseFloat(String(e.total ?? 0)),
      portalUrl,
      notes: e.notes ?? undefined,
      pdfBuffer,
      ...(input.ccOwner ? { ccEmail: "chad@cpenterprisessc.com" } : {}),
      ...(additionalAttachments.length ? { additionalAttachments } : {}),
    });
    // ── Send dashboard welcome email (non-blocking) ──────────────────────────
    try {
      await sendDashboardWelcomeEmail({
        toEmail: clientEmail,
        toName: clientName,
        portalUrl,
        ...(input.ccOwner ? { ccEmail: "chad@cpenterprisessc.com" } : {}),
      });
    } catch (welcomeErr: any) {
      console.error("[Email] Dashboard welcome email failed (non-blocking):", welcomeErr?.message ?? welcomeErr);
    }
    // Send SMS notification to client
    let smsResult: { ok: boolean; error?: string } = { ok: true };
    if (clientPhone) {
      const formattedTotal = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(parseFloat(String(e.total ?? 0)));
      const smsRaw = await sendSms(
        clientPhone,
        `Hi ${clientName}, Kitchens Plus Upstate has prepared a proposal for you in the amount of ${formattedTotal}. Please review and respond at your convenience: ${portalUrl}\n\nQuestions? Call Chad at 864-567-8777.`
      );
      smsResult = { ok: smsRaw.success, error: smsRaw.error };
    }
    // Create version snapshot before marking as sent
    try {
      const crypto = await import("crypto");
      const sendItems = await db.select().from(estimateLineItems).where(eq(estimateLineItems.estimateId, input.id));
      const sendSnap = { header: e, lineItems: sendItems };
      const sendHash = crypto.createHash("sha256").update(JSON.stringify(sendSnap)).digest("hex").slice(0, 32);
      const [lastSendVer] = await db.select().from(estimateVersions)
        .where(eq(estimateVersions.estimateId, input.id))
        .orderBy(desc(estimateVersions.versionNumber)).limit(1);
      const nextSendVer = (lastSendVer?.versionNumber ?? 0) + 1;
      await db.insert(estimateVersions).values({
        estimateId: input.id,
        versionNumber: nextSendVer,
        snapshot: sendSnap,
        trigger: "send",
        label: "Sent to client",
        contentHash: sendHash,
      });
    } catch (vErr) {
      console.error("[send version snapshot] non-fatal:", vErr);
    }
    // Mark as sent
    await db.update(estimates).set({ status: "sent", sentAt: new Date() }).where(eq(estimates.id, input.id));
    // ── Auto-create project on first proposal send ────────────────────────────
    try {
      const existingProjects = await db.select({ id: projects.id }).from(projects).where(
        e.leadId ? eq(projects.leadId, e.leadId) :
        e.clientId ? eq(projects.clientId, e.clientId!) :
        sql`FALSE`
      );
      if (existingProjects.length === 0) {
        let autoClientId: number | undefined = e.clientId ?? undefined;
        let autoLeadId: number | undefined = e.leadId ?? undefined;
        let projectName = e.title ?? clientName;
        let projectAddress: string | undefined;
        if (e.leadId) {
          const leadRow = await db.select().from(leads).where(eq(leads.id, e.leadId)).limit(1);
          if (leadRow[0]) {
            projectAddress = leadRow[0].address ?? undefined;
            projectName = e.title ?? `${leadRow[0].name} — ${leadRow[0].projectType ?? "Project"}`;
            if (!autoClientId && leadRow[0].email) {
              const existClient = await db.select({ id: clients.id }).from(clients).where(eq(clients.email, leadRow[0].email)).limit(1);
              if (existClient[0]) {
                autoClientId = existClient[0].id;
              } else {
                await db.insert(clients).values({ name: leadRow[0].name, email: leadRow[0].email, phone: leadRow[0].phone, address: leadRow[0].address });
                const [{ newCId }] = await db.select({ newCId: sql<number>`LAST_INSERT_ID()` }).from(clients).limit(1);
                autoClientId = newCId;
              }
            }
          }
        } else if (e.clientId) {
          const clientRow = await db.select().from(clients).where(eq(clients.id, e.clientId)).limit(1);
          projectAddress = clientRow[0]?.address ?? undefined;
          projectName = e.title ?? `${clientName} — Project`;
        }
        const palette = ["#D4A853","#6B8E6B","#7B9BB5","#C47B5A","#9B7BC4","#5AB5A8","#C45A7B","#8BB57B"];
        const allProj = await db.select({ id: projects.id }).from(projects);
        const color = palette[allProj.length % palette.length];
        await db.insert(projects).values({ leadId: autoLeadId, clientId: autoClientId, name: projectName, address: projectAddress, status: "planning", color });
      }
    } catch (projErr: any) {
      console.error("[Auto-Project] Failed (non-blocking):", projErr?.message ?? projErr);
    }
    // ── Auto-create tasks from proposal line items ────────────────────────────
    try {
      const projectRows2 = await db.select({ id: projects.id }).from(projects).where(
        e.leadId ? eq(projects.leadId, e.leadId) :
        e.clientId ? eq(projects.clientId, e.clientId!) :
        sql`FALSE`
      ).orderBy(desc(projects.id)).limit(1);
      if (projectRows2[0]) {
        const taskProjectId = projectRows2[0].id;
        const existingTasks = await db.select({ id: projectTasks.id }).from(projectTasks)
          .where(and(eq(projectTasks.projectId, taskProjectId), eq(projectTasks.estimateId, input.id))).limit(1);
        if (existingTasks.length === 0) {
          const lineItems = await db.select().from(estimateLineItems)
            .where(eq(estimateLineItems.estimateId, input.id))
            .orderBy(asc(estimateLineItems.sortOrder));
          if (lineItems.length > 0) {
            await db.insert(projectTasks).values(lineItems.map((li, idx) => ({
              projectId: taskProjectId,
              estimateId: input.id,
              estimateLineItemId: li.id,
              title: (li.description ?? `Task ${idx + 1}`).substring(0, 255),
              description: (li as any).notes ?? undefined,
              category: li.category ?? undefined,
              quantity: li.quantity ? String(li.quantity) : undefined,
              unit: li.unit ?? undefined,
              status: "pending" as const,
              sortOrder: li.sortOrder ?? idx,
            })));
          }
        }
      }
    } catch (taskErr: any) {
      console.error("[Auto-Tasks] Failed (non-blocking):", taskErr?.message ?? taskErr);
    }
    // ─────────────────────────────────────────────────────────────────────────
    return { ok: true, emailSent: emailResult.ok, smsSent: smsResult.ok, emailError: emailResult.error, smsError: smsResult.error };
  }),

  // ── Generate / refresh proposal PDF on demand ────────────────────────────────
  generatePdf: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [e] = await db.select().from(estimates).where(eq(estimates.id, input.id)).limit(1);
    if (!e) throw new TRPCError({ code: "NOT_FOUND" });

    // Resolve client info
    let clientName = "Client", clientEmail = "", clientPhone = "", clientAddress: string | undefined;
    if (e.clientId) {
      const [cl] = await db.select().from(clients).where(eq(clients.id, e.clientId)).limit(1);
      clientName = cl?.name ?? "Client";
      clientEmail = cl?.email ?? "";
      clientPhone = cl?.phone ?? "";
      clientAddress = cl?.address ?? undefined;
    } else if (e.leadId) {
      const [lead] = await db.select().from(leads).where(eq(leads.id, e.leadId)).limit(1);
      clientName = lead?.name ?? "Client";
      clientEmail = lead?.email ?? "";
      clientPhone = lead?.phone ?? "";
      clientAddress = lead?.address ?? undefined;
    }

    // Fetch current line items from DB
    const lineItems = await db.select().from(estimateLineItems)
      .where(eq(estimateLineItems.estimateId, e.id))
      .orderBy(estimateLineItems.sortOrder);
    // Pre-fetch product thumbnails for line items that have an imageUrl
    const lineItemsWithImages = await Promise.all(lineItems.map(async li => {
      let imageBuffer: Buffer | null = null;
      if (li.imageUrl) {
        try {
          const imgRes = await fetch(li.imageUrl, { signal: AbortSignal.timeout(5000) });
          if (imgRes.ok) imageBuffer = Buffer.from(await imgRes.arrayBuffer());
        } catch { /* skip if image fetch fails */ }
      }
      return { ...li, imageBuffer };
    }));

    const { generateProposalPdf } = await import("./proposalPdf");
    const { storagePut } = await import("./storage");

    // Fetch client-visible photo attachments for this proposal
    const attachmentRows = await db
      .select()
      .from(proposalAttachments)
      .where(and(eq(proposalAttachments.estimateId, e.id), eq(proposalAttachments.clientVisible as any, 1)))
      .orderBy(asc(proposalAttachments.sortOrder), asc(proposalAttachments.createdAt));

    // Download each photo as a buffer (skip on error) — Node 22 has native fetch
    const photoAttachments: { buffer: Buffer; fileName: string | null }[] = [];
    for (const att of attachmentRows) {
      try {
        const resp = await fetch(att.fileUrl);
        const buf = Buffer.from(await resp.arrayBuffer());
        photoAttachments.push({ buffer: buf, fileName: att.fileName ?? null });
      } catch {
        // Skip photos that fail to download
      }
    }

    const pdfBuffer = await generateProposalPdf({
      estimateNumber: e.estimateNumber ?? `PROP-${e.id}`,
      title: e.title ?? "Renovation Proposal",
      clientName,
      clientEmail: clientEmail || undefined,
      clientPhone: clientPhone || undefined,
      clientAddress,
      notes: e.notes ?? undefined,
      validUntil: e.validUntil ?? null,
      createdAt: e.createdAt ?? null,
      subtotal: parseFloat(String(e.subtotal ?? 0)),
      taxRate: parseFloat(String(e.taxRate ?? 0)),
      taxAmount: parseFloat(String(e.taxAmount ?? 0)),
      depositPercent: parseFloat(String(e.depositPercent ?? 50)),
      depositAmount: parseFloat(String(e.depositAmount ?? 0)),
      total: parseFloat(String(e.total ?? 0)),
      showPrices: !e.hidePrices,  // hidePrices=0 means show prices; hidePrices=1 means hide
      lineItems: lineItemsWithImages.map(li => ({
        task: li.task,
        description: li.description,
        category: li.category,
        quantity: li.quantity,
        unit: li.unit,
        unitCost: li.unitCost,
        markupPercent: li.markupPercent,
        showMarkup: li.showMarkup,
        imageUrl: li.imageUrl,
        productUrl: li.productUrl,
        productSource: li.productSource,
        imageBuffer: li.imageBuffer,
      })),
      photoAttachments: photoAttachments.length > 0 ? photoAttachments : undefined,
    });

    const fileKey = `proposals/${e.estimateNumber ?? `prop-${e.id}`}-download-${Date.now()}.pdf`;
    const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");
    // Also update the stored pdfUrl so the next open is fast
    await db.update(estimates).set({ pdfUrl: url, pdfKey: fileKey }).where(eq(estimates.id, e.id));
    return { url };
  }),

  // Approve from client portal
  approveFromPortal: publicProcedure.input(z.object({
    id: z.number(),
    token: z.string().optional(),
    signatureDataUrl: z.string().optional(),   // base64 PNG data URL from canvas
    signerName: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const signedAt = new Date();
    // Capture signer IP from request headers
    const req = (ctx as any).req;
    const signerIp = req?.headers?.["x-forwarded-for"]?.split(",")?.[0]?.trim()
      ?? req?.socket?.remoteAddress
      ?? "unknown";

    // Fetch estimate + client info
    const [est] = await db.select().from(estimates).where(eq(estimates.id, input.id)).limit(1);
    if (!est) throw new TRPCError({ code: "NOT_FOUND" });

    let clientEmail = "";
    let clientName = "Client";
    let clientPhone = "";
    let clientAddress = "";
    if (est.clientId) {
      const [cl] = await db.select().from(clients).where(eq(clients.id, est.clientId)).limit(1);
      clientEmail = cl?.email ?? "";
      clientName = cl?.name ?? "Client";
      clientPhone = cl?.phone ?? "";
      clientAddress = cl?.address ?? "";
    } else if (est.leadId) {
      const [lead] = await db.select().from(leads).where(eq(leads.id, est.leadId)).limit(1);
      clientEmail = lead?.email ?? "";
      clientName = lead?.name ?? "Client";
      clientPhone = lead?.phone ?? "";
      clientAddress = lead?.address ?? "";
    }

    // ── Generate signed PDF (stamp signature onto proposal) ──────────────────
    let signedPdfUrl: string | undefined;
    let signedPdfKey: string | undefined;
    let signedPdfBuffer: Buffer | undefined;
    try {
      const { generateProposalPdf } = await import("./proposalPdf");
      const { storagePut } = await import("./storage");
      const lineItems = await db.select().from(estimateLineItems)
        .where(eq(estimateLineItems.estimateId, est.id))
        .orderBy(estimateLineItems.sortOrder);
      // Pre-fetch product thumbnails for line items that have an imageUrl
      const lineItemsWithImages = await Promise.all(lineItems.map(async li => {
        let imageBuffer: Buffer | null = null;
        if (li.imageUrl) {
          try {
            const imgRes = await fetch(li.imageUrl, { signal: AbortSignal.timeout(5000) });
            if (imgRes.ok) imageBuffer = Buffer.from(await imgRes.arrayBuffer());
          } catch { /* skip if image fetch fails */ }
        }
        return { ...li, imageBuffer };
      }));

      signedPdfBuffer = await generateProposalPdf({
        estimateNumber: est.estimateNumber ?? `PROP-${est.id}`,
        title: est.title ?? "Renovation Proposal",
        clientName,
        clientEmail: clientEmail || undefined,
        clientPhone: clientPhone || undefined,
        clientAddress: clientAddress || undefined,
        notes: est.notes ?? undefined,
        validUntil: est.validUntil ?? null,
        createdAt: est.createdAt ?? null,
        subtotal: parseFloat(String(est.subtotal ?? 0)),
        taxRate: parseFloat(String(est.taxRate ?? 0)),
        taxAmount: parseFloat(String(est.taxAmount ?? 0)),
        depositPercent: parseFloat(String(est.depositPercent ?? 50)),
        depositAmount: parseFloat(String(est.depositAmount ?? 0)),
        total: parseFloat(String(est.total ?? 0)),
        lineItems: lineItemsWithImages.map(li => ({
          task: li.task,
          description: li.description,
          category: li.category,
          quantity: li.quantity,
          unitCost: li.unitCost,
          markupPercent: li.markupPercent,
          showMarkup: li.showMarkup,
          imageUrl: li.imageUrl,
          productUrl: li.productUrl,
          productSource: li.productSource,
          imageBuffer: li.imageBuffer,
        })),
        showPrices: !est.hidePrices,  // respect the Show Prices to Client toggle on signed copy
        // Pass signature data for stamping
        signatureDataUrl: input.signatureDataUrl,
        signerName: input.signerName ?? clientName,
        signedAt,
      } as any);

      const fileKey = `proposals/signed/${est.estimateNumber ?? `prop-${est.id}`}-signed-${Date.now()}.pdf`;
      const stored = await storagePut(fileKey, signedPdfBuffer, "application/pdf");
      signedPdfUrl = stored.url;
      signedPdfKey = stored.key;
    } catch (pdfErr: any) {
      console.error("[PDF] Signed PDF generation failed:", pdfErr?.message ?? pdfErr);
    }

    // ── Save approval + signature to DB ──────────────────────────────────────
    await db.update(estimates).set({
      status: "approved",
      approvedAt: signedAt,
      signatureDataUrl: input.signatureDataUrl ?? null,
      signerName: input.signerName ?? null,
      signerIp,
      signedAt,
      signedPdfUrl: signedPdfUrl ?? null,
      signedPdfKey: signedPdfKey ?? null,
    }).where(eq(estimates.id, input.id));

    // ── Email signed PDF to client ────────────────────────────────────────────
    if (clientEmail && signedPdfBuffer) {
      try {
        const { sendSignedProposalEmail } = await import("./email");
        await sendSignedProposalEmail({
          toEmail: clientEmail,
          toName: clientName,
          proposalNumber: est.estimateNumber ?? `PROP-${est.id}`,
          proposalTitle: est.title ?? "Renovation Proposal",
          totalAmount: parseFloat(String(est.total ?? 0)),
          signedAt,
          signedPdfBuffer,
        });
      } catch (emailErr: any) {
        console.error("[Email] Signed proposal email failed:", emailErr?.message);
      }
    }

    // ── Google Chat notification to Chad ─────────────────────────────────────
    const chatWebhookUrl = process.env.GOOGLE_CHAT_WEBHOOK_URL;
    if (chatWebhookUrl) {
      try {
        const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
        const chatMsg = {
          text: `🎉 *Proposal Approved & Signed!*\n\n*Client:* ${clientName}\n*Proposal:* ${est.title ?? ""} (${est.estimateNumber ?? ""})\n*Total:* ${fmt.format(parseFloat(String(est.total ?? 0)))}\n*Signed by:* ${input.signerName ?? clientName}\n*Signed at:* ${signedAt.toLocaleString("en-US", { timeZone: "America/New_York" })} ET${signedPdfUrl ? `\n*Signed PDF:* ${signedPdfUrl}` : ""}`,
        };
        await fetch(chatWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(chatMsg),
        });
      } catch (chatErr: any) {
        console.error("[GoogleChat] Notification failed:", chatErr?.message);
      }
    }

    // ── Manus owner notification (fallback / always) ──────────────────────────
    const { notifyOwner } = await import("./_core/notification");
    await notifyOwner({
      title: "Proposal Approved & Signed!",
      content: `${clientName} signed proposal: ${est.title ?? ""} (${est.estimateNumber ?? ""}) — Total: $${parseFloat(String(est.total ?? 0)).toFixed(2)}${signedPdfUrl ? `\nSigned PDF: ${signedPdfUrl}` : ""}`,
    });

    return { success: true, signedPdfUrl: signedPdfUrl ?? null };
  }),

  requestDiscussion: publicProcedure.input(z.object({
    id: z.number(),
    message: z.string(),
    clientName: z.string().optional(),
    attachmentUrls: z.array(z.string()).optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Save discussion note and timestamp on the estimate
    await db.update(estimates).set({
      discussionAt: new Date(),
      clientDiscussionNote: input.message,
    }).where(eq(estimates.id, input.id));
    // Fetch estimate details for the email
    const [est] = await db.select().from(estimates).where(eq(estimates.id, input.id)).limit(1);
    // Log message in messages table for client thread
    const leadId = est?.leadId ?? undefined;
    if (leadId) {
      await db.insert(messages).values({
        leadId,
        threadType: "client",
        direction: "inbound",
        channel: "portal",
        fromName: input.clientName ?? "Client",
        body: `[PROPOSAL DISCUSSION REQUEST]\nProposal: ${est?.title ?? ""}\n\n${input.message}`,
        status: "delivered",
      });
    }
    // Save any uploaded file URLs as message attachments
    if (input.attachmentUrls?.length && leadId) {
      for (const url of input.attachmentUrls) {
        await db.insert(messages).values({
          leadId,
          threadType: "client",
          direction: "inbound",
          channel: "portal",
          fromName: input.clientName ?? "Client",
          body: `[ATTACHMENT] ${url}`,
          status: "delivered",
        });
      }
    }
    // Email Chad at chad@cpenterprisessc.com
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.default.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          user: "chad@cpenterprisessc.com",
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      });
      const attachmentList = input.attachmentUrls?.length
        ? `<p><strong>Attachments:</strong></p><ul>${input.attachmentUrls.map(u => `<li><a href="${u}">${u}</a></li>`).join("")}</ul>`
        : "";
      await transporter.sendMail({
        from: `"Kitchens Plus CRM" <chad@cpenterprisessc.com>`,
        to: "chad@cpenterprisessc.com",
        subject: `🔴 Client Discussion Request — ${est?.title ?? "Proposal"} (${est?.estimateNumber ?? `#${input.id}`})`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#BF9A3B;">Client Discussion Request</h2>
            <p><strong>Proposal:</strong> ${est?.title ?? ""} &nbsp;|&nbsp; <strong>Ref:</strong> ${est?.estimateNumber ?? `#${input.id}`}</p>
            <p><strong>From:</strong> ${input.clientName ?? "Client"}</p>
            <hr style="border-color:#eee;"/>
            <h3 style="color:#333;">Client's Message:</h3>
            <blockquote style="border-left:4px solid #BF9A3B;padding-left:12px;color:#444;">${input.message.replace(/\n/g, "<br/>")}</blockquote>
            ${attachmentList}
            <hr style="border-color:#eee;"/>
            <p style="color:#888;font-size:12px;">Sent from Kitchens Plus Upstate CRM</p>
          </div>
        `,
        text: `Client Discussion Request\n\nProposal: ${est?.title ?? ""}\nRef: ${est?.estimateNumber ?? `#${input.id}`}\nFrom: ${input.clientName ?? "Client"}\n\nMessage:\n${input.message}${input.attachmentUrls?.length ? "\n\nAttachments:\n" + input.attachmentUrls.join("\n") : ""}`,
      });
    } catch (emailErr: any) {
      console.error("[Discussion Email] Failed:", emailErr?.message ?? emailErr);
    }
    // Notify owner via push notification
    const { notifyOwner } = await import("./_core/notification");
    await notifyOwner({
      title: "🔴 Client Discussion Request",
      content: `${input.clientName ?? "Client"} has questions about proposal: ${est?.title ?? ""} (${est?.estimateNumber ?? ""})`,
    });
    return { success: true };
  }),

  // Scrape product metadata (og:title, og:image, price) from a supplier product URL
  scrapeProduct: adminProcedure.input(z.object({
    url: z.string().url(),
  })).mutation(async ({ input }) => {
    try {
      const { scrapeProductUrl } = await import("./productScraper.js");
      return await scrapeProductUrl(input.url);
    } catch (err: any) {
      const msg: string = err?.message ?? "Unknown error";
      throw new TRPCError({ code: "BAD_REQUEST", message: msg });
    }
  }),

  /**
   * parseProductHtml — accepts raw HTML sent from the client browser (bypasses bot protection)
   * and extracts product metadata. Used for Home Depot and other bot-protected sites.
   */
  parseProductHtml: adminProcedure.input(z.object({
    html: z.string().max(2_000_000),
    sourceUrl: z.string().url(),
  })).mutation(async ({ input }) => {
    const { parseProductFromHtml } = await import("./productScraper.js");
    return parseProductFromHtml(input.html, input.sourceUrl);
  }),
  // ── Contractor verbal approval — owner marks proposal approved on client's behalf ──
  contractorApprove: adminProcedure.input(z.object({
    id: z.number(),
    origin: z.string(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const approvedAt = new Date();

    // Fetch estimate
    const [est] = await db.select().from(estimates).where(eq(estimates.id, input.id)).limit(1);
    if (!est) throw new TRPCError({ code: "NOT_FOUND" });
    if (est.status === "approved") throw new TRPCError({ code: "BAD_REQUEST", message: "Proposal is already approved." });

    // Resolve client info
    let clientEmail = "";
    let clientName = "Client";
    let clientPhone = "";
    if (est.clientId) {
      const [cl] = await db.select().from(clients).where(eq(clients.id, est.clientId)).limit(1);
      clientEmail = cl?.email ?? "";
      clientName = cl?.name ?? "Client";
      clientPhone = cl?.phone ?? "";
    } else if (est.leadId) {
      const [lead] = await db.select().from(leads).where(eq(leads.id, est.leadId)).limit(1);
      clientEmail = lead?.email ?? "";
      clientName = lead?.name ?? "Client";
      clientPhone = lead?.phone ?? "";
    }

    // Mark proposal approved
    await db.update(estimates).set({
      status: "approved",
      approvedAt,
    }).where(eq(estimates.id, input.id));

    const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
    const totalFormatted = fmt.format(parseFloat(String(est.total ?? 0)));
    const portalUrl = `${input.origin}/client/project`;

    // ── Send approval confirmation email to client ───────────────────────────
    let emailSent = false;
    let emailError: string | undefined;
    if (clientEmail) {
      try {
        const { sendProposalApprovedEmail } = await import("./email");
        await sendProposalApprovedEmail({
          toEmail: clientEmail,
          toName: clientName,
          proposalNumber: est.estimateNumber ?? `PROP-${est.id}`,
          proposalTitle: est.title ?? "Renovation Proposal",
          totalAmount: parseFloat(String(est.total ?? 0)),
          approvedAt,
          portalUrl,
        });
        emailSent = true;
      } catch (emailErr: any) {
        emailError = emailErr?.message ?? "Email failed";
        console.error("[ContractorApprove] Email failed:", emailError);
      }
    }

    // ── Send approval SMS to client ──────────────────────────────────────────
    let smsSent = false;
    let smsError: string | undefined;
    if (clientPhone) {
      try {
        const smsMsg = `Hi ${clientName}, this is Kitchens Plus Upstate. Your proposal has been approved — thank you, ${clientName}! Project total: ${totalFormatted}. We will be in touch shortly with your schedule and next steps. We appreciate your business!`;
        const smsResult = await sendSms(clientPhone, smsMsg);
        smsSent = smsResult.success;
        if (!smsResult.success) smsError = smsResult.error;
      } catch (smsErr: any) {
        smsError = smsErr?.message ?? "SMS failed";
        console.error("[ContractorApprove] SMS failed:", smsError);
      }
    }

    // ── Ensure project exists (auto-create if needed) then seed tasks ─────────
    try {
      const existingProjects = await db.select({ id: projects.id }).from(projects).where(
        est.leadId ? eq(projects.leadId, est.leadId) :
        est.clientId ? eq(projects.clientId, est.clientId!) :
        sql`FALSE`
      );
      let projectId: number | undefined;
      if (existingProjects.length === 0) {
        let autoClientId: number | undefined = est.clientId ?? undefined;
        let autoLeadId: number | undefined = est.leadId ?? undefined;
        let projectName = est.title ?? clientName;
        let projectAddress: string | undefined;
        if (est.leadId) {
          const [leadRow] = await db.select().from(leads).where(eq(leads.id, est.leadId)).limit(1);
          if (leadRow) {
            projectAddress = leadRow.address ?? undefined;
            projectName = est.title ?? `${leadRow.name} — ${leadRow.projectType ?? "Project"}`;
          }
        } else if (est.clientId) {
          const [clientRow] = await db.select().from(clients).where(eq(clients.id, est.clientId)).limit(1);
          projectAddress = clientRow?.address ?? undefined;
          projectName = est.title ?? `${clientName} — Project`;
        }
        const palette = ["#D4A853","#6B8E6B","#7B9BB5","#C47B5A","#9B7BC4","#5AB5A8","#C45A7B","#8BB57B"];
        const allProj = await db.select({ id: projects.id }).from(projects);
        const color = palette[allProj.length % palette.length];
        await db.insert(projects).values({ leadId: autoLeadId, clientId: autoClientId, name: projectName, address: projectAddress, status: "planning", color });
        const [{ newProjId }] = await db.select({ newProjId: sql<number>`LAST_INSERT_ID()` }).from(projects).limit(1);
        projectId = newProjId;
      } else {
        projectId = existingProjects[0].id;
      }

      // Seed one task per line item as "In-House Work" (skip duplicates)
      if (projectId) {
        const lineItems = await db.select().from(estimateLineItems)
          .where(eq(estimateLineItems.estimateId, input.id))
          .orderBy(estimateLineItems.sortOrder);
        for (let i = 0; i < lineItems.length; i++) {
          const li = lineItems[i];
          const taskTitle = li.task ?? li.description ?? `Line Item ${i + 1}`;
          const existingTask = li.id
            ? await db.select({ id: projectTasks.id }).from(projectTasks)
                .where(eq(projectTasks.estimateLineItemId, li.id)).limit(1)
            : [];
          if (existingTask.length > 0) continue;
          const noteParts: string[] = [];
          if (li.description && li.description !== taskTitle) noteParts.push(li.description);
          if (li.quantity && parseFloat(String(li.quantity)) !== 1) noteParts.push(`Qty: ${li.quantity}${li.unit ? " " + li.unit : ""}`);
          if (li.unitPrice && parseFloat(String(li.unitPrice)) > 0) {
            const fmtCur = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
            noteParts.push(`Unit Price: ${fmtCur.format(parseFloat(String(li.unitPrice)))}`);
          }
          await db.insert(projectTasks).values({
            projectId,
            estimateId: input.id,
            estimateLineItemId: li.id,
            title: taskTitle.slice(0, 255),
            description: li.description ?? undefined,
            category: "In-House Work",
            quantity: li.quantity ? String(li.quantity) : undefined,
            unit: li.unit ?? undefined,
            notes: noteParts.length > 0 ? noteParts.join(" | ") : undefined,
            status: "pending",
            sortOrder: i,
          });
        }
      }
    } catch (projErr: any) {
      console.error("[ContractorApprove] Auto-project/task seeding failed (non-blocking):", projErr?.message);
    }

    // ── Owner notification ───────────────────────────────────────────────────
    const { notifyOwner } = await import("./_core/notification");
    await notifyOwner({
      title: "Proposal Approved (Verbal)",
      content: `${clientName} verbally approved proposal: ${est.title ?? ""} (${est.estimateNumber ?? ""}) — Total: ${totalFormatted}. Marked approved by contractor.`,
    }).catch(() => {});

    return { success: true, emailSent, smsSent, emailError, smsError };
  }),

  // Resend approval confirmation email for an already-approved proposal
  resendApprovalEmail: adminProcedure.input(z.object({
    id: z.number(),
    origin: z.string(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [est] = await db.select().from(estimates).where(eq(estimates.id, input.id)).limit(1);
    if (!est) throw new TRPCError({ code: "NOT_FOUND" });
    if (est.status !== "approved") throw new TRPCError({ code: "BAD_REQUEST", message: "Proposal is not approved yet." });

    let clientEmail = "";
    let clientName = "Client";
    let clientPhone = "";
    if (est.clientId) {
      const [cl] = await db.select().from(clients).where(eq(clients.id, est.clientId)).limit(1);
      clientEmail = cl?.email ?? "";
      clientName = cl?.name ?? "Client";
      clientPhone = cl?.phone ?? "";
    } else if (est.leadId) {
      const [lead] = await db.select().from(leads).where(eq(leads.id, est.leadId)).limit(1);
      clientEmail = lead?.email ?? "";
      clientName = lead?.name ?? "Client";
      clientPhone = lead?.phone ?? "";
    }

    if (!clientEmail) throw new TRPCError({ code: "BAD_REQUEST", message: "No email address on file for this client." });

    const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
    const portalUrl = `${input.origin}/client/project`;
    const { sendProposalApprovedEmail } = await import("./email");
    const result = await sendProposalApprovedEmail({
      toEmail: clientEmail,
      toName: clientName,
      proposalNumber: est.estimateNumber ?? `PROP-${est.id}`,
      proposalTitle: est.title ?? "Renovation Proposal",
      totalAmount: parseFloat(String(est.total ?? 0)),
      approvedAt: est.approvedAt ?? new Date(),
      portalUrl,
    });

    // Also resend SMS if phone on file
    let smsSent = false;
    if (clientPhone) {
      try {
        const totalFormatted = fmt.format(parseFloat(String(est.total ?? 0)));
        const smsMsg = `Hi ${clientName}, this is Kitchens Plus Upstate. Your proposal has been approved — thank you, ${clientName}! Project total: ${totalFormatted}. We will be in touch shortly with your schedule and next steps. We appreciate your business!`;
        const smsResult = await sendSms(clientPhone, smsMsg);
        smsSent = smsResult.success;
      } catch {}
    }

    return { success: result.ok, emailSent: result.ok, smsSent, emailError: result.error };
  }),

  convertProposalToProject: adminProcedure.input(z.object({
    estimateId: z.number(),
    projectName: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // Load the estimate with its line items
    const [est] = await db.select().from(estimates).where(eq(estimates.id, input.estimateId)).limit(1);
    if (!est) throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });

    // Each proposal always creates its own brand-new project
    // Resolve or create client record
    let clientId: number | undefined;
    let leadName = "Client";
    let leadAddress: string | undefined;
    let leadProjectType: string | undefined;
    if (est.leadId) {
      const [lead] = await db.select().from(leads).where(eq(leads.id, est.leadId)).limit(1);
      if (lead) {
        leadName = lead.name ?? "Client";
        leadAddress = lead.address ?? undefined;
        leadProjectType = lead.projectType ?? undefined;
        if (lead.email) {
          const [existingClient] = await db.select({ id: clients.id }).from(clients)
            .where(eq(clients.email, lead.email)).limit(1);
          if (existingClient) {
            clientId = existingClient.id;
          } else {
            await db.insert(clients).values({
              name: lead.name,
              email: lead.email,
              phone: lead.phone,
              address: lead.address,
            });
            const [{ newClientId }] = await db.select({ newClientId: sql<number>`LAST_INSERT_ID()` }).from(clients).limit(1);
            clientId = newClientId;
          }
        }
      }
    } else if (est.clientId) {
      clientId = est.clientId;
      const [cl] = await db.select().from(clients).where(eq(clients.id, est.clientId)).limit(1);
      if (cl) {
        leadName = cl.name ?? "Client";
        leadAddress = cl.address ?? undefined;
      }
    }

    // Always create a fresh project for this proposal
    const palette = ["#D4A853","#6B8E6B","#7B9BB5","#C47B5A","#9B7BC4","#5AB5A8","#C45A7B","#8BB57B"];
    const allProjects = await db.select({ id: projects.id }).from(projects);
    const color = palette[allProjects.length % palette.length];
    const projectName = input.projectName ?? est.title ?? `${leadName} — ${leadProjectType ?? "Project"}`;
    await db.insert(projects).values({
      leadId: est.leadId ?? undefined,
      clientId,
      name: projectName,
      projectType: leadProjectType,
      address: leadAddress,
      status: "planning",
      color,
      estimateId: input.estimateId,
    });
    const [{ newProjectId }] = await db.select({ newProjectId: sql<number>`LAST_INSERT_ID()` }).from(projects).limit(1);
    const projectId = newProjectId;
    // Mark lead as won if not already
    if (est.leadId) {
      await db.update(leads).set({ status: "won" }).where(eq(leads.id, est.leadId));
    }

    // Seed line items as In-House Work tasks (skip duplicates by estimateLineItemId)
    const lineItems = await db.select().from(estimateLineItems)
      .where(eq(estimateLineItems.estimateId, input.estimateId));
    const existingTasks = await db.select({ srcId: projectTasks.estimateLineItemId })
      .from(projectTasks).where(eq(projectTasks.projectId, projectId));
    const seededIds = new Set(existingTasks.map(t => t.srcId).filter(Boolean));

    let tasksCreated = 0;
    for (const li of lineItems) {
      if (seededIds.has(li.id)) continue;
      const title = (li as any).task || li.description || `Line Item ${li.sortOrder ?? tasksCreated + 1}`;
      const notes = [
        li.description && (li as any).task ? li.description : null,
        li.quantity ? `Qty: ${li.quantity} ${(li as any).unit ?? ""}`.trim() : null,
        li.unitCost ? `Unit Price: $${parseFloat(String(li.unitCost)).toFixed(2)}` : null,
      ].filter(Boolean).join(" | ");
      await db.insert(projectTasks).values({
        projectId,
        title,
        category: "In-House Work",
        status: "pending",
        notes: notes || undefined,
        estimateLineItemId: li.id,
        sortOrder: li.sortOrder ?? tasksCreated,
      });
      tasksCreated++;
    }

    return { projectId, tasksCreated, isExisting: false };
  }),

  // ─── AI Proposal Builder ────────────────────────────────────────────────────
  aiSuggestLineItems: adminProcedure.input(z.object({
    userMessage: z.string(),
    proposalTitle: z.string().optional(),
    existingItems: z.array(z.object({
      task: z.string().optional(),
      description: z.string().optional(),
      quantity: z.string().optional(),
      unitPrice: z.string().optional(),
      category: z.string().optional(),
    })).optional(),
    conversationHistory: z.array(z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })).optional(),
  })).mutation(async ({ input }) => {
    // ── Fetch ALL historical pricing data to feed into the AI prompt ──────────
    let historicalPricingRef = "";
    try {
      const db = await getDb();
      if (db) {
        const histRows = await db
          .select({
            task: estimateLineItems.task,
            unitPrice: estimateLineItems.unitPrice,
            unit: estimateLineItems.unit,
            category: estimateLineItems.category,
            quantity: estimateLineItems.quantity,
          })
          .from(estimateLineItems)
          .innerJoin(estimates, eq(estimateLineItems.estimateId, estimates.id))
          .where(
            and(
              sql`CAST(${estimateLineItems.unitPrice} AS DECIMAL) > 0`,
              or(
                eq(estimates.status, "sent"),
                eq(estimates.status, "approved"),
                eq(estimates.status, "viewed"),
                eq(estimates.status, "draft"),
              )
            )
          )
          .orderBy(desc(estimateLineItems.createdAt))
          .limit(100);

        if (histRows.length > 0) {
          // Group by task name (lowercased) and compute avg price
          const grouped: Record<string, { prices: number[]; unit: string; category: string; qty: number }> = {};
          for (const row of histRows) {
            const key = (row.task ?? "").toLowerCase().trim();
            if (!key) continue;
            const price = parseFloat(row.unitPrice ?? "0");
            if (price <= 0) continue;
            if (!grouped[key]) {
              grouped[key] = { prices: [], unit: row.unit ?? "LS", category: row.category ?? "labor", qty: parseFloat(row.quantity ?? "1") };
            }
            grouped[key].prices.push(price);
          }
          const lines = Object.entries(grouped).map(([task, data]) => {
            const avg = data.prices.reduce((a, b) => a + b, 0) / data.prices.length;
            const min = Math.min(...data.prices);
            const max = Math.max(...data.prices);
            return `  - "${task}" | avg $${avg.toFixed(0)} (range $${min.toFixed(0)}–$${max.toFixed(0)}) | ${data.unit || "LS"} | ${data.category} | typical qty: ${data.qty}`;
          });
          historicalPricingRef = `\n\nHISTORICAL PRICING FROM PAST PROPOSALS (use these as your primary pricing reference):\n${lines.join("\n")}`;
        }
      }
    } catch { /* non-fatal — proceed without historical data */ }

    const existingItemsSummary = (input.existingItems ?? []).length > 0
      ? `\n\nCurrent proposal line items:\n${(input.existingItems ?? []).map((item, i) =>
          `${i + 1}. ${item.task || '(no task)'} — ${item.description || ''} | Qty: ${item.quantity || '1'} | Price: $${item.unitPrice || '0'} | Category: ${item.category || 'labor'}`
        ).join('\n')}`
      : "\n\nNo line items yet in this proposal.";

    const systemPrompt = `You are a senior construction estimator for Kitchens Plus Upstate, a luxury renovation company in upstate South Carolina. You think like a professional estimator, a construction manager, and a business owner. Your job is to take a contractor's natural-language scope description and produce structured, priced proposal line items.

CRITICAL RULES:
1. ALWAYS split labor and material into SEPARATE line items. Example: "tile shower" → one item for "Shower Tile Material" (category: material) and one for "Shower Tile Installation Labor" (category: labor).
2. Demo/removal is always its own line item (category: labor).
3. Use clear, professional task names a homeowner would understand (e.g., "Frameless Glass Shower Door Supply & Install", "Quartz Countertop Fabrication & Install").
4. Write concise but specific descriptions (1-2 sentences). Include specs when the user mentions them (color, style, brand, dimensions).
5. Use appropriate units: LF (linear feet), SF (square feet), EA (each), HR (hours), LS (lump sum).
6. Categories: "material", "labor", "subcontractor", "permit", "other".
7. If the user mentions a specific product or brand, include it in the task name.
8. For follow-up messages, consider existing items and add/modify accordingly. Return ONLY new or changed items.
9. When the scope is vague (e.g., "full bathroom"), break it into the standard trades: demo, rough plumbing, rough electrical, drywall/patch, tile, fixtures, paint, trim, final clean.
10. Keep the assistantMessage brief and practical — confirm what you built, flag anything you assumed or left out, and note which prices are estimates vs. confirmed.

PRICING RULES (CRITICAL — you are an estimator, not a task lister):
- You MUST provide a unitPrice for EVERY line item. Never leave unitPrice as empty string.
- Use the HISTORICAL PRICING DATA below as your primary reference. If a task matches or is similar to a historical item, use that price range.
- For tasks without historical data, use your knowledge of luxury renovation pricing in the Southeast US market (2024-2026 rates).
- Typical ranges for common trades (luxury tier, South Carolina):
  * Bathroom demo: $2,000–$3,500 LS
  * Rough plumbing: $2,000–$4,000 LS
  * Rough electrical: $1,500–$3,000 LS
  * Tile labor: $12–$25/SF or $1,000–$2,500 LS for a standard bathroom
  * Tile material (mid-luxury): $8–$20/SF
  * Custom cabinetry: $300–$500/LF or per-unit pricing
  * Quartz countertops (installed): $75–$125/SF
  * Paint (interior): $3–$5/SF or $400–$800 per room
  * Frameless glass shower door: $1,200–$2,500 EA
  * Plumbing fixtures (mid-luxury): $200–$800 EA
  * Drywall repair/patch: $500–$1,500 LS
  * Trim/finish carpentry: $500–$2,000 LS
- When you estimate a price, use the MIDDLE of the range unless the user specifies luxury/budget.
- Flag in the assistantMessage if any prices are rough estimates that need contractor review.

This is a luxury renovation company. Descriptions should reflect premium quality without being flowery.${historicalPricingRef}${existingItemsSummary}`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...(input.conversationHistory ?? []),
      { role: "user", content: input.userMessage },
    ];

    const result = await invokeLLM({
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "proposal_line_items",
          strict: true,
          schema: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    task: { type: "string", description: "Short task/item name (max 80 chars)" },
                    description: { type: "string", description: "Detailed description of the work or material" },
                    quantity: { type: "string", description: "Numeric quantity as string, e.g. '20', '1', '150'" },
                    unit: { type: "string", description: "Unit of measure: LF, SF, EA, HR, LS, etc." },
                    unitPrice: { type: "string", description: "Unit price as string with 2 decimals, e.g. '450.00', '2500.00'. MUST always provide a price — never empty." },
                    category: { type: "string", description: "One of: material, labor, subcontractor, permit, other" },
                  },
                  required: ["task", "description", "quantity", "unit", "unitPrice", "category"],
                  additionalProperties: false,
                },
              },
              assistantMessage: { type: "string", description: "Brief confirmation of what was added. Flag which prices are estimates vs. from historical data. Note anything assumed or left out." },
            },
            required: ["items", "assistantMessage"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = result?.choices?.[0]?.message?.content;
    if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI returned no response" });
    const parsed = JSON.parse(content);
    return {
      items: parsed.items as Array<{
        task: string;
        description: string;
        quantity: string;
        unit: string;
        unitPrice: string;
        category: string;
      }>,
      assistantMessage: parsed.assistantMessage as string,
    };
  }),

  // ─── Historical pricing lookup ─────────────────────────────────────────────
  getHistoricalPricing: adminProcedure.input(z.object({
    taskName: z.string(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    // Normalize: lowercase, strip punctuation for fuzzy matching
    const normalized = input.taskName.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    if (!normalized) return null;
    // Fetch all non-draft line items with a real unit price > 0
    const rows = await db
      .select({
        task: estimateLineItems.task,
        unitPrice: estimateLineItems.unitPrice,
        unitCost: estimateLineItems.unitCost,
        unit: estimateLineItems.unit,
        category: estimateLineItems.category,
        createdAt: estimateLineItems.createdAt,
      })
      .from(estimateLineItems)
      .innerJoin(estimates, eq(estimateLineItems.estimateId, estimates.id))
      .where(
        and(
          sql`LOWER(${estimateLineItems.task}) LIKE ${`%${normalized.split(" ")[0]}%`}`,
          sql`CAST(${estimateLineItems.unitPrice} AS DECIMAL) > 0`,
          or(
            eq(estimates.status, "sent"),
            eq(estimates.status, "approved"),
            eq(estimates.status, "viewed"),
          )
        )
      )
      .orderBy(desc(estimateLineItems.createdAt))
      .limit(50);
    if (rows.length === 0) return null;
    // Calculate average and most recent price
    const prices = rows.map(r => parseFloat(r.unitPrice ?? "0")).filter(p => p > 0);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const lastRow = rows[0];
    return {
      avgUnitPrice: avgPrice.toFixed(2),
      lastUnitPrice: lastRow.unitPrice ?? "0",
      lastUnit: lastRow.unit ?? "",
      lastCategory: lastRow.category ?? "",
      matchCount: prices.length,
      sampleTask: lastRow.task ?? "",
    };
  }),

  // ─── Upload audio blob for transcription ────────────────────────────────────
  uploadAudio: adminProcedure.input(z.object({
    audioBase64: z.string(),
    mimeType: z.string().default("audio/webm"),
  })).mutation(async ({ input }) => {
    const buffer = Buffer.from(input.audioBase64, "base64");
    const ext = input.mimeType.includes("webm") ? "webm" : input.mimeType.includes("mp4") ? "m4a" : "webm";
    const key = `voice-recordings/${nanoid()}.${ext}`;
    const { url } = await storagePut(key, buffer, input.mimeType);
    return { url };
  }),

  // ─── Voice transcription ───────────────────────────────────────────────────
  transcribeVoice: adminProcedure.input(z.object({
    audioUrl: z.string(),
  })).mutation(async ({ input }) => {
    const result = await transcribeAudio({
      audioUrl: input.audioUrl,
      language: "en",
      prompt: "Kitchen remodeling scope of work, contractor proposal line items, materials and labor",
    });
    if ("error" in result) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error });
    }
    return { text: result.text };
  }),

  // ─── Single-call voice-to-line-items (base64 audio → transcribe → generate) ──
  voiceToLineItems: adminProcedure.input(z.object({
    audioBase64: z.string(),
    mimeType: z.string().default("audio/webm"),
    proposalTitle: z.string().optional(),
    existingItems: z.array(z.object({
      task: z.string().optional(),
      description: z.string().optional(),
      quantity: z.string().optional(),
      unitPrice: z.string().optional(),
      category: z.string().optional(),
    })).optional(),
    conversationHistory: z.array(z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })).optional(),
  })).mutation(async ({ input }) => {
    // ── Step 1: Convert base64 to buffer and transcribe directly ──────────────
    const audioBuffer = Buffer.from(input.audioBase64, "base64");
    if (audioBuffer.length === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Audio data is empty. Please try recording again." });
    }
    const sizeMB = audioBuffer.length / (1024 * 1024);
    if (sizeMB > 16) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Audio file is ${sizeMB.toFixed(1)}MB — maximum is 16MB. Try a shorter recording.` });
    }

    // Build FormData for Whisper API (no S3 upload needed)
    const mimeToExt: Record<string, string> = {
      "audio/webm": "webm", "audio/mp3": "mp3", "audio/mpeg": "mp3",
      "audio/wav": "wav", "audio/ogg": "ogg", "audio/m4a": "m4a", "audio/mp4": "m4a",
    };
    const ext = mimeToExt[input.mimeType] || "webm";
    const formData = new FormData();
    const audioBlob = new Blob([new Uint8Array(audioBuffer)], { type: input.mimeType });
    formData.append("file", audioBlob, `voice.${ext}`);
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    formData.append("prompt", "Kitchen remodeling scope of work, contractor proposal line items, materials and labor");

    const forgeUrl = process.env.BUILT_IN_FORGE_API_URL;
    const forgeKey = process.env.BUILT_IN_FORGE_API_KEY;
    if (!forgeUrl || !forgeKey) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Voice transcription service is not configured." });
    }
    const baseUrl = forgeUrl.endsWith("/") ? forgeUrl : `${forgeUrl}/`;
    const whisperUrl = new URL("v1/audio/transcriptions", baseUrl).toString();

    let transcript: string;
    try {
      const whisperRes = await fetch(whisperUrl, {
        method: "POST",
        headers: { authorization: `Bearer ${forgeKey}`, "Accept-Encoding": "identity" },
        body: formData,
      });
      if (!whisperRes.ok) {
        const errText = await whisperRes.text().catch(() => "");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Voice transcription failed (${whisperRes.status}). ${errText ? errText.slice(0, 200) : "Please try again."}`,
        });
      }
      const whisperData = await whisperRes.json() as { text?: string };
      if (!whisperData.text || whisperData.text.trim().length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No speech detected in the recording. Please speak clearly and try again." });
      }
      transcript = whisperData.text.trim();
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Voice transcription failed. ${err instanceof Error ? err.message : "Please check your microphone and try again."}`,
      });
    }

    // ── Step 2: Fetch historical pricing (same logic as aiSuggestLineItems) ────
    let historicalPricingRef = "";
    try {
      const db = await getDb();
      if (db) {
        const histRows = await db
          .select({
            task: estimateLineItems.task,
            unitPrice: estimateLineItems.unitPrice,
            unit: estimateLineItems.unit,
            category: estimateLineItems.category,
            quantity: estimateLineItems.quantity,
          })
          .from(estimateLineItems)
          .innerJoin(estimates, eq(estimateLineItems.estimateId, estimates.id))
          .where(
            and(
              sql`CAST(${estimateLineItems.unitPrice} AS DECIMAL) > 0`,
              or(
                eq(estimates.status, "sent"),
                eq(estimates.status, "approved"),
                eq(estimates.status, "viewed"),
                eq(estimates.status, "draft"),
              )
            )
          )
          .orderBy(desc(estimateLineItems.createdAt))
          .limit(100);

        if (histRows.length > 0) {
          const grouped: Record<string, { prices: number[]; unit: string; category: string; qty: number }> = {};
          for (const row of histRows) {
            const key = (row.task ?? "").toLowerCase().trim();
            if (!key) continue;
            const price = parseFloat(row.unitPrice ?? "0");
            if (price <= 0) continue;
            if (!grouped[key]) {
              grouped[key] = { prices: [], unit: row.unit ?? "LS", category: row.category ?? "labor", qty: parseFloat(row.quantity ?? "1") };
            }
            grouped[key].prices.push(price);
          }
          const lines = Object.entries(grouped).map(([task, data]) => {
            const avg = data.prices.reduce((a, b) => a + b, 0) / data.prices.length;
            const min = Math.min(...data.prices);
            const max = Math.max(...data.prices);
            return `  - "${task}" | avg $${avg.toFixed(0)} (range $${min.toFixed(0)}–$${max.toFixed(0)}) | ${data.unit || "LS"} | ${data.category} | typical qty: ${data.qty}`;
          });
          historicalPricingRef = `\n\nHISTORICAL PRICING FROM PAST PROPOSALS (use these as your primary pricing reference):\n${lines.join("\n")}`;
        }
      }
    } catch { /* non-fatal */ }

    // ── Step 3: Generate structured line items from transcript ──────────────────
    const existingItemsSummary = (input.existingItems ?? []).length > 0
      ? `\n\nCurrent proposal line items:\n${(input.existingItems ?? []).map((item, i) =>
          `${i + 1}. ${item.task || '(no task)'} — ${item.description || ''} | Qty: ${item.quantity || '1'} | Price: $${item.unitPrice || '0'} | Category: ${item.category || 'labor'}`
        ).join('\n')}`
      : "\n\nNo line items yet in this proposal.";

    const systemPrompt = `You are a senior construction estimator for Kitchens Plus Upstate, a luxury renovation company in upstate South Carolina. You think like a professional estimator, a construction manager, and a business owner. Your job is to take a contractor's voice-dictated scope description and produce structured, priced proposal line items.

IMPORTANT: The input is a voice transcript. Ignore filler words (um, uh, like, you know), verbal repetition, and conversational asides. Focus on extracting the actual scope of work.

CRITICAL RULES:
1. ALWAYS split labor and material into SEPARATE line items. Example: "tile shower" → one item for "Shower Tile Material" (category: material) and one for "Shower Tile Installation Labor" (category: labor).
2. Demo/removal is always its own line item (category: labor).
3. Use clear, professional task names a homeowner would understand.
4. Write concise but specific descriptions (1-2 sentences). Include specs when mentioned.
5. Use appropriate units: LF (linear feet), SF (square feet), EA (each), HR (hours), LS (lump sum).
6. Categories: "material", "labor", "subcontractor", "permit", "other".
7. For follow-up messages, consider existing items and add/modify accordingly. Return ONLY new or changed items.
8. When the scope is vague (e.g., "full bathroom"), break it into standard trades: demo, rough plumbing, rough electrical, drywall/patch, tile, fixtures, paint, trim, final clean.
9. Keep the assistantMessage brief and practical — confirm what you built, flag anything you assumed or left out.
10. Better slightly too many items than one unusable block.

PRICING RULES (CRITICAL):
- You MUST provide a unitPrice for EVERY line item. Never leave unitPrice as empty string.
- Use the HISTORICAL PRICING DATA below as your primary reference.
- For tasks without historical data, use luxury renovation pricing in the Southeast US market (2024-2026 rates).
- Typical ranges for common trades (luxury tier, South Carolina):
  * Bathroom demo: $2,000–$3,500 LS
  * Rough plumbing: $2,000–$4,000 LS
  * Rough electrical: $1,500–$3,000 LS
  * Tile labor: $12–$25/SF
  * Tile material (mid-luxury): $8–$20/SF
  * Custom cabinetry: $300–$500/LF
  * Quartz countertops (installed): $75–$125/SF
  * Paint (interior): $3–$5/SF
  * Frameless glass shower door: $1,200–$2,500 EA
  * Plumbing fixtures (mid-luxury): $200–$800 EA
  * Drywall repair/patch: $500–$1,500 LS
- Use the MIDDLE of the range unless the user specifies luxury/budget.
- Flag in the assistantMessage if any prices are rough estimates.${historicalPricingRef}${existingItemsSummary}`;

    const titleContext = input.proposalTitle ? `\n\nProposal title: "${input.proposalTitle}"` : "";
    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...(input.conversationHistory ?? []),
      { role: "user", content: `Voice transcript:${titleContext}\n\n"${transcript}"` },
    ];

    const result = await invokeLLM({
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "proposal_line_items",
          strict: true,
          schema: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    task: { type: "string", description: "Short task/item name (max 80 chars)" },
                    description: { type: "string", description: "Detailed description of the work or material" },
                    quantity: { type: "string", description: "Numeric quantity as string" },
                    unit: { type: "string", description: "Unit of measure: LF, SF, EA, HR, LS, etc." },
                    unitPrice: { type: "string", description: "Unit price as string with 2 decimals. MUST always provide a price." },
                    category: { type: "string", description: "One of: material, labor, subcontractor, permit, other" },
                  },
                  required: ["task", "description", "quantity", "unit", "unitPrice", "category"],
                  additionalProperties: false,
                },
              },
              assistantMessage: { type: "string", description: "Brief confirmation of what was extracted from the voice note. Flag assumptions and rough estimates." },
            },
            required: ["items", "assistantMessage"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = result?.choices?.[0]?.message?.content;
    if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI returned no response. Please try again." });
    const parsed = JSON.parse(content);
    return {
      transcript,
      items: parsed.items as Array<{
        task: string;
        description: string;
        quantity: string;
        unit: string;
        unitPrice: string;
        category: string;
      }>,
      assistantMessage: parsed.assistantMessage as string,
    };
  }),
  // ── Version History ──
  listVersions: adminProcedure.input(z.object({
    estimateId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const versions = await db.select({
      id: estimateVersions.id,
      versionNumber: estimateVersions.versionNumber,
      trigger: estimateVersions.trigger,
      label: estimateVersions.label,
      createdAt: estimateVersions.createdAt,
    }).from(estimateVersions)
      .where(eq(estimateVersions.estimateId, input.estimateId))
      .orderBy(desc(estimateVersions.versionNumber));
    return versions;
  }),

  getVersion: adminProcedure.input(z.object({
    versionId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [version] = await db.select().from(estimateVersions)
      .where(eq(estimateVersions.id, input.versionId)).limit(1);
    if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
    return version;
  }),

  restoreVersion: adminProcedure.input(z.object({
    estimateId: z.number(),
    versionId: z.number(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [version] = await db.select().from(estimateVersions)
      .where(eq(estimateVersions.id, input.versionId)).limit(1);
    if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
    const snapshot = version.snapshot as any;
    if (!snapshot?.header || !snapshot?.lineItems) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid snapshot" });

    // Restore header fields
    const { id: _hid, createdAt: _hca, updatedAt: _hua, ...headerFields } = snapshot.header;
    await db.update(estimates).set(headerFields).where(eq(estimates.id, input.estimateId));

    // Delete all current line items and re-insert from snapshot
    await db.delete(estimateLineItems).where(eq(estimateLineItems.estimateId, input.estimateId));
    for (const li of snapshot.lineItems) {
      const { id: _lid, createdAt: _lca, ...liFields } = li;
      await db.insert(estimateLineItems).values({
        ...liFields,
        estimateId: input.estimateId,
      });
    }

    // Create a new version entry for the restore action
    const crypto = await import("crypto");
    const restoredEst = await db.select().from(estimates).where(eq(estimates.id, input.estimateId)).limit(1);
    const restoredItems = await db.select().from(estimateLineItems).where(eq(estimateLineItems.estimateId, input.estimateId));
    const newSnapshotData = { header: restoredEst[0], lineItems: restoredItems };
    const newHash = crypto.createHash("sha256").update(JSON.stringify(newSnapshotData)).digest("hex").slice(0, 32);
    const [lastVer] = await db.select().from(estimateVersions)
      .where(eq(estimateVersions.estimateId, input.estimateId))
      .orderBy(desc(estimateVersions.versionNumber)).limit(1);
    await db.insert(estimateVersions).values({
      estimateId: input.estimateId,
      versionNumber: (lastVer?.versionNumber ?? 0) + 1,
      snapshot: newSnapshotData,
      trigger: "restore",
      label: `Restored from v${version.versionNumber}`,
      contentHash: newHash,
    });

    return { success: true };
  }),
});
// ─── Messages router ───────────────────────────────────────────────────────────
const messagesRouter = router({
  list: protectedProcedure.input(z.object({
    projectId: z.number().optional(),
    leadId: z.number().optional(),
    threadType: z.string().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(messages).where(
      input.projectId ? eq(messages.projectId, input.projectId) : undefined
    ).orderBy(desc(messages.createdAt));
  }),

  listAll: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(messages).orderBy(desc(messages.createdAt)).limit(100);
  }),

  listByLead: adminProcedure.input(z.object({ leadId: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(messages)
      .where(eq(messages.leadId, input.leadId))
      .orderBy(asc(messages.createdAt));
  }),

  create: adminProcedure.input(z.object({
    projectId: z.number().optional(),
    leadId: z.number().optional(),
    threadType: z.enum(["client","vendor","internal","lead"]),
    direction: z.enum(["inbound","outbound"]),
    channel: z.enum(["sms","email","portal","internal"]),
    fromName: z.string().optional(),
    toPhone: z.string().optional(),
    toEmail: z.string().optional(),
    body: z.string(),
    isAiDraft: z.boolean().optional(),
    scheduledFor: z.string().optional(),
    subject: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const status = input.isAiDraft ? "pending_approval" : "sent";
    await db.insert(messages).values({
      ...input,
      scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : undefined,
      fromName: input.fromName ?? ctx.user.name ?? "Kitchens Plus",
      status,
    });
    const [{ newId: msgId }] = await db.select({ newId: sql<number>`LAST_INSERT_ID()` }).from(messages).limit(1);
    // Auto-send SMS if SMS channel and not a draft
    if (input.channel === "sms" && input.direction === "outbound" && !input.isAiDraft && input.toPhone) {
      const smsResult = await sendSms(input.toPhone, input.body);
      if (smsResult.success) {
        await db.update(messages).set({ twilioSid: smsResult.messageId, status: "delivered" }).where(eq(messages.id, msgId));
      }
    }
    return { id: msgId };
  }),

  approve: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(messages).set({
      status: "approved",
      approvedBy: ctx.user.id,
      approvedAt: new Date(),
    }).where(eq(messages.id, input.id));
    return { success: true };
  }),

  generateAiDraft: adminProcedure.input(z.object({
    projectId: z.number().optional(),
    context: z.string(),
    messageType: z.string(),
  })).mutation(async ({ input }) => {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a friendly, professional assistant for Kitchens Plus Upstate, a luxury kitchen and bath renovation company in Upstate SC. 
          Write client/vendor messages that are: warm and friendly, concise (use bullet points where helpful), professional, and specific.
          Always sign off with "— Kitchens Plus Upstate Team" and include the text number +1 (833) 518-4811.
          Keep messages brief — 3-5 sentences or bullet points max.`,
        },
        {
          role: "user",
          content: `Write a ${input.messageType} message. Context: ${input.context}`,
        },
      ],
    });
    const content = response.choices?.[0]?.message?.content ?? "";
    return { draft: content };
  }),

  // ── Unified project messages (all channels) ───────────────────────────────
  listByProject: adminProcedure.input(z.object({
    projectId: z.number(),
    limit: z.number().optional().default(200),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    // Get project to find associated leadId and clientId
    const [proj] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
    if (!proj) return [];
    // Fetch messages by projectId OR leadId
    const conditions = [eq(messages.projectId, input.projectId)];
    if (proj.leadId) conditions.push(eq(messages.leadId, proj.leadId));
    const rows = await db.select().from(messages)
      .where(or(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(input.limit);
    // Also get documents (portal file uploads) for this project
    const docs = await db.select().from(documents)
      .where(eq(documents.projectId, input.projectId))
      .orderBy(desc(documents.createdAt));
    return { messages: rows, documents: docs };
  }),

  // Poll Gmail for new emails related to a project/client
  pollGmail: adminProcedure.input(z.object({
    projectId: z.number(),
    clientEmail: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    try {
      const { pollGmailForProject } = await import("./gmailPoller");
      const count = await pollGmailForProject(input.projectId, input.clientEmail);
      return { success: true, newMessages: count };
    } catch (err: any) {
      console.error("[PollGmail]", err?.message ?? err);
      return { success: false, newMessages: 0, error: err?.message };
    }
  }),

  // ── Full Gmail sync (both accounts) ─────────────────────────────────────
  syncGmail: adminProcedure.mutation(async () => {
    try {
      const { syncAllGmailAccounts } = await import("./gmailSync");
      const results = await syncAllGmailAccounts();
      const total = results.reduce((s, r) => s + r.newMessages, 0);
      return { success: true, newMessages: total, results };
    } catch (err: any) {
      console.error("[SyncGmail]", err?.message ?? err);
      return { success: false, newMessages: 0, error: err?.message };
    }
  }),

  // ── Unread count for sidebar badge ──────────────────────────────────────
  getUnreadCount: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { count: 0, fieldCaptureCount: 0 };
    const [row] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(messages)
      .where(and(eq(messages.isRead, false), eq(messages.direction, "inbound")));
    // Also count unread field captures (photos/notes not yet viewed)
    let fieldCaptureCount = 0;
    try {
      const { fieldCaptures } = await import("../drizzle/schema");
      const [fcRow] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(fieldCaptures)
        .where(eq((fieldCaptures as any).isRead, false));
      fieldCaptureCount = Number(fcRow?.count ?? 0);
    } catch (_) { /* fieldCaptures table may not have isRead column yet */ }
    const total = Number(row?.count ?? 0) + fieldCaptureCount;
    return { count: total, messagesCount: Number(row?.count ?? 0), fieldCaptureCount };
  }),

  // ── Mark a single message as read ───────────────────────────────────────
  markRead: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(messages).set({ isRead: true, readAt: new Date(), readBy: "owner" }).where(eq(messages.id, input.id));
    return { success: true };
  }),

  // ── Mark all messages for a lead as read ────────────────────────────────
  markAllReadForLead: adminProcedure.input(z.object({ leadId: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(messages)
      .set({ isRead: true, readAt: new Date(), readBy: "owner" })
      .where(and(eq(messages.leadId, input.leadId), eq(messages.isRead, false)));
    return { success: true };
  }),

  // ── Gmail sync status ───────────────────────────────────────────────────────────────────────────────────────
  getSyncStatus: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(gmailSyncState).orderBy(desc(gmailSyncState.lastSyncAt));
  }),

  // ── AI Summaries ───────────────────────────────────────────────────────────────────────────────────────
  getSummaries: adminProcedure.input(z.object({ leadId: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(messageSummaries)
      .where(eq(messageSummaries.leadId, input.leadId))
      .orderBy(desc(messageSummaries.generatedAt));
  }),

  generateSummary: adminProcedure.input(z.object({
    messageId: z.number(),
    leadId: z.number().optional(),
    forceRegenerate: z.boolean().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Check if summary already exists
    if (!input.forceRegenerate) {
      const existing = await db.select().from(messageSummaries).where(eq(messageSummaries.messageId, input.messageId)).limit(1);
      if (existing[0]) return { summary: existing[0].summary, cached: true };
    }
    // Fetch the message
    const [msg] = await db.select().from(messages).where(eq(messages.id, input.messageId)).limit(1);
    if (!msg) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
    const channelLabel = msg.channel === "sms" ? "SMS" : msg.channel === "email" ? "Email" : "Portal message";
    const dirLabel = msg.direction === "inbound" ? "from client" : "sent to client";
    const prompt = `You are a professional CRM assistant for a kitchen renovation company. Summarize this ${channelLabel} message ${dirLabel} in 1-3 concise professional sentences. Focus on the key information, requests, or updates. Do not include greetings or sign-offs.\n\nMessage:\n${msg.body ?? "[no body]"}\n\nSummary:`;
    const llmResult = await invokeLLM({
      messages: [
        { role: "system", content: "You are a professional CRM assistant. Provide concise, professional summaries." },
        { role: "user", content: prompt },
      ],
    });
    const summary = llmResult?.choices?.[0]?.message?.content?.trim() ?? "[Summary unavailable]";
    // Store in DB (upsert)
    await db.insert(messageSummaries).values({
      messageId: input.messageId,
      leadId: input.leadId ?? msg.leadId ?? null,
      summary,
    }).onDuplicateKeyUpdate({ set: { summary, generatedAt: new Date() } });
    return { summary, cached: false };
  }),

  generateSummariesBatch: adminProcedure.input(z.object({
    leadId: z.number(),
    limit: z.number().max(50).default(20),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Get recent messages for this lead that don't have summaries yet
    const recentMsgs = await db.select().from(messages)
      .where(and(eq(messages.leadId, input.leadId), or(eq(messages.channel, "sms"), eq(messages.channel, "email"), eq(messages.channel, "portal"))))
      .orderBy(desc(messages.createdAt)).limit(input.limit);
    const existingSummaries = await db.select({ messageId: messageSummaries.messageId }).from(messageSummaries)
      .where(eq(messageSummaries.leadId, input.leadId));
    const existingIds = new Set(existingSummaries.map(s => s.messageId));
    const toSummarize = recentMsgs.filter(m => !existingIds.has(m.id) && m.body && m.body.trim().length > 10);
    let generated = 0;
    for (const msg of toSummarize.slice(0, 10)) { // max 10 per batch to avoid timeout
      try {
        const channelLabel = msg.channel === "sms" ? "SMS" : msg.channel === "email" ? "Email" : "Portal message";
        const dirLabel = msg.direction === "inbound" ? "from client" : "sent to client";
        const llmResult = await invokeLLM({
          messages: [
            { role: "system", content: "You are a professional CRM assistant. Provide concise, professional summaries." },
            { role: "user", content: `Summarize this ${channelLabel} ${dirLabel} in 1-3 concise professional sentences:\n\n${msg.body}` },
          ],
        });
        const summary = llmResult?.choices?.[0]?.message?.content?.trim() ?? "[Summary unavailable]";
        await db.insert(messageSummaries).values({
          messageId: msg.id,
          leadId: input.leadId,
          summary,
        }).onDuplicateKeyUpdate({ set: { summary, generatedAt: new Date() } });
        generated++;
      } catch (e) { console.error("[AI Summary] Failed for message", msg.id, e); }
    }
    return { generated, total: toSummarize.length };
  }),

  /** Send a quick project message to the client — auto-resolves contact from project */
  sendProjectMessage: adminProcedure
    .input(z.object({
      projectId: z.number(),
      body: z.string().min(1),
      subject: z.string().optional(),
      channels: z.enum(["both", "sms", "email"]).default("both"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId));
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      // Resolve contact — prefer clients table, fall back to leads table
      let contactName = "Valued Client";
      let phones: string[] = [];
      let emails: string[] = [];

      if (project.clientId) {
        const [client] = await db.select().from(clients).where(eq(clients.id, project.clientId));
        if (client) {
          contactName = client.name;
          phones = [client.phone].filter(Boolean) as string[];
          emails = [client.email].filter(Boolean) as string[];
        }
      }

      if (phones.length === 0 && emails.length === 0 && project.leadId) {
        const [lead] = await db.select().from(leads).where(eq(leads.id, project.leadId));
        if (lead) {
          contactName = lead.name;
          phones = [lead.phone, (lead as any).phone2, (lead as any).phone3].filter(Boolean) as string[];
          emails = [lead.email, (lead as any).email2, (lead as any).email3].filter(Boolean) as string[];
        }
      } else if (project.leadId) {
        const [lead] = await db.select().from(leads).where(eq(leads.id, project.leadId));
        if (lead) {
          phones = [...new Set([...phones, ...[((lead as any).phone2), ((lead as any).phone3)].filter(Boolean) as string[]])];
          emails = [...new Set([...emails, ...[((lead as any).email2), ((lead as any).email3)].filter(Boolean) as string[]])];
        }
      }

      if (phones.length === 0 && emails.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No contact info found for this project. Please add an email or phone to the client record." });
      }

      const senderName = ctx.user.name ?? "Kitchens Plus Upstate";
      const results: { channel: string; to: string; ok: boolean }[] = [];

      // ── SMS ──
      if (input.channels !== "email" && phones.length > 0) {
        for (const phone of phones) {
          try {
            const smsBody = `Hi ${contactName}, ${input.body}\n\nCall Chad at 864-567-8777 | Reply STOP to opt out.`;
            await sendSms({ to: phone, message: smsBody });
            await db.insert(messages).values({
              projectId: input.projectId,
              leadId: project.leadId ?? undefined,
              threadType: "client",
              direction: "outbound",
              channel: "sms",
              fromName: senderName,
              toPhone: phone,
              body: smsBody,
              status: "delivered",
            });
            results.push({ channel: "sms", to: phone, ok: true });
          } catch (err: any) {
            console.error(`[sendProjectMessage] SMS to ${phone} failed:`, err?.message);
            results.push({ channel: "sms", to: phone, ok: false });
          }
        }
      }

      // ── Email ──
      if (input.channels !== "sms" && emails.length > 0) {
        const { createTransporter } = await import("./email");
        const transporter = createTransporter();
        const subject = input.subject?.trim() || `Message from Kitchens Plus Upstate — ${project.name}`;
        const html = `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8F6F1;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F6F1;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:#1A1A1A;padding:28px 40px;">
          <p style="margin:0;font-size:22px;color:#BF9A3B;font-family:'Georgia',serif;letter-spacing:1px;">Kitchens Plus Upstate</p>
          <p style="margin:4px 0 0;font-size:12px;color:#999;letter-spacing:2px;text-transform:uppercase;">Project Update</p>
        </td></tr>
        <tr><td style="padding:36px 40px;">
          <p style="font-size:16px;color:#333;margin:0 0 8px;">Dear ${contactName},</p>
          <div style="font-size:14px;color:#333;line-height:1.8;white-space:pre-wrap;">${input.body.replace(/\n/g, "<br>")}</div>
        </td></tr>
        <tr><td style="background:#F8F6F1;padding:20px 40px;border-top:1px solid #EEE;">
          <p style="margin:0;font-size:12px;color:#999;text-align:center;line-height:1.6;">
            Kitchens Plus Upstate · Questions? Call Chad at 864-567-8777 or reply to this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
        for (const email of emails) {
          try {
            await transporter.sendMail({
              from: `"Kitchens Plus Upstate" <chad@kitchensplusupstate.com>`,
              replyTo: "chad@kitchensplusupstate.com",
              to: email,
              subject,
              html,
            });
            await db.insert(messages).values({
              projectId: input.projectId,
              leadId: project.leadId ?? undefined,
              threadType: "client",
              direction: "outbound",
              channel: "email",
              fromName: senderName,
              toEmail: email,
              subject,
              body: input.body,
              status: "delivered",
            });
            results.push({ channel: "email", to: email, ok: true });
          } catch (err: any) {
            console.error(`[sendProjectMessage] Email to ${email} failed:`, err?.message);
            results.push({ channel: "email", to: email, ok: false });
          }
        }
      }

      const sent = results.filter(r => r.ok).length;
      if (sent === 0) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "All send attempts failed. Check SMS/email credentials." });
      return { ok: true, sent, results };
    }),

  /** Transcribe voice audio (base64 webm/mp4) to text */
  transcribeVoice: adminProcedure
    .input(z.object({ base64Audio: z.string(), mimeType: z.string() }))
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.base64Audio, "base64");
      const ext = input.mimeType.includes("mp4") ? "mp4" : "webm";
      const key = `voice-transcriptions/${nanoid()}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      const result = await transcribeAudio({ audioUrl: url });
      return { text: result.text };
    }),
});
// ─── Documents routerr ─────────────────────────────────────────────────────────
const documentsRouter = router({
  list: protectedProcedure.input(z.object({
    projectId: z.number().optional(),
    vendorId: z.number().optional(),
    clientId: z.number().optional(),
    docType: z.string().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(documents).where(
      input.projectId ? eq(documents.projectId, input.projectId) : undefined
    ).orderBy(desc(documents.createdAt));
  }),

  getUploadUrl: protectedProcedure.input(z.object({
    fileName: z.string(),
    mimeType: z.string(),
    projectId: z.number().optional(),
    docType: z.string(),
  })).mutation(async ({ input, ctx }) => {
    // Return a presigned-style response — actual upload happens via storagePut
    const fileKey = `projects/${input.projectId ?? "general"}/${nanoid(8)}-${input.fileName}`;
    return { fileKey, uploadReady: true };
  }),

  create: protectedProcedure.input(z.object({
    projectId: z.number().optional(),
    vendorId: z.number().optional(),
    clientId: z.number().optional(),
    leadId: z.number().optional(),
    docType: z.enum(["estimate","contract","permit","photo","drawing","invoice","warranty","compliance","other"]),
    fileName: z.string(),
    fileUrl: z.string(),
    fileKey: z.string(),
    mimeType: z.string().optional(),
    fileSize: z.number().optional(),
    roomTag: z.string().optional(),
    description: z.string().optional(),
    isPublic: z.boolean().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Auto-resolve leadId from project if not provided
    let resolvedLeadId = input.leadId ?? null;
    if (!resolvedLeadId && input.projectId) {
      const [proj] = await db.select({ leadId: projects.leadId }).from(projects).where(eq(projects.id, input.projectId)).limit(1);
      if (proj?.leadId) resolvedLeadId = proj.leadId;
    }
    await db.insert(documents).values({
      ...input,
      leadId: resolvedLeadId,
      uploadedBy: ctx.user.id,
    });
    const [{ newId }] = await db.select({ newId: sql<number>`LAST_INSERT_ID()` }).from(documents).limit(1);
    return { id: newId };
  }),

  delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(documents).where(eq(documents.id, input.id));
    return { success: true };
  }),

  // alias used by Documents.tsx frontend
  upload: protectedProcedure.input(z.object({
    projectId: z.number().optional(),
    vendorId: z.number().optional(),
    clientId: z.number().optional(),
    leadId: z.number().optional(),
    docType: z.enum(["estimate","contract","permit","photo","drawing","invoice","warranty","compliance","inspiration","other"]),
    fileName: z.string(),
    fileUrl: z.string(),
    fileKey: z.string(),
    mimeType: z.string().optional(),
    fileSize: z.number().optional(),
    description: z.string().optional(),
    uploadedByClient: z.boolean().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Auto-resolve leadId from project if not provided
    let resolvedLeadId = input.leadId ?? null;
    if (!resolvedLeadId && input.projectId) {
      const [proj] = await db.select({ leadId: projects.leadId }).from(projects).where(eq(projects.id, input.projectId)).limit(1);
      if (proj?.leadId) resolvedLeadId = proj.leadId;
    }
    await db.insert(documents).values({ ...input, leadId: resolvedLeadId, uploadedBy: ctx.user.id });
    const [{ newId }] = await db.select({ newId: sql<number>`LAST_INSERT_ID()` }).from(documents).limit(1);
    return { id: newId };
  }),

  // Upload inspiration photo bytes directly from client (multipart handled via base64 data URL)
  uploadInspirationPhoto: protectedProcedure.input(z.object({
    projectId: z.number(),
    clientId: z.number().optional(),
    leadId: z.number().optional(),
    fileName: z.string(),
    fileDataBase64: z.string(), // base64-encoded file content
    mimeType: z.string(),
    fileSize: z.number().optional(),
    roomTag: z.string().optional(),
    description: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Auto-resolve leadId from project if not provided
    let resolvedLeadId = input.leadId ?? null;
    if (!resolvedLeadId && input.projectId) {
      const [proj] = await db.select({ leadId: projects.leadId }).from(projects).where(eq(projects.id, input.projectId)).limit(1);
      if (proj?.leadId) resolvedLeadId = proj.leadId;
    }
    // Decode base64 and upload to S3
    const base64Data = input.fileDataBase64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const fileKey = `projects/${input.projectId}/inspiration/${nanoid(10)}-${input.fileName}`;
    const { url } = await storagePut(fileKey, buffer, input.mimeType);
    await db.insert(documents).values({
      projectId: input.projectId,
      leadId: resolvedLeadId,
      clientId: input.clientId,
      uploadedBy: ctx.user.id,
      docType: "inspiration",
      fileName: input.fileName,
      fileUrl: url,
      fileKey,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      roomTag: input.roomTag,
      description: input.description,
      isPublic: true,
      uploadedByClient: true,
    });
    const rows = await db.select({ newId: sql<number>`LAST_INSERT_ID()` }).from(documents);
    return { id: rows[0]?.newId ?? 0, url };
  }),

  // List inspiration photos for a project (accessible by client and owner)
  listInspirationPhotos: protectedProcedure.input(z.object({
    projectId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(documents)
      .where(and(eq(documents.projectId, input.projectId), eq(documents.docType, "inspiration")))
      .orderBy(desc(documents.createdAt));
  }),

  // Owner: upload a project document (base64 → S3)
  uploadFile: adminProcedure.input(z.object({
    projectId: z.number().optional(),
    leadId: z.number().optional(),
    fileName: z.string(),
    fileDataBase64: z.string(),
    mimeType: z.string(),
    fileSize: z.number().optional(),
    docType: z.enum(["estimate","contract","permit","photo","drawing","invoice","warranty","compliance","inspiration","other"]),
    description: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Auto-resolve leadId from project if not provided
    let resolvedLeadId = input.leadId ?? null;
    if (!resolvedLeadId && input.projectId) {
      const [proj] = await db.select({ leadId: projects.leadId }).from(projects).where(eq(projects.id, input.projectId)).limit(1);
      if (proj?.leadId) resolvedLeadId = proj.leadId;
    }
    const base64Data = input.fileDataBase64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const fileKey = `projects/${input.projectId ?? "general"}/${input.docType}/${nanoid(10)}-${input.fileName}`;
    const { url } = await storagePut(fileKey, buffer, input.mimeType);
    await db.insert(documents).values({
      projectId: input.projectId,
      leadId: resolvedLeadId,
      uploadedBy: ctx.user.id,
      docType: input.docType,
      fileName: input.fileName,
      fileUrl: url,
      fileKey,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      description: input.description,
      isPublic: false,
      uploadedByClient: false,
    });
    const rows = await db.select({ newId: sql<number>`LAST_INSERT_ID()` }).from(documents);
    return { id: rows[0]?.newId ?? 0, url };
  }),

  // Owner: get design idea notes for a lead (for Documents & Media tab)
  getDesignNotesByLead: adminProcedure.input(z.object({
    leadId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(designIdeaNotes)
      .where(eq(designIdeaNotes.leadId, input.leadId))
      .orderBy(desc(designIdeaNotes.updatedAt));
  }),

  // Delete inspiration photo (owner can delete any; client can delete their own)
  deleteInspirationPhoto: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const doc = await db.select().from(documents).where(eq(documents.id, input.id)).limit(1);
    if (!doc[0]) throw new TRPCError({ code: "NOT_FOUND" });
    const role = (ctx.user as any).role;
    // Owner/admin can delete any; client can only delete their own uploads
    if (role !== "owner" && role !== "admin" && doc[0].uploadedBy !== ctx.user.id) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    await db.delete(documents).where(eq(documents.id, input.id));
    return { success: true };
  }),
});

// ─── Invoices router ──────────────────────────────────────────────────────────
const invoicesRouter = router({
  list: adminProcedure.input(z.object({
    projectId: z.number().optional(),
    leadId: z.number().optional(),
    clientId: z.number().optional(),
    status: z.string().optional(),
  }).optional()).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    // Build OR conditions for project/lead/client matching, AND status filter
    const orConditions: any[] = [];
    if (input?.projectId) orConditions.push(eq(invoices.projectId, input.projectId));
    if (input?.leadId) orConditions.push(eq(invoices.leadId, input.leadId));
    if (input?.clientId) orConditions.push(eq(invoices.clientId, input.clientId));
    const statusCondition = input?.status ? eq(invoices.status, input.status as any) : null;
    let whereClause: any = undefined;
    if (orConditions.length > 0 && statusCondition) whereClause = and(or(...orConditions), statusCondition);
    else if (orConditions.length > 0) whereClause = or(...orConditions);
    else if (statusCondition) whereClause = statusCondition;
    const rows = await (whereClause
      ? db.select().from(invoices).where(whereClause).orderBy(desc(invoices.createdAt))
      : db.select().from(invoices).orderBy(desc(invoices.createdAt)));
    if (rows.length === 0) return [];
    // Collect unique IDs for batch lookups
    const leadIds = [...new Set(rows.map(r => r.leadId).filter(Boolean))] as number[];
    const clientIds = [...new Set(rows.map(r => r.clientId).filter(Boolean))] as number[];
    const projectIds = [...new Set(rows.map(r => r.projectId).filter(Boolean))] as number[];
    // Batch fetch related records
    const [allLeads, allClients, allProjects, allEstimates] = await Promise.all([
      leadIds.length > 0
        ? db.select({ id: leads.id, name: leads.name }).from(leads).where(inArray(leads.id, leadIds))
        : Promise.resolve([]),
      clientIds.length > 0
        ? db.select({ id: clients.id, name: clients.name }).from(clients).where(inArray(clients.id, clientIds))
        : Promise.resolve([]),
      projectIds.length > 0
        ? db.select({ id: projects.id, name: projects.name }).from(projects).where(inArray(projects.id, projectIds))
        : Promise.resolve([]),
      (leadIds.length > 0 || projectIds.length > 0)
        ? db.select({ id: estimates.id, title: estimates.title, leadId: estimates.leadId, projectId: estimates.projectId })
            .from(estimates)
            .where(or(
              leadIds.length > 0 ? inArray(estimates.leadId, leadIds) : sql`FALSE`,
              projectIds.length > 0 ? inArray(estimates.projectId, projectIds) : sql`FALSE`
            ))
        : Promise.resolve([]),
    ]);
    return rows.map(inv => {
      const proposal = allEstimates.find(e =>
        (inv.leadId && e.leadId === inv.leadId) ||
        (inv.projectId && e.projectId === inv.projectId)
      );
      const client = inv.clientId ? allClients.find(c => c.id === inv.clientId) : null;
      const lead = inv.leadId ? allLeads.find(l => l.id === inv.leadId) : null;
      const project = inv.projectId ? allProjects.find(p => p.id === inv.projectId) : null;
      const clientName = client?.name ?? lead?.name ?? null;
      const proposalTitle = proposal?.title ?? project?.name ?? null;
      return { ...inv, clientName, proposalTitle };
    });
  }),

  create: adminProcedure.input(z.object({
    projectId: z.number().optional(),
    clientId: z.number().optional(),
    leadId: z.number().optional(),
    invoiceType: z.enum(["deposit","progress","final","change_order","other"]),
    milestoneId: z.number().optional(),
    amount: z.string(),
    notes: z.string().optional(),
    dueDate: z.string().optional(),
    bypassMilestoneGate: z.boolean().optional(), // owner override
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // ── Project-to-payment gating ──────────────────────────────────────────
    // For progress/final invoices tied to a project milestone, verify the
    // milestone is completed before allowing invoice creation.
    if (
      input.projectId &&
      input.milestoneId &&
      (input.invoiceType === "progress" || input.invoiceType === "final") &&
      !input.bypassMilestoneGate
    ) {
      const [ms] = await db
        .select({ status: milestones.status, title: milestones.title })
        .from(milestones)
        .where(eq(milestones.id, input.milestoneId))
        .limit(1);
      if (ms && ms.status !== "completed") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Cannot create a ${input.invoiceType} invoice: milestone "${ms.title ?? "selected milestone"}" is not yet completed (current status: ${ms.status}). Mark the milestone complete first, or use the override option.`,
        });
      }
    }
    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
    // Due upon receipt — always set dueDate to today
    await db.insert(invoices).values({
      ...input,
      invoiceNumber,
      amount: input.amount as any,
      dueDate: new Date(),
      status: "draft",
    });
    const [{ newId }] = await db.select({ newId: sql<number>`LAST_INSERT_ID()` }).from(invoices).limit(1);
    // ── Event-triggered financial review ──────────────────────────────────
    if (input.projectId) {
      void triggerFinancialReview(input.projectId, "invoice.created", newId);
    }
    return { id: newId, invoiceNumber };
  }),

  update: adminProcedure.input(z.object({
    id: z.number(),
    status: z.enum(["draft","sent","paid","overdue","cancelled"]).optional(),
    squarePaymentLinkId: z.string().optional(),
    paidAt: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, paidAt, ...rest } = input;
    const updateData: any = { ...rest };
    if (paidAt) updateData.paidAt = new Date(paidAt);
    await db.update(invoices).set(updateData).where(eq(invoices.id, id));
    return { success: true };
  }),

  markPaid: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [inv] = await db.select({ projectId: invoices.projectId }).from(invoices).where(eq(invoices.id, input.id)).limit(1);
    await db.update(invoices).set({ status: "paid", paidAt: new Date() }).where(eq(invoices.id, input.id));
    // ── Event-triggered financial review ──────────────────────────────────
    if (inv?.projectId) {
      void triggerFinancialReview(inv.projectId, "invoice.payment.received", input.id);
    }
    return { success: true };
  }),

  delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(invoices).where(eq(invoices.id, input.id));
    return { success: true };
  }),

  generatePaymentLink: adminProcedure.input(z.object({
    id: z.number(),
    redirectUrl: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const inv = await db.select().from(invoices).where(eq(invoices.id, input.id)).limit(1);
    if (!inv[0]) throw new TRPCError({ code: "NOT_FOUND" });
    const amountCents = Math.round(Number(inv[0].amount ?? 0) * 100);
    const result = await createPaymentLink({
      invoiceId: input.id,
      amount: amountCents,
      description: `Invoice #${inv[0].invoiceNumber ?? input.id} — Kitchens Plus Upstate`,
      redirectUrl: input.redirectUrl,
    });
    if (result.success && result.url) {
      await db.update(invoices).set({ squarePaymentId: result.orderId ?? null }).where(eq(invoices.id, input.id));
    }
    return result;
  }),

  // Get total already billed for a lead or project (for billing summary in invoice form)
  getTotalBilled: adminProcedure.input(z.object({
    leadId: z.number().optional(),
    projectId: z.number().optional(),
    excludeInvoiceId: z.number().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { total: 0 };
    const conditions: any[] = [];
    if (input.leadId) conditions.push(eq(invoices.leadId, input.leadId));
    if (input.projectId) conditions.push(eq(invoices.projectId, input.projectId));
    if (input.excludeInvoiceId) conditions.push(sql`${invoices.id} != ${input.excludeInvoiceId}`);
    if (!conditions.length) return { total: 0 };
    const rows = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
      .from(invoices)
      .where(and(...conditions));
    return { total: Number(rows[0]?.total ?? 0) };
  }),

  send: adminProcedure.input(z.object({
    id: z.number(),
    origin: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const inv = await db.select().from(invoices).where(eq(invoices.id, input.id)).limit(1);
    if (!inv[0]) throw new TRPCError({ code: "NOT_FOUND" });
    const invoice = inv[0];

    // Resolve client info from lead or project
    let clientName = "Client";
    let clientEmail: string | null = null;
    let clientPhone: string | null = null;
    let clientAddress: string | null = null;
    let proposalTotal: number | null = null;
    let proposalNumber: string | null = null;
    let projectName: string | null = null;

    if (invoice.leadId) {
      const leadRows = await db.select().from(leads).where(eq(leads.id, invoice.leadId)).limit(1);
      if (leadRows[0]) {
        clientName = leadRows[0].name;
        clientEmail = leadRows[0].email ?? null;
        clientPhone = leadRows[0].phone ?? null;
        clientAddress = leadRows[0].address ?? null;
      }
    } else if (invoice.projectId) {
      const projRows = await db.select().from(projects).where(eq(projects.id, invoice.projectId)).limit(1);
      if (projRows[0]) {
        projectName = projRows[0].name;
        if ((projRows[0] as any).leadId) {
          const leadRows2 = await db.select().from(leads).where(eq(leads.id, (projRows[0] as any).leadId)).limit(1);
          if (leadRows2[0]) {
            clientName = leadRows2[0].name;
            clientEmail = leadRows2[0].email ?? null;
            clientPhone = leadRows2[0].phone ?? null;
            clientAddress = leadRows2[0].address ?? null;
          }
        }
      }
    } else if (invoice.clientId) {
      const clientRows = await db.select().from(clients).where(eq(clients.id, invoice.clientId)).limit(1);
      if (clientRows[0]) {
        clientName = clientRows[0].name;
        clientEmail = clientRows[0].email ?? null;
        clientPhone = clientRows[0].phone ?? null;
        clientAddress = clientRows[0].address ?? null;
      }
    }

    if (!clientEmail) throw new TRPCError({ code: "BAD_REQUEST", message: "No email address found for this client" });

    // Get proposal total if leadId exists
    if (invoice.leadId) {
      const estRows = await db.select().from(estimates)
        .where(and(eq(estimates.leadId, invoice.leadId), eq(estimates.status, "approved")))
        .orderBy(desc(estimates.approvedAt)).limit(1);
      if (estRows[0]) {
        proposalTotal = Number(estRows[0].total ?? 0);
        proposalNumber = estRows[0].estimateNumber ?? null;
      }
    }

    // Get total already billed for this lead/project (excluding this invoice)
    const billedConditions: any[] = [sql`${invoices.id} != ${invoice.id}`];
    if (invoice.leadId) billedConditions.push(eq(invoices.leadId, invoice.leadId));
    else if (invoice.projectId) billedConditions.push(eq(invoices.projectId, invoice.projectId));
    const billedRows = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
      .from(invoices).where(and(...billedConditions));
    const totalBilledSoFar = Number(billedRows[0]?.total ?? 0);

    // Generate Square payment link
    let squarePaymentUrl: string | undefined;
    try {
      const amountCents = Math.round(Number(invoice.amount) * 100);
      const payResult = await createPaymentLink({
        invoiceId: invoice.id,
        amount: amountCents,
        description: `Invoice #${invoice.invoiceNumber} — Kitchens Plus Upstate`,
        redirectUrl: input.origin ? `${input.origin}/invoices` : undefined,
      });
      if (payResult.success && payResult.url) {
        squarePaymentUrl = payResult.url;
        await db.update(invoices).set({ squarePaymentUrl: payResult.url, squarePaymentLinkId: payResult.orderId ?? null }).where(eq(invoices.id, invoice.id));
      }
    } catch (e) {
      console.error("[Invoice] Square payment link failed:", e);
    }

    // Fetch proposal line items for scope section in PDF (no pricing shown)
    let invoicePdfLineItems: { task?: string | null; description?: string | null; category?: string | null; quantity?: string | null; unit?: string | null }[] = [];
    if (invoice.leadId) {
      const estRows2 = await db.select().from(estimates)
        .where(and(eq(estimates.leadId, invoice.leadId), eq(estimates.status, "approved")))
        .orderBy(desc(estimates.approvedAt)).limit(1);
      if (estRows2[0]) {
        const liRows = await db.select().from(estimateLineItems)
          .where(eq(estimateLineItems.estimateId, estRows2[0].id))
          .orderBy(estimateLineItems.sortOrder);
        invoicePdfLineItems = liRows.map(li => ({
          task: li.task,
          description: li.description,
          category: li.category,
          quantity: li.quantity,
          unit: li.unit,
        }));
      }
    }
    // Generate PDF
    let pdfBuffer: Buffer | undefined;
    try {
      const { generateInvoicePdf } = await import("./invoicePdf");
      pdfBuffer = await generateInvoicePdf({
        invoiceNumber: invoice.invoiceNumber ?? `INV-${invoice.id}`,
        invoiceType: invoice.invoiceType,
        status: invoice.status,
        amount: Number(invoice.amount),
        dueDate: invoice.dueDate,
        sentAt: new Date(),
        notes: invoice.notes ?? undefined,
        squarePaymentUrl,
        clientName,
        clientEmail,
        clientPhone,
        clientAddress,
        proposalNumber,
        proposalTotal,
        totalBilledSoFar,
        projectName,
        lineItems: invoicePdfLineItems,
      });
      // Upload PDF to S3
      try {
        const key = `invoices/${invoice.id}-${invoice.invoiceNumber}.pdf`;
        const { url } = await storagePut(key, pdfBuffer, "application/pdf");
        await db.update(invoices).set({ pdfUrl: url, pdfKey: key }).where(eq(invoices.id, invoice.id));
      } catch (e) {
        console.error("[Invoice] S3 upload failed:", e);
      }
    } catch (e) {
      console.error("[Invoice] PDF generation failed:", e);
    }

    // Fetch invoice documents for email links
    let documentLinks: Array<{ filename: string; url: string; mimeType: string; fileSize: number }> = [];
    try {
      const invDocs = await db.select().from(invoiceDocuments).where(eq(invoiceDocuments.invoiceId, invoice.id));
      documentLinks = invDocs.map(d => ({ filename: d.filename, url: d.fileUrl, mimeType: d.mimeType, fileSize: d.fileSize }));
    } catch (e) { console.error("[Invoice] Failed to fetch docs for email:", e); }

    // Send email
    const { sendInvoiceEmail } = await import("./email");
    const emailResult = await sendInvoiceEmail({
      to: clientEmail,
      clientName,
      invoiceNumber: invoice.invoiceNumber ?? `INV-${invoice.id}`,
      invoiceType: invoice.invoiceType,
      amount: String(invoice.amount),
      dueDate: invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : undefined,
      notes: invoice.notes ?? undefined,
      squarePaymentUrl,
      pdfBuffer,
      proposalTotal: proposalTotal ? String(proposalTotal) : undefined,
      totalBilledSoFar: String(totalBilledSoFar),
      documentLinks: documentLinks.length > 0 ? documentLinks : undefined,
    });

    if (!emailResult.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: emailResult.error ?? "Email failed" });

     // Mark as sent — due upon receipt so dueDate = today
    await db.update(invoices).set({ status: "sent", sentAt: new Date(), dueDate: new Date() }).where(eq(invoices.id, invoice.id));
    // Auto-create project if this is the first invoice sent for a lead and no project exists yet
    if (invoice.leadId && !invoice.projectId) {
      try {
        const existingProjects = await db.select({ id: projects.id }).from(projects).where(eq(projects.leadId, invoice.leadId)).limit(1);
        if (!existingProjects[0]) {
          const leadForProject = await db.select().from(leads).where(eq(leads.id, invoice.leadId)).limit(1);
          const lp = leadForProject[0];
          if (lp) {
            const palette = ["#D4A853","#6B8E6B","#7B9BB5","#C47B5A","#9B7BC4","#5AB5A8","#C45A7B","#8BB57B"];
            const allProjCount = await db.select({ count: sql<number>`count(*)` }).from(projects);
            const color = palette[Number(allProjCount[0]?.count ?? 0) % palette.length];
            // Find or create client
            let autoClientId: number | undefined;
            if (lp.email) {
              const existClient = await db.select({ id: clients.id }).from(clients).where(eq(clients.email, lp.email)).limit(1);
              if (existClient[0]) {
                autoClientId = existClient[0].id;
              } else {
                await db.insert(clients).values({ name: lp.name, email: lp.email, phone: lp.phone, address: lp.address });
                const [{ cid }] = await db.select({ cid: sql<number>`LAST_INSERT_ID()` }).from(clients).limit(1);
                autoClientId = cid;
              }
            }
            await db.insert(projects).values({
              leadId: invoice.leadId,
              clientId: autoClientId,
              name: `${lp.name} — ${lp.projectType ?? "Project"}`,
              projectType: lp.projectType,
              address: lp.address,
              status: "active",
              color,
              startDate: new Date(),
            });
            const [{ newProjId }] = await db.select({ newProjId: sql<number>`LAST_INSERT_ID()` }).from(projects).limit(1);
            // Link invoice to new project
            await db.update(invoices).set({ projectId: newProjId }).where(eq(invoices.id, invoice.id));
          }
        }
      } catch (e) {
        console.error("[Invoice] Auto-create project failed:", e);
      }
    }
    // For deposit invoices: generate a contract sign token and include in email
    let contractSignUrl: string | undefined;
    if (invoice.invoiceType === "deposit") {
      const token = nanoid(32);
      await db.update(invoices).set({ contractRequired: true, contractSignToken: token }).where(eq(invoices.id, invoice.id));
      const origin = input.origin ?? "https://3000-ixkmucsad6aont6brcroh-dfd53965.us2.manus.computer";
      contractSignUrl = `${origin}/client/sign-contract/${token}`;
      // Send a separate contract signing email
      try {
        const { createTransporter } = await import("./email");
        const transporter = createTransporter();
        await transporter.sendMail({
          from: `"Kitchens Plus Upstate" <chad@kitchensplusupstate.com>`,
          replyTo: "chad@kitchensplusupstate.com",
          to: clientEmail,
          subject: `Action Required: Sign Your Contract — Invoice #${invoice.invoiceNumber}`,
          html: `
            <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #fff; color: #2E2F2A;">
              <div style="background: #2E2F2A; padding: 28px 32px; text-align: center;">
                <h1 style="color: #BF9A3B; font-size: 22px; margin: 0; letter-spacing: 2px;">KITCHENS PLUS UPSTATE</h1>
              </div>
              <div style="padding: 32px;">
                <p style="font-size: 16px;">Hi ${clientName.split(" ")[0]},</p>
                <p style="font-size: 15px; line-height: 1.6;">Please review and sign your project contract to confirm your deposit invoice of <strong>$${parseFloat(String(invoice.amount)).toFixed(2)}</strong>.</p>
                <div style="text-align: center; margin: 28px 0;">
                  <a href="${contractSignUrl}" style="background: #BF9A3B; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 4px; font-size: 15px; font-weight: 600;">Review &amp; Sign Contract</a>
                </div>
                <p style="font-size: 12px; color: #888;">This link is unique to your project. If you have questions, call us at +1 (833) 518-4811.</p>
              </div>
            </div>`,
        });
      } catch (e) { console.error("[Invoice] Contract email failed:", e); }
    }
    return { success: true, squarePaymentUrl, contractSignUrl };
  }),
  // ── Record a payment against an invoice ─────────────────────────────────
  recordPayment: adminProcedure.input(z.object({
    invoiceId: z.number(),
    amount: z.number(),
    method: z.enum(["square","check","cash","ach","other"]).default("square"),
    squarePaymentId: z.string().optional(),
    checkNumber: z.string().optional(),
    paidDate: z.string().optional(),
    note: z.string().optional(),
    paidAt: z.string().optional(),
    sendReceipt: z.boolean().optional(),
    ccOperator: z.boolean().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1);
    if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
    const paidAtDate = input.paidAt ? new Date(input.paidAt) : new Date();
    await db.insert(invoicePayments).values({
      invoiceId: input.invoiceId,
      projectId: inv.projectId ?? undefined,
      leadId: inv.leadId ?? undefined,
      clientId: inv.clientId ?? undefined,
      amount: String(input.amount) as any,
      method: input.method,
      squarePaymentId: input.squarePaymentId ?? undefined,
      checkNumber: input.checkNumber ?? undefined,
      paidDate: input.paidDate ?? undefined,
      note: input.note ?? undefined,
      sendReceipt: input.sendReceipt ?? false,
      ccOperator: input.ccOperator ?? false,
      paidAt: paidAtDate,
    });
    const [{ totalPaid }] = await db.select({ totalPaid: sql<string>`COALESCE(SUM(amount), 0)` })
      .from(invoicePayments).where(eq(invoicePayments.invoiceId, input.invoiceId));
    const paid = Number(totalPaid);
    const invoiceAmount = Number(inv.amount);
    const isFullyPaid = paid >= invoiceAmount;
    await db.update(invoices).set({
      amountPaid: String(paid) as any,
      status: isFullyPaid ? "paid" : "sent",
      paidAt: isFullyPaid ? new Date() : undefined,
    }).where(eq(invoices.id, input.invoiceId));
    if (inv.projectId) {
      void triggerFinancialReview(inv.projectId, "invoice.payment.received", input.invoiceId);
      void triggerNextActionRecompute(inv.projectId);
    }
    // ── Send receipt email if requested ────────────────────────────────────
    if (input.sendReceipt) {
      void (async () => {
        try {
          let clientName = "Client", clientEmail: string | null = null, projectName: string | null = null, portalUrl: string | null = null;
          if (inv.leadId) {
            const [lead] = await db.select().from(leads).where(eq(leads.id, inv.leadId)).limit(1);
            if (lead) { clientName = lead.name; clientEmail = lead.email ?? null; }
            const [proj] = await db.select().from(projects).where(eq(projects.leadId, inv.leadId)).limit(1);
            if (proj) { projectName = proj.name; portalUrl = `${process.env.VITE_OAUTH_PORTAL_URL ?? ""}/client/project/${proj.id}`; }
          } else if (inv.projectId) {
            const [proj] = await db.select().from(projects).where(eq(projects.id, inv.projectId)).limit(1);
            if (proj) {
              projectName = proj.name;
              portalUrl = `${process.env.VITE_OAUTH_PORTAL_URL ?? ""}/client/project/${proj.id}`;
              if (proj.leadId) {
                const [lead] = await db.select().from(leads).where(eq(leads.id, proj.leadId)).limit(1);
                if (lead) { clientName = lead.name; clientEmail = lead.email ?? null; }
              }
            }
          } else if (inv.clientId) {
            const [cl] = await db.select().from(clients).where(eq(clients.id, inv.clientId)).limit(1);
            if (cl) { clientName = cl.name; clientEmail = cl.email ?? null; }
          }
          if (!clientEmail) return;
          let pdfBuffer: Buffer | undefined;
          try {
            const { generateInvoicePdf } = await import("./invoicePdf");
            pdfBuffer = await generateInvoicePdf({
              invoiceNumber: inv.invoiceNumber ?? String(inv.id),
              invoiceType: inv.type ?? "other",
              status: isFullyPaid ? "paid" : "sent",
              amount: inv.amount,
              clientName, clientEmail, projectName,
              dueDate: inv.dueDate,
            });
          } catch { /* pdf generation optional */ }
          const { sendPaymentReceiptEmail } = await import("./email");
          const receiptResult = await sendPaymentReceiptEmail({
            to: clientEmail,
            clientName,
            invoiceNumber: inv.invoiceNumber ?? String(inv.id),
            invoiceType: inv.type ?? "other",
            amountReceived: input.amount,
            balance: Math.max(0, invoiceAmount - paid),
            paidDate: input.paidDate ?? new Date().toISOString().slice(0, 10),
            method: input.method,
            projectName: projectName ?? undefined,
            portalUrl: portalUrl ?? undefined,
            pdfBuffer,
            ccEmail: input.ccOperator ? "chad@kitchensplusupstate.com" : undefined,
          });
          if (receiptResult.ok) {
            await db.update(invoicePayments).set({ receiptEmailSentAt: new Date() })
              .where(and(eq(invoicePayments.invoiceId, input.invoiceId), eq(invoicePayments.paidAt, paidAtDate)));
            const refId = inv.leadId ?? inv.projectId ?? null;
            const refType = inv.leadId ? "lead" : "project";
            if (refId) {
              await db.insert(messages).values({
                leadId: refType === "lead" ? refId : null,
                projectId: refType === "project" ? refId : null,
                direction: "out",
                channel: "email",
                body: `Payment receipt email sent to ${clientEmail} for Invoice #${inv.invoiceNumber ?? inv.id} — $${input.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} received.`,
                sentAt: new Date(),
              } as any);
            }
          }
        } catch (e) { console.error("[recordPayment] receipt email error:", e); }
      })();
    }
    return { success: true, amountPaid: paid, balance: Math.max(0, invoiceAmount - paid), fullyPaid: isFullyPaid };
  }),

  // ── List all payments for an invoice ────────────────────────────────────
  listPayments: adminProcedure.input(z.object({ invoiceId: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(invoicePayments)
      .where(eq(invoicePayments.invoiceId, input.invoiceId))
      .orderBy(desc(invoicePayments.paidAt));
  }),

  // ── Delete (undo) a single payment record ─────────────────────────────────
  deletePayment: adminProcedure.input(z.object({ paymentId: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    // Get the payment to know which invoice to update
    const [pmt] = await db.select().from(invoicePayments).where(eq(invoicePayments.id, input.paymentId)).limit(1);
    if (!pmt) throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found" });
    await db.delete(invoicePayments).where(eq(invoicePayments.id, input.paymentId));
    // Recalculate total paid for the invoice
    const [{ totalPaid }] = await db.select({ totalPaid: sql<string>`COALESCE(SUM(amount), 0)` })
      .from(invoicePayments).where(eq(invoicePayments.invoiceId, pmt.invoiceId));
    const paid = Number(totalPaid);
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, pmt.invoiceId)).limit(1);
    const invoiceAmount = Number(inv?.amount ?? 0);
    const isFullyPaid = paid >= invoiceAmount && invoiceAmount > 0;
    await db.update(invoices).set({
      amountPaid: String(paid) as any,
      status: isFullyPaid ? "paid" : (paid > 0 ? "sent" : "sent"),
      paidAt: isFullyPaid ? (inv?.paidAt ?? new Date()) : null,
    }).where(eq(invoices.id, pmt.invoiceId));
    return { success: true };
  }),

  markUnpaid: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Remove all recorded payments for this invoice and reset status
    await db.delete(invoicePayments).where(eq(invoicePayments.invoiceId, input.id));
    await db.update(invoices).set({
      status: "sent",
      amountPaid: "0" as any,
      paidAt: null,
    }).where(eq(invoices.id, input.id));
    return { success: true };
  }),

  addPaymentToInvoice: adminProcedure.input(z.object({
    invoiceId: z.number(),
    amount: z.number().positive(),
    method: z.enum(["square","check","cash","ach","other"]),
    note: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1);
    if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
    await db.insert(invoicePayments).values({
      invoiceId: input.invoiceId,
      amount: String(input.amount) as any,
      method: input.method,
      note: input.note,
      paidAt: new Date(),
    });
    // Recalculate total paid
    const [{ totalPaid }] = await db.select({ totalPaid: sql<string>`COALESCE(SUM(amount), 0)` })
      .from(invoicePayments).where(eq(invoicePayments.invoiceId, input.invoiceId));
    const paid = Number(totalPaid);
    const invoiceAmount = Number(inv.amount ?? 0);
    const isFullyPaid = paid >= invoiceAmount && invoiceAmount > 0;
    await db.update(invoices).set({
      amountPaid: String(paid) as any,
      status: isFullyPaid ? "paid" : "sent",
      paidAt: isFullyPaid ? new Date() : null,
    }).where(eq(invoices.id, input.invoiceId));
    return { success: true, amountPaid: paid, balance: Math.max(0, invoiceAmount - paid), fullyPaid: isFullyPaid };
  }),

    // ── Revenue stats: all-time and year-to-date ─────────────────────────────
  revenueStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { allTime: 0, yearToDate: 0, pendingAmount: 0 };
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const [allTimeRow] = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
      .from(invoicePayments);
    const [ytdRow] = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
      .from(invoicePayments).where(sql`paidAt >= ${yearStart}`);
    const [pendingRow] = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
      .from(invoices).where(and(sql`status IN ('sent','overdue')`, sql`amountPaid < amount`));
    return {
      allTime: Number(allTimeRow?.total ?? 0),
      yearToDate: Number(ytdRow?.total ?? 0),
      pendingAmount: Number(pendingRow?.total ?? 0),
    };
  }),

  // ── Generate PDF on demand for preview ──────────────────────────────────
  getPreviewPdf: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, input.id)).limit(1);
    if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
    let clientName = "Client", clientEmail: string | null = null, clientPhone: string | null = null, clientAddress: string | null = null;
    let proposalTotal: number | null = null, proposalNumber: string | null = null, projectName: string | null = null;
    if (invoice.leadId) {
      const [lead] = await db.select().from(leads).where(eq(leads.id, invoice.leadId)).limit(1);
      if (lead) { clientName = lead.name; clientEmail = lead.email ?? null; clientPhone = lead.phone ?? null; clientAddress = lead.address ?? null; }
      const [est] = await db.select().from(estimates).where(and(eq(estimates.leadId, invoice.leadId), eq(estimates.status, "approved"))).orderBy(desc(estimates.approvedAt)).limit(1);
      if (est) { proposalTotal = Number(est.total ?? 0); proposalNumber = est.estimateNumber ?? null; }
    } else if (invoice.projectId) {
      const [proj] = await db.select().from(projects).where(eq(projects.id, invoice.projectId)).limit(1);
      if (proj) { projectName = proj.name; }
    } else if (invoice.clientId) {
      const [cl] = await db.select().from(clients).where(eq(clients.id, invoice.clientId)).limit(1);
      if (cl) { clientName = cl.name; clientEmail = cl.email ?? null; }
    }
    let lineItems: any[] = [];
    if (invoice.leadId) {
      const [est2] = await db.select().from(estimates).where(and(eq(estimates.leadId, invoice.leadId), eq(estimates.status, "approved"))).orderBy(desc(estimates.approvedAt)).limit(1);
      if (est2) {
        const liRows = await db.select().from(estimateLineItems).where(eq(estimateLineItems.estimateId, est2.id)).orderBy(estimateLineItems.sortOrder);
        lineItems = liRows.map(li => ({ task: li.task, description: li.description, category: li.category, quantity: li.quantity, unit: li.unit }));
      }
    }
    const [billedRow] = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
      .from(invoices).where(and(sql`id != ${invoice.id}`, invoice.leadId ? eq(invoices.leadId, invoice.leadId) : eq(invoices.projectId, invoice.projectId!)));
    const totalBilledSoFar = Number(billedRow?.total ?? 0);
    const { generateInvoicePdf } = await import("./invoicePdf");
    const pdfBuffer = await generateInvoicePdf({
      invoiceNumber: invoice.invoiceNumber ?? `INV-${invoice.id}`,
      invoiceType: invoice.invoiceType,
      status: invoice.status,
      amount: Number(invoice.amount),
      dueDate: invoice.dueDate,
      sentAt: invoice.sentAt,
      notes: invoice.notes ?? undefined,
      squarePaymentUrl: invoice.squarePaymentUrl ?? undefined,
      clientName, clientEmail, clientPhone, clientAddress,
      proposalNumber, proposalTotal, totalBilledSoFar, projectName,
      lineItems,
    });
    const key = `invoices/preview-${invoice.id}-${Date.now()}.pdf`;
    const { url } = await storagePut(key, pdfBuffer, "application/pdf");
    return { url };
  }),

  // Upload a file and attach it to an invoice + customer document library
  uploadAttachment: adminProcedure.input(z.object({
    invoiceId: z.number(),
    projectId: z.number().optional(),
    leadId: z.number().optional(),
    clientId: z.number().optional(),
    fileName: z.string(),
    fileDataBase64: z.string(),
    mimeType: z.string(),
    fileSize: z.number().optional(),
    description: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ALLOWED_MIME = [
      "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain", "text/csv",
    ];
    if (!ALLOWED_MIME.includes(input.mimeType)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `File type '${input.mimeType}' is not allowed.` });
    }
    const base64Data = input.fileDataBase64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    if (buffer.length > 20 * 1024 * 1024) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "File exceeds 20 MB limit." });
    }
    const fileKey = `invoices/${input.invoiceId}/attachments/${nanoid(10)}-${input.fileName}`;
    const { url: fileUrl } = await storagePut(fileKey, buffer, input.mimeType);
    const docType = input.mimeType.startsWith("image/") ? "photo" : "invoice";
    await db.insert(documents).values({
      invoiceId: input.invoiceId,
      projectId: input.projectId,
      leadId: input.leadId,
      clientId: input.clientId,
      uploadedBy: ctx.user.id,
      docType: docType as any,
      fileName: input.fileName,
      fileUrl,
      fileKey,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      description: input.description,
      isPublic: false,
      uploadedByClient: false,
    });
    const [{ newId }] = await db.select({ newId: sql<number>`LAST_INSERT_ID()` }).from(documents);
    return { id: newId, url: fileUrl, fileName: input.fileName, mimeType: input.mimeType };
  }),

  // Get all attachments for an invoice
  getAttachments: adminProcedure.input(z.object({
    invoiceId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(documents)
      .where(eq(documents.invoiceId, input.invoiceId))
      .orderBy(desc(documents.createdAt));
  }),

  // Delete an invoice attachment
   deleteAttachment: adminProcedure.input(z.object({
    documentId: z.number(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(documents).where(eq(documents.id, input.documentId));
    return { success: true };
  }),

  // Get contract info by sign token (public — used on the signing page)
  getContractByToken: publicProcedure.input(z.object({
    token: z.string(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [inv] = await db.select().from(invoices).where(eq(invoices.contractSignToken, input.token)).limit(1);
    if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });
    let clientName = "Valued Client";
    if (inv.leadId) {
      const [lead] = await db.select({ name: leads.name }).from(leads).where(eq(leads.id, inv.leadId)).limit(1);
      if (lead) clientName = lead.name;
    }
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceType: inv.invoiceType,
      amount: inv.amount,
      contractSigned: inv.contractSigned,
      contractSignedAt: inv.contractSignedAt,
      contractSignerName: inv.contractSignerName,
      contractSignedPdfUrl: inv.contractSignedPdfUrl,
      clientName,
      notes: inv.notes,
    };
  }),

  // Sign the contract (public — client signs via token link)
  signContract: publicProcedure.input(z.object({
    token: z.string(),
    signerName: z.string().min(2),
    signatureDataUrl: z.string().min(10),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [inv] = await db.select().from(invoices).where(eq(invoices.contractSignToken, input.token)).limit(1);
    if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });
    if (inv.contractSigned) throw new TRPCError({ code: "BAD_REQUEST", message: "Contract already signed" });
    const signedAt = new Date();
    // Get signer IP
    const signerIp: string | null = (ctx as any)?.req?.headers?.["x-forwarded-for"]?.split(",")?.[0]?.trim()
      ?? (ctx as any)?.req?.socket?.remoteAddress
      ?? null;

    // ── Fetch lead details for PDF ─────────────────────────────────────────
    let clientName = "Valued Client";
    let clientEmail: string | null = null;
    let clientPhone: string | null = null;
    let clientAddress: string | null = null;
    if (inv.leadId) {
      const [lead] = await db.select({
        name: leads.name,
        email: leads.email,
        phone: leads.phone,
        address: leads.address,
      }).from(leads).where(eq(leads.id, inv.leadId)).limit(1);
      if (lead) {
        clientName = lead.name;
        clientEmail = lead.email ?? null;
        clientPhone = lead.phone ?? null;
        clientAddress = lead.address ?? null;
      }
    }

    // ── Fetch project title ────────────────────────────────────────────────
    let projectTitle: string | null = null;
    if (inv.projectId) {
      const [proj] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, inv.projectId)).limit(1);
      if (proj) projectTitle = proj.name;
    }

    // ── Generate stamped contract PDF ──────────────────────────────────────
    let signedPdfUrl: string | undefined;
    let signedPdfKey: string | undefined;
    let signedPdfBuffer: Buffer | undefined;
    try {
      const { generateSignedContractPdf } = await import("./contractPdf");
      signedPdfBuffer = await generateSignedContractPdf({
        invoiceNumber: inv.invoiceNumber ?? String(inv.id),
        invoiceType: inv.invoiceType,
        invoiceAmount: parseFloat(String(inv.amount ?? 0)),
        invoiceNotes: inv.notes,
        clientName,
        clientEmail,
        clientPhone,
        clientAddress,
        projectTitle,
        signatureDataUrl: input.signatureDataUrl,
        signerName: input.signerName,
        signedAt,
        signerIp,
      });
      const pdfKey = `contracts/signed/${inv.invoiceNumber ?? inv.id}-signed-${Date.now()}.pdf`;
      const stored = await storagePut(pdfKey, signedPdfBuffer, "application/pdf");
      signedPdfUrl = stored.url;
      signedPdfKey = stored.key;
      console.log(`[Contract] Signed PDF generated and uploaded: ${signedPdfUrl}`);
    } catch (e) {
      console.error("[Contract] PDF generation/upload failed:", e);
    }

    // ── Update invoice record ──────────────────────────────────────────────
    await db.update(invoices).set({
      contractSigned: true,
      contractSignedAt: signedAt,
      contractSignerName: input.signerName,
      contractSignedPdfUrl: signedPdfUrl ?? null,
      contractSignedPdfKey: signedPdfKey ?? null,
    }).where(eq(invoices.id, inv.id));

    // ── Email signed PDF to client ─────────────────────────────────────────
    if (clientEmail && signedPdfBuffer) {
      try {
        const { sendSignedContractEmail } = await import("./email");
        await sendSignedContractEmail({
          toEmail: clientEmail,
          toName: clientName,
          invoiceNumber: inv.invoiceNumber ?? String(inv.id),
          invoiceAmount: parseFloat(String(inv.amount ?? 0)),
          projectTitle,
          signedAt,
          signedPdfBuffer,
        });
        console.log(`[Contract] Signed contract email sent to ${clientEmail}`);
      } catch (emailErr: any) {
        console.error("[Contract] Signed contract email failed:", emailErr?.message);
      }
    }

    // ── Notify owner ───────────────────────────────────────────────────────
    try {
      const { notifyOwner } = await import("./_core/notification.js");
      await notifyOwner({
        title: `✅ Contract Signed: Invoice #${inv.invoiceNumber}`,
        content: `${clientName} signed the contract for invoice #${inv.invoiceNumber} ($${parseFloat(String(inv.amount)).toFixed(2)}) at ${signedAt.toLocaleString("en-US", { timeZone: "America/New_York" })} ET${signedPdfUrl ? `\nSigned PDF: ${signedPdfUrl}` : ""}`,
      });
    } catch (e) { console.error("[Contract] Notify owner failed:", e); }

    return { success: true, signedPdfUrl: signedPdfUrl ?? null };
  }),

  // ─── Invoice Document Upload ──────────────────────────────────────────────
  uploadDocument: protectedProcedure.input(z.object({
    invoiceId: z.number(),
    leadId: z.number().optional(),
    filename: z.string(),
    mimeType: z.string(),
    fileSize: z.number().max(25 * 1024 * 1024, "File must be under 25MB"),
    fileDataBase64: z.string(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // MIME type validation — allow PDF, images, DWG, common doc formats
    const ALLOWED_MIMES = [
      "application/pdf",
      "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/heic",
      "image/svg+xml",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-powerpoint",
      "application/zip", "application/x-zip-compressed",
      "text/plain",
      "application/acad", "image/vnd.dwg", "application/dwg",
    ];
    if (!ALLOWED_MIMES.includes(input.mimeType)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `File type '${input.mimeType}' is not allowed.` });
    }
    // Verify invoice exists
    const [inv] = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1);
    if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
    // Upload to S3
    const fileBuffer = Buffer.from(input.fileDataBase64, "base64");
    const ext = input.filename.split(".").pop() ?? "bin";
    const fileKey = `invoice-docs/${input.invoiceId}/${nanoid(12)}.${ext}`;
    const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);
    // Save to DB
    await db.insert(invoiceDocuments).values({
      invoiceId: input.invoiceId,
      leadId: input.leadId ?? null,
      fileKey,
      fileUrl: url,
      filename: input.filename,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
    });
    return { success: true, url, fileKey, filename: input.filename };
  }),

  listDocuments: protectedProcedure.input(z.object({
    invoiceId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(invoiceDocuments)
      .where(eq(invoiceDocuments.invoiceId, input.invoiceId))
      .orderBy(desc(invoiceDocuments.uploadedAt));
  }),

  deleteDocument: protectedProcedure.input(z.object({
    id: z.number(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(invoiceDocuments).where(eq(invoiceDocuments.id, input.id));
    return { success: true };
  }),

  // ── Save draft / autosave for invoice create + edit ──────────────────────
  saveDraft: adminProcedure.input(z.object({
    id: z.number().optional(),          // undefined = create new, number = update existing
    amount: z.string().optional(),
    invoiceType: z.enum(["deposit","progress","final","change_order","other"]).optional(),
    dueDate: z.string().optional(),
    notes: z.string().optional(),
    // Only used when creating a new invoice:
    projectId: z.number().optional(),
    clientId: z.number().optional(),
    leadId: z.number().optional(),
    // Timestamp for latest-write protection
    _savedAt: z.number().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    if (input.id) {
      // ── Update existing invoice ──────────────────────────────────────────
      const [existing] = await db.select().from(invoices).where(eq(invoices.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });

      const updateData: any = {};
      if (input.amount !== undefined) updateData.amount = input.amount;
      if (input.invoiceType !== undefined) updateData.invoiceType = input.invoiceType;
      if (input.dueDate !== undefined) updateData.dueDate = input.dueDate ? new Date(input.dueDate) : null;
      if (input.notes !== undefined) updateData.notes = input.notes;

      if (Object.keys(updateData).length > 0) {
        await db.update(invoices).set(updateData).where(eq(invoices.id, input.id));
      }
      return { id: input.id, created: false };
    } else {
      // ── Create new invoice ───────────────────────────────────────────────
      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
      await db.insert(invoices).values({
        projectId: input.projectId,
        clientId: input.clientId,
        leadId: input.leadId,
        invoiceNumber,
        invoiceType: input.invoiceType ?? "other",
        amount: (input.amount || "0") as any,
        dueDate: input.dueDate ? new Date(input.dueDate) : new Date(),
        notes: input.notes ?? null,
        status: "draft",
      });
      const [{ newId }] = await db.select({ newId: sql<number>`LAST_INSERT_ID()` }).from(invoices).limit(1);
      return { id: newId, created: true, invoiceNumber };
    }
  }),
});
// ─── Schedule router ──────────────────────────────────────────────────────────
const scheduleRouter = router({
  list: protectedProcedure.input(z.object({
    projectId: z.number().optional(),
    assigneeId: z.number().optional(),
    startFrom: z.string().optional(),
    startTo: z.string().optional(),
  }).optional()).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(scheduleEvents).orderBy(scheduleEvents.startTime);
  }),

  create: adminProcedure.input(z.object({
    projectId: z.number().optional(),
    title: z.string(),
    eventType: z.enum(["milestone","crew_assignment","vendor_visit","delivery","inspection","consultation","other"]),
    assigneeType: z.enum(["crew","vendor","owner"]).optional(),
    assigneeId: z.number().optional(),
    startTime: z.string(),
    endTime: z.string().optional(),
    allDay: z.boolean().optional(),
    location: z.string().optional(),
    notes: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(scheduleEvents).values({
      ...input,
      startTime: new Date(input.startTime),
      endTime: input.endTime ? new Date(input.endTime) : undefined,
    });
    const [{ newId }] = await db.select({ newId: sql<number>`LAST_INSERT_ID()` }).from(scheduleEvents).limit(1);
    return { id: newId };
  }),

  update: adminProcedure.input(z.object({
    id: z.number(),
    status: z.enum(["scheduled","confirmed","in_progress","completed","cancelled","rescheduled"]).optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    notes: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, startTime, endTime, ...rest } = input;
    const updateData: any = { ...rest };
    if (startTime) updateData.startTime = new Date(startTime);
    if (endTime) updateData.endTime = new Date(endTime);
    await db.update(scheduleEvents).set(updateData).where(eq(scheduleEvents.id, id));
    return { success: true };
  }),

  delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(scheduleEvents).where(eq(scheduleEvents.id, input.id));
    return { success: true };
  }),
  updateProjectDates: adminProcedure.input(z.object({
    id: z.number(),
    startDate: z.string().optional(),
    estimatedEndDate: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const updateData: Record<string, any> = {};
    if (input.startDate !== undefined) updateData.startDate = input.startDate ? new Date(input.startDate) : null;
    if (input.estimatedEndDate !== undefined) updateData.estimatedEndDate = input.estimatedEndDate ? new Date(input.estimatedEndDate) : null;
    await db.update(projects).set(updateData).where(eq(projects.id, input.id));
    return { success: true };
  }),
  updateMilestoneDates: adminProcedure.input(z.object({
    id: z.number(),
    dueDate: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(milestones).set({ dueDate: input.dueDate ? new Date(input.dueDate) : null }).where(eq(milestones.id, input.id));
    return { success: true };
  }),
  gantt: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { projects: [], proposals: [], events: [] };
    const projectRows = await db.select().from(projects).orderBy(projects.startDate);
    const proposalRows = await db.select().from(estimates).orderBy(estimates.createdAt);
    const eventRows = await db.select().from(scheduleEvents).orderBy(scheduleEvents.startTime);
    const milestoneRows = await db.select().from(milestones).orderBy(milestones.sortOrder);
    const leadRows = await db.select({ id: leads.id, name: leads.name }).from(leads);
    const clientRows = await db.select({ id: clients.id, name: clients.name }).from(clients);
    const colorPalette = ["#D4A853","#6B8E6B","#7B9BB5","#C47B5A","#9B7BC4","#5AB5A8","#C45A7B","#8BB57B","#B5895A","#5A7BB5"];
    const clientColorMap: Record<string, string> = {};
    let colorIdx = 0;
    const getClientColor = (key: string | null | undefined): string => {
      const k = String(key ?? "unknown");
      if (!clientColorMap[k]) { clientColorMap[k] = colorPalette[colorIdx % colorPalette.length]; colorIdx++; }
      return clientColorMap[k];
    };
    const leadNameMap = new Map(leadRows.map(l => [l.id, l.name]));
    const clientNameMap = new Map(clientRows.map(c => [c.id, c.name]));
    const projectsWithColor = projectRows.map(p => ({
      ...p,
      color: p.color || getClientColor(String(p.clientId ?? p.leadId)),
      clientName: (p.clientId ? clientNameMap.get(p.clientId) : null) ?? (p.leadId ? leadNameMap.get(p.leadId) : null) ?? p.name,
    }));
    const proposalsWithColor = proposalRows.map(e => ({
      ...e,
      color: getClientColor(String((e as any).clientId ?? (e as any).leadId)),
      clientName: ((e as any).clientId ? clientNameMap.get((e as any).clientId) : null) ?? ((e as any).leadId ? leadNameMap.get((e as any).leadId) : null) ?? (e as any).clientName ?? "Unknown",
    }));
    return { projects: projectsWithColor, proposals: proposalsWithColor, events: eventRows, milestones: milestoneRows };
  }),
});

// ─── Purchase Orders router ───────────────────────────────────────────────────
const purchaseOrdersRouter = router({
  list: adminProcedure.input(z.object({ projectId: z.number().optional() }).optional()).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    const pos = await db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.createdAt));
    return pos;
  }),

  get: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.id)).limit(1);
    if (!po[0]) return null;
    const items = await db.select().from(poLineItems).where(eq(poLineItems.poId, input.id)).orderBy(poLineItems.sortOrder);
    return { ...po[0], lineItems: items };
  }),

  create: adminProcedure.input(z.object({
    projectId: z.number().optional(),
    vendorId: z.number().optional(),
    title: z.string(),
    notes: z.string().optional(),
    expectedDelivery: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Generate KP-style PO number: PO-YYYY-NNN
    const year = new Date().getFullYear();
    const yearPrefix = `PO-${year}-`;
    const existing = await db.select({ poNumber: purchaseOrders.poNumber }).from(purchaseOrders)
      .where(sql`poNumber LIKE ${yearPrefix + '%'}`);
    let maxSeq = 0;
    for (const row of existing) {
      const parts = (row.poNumber ?? "").split("-");
      const seq = parseInt(parts[2] ?? "0", 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
    const poNumber = `PO-${year}-${String(maxSeq + 1).padStart(3, "0")}`;
    await db.insert(purchaseOrders).values({
      projectId: input.projectId ?? 0,
      vendorId: input.vendorId,
      title: input.title,
      notes: input.notes,
      poNumber,
      expectedDelivery: input.expectedDelivery ? new Date(input.expectedDelivery) : undefined,
    });
    const [{ newId }] = await db.select({ newId: sql<number>`LAST_INSERT_ID()` }).from(purchaseOrders).limit(1);
    return { id: newId, poNumber };
  }),

  update: adminProcedure.input(z.object({
    id: z.number(),
    title: z.string().optional(),
    vendorId: z.number().optional(),
    projectId: z.number().optional(),
    notes: z.string().optional(),
    status: z.enum(["draft","sent","acknowledged","delivered","invoiced","paid","cancelled"]).optional(),
    expectedDelivery: z.string().optional(),
    deliveredAt: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, deliveredAt, expectedDelivery, ...rest } = input;
    const updateData: any = { ...rest };
    if (deliveredAt) updateData.deliveredAt = new Date(deliveredAt);
    if (expectedDelivery) updateData.expectedDelivery = new Date(expectedDelivery);
    await db.update(purchaseOrders).set(updateData).where(eq(purchaseOrders.id, id));
    return { success: true };
  }),

  addLineItem: adminProcedure.input(z.object({
    poId: z.number(),
    itemTitle: z.string().optional(),
    description: z.string(),
    quantity: z.string().optional(),
    unit: z.string().optional(),
    unitCost: z.string(),
    sortOrder: z.number().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const qty = parseFloat(input.quantity ?? "1");
    const cost = parseFloat(input.unitCost);
    const lineTotal = qty * cost;
    await db.insert(poLineItems).values({
      poId: input.poId,
      itemTitle: input.itemTitle ?? null,
      description: input.description,
      quantity: input.quantity as any ?? "1.00",
      unit: input.unit,
      unitCost: input.unitCost as any,
      lineTotal: lineTotal.toFixed(2) as any,
      sortOrder: input.sortOrder ?? 0,
    });
    // Recalculate PO totals
    const items = await db.select().from(poLineItems).where(eq(poLineItems.poId, input.poId));
    const subtotal = items.reduce((sum, item) => sum + parseFloat(String(item.lineTotal ?? 0)), 0);
    await db.update(purchaseOrders).set({
      subtotal: subtotal.toFixed(2) as any,
      total: subtotal.toFixed(2) as any,
    }).where(eq(purchaseOrders.id, input.poId));
    const [{ newId }] = await db.select({ newId: sql<number>`LAST_INSERT_ID()` }).from(poLineItems).limit(1);
    return { id: newId };
  }),

  deleteLineItem: adminProcedure.input(z.object({ id: z.number(), poId: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(poLineItems).where(eq(poLineItems.id, input.id));
    // Recalculate PO totals
    const items = await db.select().from(poLineItems).where(eq(poLineItems.poId, input.poId));
    const subtotal = items.reduce((sum, item) => sum + parseFloat(String(item.lineTotal ?? 0)), 0);
    await db.update(purchaseOrders).set({
      subtotal: subtotal.toFixed(2) as any,
      total: subtotal.toFixed(2) as any,
    }).where(eq(purchaseOrders.id, input.poId));
    return { success: true };
  }),

  delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(poLineItems).where(eq(poLineItems.poId, input.id));
    await db.delete(purchaseOrders).where(eq(purchaseOrders.id, input.id));
    return { success: true };
  }),

  send: adminProcedure.input(z.object({
    id: z.number(),
    origin: z.string(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.id)).limit(1);
    if (!po[0]) throw new TRPCError({ code: "NOT_FOUND" });
    const items = await db.select().from(poLineItems).where(eq(poLineItems.poId, input.id)).orderBy(poLineItems.sortOrder);
    let vendor = null;
    if (po[0].vendorId) {
      const vRows = await db.select().from(vendors).where(eq(vendors.id, po[0].vendorId)).limit(1);
      vendor = vRows[0] ?? null;
    }
    let project = null;
    if (po[0].projectId) {
      const pRows = await db.select().from(projects).where(eq(projects.id, po[0].projectId)).limit(1);
      project = pRows[0] ?? null;
    }
    // Generate PDF
    let pdfBuffer: Buffer | undefined;
    try {
      const { generatePoPdf } = await import("./poPdf");
      pdfBuffer = await generatePoPdf({
        po: po[0],
        vendor,
        project,
        lineItems: items,
      });
    } catch (pdfErr) {
      console.error("[PO PDF] generation failed:", pdfErr);
    }
    // Send email to vendor
    let emailSent = false;
    let emailError: string | undefined;
    if (vendor?.email) {
      try {
        const { sendPoEmail } = await import("./email");
        await sendPoEmail({
          to: vendor.email,
          vendorName: vendor.companyName,
          poNumber: po[0].poNumber ?? "N/A",
          projectName: project?.name ?? "Kitchens Plus Project",
          title: po[0].title ?? "Purchase Order",
          total: parseFloat(String(po[0].total ?? "0")),
          expectedDelivery: po[0].expectedDelivery ?? undefined,
          notes: po[0].notes ?? undefined,
          lineItems: items.map(li => ({
            description: li.description,
            quantity: parseFloat(String(li.quantity ?? "1")),
            unit: li.unit ?? undefined,
            unitCost: parseFloat(String(li.unitCost ?? "0")),
            lineTotal: parseFloat(String(li.lineTotal ?? "0")),
          })),
          pdfBuffer,
        });
        emailSent = true;
      } catch (emailErr: any) {
        emailError = emailErr.message;
        console.error("[PO Email] failed:", emailErr);
      }
    }
    // Mark as sent
    await db.update(purchaseOrders).set({ status: "sent" }).where(eq(purchaseOrders.id, input.id));
    // Notify owner
    try {
      const { notifyOwner } = await import("./_core/notification");
      await notifyOwner({
        title: `PO Sent: ${po[0].poNumber}`,
        content: `Purchase order ${po[0].poNumber} sent to ${vendor?.companyName ?? "vendor"}. Total: $${parseFloat(String(po[0].total ?? "0")).toLocaleString()}`,
      });
    } catch {}
    return { success: true, emailSent, emailError: emailError ?? null };
  }),

  // ── Send PO Request (step 1: ask vendor for pricing) ──────────────────────
  sendRequest: adminProcedure.input(z.object({
    id: z.number(),
    origin: z.string(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.id)).limit(1);
    if (!po[0]) throw new TRPCError({ code: "NOT_FOUND" });
    const items = await db.select().from(poLineItems).where(eq(poLineItems.poId, input.id)).orderBy(poLineItems.sortOrder);
    let vendor = null;
    if (po[0].vendorId) {
      const vRows = await db.select().from(vendors).where(eq(vendors.id, po[0].vendorId)).limit(1);
      vendor = vRows[0] ?? null;
    }
    let project = null;
    if (po[0].projectId) {
      const pRows = await db.select().from(projects).where(eq(projects.id, po[0].projectId)).limit(1);
      project = pRows[0] ?? null;
    }
    // Send request-for-pricing email to vendor
    let emailSent = false;
    let emailError: string | undefined;
    if (vendor?.email) {
      try {
        const { sendPoRequestEmail } = await import("./email");
        await sendPoRequestEmail({
          to: vendor.email,
          vendorName: vendor.companyName,
          poNumber: po[0].poNumber ?? "N/A",
          projectName: project?.name ?? "Kitchens Plus Project",
          title: po[0].title ?? "Pricing Request",
          notes: po[0].notes ?? undefined,
          lineItems: items.map(li => ({
            itemTitle: li.itemTitle ?? undefined,
            description: li.description,
            quantity: parseFloat(String(li.quantity ?? "1")),
            unit: li.unit ?? undefined,
          })),
          replyEmail: process.env.GMAIL_USER ?? "info@kitchensplus.com",
        });
        emailSent = true;
      } catch (emailErr: any) {
        emailError = emailErr.message;
        console.error("[PO Request Email] failed:", emailErr);
      }
    }
    // Mark as request_sent
    await db.update(purchaseOrders).set({ status: "request_sent" }).where(eq(purchaseOrders.id, input.id));
    // Notify owner
    try {
      const { notifyOwner } = await import("./_core/notification");
      await notifyOwner({
        title: `PO Request Sent: ${po[0].poNumber}`,
        content: `Pricing request sent to ${vendor?.companyName ?? "vendor"} for ${po[0].title ?? "PO"}. Awaiting quote.`,
      });
    } catch {}
    return { success: true, emailSent, emailError: emailError ?? null };
  }),

  // ── Approve PO (step 2: convert request to approved PO) ───────────────────
  approve: adminProcedure.input(z.object({
    id: z.number(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(purchaseOrders).set({ status: "approved" }).where(eq(purchaseOrders.id, input.id));
    return { success: true };
  }),
});
// ─── Crew router ──────────────────────────────────────────────────────────────
const crewRouter = router({
  list: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(crewMembers).where(eq(crewMembers.isActive, true));
  }),

  create: adminProcedure.input(z.object({
    name: z.string(),
    email: z.string().optional(),
    phone: z.string().optional(),
    role: z.string().optional(),
    hourlyRate: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(crewMembers).values({
      ...input,
      hourlyRate: input.hourlyRate as any,
    });
    const [{ newId }] = await db.select({ newId: sql<number>`LAST_INSERT_ID()` }).from(crewMembers).limit(1);
    return { id: newId };
  }),

  update: adminProcedure.input(z.object({
    id: z.number(),
    name: z.string().optional(),
    isActive: z.boolean().optional(),
    role: z.string().optional(),
    hourlyRate: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, ...data } = input;
     await db.update(crewMembers).set(data as any).where(eq(crewMembers.id, id));
    return { success: true };
  }),

  delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(crewMembers).set({ isActive: false }).where(eq(crewMembers.id, input.id));
    return { success: true };
  }),

  // Time tracking
  clockIn: adminProcedure.input(z.object({
    crewMemberId: z.number(),
    projectId: z.number().optional(),
    notes: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Check if already clocked in
    const existing = await db.select().from(crewTimeLogs)
      .where(and(eq(crewTimeLogs.crewMemberId, input.crewMemberId), sql`clockOut IS NULL`))
      .limit(1);
    if (existing[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Already clocked in" });
    await db.insert(crewTimeLogs).values({
      crewMemberId: input.crewMemberId,
      projectId: input.projectId,
      clockIn: new Date(),
      notes: input.notes,
    });
    const [{ newId }] = await db.select({ newId: sql<number>`LAST_INSERT_ID()` }).from(crewTimeLogs).limit(1);
    return { id: newId };
  }),

  clockOut: adminProcedure.input(z.object({
    crewMemberId: z.number(),
    notes: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const openLog = await db.select().from(crewTimeLogs)
      .where(and(eq(crewTimeLogs.crewMemberId, input.crewMemberId), sql`clockOut IS NULL`))
      .limit(1);
    if (!openLog[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Not clocked in" });
    const clockOut = new Date();
    const hoursWorked = ((clockOut.getTime() - new Date(openLog[0].clockIn).getTime()) / 3600000).toFixed(2);
    await db.update(crewTimeLogs).set({
      clockOut,
      hoursWorked: hoursWorked as any,
      notes: input.notes ?? openLog[0].notes,
    }).where(eq(crewTimeLogs.id, openLog[0].id));
    return { hoursWorked: parseFloat(hoursWorked) };
  }),

  listTimeLogs: adminProcedure.input(z.object({
    crewMemberId: z.number().optional(),
    projectId: z.number().optional(),
  }).optional()).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    let q = db.select({
      log: crewTimeLogs,
      memberName: crewMembers.name,
      projectName: projects.name,
    }).from(crewTimeLogs)
      .leftJoin(crewMembers, eq(crewTimeLogs.crewMemberId, crewMembers.id))
      .leftJoin(projects, eq(crewTimeLogs.projectId, projects.id));
    const conditions = [];
    if (input?.crewMemberId) conditions.push(eq(crewTimeLogs.crewMemberId, input.crewMemberId));
    if (input?.projectId) conditions.push(eq(crewTimeLogs.projectId, input.projectId));
    if (conditions.length) q = (q as any).where(and(...conditions));
    return (q as any).orderBy(desc(crewTimeLogs.clockIn));
  }),

  getActiveClockIn: adminProcedure.input(z.object({ crewMemberId: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const result = await db.select().from(crewTimeLogs)
      .where(and(eq(crewTimeLogs.crewMemberId, input.crewMemberId), sql`clockOut IS NULL`))
      .limit(1);
    return result[0] ?? null;
  }),

  addSetFee: adminProcedure.input(z.object({
    crewMemberId: z.number(),
    projectId: z.number().optional(),
    weekStartDate: z.string(),
    amount: z.string(),
    notes: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(crewSetFees).values({
      crewMemberId: input.crewMemberId,
      projectId: input.projectId,
      weekStartDate: new Date(input.weekStartDate),
      amount: input.amount as any,
      notes: input.notes,
    });
    const [{ newId }] = await db.select({ newId: sql<number>`LAST_INSERT_ID()` }).from(crewSetFees).limit(1);
    return { id: newId };
  }),

  listSetFees: adminProcedure.input(z.object({
    crewMemberId: z.number().optional(),
    projectId: z.number().optional(),
  }).optional()).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    let q = db.select({
      fee: crewSetFees,
      memberName: crewMembers.name,
      projectName: projects.name,
    }).from(crewSetFees)
      .leftJoin(crewMembers, eq(crewSetFees.crewMemberId, crewMembers.id))
      .leftJoin(projects, eq(crewSetFees.projectId, projects.id));
    const conditions = [];
    if (input?.crewMemberId) conditions.push(eq(crewSetFees.crewMemberId, input.crewMemberId));
    if (input?.projectId) conditions.push(eq(crewSetFees.projectId, input.projectId));
    if (conditions.length) q = (q as any).where(and(...conditions));
    return (q as any).orderBy(desc(crewSetFees.weekStartDate));
  }),

  notifyClockIn: adminProcedure.input(z.object({
    crewMemberId: z.number(),
    projectId: z.number().optional(),
    action: z.enum(["clock_in", "clock_out"]),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) return { sent: false };
    const memberRows = await db.select().from(crewMembers).where(eq(crewMembers.id, input.crewMemberId)).limit(1);
    const member = memberRows[0];
    if (!member) return { sent: false };
    let projectName = "";
    if (input.projectId) {
      const projRows = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, input.projectId)).limit(1);
      projectName = projRows[0]?.name ?? "";
    }
    const actionLabel = input.action === "clock_in" ? "clocked IN" : "clocked OUT";
    const timeStr = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const msg = `Kitchens Plus Upstate — ${member.name} has ${actionLabel} at ${timeStr}${projectName ? " on project: " + projectName : ""}. Call Chad at 864-567-8777.`;
    const results = { email: false, sms: false };
    if (member.email) {
      try {
        const { sendCrewNotificationEmail } = await import("./email");
        await sendCrewNotificationEmail({ to: member.email, subject: `Kitchens Plus — ${actionLabel.replace(" ", " ")}`, message: msg });
        results.email = true;
      } catch { /* non-blocking */ }
    }
    if (member.phone) {
      try {
        await sendSms({ to: member.phone, message: msg });
        results.sms = true;
      } catch { /* non-blocking */ }
    }
    return { sent: true, ...results };
  }),
});
// ─── Settings router ──────────────────────────────────────────────────────────
const settingsRouter = router({
  getAll: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(appSettings);
  }),

  get: publicProcedure.input(z.object({ key: z.string() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const result = await db.select().from(appSettings).where(eq(appSettings.key, input.key)).limit(1);
    return result[0]?.value ?? null;
  }),

  set: adminProcedure.input(z.object({ key: z.string(), value: z.string() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(appSettings).values({ key: input.key, value: input.value })
      .onDuplicateKeyUpdate({ set: { value: input.value } });
    return { success: true };
  }),

  getSystemConfig: adminProcedure.query(async () => {
    return {
      squareConfigured: !!(process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_LOCATION_ID),
    };
  }),

  getProjectTypes: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(projectTypes).where(eq(projectTypes.isActive, true)).orderBy(projectTypes.sortOrder);
  }),

  createProjectType: adminProcedure.input(z.object({ name: z.string() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(projectTypes).values({ name: input.name, isDefault: false, isActive: true });
    const [{ newId }] = await db.select({ newId: sql<number>`LAST_INSERT_ID()` }).from(projectTypes).limit(1);
    return { id: newId };
  }),

  deleteProjectType: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(projectTypes).set({ isActive: false }).where(eq(projectTypes.id, input.id));
    return { success: true };
  }),
});

// ─── Reports router ───────────────────────────────────────────────────────────
const reportsRouter = router({
  summary: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const [totalLeads] = await db.select({ count: sql<number>`count(*)` }).from(leads);
    const [totalProjects] = await db.select({ count: sql<number>`count(*)` }).from(projects);
    const [activeProjects] = await db.select({ count: sql<number>`count(*)` }).from(projects).where(eq(projects.status, "active"));
    const [completedProjects] = await db.select({ count: sql<number>`count(*)` }).from(projects).where(eq(projects.status, "completed"));
    const [totalVendors] = await db.select({ count: sql<number>`count(*)` }).from(vendors).where(eq(vendors.isActive, true));
    const [paidInvoices] = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` }).from(invoices).where(eq(invoices.status, "paid"));
    const [pendingInvoices] = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` }).from(invoices).where(eq(invoices.status, "sent"));
    const wonLeads = await db.select({ count: sql<number>`count(*)` }).from(leads).where(eq(leads.status, "won"));
    const lostLeads = await db.select({ count: sql<number>`count(*)` }).from(leads).where(eq(leads.status, "lost"));
    // Open RFIs: sent or returned but not yet reviewed
    // NOTE: the column is named 'rfiStatus' in the DB (not 'status'), so use raw SQL
    const [openRfis] = await db
      .select({ count: sql<number>`count(*)` })
      .from(rfis)
      .where(sql`rfiStatus IN ('sent', 'returned')`);
    return {
      totalLeads: Number(totalLeads.count),
      totalProjects: Number(totalProjects.count),
      activeProjects: Number(activeProjects.count),
      completedProjects: Number(completedProjects.count),
      totalVendors: Number(totalVendors.count),
      revenueCollected: parseFloat(paidInvoices.total ?? "0"),
      revenuePending: parseFloat(pendingInvoices.total ?? "0"),
      wonLeads: Number(wonLeads[0]?.count ?? 0),
      lostLeads: Number(lostLeads[0]?.count ?? 0),
      openRfisCount: Number(openRfis?.count ?? 0),
    };
  }),

  recentProjects: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(projects).orderBy(desc(projects.updatedAt)).limit(10);
  }),

  recentLeads: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(leads).orderBy(desc(leads.createdAt)).limit(10);
  }),

  revenueByMonth: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select({
      month: sql<string>`DATE_FORMAT(paidAt, '%b %Y')`,
      revenue: sql<string>`COALESCE(SUM(amount), 0)`,
    }).from(invoices).where(eq(invoices.status, "paid")).groupBy(sql`DATE_FORMAT(paidAt, '%Y-%m')`).orderBy(sql`DATE_FORMAT(paidAt, '%Y-%m')`);
    return rows.map(r => ({ month: r.month, revenue: parseFloat(r.revenue) }));
  }),

  projectsByType: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select({
      type: projects.projectType,
      count: sql<number>`count(*)`,
    }).from(projects).groupBy(projects.projectType);
    return rows.map(r => ({ type: r.type ?? "Unknown", count: Number(r.count) }));
  }),

  totalStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const [totalClients] = await db.select({ count: sql<number>`count(*)` }).from(clients);
    const [paidInvoices] = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` }).from(invoices).where(eq(invoices.status, "paid"));
    const [activeProjects] = await db.select({ count: sql<number>`count(*)` }).from(projects).where(eq(projects.status, "active"));
    const [avgVal] = await db.select({ avg: sql<string>`COALESCE(AVG(contractValue), 0)` }).from(projects);
    return {
      totalRevenue: parseFloat(paidInvoices.total ?? "0"),
      totalClients: Number(totalClients.count),
      activeProjects: Number(activeProjects.count),
      avgProjectValue: parseFloat(avgVal.avg ?? "0"),
    };
  }),

  // ── Export all payments for a given month as CSV data ─────────────────────
  exportPaymentsCsv: adminProcedure
    .input(z.object({ year: z.number().int().min(2020).max(2100), month: z.number().int().min(1).max(12) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], csv: "" };

      const { year, month } = input;
      const monthStart = `${year}-${String(month).padStart(2,'0')}-01 00:00:00`;
      const lastDay = new Date(year, month, 0).getDate();
      const monthEnd = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')} 23:59:59`;

      // Join invoice_payments with invoices and leads/clients for full context
      const rows = await db
        .select({
          paymentId: invoicePayments.id,
          paidAt: invoicePayments.paidAt,
          amount: invoicePayments.amount,
          method: invoicePayments.method,
          note: invoicePayments.note,
          squarePaymentId: invoicePayments.squarePaymentId,
          invoiceId: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          invoiceType: invoices.invoiceType,
          invoiceAmount: invoices.amount,
          leadId: invoices.leadId,
          projectId: invoices.projectId,
        })
        .from(invoicePayments)
        .innerJoin(invoices, eq(invoicePayments.invoiceId, invoices.id))
        .where(sql`${invoicePayments.paidAt} BETWEEN ${monthStart} AND ${monthEnd}`)
        .orderBy(asc(invoicePayments.paidAt));

      // Resolve client names
      const enriched = await Promise.all(rows.map(async (r) => {
        let clientName = "";
        let projectName = "";
        if (r.leadId) {
          const [lead] = await db.select({ name: leads.name }).from(leads).where(eq(leads.id, r.leadId)).limit(1);
          clientName = lead?.name ?? "";
        }
        if (r.projectId) {
          const [proj] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, r.projectId)).limit(1);
          projectName = proj?.name ?? "";
          if (!clientName && (proj as any)?.leadId) {
            const [lead2] = await db.select({ name: leads.name }).from(leads).where(eq(leads.id, (proj as any).leadId)).limit(1);
            clientName = lead2?.name ?? "";
          }
        }
        const paidDate = r.paidAt ? new Date(r.paidAt).toLocaleDateString("en-US") : "";
        return {
          Date: paidDate,
          "Invoice #": r.invoiceNumber ?? `INV-${r.invoiceId}`,
          "Invoice Type": (r.invoiceType ?? "").replace(/_/g, " "),
          Client: clientName,
          Project: projectName,
          "Invoice Total": Number(r.invoiceAmount ?? 0).toFixed(2),
          "Payment Amount": Number(r.amount ?? 0).toFixed(2),
          Method: r.method ?? "",
          Note: r.note ?? "",
          "Square ID": r.squarePaymentId ?? "",
        };
      }));

      // Build CSV string
      const headers = ["Date","Invoice #","Invoice Type","Client","Project","Invoice Total","Payment Amount","Method","Note","Square ID"];
      const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
      const csvLines = [
        headers.map(escape).join(","),
        ...enriched.map(row => headers.map(h => escape((row as any)[h] ?? "")).join(",")),
      ];

      // Summary totals row
      const totalAmount = enriched.reduce((s, r) => s + parseFloat(r["Payment Amount"]), 0);
      csvLines.push("");
      csvLines.push(`"TOTAL","","","","","","${totalAmount.toFixed(2)}","","",""`);

      const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      return {
        rows: enriched,
        csv: csvLines.join("\n"),
        filename: `KitchensPlus_Payments_${MONTH_NAMES[month - 1]}_${year}.csv`,
        totalAmount,
        rowCount: enriched.length,
      };
    }),

  // Monthly revenue collected + jobs awarded (won leads) for current year
  monthlyChart: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const year = new Date().getFullYear();
    const yearStartStr = `${year}-01-01 00:00:00`;
    const yearEndStr = `${year}-12-31 23:59:59`;

    // TiDB Serverless does not support MONTH() or DATE_FORMAT().
    // Fetch raw rows for the year and group by month in JavaScript instead.
    const revenueRaw = await db.select({
      paidAt: invoicePayments.paidAt,
      amount: invoicePayments.amount,
    }).from(invoicePayments)
      .where(sql`${invoicePayments.paidAt} BETWEEN ${yearStartStr} AND ${yearEndStr}`);

    // Jobs awarded: use approved estimates total (leads.budget was removed from schema)
    const jobsRaw = await db.select({
      updatedAt: leads.updatedAt,
    }).from(leads)
      .where(and(eq(leads.status, "won"), sql`${leads.updatedAt} BETWEEN ${yearStartStr} AND ${yearEndStr}`));

    // Approved proposal totals for won leads in this year
    const wonEstimatesRaw = await db.select({
      approvedAt: estimates.approvedAt,
      total: estimates.total,
    }).from(estimates)
      .where(and(
        eq(estimates.status, "approved"),
        sql`${estimates.approvedAt} BETWEEN ${yearStartStr} AND ${yearEndStr}`
      ));

    // Aggregate in JS — month index 0-11
    const revenueByMonth = new Array(12).fill(0);
    for (const r of revenueRaw) {
      if (r.paidAt) {
        const m = new Date(r.paidAt).getMonth(); // 0-based
        revenueByMonth[m] += Number(r.amount ?? 0);
      }
    }
    const jobsValueByMonth = new Array(12).fill(0);
    const jobsCountByMonth = new Array(12).fill(0);
    for (const r of jobsRaw) {
      if (r.updatedAt) {
        const m = new Date(r.updatedAt).getMonth();
        jobsCountByMonth[m] += 1;
      }
    }
    for (const r of wonEstimatesRaw) {
      if (r.approvedAt) {
        const m = new Date(r.approvedAt).getMonth();
        jobsValueByMonth[m] += Number(r.total ?? 0);
      }
    }

    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return MONTHS.map((name, i) => ({
      month: name,
      revenue: revenueByMonth[i],
      jobsValue: jobsValueByMonth[i],
      jobsCount: jobsCountByMonth[i],
    }));
  }),

  exportMonthlySummaryPdf: adminProcedure.input(z.object({
    month: z.number().min(1).max(12),
    year: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { month, year } = input;
    const startDate = `${year}-${String(month).padStart(2,'0')}-01 00:00:00`;
    const lastDayE = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2,'0')}-${String(lastDayE).padStart(2,'0')} 23:59:59`;
    const rows = await db.select({
      paidAt: invoicePayments.paidAt,
      amount: invoicePayments.amount,
      method: invoicePayments.method,
      note: invoicePayments.note,
      squarePaymentId: invoicePayments.squarePaymentId,
      invoiceId: invoicePayments.invoiceId,
      invoiceNumber: invoices.invoiceNumber,
      invoiceAmount: invoices.amount,
      invoiceType: invoices.invoiceType,
      leadId: invoices.leadId,
      projectId: invoices.projectId,
    }).from(invoicePayments)
      .leftJoin(invoices, eq(invoicePayments.invoiceId, invoices.id))
      .where(sql`${invoicePayments.paidAt} BETWEEN ${startDate} AND ${endDate}`)
      .orderBy(asc(invoicePayments.paidAt));
    const enriched = await Promise.all(rows.map(async (r) => {
      let clientName = "";
      let projectName = "";
      if (r.leadId) {
        const [lead] = await db.select({ name: leads.name }).from(leads).where(eq(leads.id, r.leadId)).limit(1);
        clientName = lead?.name ?? "";
      }
      if (r.projectId) {
        const [proj] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, r.projectId)).limit(1);
        projectName = proj?.name ?? "";
      }
      return { paidAt: r.paidAt, amount: Number(r.amount ?? 0), method: r.method ?? "", note: r.note ?? "", invoiceNumber: r.invoiceNumber ?? `INV-${r.invoiceId}`, invoiceType: (r.invoiceType ?? "").replace(/_/g, " "), clientName, projectName, squarePaymentId: r.squarePaymentId ?? "" };
    }));
    const totalAmount = enriched.reduce((s, r) => s + r.amount, 0);
    const byMethod: Record<string, number> = {};
    for (const r of enriched) { byMethod[r.method] = (byMethod[r.method] ?? 0) + r.amount; }
    const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const monthName = MONTH_NAMES[month - 1];
    // Generate PDF using pdfkit
    const PDFDocument = (await import("pdfkit")).default;
    const doc = new PDFDocument({ margin: 50, size: "LETTER" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    await new Promise<void>(resolve => { doc.on("end", resolve); 
      // Header
      doc.fontSize(20).fillColor("#2E2F2A").text("Kitchens Plus Upstate", { align: "center" });
      doc.fontSize(12).fillColor("#666").text("Monthly Payment Summary", { align: "center" });
      doc.fontSize(14).fillColor("#D4A853").text(`${monthName} ${year}`, { align: "center" });
      doc.moveDown();
      doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor("#D4A853").lineWidth(1.5).stroke();
      doc.moveDown(0.5);
      // Summary box
      doc.fontSize(11).fillColor("#2E2F2A").text(`Total Collected: $${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, { continued: false });
      doc.text(`Total Transactions: ${enriched.length}`);
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor("#444").text("Breakdown by Payment Method:");
      for (const [method, amt] of Object.entries(byMethod)) {
        doc.text(`  ${method.charAt(0).toUpperCase() + method.slice(1)}: $${amt.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
      }
      doc.moveDown();
      doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor("#ddd").lineWidth(0.5).stroke();
      doc.moveDown(0.5);
      // Table header
      const cols = [50, 120, 220, 310, 390, 470];
      doc.fontSize(9).fillColor("#fff");
      doc.rect(50, doc.y, 512, 16).fill("#2E2F2A");
      const hY = doc.y - 14;
      doc.fillColor("#fff").text("Date", cols[0], hY, { width: 65 });
      doc.text("Invoice #", cols[1], hY, { width: 95 });
      doc.text("Client", cols[2], hY, { width: 85 });
      doc.text("Method", cols[3], hY, { width: 75 });
      doc.text("Amount", cols[4], hY, { width: 75, align: "right" });
      doc.moveDown(0.3);
      // Rows
      let rowBg = false;
      for (const r of enriched) {
        const y = doc.y;
        if (rowBg) doc.rect(50, y, 512, 14).fill("#f9f9f9");
        rowBg = !rowBg;
        const dateStr = r.paidAt ? new Date(r.paidAt).toLocaleDateString("en-US") : "";
        doc.fillColor("#333").fontSize(8);
        doc.text(dateStr, cols[0], y + 2, { width: 65 });
        doc.text(r.invoiceNumber, cols[1], y + 2, { width: 95 });
        doc.text(r.clientName, cols[2], y + 2, { width: 85 });
        doc.text(r.method, cols[3], y + 2, { width: 75 });
        doc.text(`$${r.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, cols[4], y + 2, { width: 75, align: "right" });
        doc.moveDown(0.6);
      }
      // Total row
      doc.moveDown(0.3);
      doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor("#D4A853").lineWidth(1).stroke();
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor("#2E2F2A").text(`TOTAL: $${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, { align: "right" });
      doc.end();
    });
    const pdfBuffer = Buffer.concat(chunks);
    const key = `reports/monthly-summary-${year}-${String(month).padStart(2,"0")}.pdf`;
    const { url } = await storagePut(key, pdfBuffer, "application/pdf");
    return { url, filename: `KitchensPlus_Summary_${monthName}_${year}.pdf` };
  }),
});
// ─── Bookkeeping router ─────────────────────────────────────────────────────
const bookkeepingRouter = router({
  exportData: adminProcedure.input(z.object({
    month: z.number().optional(), // 1-12
    year: z.number().optional(),
    format: z.enum(["json", "csv"]).default("json"),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const now = new Date();
    const year = input.year ?? now.getFullYear();
    const month = input.month ?? now.getMonth() + 1;
    const startDate = `${year}-${String(month).padStart(2,'0')}-01 00:00:00`;
    const lastDayE = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2,'0')}-${String(lastDayE).padStart(2,'0')} 23:59:59`;
    const paidInvoices = await db.select().from(invoices)
      .where(and(eq(invoices.status, "paid"), sql`paidAt BETWEEN ${startDate} AND ${endDate}`));
    const allInvoices = await db.select().from(invoices)
      .where(sql`createdAt BETWEEN ${startDate} AND ${endDate}`);
    const allProjects = await db.select().from(projects)
      .where(sql`createdAt BETWEEN ${startDate} AND ${endDate}`);
    const totalRevenue = paidInvoices.reduce((s, i) => s + Number(i.amount ?? 0), 0);
    const totalInvoiced = allInvoices.reduce((s, i) => s + Number(i.amount ?? 0), 0);
    return {
      period: `${year}-${String(month).padStart(2, '0')}`,
      totalRevenue,
      totalInvoiced,
      paidInvoiceCount: paidInvoices.length,
      totalInvoiceCount: allInvoices.length,
      newProjectCount: allProjects.length,
      invoices: paidInvoices.map(i => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        amount: Number(i.amount ?? 0),
        type: i.invoiceType,
        paidAt: i.paidAt,
        projectId: i.projectId,
      })),
    };
  }),

  getSettings: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select().from(appSettings).where(
      or(eq(appSettings.key, 'quickbooks_enabled'), eq(appSettings.key, 'bookkeeper_email'), eq(appSettings.key, 'export_day'))
    );
    const result: Record<string, string> = {};
    rows.forEach(r => { result[r.key] = r.value ?? ''; });
    return result;
  }),

  updateSettings: adminProcedure.input(z.object({
    quickbooksEnabled: z.boolean().optional(),
    bookkeeperEmail: z.string().optional(),
    exportDay: z.number().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const updates: Array<{ key: string; value: string }> = [];
    if (input.quickbooksEnabled !== undefined) updates.push({ key: 'quickbooks_enabled', value: String(input.quickbooksEnabled) });
    if (input.bookkeeperEmail !== undefined) updates.push({ key: 'bookkeeper_email', value: input.bookkeeperEmail });
    if (input.exportDay !== undefined) updates.push({ key: 'export_day', value: String(input.exportDay) });
    for (const u of updates) {
      await db.insert(appSettings).values({ key: u.key, value: u.value })
        .onDuplicateKeyUpdate({ set: { value: u.value } });
    }
    return { success: true };
  }),
});

// ─── Automation router ────────────────────────────────────────────────────────
const automationRouter = router({
  runCheckins: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Find projects that started 2 days ago (day-2 check-in)
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const activeProjects = await db.select().from(projects).where(eq(projects.status, 'active'));
    const results: string[] = [];
    for (const project of activeProjects) {
      if (!project.startDate) continue;
      const start = new Date(project.startDate);
      const daysSinceStart = Math.floor((Date.now() - start.getTime()) / (24 * 60 * 60 * 1000));
      // Day 2: check-in SMS
      if (daysSinceStart === 2) {
        const client = project.clientId ? await db.select().from(clients).where(eq(clients.id, project.clientId)).limit(1) : [];
        if (client[0]?.phone) {
          const clientName = client[0].name?.split(' ')[0] ?? 'there';
          const body = `Hi ${clientName}, this is Kitchens Plus Upstate. We are two days into your ${project.projectType ?? 'project'} and everything is progressing well. Thank you for choosing us, ${clientName}! We are here for you every step of the way.`;
          await sendSms(client[0].phone, body);
          await db.insert(automationLogs).values({ triggerType: 'day_2_checkin', entityType: 'project', entityId: project.id, status: 'success', details: 'Day-2 check-in SMS sent' });
          results.push(`Day-2 check-in sent to project ${project.id}`);
        }
      }
      // Day 5: review request SMS
      if (daysSinceStart === 5) {
        const client = project.clientId ? await db.select().from(clients).where(eq(clients.id, project.clientId)).limit(1) : [];
        if (client[0]?.phone) {
          const clientName2 = client[0].name?.split(' ')[0] ?? 'there';
          const body = `Hi ${clientName2}, this is Kitchens Plus Upstate. We are five days into your project and hope everything is going beautifully. If you have a moment, we would greatly appreciate a Google review — it means the world to us: https://g.page/r/CUZLLVEKNub9EBM/review — Thank you for choosing Kitchens Plus Upstate, ${clientName2}!`;
          await sendSms(client[0].phone, body);
          await db.insert(automationLogs).values({ triggerType: 'day_5_review', entityType: 'project', entityId: project.id, status: 'success', details: 'Day-5 review request SMS sent' });
          results.push(`Day-5 review request sent to project ${project.id}`);
        }
      }
    }
    return { processed: results.length, results };
  }),

  getLogs: adminProcedure.input(z.object({ projectId: z.number().optional() }).optional()).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(automationLogs).orderBy(desc(automationLogs.createdAt)).limit(50);
  }),
});

// ─── Maps utility router ────────────────────────────────────────────────────
const mapsRouter = router({
  // Server-side Places Autocomplete — avoids CORS/auth issues with the frontend proxy
  addressPredictions: protectedProcedure
    .input(z.object({ input: z.string().min(3) }))
    .query(async ({ input: inp }) => {
      try {
        const { makeRequest } = await import("./_core/map");
        const result = await makeRequest<{
          predictions: Array<{
            description: string;
            place_id: string;
            structured_formatting?: { main_text: string; secondary_text: string };
          }>;
          status: string;
        }>("/maps/api/place/autocomplete/json", {
          input: inp.input,
          types: "address",
          components: "country:us",
          language: "en",
        });
        if (result.status === "OK" && result.predictions) {
          return result.predictions.map((p) => ({
            description: p.description,
            place_id: p.place_id,
            main_text: p.structured_formatting?.main_text ?? p.description,
            secondary_text: p.structured_formatting?.secondary_text ?? "",
          }));
        }
        return [];
      } catch (err) {
        console.warn("[mapsRouter] addressPredictions error:", err);
        return [];
      }
    }),
  geocode: protectedProcedure
    .input(z.object({ placeId: z.string() }))
    .query(async ({ input }) => {
      try {
        const { makeRequest } = await import("./_core/map");
        const result = await makeRequest<{
          results: Array<{
            formatted_address: string;
            geometry: { location: { lat: number; lng: number } };
          }>;
          status: string;
        }>("/maps/api/geocode/json", { place_id: input.placeId });
        if (result.status === "OK" && result.results[0]) {
          const r = result.results[0];
          return {
            formattedAddress: r.formatted_address,
            lat: r.geometry.location.lat,
            lng: r.geometry.location.lng,
          };
        }
        return null;
      } catch (err) {
        console.warn("[mapsRouter] geocode error:", err);
        return null;
      }
    }),
  // Build static map URL server-side (VITE_FRONTEND_FORGE_API_KEY returns 401 for staticmap;
  // BUILT_IN_FORGE_API_KEY works. We geocode + build the URL here and return it to the client.)
  getStaticMapUrl: protectedProcedure
    .input(
      z.object({
        address: z.string().min(3),
        width: z.number().int().min(100).max(640).optional(),
        height: z.number().int().min(100).max(640).optional(),
        zoom: z.number().int().min(1).max(21).optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const { makeRequest } = await import("./_core/map");
        // Step 1: geocode the address
        const geoResult = await makeRequest<{
          results: Array<{
            formatted_address: string;
            geometry: { location: { lat: number; lng: number } };
          }>;
          status: string;
        }>("/maps/api/geocode/json", { address: input.address });
        if (geoResult.status !== "OK" || !geoResult.results[0]) return null;
        const { lat, lng } = geoResult.results[0].geometry.location;
        const formattedAddress = geoResult.results[0].formatted_address;

        // Step 2: build the static map URL using the server-side key
        const forgeBase = (process.env.BUILT_IN_FORGE_API_URL ?? "").replace(/\/+$/, "");
        const forgeKey = process.env.BUILT_IN_FORGE_API_KEY ?? "";
        const w = input.width ?? 400;
        const h = input.height ?? 400;
        const z = input.zoom ?? 17;
        const params = new URLSearchParams({
          center: `${lat},${lng}`,
          zoom: String(z),
          size: `${w}x${h}`,
          maptype: "roadmap",
          markers: `color:red|${lat},${lng}`,
          scale: "2",
          key: forgeKey,
        });
        const staticMapUrl = `${forgeBase}/v1/maps/proxy/maps/api/staticmap?${params.toString()}`;
        return { staticMapUrl, lat, lng, formattedAddress };
      } catch (err) {
        console.warn("[mapsRouter] getStaticMapUrl error:", err);
        return null;
      }
    }),
  // Geocode by free-form address string (used by ClientMapPreview thumbnail)
  geocodeByAddress: protectedProcedure
    .input(z.object({ address: z.string().min(3) }))
    .query(async ({ input }) => {
      try {
        const { makeRequest } = await import("./_core/map");
        const result = await makeRequest<{
          results: Array<{
            formatted_address: string;
            geometry: { location: { lat: number; lng: number } };
          }>;
          status: string;
        }>("/maps/api/geocode/json", { address: input.address });
        if (result.status === "OK" && result.results[0]) {
          const r = result.results[0];
          return {
            formattedAddress: r.formatted_address,
            lat: r.geometry.location.lat,
            lng: r.geometry.location.lng,
          };
        }
        return null;
      } catch (err) {
        console.warn("[mapsRouter] geocodeByAddress error:", err);
        return null;
      }
    }),
});

// ─── App router ───────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  leads: leadsRouter,
  meetings: meetingsRouter,
  projects: projectsRouter,
  clients: clientsRouter,
  vendors: vendorsRouter,
  estimates: estimatesRouter,
  messages: messagesRouter,
  documents: documentsRouter,
  invoices: invoicesRouter,
  schedule: scheduleRouter,
  purchaseOrders: purchaseOrdersRouter,
  crew: crewRouter,
  settings: settingsRouter,
  reports: reportsRouter,
  bookkeeping: bookkeepingRouter,
  automation: automationRouter,
  clientPortal: clientPortalRouter,
  fieldCapture: fieldCaptureRouter,
  proposalAttachments: proposalAttachmentsRouter,
  taskResponse: taskResponseRouter,
  rfi: rfiRouter,
  changeOrders: changeOrdersRouter,
  rfiThreads: rfiThreadsRouter,
  vms: vmsRouter,
  subcontractors: subcontractorsRouter,
  maps: mapsRouter,
  agents: agentsRouter,
  coo: cooRouter,
  siteMeetings: siteMeetingsRouter,
});

export type AppRouter = typeof appRouter;
