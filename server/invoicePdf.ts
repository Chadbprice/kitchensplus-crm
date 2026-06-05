import PDFDocument from "pdfkit";

// Print-friendly palette — all light/white, works in B&W
const GOLD        = "#BF9A3B";   // accent only (borders, dividers, headings)
const CHARCOAL    = "#2E2F2A";   // primary text
const MID_GRAY    = "#555555";   // secondary text
const LIGHT_GRAY  = "#EEEEEE";   // row stripes / borders
const RULE_GRAY   = "#CCCCCC";   // thin rules
const WHITE       = "#FFFFFF";

export interface InvoiceLineItem {
  description: string;
  quantity?: number | string;
  unitPrice?: number | string;
  total: number | string;
}

export interface InvoicePdfOptions {
  invoiceNumber: string;
  invoiceType: string;
  status: string;
  amount: number | string;
  dueDate?: Date | null;
  sentAt?: Date | null;
  notes?: string | null;
  squarePaymentUrl?: string | null;
  // Client info
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  // Proposal reference
  proposalNumber?: string | null;
  proposalTotal?: number | string | null;
  totalBilledSoFar?: number | string | null;
  // Project name
  projectName?: string | null;
  // Scope line items (no pricing shown)
  lineItems?: {
    task?: string | null;
    description?: string | null;
    category?: string | null;
    quantity?: string | null;
    unit?: string | null;
  }[];
}

