import nodemailer from "nodemailer";

// SMTP auth must use the real Google Workspace account that owns the App Password.
// chad@kitchensplusupstate.com is a "Send mail as" alias on that account, so it
// is used as the From/ReplyTo display address but NOT for SMTP login.
const GMAIL_AUTH_USER = "chad@cpenterprisessc.com";   // real Google account
const GMAIL_FROM_USER = "chad@kitchensplusupstate.com"; // alias shown to recipients
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD ?? "";

export function createTransporter() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: GMAIL_AUTH_USER,
      pass: GMAIL_PASS,
    },
  });
}

export async function verifyEmailConnection(): Promise<{ ok: boolean; error?: string }> {
  if (!GMAIL_PASS) {
    return { ok: false, error: "GMAIL_APP_PASSWORD not set" };
  }
  try {
    const transporter = createTransporter();
    await transporter.verify();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

export interface ProposalEmailOptions {
  toEmail: string;
  toName: string;
  proposalNumber: string;
  proposalTitle: string;
  totalAmount: number;
  portalUrl: string;
  pdfBuffer?: Buffer;
  notes?: string;
  /** Optional CC address — receives an identical copy of the proposal email */
  ccEmail?: string;
  /** Additional files to attach to the outgoing email (e.g. floor plans, spec sheets) */
  additionalAttachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}

export async function sendProposalEmail(opts: ProposalEmailOptions): Promise<{ ok: boolean; error?: string }> {
  if (!GMAIL_PASS) return { ok: false, error: "GMAIL_APP_PASSWORD not set" };

  const formattedTotal = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(opts.totalAmount);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#F5EDE7;font-family:'Poppins',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5EDE7;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#2E2F2A;padding:36px 40px;text-align:center;border-radius:12px 12px 0 0;">
          <h1 style="margin:0;font-family:Georgia,serif;font-size:28px;color:#BF9A3B;letter-spacing:1px;">Kitchens Plus Upstate</h1>
          <p style="margin:6px 0 0;color:#F5EDE7;font-size:13px;letter-spacing:2px;text-transform:uppercase;">Renovations &amp; Design</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:40px;">
          <p style="margin:0 0 8px;font-size:16px;color:#2E2F2A;">Dear ${opts.toName},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">
            Thank you for the opportunity to work with you. Please find your proposal from <strong>Kitchens Plus Upstate</strong> below.
          </p>

          <!-- Proposal Card -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5EDE7;border-radius:8px;padding:24px;margin-bottom:28px;">
            <tr>
              <td>
                <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Proposal</p>
                <p style="margin:0 0 12px;font-size:20px;font-weight:700;color:#2E2F2A;">${opts.proposalTitle}</p>
                <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Reference</p>
                <p style="margin:0 0 12px;font-size:14px;color:#2E2F2A;">${opts.proposalNumber}</p>
                <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Total Investment</p>
                <p style="margin:0;font-size:28px;font-weight:700;color:#BF9A3B;">${formattedTotal}</p>
              </td>
            </tr>
          </table>

          ${opts.notes ? `<p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.6;background:#fffbf5;border-left:3px solid #BF9A3B;padding:12px 16px;border-radius:0 6px 6px 0;">${opts.notes.replace(/\n/g, "<br/>")}</p>` : ""}

          <!-- CTA Button -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td align="center">
              <a href="${opts.portalUrl}" style="display:inline-block;background:#BF9A3B;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 36px;border-radius:50px;letter-spacing:0.5px;">
                View &amp; Respond to Your Proposal
              </a>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;font-size:14px;color:#555;line-height:1.6;">
            In your portal you can <strong>approve the proposal as-is</strong> or open a <strong>discussion</strong> to request changes. A PDF copy is attached to this email for your records.
          </p>
          <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.6;">
            You can also reply directly to this email or text us back at <strong>+1 (833) 518-4811</strong> — all messages go to our full team. If you'd prefer to speak directly with Chad, call <strong>(864) 567 8777</strong>.
          </p>

          <hr style="border:none;border-top:1px solid #eee;margin:28px 0;" />
          <p style="margin:0;font-size:13px;color:#888;text-align:center;">
            Kitchens Plus Upstate · Upstate South Carolina<br/>
            <a href="https://kitchensplusupstate.com" style="color:#BF9A3B;text-decoration:none;">kitchensplusupstate.com</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#2E2F2A;padding:20px 40px;text-align:center;border-radius:0 0 12px 12px;">
          <p style="margin:0;font-size:12px;color:#888;">© ${new Date().getFullYear()} Kitchens Plus Upstate. All rights reserved.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Dear ${opts.toName},\n\nPlease find your proposal from Kitchens Plus Upstate:\n\n${opts.proposalTitle}\nReference: ${opts.proposalNumber}\nTotal: ${formattedTotal}\n\nView and respond to your proposal here:\n${opts.portalUrl}\n\nYou can approve as-is or open a discussion to request changes. Reply to this email or text us back at +1 (833) 518-4811 anytime. To speak with Chad directly, call (864) 567 8777.\n\nKitchens Plus Upstate\nkitchensplusupstate.com`;

  const mailOptions: nodemailer.SendMailOptions = {
    from: `"Chad Price — Kitchens Plus Upstate" <${GMAIL_FROM_USER}>`,
    replyTo: GMAIL_FROM_USER,
    to: `"${opts.toName}" <${opts.toEmail}>`,
    ...(opts.ccEmail ? { cc: opts.ccEmail } : {}),
    subject: `Your Proposal from Kitchens Plus Upstate — ${opts.proposalTitle}`,
    html,
    text,
    attachments: [
      ...(opts.pdfBuffer ? [{ filename: `Proposal-${opts.proposalNumber}.pdf`, content: opts.pdfBuffer, contentType: "application/pdf" }] : []),
      ...(opts.additionalAttachments ?? []),
    ],
  };

  try {
    const transporter = createTransporter();
    await transporter.sendMail(mailOptions);
    return { ok: true };
  } catch (err: any) {
    console.error("[Email] Failed to send proposal:", err);
    return { ok: false, error: err?.message ?? String(err) };
  }
}

export interface FirstContactEmailOptions {
  to: string[];
  clientName: string;
  assignee: string;
  scheduledAt: string;
  address: string;
  personalizedNote?: string;
  projectType?: string;
  portalUrl?: string;      // client dashboard URL
  rescheduleUrl?: string;  // reschedule contact URL (mailto or tel fallback)
  confirmUrl?: string;     // one-click meeting confirmation URL
}

export async function sendFirstContactEmail(opts: FirstContactEmailOptions): Promise<{ ok: boolean; error?: string }> {
  if (!GMAIL_PASS) return { ok: false, error: "GMAIL_APP_PASSWORD not set" };
  if (!opts.to.length) return { ok: false, error: "No recipient email" };

  const firstName = opts.clientName.split(" ")[0];

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#F5EDE7;font-family:'Poppins',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5EDE7;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:#2E2F2A;padding:36px 40px;text-align:center;border-radius:12px 12px 0 0;">
          <h1 style="margin:0;font-family:Georgia,serif;font-size:28px;color:#BF9A3B;letter-spacing:1px;">Kitchens Plus Upstate</h1>
          <p style="margin:6px 0 0;color:#F5EDE7;font-size:13px;letter-spacing:2px;text-transform:uppercase;">Renovations &amp; Design</p>
        </td></tr>
        <tr><td style="background:#ffffff;padding:40px;">
          <p style="margin:0 0 8px;font-size:16px;color:#2E2F2A;">Dear ${firstName},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">
            Thank you for reaching out to <strong>Kitchens Plus Upstate</strong>! We're excited to learn more about your ${opts.projectType ?? "renovation"} project.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5EDE7;border-radius:8px;padding:24px;margin-bottom:28px;">
            <tr><td>
              <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Consultation Scheduled</p>
              <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#2E2F2A;">${opts.scheduledAt}</p>
              <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Location</p>
              <p style="margin:0 0 16px;font-size:14px;color:#2E2F2A;">${opts.address || "Your property"}</p>
              <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Your Consultant</p>
              <p style="margin:0;font-size:14px;font-weight:600;color:#BF9A3B;">${opts.assignee}</p>
            </td></tr>
          </table>
          ${opts.personalizedNote ? `<p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.6;background:#fffbf5;border-left:3px solid #BF9A3B;padding:12px 16px;border-radius:0 6px 6px 0;">${opts.personalizedNote}</p>` : ""}
          <p style="margin:0 0 16px;font-size:14px;color:#555;line-height:1.6;">
            During our visit we'll walk through your space, discuss your vision, and answer any questions you have. There's no obligation — just a friendly conversation to see how we can help.
          </p>

          <!-- CTA Buttons -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr>
              ${opts.confirmUrl ? `<td align="center" style="padding:0 6px 8px 0;">
                <a href="${opts.confirmUrl}" style="display:inline-block;background:#4CAF7D;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:13px 28px;border-radius:50px;letter-spacing:0.5px;">&#10003; Confirm My Appointment</a>
              </td>` : ""}
            </tr>
            <tr>
              ${opts.portalUrl ? `<td align="center" style="padding:0 6px 0 0;">
                <a href="${opts.portalUrl}" style="display:inline-block;background:#BF9A3B;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:13px 28px;border-radius:50px;letter-spacing:0.5px;">View Your Dashboard</a>
              </td>` : ""}
              <td align="center" style="padding:0 0 0 6px;">
                <a href="${opts.rescheduleUrl ?? `mailto:chad@kitchensplusupstate.com?subject=Reschedule%20Consultation&body=Hi%20Chad%2C%20I%20need%20to%20reschedule%20my%20consultation%20scheduled%20for%20${encodeURIComponent(opts.scheduledAt)}.`}" style="display:inline-block;background:#ffffff;color:#2E2F2A;text-decoration:none;font-weight:600;font-size:14px;padding:12px 28px;border-radius:50px;letter-spacing:0.5px;border:2px solid #2E2F2A;">Need to Reschedule?</a>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.6;">
            Questions before we arrive? Reply to this email, text us at <strong>+1 (833) 518-4811</strong>, or call Chad directly at <strong>+1 (833) 518-4811</strong>.
          </p>
          <hr style="border:none;border-top:1px solid #eee;margin:28px 0;" />
          <p style="margin:0;font-size:13px;color:#888;text-align:center;">
            Kitchens Plus Upstate · Upstate South Carolina<br/>
            <a href="https://kitchensplusupstate.com" style="color:#BF9A3B;text-decoration:none;">kitchensplusupstate.com</a>
          </p>
        </td></tr>
        <tr><td style="background:#2E2F2A;padding:20px 40px;text-align:center;border-radius:0 0 12px 12px;">
          <p style="margin:0;font-size:12px;color:#888;">© ${new Date().getFullYear()} Kitchens Plus Upstate. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const rescheduleLink = opts.rescheduleUrl ?? `mailto:chad@kitchensplusupstate.com?subject=Reschedule%20Consultation`;
  const text = `Dear ${firstName},\n\nThank you for reaching out to Kitchens Plus Upstate!\n\nConsultation: ${opts.scheduledAt}\nLocation: ${opts.address || "Your property"}\nConsultant: ${opts.assignee}\n\n${opts.personalizedNote ? opts.personalizedNote + "\n\n" : ""}${opts.portalUrl ? `View your client dashboard: ${opts.portalUrl}\n\n` : ""}Need to reschedule? ${rescheduleLink}\n\nQuestions? Reply to this email, text +1 (833) 518-4811, or call Chad at +1 (833) 518-4811.\n\nKitchens Plus Upstate\nkitchensplusupstate.com`;

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"${opts.assignee} — Kitchens Plus Upstate" <${GMAIL_FROM_USER}>`,
      replyTo: GMAIL_FROM_USER,
      to: opts.to.join(", "),
      subject: `Your Consultation with Kitchens Plus Upstate — ${opts.scheduledAt}`,
      html,
      text,
    });
    return { ok: true };
  } catch (err: any) {
    console.error("[Email] Failed to send first contact:", err);
    return { ok: false, error: err?.message ?? String(err) };
  }
}

// ─── Purchase Order Email ─────────────────────────────────────────────────────
export interface PoEmailOptions {
  to: string;
  vendorName: string;
  poNumber: string;
  projectName: string;
  title: string;
  total: number;
  expectedDelivery?: Date | null;
  notes?: string;
  lineItems: {
    description: string;
    quantity: number;
    unit?: string;
    unitCost: number;
    lineTotal: number;
  }[];
  pdfBuffer?: Buffer;
}

export async function sendPoEmail(opts: PoEmailOptions): Promise<{ ok: boolean; error?: string }> {
  if (!GMAIL_PASS) return { ok: false, error: "GMAIL_APP_PASSWORD not set" };

  const lineItemRows = opts.lineItems.map(li => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #eee;color:#333;font-size:14px;">${li.description}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #eee;color:#666;text-align:center;font-size:14px;">${li.quantity}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #eee;color:#666;text-align:center;font-size:14px;">${li.unit ?? "—"}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #eee;color:#666;text-align:right;font-size:14px;font-family:monospace;">$${li.unitCost.toFixed(2)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #eee;color:#333;text-align:right;font-size:14px;font-family:monospace;font-weight:600;">$${li.lineTotal.toFixed(2)}</td>
    </tr>
  `).join("");

  const deliveryStr = opts.expectedDelivery
    ? new Date(opts.expectedDelivery).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "To be confirmed";

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#F5EDE7;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5EDE7;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="background:#2E2F2A;padding:32px 40px;border-radius:12px 12px 0 0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <div style="font-size:22px;font-weight:700;color:#BF9A3B;font-family:Georgia,serif;">Kitchens Plus Upstate</div>
                <div style="font-size:12px;color:#aaa;margin-top:3px;text-transform:uppercase;letter-spacing:1px;">Renovations &amp; Design</div>
              </td>
              <td align="right">
                <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;">Purchase Order</div>
                <div style="font-size:20px;font-weight:700;color:#BF9A3B;font-family:monospace;">${opts.poNumber}</div>
                <div style="font-size:12px;color:#888;margin-top:2px;">${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
              </td>
            </tr>
          </table>
        </td></tr>
        <!-- Body -->
        <tr><td style="background:#ffffff;padding:36px 40px;">
          <p style="margin:0 0 8px;font-size:16px;color:#2E2F2A;">Dear ${opts.vendorName},</p>
          <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.6;">
            Please find below our purchase order <strong>${opts.poNumber}</strong> for <strong>${opts.title}</strong>.
            ${opts.pdfBuffer ? "A PDF copy is attached for your records." : ""}
          </p>
          <!-- PO Details -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5EDE7;border-radius:8px;margin-bottom:24px;">
            <tr>
              <td style="padding:16px 20px;border-right:1px solid #e0d8d0;">
                <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Project</div>
                <div style="font-size:14px;color:#2E2F2A;font-weight:600;">${opts.projectName}</div>
              </td>
              <td style="padding:16px 20px;">
                <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Expected Delivery</div>
                <div style="font-size:14px;color:#BF9A3B;font-weight:600;">${deliveryStr}</div>
              </td>
            </tr>
          </table>
          <!-- Line Items -->
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Order Items</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;overflow:hidden;margin-bottom:20px;">
            <thead>
              <tr style="background:#F5EDE7;">
                <th style="padding:10px 14px;text-align:left;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Description</th>
                <th style="padding:10px 14px;text-align:center;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;width:70px;">Qty</th>
                <th style="padding:10px 14px;text-align:center;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;width:60px;">Unit</th>
                <th style="padding:10px 14px;text-align:right;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;width:100px;">Unit Cost</th>
                <th style="padding:10px 14px;text-align:right;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;width:100px;">Total</th>
              </tr>
            </thead>
            <tbody>${lineItemRows}</tbody>
            <tfoot>
              <tr style="border-top:2px solid #BF9A3B40;">
                <td colspan="4" style="padding:12px 14px;text-align:right;font-size:14px;color:#555;font-weight:600;">Total</td>
                <td style="padding:12px 14px;text-align:right;font-size:16px;color:#BF9A3B;font-weight:700;font-family:monospace;">$${opts.total.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
          ${opts.notes ? `
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Notes &amp; Special Instructions</div>
          <div style="background:#fffbf5;border-left:3px solid #BF9A3B;padding:12px 16px;border-radius:0 6px 6px 0;font-size:13px;color:#555;line-height:1.7;margin-bottom:20px;white-space:pre-wrap;">${opts.notes.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
          ` : ""}
          <p style="margin:0 0 8px;font-size:13px;color:#888;line-height:1.6;">
            Please reference PO number <strong>${opts.poNumber}</strong> on all invoices, packing slips, and shipments.
            Questions? Reply to this email or contact Chad at <strong>+1 (833) 518-4811</strong>.
          </p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
          <p style="margin:0;font-size:12px;color:#aaa;text-align:center;">
            Kitchens Plus Upstate · Spartanburg, SC · chad@kitchensplusupstate.com
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#2E2F2A;padding:20px 40px;text-align:center;border-radius:0 0 12px 12px;">
          <p style="margin:0;font-size:12px;color:#888;">© ${new Date().getFullYear()} Kitchens Plus Upstate. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Purchase Order ${opts.poNumber}\n\nDear ${opts.vendorName},\n\nPO ${opts.poNumber}: ${opts.title}\nProject: ${opts.projectName}\nExpected Delivery: ${deliveryStr}\nTotal: $${opts.total.toFixed(2)}\n\n${opts.notes ? `Notes: ${opts.notes}\n\n` : ""}Please reference PO number ${opts.poNumber} on all invoices and shipments.\n\nKitchens Plus Upstate · +1 (833) 518-4811`;

  try {
    const transporter = createTransporter();
    const mailOptions: nodemailer.SendMailOptions = {
      from: `"Kitchens Plus Upstate" <${GMAIL_FROM_USER}>`,
      replyTo: GMAIL_FROM_USER,
      to: opts.to,
      subject: `Purchase Order ${opts.poNumber} — ${opts.title}`,
      html,
      text,
    };
    if (opts.pdfBuffer) {
      mailOptions.attachments = [{
        filename: `${opts.poNumber}.pdf`,
        content: opts.pdfBuffer,
        contentType: "application/pdf",
      }];
    }
    await transporter.sendMail(mailOptions);
    return { ok: true };
  } catch (err: any) {
    console.error("[Email] Failed to send PO:", err);
    return { ok: false, error: err?.message ?? String(err) };
  }
}

// ─── INVOICE EMAIL ────────────────────────────────────────────────────────────
export interface InvoiceEmailOptions {
  to: string;
  clientName: string;
  invoiceNumber: string;
  invoiceType: string;
  amount: string;
  dueDate?: string;
  notes?: string;
  squarePaymentUrl?: string;
  pdfBuffer?: Buffer;
  proposalTotal?: string;
  totalBilledSoFar?: string;
  documentLinks?: Array<{ filename: string; url: string; mimeType: string; fileSize: number }>;
}

function invoiceBillingLabel(type: string): string {
  const map: Record<string, string> = {
    deposit: "Deposit Invoice",
    progress: "Progress Payment",
    final: "Final Invoice",
    change_order: "Change Order",
    other: "Invoice",
  };
  return map[type] ?? "Invoice";
}

export async function sendInvoiceEmail(opts: InvoiceEmailOptions): Promise<{ ok: boolean; error?: string }> {
  if (!GMAIL_PASS) return { ok: false, error: "GMAIL_APP_PASSWORD not set" };

  const label = invoiceBillingLabel(opts.invoiceType);
  const amountFmt = `$${Number(opts.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  const paymentSection = opts.squarePaymentUrl ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5EDE7;border-radius:8px;padding:24px;margin-bottom:28px;text-align:center;">
      <tr><td>
        <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#2E2F2A;">Pay Online — Secure &amp; Easy</p>
        <p style="margin:0 0 16px;font-size:13px;color:#555;">Pay by card, debit card, or ACH bank transfer:</p>
        <a href="${opts.squarePaymentUrl}" style="display:inline-block;background:#BF9A3B;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 36px;border-radius:50px;">Pay Now — ${amountFmt}</a>
        <p style="margin:12px 0 0;font-size:11px;color:#888;">Powered by Square · 256-bit encrypted · PCI compliant</p>
      </td></tr>
    </table>` : `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5EDE7;border-radius:8px;padding:20px 24px;margin-bottom:28px;text-align:center;">
      <tr><td><p style="margin:0;font-size:14px;color:#2E2F2A;">Please contact us to arrange payment for <strong>${amountFmt}</strong>.</p></td></tr>
    </table>`;

  const proposalSummary = (opts.proposalTotal && Number(opts.proposalTotal) > 0) ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td style="font-size:12px;color:#888;padding:4px 0;">Proposal Total</td>
        <td style="font-size:12px;color:#2E2F2A;text-align:right;font-weight:600;">$${Number(opts.proposalTotal).toLocaleString("en-US",{minimumFractionDigits:2})}</td>
      </tr>
      <tr>
        <td style="font-size:12px;color:#888;padding:4px 0;">Previously Billed</td>
        <td style="font-size:12px;color:#2E2F2A;text-align:right;">$${Number(opts.totalBilledSoFar??0).toLocaleString("en-US",{minimumFractionDigits:2})}</td>
      </tr>
      <tr style="border-top:1px solid #eee;">
        <td style="font-size:13px;color:#2E2F2A;padding:8px 0 0;font-weight:700;">This Invoice</td>
        <td style="font-size:13px;color:#BF9A3B;text-align:right;padding:8px 0 0;font-weight:700;">${amountFmt}</td>
      </tr>
    </table>` : "";

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#F5EDE7;font-family:'Poppins',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5EDE7;padding:40px 20px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <tr><td style="background:#2E2F2A;padding:36px 40px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;font-family:Georgia,serif;font-size:28px;color:#BF9A3B;letter-spacing:1px;">Kitchens Plus Upstate</h1>
        <p style="margin:6px 0 0;color:#F5EDE7;font-size:13px;letter-spacing:2px;text-transform:uppercase;">Renovations &amp; Design</p>
      </td></tr>
      <tr><td style="background:#ffffff;padding:40px;">
        <p style="margin:0 0 4px;font-size:16px;color:#2E2F2A;">Dear ${opts.clientName},</p>
        <h2 style="margin:0 0 4px;font-size:20px;color:#2E2F2A;">${label}</h2>
        <p style="margin:0 0 24px;font-size:13px;color:#888;">Invoice #${opts.invoiceNumber}${opts.dueDate ? ` &nbsp;·&nbsp; Due ${opts.dueDate}` : ""}</p>
        ${proposalSummary}
        ${paymentSection}
        ${opts.notes ? `<div style="font-size:14px;color:#555;line-height:1.6;background:#fffbf5;border-left:3px solid #BF9A3B;padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:24px;">${opts.notes.replace(/\n/g,"<br/>")}</div>` : ""}
        ${opts.documentLinks && opts.documentLinks.length > 0 ? `
        <div style="background:#f9f9f9;border:1px solid #eee;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
          <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#2E2F2A;">Attached Documents &amp; Drawings (${opts.documentLinks.length})</p>
          ${opts.documentLinks.map(d => {
            const sizeStr = d.fileSize < 1024*1024 ? `${(d.fileSize/1024).toFixed(1)} KB` : `${(d.fileSize/(1024*1024)).toFixed(1)} MB`;
            return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #eee;">
              <a href="${d.url}" target="_blank" style="color:#BF9A3B;font-size:13px;text-decoration:none;font-weight:600;flex:1;">${d.filename}</a>
              <span style="font-size:11px;color:#aaa;white-space:nowrap;">${sizeStr}</span>
            </div>`;
          }).join('')}
        </div>` : ""}
        <p style="margin:0 0 8px;font-size:14px;color:#555;line-height:1.6;">A PDF copy of this invoice is attached for your records. If you have any questions, please reply to this email or call <strong>+1 (833) 518-4811</strong>.</p>
        <p style="margin:16px 0 0;font-size:13px;color:#BF9A3B;font-weight:700;">— Chad &amp; the KP Team</p>
        <hr style="border:none;border-top:1px solid #eee;margin:28px 0;"/>
        <p style="margin:0;font-size:12px;color:#aaa;text-align:center;">Kitchens Plus Upstate · Upstate South Carolina<br/><a href="https://kitchensplusupstate.com" style="color:#BF9A3B;text-decoration:none;">kitchensplusupstate.com</a></p>
      </td></tr>
      <tr><td style="background:#2E2F2A;padding:20px 40px;text-align:center;border-radius:0 0 12px 12px;">
        <p style="margin:0;font-size:12px;color:#888;">© ${new Date().getFullYear()} Kitchens Plus Upstate. All rights reserved.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const mailOptions: nodemailer.SendMailOptions = {
    from: `"Chad Price — Kitchens Plus Upstate" <${GMAIL_FROM_USER}>`,
    replyTo: GMAIL_FROM_USER,
    to: opts.to,
    subject: `${label} #${opts.invoiceNumber} — Kitchens Plus Upstate`,
    html,
    attachments: opts.pdfBuffer
      ? [{ filename: `Invoice-KP-${opts.invoiceNumber}.pdf`, content: opts.pdfBuffer, contentType: "application/pdf" }]
      : [],
  };

  try {
    const transporter = createTransporter();
    await transporter.sendMail(mailOptions);
    return { ok: true };
  } catch (err: any) {
    console.error("[Email] Failed to send invoice:", err);
    return { ok: false, error: err?.message ?? String(err) };
  }
}

// ─── Invoice Follow-Up Email ──────────────────────────────────────────────────
export async function sendInvoiceFollowUpEmail(opts: {
  to: string;
  clientName: string;
  invoiceNumber: string;
  amount: string;
  squarePaymentUrl?: string;
  followUpNumber: number;
}): Promise<{ ok: boolean; error?: string }> {
  if (!GMAIL_PASS) return { ok: false, error: "GMAIL_APP_PASSWORD not set" };

  const fmt = (v: string) =>
    `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const ordinal =
    opts.followUpNumber === 1 ? "1st"
    : opts.followUpNumber === 2 ? "2nd"
    : opts.followUpNumber === 3 ? "3rd"
    : `${opts.followUpNumber}th`;

  const payBtn = opts.squarePaymentUrl
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0"><tr><td align="center">
        <a href="${opts.squarePaymentUrl}" style="display:inline-block;background:#BF9A3B;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 40px;border-radius:50px;">
          Pay Now — ${fmt(opts.amount)}
        </a>
       </td></tr></table>`
    : "";

  const html = `<!DOCTYPE html><html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <tr><td style="background:#fff;border-bottom:3px solid #BF9A3B;padding:28px 40px;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;font-size:22px;color:#2E2F2A;">Kitchens Plus Upstate</h1>
        <p style="margin:4px 0 0;color:#888;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Renovations &amp; Design</p>
      </td></tr>
      <tr><td style="background:#fff;padding:36px 40px;">
        <p style="color:#2E2F2A;font-size:16px;margin:0 0 16px;">Hi ${opts.clientName.split(" ")[0]},</p>
        <p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 16px;">
          This is a friendly <strong>${ordinal} reminder</strong> that <strong>Invoice #${opts.invoiceNumber}</strong>
          for <strong>${fmt(opts.amount)}</strong> is still outstanding. All invoices from Kitchens Plus Upstate are due upon receipt.
        </p>
        ${payBtn}
        <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px;">
          If you have already submitted payment, please disregard this message. If you have questions or need to discuss payment arrangements, please call us at <strong>+1 (833) 518-4811</strong> or reply to this email.
        </p>
        <p style="color:#555;font-size:14px;margin:24px 0 0;">Thank you,<br/><strong>Chad Price</strong><br/>Kitchens Plus Upstate</p>
      </td></tr>
      <tr><td style="background:#f9f9f9;border-top:1px solid #eee;padding:16px 40px;text-align:center;border-radius:0 0 12px 12px;">
        <p style="margin:0;color:#aaa;font-size:11px;">Kitchens Plus Upstate · chad@kitchensplusupstate.com · +1 (833) 518-4811</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"Chad Price — Kitchens Plus Upstate" <${GMAIL_FROM_USER}>`,
      replyTo: GMAIL_FROM_USER,
      to: opts.to,
      subject: `${ordinal} Reminder: Invoice #${opts.invoiceNumber} — ${fmt(opts.amount)} Due`,
      html,
    });
    return { ok: true };
  } catch (err: any) {
    console.error("[Email] Failed to send follow-up:", err);
    return { ok: false, error: err?.message ?? String(err) };
  }
}

