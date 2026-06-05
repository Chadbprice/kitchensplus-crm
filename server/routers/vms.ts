/**
 * VMS Superpower Router
 * SP1: Vendor Scorecards & AI Tier Recommendations
 * SP2: Compliance Status & Expiration Logic
 * SP3: Vendor Portal Magic-Link Auth + Invoice Submission
 * SP4: RFQ Management (create, invite, bid, award)
 * SP5: Task-to-PO Pipeline
 */
import { router, protectedProcedure, publicProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import {
  vendors,
  vendorContacts,
  vendorDocs,
  vendorPortalSessions,
  rfqs,
  rfqInvitations,
  vendorInvoices,
  purchaseOrders,
  projectTasks,
  projects,
  subcontractors,
  projectAssignments,
  taskAssignees,
  subcontractorDocs,
  subcontractorAwardCandidates,
} from "../../drizzle/schema";
import { eq, and, sql, lt, gte, isNull, isNotNull, or, inArray } from "drizzle-orm";
import { randomBytes } from "crypto";
import { createTransporter } from "../email";

async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"Kitchens Plus Upstate" <${process.env.GMAIL_APP_PASSWORD ? "noreply@kitchensplus.com" : "noreply@kitchensplus.com"}>`,
    to,
    subject,
    html,
  });
}
import { sendSms } from "../sms";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

function tierFromScore(score: number): "elite" | "preferred" | "standard" | "do_not_use" {
  if (score >= 9.0) return "elite";
  if (score >= 7.5) return "preferred";
  if (score >= 5.0) return "standard";
  return "do_not_use";
}

// ─── SP1: Scorecards ─────────────────────────────────────────────────────────

const scorecardRouter = router({
  /** Manually update scorecard scores for a vendor */
  update: adminProcedure
    .input(z.object({
      vendorId: z.number(),
      onTimePercentage: z.number().min(0).max(100).optional(),
      qualityScore: z.number().min(0).max(10).optional(),
      responsivenessScore: z.number().min(0).max(10).optional(),
    }))
    .mutation(async ({ input }) => {
        const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { vendorId, onTimePercentage, qualityScore, responsivenessScore } = input;

      // Calculate composite performance score (weighted average)
      const onTimeScore = onTimePercentage !== undefined ? (onTimePercentage / 10) : null;
      const scores = [onTimeScore, qualityScore, responsivenessScore].filter(s => s !== null) as number[];
      const composite = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
      const tier = composite !== null ? tierFromScore(composite) : undefined;

      await db.update(vendors)
        .set({
          ...(onTimePercentage !== undefined && { onTimePercentage: String(onTimePercentage) }),
          ...(qualityScore !== undefined && { qualityScore: String(qualityScore) }),
          ...(responsivenessScore !== undefined && { responsivenessScore: String(responsivenessScore) }),
          ...(composite !== null && { performanceScore: String(composite.toFixed(1)) }),
          ...(tier && { tier }),
          lastScorecardAt: new Date(),
        })
        .where(eq(vendors.id, vendorId));

      return { success: true, tier, composite };
    }),

  /** Get scorecard for a vendor */
  get: protectedProcedure
    .input(z.object({ vendorId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [vendor] = await db.select({
        id: vendors.id,
        companyName: vendors.companyName,
        trade: vendors.trade,
        notes: vendors.notes,
        availability: vendors.availability,
        tier: vendors.tier,
        performanceScore: vendors.performanceScore,
        onTimePercentage: vendors.onTimePercentage,
        qualityScore: vendors.qualityScore,
        responsivenessScore: vendors.responsivenessScore,
        lastScorecardAt: vendors.lastScorecardAt,
      }).from(vendors).where(eq(vendors.id, input.vendorId)).limit(1);
      return vendor ?? null;
    }),

  /** AI-powered vendor recommendation for a trade */
  recommend: adminProcedure
    .input(z.object({
      trade: z.string(),
      projectDescription: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const vendorList = await db.select({
        id: vendors.id,
        companyName: vendors.companyName,
        trade: vendors.trade,
        tier: vendors.tier,
        performanceScore: vendors.performanceScore,
        onTimePercentage: vendors.onTimePercentage,
        qualityScore: vendors.qualityScore,
        responsivenessScore: vendors.responsivenessScore,
        availability: vendors.availability,
        notes: vendors.notes,
      }).from(vendors)
        .where(and(eq(vendors.isActive, true), eq(vendors.trade, input.trade)));

      if (vendorList.length === 0) return { recommendation: null, reasoning: "No vendors found for this trade." };

      const prompt = `You are a luxury renovation project manager at Kitchens Plus Upstate. 
Given these vendors for the trade "${input.trade}"${input.projectDescription ? ` for a project: "${input.projectDescription}"` : ""}:

${vendorList.map(v => `- ${v.companyName}: tier=${v.tier}, score=${v.performanceScore}, onTime=${v.onTimePercentage}%, quality=${v.qualityScore}/10, responsiveness=${v.responsivenessScore}/10, availability=${v.availability}`).join("\n")}

Recommend the BEST vendor and explain why in 2-3 sentences. Be direct and specific.`;

      const response = await invokeLLM({
        messages: [{ role: "user", content: prompt }],
      });

      const reasoning = response.choices[0]?.message?.content ?? "Unable to generate recommendation.";
      // Extract the first vendor name mentioned
      const recommended = vendorList.find(v => reasoning.includes(v.companyName)) ?? vendorList[0];

      return { recommendation: recommended, reasoning };
    }),
});

// ─── SP2: Compliance ──────────────────────────────────────────────────────────

const complianceRouter = router({
  /** Get compliance status for all vendors (owner view) */
  dashboard: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const docs = await db.select({
      id: vendorDocs.id,
      vendorId: vendorDocs.vendorId,
      docType: vendorDocs.docType,
      fileName: vendorDocs.fileName,
      fileUrl: vendorDocs.fileUrl,
      expiryDate: vendorDocs.expiryDate,
      status: vendorDocs.status,
      uploadedAt: vendorDocs.uploadedAt,
      vendorName: vendors.companyName,
    })
      .from(vendorDocs)
      .innerJoin(vendors, eq(vendorDocs.vendorId, vendors.id))
      .where(eq(vendors.isActive, true));

    const expired = docs.filter(d => d.expiryDate && d.expiryDate < now);
    const expiringSoon = docs.filter(d => d.expiryDate && d.expiryDate >= now && d.expiryDate <= in30Days);
    const pending = docs.filter(d => d.status === "pending");
    const compliant = docs.filter(d => d.status === "approved" && (!d.expiryDate || d.expiryDate > in30Days));

    return { expired, expiringSoon, pending, compliant, total: docs.length };
  }),

  /** Check if a vendor is compliant (for PO creation safeguard) */
  checkVendor: adminProcedure
    .input(z.object({ vendorId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const now = new Date();
      const docs = await db.select().from(vendorDocs)
        .where(and(eq(vendorDocs.vendorId, input.vendorId), eq(vendorDocs.isRequired, true)));

      const expired = docs.filter(d => d.expiryDate && d.expiryDate < now);
      const missing = ["insurance", "workers_comp", "license"].filter(
        req => !docs.some(d => d.docType === req)
      );

      return {
        isCompliant: expired.length === 0 && missing.length === 0,
        expiredDocs: expired,
        missingDocTypes: missing,
      };
    }),

  /** Approve a vendor document */
  approveDoc: adminProcedure
    .input(z.object({ docId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(vendorDocs).set({ status: "approved" }).where(eq(vendorDocs.id, input.docId));
      return { success: true };
    }),

  /** Reject a vendor document */
  rejectDoc: adminProcedure
    .input(z.object({ docId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(vendorDocs).set({ status: "rejected" }).where(eq(vendorDocs.id, input.docId));
      return { success: true };
    }),
});

// ─── SP3: Vendor Portal Auth ──────────────────────────────────────────────────

const vendorPortalRouter = router({
  /** Send a magic-link login to a vendor contact */
  sendMagicLink: adminProcedure
    .input(z.object({ vendorId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [vendor] = await db.select().from(vendors).where(eq(vendors.id, input.vendorId)).limit(1);
      if (!vendor) throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found" });

      const contacts = await db.select().from(vendorContacts).where(eq(vendorContacts.vendorId, input.vendorId));
      const emailContact = contacts.find(c => c.email && c.receiveEmailMessages);
      if (!emailContact?.email) throw new TRPCError({ code: "BAD_REQUEST", message: "No email contact found for this vendor" });

      const token = generateToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await db.insert(vendorPortalSessions).values({
        vendorId: input.vendorId,
        token,
        expiresAt,
      });

      const portalUrl = `${process.env.VITE_OAUTH_PORTAL_URL?.replace("portal", "app") ?? "https://app.manus.space"}/vendor/portal?token=${token}`;

      await sendEmail({
        to: emailContact.email,
        subject: `Your Kitchens Plus Vendor Portal Access`,
        html: `
          <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px; background: #1A1B17; color: #F5F0E8;">
            <h2 style="color: #BF9A3B; font-size: 24px; margin-bottom: 8px;">Kitchens Plus Upstate</h2>
            <p style="color: #9B9B8B; margin-bottom: 32px;">Vendor Portal Access</p>
            <p>Hello ${emailContact.contactName},</p>
            <p>You've been invited to access the Kitchens Plus vendor portal for <strong>${vendor.companyName}</strong>. Use the button below to log in — no password required.</p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${portalUrl}" style="background: #BF9A3B; color: #1A1B17; padding: 14px 32px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">Access Vendor Portal</a>
            </div>
            <p style="color: #9B9B8B; font-size: 13px;">This link expires in 7 days. If you didn't expect this email, you can safely ignore it.</p>
          </div>
        `,
      });

      return { success: true, expiresAt };
    }),

  /** Validate a vendor portal token and return vendor info */
  validateToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [session] = await db.select().from(vendorPortalSessions)
        .where(and(eq(vendorPortalSessions.token, input.token), isNull(vendorPortalSessions.usedAt)))
        .limit(1);

      if (!session) return null;
      if (session.expiresAt < new Date()) return null;

      const [vendor] = await db.select().from(vendors).where(eq(vendors.id, session.vendorId)).limit(1);
      return vendor ? { vendor, sessionId: session.id } : null;
    }),

  /** Submit a vendor invoice against a PO */
  submitInvoice: publicProcedure
    .input(z.object({
      token: z.string(),
      poId: z.number(),
      invoiceNumber: z.string().optional(),
      amount: z.number(),
      fileUrl: z.string().optional(),
      fileKey: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [session] = await db.select().from(vendorPortalSessions)
        .where(eq(vendorPortalSessions.token, input.token)).limit(1);
      if (!session || session.expiresAt < new Date()) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired portal token" });
      }

      const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.poId)).limit(1);
      if (!po) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase order not found" });

      await db.insert(vendorInvoices).values({
        vendorId: session.vendorId,
        poId: input.poId,
        projectId: po.projectId ?? undefined,
        invoiceNumber: input.invoiceNumber,
        amount: String(input.amount),
        fileUrl: input.fileUrl,
        fileKey: input.fileKey,
        notes: input.notes,
      });

      return { success: true };
    }),

  /** List invoices submitted by a vendor (via portal token) */
  listInvoices: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const [session] = await db.select().from(vendorPortalSessions)
        .where(eq(vendorPortalSessions.token, input.token)).limit(1);
      if (!session || session.expiresAt < new Date()) return [];

      return db.select().from(vendorInvoices)
        .where(eq(vendorInvoices.vendorId, session.vendorId))
        .orderBy(sql`${vendorInvoices.createdAt} DESC`);
    }),

  /** Owner: list all submitted invoices */
  listAllInvoices: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select({
      id: vendorInvoices.id,
      vendorId: vendorInvoices.vendorId,
      poId: vendorInvoices.poId,
      invoiceNumber: vendorInvoices.invoiceNumber,
      amount: vendorInvoices.amount,
      status: vendorInvoices.status,
      fileUrl: vendorInvoices.fileUrl,
      notes: vendorInvoices.notes,
      submittedAt: vendorInvoices.submittedAt,
      companyName: vendors.companyName,
    })
      .from(vendorInvoices)
      .innerJoin(vendors, eq(vendorInvoices.vendorId, vendors.id))
      .orderBy(sql`${vendorInvoices.submittedAt} DESC`);
  }),

  /** List POs for a vendor (via portal token) */
  listMyPOs: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const [session] = await db.select().from(vendorPortalSessions)
        .where(eq(vendorPortalSessions.token, input.token)).limit(1);
      if (!session || session.expiresAt < new Date()) return [];
      return db.select().from(purchaseOrders)
        .where(eq(purchaseOrders.vendorId, session.vendorId))
        .orderBy(sql`${purchaseOrders.createdAt} DESC`);
    }),

  /** Owner: approve or reject a vendor invoice */
  reviewInvoice: adminProcedure
    .input(z.object({
      invoiceId: z.number(),
      action: z.enum(["approved", "rejected", "paid"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(vendorInvoices)
        .set({ status: input.action, reviewedAt: new Date() })
        .where(eq(vendorInvoices.id, input.invoiceId));
      return { success: true };
    }),
});

// ─── SP4: RFQ Management ──────────────────────────────────────────────────────

const rfqRouter = router({
  /** List RFQs for a project */
  list: protectedProcedure
    .input(z.object({ projectId: z.number().optional(), vendorId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      let rfqList;
      if (input.vendorId) {
        // List RFQs that have an invitation for this vendor
        const invites = await db.select({ rfqId: rfqInvitations.rfqId })
          .from(rfqInvitations).where(eq(rfqInvitations.vendorId, input.vendorId));
        const rfqIds = invites.map(i => i.rfqId);
        if (rfqIds.length === 0) return [];
        rfqList = await db.select().from(rfqs)
          .where(inArray(rfqs.id, rfqIds))
          .orderBy(sql`${rfqs.createdAt} DESC`);
      } else if (input.projectId) {
        rfqList = await db.select().from(rfqs)
          .where(eq(rfqs.projectId, input.projectId))
          .orderBy(sql`${rfqs.createdAt} DESC`);
      } else {
        rfqList = await db.select().from(rfqs)
          .orderBy(sql`${rfqs.createdAt} DESC`);
      }

      // Attach invitation counts
      const rfqIdList = rfqList.map(r => r.id);
      if (rfqIdList.length === 0) return rfqList.map(r => ({ ...r, invitationCount: 0, quotedCount: 0 }));

      const invitations = await db.select().from(rfqInvitations)
        .where(inArray(rfqInvitations.rfqId, rfqIdList));

      return rfqList.map(r => ({
        ...r,
        invitationCount: invitations.filter(i => i.rfqId === r.id).length,
        quotedCount: invitations.filter(i => i.rfqId === r.id && i.status === "quoted").length,
      }));
    }),

  /** Get a single RFQ with all bids */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, input.id)).limit(1);
      if (!rfq) return null;

      const invitations = await db.select({
        id: rfqInvitations.id,
        rfqId: rfqInvitations.rfqId,
        vendorId: rfqInvitations.vendorId,
        status: rfqInvitations.status,
        quotedAmount: rfqInvitations.quotedAmount,
        quotedLeadTimeDays: rfqInvitations.quotedLeadTimeDays,
        vendorNotes: rfqInvitations.vendorNotes,
        respondedAt: rfqInvitations.respondedAt,
        sentAt: rfqInvitations.sentAt,
        companyName: vendors.companyName,
        trade: vendors.trade,
        tier: vendors.tier,
        performanceScore: vendors.performanceScore,
      })
        .from(rfqInvitations)
        .innerJoin(vendors, eq(rfqInvitations.vendorId, vendors.id))
        .where(eq(rfqInvitations.rfqId, input.id));

      return { ...rfq, invitations };
    }),

  /** Create a new RFQ */
  create: adminProcedure
    .input(z.object({
      projectId: z.number().optional(),
      title: z.string(),
      scopeOfWork: z.string().optional(),
      vendorIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [{ newId }] = await db.insert(rfqs).values({
        projectId: input.projectId ?? 0,
        title: input.title,
        scopeOfWork: input.scopeOfWork,
        createdBy: ctx.user.id,
      }).then(() => db!.select({ newId: sql<number>`LAST_INSERT_ID()` }).from(rfqs).limit(1));

      // Auto-invite specified vendors
      if (input.vendorIds && input.vendorIds.length > 0) {
        await db.insert(rfqInvitations).values(
          input.vendorIds.map(vendorId => ({ rfqId: newId, vendorId }))
        );
      }

      return { id: newId };
    }),

  /** Send RFQ invitations to vendors via email + SMS */
  send: adminProcedure
    .input(z.object({
      rfqId: z.number(),
      vendorIds: z.array(z.number()),
      origin: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, input.rfqId)).limit(1);
      if (!rfq) throw new TRPCError({ code: "NOT_FOUND" });

      const [project] = await db.select().from(projects).where(eq(projects.id, rfq.projectId)).limit(1);

      let sentCount = 0;
      for (const vendorId of input.vendorIds) {
        const [vendor] = await db.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
        if (!vendor) continue;

        const contacts = await db.select().from(vendorContacts).where(eq(vendorContacts.vendorId, vendorId));
        const emailContact = contacts.find(c => c.email && c.receiveEmailMessages);
        const smsContact = contacts.find(c => c.phone && c.receivePhoneMessages);

        // Upsert invitation record
        const existing = await db.select().from(rfqInvitations)
          .where(and(eq(rfqInvitations.rfqId, input.rfqId), eq(rfqInvitations.vendorId, vendorId)))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(rfqInvitations).values({ rfqId: input.rfqId, vendorId, sentAt: new Date() });
        } else {
          await db.update(rfqInvitations).set({ sentAt: new Date() })
            .where(and(eq(rfqInvitations.rfqId, input.rfqId), eq(rfqInvitations.vendorId, vendorId)));
        }

        const portalUrl = `${input.origin}/vendor/rfq/${input.rfqId}?vendor=${vendorId}`;

        if (emailContact?.email) {
          await sendEmail({
            to: emailContact.email,
            subject: `RFQ: ${rfq.title} — Kitchens Plus Upstate`,
            html: `
              <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px; background: #1A1B17; color: #F5F0E8;">
                <h2 style="color: #BF9A3B;">Request for Quote</h2>
                <p>Hello ${emailContact.contactName ?? vendor.companyName},</p>
                <p>Kitchens Plus Upstate is requesting a quote from <strong>${vendor.companyName}</strong> for the following:</p>
                <div style="background: #2A2B25; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="color: #BF9A3B; margin: 0 0 8px;">${rfq.title}</h3>
                  ${project ? `<p style="color: #9B9B8B; font-size: 13px;">Project: ${project.name}</p>` : ""}
                  ${rfq.scopeOfWork ? `<p style="margin-top: 12px;">${rfq.scopeOfWork}</p>` : ""}
                </div>
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${portalUrl}" style="background: #BF9A3B; color: #1A1B17; padding: 14px 32px; text-decoration: none; border-radius: 4px; font-weight: bold;">Submit Your Quote</a>
                </div>
                <p style="color: #9B9B8B; font-size: 13px;">Questions? Call +1 (833) 518-4811</p>
              </div>
            `,
          }).catch(() => {});
        }

        if (smsContact?.phone) {
          await sendSms(
            smsContact.phone,
            `Kitchens Plus: New RFQ — "${rfq.title}". Please submit your quote: ${portalUrl}`
          ).catch(() => {});
        }

        sentCount++;
      }

      await db.update(rfqs).set({ status: "sent" }).where(eq(rfqs.id, input.rfqId));
      return { success: true, sentCount };
    }),

  /** Submit a bid (vendor-facing, no auth required — uses vendorId param) */
  submitBid: publicProcedure
    .input(z.object({
      rfqId: z.number(),
      vendorId: z.number(),
      quotedAmount: z.number(),
      quotedLeadTimeDays: z.number().optional(),
      vendorNotes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(rfqInvitations)
        .set({
          status: "quoted",
          quotedAmount: String(input.quotedAmount),
          quotedLeadTimeDays: input.quotedLeadTimeDays,
          vendorNotes: input.vendorNotes,
          respondedAt: new Date(),
        })
        .where(and(
          eq(rfqInvitations.rfqId, input.rfqId),
          eq(rfqInvitations.vendorId, input.vendorId)
        ));
      return { success: true };
    }),

  /** Award an RFQ to a vendor (creates a PO automatically) */
  award: adminProcedure
    .input(z.object({
      rfqId: z.number(),
      vendorId: z.number(),
      origin: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, input.rfqId)).limit(1);
      if (!rfq) throw new TRPCError({ code: "NOT_FOUND" });

      const [invitation] = await db.select().from(rfqInvitations)
        .where(and(eq(rfqInvitations.rfqId, input.rfqId), eq(rfqInvitations.vendorId, input.vendorId)))
        .limit(1);

      // Mark awarded
      await db.update(rfqInvitations).set({ status: "awarded" })
        .where(and(eq(rfqInvitations.rfqId, input.rfqId), eq(rfqInvitations.vendorId, input.vendorId)));

      // Mark others as passed
      await db.update(rfqInvitations).set({ status: "passed" })
        .where(and(eq(rfqInvitations.rfqId, input.rfqId), sql`${rfqInvitations.vendorId} != ${input.vendorId}`));

      // Close RFQ
      await db.update(rfqs).set({ status: "awarded" }).where(eq(rfqs.id, input.rfqId));

      // Auto-create PO
      const poNumber = `PO-${Date.now().toString(36).toUpperCase()}`;
      await db.insert(purchaseOrders).values({
        projectId: rfq.projectId,
        vendorId: input.vendorId,
        title: rfq.title,
        notes: `Auto-created from RFQ #${input.rfqId}`,
        poNumber,
        status: "draft",
      });

      // Send thank-you emails to all vendors
      const allInvitations = await db.select({
        vendorId: rfqInvitations.vendorId,
        status: rfqInvitations.status,
        companyName: vendors.companyName,
      })
        .from(rfqInvitations)
        .innerJoin(vendors, eq(rfqInvitations.vendorId, vendors.id))
        .where(eq(rfqInvitations.rfqId, input.rfqId));

      for (const inv of allInvitations) {
        const contacts = await db.select().from(vendorContacts)
          .where(and(eq(vendorContacts.vendorId, inv.vendorId), eq(vendorContacts.receiveEmailMessages, true)));
        const emailContact = contacts.find(c => c.email);
        if (!emailContact?.email) continue;

        const isWinner = inv.vendorId === input.vendorId;
        await sendEmail({
          to: emailContact.email,
          subject: isWinner
            ? `You've been awarded the job — ${rfq.title}`
            : `RFQ Update — ${rfq.title}`,
          html: isWinner
            ? `<div style="font-family: Georgia, serif; padding: 40px; background: #1A1B17; color: #F5F0E8;"><h2 style="color: #BF9A3B;">Congratulations!</h2><p>You've been selected for <strong>${rfq.title}</strong>. Our team will be in touch shortly with the formal purchase order.</p><p style="color: #9B9B8B; font-size: 13px;">Kitchens Plus Upstate · +1 (833) 518-4811</p></div>`
            : `<div style="font-family: Georgia, serif; padding: 40px; background: #1A1B17; color: #F5F0E8;"><h2 style="color: #BF9A3B;">Thank You for Bidding</h2><p>Thank you for submitting a quote for <strong>${rfq.title}</strong>. We've selected another vendor for this project, but we appreciate your time and look forward to working with you in the future.</p><p style="color: #9B9B8B; font-size: 13px;">Kitchens Plus Upstate · +1 (833) 518-4811</p></div>`,
        }).catch(() => {});
      }

      return { success: true, poNumber };
    }),

  /** Get RFQ details for vendor portal (public, no auth required) */
  getPublicRFQ: publicProcedure
    .input(z.object({ rfqId: z.number(), vendorId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, input.rfqId)).limit(1);
      if (!rfq) throw new TRPCError({ code: "NOT_FOUND" });
      const [invitation] = await db.select().from(rfqInvitations)
        .where(and(eq(rfqInvitations.rfqId, input.rfqId), eq(rfqInvitations.vendorId, input.vendorId)))
        .limit(1);
      const [vendor] = await db.select({ id: vendors.id, companyName: vendors.companyName })
        .from(vendors).where(eq(vendors.id, input.vendorId)).limit(1);
      return { rfq, invitation: invitation ?? null, vendor: vendor ?? null };
    }),
});

