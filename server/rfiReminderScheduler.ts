/**
 * RFI Reminder Scheduler
 * Runs every hour. Finds all RFIs in "sent" status where nextReminderAt has passed.
 * Sends reminder email + SMS, increments reminderCount.
 * After 5 reminders, marks the RFI as "expired" and notifies the owner.
 *
 * ⚠️ INTENTIONAL AUTO-SEND: This scheduler sends directly to clients without
 * approval queue routing. Rationale: RFI reminders are time-sensitive follow-ups
 * on owner-initiated requests. The owner approved the initial RFI send.
 */
import { getDb } from "./db";
import { rfis, rfiReminders, projects, clients } from "../drizzle/schema";
import { eq, and, lte, ne, isNotNull } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";
import { sendSms } from "./sms";
import { createTransporter } from "./email";

const BUSINESS_NAME = "Kitchens Plus Upstate";
const CHAD_PHONE = "864-567-8777";
const GMAIL_FROM = process.env.GMAIL_FROM ?? "chad@kitchensplusupstate.com";
const APP_ORIGIN = process.env.APP_ORIGIN ?? "https://kitchenscrm-njbauvnb.manus.space";

async function sendRfiReminderEmail(opts: {
  toEmail: string;
  clientName: string;
  rfiTitle: string;
  rfiBody: string;
  responseUrl: string;
  reminderNumber: number;
}) {
  const { toEmail, clientName, rfiTitle, rfiBody, responseUrl, reminderNumber } = opts;
  const subject = `[Reminder ${reminderNumber}/5] Action Required: ${rfiTitle} — ${BUSINESS_NAME}`;
  const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F8F6F1;font-family:'Georgia',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F6F1;padding:40px 20px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <tr><td style="background:#1A1A1A;padding:28px 40px;">
        <p style="margin:0;font-size:22px;color:#BF9A3B;font-family:'Georgia',serif;">${BUSINESS_NAME}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#999;letter-spacing:2px;text-transform:uppercase;">Request for Information — Reminder ${reminderNumber} of 5</p>
      </td></tr>
      <tr><td style="padding:36px 40px;">
        <div style="background:#FFF3CD;border:1px solid #FFEAA7;padding:12px 16px;border-radius:6px;margin-bottom:20px;font-size:14px;color:#856404;">
          <strong>Reminder ${reminderNumber} of 5</strong> — We still need your response to this RFI. Please take a moment to review and respond.
        </div>
        <p style="font-size:16px;color:#333;margin:0 0 8px;">Dear ${clientName},</p>
        <p style="font-size:14px;color:#555;margin:0 0 24px;line-height:1.7;">We are following up on our previous request for information. Your timely response helps us keep your project on schedule.</p>
        <div style="background:#F8F6F1;border-left:4px solid #BF9A3B;padding:20px 24px;border-radius:0 8px 8px 0;margin-bottom:28px;">
          <p style="margin:0 0 8px;font-size:13px;color:#BF9A3B;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">RFI: ${rfiTitle}</p>
          <div style="font-size:14px;color:#333;line-height:1.8;">${rfiBody.replace(/\n/g, "<br>")}</div>
        </div>
        <div style="text-align:center;margin:32px 0;">
          <a href="${responseUrl}" style="background:#BF9A3B;color:#1A1A1A;text-decoration:none;padding:14px 36px;border-radius:6px;font-size:15px;font-weight:bold;display:inline-block;">
            Review &amp; Respond to RFI →
          </a>
        </div>
      </td></tr>
      <tr><td style="background:#F8F6F1;padding:20px 40px;border-top:1px solid #EEE;">
        <p style="margin:0;font-size:12px;color:#999;text-align:center;line-height:1.6;">
          ${BUSINESS_NAME} · Questions? Call Chad at ${CHAD_PHONE} or reply to this email.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"${BUSINESS_NAME}" <${GMAIL_FROM}>`,
    to: toEmail,
    subject,
    html,
  });
}

export async function runRfiReminderScheduler(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const now = new Date();

  // Find all sent RFIs where nextReminderAt has passed
  const dueRfis = await db
    .select()
    .from(rfis)
    .where(
      and(
        eq(rfis.status as any, "sent"),
        isNotNull(rfis.nextReminderAt),
        lte(rfis.nextReminderAt, now)
      )
    );

  if (dueRfis.length === 0) return;

  for (const rfi of dueRfis) {
    try {
      // Check if max reminders reached
      if (rfi.reminderCount >= 5) {
        await db
          .update(rfis)
          .set({ status: "expired" as any, updatedAt: now })
          .where(eq(rfis.id, rfi.id));
        await notifyOwner({
          title: `RFI Expired: ${rfi.title}`,
          content: `RFI "${rfi.title}" has reached the maximum of 5 reminders with no client response. Please follow up manually.`,
        });
        continue;
      }

      // Resolve client
      const [project] = await db.select().from(projects).where(eq(projects.id, rfi.projectId));
      const clientId = rfi.clientId ?? project?.clientId;
      if (!clientId) continue;

      const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
      if (!client) continue;

      const newCount = rfi.reminderCount + 1;
      const responseUrl = `${APP_ORIGIN}/rfi/${rfi.token}`;
      const nextReminder = newCount < 5 ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : null;

      // Send email reminder
      if (client.email) {
        try {
          await sendRfiReminderEmail({
            toEmail: client.email,
            clientName: client.name,
            rfiTitle: rfi.title,
            rfiBody: rfi.body,
            responseUrl,
            reminderNumber: newCount,
          });
          await db.insert(rfiReminders).values({ rfiId: rfi.id, reminderNumber: newCount, channel: "email" });
        } catch (err: any) {
          console.error(`[RFIScheduler] Email reminder error for RFI ${rfi.id}:`, err?.message);
        }
      }

      // Send SMS reminder
      if (client.phone) {
        try {
          const prefix = `[Reminder ${newCount}/5] `;
          const message = `${prefix}Hi ${client.name}, ${BUSINESS_NAME} still needs your response to the RFI: "${rfi.title}". Please respond here: ${responseUrl}\n\nCall Chad at ${CHAD_PHONE} | Reply STOP to opt out.`;
          await sendSms({ to: client.phone, message });
          await db.insert(rfiReminders).values({ rfiId: rfi.id, reminderNumber: newCount, channel: "sms" });
        } catch (err: any) {
          console.error(`[RFIScheduler] SMS reminder error for RFI ${rfi.id}:`, err?.message);
        }
      }

      // Update RFI reminder count and next reminder time
      await db
        .update(rfis)
        .set({
          reminderCount: newCount,
          nextReminderAt: nextReminder,
          updatedAt: now,
        })
        .where(eq(rfis.id, rfi.id));

      // If this was the 5th reminder, mark as expired
      if (newCount >= 5) {
        await db
          .update(rfis)
          .set({ status: "expired" as any, updatedAt: now })
          .where(eq(rfis.id, rfi.id));
        await notifyOwner({
          title: `RFI Final Reminder Sent: ${rfi.title}`,
          content: `Final reminder (5/5) sent for RFI "${rfi.title}". No further reminders will be sent. Please follow up manually if needed.`,
        });
      }

      console.log(`[RFIScheduler] Reminder ${newCount}/5 sent for RFI ${rfi.id} ("${rfi.title}")`);
    } catch (err: any) {
      console.error(`[RFIScheduler] Error processing RFI ${rfi.id}:`, err?.message);
    }
  }
}

/** Start the RFI reminder scheduler — runs every hour */
export function startRfiReminderScheduler() {
  // Run once on startup (after a short delay)
  setTimeout(() => runRfiReminderScheduler().catch(console.error), 5000);
  // Then every hour
  setInterval(() => runRfiReminderScheduler().catch(console.error), 60 * 60 * 1000);
  console.log("[RFIScheduler] Started — checking every hour.");
}