// ─── PO Request Email (step 1: request pricing from vendor) ──────────────────
export interface PoRequestEmailOptions {
  to: string;
  vendorName: string;
  poNumber: string;
  projectName: string;
  title: string;
  notes?: string;
  replyEmail: string;
  lineItems: Array<{
    itemTitle?: string;
    description: string;
    quantity: number;
    unit?: string;
  }>;
}

export async function sendPoRequestEmail(opts: PoRequestEmailOptions): Promise<{ ok: boolean; error?: string }> {
  if (!GMAIL_PASS) return { ok: false, error: "GMAIL_APP_PASSWORD not set" };

  const itemRows = opts.lineItems.map((li, i) => `
    <tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:10px 12px;font-size:13px;color:#111827;vertical-align:top;">
        ${i + 1}. ${li.itemTitle ? `<strong>${li.itemTitle}</strong><br><span style="color:#6b7280;font-size:12px;">` : ""}${li.description}${li.itemTitle ? "</span>" : ""}
      </td>
      <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:center;white-space:nowrap;">
        ${li.quantity} ${li.unit ?? ""}
      </td>
      <td style="padding:10px 12px;font-size:13px;color:#6b7280;text-align:right;font-style:italic;">
        Please quote
      </td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <tr><td style="background:#1a1a18;padding:28px 32px;">
        <p style="margin:0;font-size:11px;color:#BF9A3B;letter-spacing:2px;text-transform:uppercase;">Kitchens Plus Upstate</p>
        <h1 style="margin:6px 0 0;font-size:22px;color:#ffffff;font-weight:600;">Pricing Request</h1>
        <p style="margin:4px 0 0;font-size:13px;color:#9ca3af;">Request #${opts.poNumber}</p>
      </td></tr>
      <tr><td style="padding:28px 32px 0;">
        <p style="margin:0;font-size:15px;color:#111827;">Hello <strong>${opts.vendorName}</strong>,</p>
        <p style="margin:12px 0 0;font-size:14px;color:#374151;line-height:1.6;">
          We are requesting pricing for the following items for the project <strong>${opts.projectName}</strong>.
          Please review the scope below and reply with your best pricing for each line item.
        </p>
      </td></tr>
      <tr><td style="padding:24px 32px 0;">
        <p style="margin:0 0 10px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Items Requiring Pricing</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Item / Description</th>
              <th style="padding:10px 12px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Qty / Unit</th>
              <th style="padding:10px 12px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Your Price</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
      </td></tr>
      ${opts.notes ? `<tr><td style="padding:20px 32px 0;">
        <p style="margin:0 0 6px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Additional Notes</p>
        <p style="margin:0;font-size:14px;color:#374151;background:#f9fafb;border-left:3px solid #BF9A3B;padding:12px 16px;border-radius:0 4px 4px 0;">${opts.notes}</p>
      </td></tr>` : ""}
      <tr><td style="padding:24px 32px;">
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:16px 20px;">
          <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#92400e;">How to Respond</p>
          <p style="margin:0;font-size:13px;color:#78350f;line-height:1.6;">
            Please reply to this email at <a href="mailto:${opts.replyEmail}" style="color:#BF9A3B;">${opts.replyEmail}</a> with your pricing for each line item.
            Once we receive your quote, we will review and issue a formal Purchase Order.
          </p>
        </div>
      </td></tr>
      <tr><td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
          Kitchens Plus Upstate &nbsp;|&nbsp; Request #${opts.poNumber} &nbsp;|&nbsp; ${opts.projectName}
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"Chad Price — Kitchens Plus Upstate" <${GMAIL_FROM_USER}>`,
      replyTo: opts.replyEmail,
      to: opts.to,
      subject: `Pricing Request #${opts.poNumber} — ${opts.title} (${opts.projectName})`,
      html,
    });
    return { ok: true };
  } catch (err: any) {
    console.error("[Email] Failed to send PO request:", err);
    return { ok: false, error: err?.message ?? String(err) };
  }
}

