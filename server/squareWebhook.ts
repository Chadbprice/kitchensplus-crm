/**
 * Square Webhook Handler
 * Listens at POST /api/webhooks/square
 *
 * Supported events:
 *   - payment.completed / payment.updated  → payment object in data.object.payment
 *   - invoice.payment_made                 → invoice object in data.object.invoice
 *
 * Square sends a HMAC-SHA256 signature in "x-square-hmacsha256-signature".
 * We verify it when SQUARE_WEBHOOK_SIGNATURE_KEY is set.
 */
import type { Request, Response, Express } from "express";
import crypto from "crypto";
import { getDb } from "./db";
import { invoices, invoicePayments } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";

// ── Signature verification ────────────────────────────────────────────────────
export function verifySquareSignature(
  body: string,
  signature: string,
  signatureKey: string,
  notificationUrl: string
): boolean {
  try {
    const hmac = crypto.createHmac("sha256", signatureKey);
    hmac.update(notificationUrl + body);
    const expected = hmac.digest("base64");
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ── Core payment recording logic ─────────────────────────────────────────────
/**
 * Records a Square payment against a CRM invoice.
 * @param squarePaymentId  Square payment ID (used for dedup)
 * @param orderId          Square order ID (used to match invoice)
 * @param amountCents      Payment amount in cents
 * @param paidAt           ISO timestamp from Square
 * @param source           Event type label for logging
 */
export async function recordSquarePayment({
  squarePaymentId,
  orderId,
  amountCents,
  paidAt,
  source,
}: {
  squarePaymentId: string;
  orderId?: string;
  amountCents: number;
  paidAt?: string;
  source: string;
}) {
  const db = await getDb();
  if (!db) return;

  const amountDollars = amountCents / 100;

  // ── 1. Find matching invoice ─────────────────────────────────────────────
  let matchedInvoice: any = null;

  if (orderId) {
    const rows = await db.select().from(invoices)
      .where(sql`squarePaymentLinkId = ${orderId} OR squarePaymentId = ${orderId}`)
      .limit(1);
    matchedInvoice = rows[0] ?? null;
  }

  if (!matchedInvoice && squarePaymentId) {
    const rows = await db.select().from(invoices)
      .where(sql`squarePaymentId = ${squarePaymentId}`)
      .limit(1);
    matchedInvoice = rows[0] ?? null;
  }

  if (!matchedInvoice) {
    console.log(`[SquareWebhook] [${source}] No invoice matched for payment ${squarePaymentId} / order ${orderId ?? "n/a"}`);
    return;
  }

  // ── 2. Dedup check ───────────────────────────────────────────────────────
  const existing = await db.select().from(invoicePayments)
    .where(eq(invoicePayments.squarePaymentId, squarePaymentId))
    .limit(1);
  if (existing.length > 0) {
    console.log(`[SquareWebhook] [${source}] Payment ${squarePaymentId} already recorded — skipping`);
    return;
  }

  // ── 3. Insert payment record ─────────────────────────────────────────────
  const paymentDate = paidAt ? new Date(paidAt) : new Date();
  await db.insert(invoicePayments).values({
    invoiceId: matchedInvoice.id,
    projectId: matchedInvoice.projectId ?? undefined,
    leadId: matchedInvoice.leadId ?? undefined,
    clientId: matchedInvoice.clientId ?? undefined,
    amount: String(amountDollars) as any,
    method: "square",
    squarePaymentId,
    note: `Auto-recorded via Square webhook [${source}] (order: ${orderId ?? "n/a"})`,
    paidAt: paymentDate,
  });

  // ── 4. Recalculate totals and update invoice status ──────────────────────
  const [{ totalPaid }] = await db
    .select({ totalPaid: sql<string>`COALESCE(SUM(amount), 0)` })
    .from(invoicePayments)
    .where(eq(invoicePayments.invoiceId, matchedInvoice.id));

  const paid = Number(totalPaid);
  const invoiceAmount = Number(matchedInvoice.amount);
  const isFullyPaid = paid >= invoiceAmount;

  await db.update(invoices).set({
    amountPaid: String(paid) as any,
    squarePaymentId,
    status: isFullyPaid ? "paid" : "sent",
    paidAt: isFullyPaid ? paymentDate : undefined,
    updatedAt: new Date(),
  }).where(eq(invoices.id, matchedInvoice.id));

  const statusLabel = isFullyPaid ? "FULLY PAID" : `partial ($${paid.toFixed(2)} / $${invoiceAmount.toFixed(2)})`;
  console.log(`[SquareWebhook] [${source}] Recorded $${amountDollars.toFixed(2)} for invoice ${matchedInvoice.invoiceNumber} — ${statusLabel}`);

  // ── 5. Notify owner ──────────────────────────────────────────────────────
  try {
    const { notifyOwner } = await import("./_core/notification");
    await notifyOwner({
      title: isFullyPaid
        ? `✅ Invoice ${matchedInvoice.invoiceNumber} Fully Paid — $${amountDollars.toFixed(2)}`
        : `💰 Partial Payment on Invoice ${matchedInvoice.invoiceNumber} — $${amountDollars.toFixed(2)}`,
      content: isFullyPaid
        ? `Invoice ${matchedInvoice.invoiceNumber} has been fully paid via Square ($${amountDollars.toFixed(2)}). Total collected: $${paid.toFixed(2)}.`
        : `A partial payment of $${amountDollars.toFixed(2)} was received on invoice ${matchedInvoice.invoiceNumber} via Square. Total collected so far: $${paid.toFixed(2)} of $${invoiceAmount.toFixed(2)}.`,
    });
  } catch (err) {
    console.warn("[SquareWebhook] Owner notification failed:", err);
  }
}

// ── Event handlers ────────────────────────────────────────────────────────────
async function handlePaymentEvent(payment: any) {
  if (!payment || payment.status !== "COMPLETED") return;
  await recordSquarePayment({
    squarePaymentId: payment.id,
    orderId: payment.order_id,
    amountCents: payment.amount_money?.amount ?? 0,
    paidAt: payment.created_at,
    source: "payment.completed",
  });
}

async function handleInvoicePaymentMade(invoice: any) {
  if (!invoice) return;

  // Square invoice.payment_made provides payment_requests with tenders
  const tenders: any[] = invoice.payment_requests?.flatMap((r: any) => r.tenders ?? []) ?? [];
  for (const tender of tenders) {
    if (!tender.id) continue;
    await recordSquarePayment({
      squarePaymentId: tender.id,
      orderId: invoice.order_id ?? invoice.id,
      amountCents: tender.amount_money?.amount ?? 0,
      paidAt: tender.created_at,
      source: "invoice.payment_made",
    });
  }

  // Fallback: if no tenders, use the invoice total_completed_amount_money
  if (tenders.length === 0 && invoice.id) {
    const totalCents: number = invoice.total_completed_amount_money?.amount ?? 0;
    if (totalCents > 0) {
      await recordSquarePayment({
        squarePaymentId: `inv-${invoice.id}`,
        orderId: invoice.order_id ?? invoice.id,
        amountCents: totalCents,
        paidAt: invoice.updated_at,
        source: "invoice.payment_made (total)",
      });
    }
  }
}

// ── Express route registration ────────────────────────────────────────────────
export function registerSquareWebhook(app: Express) {
  app.post(
    "/api/webhooks/square",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      const rawBody =
        req.body instanceof Buffer ? req.body.toString("utf8") : JSON.stringify(req.body);
      const signature = req.headers["x-square-hmacsha256-signature"] as string | undefined;
      const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;

      // Verify signature when key is configured
      if (signatureKey && signature) {
        const notificationUrl = `${req.protocol}://${req.get("host")}/api/webhooks/square`;
        if (!verifySquareSignature(rawBody, signature, signatureKey, notificationUrl)) {
          console.warn("[SquareWebhook] Invalid signature — request rejected");
          return res.status(403).json({ error: "Invalid signature" });
        }
      }

      let event: any;
      try {
        event = JSON.parse(rawBody);
      } catch {
        return res.status(400).json({ error: "Invalid JSON" });
      }

      const eventType: string = event?.type ?? "";
      console.log(`[SquareWebhook] Received event: ${eventType}`);

      if (eventType === "payment.completed" || eventType === "payment.updated") {
        const payment = event?.data?.object?.payment;
        handlePaymentEvent(payment).catch((err) =>
          console.error("[SquareWebhook] Error handling payment event:", err)
        );
      } else if (eventType === "invoice.payment_made") {
        const invoice = event?.data?.object?.invoice;
        handleInvoicePaymentMade(invoice).catch((err) =>
          console.error("[SquareWebhook] Error handling invoice.payment_made:", err)
        );
      }

      // Always respond 200 quickly so Square doesn't retry
      res.status(200).json({ received: true });
    }
  );

  console.log("[SquareWebhook] Webhook endpoint registered at POST /api/webhooks/square");
}

// Need to import express for raw body middleware
import express from "express";
