/**
 * Change Orders Router
 * Handles creating, listing, sending for approval, and approving change orders.
 * Change orders are created from RFIs or manually, and sent to clients for approval.
 */
import { z } from "zod/v4";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { changeOrders, projects, clients, leads } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";
import { triggerFinancialReview } from "../agents/triggerFinancialReview";
import { runProjectSummaryAgent } from "../agents/ProjectSummaryAgent";
import { triggerNextActionRecompute } from "../agents/triggerNextActionRecompute";
import { draftInvoiceForChangeOrder } from "../agents/changeOrderInvoiceDraft";
import { EVENTS } from "../agents/eventBus";
import { createTransporter } from "../email";
import { nanoid } from "nanoid";
import { storagePut } from "../storage";

const BUSINESS_NAME = "Kitchens Plus Upstate";
const GMAIL_FROM = process.env.GMAIL_FROM ?? "chad@kitchensplusupstate.com";

// ── Email helper ──────────────────────────────────────────────────────────────
async function sendChangeOrderEmail({
  toEmail, clientName, co, approveUrl, pdfBuffer,
}: {
  toEmail: string;
  clientName: string;
  co: { changeOrderNumber: string; title: string; description?: string | null; amount: string | number; lineItemsJson?: string | null };
  approveUrl: string;
  pdfBuffer?: Buffer;
}) {
  const transporter = createTransporter();
  const amountNum = parseFloat(String(co.amount));
  const amountStr = `${amountNum >= 0 ? "+" : ""}$${Math.abs(amountNum).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  let lineItemsHtml = "";
  if (co.lineItemsJson) {
    try {
      const items = JSON.parse(co.lineItemsJson);
      if (items.length > 0) {
        lineItemsHtml = `
          <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
            <thead>
              <tr style="background:#f5f0e8;">
                <th style="text-align:left;padding:8px 12px;border-bottom:1px solid #e0d8c8;">Task</th>
                <th style="text-align:left;padding:8px 12px;border-bottom:1px solid #e0d8c8;">Description</th>
                <th style="text-align:right;padding:8px 12px;border-bottom:1px solid #e0d8c8;">Qty</th>
                <th style="text-align:right;padding:8px 12px;border-bottom:1px solid #e0d8c8;">Unit Price</th>
                <th style="text-align:right;padding:8px 12px;border-bottom:1px solid #e0d8c8;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((li: any) => `
                <tr>
                  <td style="padding:8px 12px;border-bottom:1px solid #f0ebe0;">${li.task ?? ""}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #f0ebe0;color:#666;">${li.description ?? ""}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #f0ebe0;text-align:right;">${li.quantity ?? 1}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #f0ebe0;text-align:right;">$${Number(li.unitPrice ?? 0).toFixed(2)}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #f0ebe0;text-align:right;font-weight:600;">$${Number(li.lineTotal ?? 0).toFixed(2)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>`;
      }
    } catch { /* ignore */ }
  }

  const html = `
    <div style="font-family:'Georgia',serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e0d8c8;border-radius:8px;overflow:hidden;">
      <div style="background:#1a1a1a;padding:28px 32px;text-align:center;">
        <h1 style="color:#BF9A3B;font-size:22px;margin:0;letter-spacing:2px;font-weight:400;">KITCHENS PLUS UPSTATE</h1>
        <p style="color:#888;font-size:12px;margin:6px 0 0;letter-spacing:1px;">RENOVATIONS &amp; DESIGN</p>
      </div>
      <div style="padding:32px;">
        <p style="color:#333;font-size:15px;margin:0 0 20px;">Dear ${clientName},</p>
        <p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 20px;">
          We have prepared a <strong>Change Order</strong> for your project that requires your review and approval.
          Please review the details below and click the button to approve.
        </p>

        <div style="background:#f9f6f0;border:1px solid #e0d8c8;border-radius:6px;padding:20px;margin:20px 0;">
          <p style="color:#BF9A3B;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">Change Order Details</p>
          <p style="color:#1a1a1a;font-size:18px;font-weight:600;margin:0 0 6px;">${co.changeOrderNumber}: ${co.title}</p>
          ${co.description ? `<p style="color:#555;font-size:13px;line-height:1.6;margin:8px 0 0;">${co.description}</p>` : ""}
          <p style="color:#1a1a1a;font-size:20px;font-weight:700;margin:16px 0 0;">
            Amount: <span style="color:${amountNum >= 0 ? "#BF9A3B" : "#2d7a4f"}">${amountStr}</span>
          </p>
        </div>

        ${lineItemsHtml}

        <div style="text-align:center;margin:32px 0;">
          <a href="${approveUrl}" style="display:inline-block;background:#BF9A3B;color:#1a1a1a;text-decoration:none;padding:14px 36px;border-radius:4px;font-size:14px;font-weight:600;letter-spacing:1px;">
            APPROVE CHANGE ORDER
          </a>
        </div>

        <p style="color:#888;font-size:12px;line-height:1.6;margin:20px 0 0;">
          By clicking the button above, you are approving this change order and authorizing ${BUSINESS_NAME} to proceed with the described work.
          If you have questions, please reply to this email or contact us directly.
        </p>
      </div>
      <div style="background:#f5f0e8;padding:16px 32px;text-align:center;border-top:1px solid #e0d8c8;">
        <p style="color:#888;font-size:11px;margin:0;">&copy; ${new Date().getFullYear()} ${BUSINESS_NAME}. All rights reserved.</p>
      </div>
    </div>`;

  await transporter.sendMail({
    from: `"${BUSINESS_NAME}" <${GMAIL_FROM}>`,
    to: toEmail,
    subject: `Change Order Approval Required: ${co.changeOrderNumber} — ${co.title}`,
    html,
    ...(pdfBuffer ? {
      attachments: [{
        filename: `ChangeOrder-${co.changeOrderNumber}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      }],
    } : {}),
  });
}

// ── Router ────────────────────────────────────────────────────────────────────
export const changeOrdersRouter = router({
  /** Create a new change order (usually from an RFI) */
  create: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      rfiId: z.number().optional(),
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
      // Generate a sequential change order number for the project
      const existing = await db.select({ id: changeOrders.id }).from(changeOrders)
        .where(eq(changeOrders.projectId, input.projectId));
      const num = existing.length + 1;
      const changeOrderNumber = `CO-${String(num).padStart(3, "0")}`;
      const approvalToken = nanoid(32);
      const [result] = await db.insert(changeOrders).values({
        projectId: input.projectId,
        rfiId: input.rfiId ?? null,
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
      return { id: (result as any).insertId, changeOrderNumber, approvalToken };
    }),

  /** List all change orders for a project */
  listByProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db.select().from(changeOrders)
        .where(eq(changeOrders.projectId, input.projectId))
        .orderBy(desc(changeOrders.createdAt));
      return rows.map(co => ({
        ...co,
        amount: parseFloat(String(co.amount)),
        lineItems: co.lineItemsJson ? (() => { try { return JSON.parse(co.lineItemsJson!); } catch { return []; } })() : [],
      }));
    }),

  /** Get a single change order by ID */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [co] = await db.select().from(changeOrders).where(eq(changeOrders.id, input.id)).limit(1);
      if (!co) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        ...co,
        amount: parseFloat(String(co.amount)),
        lineItems: co.lineItemsJson ? (() => { try { return JSON.parse(co.lineItemsJson!); } catch { return []; } })() : [],
      };
    }),

  /** Update a draft change order */
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      lineItems: z.array(z.object({
        task: z.string(),
        description: z.string().optional(),
        quantity: z.number().default(1),
        unitPrice: z.number().default(0),
        lineTotal: z.number().default(0),
      })).optional(),
      amount: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, lineItems, ...rest } = input;
      await db.update(changeOrders).set({
        ...(rest.title !== undefined && { title: rest.title }),
        ...(rest.description !== undefined && { description: rest.description }),
        ...(rest.amount !== undefined && { amount: String(rest.amount) }),
        ...(rest.notes !== undefined && { notes: rest.notes }),
        ...(lineItems !== undefined && { lineItemsJson: JSON.stringify(lineItems) }),
        updatedAt: new Date(),
      }).where(eq(changeOrders.id, id));
      return { ok: true };
    }),

  /** Send a change order to the client for approval */
  send: protectedProcedure
    .input(z.object({ id: z.number(), origin: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [co] = await db.select().from(changeOrders).where(eq(changeOrders.id, input.id)).limit(1);
      if (!co) throw new TRPCError({ code: "NOT_FOUND" });
      // Resolve client email from project
      const [project] = await db.select().from(projects).where(eq(projects.id, co.projectId)).limit(1);
      let clientName = "Valued Client";
      let clientEmail: string | null = null;
      if (project?.clientId) {
        const [client] = await db.select().from(clients).where(eq(clients.id, project.clientId)).limit(1);
        if (client) { clientName = client.name; clientEmail = client.email ?? null; }
      } else if (project?.leadId) {
        const [lead] = await db.select().from(leads).where(eq(leads.id, project.leadId)).limit(1);
        if (lead) { clientName = lead.name; clientEmail = lead.email ?? null; }
      }
      if (!clientEmail) throw new TRPCError({ code: "BAD_REQUEST", message: "No client email found for this project." });
      const approveUrl = `${input.origin}/change-order/approve/${co.approvalToken}`;
      // ── Generate CO PDF for attachment ──────────────────────────────────────
      let coPdfBuffer: Buffer | undefined;
      try {
        const { generateChangeOrderPdf } = await import("../changeOrderPdf");
        const lineItems = co.lineItemsJson ? (() => { try { return JSON.parse(co.lineItemsJson); } catch { return []; } })() : [];
        coPdfBuffer = await generateChangeOrderPdf({
          changeOrderNumber: co.changeOrderNumber,
          title: co.title,
          description: co.description ?? undefined,
          projectName: project?.name ?? undefined,
          clientName,
          clientEmail: clientEmail ?? undefined,
          amount: parseFloat(String(co.amount)),
          lineItems,
          notes: co.notes ?? undefined,
          createdAt: co.createdAt ?? null,
        });
      } catch (pdfErr: any) {
        console.error("[CO PDF] Generation failed:", pdfErr?.message);
      }
      await sendChangeOrderEmail({ toEmail: clientEmail, clientName, co: { ...co, amount: co.amount }, approveUrl, pdfBuffer: coPdfBuffer });
      await db.update(changeOrders).set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
        .where(eq(changeOrders.id, input.id));
      return { ok: true, sentTo: clientEmail };
    }),

  /** Public: get CO details by approval token (for the approval page) */
  getByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [co] = await db.select().from(changeOrders).where(eq(changeOrders.approvalToken, input.token)).limit(1);
      if (!co) throw new TRPCError({ code: "NOT_FOUND", message: "Change order not found or link expired." });
      // Don't expose signatureDataUrl publicly
      return {
        id: co.id,
        changeOrderNumber: co.changeOrderNumber,
        title: co.title,
        description: co.description,
        lineItemsJson: co.lineItemsJson,
        amount: co.amount,
        status: co.status,
        notes: co.notes,
        sentAt: co.sentAt,
        signedPdfUrl: co.signedPdfUrl,
      };
    }),

  /** Public: client approves change order via token link in email */
  approveByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [co] = await db.select().from(changeOrders).where(eq(changeOrders.approvalToken, input.token)).limit(1);
      if (!co) throw new TRPCError({ code: "NOT_FOUND", message: "Change order not found or link expired." });
      if (co.status === "approved") return { ok: true, alreadyApproved: true, title: co.title, changeOrderNumber: co.changeOrderNumber };
      await db.update(changeOrders).set({
        status: "approved",
        approvedAt: new Date(),
        approvalMethod: "email_link",
        updatedAt: new Date(),
      }).where(eq(changeOrders.id, co.id));
      await notifyOwner({ title: "Change Order Approved", content: `Client approved change order "${co.title}" (${co.changeOrderNumber}).` });
      // ── Event-triggered financial review ──────────────────────────────────
      if (co.projectId) {
        void triggerFinancialReview(co.projectId, EVENTS.CHANGE_ORDER_APPROVED, co.id);
        // Also re-evaluate project risk and refresh project summary on CO approval
        runProjectSummaryAgent(co.projectId).catch(console.error);
        // ── Event-triggered Next Action recompute ──────────────────────────
        void triggerNextActionRecompute(co.projectId);
      }
      // ── Auto-draft invoice for the approved change order ─────────────────
      void draftInvoiceForChangeOrder(co.id);
      return { ok: true, alreadyApproved: false, title: co.title, changeOrderNumber: co.changeOrderNumber };
    }),

  /** Public: client declines change order via token link in email */
  declineByToken: publicProcedure
    .input(z.object({ token: z.string(), reason: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [co] = await db.select().from(changeOrders).where(eq(changeOrders.approvalToken, input.token)).limit(1);
      if (!co) throw new TRPCError({ code: "NOT_FOUND", message: "Change order not found or link expired." });
      if (co.status === "rejected") return { ok: true, alreadyDeclined: true, title: co.title, changeOrderNumber: co.changeOrderNumber };
      if (co.status === "approved") throw new TRPCError({ code: "BAD_REQUEST", message: "This change order has already been approved and cannot be declined." });
      await db.update(changeOrders).set({
        status: "rejected",
        notes: input.reason ? `Declined by client: ${input.reason}` : "Declined by client via email link",
        updatedAt: new Date(),
      }).where(eq(changeOrders.id, co.id));
      await notifyOwner({
        title: "Change Order Declined",
        content: `Client declined change order "${co.title}" (${co.changeOrderNumber}).${input.reason ? ` Reason: ${input.reason}` : ""}`,
      });
      // ── Google Chat notification (mandatory) ─────────────────────────────
      const chatWebhookUrl = process.env.GOOGLE_CHAT_WEBHOOK_URL;
      if (chatWebhookUrl) {
        try {
          const chatMsg = {
            text: `⚠️ *Change Order DECLINED*\n\n*Change Order:* ${co.title} (${co.changeOrderNumber})\n*Amount:* $${parseFloat(String(co.amount ?? 0)).toLocaleString("en-US", { minimumFractionDigits: 2 })}${input.reason ? `\n*Client Reason:* ${input.reason}` : ""}\n\nAction required — follow up with the client.`,
          };
          await fetch(chatWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(chatMsg),
          });
        } catch (chatErr: any) {
          console.error("[GoogleChat] CO decline notification failed:", chatErr?.message);
        }
      }
      return { ok: true, alreadyDeclined: false, title: co.title, changeOrderNumber: co.changeOrderNumber };
    }),

  /** Get the sum of all approved change orders for a project */
  sumApproved: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { total: 0, count: 0 };
      const rows = await db.select().from(changeOrders)
        .where(eq(changeOrders.projectId, input.projectId));
      const approved = rows.filter(co => co.status === "approved");
      const total = approved.reduce((sum, co) => sum + parseFloat(String(co.amount)), 0);
      return { total: parseFloat(total.toFixed(2)), count: approved.length };
    }),

  /** Owner manually marks a change order as approved */
  approveManually: protectedProcedure
    .input(z.object({ id: z.number(), approvedBy: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(changeOrders).set({
        status: "approved",
        approvedAt: new Date(),
        approvedBy: input.approvedBy ?? ctx.user.name ?? "Owner",
        approvalMethod: "manual",
        updatedAt: new Date(),
      }).where(eq(changeOrders.id, input.id));
      // ── Auto-draft invoice for the manually approved change order ────────
      void draftInvoiceForChangeOrder(input.id);
      return { ok: true };
    }),

  /** Owner voids a change order */
  void: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(changeOrders).set({ status: "voided", updatedAt: new Date() })
        .where(eq(changeOrders.id, input.id));
      return { ok: true };
    }),

  /** Count pending change orders for a project */
  countPending: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { count: 0 };
      const rows = await db.select({ id: changeOrders.id }).from(changeOrders)
        .where(eq(changeOrders.projectId, input.projectId));
      const pending = rows.filter(() => true); // count all for now
      return { count: pending.length };
    }),
});