export async function sendCrewNotificationEmail({ to, subject, message }: { to: string; subject: string; message: string }) {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"Kitchens Plus Upstate" <${GMAIL_FROM_USER}>`,
    to,
    subject,
    text: message,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#fff;border:1px solid #eee;border-radius:8px;">
      <h2 style="color:#2E2F2A;font-size:16px;margin-bottom:12px;">Kitchens Plus Upstate</h2>
      <p style="color:#333;font-size:15px;line-height:1.6;">${message}</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
      <p style="color:#999;font-size:11px;text-align:center;">Kitchens Plus Upstate — Crew Notification</p>
    </div>`,
  });
  return { ok: true };
}

// ─── Signed Proposal Email ─────────────────────────────────────────────────
export async function sendSignedProposalEmail(opts: {
  toEmail: string;
  toName: string;
  proposalNumber: string;
  proposalTitle: string;
  totalAmount: number;
  signedAt: Date;
  signedPdfBuffer: Buffer;
}): Promise<{ ok: boolean; error?: string }> {
  if (!GMAIL_PASS) return { ok: false, error: "GMAIL_APP_PASSWORD not set" };
  if (!opts.toEmail) return { ok: false, error: "No recipient email" };

  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(opts.totalAmount);
  const signedDateStr = opts.signedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#F5EDE7;font-family:'Poppins',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5EDE7;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:#2E2F2A;padding:36px 40px;text-align:center;border-radius:12px 12px 0 0;">
          <h1 style="margin:0;font-family:Georgia,serif;font-size:28px;color:#BF9A3B;letter-spacing:1px;">Kitchens Plus Upstate</h1>
          <p style="margin:6px 0 0;color:#F5EDE7;font-size:13px;letter-spacing:2px;text-transform:uppercase;">Renovations &amp; Design</p>
        </td></tr>
        <tr><td style="background:#ffffff;padding:40px;">
          <p style="margin:0 0 8px;font-size:16px;color:#2E2F2A;">Dear ${opts.toName},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">
            Thank you for signing your proposal! Your signed copy is attached to this email for your records.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5EDE7;border-radius:8px;padding:24px;margin-bottom:28px;">
            <tr><td>
              <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Proposal</p>
              <p style="margin:0 0 12px;font-size:20px;font-weight:700;color:#2E2F2A;">${opts.proposalTitle}</p>
              <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Reference</p>
              <p style="margin:0 0 12px;font-size:14px;color:#2E2F2A;">${opts.proposalNumber}</p>
              <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Total Investment</p>
              <p style="margin:0 0 12px;font-size:28px;font-weight:700;color:#BF9A3B;">${fmt}</p>
              <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Signed On</p>
              <p style="margin:0;font-size:14px;color:#2E2F2A;">${signedDateStr}</p>
            </td></tr>
          </table>
          <div style="background:#4CAF7D15;border:1px solid #4CAF7D40;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
            <p style="margin:0;font-size:14px;color:#2E2F2A;font-weight:600;">✅ Proposal Approved &amp; Signed</p>
            <p style="margin:6px 0 0;font-size:13px;color:#555;line-height:1.5;">
              Chad will be in touch within 1 business day to confirm next steps and send your deposit invoice.
            </p>
          </div>
          <p style="margin:0 0 8px;font-size:14px;color:#555;">Questions? Contact us anytime:</p>
          <p style="margin:0 0 24px;font-size:14px;color:#555;">
            📞 <a href="tel:18335184811" style="color:#BF9A3B;text-decoration:none;">+1 (833) 518-4811</a> &nbsp;|&nbsp;
            ✉️ <a href="mailto:chad@kitchensplusupstate.com" style="color:#BF9A3B;text-decoration:none;">chad@kitchensplusupstate.com</a>
          </p>
          <hr style="border:none;border-top:1px solid #eee;margin:28px 0;" />
          <p style="margin:0;font-size:13px;color:#888;text-align:center;">
            Kitchens Plus Upstate · Upstate South Carolina<br/>
            <a href="https://kitchensplusupstate.com" style="color:#BF9A3B;text-decoration:none;">kitchensplusupstate.com</a>
          </p>
        </td></tr>
        <tr><td style="background:#2E2F2A;padding:20px 40px;text-align:center;border-radius:0 0 12px 12px;">
          <p style="margin:0;font-size:12px;color:#888;">© ${new Date().getFullYear()} Kitchens Plus Upstate. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Dear ${opts.toName},\n\nThank you for signing your proposal! Your signed copy is attached.\n\nProposal: ${opts.proposalTitle}\nReference: ${opts.proposalNumber}\nTotal: ${fmt}\nSigned: ${signedDateStr}\n\nChad will be in touch within 1 business day.\n\nQuestions? Call +1 (833) 518-4811 or email chad@kitchensplusupstate.com\n\nKitchens Plus Upstate`;

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"Chad Price — Kitchens Plus Upstate" <${GMAIL_FROM_USER}>`,
      replyTo: GMAIL_FROM_USER,
      to: `"${opts.toName}" <${opts.toEmail}>`,
      subject: `Signed Proposal — ${opts.proposalTitle} (${opts.proposalNumber})`,
      html,
      text,
      attachments: [
        {
          filename: `Signed-Proposal-${opts.proposalNumber}.pdf`,
          content: opts.signedPdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
    return { ok: true };
  } catch (err: any) {
    console.error("[Email] Failed to send signed proposal:", err);
    return { ok: false, error: err?.message ?? String(err) };
  }
}

// ── Signed Contract Confirmation Email ────────────────────────────────────────
export async function sendSignedContractEmail(opts: {
  toEmail: string;
  toName: string;
  invoiceNumber: string;
  invoiceAmount: number;
  projectTitle?: string | null;
  signedAt: Date;
  signedPdfBuffer: Buffer;
}): Promise<{ ok: boolean; error?: string }> {
  if (!GMAIL_PASS) return { ok: false, error: "GMAIL_APP_PASSWORD not set" };
  if (!opts.toEmail) return { ok: false, error: "No recipient email" };

  const fmtAmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(opts.invoiceAmount);
  const signedDateStr = opts.signedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const firstName = opts.toName.split(" ")[0];

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#F5EDE7;font-family:'Poppins',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5EDE7;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:#2E2F2A;padding:36px 40px;text-align:center;border-radius:12px 12px 0 0;">
          <h1 style="margin:0;font-family:Georgia,serif;font-size:28px;color:#BF9A3B;letter-spacing:1px;">Kitchens Plus Upstate</h1>
          <p style="margin:6px 0 0;color:#F5EDE7;font-size:13px;letter-spacing:2px;text-transform:uppercase;">Renovations &amp; Design</p>
        </td></tr>
        <tr><td style="background:#ffffff;padding:40px;">
          <p style="margin:0 0 8px;font-size:16px;color:#2E2F2A;">Dear ${firstName},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">
            Thank you for signing your project contract! Your signed copy is attached to this email for your records.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5EDE7;border-radius:8px;padding:24px;margin-bottom:28px;">
            <tr><td>
              ${opts.projectTitle ? `
              <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Project</p>
              <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#2E2F2A;">${opts.projectTitle}</p>` : ""}
              <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Invoice Reference</p>
              <p style="margin:0 0 12px;font-size:14px;color:#2E2F2A;">#${opts.invoiceNumber}</p>
              <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Deposit Amount</p>
              <p style="margin:0 0 12px;font-size:28px;font-weight:700;color:#BF9A3B;">${fmtAmt}</p>
              <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Signed On</p>
              <p style="margin:0;font-size:14px;color:#2E2F2A;">${signedDateStr}</p>
            </td></tr>
          </table>
          <div style="background:#4CAF7D15;border:1px solid #4CAF7D40;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
            <p style="margin:0;font-size:14px;color:#2E2F2A;font-weight:600;">✅ Contract Signed &amp; Confirmed</p>
            <p style="margin:6px 0 0;font-size:13px;color:#555;line-height:1.5;">
              Your signed contract is legally binding under the E-SIGN Act and UETA. Chad will be in touch shortly to confirm your project start date and next steps.
            </p>
          </div>
          <p style="margin:0 0 8px;font-size:14px;color:#555;">Questions? Contact us anytime:</p>
          <p style="margin:0 0 24px;font-size:14px;color:#555;">
            📞 <a href="tel:18335184811" style="color:#BF9A3B;text-decoration:none;">+1 (833) 518-4811</a> &nbsp;|&nbsp;
            ✉️ <a href="mailto:chad@kitchensplusupstate.com" style="color:#BF9A3B;text-decoration:none;">chad@kitchensplusupstate.com</a>
          </p>
          <hr style="border:none;border-top:1px solid #eee;margin:28px 0;" />
          <p style="margin:0;font-size:13px;color:#888;text-align:center;">
            Kitchens Plus Upstate · Upstate South Carolina<br/>
            <a href="https://kitchensplusupstate.com" style="color:#BF9A3B;text-decoration:none;">kitchensplusupstate.com</a>
          </p>
        </td></tr>
        <tr><td style="background:#2E2F2A;padding:20px 40px;text-align:center;border-radius:0 0 12px 12px;">
          <p style="margin:0;font-size:12px;color:#888;">© ${new Date().getFullYear()} Kitchens Plus Upstate. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Dear ${firstName},\n\nThank you for signing your project contract! Your signed copy is attached.\n\nInvoice: #${opts.invoiceNumber}\nDeposit: ${fmtAmt}\nSigned: ${signedDateStr}\n\nChad will be in touch shortly to confirm your project start date.\n\nQuestions? Call +1 (833) 518-4811 or email chad@kitchensplusupstate.com\n\nKitchens Plus Upstate`;

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"Chad Price — Kitchens Plus Upstate" <${GMAIL_FROM_USER}>`,
      replyTo: GMAIL_FROM_USER,
      to: `"${opts.toName}" <${opts.toEmail}>`,
      subject: `Signed Contract — Invoice #${opts.invoiceNumber}`,
      html,
      text,
      attachments: [
        {
          filename: `Signed-Contract-Invoice-${opts.invoiceNumber}.pdf`,
          content: opts.signedPdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
    return { ok: true };
  } catch (err: any) {
    console.error("[Email] Failed to send signed contract:", err);
    return { ok: false, error: err?.message ?? String(err) };
  }
}

// ─── Proposal Approved (Contractor Verbal Approval) Email ────────────────────
export interface ProposalApprovedEmailOptions {
  toEmail: string;
  toName: string;
  proposalNumber: string;
  proposalTitle: string;
  totalAmount: number;
  approvedAt: Date;
  portalUrl: string;
}

export async function sendProposalApprovedEmail(opts: ProposalApprovedEmailOptions): Promise<{ ok: boolean; error?: string }> {
  const transporter = createTransporter();
  if (!GMAIL_PASS) return { ok: false, error: "GMAIL_APP_PASSWORD not set" };

  const fmtDate = opts.approvedAt.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/New_York",
  });
  const fmtTotal = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(opts.totalAmount);

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Project Approved</title></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1A1B17;border-radius:12px;overflow:hidden;max-width:600px;">
        <tr>
          <td style="background:linear-gradient(135deg,#1A1B17 0%,#2A2B25 100%);padding:40px 48px 32px;border-bottom:2px solid #D4A853;">
            <p style="margin:0 0 8px;font-size:11px;letter-spacing:3px;color:#D4A853;text-transform:uppercase;font-family:Arial,sans-serif;">Kitchens Plus Upstate</p>
            <h1 style="margin:0;font-size:28px;color:#F5F0E8;font-weight:normal;line-height:1.2;">Your Project is Approved!</h1>
            <p style="margin:8px 0 0;font-size:14px;color:#9A9A8A;font-family:Arial,sans-serif;">We're excited to move forward with your renovation.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 48px;">
            <p style="margin:0 0 20px;font-size:16px;color:#E8E4DC;line-height:1.6;">Dear ${opts.toName},</p>
            <p style="margin:0 0 24px;font-size:15px;color:#C8C4BC;line-height:1.7;font-family:Arial,sans-serif;">
              Great news — your proposal has been approved and your project is officially moving forward with Kitchens Plus Upstate! We look forward to bringing your vision to life.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#2A2B25;border-radius:10px;border:1px solid #D4A85340;margin-bottom:28px;">
              <tr><td style="padding:24px 28px;">
                <p style="margin:0 0 16px;font-size:10px;letter-spacing:2px;color:#D4A853;text-transform:uppercase;font-family:Arial,sans-serif;">Approval Details</p>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#9A9A8A;font-family:Arial,sans-serif;width:40%;">Proposal</td>
                    <td style="padding:6px 0;font-size:13px;color:#E8E4DC;font-family:Arial,sans-serif;">${opts.proposalNumber}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#9A9A8A;font-family:Arial,sans-serif;">Project</td>
                    <td style="padding:6px 0;font-size:13px;color:#E8E4DC;font-family:Arial,sans-serif;">${opts.proposalTitle}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#9A9A8A;font-family:Arial,sans-serif;">Approved On</td>
                    <td style="padding:6px 0;font-size:13px;color:#E8E4DC;font-family:Arial,sans-serif;">${fmtDate}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#9A9A8A;font-family:Arial,sans-serif;">Total</td>
                    <td style="padding:6px 0;font-size:16px;color:#D4A853;font-family:Arial,sans-serif;font-weight:bold;">${fmtTotal}</td>
                  </tr>
                </table>
              </td></tr>
            </table>
            <p style="margin:0 0 24px;font-size:15px;color:#C8C4BC;line-height:1.7;font-family:Arial,sans-serif;">
              Our team will be reaching out shortly to schedule your project kickoff and discuss next steps. In the meantime, you can view your project details and track progress through your client portal.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
              <tr>
                <td style="background:#D4A853;border-radius:8px;padding:14px 32px;">
                  <a href="${opts.portalUrl}" style="color:#1A1B17;text-decoration:none;font-size:15px;font-weight:bold;font-family:Arial,sans-serif;letter-spacing:0.5px;">View Your Project Portal →</a>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:14px;color:#C8C4BC;line-height:1.6;font-family:Arial,sans-serif;">
              Thank you for choosing Kitchens Plus Upstate. We're committed to delivering exceptional craftsmanship and a seamless renovation experience.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 48px;border-top:1px solid #2A2B25;background:#111210;">
            <p style="margin:0 0 4px;font-size:13px;color:#D4A853;font-family:Arial,sans-serif;font-weight:bold;">Chad Price — Kitchens Plus Upstate</p>
            <p style="margin:0;font-size:12px;color:#6A6A5A;font-family:Arial,sans-serif;">+1 (833) 518-4811 · Upstate South Carolina</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Hi ${opts.toName},\n\nGreat news — your proposal has been approved and your project is officially moving forward!\n\nProposal: ${opts.proposalNumber}\nProject: ${opts.proposalTitle}\nApproved: ${fmtDate}\nTotal: ${fmtTotal}\n\nView your project portal: ${opts.portalUrl}\n\nThank you for choosing Kitchens Plus Upstate!\n\nChad Price\n+1 (833) 518-4811`;

  try {
    await transporter.sendMail({
      from: `"Chad Price — Kitchens Plus Upstate" <${GMAIL_FROM_USER}>`,
      replyTo: GMAIL_FROM_USER,
      to: `"${opts.toName}" <${opts.toEmail}>`,
      subject: `Your Project is Approved — ${opts.proposalTitle}`,
      html,
      text,
    });
    return { ok: true };
  } catch (err: any) {
    console.error("[Email] Failed to send proposal approved email:", err);
    return { ok: false, error: err?.message ?? String(err) };
  }
}

// ─── PAYMENT RECEIPT EMAIL ────────────────────────────────────────────────────
export interface PaymentReceiptEmailOptions {
  to: string;
  clientName: string;
  invoiceNumber: string;
  invoiceType: string;
  amountReceived: number;
  balance: number;
  paidDate?: string;
  method?: string;
  projectName?: string;
  portalUrl?: string;
  pdfBuffer?: Buffer;
  ccEmail?: string;
}

export async function sendPaymentReceiptEmail(opts: PaymentReceiptEmailOptions): Promise<{ ok: boolean; error?: string }> {
  if (!GMAIL_PASS) return { ok: false, error: "GMAIL_APP_PASSWORD not set" };
  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const methodLabel: Record<string, string> = { check: "Check", cash: "Cash", square: "Card / Square", ach: "ACH / Bank Transfer", other: "Other" };
  const methodStr = opts.method ? (methodLabel[opts.method] ?? opts.method) : "Payment";
  const billingLabel: Record<string, string> = { deposit: "Deposit", progress: "Progress Payment", final: "Final Payment", change_order: "Change Order", other: "Invoice" };
  const invoiceLabel = billingLabel[opts.invoiceType] ?? "Invoice";
  const balanceSection = opts.balance > 0
    ? `<tr style="border-top:1px solid #eee;"><td style="padding:8px 0 0;font-size:13px;color:#555;">Remaining Balance</td><td style="padding:8px 0 0;font-size:13px;color:#E05252;text-align:right;font-weight:700;">${fmt(opts.balance)}</td></tr>`
    : `<tr style="border-top:1px solid #eee;"><td style="padding:8px 0 0;font-size:13px;color:#4CAF7D;font-weight:700;">Invoice Paid in Full</td><td style="padding:8px 0 0;font-size:13px;color:#4CAF7D;text-align:right;font-weight:700;">&#10003;</td></tr>`;
  const portalSection = opts.portalUrl
    ? `<div style="text-align:center;margin:24px 0;"><a href="${opts.portalUrl}" style="display:inline-block;background:#BF9A3B;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 32px;border-radius:50px;">View Your Project Portal</a></div>`
    : "";
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:0;background:#F5EDE7;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#F5EDE7;padding:40px 20px;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;"><tr><td style="background:#2E2F2A;padding:36px 40px;text-align:center;border-radius:12px 12px 0 0;"><h1 style="margin:0;font-family:Georgia,serif;font-size:28px;color:#BF9A3B;">Kitchens Plus Upstate</h1><p style="margin:6px 0 0;color:#F5EDE7;font-size:13px;text-transform:uppercase;">Payment Received</p></td></tr><tr><td style="background:#ffffff;padding:40px;"><p style="margin:0 0 4px;font-size:16px;color:#2E2F2A;">Dear ${opts.clientName},</p><p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.6;">Thank you &#8212; we have received your payment. Here is a summary for your records.</p><table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr><td style="font-size:12px;color:#888;padding:4px 0;">Invoice</td><td style="font-size:12px;color:#2E2F2A;text-align:right;">#${opts.invoiceNumber} &middot; ${invoiceLabel}</td></tr>${opts.projectName ? `<tr><td style="font-size:12px;color:#888;padding:4px 0;">Project</td><td style="font-size:12px;color:#2E2F2A;text-align:right;">${opts.projectName}</td></tr>` : ""}<tr><td style="font-size:12px;color:#888;padding:4px 0;">Method</td><td style="font-size:12px;color:#2E2F2A;text-align:right;">${methodStr}</td></tr>${opts.paidDate ? `<tr><td style="font-size:12px;color:#888;padding:4px 0;">Date</td><td style="font-size:12px;color:#2E2F2A;text-align:right;">${opts.paidDate}</td></tr>` : ""}<tr style="border-top:1px solid #eee;"><td style="font-size:14px;color:#2E2F2A;padding:8px 0 0;font-weight:700;">Amount Received</td><td style="font-size:14px;color:#BF9A3B;text-align:right;padding:8px 0 0;font-weight:700;">${fmt(opts.amountReceived)}</td></tr>${balanceSection}</table>${portalSection}<p style="font-size:13px;color:#888;line-height:1.6;margin:0;">If you have any questions, please don't hesitate to reach out. We appreciate your trust in Kitchens Plus Upstate.</p></td></tr><tr><td style="background:#2E2F2A;padding:24px 40px;text-align:center;border-radius:0 0 12px 12px;"><p style="margin:0 0 4px;font-size:13px;color:#BF9A3B;font-weight:bold;">Chad Price &#8212; Kitchens Plus Upstate</p><p style="margin:0;font-size:12px;color:#9A9589;">+1 (833) 518-4811 &middot; Upstate South Carolina</p></td></tr></table></td></tr></table></body></html>`;
  const text = `Dear ${opts.clientName},\n\nThank you \u2014 we have received your payment.\n\nInvoice: #${opts.invoiceNumber} (${invoiceLabel})\nAmount Received: ${fmt(opts.amountReceived)}\n${opts.balance > 0 ? `Remaining Balance: ${fmt(opts.balance)}` : "Invoice Paid in Full"}\n\n${opts.portalUrl ? `View your project portal: ${opts.portalUrl}\n\n` : ""}Chad Price\n+1 (833) 518-4811`;
  const attachments: any[] = [];
  if (opts.pdfBuffer) attachments.push({ filename: `Receipt-${opts.invoiceNumber}.pdf`, content: opts.pdfBuffer, contentType: "application/pdf" });
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"Chad Price \u2014 Kitchens Plus Upstate" <${GMAIL_FROM_USER}>`,
      replyTo: GMAIL_FROM_USER,
      to: `"${opts.clientName}" <${opts.to}>`,
      ...(opts.ccEmail ? { cc: opts.ccEmail } : {}),
      subject: `Payment Received \u2014 ${invoiceLabel} #${opts.invoiceNumber}`,
      html, text, attachments,
    });
    return { ok: true };
  } catch (err: any) {
    console.error("[Email] Failed to send payment receipt email:", err);
    return { ok: false, error: err?.message ?? String(err) };
  }
}

