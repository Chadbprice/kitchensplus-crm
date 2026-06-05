/**
 * Branded Email Template — Luxury HTML wrapper for all agent-generated
 * client and subcontractor communications.
 *
 * Uses the same visual language as the proposal/invoice emails:
 * - Dark header/footer (#2E2F2A)
 * - Gold accent (#BF9A3B)
 * - Light background (#F5EDE7)
 * - Georgia/Poppins typography
 * - Consistent contact/footer blocks
 */

const YEAR = new Date().getFullYear();

export interface BrandedEmailOptions {
  /** Recipient first name for greeting */
  recipientName: string;
  /** Email subject line (used in header) */
  subject: string;
  /** Body text — newlines converted to <br> */
  body: string;
  /** Optional CTA button */
  ctaLabel?: string;
  ctaUrl?: string;
  /** Whether this is a subcontractor communication (slightly different footer) */
  isSubcontractor?: boolean;
}

/**
 * Wraps a plain-text draft message in the Kitchens Plus Upstate branded
 * HTML email template. Returns the full HTML string.
 */
export function wrapInBrandedTemplate(opts: BrandedEmailOptions): string {
  const bodyHtml = opts.body.replace(/\n/g, "<br>");

  const ctaBlock = opts.ctaLabel && opts.ctaUrl
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
        <tr><td align="center">
          <a href="${opts.ctaUrl}" style="display:inline-block;background:#BF9A3B;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 36px;border-radius:50px;letter-spacing:0.5px;">
            ${opts.ctaLabel}
          </a>
        </td></tr>
      </table>`
    : "";

  const contactBlock = opts.isSubcontractor
    ? `<p style="margin:0 0 8px;font-size:14px;color:#555;line-height:1.6;">
        If you have any questions, please reply to this email or call Chad directly at <strong>(864) 567-8777</strong>.
      </p>`
    : `<p style="margin:0 0 8px;font-size:14px;color:#555;line-height:1.6;">
        You can reply directly to this email or text us at <strong>+1 (833) 518-4811</strong> — all messages go to our full team. To speak directly with Chad, call <strong>(864) 567-8777</strong>.
      </p>`;

  return `<!DOCTYPE html>
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
          <p style="margin:0 0 24px;font-size:16px;color:#2E2F2A;line-height:1.7;white-space:normal;">
            ${bodyHtml}
          </p>

          ${ctaBlock}

          ${contactBlock}

          <hr style="border:none;border-top:1px solid #eee;margin:28px 0;" />
          <p style="margin:0;font-size:13px;color:#888;text-align:center;">
            Kitchens Plus Upstate &middot; Upstate South Carolina<br/>
            <a href="https://kitchensplusupstate.com" style="color:#BF9A3B;text-decoration:none;">kitchensplusupstate.com</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#2E2F2A;padding:20px 40px;text-align:center;border-radius:0 0 12px 12px;">
          <p style="margin:0;font-size:12px;color:#888;">&copy; ${YEAR} Kitchens Plus Upstate. All rights reserved.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
