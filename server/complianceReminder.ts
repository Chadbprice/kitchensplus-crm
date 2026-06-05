/**
 * Compliance Reminder Scheduler
 * Sends email + SMS alerts to vendors when their compliance docs are expiring
 * Triggers at 30 days, 15 days, and 3 days before expiry
 *
 * ⚠️ INTENTIONAL AUTO-SEND: This scheduler sends directly to vendors/subcontractors
 * without approval queue routing. Rationale: These are vendor-facing operational
 * reminders (not client-facing), and timely compliance alerts protect the business.
 */
import { getDb } from "./db";
import { vendorDocs, vendorContacts, vendors } from "../drizzle/schema";
import { and, between, eq, isNotNull, sql } from "drizzle-orm";
import { createTransporter } from "./email";
import { sendSms } from "./sms";
import { COMPLIANCE_REMINDER_THRESHOLDS_DAYS } from "../shared/operationalConfig";

const DOC_TYPE_LABELS: Record<string, string> = {
  insurance: "General Liability Insurance",
  license: "Contractor License",
  w9: "W-9 Form",
  coi: "Certificate of Insurance",
  workers_comp: "Workers' Compensation",
  other: "Compliance Document",
};

const THRESHOLDS_DAYS = COMPLIANCE_REMINDER_THRESHOLDS_DAYS;

async function sendComplianceAlert(
  vendorName: string,
  contactEmail: string | null,
  contactPhone: string | null,
  docType: string,
  daysLeft: number,
  expiryDate: Date
) {
  const docLabel = DOC_TYPE_LABELS[docType] ?? docType;
  const expiryStr = expiryDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const urgency = daysLeft <= 3 ? "URGENT: " : daysLeft <= 15 ? "Important: " : "";

  if (contactEmail) {
    try {
      const transporter = createTransporter();
      await transporter.sendMail({
        from: '"Kitchens Plus Upstate" <noreply@kitchensplus.com>',
        to: contactEmail,
        subject: `${urgency}${docLabel} Expiring in ${daysLeft} Day${daysLeft === 1 ? "" : "s"} — ${vendorName}`,
        html: `
          <div style="font-family:'Georgia',serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e0d0;border-radius:8px;overflow:hidden;">
            <div style="background:#1a1a1a;padding:24px 32px;">
              <h1 style="color:#c9a96e;margin:0;font-size:20px;letter-spacing:1px;">KITCHENS PLUS UPSTATE</h1>
              <p style="color:#888;margin:4px 0 0;font-size:12px;letter-spacing:2px;">COMPLIANCE NOTICE</p>
            </div>
            <div style="padding:32px;">
              <p style="color:#333;font-size:16px;margin:0 0 16px;">Dear ${vendorName} Team,</p>
              <p style="color:#555;line-height:1.6;margin:0 0 24px;">
                This is a courtesy reminder that your <strong>${docLabel}</strong> is set to expire 
                in <strong style="color:${daysLeft <= 3 ? "#c0392b" : daysLeft <= 15 ? "#e67e22" : "#2c7a4b"};">${daysLeft} day${daysLeft === 1 ? "" : "s"}</strong> 
                on <strong>${expiryStr}</strong>.
              </p>
              <div style="background:#fdf8f0;border-left:4px solid #c9a96e;padding:16px 20px;border-radius:0 4px 4px 0;margin:0 0 24px;">
                <p style="margin:0;color:#333;font-size:14px;">
                  <strong>Document:</strong> ${docLabel}<br>
                  <strong>Expiry Date:</strong> ${expiryStr}<br>
                  <strong>Days Remaining:</strong> ${daysLeft}
                </p>
              </div>
              <p style="color:#555;line-height:1.6;margin:0 0 24px;">
                To maintain your active vendor status with Kitchens Plus Upstate, please upload your renewed document 
                through your vendor portal or contact us directly.
              </p>
              <p style="color:#555;line-height:1.6;margin:0;">
                Questions? Contact us at <a href="tel:8645678777" style="color:#c9a96e;">864-567-8777</a> 
                or reply to this email.
              </p>
            </div>
            <div style="background:#f5f0e8;padding:16px 32px;text-align:center;">
              <p style="color:#999;font-size:12px;margin:0;">Kitchens Plus Upstate · Luxury Renovation Specialists</p>
            </div>
          </div>
        `,
      });
    } catch (err) {
      console.error("[ComplianceReminder] Email failed:", err);
    }
  }

  if (contactPhone) {
    try {
      await sendSms(
        contactPhone,
        `Kitchens Plus Upstate: Your ${docLabel} expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"} (${expiryStr}). Please renew to stay active. Questions? Call Chad at 864-567-8777.`
      );
    } catch (err) {
      console.error("[ComplianceReminder] SMS failed:", err);
    }
  }
}

export async function runComplianceReminders() {
  const db = await getDb();
  if (!db) return;

  const now = new Date();

  for (const days of THRESHOLDS_DAYS) {
    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() + days);
    windowStart.setHours(0, 0, 0, 0);

    const windowEnd = new Date(windowStart);
    windowEnd.setHours(23, 59, 59, 999);

    try {
      // Find all docs expiring in this window
      const expiringDocs = await db
        .select({
          docId: vendorDocs.id,
          vendorId: vendorDocs.vendorId,
          docType: vendorDocs.docType,
          expiryDate: vendorDocs.expiryDate,
          vendorName: vendors.companyName,
        })
        .from(vendorDocs)
        .innerJoin(vendors, eq(vendors.id, vendorDocs.vendorId))
        .where(
          and(
            isNotNull(vendorDocs.expiryDate),
            sql`${vendorDocs.expiryDate} BETWEEN ${windowStart} AND ${windowEnd}`,
            eq(vendorDocs.status, "approved"),
            eq(vendors.isActive, true)
          )
        );

      for (const doc of expiringDocs) {
        // Get primary contact for this vendor
        const contacts = await db
          .select()
          .from(vendorContacts)
          .where(eq(vendorContacts.vendorId, doc.vendorId))
          .limit(1);

        const contact = contacts[0];
        if (!contact && !doc.vendorName) continue;

        await sendComplianceAlert(
          doc.vendorName,
          contact?.email ?? null,
          contact?.phone ?? null,
          doc.docType,
          days,
          doc.expiryDate!
        );

        console.log(
          `[ComplianceReminder] Sent ${days}-day alert for ${doc.vendorName} — ${doc.docType}`
        );
      }
    } catch (err) {
      console.error(`[ComplianceReminder] Error processing ${days}-day window:`, err);
    }
  }
}

export function startComplianceReminderScheduler() {
  // Run once at startup (offset by 2 minutes to avoid startup congestion)
  setTimeout(() => {
    runComplianceReminders().catch(console.error);
  }, 2 * 60 * 1000);

  // Then run every 24 hours
  setInterval(() => {
    runComplianceReminders().catch(console.error);
  }, 24 * 60 * 60 * 1000);

  console.log("[ComplianceReminder] Scheduler started — runs every 24 hours.");
}