// ─── CLIENT DASHBOARD WELCOME EMAIL ──────────────────────────────────────────
// Sent alongside the proposal email so the client has a keepable reference
// with their dashboard link, company info, and a warm welcome.
export interface DashboardWelcomeEmailOptions {
  toEmail: string;
  toName: string;
  portalUrl: string;
  /** Optional CC address */
  ccEmail?: string;
}

export async function sendDashboardWelcomeEmail(opts: DashboardWelcomeEmailOptions): Promise<{ ok: boolean; error?: string }> {
  if (!GMAIL_PASS) return { ok: false, error: "GMAIL_APP_PASSWORD not set" };

  const firstName = opts.toName.split(" ")[0];

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#F5EDE7;font-family:'Poppins',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5EDE7;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#2E2F2A;padding:36px 40px;text-align:center;border-radius:12px 12px 0 0;">
          <h1 style="margin:0;font-family:Georgia,serif;font-size:28px;color:#BF9A3B;letter-spacing:1px;">Kitchens Plus Upstate</h1>
          <p style="margin:6px 0 0;color:#F5EDE7;font-size:13px;letter-spacing:2px;text-transform:uppercase;">Renovations &amp; Design</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:40px;">
          <p style="margin:0 0 8px;font-size:16px;color:#2E2F2A;">Welcome, ${firstName}!</p>
          <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">
            Thank you for choosing <strong>Kitchens Plus Upstate</strong>. We've set up a personal client dashboard for you where you can view proposals, track your project, review invoices, share inspiration, and communicate with our team — all in one place.
          </p>

          <!-- Dashboard Info Card -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5EDE7;border-radius:8px;padding:24px;margin-bottom:28px;">
            <tr><td>
              <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Your Dashboard</p>
              <p style="margin:0 0 16px;font-size:14px;color:#2E2F2A;">Bookmark this link — it's your personal portal to everything related to your project.</p>
              <p style="margin:0 0 16px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Your Email</p>
              <p style="margin:0 0 16px;font-size:14px;color:#2E2F2A;font-weight:600;">${opts.toEmail}</p>
              <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Our Website</p>
              <p style="margin:0;font-size:14px;"><a href="https://kitchensplusupstate.com" style="color:#BF9A3B;text-decoration:none;font-weight:600;">kitchensplusupstate.com</a></p>
            </td></tr>
          </table>

          <!-- CTA Button -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td align="center">
              <a href="${opts.portalUrl}" style="display:inline-block;background:#BF9A3B;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 36px;border-radius:50px;letter-spacing:0.5px;">
                Open Your Dashboard
              </a>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;font-size:14px;color:#555;line-height:1.6;">
            <strong>What you can do from your dashboard:</strong>
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td style="padding:4px 0;font-size:14px;color:#555;">&#10003; &nbsp;View and respond to proposals</td></tr>
            <tr><td style="padding:4px 0;font-size:14px;color:#555;">&#10003; &nbsp;Track project progress and milestones</td></tr>
            <tr><td style="padding:4px 0;font-size:14px;color:#555;">&#10003; &nbsp;Review and pay invoices securely</td></tr>
            <tr><td style="padding:4px 0;font-size:14px;color:#555;">&#10003; &nbsp;Share inspiration photos and ideas</td></tr>
            <tr><td style="padding:4px 0;font-size:14px;color:#555;">&#10003; &nbsp;Message our team directly</td></tr>
            <tr><td style="padding:4px 0;font-size:14px;color:#555;">&#10003; &nbsp;Access documents, contracts, and photos</td></tr>
          </table>

          <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.6;">
            Keep this email for your records — you can always return to your dashboard using the link above. If you have any questions, reply to this email or call us at <strong>+1 (833) 518-4811</strong>.
          </p>

          <hr style="border:none;border-top:1px solid #eee;margin:28px 0;" />
          <p style="margin:0;font-size:13px;color:#888;text-align:center;">
            Kitchens Plus Upstate · Upstate South Carolina<br/>
            <a href="https://kitchensplusupstate.com" style="color:#BF9A3B;text-decoration:none;">kitchensplusupstate.com</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#2E2F2A;padding:20px 40px;text-align:center;border-radius:0 0 12px 12px;">
          <p style="margin:0;font-size:12px;color:#888;">&copy; ${new Date().getFullYear()} Kitchens Plus Upstate. All rights reserved.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Welcome, ${firstName}!\n\nThank you for choosing Kitchens Plus Upstate. We've set up a personal client dashboard for you.\n\nYour Email: ${opts.toEmail}\nOur Website: https://kitchensplusupstate.com\n\nOpen your dashboard: ${opts.portalUrl}\n\nFrom your dashboard you can:\n- View and respond to proposals\n- Track project progress and milestones\n- Review and pay invoices\n- Share inspiration photos and ideas\n- Message our team\n- Access documents and photos\n\nKeep this email for your records. Questions? Reply here or call +1 (833) 518-4811.\n\nKitchens Plus Upstate\nkitchensplusupstate.com`;

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"Kitchens Plus Upstate" <${GMAIL_FROM_USER}>`,
      replyTo: GMAIL_FROM_USER,
      to: `"${opts.toName}" <${opts.toEmail}>`,
      ...(opts.ccEmail ? { cc: opts.ccEmail } : {}),
      subject: `Your Client Dashboard — Kitchens Plus Upstate`,
      html,
      text,
    });
    return { ok: true };
  } catch (err: any) {
    console.error("[Email] Failed to send dashboard welcome email:", err);
    return { ok: false, error: err?.message ?? String(err) };
  }
}
