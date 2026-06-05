/**
 * RFI Threads Router
 * Handles the email conversation thread within each RFI:
 * - Listing thread messages
 * - Adding outbound comments/replies (sends email to client)
 * - Uploading attachments to a thread message
 * - Converting an RFI to a Change Order
 * - Syncing emails from Gmail for a specific RFI (on-demand)
 */
import { z } from "zod/v4";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  rfiThreads, rfiThreadAttachments, rfis, changeOrders,
  projects, clients, leads,
} from "../../drizzle/schema";
import { eq, asc } from "drizzle-orm";
import { storagePut } from "../storage";
import { createTransporter } from "../email";
import { nanoid } from "nanoid";
import { google } from "googleapis";
import { generateRfiPdf } from "../rfiPdf";

const BUSINESS_NAME = "Kitchens Plus Upstate";
const GMAIL_FROM = process.env.GMAIL_FROM ?? "chad@kitchensplusupstate.com";
const WATCHED = ["chad@cpenterprisessc.com", "chad@kitchensplusupstate.com"];

// ── Gmail helpers ─────────────────────────────────────────────────────────────
function getOAuth2Client() {
  const id = process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "";
  const secret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? "";
  const refresh = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN ?? "";
  if (!id || !secret || !refresh) return null;
  const auth = new google.auth.OAuth2(id, secret);
  auth.setCredentials({ refresh_token: refresh });
  return auth;
}

