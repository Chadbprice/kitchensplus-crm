/**
 * Invoice Follow-Up Scheduler
 * Runs every hour. For any invoice that is "sent" or "overdue" (unpaid) and was
 * last followed up more than 24 hours ago (or never), sends a follow-up email
 * and SMS to the client, then increments followUpCount and updates lastFollowUpAt.
 *
 * ⚠️ INTENTIONAL AUTO-SEND: This scheduler sends directly without approval queue routing.
 * Rationale: Invoice follow-ups are time-sensitive operational messages with a 24-hour
 * cooldown. The owner has already approved the invoice by sending it initially.
 */
import { getDb } from "./db";
import { invoices, leads, clients, projects } from "../drizzle/schema";
import { eq, and, sql, or, isNull } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";

async function sendInvoiceFollowUp() {
  const db = await getDb();
  if (!db) return;

  const now = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

  const unpaidInvoices = await db.select().from(invoices).where(
    and(
      sql`status IN ('sent', 'overdue')`,
      sql`amountPaid < amount`,
      or(
        isNull(invoices.lastFollowUpAt),
        sql`lastFollowUpAt < ${cutoff}`
      )
    )
  );

  if (unpaidInvoices.length === 0) return;

  const { sendInvoiceFollowUpEmail } = await import("./email");
  const { sendSms } = await import("./sms");

  for (const invoice of unpaidInvoices) {
    try {
      let clientName = "Valued Client";
      let clientEmail: string | null = null;
      let clientPhone: string | null = null;

      if (invoice.leadId) {
        const [lead] = await db.select().from(leads).where(eq(leads.id, invoice.leadId)).limit(1);
        if (lead) { clientName = lead.name; clientEmail = lead.email ?? null; clientPhone = lead.phone ?? null; }
      } else if (invoice.clientId) {
        const [cl] = await db.select().from(clients).where(eq(clients.id, invoice.clientId)).limit(1);
        if (cl) { clientName = cl.name; clientEmail = cl.email ?? null; clientPhone = cl.phone ?? null; }
      } else if (invoice.projectId) {
        const [proj] = await db.select().from(projects).where(eq(projects.id, invoice.projectId)).limit(1);
        if (proj && (proj as any).leadId) {
          const [lead2] = await db.select().from(leads).where(eq(leads.id, (proj as any).leadId)).limit(1);
          if (lead2) { clientName = lead2.name; clientEmail = lead2.email ?? null; clientPhone = lead2.phone ?? null; }
        }
      }

      const invoiceNumber = invoice.invoiceNumber ?? `INV-${invoice.id}`;
      const balance = Math.max(0, Number(invoice.amount) - Number(invoice.amountPaid ?? 0));
      const followUpNum = (invoice.followUpCount ?? 0) + 1;

      if (clientEmail) {
        await sendInvoiceFollowUpEmail({
          to: clientEmail,
          clientName,
          invoiceNumber,
          amount: String(balance),
          squarePaymentUrl: invoice.squarePaymentUrl ?? undefined,
          followUpNumber: followUpNum,
        });
      }

      if (clientPhone) {
        const smsMsg = `Hi ${clientName.split(" ")[0]}, this is Kitchens Plus Upstate. Invoice #${invoiceNumber} in the amount of $${balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} is currently due.${invoice.squarePaymentUrl ? ` You may pay securely here: ${invoice.squarePaymentUrl}` : ""} Thank you for your business, ${clientName.split(" ")[0]}!`;
        await sendSms({ to: clientPhone, message: smsMsg });
      }

      await db.update(invoices).set({
        followUpCount: followUpNum,
        lastFollowUpAt: now,
        status: invoice.status === "sent" && followUpNum >= 1 ? "overdue" : invoice.status as any,
      }).where(eq(invoices.id, invoice.id));

      // After 3 unanswered follow-ups, notify the owner to call the client directly
      if (followUpNum >= 3) {
        const balanceFmt = `$${balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const ownerMsg = [
          `⚠️ Invoice ${invoiceNumber} has received ${followUpNum} unanswered follow-up${followUpNum === 1 ? "" : "s"} and remains unpaid.`,
          ``,
          `Client: ${clientName}`,
          clientPhone ? `Phone: ${clientPhone}` : null,
          clientEmail ? `Email: ${clientEmail}` : null,
          `Balance Due: ${balanceFmt}`,
          ``,
          `Please call the client directly to resolve this outstanding balance.`,
        ].filter(Boolean).join("\n");

        try {
          await notifyOwner({
            title: `📞 Call Required — Invoice ${invoiceNumber} (${followUpNum} follow-ups unanswered)`,
            content: ownerMsg,
          });
          console.log(`[FollowUp] Owner escalation notification sent for invoice ${invoiceNumber} after ${followUpNum} follow-ups`);
        } catch (notifyErr) {
          console.warn(`[FollowUp] Could not send owner escalation for invoice ${invoiceNumber}:`, notifyErr);
        }
      }

      console.log(`[FollowUp] Sent follow-up #${followUpNum} for invoice ${invoiceNumber} to ${clientEmail ?? clientPhone ?? "unknown"}`);
    } catch (err) {
      console.error(`[FollowUp] Failed for invoice ${invoice.id}:`, err);
    }
  }
}

let _started = false;
export function startInvoiceFollowUpScheduler() {
  if (_started) return;
  _started = true;
  setTimeout(() => sendInvoiceFollowUp().catch(console.error), 30_000);
  setInterval(() => sendInvoiceFollowUp().catch(console.error), 60 * 60 * 1000);
  console.log("[FollowUp] Invoice follow-up scheduler started (runs every hour)");
}
