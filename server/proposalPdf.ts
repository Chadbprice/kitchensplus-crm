import PDFDocument from "pdfkit";

// Print-friendly palette — all light/white, works in B&W
const GOLD       = "#BF9A3B";   // accent only (borders, dividers, headings)
const CHARCOAL   = "#2E2F2A";   // primary text
const MID_GRAY   = "#555555";   // secondary text
const LIGHT_GRAY = "#EEEEEE";   // row stripes / borders
const RULE_GRAY  = "#CCCCCC";   // thin rules
const WHITE      = "#FFFFFF";

export interface ProposalPdfData {
  estimateNumber: string;
  title: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  notes?: string;
  validUntil?: Date | null;
  createdAt?: Date | null;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  depositPercent: number;
  depositAmount: number;
  total: number;
  lineItems: {
    task?: string | null;
    description?: string | null;
    category?: string | null;
    quantity?: string | null;
    unit?: string | null;
    unitCost?: string | null;
    markupPercent?: string | null;
    showMarkup?: boolean | null;
    imageUrl?: string | null;
    productUrl?: string | null;
    productSource?: string | null;
    imageBuffer?: Buffer | null;  // pre-fetched image bytes (populated by router before calling generateProposalPdf)
  }[];
  showPrices?: boolean;  // When true, show UNIT PRICE and AMOUNT columns in the line items table
  // E-signature fields (optional — only present on signed copies)
  signatureDataUrl?: string;  // base64 PNG data URL
  signerName?: string;
  signedAt?: Date;
  // Client-visible photo attachments (pre-fetched as buffers)
  photoAttachments?: { buffer: Buffer; fileName?: string | null }[];
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function formatDate(d?: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

// Footer height reserved at bottom of every page
const FOOTER_RESERVE = 32;

function drawFooter(doc: PDFKit.PDFDocument, W: number, MARGIN: number) {
  const footerY = doc.page.height - FOOTER_RESERVE + 4;
  doc.moveTo(MARGIN, footerY - 6).lineTo(W - MARGIN, footerY - 6)
    .strokeColor(GOLD).lineWidth(0.8).stroke();
  doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7.5)
    .text(
      `© ${new Date().getFullYear()} Kitchens Plus Upstate  ·  chad@kitchensplusupstate.com  ·  +1 (833) 518-4811  ·  kitchensplusupstate.com`,
      0, footerY, { width: W, align: "center" }
    );
}

export async function generateProposalPdf(data: ProposalPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      compress: true,
      autoFirstPage: true,
      info: {
        Title: `Proposal ${data.estimateNumber} — ${data.title}`,
        Author: "Kitchens Plus Upstate",
        Subject: "Renovation Proposal",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = 612; // Letter width in points
    const MARGIN = 44;
    const CONTENT_W = W - MARGIN * 2;
    // Usable bottom boundary (above footer)
    const PAGE_BOTTOM = () => doc.page.height - FOOTER_RESERVE - 8;

    // ── HEADER — white background, gold accent bar ──────────────────────────
    doc.rect(0, 0, W, 92).fill(WHITE);

    // Company name (left)
    doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(19)
      .text("KITCHENS PLUS UPSTATE", MARGIN, 20, { width: 320 });
    doc.fillColor(GOLD).font("Helvetica").fontSize(7.5)
      .text("RENOVATIONS & DESIGN", MARGIN, 43, { width: 320, characterSpacing: 2 });
    doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7.5)
      .text("chad@kitchensplusupstate.com  ·  +1 (833) 518-4811", MARGIN, 55, { width: 320 });

    // Proposal number (right)
    const today = formatDate(data.createdAt ?? new Date());
    doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(15)
      .text("PROPOSAL", W - MARGIN - 200, 20, { width: 200, align: "right" });
    doc.fillColor(GOLD).font("Helvetica-Bold").fontSize(10)
      .text(`#${data.estimateNumber}`, W - MARGIN - 200, 40, { width: 200, align: "right" });
    doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7.5)
      .text(`Date: ${today}`, W - MARGIN - 200, 55, { width: 200, align: "right" });
    if (data.validUntil) {
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7.5)
        .text(`Valid Until: ${formatDate(data.validUntil)}`, W - MARGIN - 200, 66, { width: 200, align: "right" });
    }

    // Gold accent bar
    doc.rect(0, 92, W, 3).fill(GOLD);

    // ── CLIENT CARD ───────────────────────────────────────────────────────────
    let y = 106;
    const cardH = 70;
    doc.rect(MARGIN, y, CONTENT_W, cardH).fill(LIGHT_GRAY).stroke(LIGHT_GRAY);

    // Proposal title (left)
    doc.fillColor(MID_GRAY).font("Helvetica").fontSize(6.5)
      .text("PROPOSAL FOR", MARGIN + 10, y + 8, { characterSpacing: 0.8 });
    doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(12)
      .text(data.title, MARGIN + 10, y + 19, { width: 280 });

    // Client info (right)
    const cardX = W - MARGIN - 210;
    doc.fillColor(MID_GRAY).font("Helvetica").fontSize(6.5)
      .text("PREPARED FOR", cardX, y + 8, { width: 210, align: "right", characterSpacing: 0.8 });
    doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(10)
      .text(data.clientName, cardX, y + 19, { width: 210, align: "right" });
    let clientInfoY = y + 32;
    if (data.clientAddress) {
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7.5)
        .text(data.clientAddress, cardX, clientInfoY, { width: 210, align: "right" });
      clientInfoY += 11;
    }
    const contactParts: string[] = [];
    if (data.clientEmail) contactParts.push(data.clientEmail);
    if (data.clientPhone) contactParts.push(data.clientPhone);
    if (contactParts.length) {
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7.5)
        .text(contactParts.join("  ·  "), cardX, clientInfoY, { width: 210, align: "right" });
    }

    y += cardH + 14;

    // ── SCOPE OF WORK — line items ─────────────────────────────────────────
    if (data.lineItems.length > 0) {
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(6.5)
        .text("SCOPE OF WORK", MARGIN, y, { characterSpacing: 1 });
      y += 11;
      doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor(RULE_GRAY).lineWidth(0.5).stroke();
      y += 6;

      // Column header row
      // When showPrices=true: 5 cols — TASK/DESC | CATEGORY | QTY | UNIT PRICE | AMOUNT
      // When showPrices=false: 3 cols — TASK/DESC | CATEGORY | QTY  (prices hidden)
      const showPrices = !!data.showPrices;
      const COL_HDR_H = 16;

      // Column x-positions and widths (CONTENT_W = W - 2*MARGIN = 512 on Letter)
      // With prices: TASK=200, CAT=70, QTY=60, UNIT PRICE=90, AMOUNT=92
      // Without prices: TASK=310, CAT=90, QTY=90 (unchanged)
      const TASK_W   = showPrices ? 200 : 310;
      const CAT_X    = MARGIN + TASK_W + 8;
      const CAT_W    = showPrices ? 70 : 90;
      const QTY_X    = CAT_X + CAT_W + 4;
      const QTY_W    = showPrices ? 60 : 90;
      const PRICE_X  = QTY_X + QTY_W + 4;
      const PRICE_W  = 86;
      const AMT_X    = PRICE_X + PRICE_W + 4;
      const AMT_W    = 80;

      const drawColHeaders = (yPos: number) => {
        doc.rect(MARGIN, yPos, CONTENT_W, COL_HDR_H).fill(LIGHT_GRAY);
        doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(7.5);
        doc.text("TASK / DESCRIPTION", MARGIN + 8, yPos + 4, { width: TASK_W });
        doc.text("CATEGORY", CAT_X, yPos + 4, { width: CAT_W, align: "center" });
        doc.text("QTY", QTY_X, yPos + 4, { width: QTY_W, align: "right" });
        if (showPrices) {
          doc.text("UNIT PRICE", PRICE_X, yPos + 4, { width: PRICE_W, align: "right" });
          doc.text("AMOUNT", AMT_X, yPos + 4, { width: AMT_W, align: "right" });
        }
      };
      drawColHeaders(y);
      y += COL_HDR_H;

      data.lineItems.forEach((item, idx) => {
        const hasDesc = !!(item.description && item.description.trim());
        const hasImage = !!(item.imageBuffer);
        const hasProductLink = !!(item.productUrl);

        // Measure description height accurately if present
        let descH = 0;
        if (hasDesc) {
          descH = doc.heightOfString(item.description!, { width: TASK_W - (hasImage ? 42 : 0), fontSize: 7 });
        }
        // Image thumbnail: 36x36 pt, right-aligned in task column
        const IMG_SIZE = 36;
        const IMG_PAD = 4;
        // Row height: if image, at least IMG_SIZE + padding; also accommodate description
        let rowH: number;
        if (hasImage) {
          const textH = 14 + (hasDesc ? descH + 2 : 0) + (hasProductLink ? 10 : 0);
          rowH = Math.max(IMG_SIZE + IMG_PAD * 2, textH + 8);
        } else {
          rowH = hasDesc ? Math.max(28, 14 + descH + 4) : 16;
        }

        // New page if needed — keep footer reserve
        if (y + rowH > PAGE_BOTTOM()) {
          drawFooter(doc, W, MARGIN);
          doc.addPage({ size: "LETTER", margins: { top: 0, bottom: 0, left: 0, right: 0 } });
          y = 36;
          drawColHeaders(y);
          y += COL_HDR_H;
        }

        // Alternating row stripe
        if (idx % 2 === 0) {
          doc.rect(MARGIN, y, CONTENT_W, rowH).fill("#F7F7F5");
        }

        // Thumbnail image (left side of task column)
        const textOffsetX = hasImage ? MARGIN + IMG_SIZE + IMG_PAD * 2 + 4 : MARGIN + 8;
        const textW = hasImage ? TASK_W - IMG_SIZE - IMG_PAD * 2 - 4 : TASK_W;

        if (hasImage) {
          try {
            doc.image(item.imageBuffer!, MARGIN + IMG_PAD, y + IMG_PAD, {
              width: IMG_SIZE,
              height: IMG_SIZE,
              fit: [IMG_SIZE, IMG_SIZE],
              align: "center",
              valign: "center",
            });
          } catch {
            // Image failed to render — skip silently
          }
        }

        // Task name
        doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(8)
          .text(item.task ?? "—", textOffsetX, y + 4, { width: textW, lineBreak: false });

        // Description (second line, smaller)
        if (hasDesc) {
          doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7)
            .text(item.description!, textOffsetX, y + 14, { width: textW });
        }

        // Product source + URL link (below description)
        if (hasProductLink) {
          const linkY = y + 14 + (hasDesc ? descH + 2 : 0);
          const sourceLabel = item.productSource ? `${item.productSource} — ` : "";
          doc.fillColor(GOLD).font("Helvetica").fontSize(6.5)
            .text(`${sourceLabel}${item.productUrl}`, textOffsetX, linkY, {
              width: textW,
              lineBreak: false,
              link: item.productUrl,
              underline: true,
            });
        }

        // Category
        doc.fillColor(MID_GRAY).font("Helvetica").fontSize(8)
          .text(item.category ?? "", CAT_X, y + 4, { width: CAT_W, align: "center" });

        // Quantity + unit
        const qtyStr = item.quantity
          ? `${item.quantity}${item.unit ? " " + item.unit : ""}`
          : "";
        doc.fillColor(MID_GRAY).font("Helvetica").fontSize(8)
          .text(qtyStr, QTY_X, y + 4, { width: QTY_W, align: "right" });

        // Unit price and line total (only when showPrices)
        if (showPrices && item.unitCost) {
          const unitCostNum = parseFloat(String(item.unitCost)) || 0;
          const qty = parseFloat(String(item.quantity ?? "1")) || 1;
          const lineTotal = unitCostNum * qty;
          doc.fillColor(MID_GRAY).font("Helvetica").fontSize(8)
            .text(fmt(unitCostNum), PRICE_X, y + 4, { width: PRICE_W, align: "right" });
          doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(8)
            .text(fmt(lineTotal), AMT_X, y + 4, { width: AMT_W, align: "right" });
        }

        // Row separator
        doc.moveTo(MARGIN, y + rowH).lineTo(W - MARGIN, y + rowH)
          .strokeColor(RULE_GRAY).lineWidth(0.3).stroke();

        y += rowH;
      });

      y += 14;
    }

    // ── TOTALS BOX ────────────────────────────────────────────────────────────
    const totalsBoxH = data.taxRate > 0 ? 108 : 90;
    if (y + totalsBoxH > PAGE_BOTTOM()) {
      drawFooter(doc, W, MARGIN);
      doc.addPage({ size: "LETTER", margins: { top: 0, bottom: 0, left: 0, right: 0 } });
      y = 36;
    }

    const totalsX = W - MARGIN - 230;
    const totalsW = 230;
    let totalsY = y;

    doc.roundedRect(totalsX, totalsY, totalsW, totalsBoxH, 5)
      .fill(WHITE).stroke(RULE_GRAY);

    totalsY += 12;

    doc.fillColor(MID_GRAY).font("Helvetica").fontSize(9.5)
      .text("Subtotal", totalsX + 12, totalsY, { width: totalsW - 24 });
    doc.fillColor(CHARCOAL).font("Helvetica").fontSize(9.5)
      .text(fmt(data.subtotal), totalsX + 12, totalsY, { width: totalsW - 24, align: "right" });
    totalsY += 18;

    if (data.taxRate > 0) {
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(9.5)
        .text(`Tax (${data.taxRate}%)`, totalsX + 12, totalsY, { width: totalsW - 24 });
      doc.fillColor(CHARCOAL).font("Helvetica").fontSize(9.5)
        .text(fmt(data.taxAmount), totalsX + 12, totalsY, { width: totalsW - 24, align: "right" });
      totalsY += 18;
    }

    // Gold divider
    doc.moveTo(totalsX + 12, totalsY).lineTo(totalsX + totalsW - 12, totalsY)
      .strokeColor(GOLD).lineWidth(1.5).stroke();
    totalsY += 10;

    doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(13)
      .text("Total", totalsX + 12, totalsY, { width: totalsW - 24 });
    doc.fillColor(GOLD).font("Helvetica-Bold").fontSize(13)
      .text(fmt(data.total), totalsX + 12, totalsY, { width: totalsW - 24, align: "right" });
    totalsY += 22;

    // Deposit box
    doc.roundedRect(totalsX + 8, totalsY, totalsW - 16, 24, 4)
      .fill(LIGHT_GRAY).stroke(RULE_GRAY);
    doc.fillColor(MID_GRAY).font("Helvetica").fontSize(8.5)
      .text(`Deposit Required (${data.depositPercent}%)`, totalsX + 14, totalsY + 7, { width: totalsW - 28 });
    doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(9.5)
      .text(fmt(data.depositAmount), totalsX + 14, totalsY + 7, { width: totalsW - 28, align: "right" });

    y = Math.max(y + totalsBoxH + 20, totalsY + 30);

    // ── NOTES / TERMS ─────────────────────────────────────────────────────────
    if (data.notes) {
      const notesH = doc.heightOfString(data.notes, { width: CONTENT_W }) + 28;
      if (y + notesH > PAGE_BOTTOM()) {
        drawFooter(doc, W, MARGIN);
        doc.addPage({ size: "LETTER", margins: { top: 0, bottom: 0, left: 0, right: 0 } });
        y = 36;
      }
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(6.5)
        .text("NOTES & TERMS", MARGIN, y, { characterSpacing: 0.8 });
      y += 11;
      doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor(RULE_GRAY).lineWidth(0.5).stroke();
      y += 6;
      doc.fillColor(CHARCOAL).font("Helvetica").fontSize(9)
        .text(data.notes, MARGIN, y, { width: CONTENT_W });
      y += doc.heightOfString(data.notes, { width: CONTENT_W }) + 14;
    }

    // ── PHOTO ATTACHMENTS ─────────────────────────────────────────────────────
    if (data.photoAttachments && data.photoAttachments.length > 0) {
      const PHOTOS_PER_ROW = 2;
      const PHOTO_W = (CONTENT_W - 12) / PHOTOS_PER_ROW;
      const PHOTO_H = Math.round(PHOTO_W * 0.65);
      const SECTION_HEADER_H = 28;

      if (y + SECTION_HEADER_H > PAGE_BOTTOM()) {
        drawFooter(doc, W, MARGIN);
        doc.addPage({ size: "LETTER", margins: { top: 0, bottom: 0, left: 0, right: 0 } });
        y = 36;
      }

      // Section header
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(6.5)
        .text("PROJECT PHOTOS", MARGIN, y, { characterSpacing: 0.8 });
      y += 11;
      doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor(RULE_GRAY).lineWidth(0.5).stroke();
      y += 10;

      for (let i = 0; i < data.photoAttachments.length; i++) {
        const col = i % PHOTOS_PER_ROW;
        const x = MARGIN + col * (PHOTO_W + 12);

        // Start new row: check page space
        if (col === 0 && y + PHOTO_H + 24 > PAGE_BOTTOM()) {
          drawFooter(doc, W, MARGIN);
          doc.addPage({ size: "LETTER", margins: { top: 0, bottom: 0, left: 0, right: 0 } });
          y = 36;
        }

        try {
          doc.image(data.photoAttachments[i].buffer, x, y, {
            width: PHOTO_W,
            height: PHOTO_H,
            fit: [PHOTO_W, PHOTO_H],
            align: "center",
            valign: "center",
          });
          if (data.photoAttachments[i].fileName) {
            doc.fillColor(MID_GRAY).font("Helvetica").fontSize(6.5)
              .text(data.photoAttachments[i].fileName!, x, y + PHOTO_H + 2, { width: PHOTO_W, align: "center" });
          }
        } catch {
          doc.rect(x, y, PHOTO_W, PHOTO_H).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
          doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7)
            .text("[Photo]", x, y + PHOTO_H / 2 - 5, { width: PHOTO_W, align: "center" });
        }

        // After filling a row (or last photo), advance y
        if (col === PHOTOS_PER_ROW - 1 || i === data.photoAttachments.length - 1) {
          y += PHOTO_H + 24;
        }
      }
      y += 8;
    }

    // ── ACCEPTANCE SECTION ────────────────────────────────────────────────────
    const acceptH = 82;
    if (y + acceptH > PAGE_BOTTOM()) {
      drawFooter(doc, W, MARGIN);
      doc.addPage({ size: "LETTER", margins: { top: 0, bottom: 0, left: 0, right: 0 } });
      y = 36;
    }
    doc.roundedRect(MARGIN, y, CONTENT_W, acceptH, 5)
      .fill(WHITE).stroke(RULE_GRAY);
    doc.rect(MARGIN, y, 4, acceptH).fill(GOLD);

    doc.fillColor(MID_GRAY).font("Helvetica").fontSize(6.5)
      .text("ACCEPTANCE", MARGIN + 14, y + 8, { characterSpacing: 0.8 });
    doc.fillColor(CHARCOAL).font("Helvetica").fontSize(8.5)
      .text(
        `By signing below, you authorize Kitchens Plus Upstate to proceed with the work described in this proposal. A deposit of ${fmt(data.depositAmount)} is due upon acceptance to schedule your project.`,
        MARGIN + 14, y + 20, { width: CONTENT_W - 24 }
      );

    // Signature lines
    const sigY = y + 58;
    doc.moveTo(MARGIN + 14, sigY).lineTo(MARGIN + 270, sigY)
      .strokeColor(RULE_GRAY).lineWidth(0.5).stroke();
    doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7.5)
      .text("Client Signature", MARGIN + 14, sigY + 3);
    doc.moveTo(MARGIN + 310, sigY).lineTo(MARGIN + 490, sigY)
      .strokeColor(RULE_GRAY).lineWidth(0.5).stroke();
    doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7.5)
      .text("Date", MARGIN + 310, sigY + 3);

    y += acceptH + 10;

    // ── SIGNATURE STAMP (only on signed copies) ──────────────────────────────
    if (data.signatureDataUrl && data.signerName && data.signedAt) {
      const spaceNeeded = 130;
      if (y + spaceNeeded > PAGE_BOTTOM()) {
        drawFooter(doc, W, MARGIN);
        doc.addPage({ size: "LETTER", margins: { top: 0, bottom: 0, left: 0, right: 0 } });
        y = 36;
      }
      const sigBoxY = y;
      const sigBoxW = CONTENT_W;
      const sigBoxH = 110;

      doc.roundedRect(MARGIN, sigBoxY, sigBoxW, sigBoxH, 4)
        .fillColor("#FAFAF8").fill();
      doc.roundedRect(MARGIN, sigBoxY, sigBoxW, sigBoxH, 4)
        .strokeColor(GOLD).lineWidth(0.8).stroke();

      doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(8.5)
        .text("ELECTRONICALLY SIGNED", MARGIN + 12, sigBoxY + 8, { width: sigBoxW - 24 });

      try {
        const base64Data = data.signatureDataUrl.replace(/^data:image\/\w+;base64,/, "");
        const imgBuffer = Buffer.from(base64Data, "base64");
        doc.image(imgBuffer, MARGIN + 12, sigBoxY + 22, { width: 170, height: 50, fit: [170, 50] });
      } catch {
        doc.moveTo(MARGIN + 12, sigBoxY + 62).lineTo(MARGIN + 182, sigBoxY + 62)
          .strokeColor(RULE_GRAY).lineWidth(0.5).stroke();
      }

      doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(8.5)
        .text(data.signerName, MARGIN + 12, sigBoxY + 76);
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7)
        .text("Authorized Signatory", MARGIN + 12, sigBoxY + 88);

      const signedDateStr = new Date(data.signedAt).toLocaleString("en-US", {
        year: "numeric", month: "long", day: "numeric",
        hour: "numeric", minute: "2-digit", timeZone: "America/New_York"
      }) + " ET";
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7)
        .text(`Signed: ${signedDateStr}`, MARGIN + 210, sigBoxY + 22, { width: sigBoxW - 222 })
        .text("This document was signed electronically under the E-SIGN Act (15 U.S.C. § 7001) and UETA. The electronic signature is legally binding and equivalent to a handwritten signature.",
          MARGIN + 210, sigBoxY + 34, { width: sigBoxW - 222, lineGap: 1.5 });

      y = sigBoxY + sigBoxH + 10;
    }

    // ── FOOTER on final page ──────────────────────────────────────────────────
    drawFooter(doc, W, MARGIN);

    doc.end();
  });
}
