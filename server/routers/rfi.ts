/**
 * RFI (Request for Information) Router
 * Handles AI-assisted RFI creation, sending, reminders, client responses, and owner review.
 */
import { z } from "zod/v4";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { rfis, rfiReminders, projects, clients, leads, messages } from "../../drizzle/schema";
import { eq, and, desc, asc, isNull, lte, lt, ne, inArray } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { transcribeAudio } from "../_core/voiceTranscription";
import { storagePut } from "../storage";
import { notifyOwner } from "../_core/notification";
import { nanoid } from "nanoid";
import { sendSms } from "../sms";
import { createTransporter } from "../email";

const BUSINESS_NAME = "Kitchens Plus Upstate";
const BUSINESS_PHONE = "+1 (833) 518-4811";
const CHAD_PHONE = "864-567-8777";
const GMAIL_FROM = process.env.GMAIL_FROM ?? "chad@kitchensplusupstate.com";
const GMAIL_LOGIN = process.env.GMAIL_LOGIN ?? "chad@cpenterprisessc.com";

// ─── Email helper ─────────────────────────────────────────────────────────────
async function sendRfiEmail(opts: {
  toEmail: string;
  clientName: string;
  rfiTitle: string;
  rfiBody: string;
  responseUrl: string;
  reminderNumber?: number;
  attachments?: { url: string; name: string }[];
}) {
  const { toEmail, clientName, rfiTitle, rfiBody, responseUrl, reminderNumber } = opts;
  const isReminder = (reminderNumber ?? 0) > 0;
  const subject = isReminder
    ? `[Reminder ${reminderNumber}/5] Action Required: ${rfiTitle} — ${BUSINESS_NAME}`
    : `Action Required: ${rfiTitle} — ${BUSINESS_NAME}`;

  const reminderBanner = isReminder
    ? `<div style="background:#FFF3CD;border:1px solid #FFEAA7;padding:12px 16px;border-radius:6px;margin-bottom:20px;font-size:14px;color:#856404;">
        <strong>Reminder ${reminderNumber} of 5</strong> — We haven't received your response yet. Please take a moment to review and respond below.
       </div>`
    : "";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8F6F1;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F6F1;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:#1A1A1A;padding:28px 40px;">
          <p style="margin:0;font-size:22px;color:#BF9A3B;font-family:'Georgia',serif;letter-spacing:1px;">${BUSINESS_NAME}</p>
          <p style="margin:4px 0 0;font-size:12px;color:#999;letter-spacing:2px;text-transform:uppercase;">Request for Information</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:36px 40px;">
          ${reminderBanner}
          <p style="font-size:16px;color:#333;margin:0 0 8px;">Dear ${clientName},</p>
          <p style="font-size:14px;color:#555;margin:0 0 24px;line-height:1.7;">
            ${isReminder ? "We are following up on our previous request." : "We have a request for information regarding your project."} Please review the details below and respond at your earliest convenience.
          </p>
          <div style="background:#F8F6F1;border-left:4px solid #BF9A3B;padding:20px 24px;border-radius:0 8px 8px 0;margin-bottom:28px;">
            <p style="margin:0 0 8px;font-size:13px;color:#BF9A3B;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">RFI: ${rfiTitle}</p>
            <div style="font-size:14px;color:#333;line-height:1.8;">${rfiBody.replace(/\n/g, "<br>")}</div>
          </div>
          ${opts.attachments && opts.attachments.length > 0 ? `
          <div style="margin-bottom:24px;">
            <p style="margin:0 0 10px;font-size:13px;color:#BF9A3B;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">Attached Documents</p>
            ${opts.attachments.map(a => `<a href="${a.url}" style="display:block;color:#BF9A3B;font-size:13px;text-decoration:underline;margin-bottom:4px;" target="_blank">📎 ${a.name}</a>`).join('')}
          </div>` : ''}
          <div style="text-align:center;margin:32px 0;">
            <a href="${responseUrl}" style="background:#BF9A3B;color:#1A1A1A;text-decoration:none;padding:14px 36px;border-radius:6px;font-size:15px;font-weight:bold;display:inline-block;letter-spacing:0.5px;">
              Review &amp; Respond to RFI →
            </a>
          </div>
          <p style="font-size:12px;color:#999;text-align:center;margin:0;">Or copy this link: <a href="${responseUrl}" style="color:#BF9A3B;">${responseUrl}</a></p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#F8F6F1;padding:20px 40px;border-top:1px solid #EEE;">
          <p style="margin:0;font-size:12px;color:#999;text-align:center;line-height:1.6;">
            ${BUSINESS_NAME} · Questions? Call Chad at ${CHAD_PHONE} or reply to this email.<br>
            <small>To log into your client portal, use your phone number on file.</small>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"${BUSINESS_NAME}" <${GMAIL_FROM}>`,
    replyTo: GMAIL_FROM,
    to: toEmail,
    subject,
    html,
  });
}

// ─── SMS helper ───────────────────────────────────────────────────────────────
async function sendRfiSms(opts: {
  toPhone: string;
  clientName: string;
  rfiTitle: string;
  responseUrl: string;
  reminderNumber?: number;
}) {
  const { toPhone, clientName, rfiTitle, responseUrl, reminderNumber } = opts;
  const isReminder = (reminderNumber ?? 0) > 0;
  const prefix = isReminder ? `[Reminder ${reminderNumber}/5] ` : "";
  const message = `${prefix}Hi ${clientName}, ${BUSINESS_NAME} has a Request for Information that needs your response: "${rfiTitle}". Please review and respond here: ${responseUrl}\n\nCall Chad at ${CHAD_PHONE} | Reply STOP to opt out.`;
  await sendSms({ to: toPhone, message });
}

// ─── AI: generate RFI body from raw input ────────────────────────────────────
async function generateRfiBody(opts: {
  rawText: string;
  projectName: string;
  clientName: string;
}): Promise<{ title: string; body: string; smsBody: string; followUpQuestions: string[] }> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a professional construction project manager for ${BUSINESS_NAME}, a luxury renovation company.
Generate a formal Request for Information (RFI) based on the raw input provided.
The RFI must be clear, specific, and require a definitive response from the client.
Return JSON with:
- title: short, specific RFI title (max 80 chars)
- body: professional multi-paragraph RFI body (2-4 paragraphs, formal tone, suitable for email)
- smsBody: short SMS version (max 160 chars, plain language, no jargon — just the key ask and what the client needs to do)
- followUpQuestions: array of up to 3 clarifying questions if the input is ambiguous or incomplete`,
      },
      {
        role: "user",
        content: `Project: ${opts.projectName}\nClient: ${opts.clientName}\n\nRaw input:\n${opts.rawText}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "rfi_document",
        strict: true,
        schema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short, specific RFI title (max 80 chars)" },
            body: { type: "string", description: "Professional RFI body text (2-4 paragraphs, email-ready)" },
            smsBody: { type: "string", description: "Short SMS version (max 160 chars, plain language, key ask only)" },
            followUpQuestions: {
              type: "array",
              items: { type: "string" },
              description: "Up to 3 clarifying questions if input is ambiguous",
            },
          },
          required: ["title", "body", "smsBody", "followUpQuestions"],
          additionalProperties: false,
        },
      },
    },
  });
  const content = response.choices?.[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content);
  } catch {
    const fallbackSms = opts.rawText.slice(0, 140);
    return { title: "Request for Information", body: opts.rawText, smsBody: fallbackSms, followUpQuestions: [] };
  }
}

// ─── AI: interpret client delay response ─────────────────────────────────────
async function interpretDelayResponse(responseText: string): Promise<{ isDelay: boolean; delayDays: number; summary: string }> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are analyzing a client's response to a Request for Information. Determine if the client is asking for more time (a delay) or providing an actual answer. Return JSON.`,
      },
      { role: "user", content: `Client response: "${responseText}"` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "delay_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            isDelay: { type: "boolean", description: "True if client is asking for more time" },
            delayDays: { type: "integer", description: "Number of days to wait before next reminder (1-14)" },
            summary: { type: "string", description: "One-sentence summary of what the client said" },
          },
          required: ["isDelay", "delayDays", "summary"],
          additionalProperties: false,
        },
      },
    },
  });
  const content = response.choices?.[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content);
  } catch {
    return { isDelay: false, delayDays: 1, summary: responseText };
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const rfiRouter = router({

  /** Generate AI-assisted RFI from text, base64 PDF, base64 image, or audio URL */
  generate: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      inputText: z.string().optional(),
      base64File: z.string().optional(),     // base64 PDF or image
      fileMimeType: z.string().optional(),   // "application/pdf" | "image/jpeg" | etc.
      audioUrl: z.string().optional(),       // S3 URL of recorded audio
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Resolve project + client name
      const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId));
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      let clientName = "Valued Client";
      if (project.clientId) {
        const [client] = await db.select().from(clients).where(eq(clients.id, project.clientId));
        if (client) clientName = client.name;
      }

      // Build raw text from whichever input was provided
      let rawText = input.inputText ?? "";

      if (input.audioUrl) {
        const result = await transcribeAudio({ audioUrl: input.audioUrl });
        rawText = result.text ?? rawText;
      }

      if (input.base64File && input.fileMimeType) {
        // Pass the file to LLM as image/file content for extraction
        const extractResponse = await invokeLLM({
          messages: [
            { role: "system", content: "Extract all relevant text and information from this document. Return the full extracted text." },
            {
              role: "user",
              content: [
                { type: "text", text: "Extract all text and information from this document:" },
                input.fileMimeType.startsWith("image/")
                  ? { type: "image_url", image_url: { url: `data:${input.fileMimeType};base64,${input.base64File}` } }
                  : { type: "file_url", file_url: { url: `data:${input.fileMimeType};base64,${input.base64File}`, mime_type: input.fileMimeType as any } },
              ],
            },
          ],
        });
        const extracted = extractResponse.choices?.[0]?.message?.content ?? "";
        rawText = rawText ? `${rawText}\n\n${extracted}` : extracted;
      }

      if (!rawText.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No input provided to generate RFI" });
      }

      const result = await generateRfiBody({ rawText, projectName: project.name, clientName });
      return result;
    }),

  /** Save a draft RFI (after AI generation + owner review) */
  create: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      title: z.string().min(1),
      body: z.string().min(1),
      attachmentUrls: z.array(z.object({ url: z.string(), name: z.string() })).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const token = nanoid(32);
      await db.insert(rfis).values({
        projectId: input.projectId,
        token,
        title: input.title,
        body: input.body,
        attachmentUrls: input.attachmentUrls ? JSON.stringify(input.attachmentUrls) : null,
        status: "draft",
        reminderCount: 0,
      });

      const [rfi] = await db.select().from(rfis).where(eq(rfis.token, token));
      return rfi;
    }),

  /** Send an RFI to the client (email + SMS) */
  send: protectedProcedure
    .input(z.object({
      rfiId: z.number(),
      origin: z.string(), // window.location.origin from frontend
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [rfi] = await db.select().from(rfis).where(eq(rfis.id, input.rfiId));
      if (!rfi) throw new TRPCError({ code: "NOT_FOUND", message: "RFI not found" });
      if (rfi.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "RFI already sent" });

      // Resolve project
      const [project] = await db.select().from(projects).where(eq(projects.id, rfi.projectId));
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      // Resolve contact — prefer clients table, fall back to leads table
      let contactName = "Valued Client";
      let resolvedClientId: number | null = null;
      let emails: string[] = [];
      let phones: string[] = [];

      if (project.clientId) {
        const [client] = await db.select().from(clients).where(eq(clients.id, project.clientId));
        if (client) {
          contactName = client.name;
          resolvedClientId = client.id;
          emails = [client.email].filter(Boolean) as string[];
          phones = [client.phone].filter(Boolean) as string[];
        }
      }

      if (emails.length === 0 && phones.length === 0 && project.leadId) {
        // Fall back to the lead record which has phone2/phone3/email2/email3
        const [lead] = await db.select().from(leads).where(eq(leads.id, project.leadId));
        if (lead) {
          contactName = lead.name;
          emails = [lead.email, lead.email2, lead.email3].filter(Boolean) as string[];
          phones = [lead.phone, lead.phone2, lead.phone3].filter(Boolean) as string[];
        }
      } else if (project.leadId && (emails.length > 0 || phones.length > 0)) {
        // Client found — also pick up any extra phones/emails from the lead record
        const [lead] = await db.select().from(leads).where(eq(leads.id, project.leadId));
        if (lead) {
          const extraEmails = [lead.email2, lead.email3].filter(Boolean) as string[];
          const extraPhones = [lead.phone2, lead.phone3].filter(Boolean) as string[];
          emails = [...new Set([...emails, ...extraEmails])];
          phones = [...new Set([...phones, ...extraPhones])];
        }
      }

      if (emails.length === 0 && phones.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No client or lead with contact info is linked to this project. Please add an email or phone number to the client record." });
      }

      const responseUrl = `${input.origin}/rfi/${rfi.token}`;
      const now = new Date();
      const nextReminder = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const attachments: { url: string; name: string }[] = rfi.attachmentUrls ? JSON.parse(rfi.attachmentUrls) : [];

      // Send to all emails
      for (const email of emails) {
        try {
          await sendRfiEmail({ toEmail: email, clientName: contactName, rfiTitle: rfi.title, rfiBody: rfi.body, responseUrl, attachments });
          await db.insert(rfiReminders).values({ rfiId: rfi.id, reminderNumber: 0, channel: "email" });
        } catch (err: any) {
          console.error(`[RFI] Email send error to ${email}:`, err?.message);
        }
      }

      // Send to all phones
      for (const phone of phones) {
        try {
          await sendRfiSms({ toPhone: phone, clientName: contactName, rfiTitle: rfi.title, responseUrl });
          await db.insert(rfiReminders).values({ rfiId: rfi.id, reminderNumber: 0, channel: "sms" });
        } catch (err: any) {
          console.error(`[RFI] SMS send error to ${phone}:`, err?.message);
        }
      }

      await db.update(rfis).set({
        status: "sent",
        clientId: resolvedClientId,
        sentAt: now,
        nextReminderAt: nextReminder,
        updatedAt: now,
      }).where(eq(rfis.id, rfi.id));

      return { ok: true };
    }),

  /** Count all pending (sent, not yet reviewed) RFIs across all projects — for nav badge */
  countPendingAll: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return { count: 0 };
      const rows = await db.select({ id: rfis.id }).from(rfis)
        .where(inArray(rfis.status, ["sent", "returned"]));
      return { count: rows.length };
    }),

  /** Batch: returns a map of projectId -> open RFI count (sent or responded, not yet reviewed) */
  countPendingByProjects: protectedProcedure
    .input(z.object({ projectIds: z.array(z.number()) }))
    .query(async ({ input }) => {
      if (!input.projectIds.length) return {} as Record<number, number>;
      const db = await getDb();
      if (!db) return {} as Record<number, number>;
      const rows = await db
        .select({ projectId: rfis.projectId })
        .from(rfis)
        .where(
          and(
            inArray(rfis.projectId, input.projectIds),
            inArray(rfis.status, ["sent", "responded"])
          )
        );
      const counts: Record<number, number> = {};
      for (const row of rows) {
        if (row.projectId != null) {
          counts[row.projectId] = (counts[row.projectId] ?? 0) + 1;
        }
      }
      return counts;
    }),

  /** List all RFIs for a project */
  listByProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(rfis)
        .where(eq(rfis.projectId, input.projectId))
        .orderBy(desc(rfis.createdAt));
    }),

  /** Get a single RFI by token (public — for client response page) */
  getByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [rfi] = await db.select().from(rfis).where(eq(rfis.token, input.token));
      if (!rfi) return null;
      // Return only client-safe fields
      return {
        id: rfi.id,
        title: rfi.title,
        body: rfi.body,
        attachmentUrls: rfi.attachmentUrls ? JSON.parse(rfi.attachmentUrls) : [],
        status: rfi.status,
        respondedAt: rfi.respondedAt,
      };
    }),

  /** Client submits their response (public — token-based) */
  respond: publicProcedure
    .input(z.object({
      token: z.string(),
      agreed: z.boolean().nullable(),
      comments: z.string().optional(),
      responseText: z.string().optional(),
      requestedMoreTime: z.boolean().optional(),
      // Photo uploads: array of base64-encoded images with mime type and filename
      photos: z.array(z.object({
        base64: z.string(),
        mimeType: z.string(),
        fileName: z.string(),
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [rfi] = await db.select().from(rfis).where(eq(rfis.token, input.token));
      if (!rfi) throw new TRPCError({ code: "NOT_FOUND", message: "RFI not found" });
      if (rfi.status === "reviewed") throw new TRPCError({ code: "BAD_REQUEST", message: "This RFI has already been reviewed" });

      const now = new Date();
      let delayDays = 0;
      let isDelay = false;

      // If client says "wait" or requests more time, parse the delay
      if (input.requestedMoreTime || (input.responseText && /\b(wait|later|day|week|time|soon|tomorrow|friday|monday)\b/i.test(input.responseText))) {
        const analysis = await interpretDelayResponse(input.responseText ?? "I need more time");
        isDelay = analysis.isDelay;
        delayDays = Math.min(Math.max(analysis.delayDays, 1), 14);

        if (isDelay) {
          const nextReminder = new Date(now.getTime() + delayDays * 24 * 60 * 60 * 1000);
          await db.update(rfis).set({
            responseText: input.responseText,
            responseRequestedMoreTime: 1,
            responseDelayDays: delayDays,
            nextReminderAt: nextReminder,
            updatedAt: now,
          }).where(eq(rfis.id, rfi.id));

          // Notify owner of delay
          await notifyOwner({
            title: `RFI Delay: ${rfi.title}`,
            content: `Client requested more time on RFI "${rfi.title}". AI estimated ${delayDays} day(s). Next reminder scheduled.`,
          });

          return { ok: true, delayed: true, delayDays };
        }
      }

      // Upload any photos to S3
      const uploadedPhotos: { url: string; name: string }[] = [];
      if (input.photos && input.photos.length > 0) {
        for (const photo of input.photos) {
          try {
            const buffer = Buffer.from(photo.base64, "base64");
            const ext = photo.mimeType.split("/")[1] ?? "jpg";
            const key = `rfi-responses/${rfi.id}-${nanoid()}.${ext}`;
            const { url } = await storagePut(key, buffer, photo.mimeType);
            uploadedPhotos.push({ url, name: photo.fileName });
          } catch (e) {
            console.error("[RFI] Photo upload failed:", e);
          }
        }
      }

      // Actual response — mark as returned
      await db.update(rfis).set({
        status: "returned",
        responseAgreed: input.agreed === true ? 1 : input.agreed === false ? 0 : null,
        responseComments: input.comments,
        responseText: input.responseText,
        responseRequestedMoreTime: input.requestedMoreTime ? 1 : 0,
        responsePhotosJson: uploadedPhotos.length > 0 ? JSON.stringify(uploadedPhotos) : null,
        respondedAt: now,
        nextReminderAt: null, // stop reminders
        updatedAt: now,
      }).where(eq(rfis.id, rfi.id));

      // Resolve project to get client name for the message log
      const [project] = await db.select().from(projects).where(eq(projects.id, rfi.projectId));
      let clientName = "Client";
      if (project?.clientId) {
        const [client] = await db.select().from(clients).where(eq(clients.id, project.clientId));
        if (client) clientName = client.name;
      } else if (project?.leadId) {
        const [lead] = await db.select().from(leads).where(eq(leads.id, project.leadId));
        if (lead) clientName = lead.name;
      }

      // Build response body for message log
      const agreedLabel = input.agreed === true ? "Agreed ✓" : input.agreed === false ? "Declined ✗" : "Needs Discussion";
      const responseBody = [
        `[RFI Response] "${rfi.title}"`,
        `Decision: ${agreedLabel}`,
        input.comments ? `Comments: ${input.comments}` : null,
        input.responseText ? `Notes: ${input.responseText}` : null,
        uploadedPhotos.length > 0 ? `Photos: ${uploadedPhotos.map(p => p.name).join(", ")}` : null,
      ].filter(Boolean).join("\n");

      // Dual-write to messages table so it appears in the project Messages feed
      await db.insert(messages).values({
        projectId: rfi.projectId,
        threadType: "client",
        direction: "inbound",
        channel: "portal",
        fromName: clientName,
        body: responseBody,
        status: "received",
        attachmentsJson: uploadedPhotos.length > 0 ? JSON.stringify(uploadedPhotos) : null,
        isRead: false,
        createdAt: now,
      });

      // Notify owner
      const agreedText = input.agreed === true ? "AGREED" : input.agreed === false ? "DECLINED" : "responded";
      await notifyOwner({
        title: `RFI Returned: ${rfi.title}`,
        content: `${clientName} has ${agreedText} to RFI "${rfi.title}". ${input.comments ? `Comments: ${input.comments}` : ""} ${uploadedPhotos.length > 0 ? `(${uploadedPhotos.length} photo(s) attached)` : ""}`,
      });

      return { ok: true, delayed: false };
    }),

  /** Owner marks an RFI as reviewed (clears the badge) */
  review: protectedProcedure
    .input(z.object({ rfiId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(rfis).set({
        status: "reviewed",
        reviewedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(rfis.id, input.rfiId));
      return { ok: true };
    }),

  /** Internal: send a reminder for a specific RFI (called by scheduler) */
  sendReminder: protectedProcedure
    .input(z.object({ rfiId: z.number(), origin: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [rfi] = await db.select().from(rfis).where(eq(rfis.id, input.rfiId));
      if (!rfi || rfi.status !== "sent") return { ok: false, reason: "Not in sent state" };
      if (rfi.reminderCount >= 5) {
        await db.update(rfis).set({ status: "expired", updatedAt: new Date() }).where(eq(rfis.id, rfi.id));
        await notifyOwner({
          title: `RFI Expired: ${rfi.title}`,
          content: `RFI "${rfi.title}" has reached the maximum of 5 reminders with no response. Please follow up manually.`,
        });
        return { ok: false, reason: "Max reminders reached" };
      }

      const [project] = await db.select().from(projects).where(eq(projects.id, rfi.projectId));

      // Resolve contact — prefer clients table, fall back to leads table
      let contactName = "Valued Client";
      let reminderEmails: string[] = [];
      let reminderPhones: string[] = [];

      const clientId = rfi.clientId ?? project?.clientId;
      if (clientId) {
        const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
        if (client) {
          contactName = client.name;
          reminderEmails = [client.email].filter(Boolean) as string[];
          reminderPhones = [client.phone].filter(Boolean) as string[];
        }
      }

      if (reminderEmails.length === 0 && reminderPhones.length === 0 && project?.leadId) {
        const [lead] = await db.select().from(leads).where(eq(leads.id, project.leadId));
        if (lead) {
          contactName = lead.name;
          reminderEmails = [lead.email, lead.email2, lead.email3].filter(Boolean) as string[];
          reminderPhones = [lead.phone, lead.phone2, lead.phone3].filter(Boolean) as string[];
        }
      } else if (project?.leadId) {
        const [lead] = await db.select().from(leads).where(eq(leads.id, project.leadId));
        if (lead) {
          reminderEmails = [...new Set([...reminderEmails, ...[lead.email2, lead.email3].filter(Boolean) as string[]])];
          reminderPhones = [...new Set([...reminderPhones, ...[lead.phone2, lead.phone3].filter(Boolean) as string[]])];
        }
      }

      if (reminderEmails.length === 0 && reminderPhones.length === 0) return { ok: false, reason: "No contact info" };

      const newCount = rfi.reminderCount + 1;
      const responseUrl = `${input.origin}/rfi/${rfi.token}`;
      const now = new Date();
      const nextReminder = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      for (const email of reminderEmails) {
        try {
          await sendRfiEmail({ toEmail: email, clientName: contactName, rfiTitle: rfi.title, rfiBody: rfi.body, responseUrl, reminderNumber: newCount });
          await db.insert(rfiReminders).values({ rfiId: rfi.id, reminderNumber: newCount, channel: "email" });
        } catch (err: any) { console.error(`[RFI] Reminder email error to ${email}:`, err?.message); }
      }
      for (const phone of reminderPhones) {
        try {
          await sendRfiSms({ toPhone: phone, clientName: contactName, rfiTitle: rfi.title, responseUrl, reminderNumber: newCount });
          await db.insert(rfiReminders).values({ rfiId: rfi.id, reminderNumber: newCount, channel: "sms" });
        } catch (err: any) { console.error(`[RFI] Reminder SMS error to ${phone}:`, err?.message); }
      }

      await db.update(rfis).set({
        reminderCount: newCount,
        nextReminderAt: newCount >= 5 ? null : nextReminder,
        updatedAt: now,
      }).where(eq(rfis.id, rfi.id));

      return { ok: true, reminderNumber: newCount };
    }),

  /** Update RFI content and resend to the client (resets status to sent, resets reminder schedule) */
  updateAndResend: protectedProcedure
    .input(z.object({
      rfiId: z.number(),
      title: z.string().min(1),
      body: z.string().min(1),
      attachmentUrls: z.string().optional(), // JSON string of [{url, name}]
      origin: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [rfi] = await db.select().from(rfis).where(eq(rfis.id, input.rfiId));
      if (!rfi) throw new TRPCError({ code: "NOT_FOUND", message: "RFI not found" });

      // Resolve project
      const [project] = await db.select().from(projects).where(eq(projects.id, rfi.projectId));
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      // Resolve contact — prefer clients table, fall back to leads table
      let contactName = "Valued Client";
      let resolvedClientId: number | null = null;
      let emails: string[] = [];
      let phones: string[] = [];

      if (project.clientId) {
        const [client] = await db.select().from(clients).where(eq(clients.id, project.clientId));
        if (client) {
          contactName = client.name;
          resolvedClientId = client.id;
          emails = [client.email].filter(Boolean) as string[];
          phones = [client.phone].filter(Boolean) as string[];
        }
      }

      if (emails.length === 0 && phones.length === 0 && project.leadId) {
        const [lead] = await db.select().from(leads).where(eq(leads.id, project.leadId));
        if (lead) {
          contactName = lead.name;
          emails = [lead.email, lead.email2, lead.email3].filter(Boolean) as string[];
          phones = [lead.phone, lead.phone2, lead.phone3].filter(Boolean) as string[];
        }
      } else if (project.leadId && (emails.length > 0 || phones.length > 0)) {
        const [lead] = await db.select().from(leads).where(eq(leads.id, project.leadId));
        if (lead) {
          const extraEmails = [lead.email2, lead.email3].filter(Boolean) as string[];
          const extraPhones = [lead.phone2, lead.phone3].filter(Boolean) as string[];
          emails = [...new Set([...emails, ...extraEmails])];
          phones = [...new Set([...phones, ...extraPhones])];
        }
      }

      if (emails.length === 0 && phones.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No client or lead with contact info is linked to this project." });
      }

      const responseUrl = `${input.origin}/rfi/${rfi.token}`;
      const now = new Date();
      const nextReminder = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const attachments: { url: string; name: string }[] = input.attachmentUrls
        ? JSON.parse(input.attachmentUrls)
        : (rfi.attachmentUrls ? JSON.parse(rfi.attachmentUrls) : []);

      // Update the RFI record with new content
      await db.update(rfis).set({
        title: input.title,
        body: input.body,
        attachmentUrls: JSON.stringify(attachments),
        status: "sent",
        clientId: resolvedClientId,
        sentAt: now,
        reminderCount: 0,
        nextReminderAt: nextReminder,
        updatedAt: now,
      }).where(eq(rfis.id, rfi.id));

      // Send to all emails
      for (const email of emails) {
        try {
          await sendRfiEmail({ toEmail: email, clientName: contactName, rfiTitle: input.title, rfiBody: input.body, responseUrl, attachments });
          await db.insert(rfiReminders).values({ rfiId: rfi.id, reminderNumber: 0, channel: "email" });
        } catch (err: any) {
          console.error(`[RFI] Resend email error to ${email}:`, err?.message);
        }
      }

      // Send to all phones
      for (const phone of phones) {
        try {
          await sendRfiSms({ toPhone: phone, clientName: contactName, rfiTitle: input.title, responseUrl });
          await db.insert(rfiReminders).values({ rfiId: rfi.id, reminderNumber: 0, channel: "sms" });
        } catch (err: any) {
          console.error(`[RFI] Resend SMS error to ${phone}:`, err?.message);
        }
      }

      return { ok: true, sentTo: { emails, phones } };
    }),

  /** Transcribe voice recording for RFI body dictation */
  transcribeVoice: protectedProcedure
    .input(z.object({ base64Audio: z.string(), mimeType: z.string() }))
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.base64Audio, "base64");
      const ext = input.mimeType.includes("mp4") ? "mp4" : "webm";
      const key = `rfi-voice/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      const result = await transcribeAudio({ audioUrl: url });
      return { text: result.text };
    }),

  /** Refine RFI body with AI — takes existing body + new dictation, returns improved version */
  refineBody: protectedProcedure
    .input(z.object({
      existingBody: z.string(),
      newText: z.string(),
      projectName: z.string(),
    }))
    .mutation(async ({ input }) => {
      const prompt = `You are a professional construction project manager writing a Request for Information (RFI) for the "${input.projectName}" project.

Existing RFI body:
${input.existingBody}

New input to incorporate:
${input.newText}

Task: Merge the new input into the existing RFI body. Maintain a professional, clear, and concise tone. Return only the updated RFI body text (no preamble, no JSON, no markdown formatting).`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: "You are a professional construction project manager. Write clear, concise, and professional RFI content." },
          { role: "user", content: prompt },
        ],
      });

      const refined = response.choices?.[0]?.message?.content?.trim() ?? input.existingBody;
      return { body: refined };
    }),

  /** Upload a file attachment for an RFI (PDF or image) */
  uploadAttachment: protectedProcedure
    .input(z.object({
      rfiId: z.number(),
      base64: z.string(),
      mimeType: z.string(),
      fileName: z.string(),
    }))
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.base64, "base64");
      const key = `rfi-attachments/${input.rfiId}-${Date.now()}-${input.fileName}`;
      const { url } = await storagePut(key, buffer, input.mimeType);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [rfi] = await db.select().from(rfis).where(eq(rfis.id, input.rfiId));
      if (!rfi) throw new TRPCError({ code: "NOT_FOUND" });

      const existing: { url: string; name: string }[] = rfi.attachmentUrls ? JSON.parse(rfi.attachmentUrls) : [];
      existing.push({ url, name: input.fileName });

      await db.update(rfis).set({
        attachmentUrls: JSON.stringify(existing),
        updatedAt: new Date(),
      }).where(eq(rfis.id, input.rfiId));

      return { url, name: input.fileName };
    }),
});
