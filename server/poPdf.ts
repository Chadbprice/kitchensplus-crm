import puppeteer from "puppeteer-core";

interface PoPdfOptions {
  po: {
    id: number;
    poNumber?: string | null;
    title?: string | null;
    status: string;
    subtotal?: any;
    total?: any;
    notes?: string | null;
    expectedDelivery?: Date | null;
    createdAt: Date;
  };
  vendor: {
    companyName: string;
    contactName?: string | null;
    email?: string | null;
    phone?: string | null;
    trade?: string | null;
  } | null;
  project: {
    name: string;
    address?: string | null;
  } | null;
  lineItems: {
    description: string;
    quantity?: any;
    unit?: string | null;
    unitCost?: any;
    lineTotal?: any;
  }[];
}

export async function generatePoPdf(opts: PoPdfOptions): Promise<Buffer> {
  const { po, vendor, project, lineItems } = opts;

  const total = parseFloat(String(po.total ?? "0"));
  const subtotal = parseFloat(String(po.subtotal ?? total));

  const lineItemRows = lineItems.map(li => {
    const qty = parseFloat(String(li.quantity ?? "1"));
    const cost = parseFloat(String(li.unitCost ?? "0"));
    const lineTotal = parseFloat(String(li.lineTotal ?? qty * cost));
    return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #2a2a26;color:#e0e0d8;font-size:13px;">${li.description}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #2a2a26;color:#a0a09a;text-align:center;font-size:13px;">${qty % 1 === 0 ? qty.toFixed(0) : qty.toFixed(2)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #2a2a26;color:#a0a09a;text-align:center;font-size:13px;">${li.unit ?? "—"}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #2a2a26;color:#a0a09a;text-align:right;font-size:13px;font-family:monospace;">$${cost.toFixed(2)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #2a2a26;color:#e0e0d8;text-align:right;font-size:13px;font-family:monospace;font-weight:600;">$${lineTotal.toFixed(2)}</td>
      </tr>
    `;
  }).join("");

  const expectedDeliveryStr = po.expectedDelivery
    ? new Date(po.expectedDelivery).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "TBD";

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #13130f; color: #e0e0d8; font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 36px; padding-bottom: 24px; border-bottom: 2px solid #C9A84C; }
  .company-name { font-size: 26px; font-weight: 700; color: #C9A84C; letter-spacing: 0.5px; }
  .company-sub { font-size: 12px; color: #6a6a60; margin-top: 3px; }
  .po-meta { text-align: right; }
  .po-number { font-size: 22px; font-weight: 700; color: #C9A84C; font-family: monospace; }
  .po-label { font-size: 11px; color: #6a6a60; text-transform: uppercase; letter-spacing: 1px; }
  .po-date { font-size: 13px; color: #a0a09a; margin-top: 4px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 32px; }
  .info-card { background: #1c1c1a; border: 1px solid #2a2a26; border-radius: 8px; padding: 16px; }
  .info-card-title { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #6a6a60; margin-bottom: 8px; }
  .info-card-name { font-size: 15px; font-weight: 600; color: #e0e0d8; margin-bottom: 4px; }
  .info-card-detail { font-size: 12px; color: #a0a09a; line-height: 1.6; }
  .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #6a6a60; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  thead tr { background: #1c1c1a; }
  thead th { padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: #6a6a60; font-weight: 600; border-bottom: 1px solid #3a3a35; }
  thead th.right { text-align: right; }
  thead th.center { text-align: center; }
  .totals { display: flex; justify-content: flex-end; margin-bottom: 32px; }
  .totals-box { background: #1c1c1a; border: 1px solid #2a2a26; border-radius: 8px; padding: 16px 24px; min-width: 260px; }
  .totals-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; color: #a0a09a; }
  .totals-row.grand { border-top: 1px solid #C9A84C; margin-top: 8px; padding-top: 10px; font-size: 16px; font-weight: 700; color: #C9A84C; }
  .notes-box { background: #1c1c1a; border: 1px solid #2a2a26; border-radius: 8px; padding: 16px; margin-bottom: 32px; }
  .notes-text { font-size: 13px; color: #a0a09a; line-height: 1.7; white-space: pre-wrap; }
  .footer { border-top: 1px solid #2a2a26; padding-top: 20px; display: flex; justify-content: space-between; align-items: center; }
  .footer-left { font-size: 11px; color: #6a6a60; }
  .footer-right { font-size: 11px; color: #6a6a60; text-align: right; }
  .status-badge { display: inline-block; padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; background: #2a2a26; color: #a0a09a; }
</style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <div>
      <div class="company-name">KITCHENS PLUS UPSTATE</div>
      <div class="company-sub">Renovations &amp; Design · chad@kitchensplusupstate.com · +1 (833) 518-4811</div>
    </div>
    <div class="po-meta">
      <div class="po-label">Purchase Order</div>
      <div class="po-number">${po.poNumber ?? "PO-DRAFT"}</div>
      <div class="po-date">Issued: ${new Date(po.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
      <div style="margin-top:6px;"><span class="status-badge">${po.status.toUpperCase()}</span></div>
    </div>
  </div>

  <!-- Vendor & Project Info -->
  <div class="info-grid">
    <div class="info-card">
      <div class="info-card-title">Vendor / Supplier</div>
      ${vendor ? `
        <div class="info-card-name">${vendor.companyName}</div>
        ${vendor.contactName ? `<div class="info-card-detail">${vendor.contactName}</div>` : ""}
        ${vendor.trade ? `<div class="info-card-detail">${vendor.trade}</div>` : ""}
        ${vendor.email ? `<div class="info-card-detail">${vendor.email}</div>` : ""}
        ${vendor.phone ? `<div class="info-card-detail">${vendor.phone}</div>` : ""}
      ` : `<div class="info-card-detail" style="color:#6a6a60;">No vendor assigned</div>`}
    </div>
    <div class="info-card">
      <div class="info-card-title">Deliver To / Project</div>
      ${project ? `
        <div class="info-card-name">${project.name}</div>
        ${project.address ? `<div class="info-card-detail">${project.address}</div>` : ""}
      ` : `<div class="info-card-detail">Kitchens Plus Upstate</div>`}
      <div class="info-card-detail" style="margin-top:8px;">
        <strong style="color:#C9A84C;">Expected Delivery:</strong> ${expectedDeliveryStr}
      </div>
    </div>
  </div>

  <!-- Line Items -->
  <div class="section-title">Order Items</div>
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="center" style="width:80px;">Qty</th>
        <th class="center" style="width:70px;">Unit</th>
        <th class="right" style="width:110px;">Unit Cost</th>
        <th class="right" style="width:110px;">Line Total</th>
      </tr>
    </thead>
    <tbody>
      ${lineItemRows || `<tr><td colspan="5" style="padding:20px;text-align:center;color:#6a6a60;">No items</td></tr>`}
    </tbody>
  </table>

  <!-- Totals -->
  <div class="totals">
    <div class="totals-box">
      <div class="totals-row">
        <span>Subtotal</span>
        <span style="font-family:monospace;">$${subtotal.toFixed(2)}</span>
      </div>
      <div class="totals-row grand">
        <span>Total</span>
        <span style="font-family:monospace;">$${total.toFixed(2)}</span>
      </div>
    </div>
  </div>

  ${po.notes ? `
  <!-- Notes -->
  <div class="section-title">Notes &amp; Special Instructions</div>
  <div class="notes-box">
    <div class="notes-text">${po.notes.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
  </div>
  ` : ""}

  <!-- Footer -->
  <div class="footer">
    <div class="footer-left">
      <div>Kitchens Plus Upstate · Spartanburg, SC</div>
      <div>chad@kitchensplusupstate.com · +1 (833) 518-4811</div>
    </div>
    <div class="footer-right">
      <div>${po.poNumber ?? "PO-DRAFT"} · Generated ${new Date().toLocaleDateString()}</div>
      <div>Please reference PO number on all invoices and shipments</div>
    </div>
  </div>
</body>
</html>`;

  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.5in", right: "0.5in", bottom: "0.5in", left: "0.5in" },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