// ─── SP5: Task-to-PO Pipeline ─────────────────────────────────────────────────

const taskPoRouter = router({
  /** Convert a task into a purchase order */
  convertTaskToPO: adminProcedure
    .input(z.object({
      taskId: z.number(),
      vendorId: z.number().optional(),
      title: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [task] = await db.select().from(projectTasks).where(eq(projectTasks.id, input.taskId)).limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });

      const poNumber = `PO-${Date.now().toString(36).toUpperCase()}`;
      await db.insert(purchaseOrders).values({
        projectId: task.projectId ?? 0,
        vendorId: input.vendorId,
        title: input.title ?? task.title,
        notes: input.notes ?? task.description ?? undefined,
        poNumber,
        status: "draft",
      });

      const [{ newPoId }] = await db.select({ newPoId: sql<number>`LAST_INSERT_ID()` }).from(purchaseOrders).limit(1);
      return { success: true, poId: newPoId, poNumber };
    }),
});

// ─── Subcontractor Scorecard Router ──────────────────────────────────────────

const subScorecardRouter = router({
  /** Get scorecard for a subcontractor */
  get: protectedProcedure
    .input(z.object({ subcontractorId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [sub] = await db.select({
        id: subcontractors.id,
        companyName: subcontractors.companyName,
        trade: subcontractors.trade,
        notes: subcontractors.notes,
        tier: subcontractors.tier,
        performanceScore: subcontractors.performanceScore,
        onTimePercentage: subcontractors.onTimePercentage,
        qualityScore: subcontractors.qualityScore,
        responsivenessScore: subcontractors.responsivenessScore,
        lastScorecardAt: subcontractors.lastScorecardAt,
        completedTaskCount: subcontractors.completedTaskCount,
        complianceStatus: subcontractors.complianceStatus,
      }).from(subcontractors).where(eq(subcontractors.id, input.subcontractorId)).limit(1);
      return sub ?? null;
    }),

  /** Update scorecard scores for a subcontractor */
  update: adminProcedure
    .input(z.object({
      subcontractorId: z.number(),
      onTimePercentage: z.number().min(0).max(100).optional(),
      qualityScore: z.number().min(0).max(10).optional(),
      responsivenessScore: z.number().min(0).max(10).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { subcontractorId, onTimePercentage, qualityScore, responsivenessScore } = input;
      const onTimeScore = onTimePercentage !== undefined ? (onTimePercentage / 10) : null;
      const scores = [onTimeScore, qualityScore, responsivenessScore].filter(s => s !== null) as number[];
      const composite = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
      const tier = composite !== null ? tierFromScore(composite) : undefined;
      await db.update(subcontractors)
        .set({
          ...(onTimePercentage !== undefined && { onTimePercentage: String(onTimePercentage) }),
          ...(qualityScore !== undefined && { qualityScore: String(qualityScore) }),
          ...(responsivenessScore !== undefined && { responsivenessScore: String(responsivenessScore) }),
          ...(composite !== null && { performanceScore: String(composite.toFixed(1)) }),
          ...(tier && { tier }),
          lastScorecardAt: new Date(),
        })
        .where(eq(subcontractors.id, subcontractorId));
      return { success: true, tier, composite };
    }),
});

// ─── Trade Partners Router (project-level view) ───────────────────────────────

const tradePartnersRouter = router({
  /** Get all vendors and subcontractors associated with a project */
  getByProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { projectId } = input;

      // Vendors from project_assignments
      const assignedVendorRows = await db
        .select({ assigneeId: projectAssignments.assigneeId, role: projectAssignments.role })
        .from(projectAssignments)
        .where(and(eq(projectAssignments.projectId, projectId), eq(projectAssignments.assigneeType, "vendor")));
      const assignedVendorIds = [...new Set(assignedVendorRows.map(r => r.assigneeId))];

      // Vendors from purchase_orders
      const poVendorRows = await db
        .select({ vendorId: purchaseOrders.vendorId })
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.projectId, projectId), isNotNull(purchaseOrders.vendorId)));
      const poVendorIds = [...new Set(poVendorRows.map(r => r.vendorId!).filter(Boolean))];

      const allVendorIds = [...new Set([...assignedVendorIds, ...poVendorIds])];
      const vendorRows = allVendorIds.length > 0
        ? await db.select({ id: vendors.id, companyName: vendors.companyName, trade: vendors.trade, tier: vendors.tier, performanceScore: vendors.performanceScore, isActive: vendors.isActive })
            .from(vendors).where(inArray(vendors.id, allVendorIds))
        : [];

      // Vendor compliance doc counts
      const vendorDocRows = vendorRows.length > 0
        ? await db.select({ vendorId: vendorDocs.vendorId, status: vendorDocs.status })
            .from(vendorDocs).where(inArray(vendorDocs.vendorId, vendorRows.map(v => v.id)))
        : [];
      const vendorDocMap = new Map<number, { approved: number; pending: number; expired: number }>();
      for (const doc of vendorDocRows) {
        const cur = vendorDocMap.get(doc.vendorId) ?? { approved: 0, pending: 0, expired: 0 };
        if (doc.status === "approved") cur.approved++;
        else if (doc.status === "pending") cur.pending++;
        else if (doc.status === "expired") cur.expired++;
        vendorDocMap.set(doc.vendorId, cur);
      }

      // Subcontractors from task_assignees (vendor type in tasks for this project)
      const taskAssigneeRows = await db
        .select({ assigneeId: taskAssignees.assigneeId })
        .from(taskAssignees)
        .innerJoin(projectTasks, eq(taskAssignees.taskId, projectTasks.id))
        .where(and(eq(projectTasks.projectId, projectId), eq(taskAssignees.assigneeType, "vendor"), isNotNull(taskAssignees.assigneeId)));
      const taskVendorIds = [...new Set(taskAssigneeRows.map(r => r.assigneeId!).filter(Boolean))];
      const subRows = taskVendorIds.length > 0
        ? await db.select({ id: subcontractors.id, companyName: subcontractors.companyName, trade: subcontractors.trade, tier: subcontractors.tier, performanceScore: subcontractors.performanceScore, complianceStatus: subcontractors.complianceStatus })
            .from(subcontractors).where(inArray(subcontractors.id, taskVendorIds))
        : [];

      // Sub compliance doc counts
      const subDocRows = subRows.length > 0
        ? await db.select({ subcontractorId: subcontractorDocs.subcontractorId, status: subcontractorDocs.status })
            .from(subcontractorDocs).where(inArray(subcontractorDocs.subcontractorId, subRows.map(s => s.id)))
        : [];
      const subDocMap = new Map<number, { approved: number; pending: number; expired: number }>();
      for (const doc of subDocRows) {
        const cur = subDocMap.get(doc.subcontractorId) ?? { approved: 0, pending: 0, expired: 0 };
        if (doc.status === "approved") cur.approved++;
        else if (doc.status === "pending") cur.pending++;
        else if (doc.status === "expired") cur.expired++;
        subDocMap.set(doc.subcontractorId, cur);
      }
      // Award candidate status per sub for this project
      const awardRows = subRows.length > 0
        ? await db.select({
            subcontractorId: subcontractorAwardCandidates.subcontractorId,
            status: subcontractorAwardCandidates.status,
            agreedAmount: subcontractorAwardCandidates.agreedAmount,
          })
            .from(subcontractorAwardCandidates)
            .where(and(
              inArray(subcontractorAwardCandidates.subcontractorId, subRows.map(s => s.id)),
              eq(subcontractorAwardCandidates.projectId, projectId),
            ))
        : [];
      // Build a map: subId -> best award status (accepted > awarded > pending > declined)
      const awardStatusOrder = ["accepted", "awarded", "pending", "declined", "voided"];
      const awardMap = new Map<number, { status: string; agreedAmount: string | null }>();
      for (const row of awardRows) {
        const existing = awardMap.get(row.subcontractorId);
        if (!existing || awardStatusOrder.indexOf(row.status) < awardStatusOrder.indexOf(existing.status)) {
          awardMap.set(row.subcontractorId, { status: row.status, agreedAmount: row.agreedAmount });
        }
      }
      return {
        vendors: vendorRows.map(v => ({
          ...v,
          partnerType: "vendor" as const,
          docs: vendorDocMap.get(v.id) ?? { approved: 0, pending: 0, expired: 0 },
        })),
        subcontractors: subRows.map(s => ({
          ...s,
          partnerType: "subcontractor" as const,
          docs: subDocMap.get(s.id) ?? { approved: 0, pending: 0, expired: 0 },
          awardStatus: awardMap.get(s.id) ?? null,
        })),
      };
    }),
  /** Assign a vendor to a project */
  assign: adminProcedure
    .input(z.object({
      projectId: z.number(),
      assigneeType: z.enum(["vendor", "crew"]),
      assigneeId: z.number(),
      role: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const existing = await db.select({ id: projectAssignments.id })
        .from(projectAssignments)
        .where(and(
          eq(projectAssignments.projectId, input.projectId),
          eq(projectAssignments.assigneeType, input.assigneeType),
          eq(projectAssignments.assigneeId, input.assigneeId),
        ))
        .limit(1);
      if (existing.length > 0) {
        if (input.role) {
          await db.update(projectAssignments)
            .set({ role: input.role })
            .where(eq(projectAssignments.id, existing[0].id));
        }
        return { success: true, alreadyAssigned: true };
      }
      await db.insert(projectAssignments).values({
        projectId: input.projectId,
        assigneeType: input.assigneeType,
        assigneeId: input.assigneeId,
        role: input.role ?? null,
      });
      return { success: true, alreadyAssigned: false };
    }),
  /** Remove a vendor/crew assignment from a project */
  removeAssignment: adminProcedure
    .input(z.object({
      projectId: z.number(),
      assigneeType: z.enum(["vendor", "crew"]),
      assigneeId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(projectAssignments)
        .where(and(
          eq(projectAssignments.projectId, input.projectId),
          eq(projectAssignments.assigneeType, input.assigneeType),
          eq(projectAssignments.assigneeId, input.assigneeId),
        ));
      return { success: true };
    }),
});

// ─── Main VMS Router──────────────────────────────────────────────────────────

export const vmsRouter = router({
  scorecard: scorecardRouter,
  subScorecard: subScorecardRouter,
  compliance: complianceRouter,
  vendorPortal: vendorPortalRouter,
  rfq: rfqRouter,
  taskPo: taskPoRouter,
  tradePartners: tradePartnersRouter,
});
