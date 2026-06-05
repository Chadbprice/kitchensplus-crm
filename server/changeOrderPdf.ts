/**
 * changeOrderPdf.ts — Generates a professional Change Order PDF.
 * Used for: (1) attaching to approval request emails, (2) generating signed copies.
 * Uses pdfkit (already in package.json). Print-friendly, light background.
 */
import PDFDocument from "pdfkit";

const GOLD       = "#BF9A3B";
const CHARCOAL   = "#2E2F2A";
const MID_GRAY   = "#555555";
const LIGHT_GRAY = "#F5F0E8";
const RULE_GRAY  = "#CCCCCC";

export interface ChangeOrderLineItem {
  task: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ChangeOrderPdfOptions {
  changeOrderNumber: string;
  title: string;
  description?: string | null;
  projectName?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  amount: number;
  lineItems?: ChangeOrderLineItem[];
  notes?: string | null;
  createdAt?: Date | null;
  sentAt?: Date | null;
  // E-signature fields (only present on signed copies)
  signatureDataUrl?: string;
  signerName?: string;
  signedAt?: Date;
}

function formatDate(d?: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function formatCurrency(n: number): string {
  const abs = Math.abs(n);
  const str = abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-$${str}` : `$${str}`;
}

export async function generateChangeOrderPdf(opts: ChangeOrderPdfOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      compress: true,
      info: {
        Title: `Change Order ${opts.changeOrderNumber} — ${opts.title}`,
        Author: "Kitchens Plus Upstate",
        Subject: "Change Order",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = 612;
    const MARGIN = 48;
    const CONTENT_W = W - MARGIN * 2;

    // ── Header bar ──────────────────────────────────────────────────────────
    doc.rect(0, 0, W, 80).fill(CHARCOAL);
    doc.fillColor(GOLD).fontSize(17).font("Helvetica-Bold")
      .text("KITCHENS PLUS UPSTATE", MARGIN, 18, { width: CONTENT_W, align: "center" });
    doc.fillColor("#AAAAAA").fontSize(8).font("Helvetica")
      .text("RENOVATIONS & DESIGN", MARGIN, 42, { width: CONTENT_W, align: "center" });
    doc.fillColor("#888888").fontSize(8)
      .text("CHANGE ORDER", MARGIN, 58, { width: CONTENT_W, align: "center" });

    let y = 96;

    // ── CO Number + Title ───────────────────────────────────────────────────
    doc.fillColor(GOLD).fontSize(11).font("Helvetica-Bold")
      .text(opts.changeOrderNumber, MARGIN, y);
    y += 16;
    doc.fillColor(CHARCOAL).fontSize(16).font("Helvetica-Bold")
      .text(opts.title, MARGIN, y, { width: CONTENT_W });
    y += doc.heightOfString(opts.title, { width: CONTENT_W, fontSize: 16 }) + 8;

    // ── Meta row ────────────────────────────────────────────────────────────
    doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor(RULE_GRAY).lineWidth(0.5).stroke();
    y += 10;

    const metaItems: [string, string][] = [
      ["Client", opts.clientName ?? "—"],
      ["Project", opts.projectName ?? "—"],
      ["Date", formatDate(opts.createdAt ?? new Date())],
      ["Status", opts.signedAt ? "Approved & Signed" : "Pending Approval"],
    ];
    const colW = CONTENT_W / 2;
    metaItems.forEach(([label, value], i) => {
      const x = MARGIN + (i % 2) * colW;
      if (i % 2 === 0 && i > 0) y += 20;
      doc.fillColor(MID_GRAY).fontSize(8).font("Helvetica").text(label.toUpperCase(), x, y, { width: colW - 8 });
      doc.fillColor(CHARCOAL).fontSize(10).font("Helvetica-Bold").text(value, x, y + 10, { width: colW - 8 });
    });
    y += 30;

    doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor(RULE_GRAY).lineWidth(0.5).stroke();
    y += 14;

    // ── Description ─────────────────────────────────────────────────────────
    if (opts.description) {
      doc.fillColor(MID_GRAY).fontSize(8).font("Helvetica").text("DESCRIPTION", MARGIN, y);
      y += 12;
      doc.fillColor(CHARCOAL).fontSize(10).font("Helvetica")
        .text(opts.description, MARGIN, y, { width: CONTENT_W });
      y += doc.heightOfString(opts.description, { width: CONTENT_W, fontSize: 10 }) + 14;
    }

    // ── Line Items table ─────────────────────────────────────────────────────
    const items = opts.lineItems ?? [];
    if (items.length > 0) {
      doc.fillColor(MID_GRAY).fontSize(8).font("Helvetica").text("SCOPE OF WORK", MARGIN, y);
      y += 12;

      // Table header
      doc.rect(MARGIN, y, CONTENT_W, 20).fill(CHARCOAL);
      const cols = { task: 0, desc: 160, qty: 330, unit: 380, total: 460 };
      doc.fillColor("#FFFFFF").fontSize(8).font("Helvetica-Bold");
      doc.text("Task", MARGIN + cols.task + 6, y + 6, { width: 148 });
      doc.text("Description", MARGIN + cols.desc + 6, y + 6, { width: 160 });
      doc.text("Qty", MARGIN + cols.qty + 6, y + 6, { width: 44 });
      doc.text("Unit Price", MARGIN + cols.unit + 6, y + 6, { width: 74 });
      doc.text("Total", MARGIN + cols.total + 6, y + 6, { width: 56 });
      y += 20;

      items.forEach((li, idx) => {
        const rowH = Math.max(
          20,
          doc.heightOfString(li.task, { width: 148, fontSize: 9 }) + 8,
          doc.heightOfString(li.description ?? "", { width: 160, fontSize: 9 }) + 8,
        );
        if (idx % 2 === 0) doc.rect(MARGIN, y, CONTENT_W, rowH).fill(LIGHT_GRAY);
        doc.fillColor(CHARCOAL).fontSize(9).font("Helvetica");
        doc.text(li.task, MARGIN + cols.task + 6, y + 4, { width: 148 });
        doc.text(li.description ?? "", MARGIN + cols.desc + 6, y + 4, { width: 160 });
        doc.text(String(li.quantity), MARGIN + cols.qty + 6, y + 4, { width: 44 });
        doc.text(formatCurrency(li.unitPrice), MARGIN + cols.unit + 6, y + 4, { width: 74 });
        doc.font("Helvetica-Bold").text(formatCurrency(li.lineTotal), MARGIN + cols.total + 6, y + 4, { width: 56 });
        y += rowH;
      });
      y += 8;
    }

    // ── Total amount ─────────────────────────────────────────────────────────
    doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor(RULE_GRAY).lineWidth(0.5).stroke();
    y += 10;
    const amountLabel = opts.amount >= 0 ? "Additional Amount" : "Credit / Reduction";
    const amountColor = opts.amount >= 0 ? GOLD : "#2d7a4f";
    doc.fillColor(MID_GRAY).fontSize(10).font("Helvetica").text(amountLabel, MARGIN, y);
    doc.fillColor(amountColor).fontSize(16).font("Helvetica-Bold")
      .text(formatCurrency(opts.amount), MARGIN, y, { width: CONTENT_W, align: "right" });
    y += 28;

    // ── Notes ────────────────────────────────────────────────────────────────
    if (opts.notes) {
      doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor(RULE_GRAY).lineWidth(0.5).stroke();
      y += 10;
      doc.fillColor(MID_GRAY).fontSize(8).font("Helvetica").text("NOTES", MARGIN, y);
      y += 12;
      doc.fillColor(CHARCOAL).fontSize(9).font("Helvetica")
        .text(opts.notes, MARGIN, y, { width: CONTENT_W });
      y += doc.heightOfString(opts.notes, { width: CONTENT_W, fontSize: 9 }) + 14;
    }

    // ── E-Signature block ────────────────────────────────────────────────────
    if (opts.signatureDataUrl && opts.signerName && opts.signedAt) {
      // Ensure enough space — add page if needed
      if (y > 620) { doc.addPage(); y = 48; }

      doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor(RULE_GRAY).lineWidth(0.5).stroke();
      y += 12;
      doc.fillColor(MID_GRAY).fontSize(8).font("Helvetica").text("CLIENT APPROVAL & SIGNATURE", MARGIN, y);
      y += 14;

      // Signature image
      try {
        const base64Data = opts.signatureDataUrl.replace(/^data:image\/\w+;base64,/, "");
        const sigBuffer = Buffer.from(base64Data, "base64");
        doc.image(sigBuffer, MARGIN, y, { width: 200, height: 60 });
      } catch {
        doc.rect(MARGIN, y, 200, 60).strokeColor(RULE_GRAY).lineWidth(0.5).stroke();
        doc.fillColor(MID_GRAY).fontSize(8).text("(signature on file)", MARGIN + 60, y + 24);
      }
      y += 70;

      doc.moveTo(MARGIN, y).lineTo(MARGIN + 200, y).strokeColor(CHARCOAL).lineWidth(0.5).stroke();
      y += 4;
      doc.fillColor(CHARCOAL).fontSize(9).font("Helvetica-Bold").text(opts.signerName, MARGIN, y);
      y += 12;
      doc.fillColor(MID_GRAY).fontSize(8).font("Helvetica")
        .text(`Signed electronically on ${formatDate(opts.signedAt)} at ${opts.signedAt.toLocaleTimeString("en-US", { timeZone: "America/New_York" })} ET`, MARGIN, y, { width: CONTENT_W });
      y += 14;
      doc.fillColor(MID_GRAY).fontSize(7)
        .text("By signing electronically, the Client agrees to be legally bound by this change order under the Electronic Signatures in Global and National Commerce Act (E-SIGN, 15 U.S.C. § 7001) and the Uniform Electronic Transactions Act (UETA). This electronic signature is legally equivalent to a handwritten signature.", MARGIN, y, { width: CONTENT_W });
      y += 30;
    } else {
      // Blank signature lines for unsigned copy
      if (y > 580) { doc.addPage(); y = 48; }
      doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor(RULE_GRAY).lineWidth(0.5).stroke();
      y += 14;
      doc.fillColor(MID_GRAY).fontSize(8).font("Helvetica").text("CLIENT APPROVAL", MARGIN, y);
      y += 18;
      doc.moveTo(MARGIN, y).lineTo(MARGIN + 220, y).strokeColor(CHARCOAL).lineWidth(0.5).stroke();
      doc.fillColor(MID_GRAY).fontSize(8).text("Client Signature", MARGIN, y + 4);
      doc.moveTo(W - MARGIN - 130, y).lineTo(W - MARGIN, y).strokeColor(CHARCOAL).lineWidth(0.5).stroke();
      doc.fillColor(MID_GRAY).fontSize(8).text("Date", W - MARGIN - 130, y + 4);
      y += 28;
      doc.moveTo(MARGIN, y).lineTo(MARGIN + 220, y).strokeColor(CHARCOAL).lineWidth(0.5).stroke();
      doc.fillColor(MID_GRAY).fontSize(8).text("Print Name", MARGIN, y + 4);
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    const PAGE_H = 792;
    doc.rect(0, PAGE_H - 36, W, 36).fill(CHARCOAL);
    doc.fillColor("#888888").fontSize(7).font("Helvetica")
      .text("Kitchens Plus Upstate · chad@kitchensplusupstate.com · +1 (833) 518-4811 · kitchensplusupstate.com",
        MARGIN, PAGE_H - 22, { width: CONTENT_W, align: "center" });

    doc.end();
  });
}
