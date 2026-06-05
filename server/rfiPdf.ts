/**
 * rfiPdf.ts — Generates a print-friendly PDF of an RFI for email attachment.
 * Uses pdfkit (already in package.json). Light background, B&W-printable.
 */
import PDFDocument from "pdfkit";

// Print-friendly palette
const GOLD      = "#BF9A3B";
const CHARCOAL  = "#2E2F2A";
const MID_GRAY  = "#555555";
const LIGHT_GRAY = "#EEEEEE";
const RULE_GRAY = "#CCCCCC";
const WHITE     = "#FFFFFF";

export interface RfiPdfOptions {
  rfiTitle: string;
  rfiBody: string;
  projectName?: string | null;
  clientName?: string | null;
  status?: string | null;
  sentAt?: Date | null;
  responseText?: string | null;
  responseComments?: string | null;
  attachmentUrls?: { url: string; name: string }[] | null;
}

function formatDate(d?: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export async function generateRfiPdf(opts: RfiPdfOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      compress: true,
      info: {
        Title: `RFI: ${opts.rfiTitle} — Kitchens Plus Upstate`,
        Author: "Kitchens Plus Upstate",
        Subject: "Request for Information",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = 612; // Letter width in pts
    const MARGIN = 48;
    const CONTENT_W = W - MARGIN * 2;

    // ── Header bar ──────────────────────────────────────────────────────────
    doc.rect(0, 0, W, 72).fill(CHARCOAL);
    doc.fillColor(GOLD).fontSize(16).font("Helvetica-Bold")
      .text("KITCHENS PLUS UPSTATE", MARGIN, 20, { width: CONTENT_W, align: "center" });
    doc.fillColor("#AAAAAA").fontSize(8).font("Helvetica")
      .text("RENOVATIONS & DESIGN", MARGIN, 42, { width: CONTENT_W, align: "center" });

    // ── Gold accent rule ─────────────────────────────────────────────────────
    doc.rect(0, 72, W, 3).fill(GOLD);

    let y = 90;

    // ── Document label ───────────────────────────────────────────────────────
    doc.fillColor(GOLD).fontSize(9).font("Helvetica-Bold")
      .text("REQUEST FOR INFORMATION", MARGIN, y, { width: CONTENT_W, align: "center", characterSpacing: 2 });
    y += 20;

    // ── Title ────────────────────────────────────────────────────────────────
    doc.fillColor(CHARCOAL).fontSize(18).font("Helvetica-Bold")
      .text(opts.rfiTitle, MARGIN, y, { width: CONTENT_W, align: "center" });
    y += doc.heightOfString(opts.rfiTitle, { width: CONTENT_W, fontSize: 18 }) + 8;

    // ── Meta row ─────────────────────────────────────────────────────────────
    doc.rect(MARGIN, y, CONTENT_W, 1).fill(RULE_GRAY);
    y += 8;

    const metaItems: { label: string; value: string }[] = [];
    if (opts.projectName) metaItems.push({ label: "Project", value: opts.projectName });
    if (opts.clientName)  metaItems.push({ label: "Client",  value: opts.clientName });
    if (opts.sentAt)      metaItems.push({ label: "Sent",    value: formatDate(opts.sentAt) });
    if (opts.status)      metaItems.push({ label: "Status",  value: opts.status.charAt(0).toUpperCase() + opts.status.slice(1) });

    if (metaItems.length > 0) {
      const colW = CONTENT_W / Math.min(metaItems.length, 3);
      metaItems.forEach((item, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = MARGIN + col * colW;
        const ry = y + row * 32;
        doc.fillColor(MID_GRAY).fontSize(7).font("Helvetica-Bold")
          .text(item.label.toUpperCase(), x, ry, { width: colW - 8, characterSpacing: 1 });
        doc.fillColor(CHARCOAL).fontSize(10).font("Helvetica")
          .text(item.value, x, ry + 10, { width: colW - 8 });
      });
      const rows = Math.ceil(metaItems.length / 3);
      y += rows * 32 + 8;
    }

    doc.rect(MARGIN, y, CONTENT_W, 1).fill(RULE_GRAY);
    y += 16;

    // ── Body ─────────────────────────────────────────────────────────────────
    doc.fillColor(GOLD).fontSize(8).font("Helvetica-Bold")
      .text("REQUEST DETAILS", MARGIN, y, { characterSpacing: 1.5 });
    y += 14;

    doc.rect(MARGIN, y, 3, 0).fill(GOLD); // will be drawn after we know height
    const bodyH = doc.heightOfString(opts.rfiBody, { width: CONTENT_W - 12, fontSize: 11 });
    doc.rect(MARGIN, y, 3, bodyH + 8).fill(GOLD);
    doc.fillColor(CHARCOAL).fontSize(11).font("Helvetica")
      .text(opts.rfiBody, MARGIN + 12, y + 4, { width: CONTENT_W - 12, lineGap: 2 });
    y += bodyH + 20;

    // ── Client response (if any) ──────────────────────────────────────────────
    if (opts.responseText || opts.responseComments) {
      doc.rect(MARGIN, y, CONTENT_W, 1).fill(RULE_GRAY);
      y += 12;
      doc.fillColor(GOLD).fontSize(8).font("Helvetica-Bold")
        .text("CLIENT RESPONSE", MARGIN, y, { characterSpacing: 1.5 });
      y += 14;

      const responseContent = [opts.responseText, opts.responseComments].filter(Boolean).join("\n\n");
      doc.rect(MARGIN, y, CONTENT_W, 1).fill(LIGHT_GRAY);
      y += 1;
      doc.rect(MARGIN, y, CONTENT_W, 8).fill(LIGHT_GRAY);
      y += 8;
      doc.fillColor(CHARCOAL).fontSize(11).font("Helvetica")
        .text(responseContent, MARGIN + 8, y, { width: CONTENT_W - 16, lineGap: 2 });
      y += doc.heightOfString(responseContent, { width: CONTENT_W - 16, fontSize: 11 }) + 16;
    }

    // ── Attachments list ──────────────────────────────────────────────────────
    const attachments = opts.attachmentUrls ?? [];
    if (attachments.length > 0) {
      doc.rect(MARGIN, y, CONTENT_W, 1).fill(RULE_GRAY);
      y += 12;
      doc.fillColor(GOLD).fontSize(8).font("Helvetica-Bold")
        .text("ATTACHMENTS", MARGIN, y, { characterSpacing: 1.5 });
      y += 14;
      attachments.forEach((a, i) => {
        doc.fillColor(MID_GRAY).fontSize(9).font("Helvetica")
          .text(`${i + 1}. ${a.name}`, MARGIN + 8, y, { width: CONTENT_W - 16 });
        y += 14;
      });
      y += 4;
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    const PAGE_H = 792;
    const footerY = Math.max(y + 20, PAGE_H - 50);
    doc.rect(0, footerY, W, 50).fill(LIGHT_GRAY);
    doc.rect(0, footerY, W, 1).fill(RULE_GRAY);
    doc.fillColor(MID_GRAY).fontSize(8).font("Helvetica")
      .text(
        `© ${new Date().getFullYear()} Kitchens Plus Upstate — Renovations & Design`,
        MARGIN, footerY + 18,
        { width: CONTENT_W, align: "center" }
      );

    doc.end();
  });
}
