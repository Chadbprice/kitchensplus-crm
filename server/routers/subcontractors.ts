/**
 * Subcontractors Router
 *
 * Full workflow for labor-trade subcontractors:
 *   - CRUD: list, get, create, update, delete
 *   - Compliance: upload COI / Workers' Comp docs, approve/reject, compliance status rollup
 *   - Contracts: create per-task contract, generate PDF, send for e-signature, sign via portal
 *   - Portal: magic-link auth (send link, verify token, get session)
 *   - Comms: log outbound SMS + email, list thread, mark read
 */
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";
import {
  subcontractors,
  subcontractorDocs,
  subcontractorContracts,
  subcontractorPortalSessions,
  subcontractorComms,
  subcontractorAwardCandidates,
  estimateLineItems,
  estimates,
  projects,
  projectTasks,
} from "../../drizzle/schema";
import { eq, and, desc, asc, or, sql, lt, gte, isNull, inArray } from "drizzle-orm";
import { randomBytes } from "crypto";
import { createTransporter } from "../email";
import { sendSms } from "../sms";
import { storagePut } from "../storage";
import { notifyOwner } from "../_core/notification";
import PDFDocument from "pdfkit";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const OWNER_EMAIL = "chad@kitchensplusupstate.com";
const OWNER_PHONE = "+18335184811";
const BUSINESS_NAME = "Kitchens Plus Upstate";

function generateToken(bytes = 48): string {
  return randomBytes(bytes).toString("hex");
}

/** Recompute compliance status from the subcontractor's docs and update the row */
async function refreshComplianceStatus(db: any, subId: number) {
  const docs = await db
    .select()
    .from(subcontractorDocs)
    .where(and(eq(subcontractorDocs.subcontractorId, subId)));

  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

  const coi = docs.filter((d: any) => d.docType === "coi" && d.status === "approved");
  const wc = docs.filter((d: any) => d.docType === "workers_comp" && d.status === "approved");

  let status: "compliant" | "expiring_soon" | "expired" | "missing" | "pending" = "missing";

  if (coi.length === 0 || wc.length === 0) {
    // Check if any are pending review
    const pending = docs.filter((d: any) => d.status === "pending");
    status = pending.length > 0 ? "pending" : "missing";
  } else {
    // Both present and approved — check expiry
    const allDocs = [...coi, ...wc];
    const expired = allDocs.some((d: any) => d.expiryDate && new Date(d.expiryDate) < now);
    const expiringSoon = allDocs.some(
      (d: any) => d.expiryDate && new Date(d.expiryDate) >= now && new Date(d.expiryDate) <= soon
    );
    if (expired) status = "expired";
    else if (expiringSoon) status = "expiring_soon";
    else status = "compliant";
  }

  await db
    .update(subcontractors)
    .set({ complianceStatus: status, lastComplianceCheckAt: now })
    .where(eq(subcontractors.id, subId));

  return status;
}

/** Generate a subcontractor contract PDF and return a Buffer */
async function generateSubcontractorContractPdf(opts: {
  contractNumber: string;
  title: string;
  subcontractorName: string;
  projectTitle: string;
  scopeOfWork: string;
  contractAmount: number | null;
  startDate: Date | null;
  endDate: Date | null;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: "LETTER", margin: 60 });
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const GOLD = "#BF9A3B";
    const CHARCOAL = "#2E2F2A";
    const MID_GRAY = "#555555";
    const LIGHT_GRAY = "#EEEEEE";

    function fmt(n: number) {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
    }
    function fmtDate(d: Date | null) {
      if (!d) return "TBD";
      return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    }

    // Header
    doc.rect(0, 0, doc.page.width, 90).fill(CHARCOAL);
    doc.fillColor(GOLD).fontSize(22).font("Helvetica-Bold")
      .text(BUSINESS_NAME, 60, 28, { align: "left" });
    doc.fillColor("#FFFFFF").fontSize(10).font("Helvetica")
      .text("Subcontractor Agreement", 60, 56, { align: "left" });
    doc.fillColor(CHARCOAL).fontSize(10).font("Helvetica")
      .text(`Contract #${opts.contractNumber}`, doc.page.width - 200, 40, { width: 140, align: "right" });

    doc.moveDown(3);

    // Title
    doc.fillColor(CHARCOAL).fontSize(16).font("Helvetica-Bold")
      .text(opts.title, { align: "center" });
    doc.moveDown(0.5);
    doc.moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).strokeColor(GOLD).lineWidth(1).stroke();
    doc.moveDown(1);

    // Parties
    doc.fillColor(CHARCOAL).fontSize(11).font("Helvetica-Bold").text("PARTIES");
    doc.moveDown(0.3);
    doc.fillColor(MID_GRAY).fontSize(10).font("Helvetica")
      .text(`Contractor: ${BUSINESS_NAME}`, { indent: 10 })
      .text(`Subcontractor: ${opts.subcontractorName}`, { indent: 10 });
    doc.moveDown(1);

    // Project
    doc.fillColor(CHARCOAL).fontSize(11).font("Helvetica-Bold").text("PROJECT");
    doc.moveDown(0.3);
    doc.fillColor(MID_GRAY).fontSize(10).font("Helvetica")
      .text(opts.projectTitle, { indent: 10 });
    doc.moveDown(1);

    // Schedule
    doc.fillColor(CHARCOAL).fontSize(11).font("Helvetica-Bold").text("SCHEDULE");
    doc.moveDown(0.3);
    doc.fillColor(MID_GRAY).fontSize(10).font("Helvetica")
      .text(`Start Date: ${fmtDate(opts.startDate)}`, { indent: 10 })
      .text(`End Date: ${fmtDate(opts.endDate)}`, { indent: 10 });
    doc.moveDown(1);

    // Contract Amount
    if (opts.contractAmount !== null) {
      doc.fillColor(CHARCOAL).fontSize(11).font("Helvetica-Bold").text("CONTRACT AMOUNT");
      doc.moveDown(0.3);
      doc.fillColor(MID_GRAY).fontSize(10).font("Helvetica")
        .text(fmt(opts.contractAmount), { indent: 10 });
      doc.moveDown(1);
    }

    // Scope of Work
    doc.fillColor(CHARCOAL).fontSize(11).font("Helvetica-Bold").text("SCOPE OF WORK");
    doc.moveDown(0.3);
    doc.fillColor(MID_GRAY).fontSize(10).font("Helvetica")
      .text(opts.scopeOfWork || "As described in the project specifications.", { indent: 10 });
    doc.moveDown(1.5);

    // Standard Terms
    doc.fillColor(CHARCOAL).fontSize(11).font("Helvetica-Bold").text("TERMS & CONDITIONS");
    doc.moveDown(0.3);
    const terms = [
      "1. COMPLIANCE: Subcontractor shall maintain current Certificate of Insurance (COI) and Workers' Compensation coverage throughout the project. Copies must be on file with Kitchens Plus Upstate before work commences.",
      "2. QUALITY: All work shall be performed in a professional, workmanlike manner, in compliance with all applicable building codes and regulations.",
      "3. SAFETY: Subcontractor is responsible for the safety of their employees and shall comply with all OSHA regulations.",
      "4. PAYMENT: Payment will be made within 10 business days of satisfactory completion of the agreed scope, subject to any applicable lien waivers.",
      "5. CHANGES: Any changes to the scope of work must be approved in writing by Kitchens Plus Upstate prior to commencement.",
      "6. DISPUTE RESOLUTION: Any disputes shall be resolved through binding arbitration in Greenville County, South Carolina.",
      "7. INDEPENDENT CONTRACTOR: Subcontractor is an independent contractor and not an employee of Kitchens Plus Upstate.",
    ];
    terms.forEach((t) => {
      doc.fillColor(MID_GRAY).fontSize(9).font("Helvetica").text(t, { indent: 10 });
      doc.moveDown(0.5);
    });

    doc.moveDown(1);

    // Signature block
    doc.moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
    doc.moveDown(1);
    doc.fillColor(CHARCOAL).fontSize(11).font("Helvetica-Bold").text("SIGNATURES");
    doc.moveDown(1);

    const sigY = doc.y;
    // Contractor sig
    doc.fillColor(MID_GRAY).fontSize(9).font("Helvetica")
      .text("Kitchens Plus Upstate", 60, sigY)
      .text("Authorized Representative", 60, sigY + 14);
    doc.moveTo(60, sigY + 50).lineTo(240, sigY + 50).strokeColor(CHARCOAL).lineWidth(0.5).stroke();
    doc.fillColor(MID_GRAY).fontSize(8).text("Signature / Date", 60, sigY + 54);

    // Subcontractor sig
    doc.fillColor(MID_GRAY).fontSize(9).font("Helvetica")
      .text(opts.subcontractorName, 320, sigY)
      .text("Subcontractor", 320, sigY + 14);
    doc.moveTo(320, sigY + 50).lineTo(500, sigY + 50).strokeColor(CHARCOAL).lineWidth(0.5).stroke();
    doc.fillColor(MID_GRAY).fontSize(8).text("Signature / Date", 320, sigY + 54);

    // Footer
    doc.moveDown(5);
    doc.moveTo(60, doc.page.height - 50).lineTo(doc.page.width - 60, doc.page.height - 50)
      .strokeColor(GOLD).lineWidth(0.5).stroke();
    doc.fillColor(MID_GRAY).fontSize(8).font("Helvetica")
      .text(
        `${BUSINESS_NAME} · ${OWNER_EMAIL} · +1 (833) 518-4811`,
        60,
        doc.page.height - 40,
        { align: "center", width: doc.page.width - 120 }
      );

    doc.end();
  });
}