function extractBodyText(payload: any): string {
  if (!payload) return "";
  if (payload.body?.data) return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  if (payload.parts) {
    const plain = payload.parts.find((p: any) => p.mimeType === "text/plain");
    if (plain?.body?.data) return Buffer.from(plain.body.data, "base64url").toString("utf-8");
    const html = payload.parts.find((p: any) => p.mimeType === "text/html");
    if (html?.body?.data) {
      return Buffer.from(html.body.data, "base64url").toString("utf-8")
        .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
    for (const part of payload.parts) { const t = extractBodyText(part); if (t) return t; }
  }
  return "";
}

function getHdr(headers: any[], name: string): string {
  return headers?.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function parseEmail(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim().toLowerCase();
}

/**
 * Search Gmail for all emails related to a specific RFI and upsert them
 * into rfi_threads. Returns the count of newly imported messages.
 */
async function syncRFIEmailsFromGmail(rfiId: number): Promise<{ imported: number; total: number }> {
  const auth = getOAuth2Client();
  if (!auth) return { imported: 0, total: 0 };
  const db = await getDb();
  if (!db) return { imported: 0, total: 0 };

  const [rfi] = await db.select().from(rfis).where(eq(rfis.id, rfiId)).limit(1);
  if (!rfi) return { imported: 0, total: 0 };

  // Get client email for targeted search
  let clientEmail: string | null = null;
  let clientName = "Client";
  const [project] = await db.select().from(projects).where(eq(projects.id, rfi.projectId)).limit(1);
  if (project?.clientId) {
    const [client] = await db.select().from(clients).where(eq(clients.id, project.clientId)).limit(1);
    if (client) { clientEmail = client.email ?? null; clientName = client.name; }
  } else if (project?.leadId) {
    const [lead] = await db.select().from(leads).where(eq(leads.id, project.leadId)).limit(1);
    if (lead) { clientEmail = lead.email ?? null; clientName = lead.name; }
  }

  const gmail = google.gmail({ version: "v1", auth });
  // Escape quotes in title for Gmail search
  const titleEscaped = rfi.title.replace(/"/g, "");

  // Build search queries — subject match is the most reliable
  const queries: string[] = [
    `subject:"${titleEscaped}"`,
    `subject:"Re: ${titleEscaped}"`,
  ];
  if (clientEmail) {
    // Also pull any email from/to the client that mentions the RFI title
    queries.push(`(from:${clientEmail} OR to:${clientEmail}) "${titleEscaped}"`);
  }

  // Collect all unique message IDs across all queries
  const allMsgIds = new Set<string>();
  for (const q of queries) {
    try {
      let pageToken: string | undefined;
      do {
        const res = await gmail.users.messages.list({ userId: "me", q, maxResults: 200, pageToken });
        for (const m of res.data.messages ?? []) { if (m.id) allMsgIds.add(m.id); }
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);
    } catch { /* ignore per-query errors */ }
  }

  if (!allMsgIds.size) return { imported: 0, total: 0 };

  // Find which Gmail message IDs we already have in rfi_threads for this RFI
  const existingRows = await db.select({ gmailMessageId: rfiThreads.gmailMessageId })
    .from(rfiThreads)
    .where(eq(rfiThreads.rfiId, rfiId));
  const existingGmailIds = new Set(existingRows.map((r: any) => r.gmailMessageId).filter(Boolean));

  const newIds = [...allMsgIds].filter(id => !existingGmailIds.has(id));
  let imported = 0;

  for (const msgId of newIds) {
    try {
      const msgRes = await gmail.users.messages.get({ userId: "me", id: msgId, format: "full" });
      const msg = msgRes.data;
      const headers = msg.payload?.headers ?? [];
      const fromRaw = getHdr(headers, "From");
      const subject = getHdr(headers, "Subject");
      const dateStr = getHdr(headers, "Date");
      const fromEmail = parseEmail(fromRaw);
      const fromName = fromRaw.replace(/<[^>]+>/, "").trim().replace(/^"|"$/g, "");
      const body = extractBodyText(msg.payload);
      if (!body.trim()) continue;
      const isOutbound = WATCHED.includes(fromEmail.toLowerCase());
      const sentAt = dateStr ? new Date(dateStr) : new Date();

      await db.insert(rfiThreads).values({
        rfiId,
        projectId: rfi.projectId,
        direction: isOutbound ? "outbound" : "inbound",
        senderName: isOutbound ? "Kitchens Plus" : (fromName || clientName),
        senderEmail: fromEmail,
        subject: subject || `Re: ${rfi.title}`,
        body: body.slice(0, 10000),
        gmailMessageId: msgId,
        gmailThreadId: msg.threadId ?? undefined,
        createdAt: sentAt,
      });
      imported++;
    } catch { /* skip individual message errors */ }
  }

  return { imported, total: allMsgIds.size };
}

// ── Email helper ──────────────────────────────────────────────────────────────
async function sendRfiThreadReply({
  toEmail, clientName, rfiTitle, replyBody, attachments, rfiPdfBuffer,
}: {
  toEmail: string;
  clientName: string;
  rfiTitle: string;
  replyBody: string;
  attachments?: { url: string; name: string }[];
  rfiPdfBuffer?: Buffer;
}) {
  const transporter = createTransporter();
  const attachmentLinks = (attachments ?? []).map(a =>
    `<li><a href="${a.url}" style="color:#BF9A3B;">${a.name}</a></li>`
  ).join("");

  const html = `
    <div style="font-family:'Georgia',serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e0d8c8;border-radius:8px;overflow:hidden;">
      <div style="background:#1a1a1a;padding:28px 32px;text-align:center;">
        <h1 style="color:#BF9A3B;font-size:22px;margin:0;letter-spacing:2px;font-weight:400;">KITCHENS PLUS UPSTATE</h1>
        <p style="color:#888;font-size:12px;margin:6px 0 0;letter-spacing:1px;">RENOVATIONS &amp; DESIGN</p>
      </div>
      <div style="padding:32px;">
        <p style="color:#333;font-size:15px;margin:0 0 8px;">Dear ${clientName},</p>
        <p style="color:#888;font-size:12px;margin:0 0 20px;letter-spacing:1px;text-transform:uppercase;">Re: ${rfiTitle}</p>
        <div style="background:#f9f6f0;border-left:3px solid #BF9A3B;padding:16px 20px;border-radius:0 6px 6px 0;margin:0 0 20px;">
          <p style="color:#333;font-size:14px;line-height:1.7;margin:0;white-space:pre-wrap;">${replyBody}</p>
        </div>
        ${attachmentLinks ? `
          <div style="margin:16px 0;">
            <p style="color:#888;font-size:11px;letter-spacing:1px;text-transform:uppercase;margin:0 0 8px;">Attachments</p>
            <ul style="margin:0;padding-left:20px;color:#555;font-size:13px;">${attachmentLinks}</ul>
          </div>` : ""}
        <p style="color:#888;font-size:12px;line-height:1.6;margin:20px 0 0;">
          Please reply directly to this email to continue the conversation.
        </p>
      </div>
      <div style="background:#f5f0e8;padding:16px 32px;text-align:center;border-top:1px solid #e0d8c8;">
        <p style="color:#888;font-size:11px;margin:0;">&copy; ${new Date().getFullYear()} ${BUSINESS_NAME}. All rights reserved.</p>
      </div>
    </div>`;

  const mailAttachments: any[] = [];
  if (rfiPdfBuffer) {
    mailAttachments.push({
      filename: `RFI-${rfiTitle.replace(/[^a-zA-Z0-9\s-]/g, "").trim().replace(/\s+/g, "-")}.pdf`,
      content: rfiPdfBuffer,
      contentType: "application/pdf",
    });
  }
  await transporter.sendMail({
    from: `"${BUSINESS_NAME}" <${GMAIL_FROM}>`,
    to: toEmail,
    subject: `Re: ${rfiTitle} — ${BUSINESS_NAME}`,
    html,
    attachments: mailAttachments.length > 0 ? mailAttachments : undefined,
  });
}

// ── Router ────────────────────────────────────────────────────────────────────
export const rfiThreadsRouter = router({
  /** List all thread messages for an RFI, including their attachments */
  list: protectedProcedure
    .input(z.object({ rfiId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const threads = await db.select().from(rfiThreads)
        .where(eq(rfiThreads.rfiId, input.rfiId))
        .orderBy(asc(rfiThreads.createdAt));
      const attachments = await db.select().from(rfiThreadAttachments)
        .where(eq(rfiThreadAttachments.rfiId, input.rfiId));
      return threads.map(t => ({
        ...t,
        attachments: attachments.filter(a => a.rfiThreadId === t.id),
      }));
    }),

  /**
   * On-demand Gmail sync for a specific RFI.
   * Searches Gmail for all emails related to this RFI (by subject/title and client email)
   * and upserts any new messages into rfi_threads. Called automatically when the thread
   * panel is opened, and also available as a manual Refresh action.
   */
  syncFromGmail: protectedProcedure
    .input(z.object({ rfiId: z.number() }))
    .mutation(async ({ input }) => {
      const result = await syncRFIEmailsFromGmail(input.rfiId);
      return result;
    }),

  /** Add an outbound comment/reply to an RFI thread (sends email to client) */
  addComment: protectedProcedure
    .input(z.object({
      rfiId: z.number(),
      body: z.string().min(1),
      sendEmail: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [rfi] = await db.select().from(rfis).where(eq(rfis.id, input.rfiId)).limit(1);
      if (!rfi) throw new TRPCError({ code: "NOT_FOUND" });
      const now = new Date();
      const [result] = await db.insert(rfiThreads).values({
        rfiId: input.rfiId,
        projectId: rfi.projectId,
        direction: "outbound",
        senderName: ctx.user.name ?? "Kitchens Plus",
        senderEmail: GMAIL_FROM,
        subject: `Re: ${rfi.title}`,
        body: input.body,
        createdAt: now,
      });
      const threadId = (result as any).insertId as number;
      // Send email to client if requested
      if (input.sendEmail) {
        const [project] = await db.select().from(projects).where(eq(projects.id, rfi.projectId)).limit(1);
        let clientEmail: string | null = null;
        let clientName = "Valued Client";
        if (project?.clientId) {
          const [client] = await db.select().from(clients).where(eq(clients.id, project.clientId)).limit(1);
          if (client) { clientEmail = client.email ?? null; clientName = client.name; }
        } else if (project?.leadId) {
          const [lead] = await db.select().from(leads).where(eq(leads.id, project.leadId)).limit(1);
          if (lead) { clientEmail = lead.email ?? null; clientName = lead.name; }
        }
        if (clientEmail) {
          // Generate RFI PDF to attach to the reply email
          let rfiPdfBuffer: Buffer | undefined;
          try {
            let attachmentUrls: { url: string; name: string }[] | null = null;
            if (rfi.attachmentUrls) {
              try { attachmentUrls = JSON.parse(rfi.attachmentUrls); } catch {}
            }
            rfiPdfBuffer = await generateRfiPdf({
              rfiTitle: rfi.title,
              rfiBody: rfi.body,
              projectName: project?.name ?? null,
              clientName,
              status: rfi.status,
              sentAt: rfi.sentAt ?? null,
              responseText: rfi.responseText ?? null,
              responseComments: rfi.responseComments ?? null,
              attachmentUrls,
            });
          } catch (pdfErr) {
            console.error("[RFI PDF] Failed to generate PDF:", pdfErr);
          }
          await sendRfiThreadReply({ toEmail: clientEmail, clientName, rfiTitle: rfi.title, replyBody: input.body, rfiPdfBuffer });
        }
      }
      return { id: threadId };
    }),

  /** Upload a file attachment to a thread message */
  uploadAttachment: protectedProcedure
    .input(z.object({
      rfiId: z.number(),
      rfiThreadId: z.number(),
      fileName: z.string(),
      mimeType: z.string().default("application/octet-stream"),
      fileBase64: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [rfi] = await db.select().from(rfis).where(eq(rfis.id, input.rfiId)).limit(1);
      if (!rfi) throw new TRPCError({ code: "NOT_FOUND" });
      const buffer = Buffer.from(input.fileBase64, "base64");
      const suffix = nanoid(8);
      const fileKey = `rfi-thread-attachments/${input.rfiId}/${input.rfiThreadId}-${suffix}-${input.fileName}`;
      const { url } = await storagePut(fileKey, buffer, input.mimeType);
      await db.insert(rfiThreadAttachments).values({
        rfiThreadId: input.rfiThreadId,
        rfiId: input.rfiId,
        projectId: rfi.projectId,
        fileName: input.fileName,
        fileUrl: url,
        fileKey,
        mimeType: input.mimeType,
        fileSize: buffer.length,
        uploadedBy: ctx.user.name ?? "Owner",
        createdAt: new Date(),
      });
      return { url, fileName: input.fileName, fileKey };
    }),

  /** Convert an RFI to a Change Order (creates a draft CO linked to the RFI) */
  convertToChangeOrder: protectedProcedure
    .input(z.object({
      rfiId: z.number(),
      title: z.string().min(1),
      description: z.string().optional(),
      lineItems: z.array(z.object({
        task: z.string(),
        description: z.string().optional(),
        quantity: z.number().default(1),
        unitPrice: z.number().default(0),
        lineTotal: z.number().default(0),
      })).optional(),
      amount: z.number().default(0),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [rfi] = await db.select().from(rfis).where(eq(rfis.id, input.rfiId)).limit(1);
      if (!rfi) throw new TRPCError({ code: "NOT_FOUND" });
      // Generate sequential CO number
      const existing = await db.select({ id: changeOrders.id }).from(changeOrders)
        .where(eq(changeOrders.projectId, rfi.projectId));
      const num = existing.length + 1;
      const changeOrderNumber = `CO-${String(num).padStart(3, "0")}`;
      const approvalToken = nanoid(32);
      const [result] = await db.insert(changeOrders).values({
        projectId: rfi.projectId,
        rfiId: input.rfiId,
        changeOrderNumber,
        title: input.title,
        description: input.description ?? null,
        lineItemsJson: input.lineItems ? JSON.stringify(input.lineItems) : null,
        amount: String(input.amount),
        status: "draft",
        approvalToken,
        notes: input.notes ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return { id: (result as any).insertId, changeOrderNumber, projectId: rfi.projectId };
    }),
});
