/**
 * contractPdf.ts
 *
 * Generates a fully self-contained, print-friendly signed contract PDF using
 * PDFKit (same library as proposalPdf.ts).  The document includes:
 *   - Kitchens Plus Upstate branded header
 *   - Full contract terms (scope, payment, warranty, dispute clauses)
 *   - Client & project details pre-filled from the invoice record
 *   - An "Electronically Signed" stamp block with:
 *       • Signature image (from base64 data URL)
 *       • Signer full name
 *       • Signed timestamp (ET)
 *       • Signer IP address
 *       • E-SIGN / UETA legal disclaimer
 *   - Branded footer
 *
 * Print-friendly: white background, no dark fills, works in B&W.
 */
import PDFDocument from "pdfkit";

// ── Palette ───────────────────────────────────────────────────────────────────
const GOLD       = "#BF9A3B";
const CHARCOAL   = "#2E2F2A";
const MID_GRAY   = "#555555";
const LIGHT_GRAY = "#EEEEEE";
const RULE_GRAY  = "#CCCCCC";
const WHITE      = "#FFFFFF";

export interface ContractPdfData {
  invoiceNumber: string;
  invoiceType?: string | null;
  invoiceAmount: number;
  invoiceNotes?: string | null;
  clientName: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  projectTitle?: string | null;
  // Signature fields
  signatureDataUrl: string;   // base64 PNG data URL
  signerName: string;
  signedAt: Date;
  signerIp?: string | null;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function fmtDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
  }) + " ET";
}