/** Generate a signed subcontractor contract PDF */
async function generateSignedSubcontractorContractPdf(opts: {
  contractNumber: string;
  title: string;
  subcontractorName: string;
  projectTitle: string;
  scopeOfWork: string;
  contractAmount: number | null;
  startDate: Date | null;
  endDate: Date | null;
  signatureDataUrl: string;
  signerName: string;
  signedAt: Date;
  signerIp?: string | null;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: "LETTER", margin: 60 });
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const GOLD = "#BF9A3B";
    const CHARCOAL = "#2E2F2A";
    const MID_GRAY = "#555555";
    const LIGHT_GRAY = "#EEEEEE";
    const GREEN = "#2E7D32";

    function fmt(n: number) {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
    }
    function fmtDate(d: Date | null) {
      if (!d) return "TBD";
      return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    }
    function fmtDateTime(d: Date) {
      return d.toLocaleString("en-US", {
        year: "numeric", month: "long", day: "numeric",
        hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
      }) + " ET";
    }

    // Header
    doc.rect(0, 0, doc.page.width, 90).fill(CHARCOAL);
    doc.fillColor(GOLD).fontSize(22).font("Helvetica-Bold")
      .text(BUSINESS_NAME, 60, 28, { align: "left" });
    doc.fillColor("#FFFFFF").fontSize(10).font("Helvetica")
      .text("Subcontractor Agreement — SIGNED COPY", 60, 56, { align: "left" });
    doc.fillColor(CHARCOAL).fontSize(10).font("Helvetica")
      .text(`Contract #${opts.contractNumber}`, doc.page.width - 200, 40, { width: 140, align: "right" });

    doc.moveDown(3);

    // Signed banner
    doc.rect(60, doc.y, doc.page.width - 120, 28).fill("#E8F5E9");
    doc.fillColor(GREEN).fontSize(11).font("Helvetica-Bold")
      .text(`✓ ELECTRONICALLY SIGNED — ${fmtDateTime(opts.signedAt)}`, 70, doc.y - 22, {
        width: doc.page.width - 140,
      });
    doc.moveDown(1.5);

    // Title
    doc.fillColor(CHARCOAL).fontSize(16).font("Helvetica-Bold")
      .text(opts.title, { align: "center" });
    doc.moveDown(0.5);
    doc.moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).strokeColor(GOLD).lineWidth(1).stroke();
    doc.moveDown(1);

    // Parties
    doc.fillColor(CHARCOAL).fontSize(11).font("Helvetica-Bold").text("PARTIES");
    doc.moveDown(0.3);
    doc.fillColor(MID_GRAY).fontSize(10).font("Helvetica")
      .text(`Contractor: ${BUSINESS_NAME}`, { indent: 10 })
      .text(`Subcontractor: ${opts.subcontractorName}`, { indent: 10 });
    doc.moveDown(1);

    // Project
    doc.fillColor(CHARCOAL).fontSize(11).font("Helvetica-Bold").text("PROJECT");
    doc.moveDown(0.3);
    doc.fillColor(MID_GRAY).fontSize(10).font("Helvetica")
      .text(opts.projectTitle, { indent: 10 });
    doc.moveDown(1);

    // Schedule
    doc.fillColor(CHARCOAL).fontSize(11).font("Helvetica-Bold").text("SCHEDULE");
    doc.moveDown(0.3);
    doc.fillColor(MID_GRAY).fontSize(10).font("Helvetica")
      .text(`Start Date: ${fmtDate(opts.startDate)}`, { indent: 10 })
      .text(`End Date: ${fmtDate(opts.endDate)}`, { indent: 10 });
    doc.moveDown(1);

    if (opts.contractAmount !== null) {
      doc.fillColor(CHARCOAL).fontSize(11).font("Helvetica-Bold").text("CONTRACT AMOUNT");
      doc.moveDown(0.3);
      doc.fillColor(MID_GRAY).fontSize(10).font("Helvetica")
        .text(fmt(opts.contractAmount), { indent: 10 });
      doc.moveDown(1);
    }

    // Scope
    doc.fillColor(CHARCOAL).fontSize(11).font("Helvetica-Bold").text("SCOPE OF WORK");
    doc.moveDown(0.3);
    doc.fillColor(MID_GRAY).fontSize(10).font("Helvetica")
      .text(opts.scopeOfWork || "As described in the project specifications.", { indent: 10 });
    doc.moveDown(1.5);

    // Terms
    doc.fillColor(CHARCOAL).fontSize(11).font("Helvetica-Bold").text("TERMS & CONDITIONS");
    doc.moveDown(0.3);
    const terms = [
      "1. COMPLIANCE: Subcontractor shall maintain current Certificate of Insurance (COI) and Workers' Compensation coverage throughout the project.",
      "2. QUALITY: All work shall be performed in a professional, workmanlike manner, in compliance with all applicable building codes.",
      "3. SAFETY: Subcontractor is responsible for the safety of their employees and shall comply with all OSHA regulations.",
      "4. PAYMENT: Payment will be made within 10 business days of satisfactory completion, subject to lien waivers.",
      "5. CHANGES: Any changes to scope must be approved in writing by Kitchens Plus Upstate prior to commencement.",
      "6. DISPUTE RESOLUTION: Disputes shall be resolved through binding arbitration in Greenville County, SC.",
      "7. INDEPENDENT CONTRACTOR: Subcontractor is an independent contractor, not an employee.",
    ];
    terms.forEach((t) => {
      doc.fillColor(MID_GRAY).fontSize(9).font("Helvetica").text(t, { indent: 10 });
      doc.moveDown(0.5);
    });

    doc.moveDown(1);
    doc.moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
    doc.moveDown(1);

    // E-Signature block
    doc.fillColor(CHARCOAL).fontSize(11).font("Helvetica-Bold").text("ELECTRONIC SIGNATURE");
    doc.moveDown(0.5);

    // Signature image
    if (opts.signatureDataUrl && opts.signatureDataUrl.startsWith("data:image/png;base64,")) {
      try {
        const base64Data = opts.signatureDataUrl.replace("data:image/png;base64,", "");
        const sigBuffer = Buffer.from(base64Data, "base64");
        doc.image(sigBuffer, 60, doc.y, { width: 200, height: 60 });
        doc.moveDown(4.5);
      } catch {
        doc.fillColor(MID_GRAY).fontSize(10).text("[Signature on file]", { indent: 10 });
        doc.moveDown(1);
      }
    }

    doc.fillColor(MID_GRAY).fontSize(10).font("Helvetica")
      .text(`Signed by: ${opts.signerName}`, { indent: 10 })
      .text(`Date/Time: ${fmtDateTime(opts.signedAt)}`, { indent: 10 });
    if (opts.signerIp) {
      doc.text(`IP Address: ${opts.signerIp}`, { indent: 10 });
    }
    doc.moveDown(0.5);
    doc.fillColor(MID_GRAY).fontSize(8).font("Helvetica-Oblique")
      .text(
        "This document has been electronically signed in accordance with the Electronic Signatures in Global and National Commerce Act (E-SIGN) and the Uniform Electronic Transactions Act (UETA). This electronic signature is legally binding.",
        { indent: 10 }
      );

    // Footer
    doc.moveTo(60, doc.page.height - 50).lineTo(doc.page.width - 60, doc.page.height - 50)
      .strokeColor(GOLD).lineWidth(0.5).stroke();
    doc.fillColor(MID_GRAY).fontSize(8).font("Helvetica")
      .text(
        `${BUSINESS_NAME} · ${OWNER_EMAIL} · +1 (833) 518-4811`,
        60, doc.page.height - 40,
        { align: "center", width: doc.page.width - 120 }
      );

    doc.end();
  });
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const subcontractorsRouter = router({

  // ── List all subcontractors ──────────────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      trade: z.string().optional(),
      complianceStatus: z.string().optional(),
      isActive: z.boolean().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select().from(subcontractors).orderBy(asc(subcontractors.companyName));
      let result = rows;
      if (input?.search) {
        const s = input.search.toLowerCase();
        result = result.filter(
          (r) =>
            r.companyName.toLowerCase().includes(s) ||
            (r.contactName ?? "").toLowerCase().includes(s) ||
            (r.trade ?? "").toLowerCase().includes(s)
        );
      }
      if (input?.trade) {
        result = result.filter((r) => r.trade === input.trade);
      }
      if (input?.complianceStatus) {
        result = result.filter((r) => r.complianceStatus === input.complianceStatus);
      }
      if (input?.isActive !== undefined) {
        result = result.filter((r) => r.isActive === input.isActive);
      }
      return result;
    }),

  // ── Get single subcontractor with docs, contracts, comms ────────────────────
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "NOT_FOUND" });
      const [sub] = await db.select().from(subcontractors).where(eq(subcontractors.id, input.id));
      if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "Subcontractor not found" });
      const docs = await db.select().from(subcontractorDocs)
        .where(eq(subcontractorDocs.subcontractorId, input.id))
        .orderBy(desc(subcontractorDocs.uploadedAt));
      const contracts = await db.select().from(subcontractorContracts)
        .where(eq(subcontractorContracts.subcontractorId, input.id))
        .orderBy(desc(subcontractorContracts.createdAt));
      const comms = await db.select().from(subcontractorComms)
        .where(eq(subcontractorComms.subcontractorId, input.id))
        .orderBy(desc(subcontractorComms.createdAt))
        .limit(50);
      // Enrich award candidates with project + estimate + line item info
      const rawAwards = await db.select().from(subcontractorAwardCandidates)
        .where(eq(subcontractorAwardCandidates.subcontractorId, input.id))
        .orderBy(desc(subcontractorAwardCandidates.createdAt));
      let awardCandidates: any[] = rawAwards;
      if (rawAwards.length > 0) {
        const projIds = [...new Set(rawAwards.map((c: any) => c.projectId).filter(Boolean))] as number[];
        const estIds = [...new Set(rawAwards.map((c: any) => c.estimateId).filter(Boolean))] as number[];
        const liIds = [...new Set(rawAwards.map((c: any) => c.lineItemId).filter(Boolean))] as number[];
        const [projs, ests, lis] = await Promise.all([
          projIds.length ? db.select({ id: projects.id, title: projects.title }).from(projects).where(inArray(projects.id, projIds)) : [],
          estIds.length ? db.select({ id: estimates.id, estimateNumber: estimates.estimateNumber, title: estimates.title }).from(estimates).where(inArray(estimates.id, estIds)) : [],
          liIds.length ? db.select({ id: estimateLineItems.id, task: estimateLineItems.task }).from(estimateLineItems).where(inArray(estimateLineItems.id, liIds)) : [],
        ]);
        const projMap = Object.fromEntries(projs.map((p: any) => [p.id, p]));
        const estMap = Object.fromEntries(ests.map((e: any) => [e.id, e]));
        const liMap = Object.fromEntries(lis.map((l: any) => [l.id, l]));
        awardCandidates = rawAwards.map((c: any) => ({
          ...c,
          project: c.projectId ? projMap[c.projectId] ?? null : null,
          estimate: c.estimateId ? estMap[c.estimateId] ?? null : null,
          lineItem: c.lineItemId ? liMap[c.lineItemId] ?? null : null,
        }));
      }
      return { ...sub, docs, contracts, comms, awardCandidates };
    }),

  // ── Create subcontractor ─────────────────────────────────────────────────────
  create: protectedProcedure
    .input(z.object({
      companyName: z.string().min(1),
      contactName: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      trade: z.string().optional(),
      licenseNumber: z.string().optional(),
      address: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(subcontractors).values({
        companyName: input.companyName,
        contactName: input.contactName ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        trade: input.trade ?? null,
        licenseNumber: input.licenseNumber ?? null,
        address: input.address ?? null,
        notes: input.notes ?? null,
        isActive: true,
        complianceStatus: "missing",
      });
      return { id: (result as any).insertId };
    }),

  // ── Update subcontractor ─────────────────────────────────────────────────────
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyName: z.string().min(1).optional(),
      contactName: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      trade: z.string().optional(),
      licenseNumber: z.string().optional(),
      address: z.string().optional(),
      notes: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...fields } = input;
      await db.update(subcontractors).set(fields).where(eq(subcontractors.id, id));
      return { success: true };
    }),

  // ── Delete subcontractor ─────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(subcontractors).where(eq(subcontractors.id, input.id));
      return { success: true };
    }),

  // ── Upload compliance doc (COI / Workers' Comp / etc.) ──────────────────────
  uploadDoc: protectedProcedure
    .input(z.object({
      subcontractorId: z.number(),
      docType: z.enum(["coi", "workers_comp", "license", "w9", "other"]),
      fileName: z.string(),
      fileDataBase64: z.string(), // base64-encoded file
      mimeType: z.string().default("application/pdf"),
      expiryDate: z.string().optional(), // ISO date string
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const fileBuffer = Buffer.from(input.fileDataBase64, "base64");
      const suffix = randomBytes(6).toString("hex");
      const fileKey = `subcontractor-docs/${input.subcontractorId}/${input.docType}-${suffix}`;
      const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);

      const [result] = await db.insert(subcontractorDocs).values({
        subcontractorId: input.subcontractorId,
        docType: input.docType,
        fileName: input.fileName,
        fileUrl: url,
        fileKey,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
        status: "pending",
        notes: input.notes ?? null,
      });

      // Refresh compliance status
      await refreshComplianceStatus(db, input.subcontractorId);

      return { id: (result as any).insertId, url };
    }),

  // ── Approve / reject a compliance doc ───────────────────────────────────────
  reviewDoc: protectedProcedure
    .input(z.object({
      docId: z.number(),
      status: z.enum(["approved", "rejected"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [doc] = await db.select().from(subcontractorDocs)
        .where(eq(subcontractorDocs.id, input.docId));
      if (!doc) throw new TRPCError({ code: "NOT_FOUND" });

      await db.update(subcontractorDocs).set({
        status: input.status,
        notes: input.notes ?? doc.notes,
        reviewedAt: new Date(),
      }).where(eq(subcontractorDocs.id, input.docId));

      await refreshComplianceStatus(db, doc.subcontractorId);
      return { success: true };
    }),

  // ── Check compliance before assigning to task ────────────────────────────────
  checkCompliance: protectedProcedure
    .input(z.object({ subcontractorId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const status = await refreshComplianceStatus(db, input.subcontractorId);
      const isCompliant = status === "compliant" || status === "expiring_soon";
      return { status, isCompliant };
    }),

  // ── Create a contract for a subcontractor ────────────────────────────────────
  createContract: protectedProcedure
    .input(z.object({
      subcontractorId: z.number(),
      projectId: z.number(),
      taskId: z.number().optional(),
      title: z.string().min(1),
      scopeOfWork: z.string().optional(),
      contractAmount: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const contractNumber = `SC-${Date.now().toString(36).toUpperCase()}`;
      const signToken = generateToken();

      const [result] = await db.insert(subcontractorContracts).values({
        subcontractorId: input.subcontractorId,
        projectId: input.projectId,
        taskId: input.taskId ?? null,
        contractNumber,
        title: input.title,
        scopeOfWork: input.scopeOfWork ?? null,
        contractAmount: input.contractAmount ? String(input.contractAmount) : null,
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
        status: "draft",
        signToken,
        notes: input.notes ?? null,
      });

      return { id: (result as any).insertId, contractNumber, signToken };
    }),

  // ── Generate and send contract for signature ─────────────────────────────────
  sendContract: protectedProcedure
    .input(z.object({
      contractId: z.number(),
      origin: z.string(), // window.location.origin from frontend
      sendSms: z.boolean().default(true),
      sendEmail: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [contract] = await db.select().from(subcontractorContracts)
        .where(eq(subcontractorContracts.id, input.contractId));
      if (!contract) throw new TRPCError({ code: "NOT_FOUND" });

      const [sub] = await db.select().from(subcontractors)
        .where(eq(subcontractors.id, contract.subcontractorId));
      if (!sub) throw new TRPCError({ code: "NOT_FOUND" });

      const [proj] = await db.select().from(projects)
        .where(eq(projects.id, contract.projectId));

      // Generate unsigned PDF
      const pdfBuffer = await generateSubcontractorContractPdf({
        contractNumber: contract.contractNumber ?? "",
        title: contract.title,
        subcontractorName: sub.companyName,
        projectTitle: proj?.title ?? `Project #${contract.projectId}`,
        scopeOfWork: contract.scopeOfWork ?? "",
        contractAmount: contract.contractAmount ? parseFloat(String(contract.contractAmount)) : null,
        startDate: contract.startDate ?? null,
        endDate: contract.endDate ?? null,
      });

      const suffix = randomBytes(6).toString("hex");
      const pdfKey = `subcontractor-contracts/${contract.id}/contract-${suffix}.pdf`;
      const { url: pdfUrl } = await storagePut(pdfKey, pdfBuffer, "application/pdf");

      const signUrl = `${input.origin}/sub-portal/sign/${contract.signToken}`;

      // Send email
      let emailSent = false;
      if (input.sendEmail && sub.email) {
        try {
          const transporter = createTransporter();
          await transporter.sendMail({
            from: `"Chad Price — Kitchens Plus Upstate" <${OWNER_EMAIL}>`,
            to: sub.email,
            subject: `Action Required: Please Sign Your Contract — ${contract.title}`,
            html: `
              <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #fff;">
                <div style="background: #2E2F2A; padding: 32px 40px;">
                  <h1 style="color: #BF9A3B; font-size: 22px; margin: 0;">Kitchens Plus Upstate</h1>
                  <p style="color: #fff; margin: 8px 0 0; font-size: 13px;">Subcontractor Agreement</p>
                </div>
                <div style="padding: 40px;">
                  <p style="color: #2E2F2A; font-size: 16px;">Dear ${sub.contactName ?? sub.companyName},</p>
                  <p style="color: #555; font-size: 15px; line-height: 1.6;">
                    Please review and electronically sign your subcontractor agreement for the following project:
                  </p>
                  <div style="background: #f9f9f9; border-left: 4px solid #BF9A3B; padding: 16px 20px; margin: 24px 0;">
                    <p style="margin: 0; color: #2E2F2A; font-weight: bold;">${contract.title}</p>
                    <p style="margin: 4px 0 0; color: #555; font-size: 13px;">Contract #${contract.contractNumber}</p>
                  </div>
                  <a href="${signUrl}" style="display: inline-block; background: #BF9A3B; color: #fff; padding: 14px 32px; text-decoration: none; font-size: 15px; border-radius: 4px; margin: 8px 0 24px;">
                    Review &amp; Sign Contract
                  </a>
                  <p style="color: #555; font-size: 13px; line-height: 1.6;">
                    This link is secure and unique to you. If you have any questions, please contact us at
                    <a href="mailto:${OWNER_EMAIL}" style="color: #BF9A3B;">${OWNER_EMAIL}</a>
                    or text us at +1 (833) 518-4811.
                  </p>
                </div>
                <div style="background: #f5f5f5; padding: 20px 40px; text-align: center;">
                  <p style="color: #999; font-size: 12px; margin: 0;">
                    ${BUSINESS_NAME} · ${OWNER_EMAIL} · +1 (833) 518-4811
                  </p>
                </div>
              </div>
            `,
            attachments: [
              {
                filename: `Contract-${contract.contractNumber}.pdf`,
                content: pdfBuffer,
                contentType: "application/pdf",
              },
            ],
          });
          emailSent = true;

          // Log comm
          await db.insert(subcontractorComms).values({
            subcontractorId: sub.id,
            projectId: contract.projectId,
            contractId: contract.id,
            direction: "outbound",
            channel: "email",
            subject: `Contract sent for signature: ${contract.title}`,
            body: `Contract ${contract.contractNumber} sent to ${sub.email} for e-signature.`,
            fromEmail: OWNER_EMAIL,
            toEmail: sub.email,
            status: "sent",
          });
        } catch (err: any) {
          console.error("[SubContract] Email send failed:", err?.message);
        }
      }

      // Send SMS
      let smsSent = false;
      if (input.sendSms && sub.phone) {
        try {
          await sendSms({
            to: sub.phone,
            message: `Hi ${sub.contactName ?? sub.companyName}, Kitchens Plus Upstate has sent you a contract to sign: "${contract.title}". Please review and sign here: ${signUrl}\n\nQuestions? Text back or call Chad at (864) 567-8777.`,
          });
          smsSent = true;

          await db.insert(subcontractorComms).values({
            subcontractorId: sub.id,
            projectId: contract.projectId,
            contractId: contract.id,
            direction: "outbound",
            channel: "sms",
            subject: `Contract sent for signature`,
            body: `Contract ${contract.contractNumber} sign link sent via SMS.`,
            fromPhone: OWNER_PHONE,
            toPhone: sub.phone,
            status: "sent",
          });
        } catch (err: any) {
          console.error("[SubContract] SMS send failed:", err?.message);
        }
      }

      // Update contract record
      await db.update(subcontractorContracts).set({
        pdfUrl,
        pdfKey,
        status: "sent",
        sentAt: new Date(),
      }).where(eq(subcontractorContracts.id, input.contractId));

      return { success: true, pdfUrl, emailSent, smsSent, signUrl };
    }),

  // ── Sign contract (public — via portal) ──────────────────────────────────────
  signContract: publicProcedure
    .input(z.object({
      signToken: z.string(),
      signerName: z.string().min(1),
      signatureDataUrl: z.string().min(1), // base64 PNG
      signerIp: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [contract] = await db.select().from(subcontractorContracts)
        .where(eq(subcontractorContracts.signToken, input.signToken));
      if (!contract) throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found or already signed" });
      if (contract.status === "signed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This contract has already been signed." });
      }

      const [sub] = await db.select().from(subcontractors)
        .where(eq(subcontractors.id, contract.subcontractorId));
      const [proj] = await db.select().from(projects)
        .where(eq(projects.id, contract.projectId));

      const signedAt = new Date();
      const ipAddress = input.signerIp ?? (ctx.req as any)?.ip ?? null;

      // Generate signed PDF
      const signedPdfBuffer = await generateSignedSubcontractorContractPdf({
        contractNumber: contract.contractNumber ?? "",
        title: contract.title,
        subcontractorName: sub?.companyName ?? "Subcontractor",
        projectTitle: proj?.title ?? `Project #${contract.projectId}`,
        scopeOfWork: contract.scopeOfWork ?? "",
        contractAmount: contract.contractAmount ? parseFloat(String(contract.contractAmount)) : null,
        startDate: contract.startDate ?? null,
        endDate: contract.endDate ?? null,
        signatureDataUrl: input.signatureDataUrl,
        signerName: input.signerName,
        signedAt,
        signerIp: ipAddress,
      });

      const suffix = randomBytes(6).toString("hex");
      const signedPdfKey = `subcontractor-contracts/${contract.id}/signed-${suffix}.pdf`;
      const { url: signedPdfUrl } = await storagePut(signedPdfKey, signedPdfBuffer, "application/pdf");

      // Update contract
      await db.update(subcontractorContracts).set({
        status: "signed",
        signedAt,
        signerName: input.signerName,
        signatureDataUrl: input.signatureDataUrl,
        signedPdfUrl,
        signedPdfKey,
      }).where(eq(subcontractorContracts.id, contract.id));

      // Log comm
      if (sub) {
        await db.insert(subcontractorComms).values({
          subcontractorId: sub.id,
          projectId: contract.projectId,
          contractId: contract.id,
          direction: "inbound",
          channel: "email",
          subject: `Contract signed: ${contract.title}`,
          body: `${input.signerName} signed contract ${contract.contractNumber} at ${signedAt.toISOString()}.`,
          status: "received",
        });
      }

      // Notify owner
      try {
        await notifyOwner({
          title: `Contract Signed — ${contract.title}`,
          content: `${input.signerName} (${sub?.companyName ?? "Subcontractor"}) has electronically signed contract ${contract.contractNumber}.`,
        });
      } catch {}

      // Email signed copy to owner and subcontractor
      try {
        const transporter = createTransporter();
        const recipients = [OWNER_EMAIL];
        if (sub?.email) recipients.push(sub.email);

        await transporter.sendMail({
          from: `"Kitchens Plus Upstate" <${OWNER_EMAIL}>`,
          to: recipients.join(", "),
          subject: `Signed Contract — ${contract.title} (${contract.contractNumber})`,
          html: `
            <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #2E2F2A; padding: 32px 40px;">
                <h1 style="color: #BF9A3B; font-size: 22px; margin: 0;">Kitchens Plus Upstate</h1>
              </div>
              <div style="padding: 40px;">
                <p style="color: #2E7D32; font-size: 16px; font-weight: bold;">✓ Contract Signed</p>
                <p style="color: #555;">
                  <strong>${input.signerName}</strong> has electronically signed contract
                  <strong>${contract.contractNumber}</strong> — "${contract.title}".
                </p>
                <p style="color: #555;">Signed at: ${signedAt.toLocaleString("en-US", { timeZone: "America/New_York" })} ET</p>
                <p style="color: #555;">The signed copy is attached to this email for your records.</p>
              </div>
            </div>
          `,
          attachments: [
            {
              filename: `Signed-Contract-${contract.contractNumber}.pdf`,
              content: signedPdfBuffer,
              contentType: "application/pdf",
            },
          ],
        });
      } catch (err: any) {
        console.error("[SubContract] Signed email failed:", err?.message);
      }

      return { success: true, signedPdfUrl };
    }),

  // ── Get contract by sign token (public — for portal) ─────────────────────────
  getContractByToken: publicProcedure
    .input(z.object({ signToken: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [contract] = await db.select().from(subcontractorContracts)
        .where(eq(subcontractorContracts.signToken, input.signToken));
      if (!contract) throw new TRPCError({ code: "NOT_FOUND" });

      const [sub] = await db.select().from(subcontractors)
        .where(eq(subcontractors.id, contract.subcontractorId));
      const [proj] = await db.select().from(projects)
        .where(eq(projects.id, contract.projectId));

      return {
        contract,
        subcontractor: sub ?? null,
        project: proj ?? null,
      };
    }),

  // ── Portal: send magic-link ──────────────────────────────────────────────────
  sendPortalLink: protectedProcedure
    .input(z.object({
      subcontractorId: z.number(),
      origin: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [sub] = await db.select().from(subcontractors)
        .where(eq(subcontractors.id, input.subcontractorId));
      if (!sub) throw new TRPCError({ code: "NOT_FOUND" });

      const token = generateToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await db.insert(subcontractorPortalSessions).values({
        subcontractorId: input.subcontractorId,
        token,
        expiresAt,
      });

      const portalUrl = `${input.origin}/sub-portal?token=${token}`;

      let emailSent = false;
      let smsSent = false;

      if (sub.email) {
        try {
          const transporter = createTransporter();
          await transporter.sendMail({
            from: `"Chad Price — Kitchens Plus Upstate" <${OWNER_EMAIL}>`,
            to: sub.email,
            subject: `Your Subcontractor Portal Access — Kitchens Plus Upstate`,
            html: `
              <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #fff;">
                <div style="background: #2E2F2A; padding: 32px 40px;">
                  <h1 style="color: #BF9A3B; font-size: 22px; margin: 0;">Kitchens Plus Upstate</h1>
                  <p style="color: #fff; margin: 8px 0 0; font-size: 13px;">Subcontractor Portal</p>
                </div>
                <div style="padding: 40px;">
                  <p style="color: #2E2F2A; font-size: 16px;">Dear ${sub.contactName ?? sub.companyName},</p>
                  <p style="color: #555; font-size: 15px; line-height: 1.6;">
                    You have been invited to access the Kitchens Plus Upstate Subcontractor Portal.
                    Use the button below to log in and view your assigned tasks, contracts, and compliance documents.
                  </p>
                  <a href="${portalUrl}" style="display: inline-block; background: #BF9A3B; color: #fff; padding: 14px 32px; text-decoration: none; font-size: 15px; border-radius: 4px; margin: 8px 0 24px;">
                    Access Your Portal
                  </a>
                  <p style="color: #999; font-size: 12px;">This link expires in 7 days. If you need a new link, contact us.</p>
                  <p style="color: #555; font-size: 13px;">
                    Questions? Contact us at <a href="mailto:${OWNER_EMAIL}" style="color: #BF9A3B;">${OWNER_EMAIL}</a>
                    or text us at +1 (833) 518-4811.
                  </p>
                </div>
                <div style="background: #f5f5f5; padding: 20px 40px; text-align: center;">
                  <p style="color: #999; font-size: 12px; margin: 0;">${BUSINESS_NAME} · +1 (833) 518-4811</p>
                </div>
              </div>
            `,
          });
          emailSent = true;
        } catch (err: any) {
          console.error("[SubPortal] Email failed:", err?.message);
        }
      }

      if (sub.phone) {
        try {
          await sendSms({
            to: sub.phone,
            message: `Hi ${sub.contactName ?? sub.companyName}, Kitchens Plus Upstate has invited you to your subcontractor portal. Access it here: ${portalUrl}\n\nLink expires in 7 days. Questions? Text back or call Chad at (864) 567-8777.`,
          });
          smsSent = true;
        } catch (err: any) {
          console.error("[SubPortal] SMS failed:", err?.message);
        }
      }

      return { success: true, portalUrl, emailSent, smsSent };
    }),

  // ── Portal: verify token ─────────────────────────────────────────────────────
  verifyPortalToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [session] = await db.select().from(subcontractorPortalSessions)
        .where(eq(subcontractorPortalSessions.token, input.token));

      if (!session) return { valid: false, reason: "invalid_token" };
      if (session.expiresAt < new Date()) return { valid: false, reason: "expired" };

      const [sub] = await db.select().from(subcontractors)
        .where(eq(subcontractors.id, session.subcontractorId));
      if (!sub) return { valid: false, reason: "not_found" };

      // Mark used
      await db.update(subcontractorPortalSessions).set({ usedAt: new Date() })
        .where(eq(subcontractorPortalSessions.id, session.id));

      return { valid: true, subcontractor: sub };
    }),

  // ── Portal: get subcontractor data (public, token-gated) ─────────────────────
  getPortalData: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [session] = await db.select().from(subcontractorPortalSessions)
        .where(eq(subcontractorPortalSessions.token, input.token));
      if (!session || session.expiresAt < new Date()) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired portal link" });
      }

      const [sub] = await db.select().from(subcontractors)
        .where(eq(subcontractors.id, session.subcontractorId));
      if (!sub) throw new TRPCError({ code: "NOT_FOUND" });

      const docs = await db.select().from(subcontractorDocs)
        .where(eq(subcontractorDocs.subcontractorId, sub.id))
        .orderBy(desc(subcontractorDocs.uploadedAt));

      const contracts = await db.select().from(subcontractorContracts)
        .where(eq(subcontractorContracts.subcontractorId, sub.id))
        .orderBy(desc(subcontractorContracts.createdAt));

      const comms = await db.select().from(subcontractorComms)
        .where(eq(subcontractorComms.subcontractorId, sub.id))
        .orderBy(desc(subcontractorComms.createdAt))
        .limit(20);
      // Award candidates — only show awarded/accepted ones (not estimated/voided)
      const awardCandidates = await db.select().from(subcontractorAwardCandidates)
        .where(and(
          eq(subcontractorAwardCandidates.subcontractorId, sub.id),
          sql`${subcontractorAwardCandidates.status} IN ('awarded','accepted','deposit_funded','complete')`
        ))
        .orderBy(desc(subcontractorAwardCandidates.createdAt));
      // Enrich award candidates with estimate title and line item task
      let enrichedAwards: any[] = [];
      if (awardCandidates.length > 0) {
        const estIds = [...new Set(awardCandidates.map(c => c.estimateId))];
        const estRows = await db.select({ id: estimates.id, title: estimates.title })
          .from(estimates).where(inArray(estimates.id, estIds));
        const estMap = new Map(estRows.map(e => [e.id, e.title]));
        const liIds = [...new Set(awardCandidates.map(c => c.lineItemId))];
        const liRows = await db.select({ id: estimateLineItems.id, task: estimateLineItems.task })
          .from(estimateLineItems).where(inArray(estimateLineItems.id, liIds));
        const liMap = new Map(liRows.map(li => [li.id, li.task]));
        enrichedAwards = awardCandidates.map(c => ({
          ...c,
          estimateTitle: estMap.get(c.estimateId) ?? null,
          lineItemTask: liMap.get(c.lineItemId) ?? null,
        }));
      }
      return { subcontractor: sub, docs, contracts, comms, awardCandidates: enrichedAwards };
    }),

  // ── Portal: upload compliance doc (public, token-gated) ──────────────────────
  portalUploadDoc: publicProcedure
    .input(z.object({
      token: z.string(),
      docType: z.enum(["coi", "workers_comp", "license", "w9", "other"]),
      fileName: z.string(),
      fileDataBase64: z.string(),
      mimeType: z.string().default("application/pdf"),
      expiryDate: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [session] = await db.select().from(subcontractorPortalSessions)
        .where(eq(subcontractorPortalSessions.token, input.token));
      if (!session || session.expiresAt < new Date()) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired portal link" });
      }

      const fileBuffer = Buffer.from(input.fileDataBase64, "base64");
      const suffix = randomBytes(6).toString("hex");
      const fileKey = `subcontractor-docs/${session.subcontractorId}/${input.docType}-portal-${suffix}`;
      const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);

      const [result] = await db.insert(subcontractorDocs).values({
        subcontractorId: session.subcontractorId,
        docType: input.docType,
        fileName: input.fileName,
        fileUrl: url,
        fileKey,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
        status: "pending",
        notes: input.notes ?? null,
      });

      await refreshComplianceStatus(db, session.subcontractorId);

      // Notify owner
      try {
        const [sub] = await db.select().from(subcontractors)
          .where(eq(subcontractors.id, session.subcontractorId));
        await notifyOwner({
          title: `New Compliance Doc Uploaded — ${sub?.companyName ?? "Subcontractor"}`,
          content: `${sub?.companyName ?? "A subcontractor"} uploaded a new ${input.docType.toUpperCase()} document via the portal. Please review it.`,
        });
      } catch {}

      return { id: (result as any).insertId, url };
    }),

  // ── Send manual SMS to subcontractor ─────────────────────────────────────────
  sendSms: protectedProcedure
    .input(z.object({
      subcontractorId: z.number(),
      message: z.string().min(1),
      projectId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [sub] = await db.select().from(subcontractors)
        .where(eq(subcontractors.id, input.subcontractorId));
      if (!sub) throw new TRPCError({ code: "NOT_FOUND" });
      if (!sub.phone) throw new TRPCError({ code: "BAD_REQUEST", message: "No phone number on file" });

      const result = await sendSms({ to: sub.phone, message: input.message });

      await db.insert(subcontractorComms).values({
        subcontractorId: sub.id,
        projectId: input.projectId ?? null,
        direction: "outbound",
        channel: "sms",
        subject: "Manual SMS",
        body: input.message,
        fromPhone: OWNER_PHONE,
        toPhone: sub.phone,
        status: result.success ? "sent" : "failed",
      });

      return { success: result.success };
    }),

  // ── Send manual email to subcontractor ───────────────────────────────────────
  sendEmail: protectedProcedure
    .input(z.object({
      subcontractorId: z.number(),
      subject: z.string().min(1),
      body: z.string().min(1),
      projectId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [sub] = await db.select().from(subcontractors)
        .where(eq(subcontractors.id, input.subcontractorId));
      if (!sub) throw new TRPCError({ code: "NOT_FOUND" });
      if (!sub.email) throw new TRPCError({ code: "BAD_REQUEST", message: "No email address on file" });

      let sent = false;
      try {
        const transporter = createTransporter();
        await transporter.sendMail({
          from: `"Chad Price — Kitchens Plus Upstate" <${OWNER_EMAIL}>`,
          to: sub.email,
          subject: input.subject,
          html: `
            <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #fff;">
              <div style="background: #2E2F2A; padding: 24px 40px;">
                <h1 style="color: #BF9A3B; font-size: 20px; margin: 0;">Kitchens Plus Upstate</h1>
              </div>
              <div style="padding: 32px 40px;">
                <p style="color: #2E2F2A;">Dear ${sub.contactName ?? sub.companyName},</p>
                <div style="color: #555; line-height: 1.7;">${input.body.replace(/\n/g, "<br>")}</div>
                <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
                <p style="color: #999; font-size: 12px;">
                  ${BUSINESS_NAME} · ${OWNER_EMAIL} · +1 (833) 518-4811
                </p>
              </div>
            </div>
          `,
        });
        sent = true;
      } catch (err: any) {
        console.error("[SubEmail] Send failed:", err?.message);
      }

      await db.insert(subcontractorComms).values({
        subcontractorId: sub.id,
        projectId: input.projectId ?? null,
        direction: "outbound",
        channel: "email",
        subject: input.subject,
        body: input.body,
        fromEmail: OWNER_EMAIL,
        toEmail: sub.email,
        status: sent ? "sent" : "failed",
      });

      return { success: sent };
    }),

  // ── Mark comms as read ───────────────────────────────────────────────────────
  markCommsRead: protectedProcedure
    .input(z.object({ subcontractorId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(subcontractorComms)
        .set({ isRead: true })
        .where(and(
          eq(subcontractorComms.subcontractorId, input.subcontractorId),
          eq(subcontractorComms.isRead, false)
        ));
      return { success: true };
    }),

  // ── List trades (distinct values for filter) ─────────────────────────────────
  listTrades: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .selectDistinct({ trade: subcontractors.trade })
      .from(subcontractors)
      .where(sql`${subcontractors.trade} IS NOT NULL`);
    return rows.map((r) => r.trade).filter(Boolean) as string[];
  }),

  // ── List award candidates for a subcontractor ────────────────────────────────
  listAwards: protectedProcedure
    .input(z.object({ subcontractorId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const candidates = await db.select().from(subcontractorAwardCandidates)
        .where(eq(subcontractorAwardCandidates.subcontractorId, input.subcontractorId))
        .orderBy(desc(subcontractorAwardCandidates.createdAt));
      if (!candidates.length) return [];
      const estIds = [...new Set(candidates.map(c => c.estimateId))];
      const estRows = await db.select({ id: estimates.id, title: estimates.title })
        .from(estimates).where(inArray(estimates.id, estIds));
      const estMap = new Map(estRows.map(e => [e.id, e.title]));
      const liIds = [...new Set(candidates.map(c => c.lineItemId))];
      const liRows = await db.select({ id: estimateLineItems.id, task: estimateLineItems.task })
        .from(estimateLineItems).where(inArray(estimateLineItems.id, liIds));
      const liMap = new Map(liRows.map(li => [li.id, li.task]));
      const contractIds = candidates.filter(c => c.contractId).map(c => c.contractId!);
      const contractRows = contractIds.length > 0
        ? await db.select({ id: subcontractorContracts.id, status: subcontractorContracts.status, contractNumber: subcontractorContracts.contractNumber })
            .from(subcontractorContracts).where(inArray(subcontractorContracts.id, contractIds))
        : [];
      const contractMap = new Map(contractRows.map(c => [c.id, c]));
      return candidates.map(c => ({
        ...c,
        estimateTitle: estMap.get(c.estimateId) ?? null,
        lineItemTask: liMap.get(c.lineItemId) ?? null,
        contract: c.contractId ? (contractMap.get(c.contractId) ?? null) : null,
      }));
    }),

  // ── Send Award: create contract from award candidate + send for signature ────
  sendAward: protectedProcedure
    .input(z.object({
      awardCandidateId: z.number(),
      paymentTerms: z.string().min(1, "Payment terms are required"),
      depositPercent: z.number().min(0).max(100).default(0),
      contractTitle: z.string().optional(),
      scopeOfWork: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      notes: z.string().optional(),
      origin: z.string(),
      sendEmail: z.boolean().default(true),
      sendSmsNotification: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [candidate] = await db.select().from(subcontractorAwardCandidates)
        .where(eq(subcontractorAwardCandidates.id, input.awardCandidateId));
      if (!candidate) throw new TRPCError({ code: "NOT_FOUND", message: "Award candidate not found" });
      const [sub] = await db.select().from(subcontractors)
        .where(eq(subcontractors.id, candidate.subcontractorId));
      if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "Subcontractor not found" });
      const projectId = candidate.projectId;
      if (!projectId) throw new TRPCError({ code: "BAD_REQUEST", message: "Award candidate has no project linked" });
      const [proj] = await db.select().from(projects).where(eq(projects.id, projectId));
      const [li] = await db.select().from(estimateLineItems)
        .where(eq(estimateLineItems.id, candidate.lineItemId));
      const agreedAmount = parseFloat(String(candidate.agreedAmount ?? "0"));
      const depositAmount = agreedAmount * (input.depositPercent / 100);
      const contractTitle = input.contractTitle ?? (li?.task ?? `Award #${candidate.id}`);
      const scopeOfWork = input.scopeOfWork ?? (li?.description ?? candidate.scopeDescription ?? "");
      const contractNumber = `SC-${Date.now().toString(36).toUpperCase()}`;
      const signToken = generateToken();
      const [result] = await db.insert(subcontractorContracts).values({
        subcontractorId: candidate.subcontractorId,
        projectId,
        contractNumber,
        title: contractTitle,
        scopeOfWork,
        contractAmount: String(agreedAmount),
        paymentTerms: "custom",
        paymentTermsNotes: input.paymentTerms,
        depositPercent: String(input.depositPercent),
        depositAmount: String(depositAmount),
        estimateId: candidate.estimateId,
        awardCandidateId: candidate.id,
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
        status: "draft",
        signToken,
        notes: input.notes ?? null,
      });
      const contractId = (result as any).insertId;
      await db.update(subcontractorAwardCandidates).set({
        status: "awarded",
        awardedAt: new Date(),
        contractId,
      }).where(eq(subcontractorAwardCandidates.id, candidate.id));
      const pdfBuffer = await generateSubcontractorContractPdf({
        contractNumber,
        title: contractTitle,
        subcontractorName: sub.companyName,
        projectTitle: proj?.title ?? `Project #${projectId}`,
        scopeOfWork,
        contractAmount: agreedAmount || null,
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
      });
      const suffix = randomBytes(6).toString("hex");
      const pdfKey = `subcontractor-contracts/${contractId}/contract-${suffix}.pdf`;
      const { url: pdfUrl } = await storagePut(pdfKey, pdfBuffer, "application/pdf");
      await db.update(subcontractorContracts).set({ pdfUrl, pdfKey, status: "sent", sentAt: new Date() })
        .where(eq(subcontractorContracts.id, contractId));
      const signUrl = `${input.origin}/subcontractor/sign/${signToken}`;
      let emailSent = false;
      if (input.sendEmail && sub.email) {
        try {
          const transporter = createTransporter();
          await transporter.sendMail({
            from: `"Chad Price — Kitchens Plus Upstate" <${OWNER_EMAIL}>`,
            to: sub.email,
            subject: `You've Been Awarded a Contract — ${contractTitle}`,
            html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#fff;"><div style="background:#2E2F2A;padding:32px 40px;"><h1 style="color:#BF9A3B;font-size:22px;margin:0;">Kitchens Plus Upstate</h1><p style="color:#fff;margin:8px 0 0;font-size:13px;">Subcontractor Award</p></div><div style="padding:40px;"><p style="color:#2E2F2A;font-size:16px;">Dear ${sub.contactName ?? sub.companyName},</p><p style="color:#555;font-size:15px;line-height:1.6;">Congratulations! You have been selected for the following scope of work on <strong>${proj?.title ?? `Project #${projectId}`}</strong>. Please review and sign your subcontractor agreement to confirm your acceptance.</p><div style="background:#f9f9f9;border-left:4px solid #BF9A3B;padding:16px 20px;margin:24px 0;"><p style="margin:0;color:#2E2F2A;font-weight:bold;">${contractTitle}</p><p style="margin:4px 0 0;color:#555;font-size:13px;">Contract #${contractNumber}</p>${agreedAmount > 0 ? `<p style="margin:4px 0 0;color:#BF9A3B;font-size:14px;font-weight:bold;">Contract Amount: $${agreedAmount.toLocaleString("en-US",{minimumFractionDigits:2})}</p>` : ""}</div><a href="${signUrl}" style="display:inline-block;background:#BF9A3B;color:#fff;padding:14px 32px;text-decoration:none;font-size:15px;border-radius:4px;margin:8px 0 24px;">Review &amp; Sign Contract</a><p style="color:#555;font-size:13px;line-height:1.6;">Questions? Text back here any time or call Chad at +1 (833) 518-4811.</p></div><div style="background:#f5f5f5;padding:20px 40px;text-align:center;"><p style="color:#999;font-size:12px;margin:0;">${BUSINESS_NAME} · ${OWNER_EMAIL} · +1 (833) 518-4811</p></div></div>`,
            attachments: [{ filename: `Contract-${contractNumber}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
          });
          emailSent = true;
          await db.insert(subcontractorComms).values({ subcontractorId: candidate.subcontractorId, direction: "outbound", channel: "email", body: `Award contract sent: ${contractTitle} (${contractNumber})`, isRead: true });
        } catch (e) { console.error("sendAward email error:", e); }
      }
      let smsSent = false;
      if (input.sendSmsNotification && sub.phone) {
        try {
          const msg = `Hi ${sub.contactName ?? sub.companyName}, you've been awarded a contract from Kitchens Plus Upstate: "${contractTitle}". Please review and sign: ${signUrl} — Questions? Call Chad at +1 (833) 518-4811.`;
          await sendSms(sub.phone, msg);
          smsSent = true;
          await db.insert(subcontractorComms).values({ subcontractorId: candidate.subcontractorId, direction: "outbound", channel: "sms", body: msg, isRead: true });
        } catch (e) { console.error("sendAward SMS error:", e); }
      }
      try { await notifyOwner({ title: "Award Contract Sent", content: `Contract sent to ${sub.companyName} for "${contractTitle}" (${contractNumber}).` }); } catch {}
      return { success: true, contractId, contractNumber, signUrl, emailSent, smsSent };
    }),

  // ── Portal: respond to award candidate (accept / decline) ──────────────────
  portalRespondAward: publicProcedure
    .input(z.object({
      token: z.string(),
      awardCandidateId: z.number(),
      response: z.enum(["accepted", "declined"]),
      declineReason: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Validate portal session
      const [session] = await db.select().from(subcontractorPortalSessions)
        .where(and(eq(subcontractorPortalSessions.token, input.token), gte(subcontractorPortalSessions.expiresAt, new Date())));
      if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired portal session" });
      // Validate award candidate belongs to this subcontractor
      const [candidate] = await db.select().from(subcontractorAwardCandidates)
        .where(and(
          eq(subcontractorAwardCandidates.id, input.awardCandidateId),
          eq(subcontractorAwardCandidates.subcontractorId, session.subcontractorId)
        ));
      if (!candidate) throw new TRPCError({ code: "NOT_FOUND", message: "Award candidate not found" });
      if (candidate.status !== "awarded") throw new TRPCError({ code: "BAD_REQUEST", message: `Award is already ${candidate.status}` });
      await db.update(subcontractorAwardCandidates).set({
        status: input.response,
        respondedAt: new Date(),
        declineReason: input.response === "declined" ? (input.declineReason ?? null) : null,
      }).where(eq(subcontractorAwardCandidates.id, input.awardCandidateId));
      // Notify owner
      const [sub] = await db.select().from(subcontractors).where(eq(subcontractors.id, session.subcontractorId));
      try { await notifyOwner({ title: `Award ${input.response === "accepted" ? "Accepted" : "Declined"}`, content: `${sub?.companyName ?? "Subcontractor"} ${input.response} the award for candidate #${input.awardCandidateId}.${input.declineReason ? ` Reason: ${input.declineReason}` : ""}` }); } catch {}
      return { success: true, status: input.response };
    }),
});