function formatMoney(val: number | string | null | undefined): string {
  const n = Number(val ?? 0);
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d?: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function billingTypeLabel(type: string): string {
  const map: Record<string, string> = {
    deposit: "Deposit Invoice",
    progress: "Progress Payment",
    final: "Final Invoice",
    change_order: "Change Order",
    other: "Invoice",
  };
  return map[type] ?? "Invoice";
}

export async function generateInvoicePdf(opts: InvoicePdfOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      compress: true,
      info: {
        Title: `Invoice ${opts.invoiceNumber} — Kitchens Plus Upstate`,
        Author: "Kitchens Plus Upstate",
        Subject: billingTypeLabel(opts.invoiceType),
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = 612;
    const MARGIN = 48;
    const CONTENT_W = W - MARGIN * 2;
    const typeLabel = billingTypeLabel(opts.invoiceType);

    // ── HEADER — white background, gold accent bar ──────────────────────────
    doc.rect(0, 0, W, 100).fill(WHITE);

    // Company name (left)
    doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(20)
      .text("KITCHENS PLUS UPSTATE", MARGIN, 24, { width: 320 });
    doc.fillColor(GOLD).font("Helvetica").fontSize(8)
      .text("RENOVATIONS & DESIGN", MARGIN, 48, { width: 320, characterSpacing: 2 });
    doc.fillColor(MID_GRAY).font("Helvetica").fontSize(8)
      .text("chad@kitchensplusupstate.com  ·  +1 (833) 518-4811", MARGIN, 62, { width: 320 });

    // Invoice type + number (right)
    doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(16)
      .text(typeLabel.toUpperCase(), W - MARGIN - 200, 24, { width: 200, align: "right" });
    doc.fillColor(GOLD).font("Helvetica-Bold").fontSize(11)
      .text(`#${opts.invoiceNumber}`, W - MARGIN - 200, 46, { width: 200, align: "right" });
    doc.fillColor(MID_GRAY).font("Helvetica").fontSize(8)
      .text(`Date: ${formatDate(opts.sentAt ?? new Date())}`, W - MARGIN - 200, 62, { width: 200, align: "right" });

    // Gold accent bar
    doc.rect(0, 100, W, 3).fill(GOLD);

    // ── INFO ROW ─────────────────────────────────────────────────────────────
    let y = 118;

    function infoBlock(label: string, value: string, x: number, yy: number, w = 160) {
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7)
        .text(label.toUpperCase(), x, yy, { characterSpacing: 0.8, width: w });
      doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(10)
        .text(value, x, yy + 12, { width: w });
    }

    infoBlock("Due Date", formatDate(opts.dueDate), MARGIN, y);
    infoBlock("Status", opts.status.toUpperCase(), MARGIN + 180, y);
    if (opts.proposalNumber) {
      infoBlock("Proposal Ref", opts.proposalNumber, MARGIN + 360, y);
    }

    y += 44;

    // ── CLIENT CARD — light gray background ───────────────────────────────────
    const cardH = 72;
    doc.rect(MARGIN, y, CONTENT_W, cardH).fill(LIGHT_GRAY).stroke(LIGHT_GRAY);
    doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7)
      .text("BILL TO", MARGIN + 12, y + 10, { characterSpacing: 0.8 });
    doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(11)
      .text(opts.clientName ?? "Client", MARGIN + 12, y + 22);
    let clientY = y + 36;
    if (opts.clientAddress) {
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(8.5)
        .text(opts.clientAddress, MARGIN + 12, clientY, { width: 260 });
      clientY += 12;
    }
    const contactParts: string[] = [];
    if (opts.clientEmail) contactParts.push(opts.clientEmail);
    if (opts.clientPhone) contactParts.push(opts.clientPhone);
    if (contactParts.length) {
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(8.5)
        .text(contactParts.join("  ·  "), MARGIN + 12, clientY, { width: 300 });
    }

    // Project / proposal ref (right side of card)
    if (opts.projectName || opts.proposalNumber) {
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7)
        .text("PROJECT / PROPOSAL", W - MARGIN - 200, y + 10, { width: 200, align: "right", characterSpacing: 0.8 });
      if (opts.projectName) {
        doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(10)
          .text(opts.projectName, W - MARGIN - 200, y + 22, { width: 200, align: "right" });
      }
      if (opts.proposalNumber) {
        doc.fillColor(MID_GRAY).font("Helvetica").fontSize(8.5)
          .text(`Proposal ${opts.proposalNumber}`, W - MARGIN - 200, y + 36, { width: 200, align: "right" });
      }
    }

    y += cardH + 16;

    // ── AMOUNT SUMMARY — bordered box, no dark fill ────────────────────────
    const summaryH = 64;
    doc.rect(MARGIN, y, CONTENT_W, summaryH).fill(WHITE).stroke(RULE_GRAY);
    doc.rect(MARGIN, y, 4, summaryH).fill(GOLD);  // left accent stripe

    doc.fillColor(MID_GRAY).font("Helvetica").fontSize(8)
      .text(typeLabel.toUpperCase(), MARGIN + 16, y + 10, { characterSpacing: 1 });
    doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(26)
      .text(formatMoney(opts.amount), MARGIN + 16, y + 24);

    // Billing summary (right side)
    if (opts.proposalTotal && Number(opts.proposalTotal) > 0) {
      const billed = Number(opts.totalBilledSoFar ?? 0);
      const total = Number(opts.proposalTotal);
      const remaining = total - billed - Number(opts.amount);
      const rx = W - MARGIN - 200;
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7.5)
        .text(`Proposal Total: ${formatMoney(total)}`, rx, y + 12, { width: 200, align: "right" });
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7.5)
        .text(`Previously Billed: ${formatMoney(billed)}`, rx, y + 26, { width: 200, align: "right" });
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7.5)
        .text(`Remaining After: ${formatMoney(Math.max(0, remaining))}`, rx, y + 40, { width: 200, align: "right" });
    }

    y += summaryH + 20;

    // ── SCOPE OF WORK — line items (no pricing) ────────────────────────────
    const items = opts.lineItems ?? [];
    if (items.length > 0) {
      // Section heading
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7)
        .text("SCOPE OF WORK", MARGIN, y, { characterSpacing: 1 });
      y += 14;
      doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor(RULE_GRAY).lineWidth(0.5).stroke();
      y += 8;

      // Column header row
      doc.rect(MARGIN, y, CONTENT_W, 18).fill(LIGHT_GRAY);
      doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(8);
      doc.text("TASK / DESCRIPTION", MARGIN + 8, y + 5, { width: 310 });
      doc.text("CATEGORY", MARGIN + 326, y + 5, { width: 90, align: "center" });
      doc.text("QTY", MARGIN + 422, y + 5, { width: 90, align: "right" });
      y += 18;

      items.forEach((item, idx) => {
        const hasDesc = !!(item.description && item.description.trim());
        const rowH = hasDesc ? 30 : 18;

        // Check if we need a new page
        if (y + rowH > doc.page.height - 80) {
          doc.addPage({ size: "LETTER", margins: { top: 48, bottom: 48, left: 0, right: 0 } });
          y = 48;
          // Repeat column headers on new page
          doc.rect(MARGIN, y, CONTENT_W, 18).fill(LIGHT_GRAY);
          doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(8);
          doc.text("TASK / DESCRIPTION", MARGIN + 8, y + 5, { width: 310 });
          doc.text("CATEGORY", MARGIN + 326, y + 5, { width: 90, align: "center" });
          doc.text("QTY", MARGIN + 422, y + 5, { width: 90, align: "right" });
          y += 18;
        }

        // Alternating row stripe
        if (idx % 2 === 0) {
          doc.rect(MARGIN, y, CONTENT_W, rowH).fill("#F7F7F5");
        }

        // Task name
        doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(8.5)
          .text(item.task ?? "—", MARGIN + 8, y + 5, { width: 310 });

        // Description (second line)
        if (hasDesc) {
          doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7.5)
            .text(item.description!, MARGIN + 8, y + 17, { width: 310 });
        }

        // Category
        doc.fillColor(MID_GRAY).font("Helvetica").fontSize(8.5)
          .text(item.category ?? "", MARGIN + 326, y + 5, { width: 90, align: "center" });

        // Quantity + unit
        const qtyStr = item.quantity
          ? `${item.quantity}${item.unit ? " " + item.unit : ""}`
          : "";
        doc.fillColor(MID_GRAY).font("Helvetica").fontSize(8.5)
          .text(qtyStr, MARGIN + 422, y + 5, { width: 90, align: "right" });

        // Row separator
        doc.moveTo(MARGIN, y + rowH).lineTo(W - MARGIN, y + rowH)
          .strokeColor(RULE_GRAY).lineWidth(0.3).stroke();

        y += rowH;
      });

      y += 16;
    }

    // ── NOTES ────────────────────────────────────────────────────────────────
    if (opts.notes) {
      if (y + 60 > doc.page.height - 80) {
        doc.addPage({ size: "LETTER", margins: { top: 48, bottom: 48, left: 0, right: 0 } });
        y = 48;
      }
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7)
        .text("NOTES", MARGIN, y, { characterSpacing: 0.8 });
      y += 14;
      doc.rect(MARGIN, y, 3, 1).fill(RULE_GRAY);
      doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor(RULE_GRAY).lineWidth(0.5).stroke();
      y += 8;
      doc.fillColor(CHARCOAL).font("Helvetica").fontSize(9.5)
        .text(opts.notes, MARGIN, y, { width: CONTENT_W });
      y += doc.heightOfString(opts.notes, { width: CONTENT_W }) + 20;
    }

    // ── PAYMENT SECTION — light gold tint, no dark fill ───────────────────
    if (opts.squarePaymentUrl) {
      if (y + 100 > doc.page.height - 60) {
        doc.addPage({ size: "LETTER", margins: { top: 48, bottom: 48, left: 0, right: 0 } });
        y = 48;
      }
      const payH = 88;
      // Light gold background (#FDF8EC)
      doc.rect(MARGIN, y, CONTENT_W, payH).fill("#FDF8EC").stroke(GOLD);
      doc.rect(MARGIN, y, 4, payH).fill(GOLD);

      doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(12)
        .text("Pay Online — Secure & Easy", MARGIN + 16, y + 12, { width: CONTENT_W - 32, align: "center" });
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(8.5)
        .text("Click or visit the link below to pay by card, debit, or ACH bank transfer:", MARGIN + 16, y + 30, { width: CONTENT_W - 32, align: "center" });
      doc.fillColor(GOLD).font("Helvetica-Bold").fontSize(8.5)
        .text(opts.squarePaymentUrl, MARGIN + 16, y + 48, {
          width: CONTENT_W - 32, align: "center",
          link: opts.squarePaymentUrl, underline: true,
        });
      doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7.5)
        .text("Powered by Square — 256-bit encrypted · PCI compliant", MARGIN + 16, y + 66, { width: CONTENT_W - 32, align: "center" });
      y += payH + 20;
    }

    // ── FOOTER ────────────────────────────────────────────────────────────────
    const footerY = doc.page.height - 36;
    doc.moveTo(MARGIN, footerY - 6).lineTo(W - MARGIN, footerY - 6)
      .strokeColor(GOLD).lineWidth(0.8).stroke();
    doc.fillColor(MID_GRAY).font("Helvetica").fontSize(7.5)
      .text(
        "Kitchens Plus Upstate  ·  chad@kitchensplusupstate.com  ·  +1 (833) 518-4811  ·  Thank you for your business!",
        0, footerY, { width: W, align: "center" }
      );

    doc.end();
  });
}