export async function generateSignedContractPdf(data: ContractPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      compress: true,
      info: {
        Title: `Signed Contract — Invoice #${data.invoiceNumber}`,
        Author: "Kitchens Plus Upstate",
        Subject: "Project Contract",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = 612;       // Letter width in points
    const MARGIN = 48;
    const CONTENT_W = W - MARGIN * 2;

    // ── HEADER ────────────────────────────────────────────────────────────────
    doc.rect(0, 0, W, 100).fill(WHITE);
    // Gold accent bar at top
    doc.rect(0, 0, W, 5).fill(GOLD);

    doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(20)
      .text("KITCHENS PLUS UPSTATE", MARGIN, 22, { width: 320 });
    doc.fillColor(GOLD).font("Helvetica").fontSize(8)
      .text("RENOVATIONS & DESIGN", MARGIN, 46, { characterSpacing: 1.5 });
    doc.fillColor(MID_GRAY).font("Helvetica").fontSize(8)
      .text("+1 (833) 518-4811  ·  chad@kitchensplusupstate.com  ·  kitchensplusupstate.com", MARGIN, 58);

    // Right side: document label
    doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(16)
      .text("PROJECT CONTRACT", W - MARGIN - 200, 22, { width: 200, align: "right" });
    doc.fillColor(MID_GRAY).font("Helvetica").fontSize(9)
      .text(`Invoice #${data.invoiceNumber}`, W - MARGIN - 200, 44, { width: 200, align: "right" });
    doc.fillColor(MID_GRAY).font("Helvetica").fontSize(9)
      .text(`Date: ${fmtDate(data.signedAt)}`, W - MARGIN - 200, 56, { width: 200, align: "right" });

    // Gold divider
    doc.moveTo(MARGIN, 90).lineTo(W - MARGIN, 90).strokeColor(GOLD).lineWidth(1).stroke();

    // ── CLIENT & PROJECT DETAILS ──────────────────────────────────────────────
    let y = 104;
    doc.fillColor(GOLD).font("Helvetica-Bold").fontSize(8)
      .text("CLIENT INFORMATION", MARGIN, y, { characterSpacing: 1 });
    y += 14;

    const leftCol = MARGIN;
    const rightCol = MARGIN + CONTENT_W / 2 + 8;
    const colW = CONTENT_W / 2 - 8;

    // Left: client name, email, phone
    doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(11)
      .text(data.clientName, leftCol, y, { width: colW });
    y += 14;
    if (data.clientEmail) {
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(9)
        .text(data.clientEmail, leftCol, y, { width: colW });
      y += 12;
    }
    if (data.clientPhone) {
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(9)
        .text(data.clientPhone, leftCol, y, { width: colW });
      y += 12;
    }
    if (data.clientAddress) {
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(9)
        .text(data.clientAddress, leftCol, y, { width: colW });
      y += 12;
    }

    // Right: project/invoice details
    let ry = 104 + 14;
    if (data.projectTitle) {
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(8)
        .text("PROJECT", rightCol, ry - 14, { width: colW, characterSpacing: 1 });
      doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(10)
        .text(data.projectTitle, rightCol, ry, { width: colW });
      ry += 14;
    }
    doc.fillColor(MID_GRAY).font("Helvetica").fontSize(8)
      .text("DEPOSIT AMOUNT", rightCol, ry, { width: colW, characterSpacing: 1 });
    ry += 12;
    doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(14)
      .text(fmt(data.invoiceAmount), rightCol, ry, { width: colW });
    ry += 18;

    y = Math.max(y, ry) + 8;

    // Thin rule
    doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor(RULE_GRAY).lineWidth(0.5).stroke();
    y += 12;

    // ── CONTRACT TERMS ────────────────────────────────────────────────────────
    doc.fillColor(GOLD).font("Helvetica-Bold").fontSize(8)
      .text("CONTRACT TERMS & CONDITIONS", MARGIN, y, { characterSpacing: 1 });
    y += 14;

    const terms: { heading: string; body: string }[] = [
      {
        heading: "1. Scope of Work",
        body: "Kitchens Plus Upstate (\"Contractor\") agrees to perform the renovation and design services described in the associated proposal and invoice. Any changes to the scope of work must be agreed upon in writing by both parties prior to commencement.",
      },
      {
        heading: "2. Payment Terms",
        body: `A deposit of ${fmt(data.invoiceAmount)} is due upon signing this contract. The remaining balance is due upon substantial completion of the project. Payments not received within 10 days of the due date are subject to a 1.5% monthly late fee. Contractor reserves the right to suspend work until overdue balances are settled.`,
      },
      {
        heading: "3. Project Timeline",
        body: "Contractor will provide an estimated project schedule upon deposit receipt. Timelines are estimates and may be affected by material availability, weather, permit delays, or client-requested changes. Contractor will communicate any significant delays promptly.",
      },
      {
        heading: "4. Materials & Substitutions",
        body: "Contractor will use materials specified in the proposal. If specified materials become unavailable, Contractor will notify Client and propose equivalent substitutions at no additional cost unless Client requests an upgrade.",
      },
      {
        heading: "5. Client Responsibilities",
        body: "Client agrees to provide reasonable access to the project site during normal business hours, maintain a safe working environment, and make timely decisions when required. Delays caused by Client may result in schedule adjustments and additional costs.",
      },
      {
        heading: "6. Warranty",
        body: "Contractor warrants workmanship for one (1) year from the date of substantial completion. Manufacturer warranties on materials and appliances are passed through to Client. Warranty does not cover damage from misuse, neglect, or modifications by others.",
      },
      {
        heading: "7. Limitation of Liability",
        body: "Contractor's total liability under this agreement shall not exceed the total contract price. Contractor shall not be liable for indirect, consequential, or incidental damages. Client waives any claims not presented within 30 days of project completion.",
      },
      {
        heading: "8. Dispute Resolution",
        body: "Any disputes arising from this agreement shall first be addressed through good-faith negotiation. If unresolved within 30 days, disputes shall be submitted to binding arbitration in Spartanburg County, South Carolina, under the rules of the American Arbitration Association.",
      },
      {
        heading: "9. Governing Law",
        body: "This agreement is governed by the laws of the State of South Carolina. Any legal proceedings shall be conducted in Spartanburg County, South Carolina.",
      },
      {
        heading: "10. Entire Agreement",
        body: "This contract, together with the associated proposal and invoice, constitutes the entire agreement between the parties and supersedes all prior discussions, representations, or agreements. Amendments must be in writing and signed by both parties.",
      },
    ];

    for (const term of terms) {
      // Check if we need a new page
      if (y > doc.page.height - 160) {
        doc.addPage();
        y = MARGIN;
      }

      doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(9)
        .text(term.heading, MARGIN, y, { width: CONTENT_W });
      y += 12;
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(8.5)
        .text(term.body, MARGIN, y, { width: CONTENT_W, lineGap: 1.5 });
      y = doc.y + 8;
    }

    // ── NOTES (if any) ────────────────────────────────────────────────────────
    if (data.invoiceNotes) {
      if (y > doc.page.height - 120) { doc.addPage(); y = MARGIN; }
      doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor(RULE_GRAY).lineWidth(0.5).stroke();
      y += 10;
      doc.fillColor(GOLD).font("Helvetica-Bold").fontSize(8)
        .text("PROJECT NOTES", MARGIN, y, { characterSpacing: 1 });
      y += 12;
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(8.5)
        .text(data.invoiceNotes, MARGIN, y, { width: CONTENT_W, lineGap: 1.5 });
      y = doc.y + 8;
    }

    // ── SIGNATURE BLOCK ───────────────────────────────────────────────────────
    const sigBlockH = 148;
    if (doc.y + sigBlockH + 60 > doc.page.height) {
      doc.addPage();
      y = MARGIN;
    } else {
      y = doc.y + 16;
    }

    doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor(GOLD).lineWidth(0.8).stroke();
    y += 10;

    // Box background
    doc.roundedRect(MARGIN, y, CONTENT_W, sigBlockH, 4).fillColor("#FAFAF8").fill();
    doc.roundedRect(MARGIN, y, CONTENT_W, sigBlockH, 4).strokeColor(GOLD).lineWidth(0.8).stroke();

    // Header
    doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(9)
      .text("ELECTRONICALLY SIGNED", MARGIN + 12, y + 10, { width: CONTENT_W - 24 });

    // Signature image (left side)
    const sigImgX = MARGIN + 12;
    const sigImgY = y + 26;
    try {
      const base64Data = data.signatureDataUrl.replace(/^data:image\/\w+;base64,/, "");
      const imgBuffer = Buffer.from(base64Data, "base64");
      doc.image(imgBuffer, sigImgX, sigImgY, { width: 190, height: 60, fit: [190, 60] });
    } catch {
      // Fallback: draw a signature line
      doc.moveTo(sigImgX, sigImgY + 56).lineTo(sigImgX + 190, sigImgY + 56)
        .strokeColor(RULE_GRAY).lineWidth(0.5).stroke();
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(8)
        .text("[Signature on file]", sigImgX, sigImgY + 20, { width: 190, align: "center" });
    }

    // Signer name + role
    doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(9)
      .text(data.signerName, sigImgX, sigImgY + 68);
    doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7.5)
      .text("Client / Authorized Signatory", sigImgX, sigImgY + 80);

    // Right side: date, IP, legal note
    const rightX = MARGIN + CONTENT_W / 2 + 8;
    const rightW = CONTENT_W / 2 - 20;
    doc.fillColor(MID_GRAY).font("Helvetica").fontSize(8)
      .text(`Signed: ${fmtDateTime(data.signedAt)}`, rightX, y + 26, { width: rightW });
    if (data.signerIp) {
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7.5)
        .text(`IP Address: ${data.signerIp}`, rightX, y + 40, { width: rightW });
    }
    doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7.5)
      .text(
        "By signing electronically, the Client agrees to be legally bound by this contract under the Electronic Signatures in Global and National Commerce Act (E-SIGN, 15 U.S.C. § 7001) and the Uniform Electronic Transactions Act (UETA). This electronic signature is legally equivalent to a handwritten signature.",
        rightX, y + 56, { width: rightW, lineGap: 1.5 }
      );

    // Contractor signature line
    const contrY = y + sigBlockH - 28;
    doc.moveTo(MARGIN + 12, contrY).lineTo(MARGIN + 230, contrY)
      .strokeColor(RULE_GRAY).lineWidth(0.5).stroke();
    doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7.5)
      .text("Chad Price — Kitchens Plus Upstate (Contractor)", MARGIN + 12, contrY + 4);

    y += sigBlockH + 16;

    // ── FOOTER ────────────────────────────────────────────────────────────────
    const footerY = doc.page.height - 36;
    doc.moveTo(MARGIN, footerY - 6).lineTo(W - MARGIN, footerY - 6)
      .strokeColor(GOLD).lineWidth(0.8).stroke();
    doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7.5)
      .text(
        `© ${new Date().getFullYear()} Kitchens Plus Upstate  ·  chad@kitchensplusupstate.com  ·  +1 (833) 518-4811  ·  kitchensplusupstate.com`,
        0, footerY, { width: W, align: "center" }
      );

    doc.end();
  });
}
