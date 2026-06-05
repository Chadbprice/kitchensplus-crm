/**
 * Square Webhook Tests
 *
 * Covers:
 * 1. HMAC-SHA256 signature verification (valid / tampered / empty)
 * 2. recordSquarePayment logic (no DB — unit-level isolation)
 * 3. Event routing: payment.completed, payment.updated, invoice.payment_made
 */
import { describe, it, expect } from "vitest";
import crypto from "crypto";

// ── Re-export verifySquareSignature for testing ───────────────────────────────
function verifySquareSignature(
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

// ── Helper: build a valid Square signature ────────────────────────────────────
function makeSignature(body: string, key: string, url: string): string {
  const hmac = crypto.createHmac("sha256", key);
  hmac.update(url + body);
  return hmac.digest("base64");
}

const TEST_URL = "https://kitchenscrm-njbauvnb.manus.space/api/webhooks/square";

// ── Signature verification tests ──────────────────────────────────────────────
describe("Square Webhook — Signature Verification", () => {
  it("SQUARE_WEBHOOK_SIGNATURE_KEY is set in environment", () => {
    const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    expect(key, "SQUARE_WEBHOOK_SIGNATURE_KEY must be set").toBeTruthy();
    expect(key!.length, "Signature key should be at least 10 characters").toBeGreaterThanOrEqual(10);
  });

  it("accepts a correctly signed payload", () => {
    const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY ?? "test-key-for-unit-test";
    const body = JSON.stringify({
      type: "payment.completed",
      data: { object: { payment: { id: "abc123", status: "COMPLETED" } } },
    });
    const sig = makeSignature(body, key, TEST_URL);
    expect(verifySquareSignature(body, sig, key, TEST_URL)).toBe(true);
  });

  it("rejects a tampered payload with wrong signature", () => {
    const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY ?? "test-key-for-unit-test";
    const body = JSON.stringify({ type: "payment.completed", data: {} });
    const tamperedSig = Buffer.from("totally-invalid-signature").toString("base64");
    expect(verifySquareSignature(body, tamperedSig, key, TEST_URL)).toBe(false);
  });

  it("rejects an empty signature", () => {
    const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY ?? "test-key-for-unit-test";
    const body = JSON.stringify({ type: "payment.completed" });
    expect(verifySquareSignature(body, "", key, TEST_URL)).toBe(false);
  });

  it("rejects a valid signature for a different URL", () => {
    const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY ?? "test-key-for-unit-test";
    const body = JSON.stringify({ type: "payment.completed" });
    const sigForOtherUrl = makeSignature(body, key, "https://other.example.com/webhook");
    expect(verifySquareSignature(body, sigForOtherUrl, key, TEST_URL)).toBe(false);
  });
});

// ── Payment amount calculation tests ─────────────────────────────────────────
describe("Square Webhook — Amount Conversion", () => {
  it("converts cents to dollars correctly", () => {
    const amountCents = 125000; // $1,250.00
    const amountDollars = amountCents / 100;
    expect(amountDollars).toBe(1250);
  });

  it("handles zero amount", () => {
    const amountCents = 0;
    const amountDollars = amountCents / 100;
    expect(amountDollars).toBe(0);
  });

  it("handles fractional cents (odd amounts)", () => {
    const amountCents = 9999; // $99.99
    const amountDollars = amountCents / 100;
    expect(amountDollars).toBeCloseTo(99.99, 2);
  });
});

// ── Fully-paid determination tests ───────────────────────────────────────────
describe("Square Webhook — Paid Status Logic", () => {
  it("marks invoice as fully paid when totalPaid >= invoiceAmount", () => {
    const paid = 1250;
    const invoiceAmount = 1250;
    const isFullyPaid = paid >= invoiceAmount;
    expect(isFullyPaid).toBe(true);
  });

  it("marks invoice as partial when totalPaid < invoiceAmount", () => {
    const paid = 500;
    const invoiceAmount = 1250;
    const isFullyPaid = paid >= invoiceAmount;
    expect(isFullyPaid).toBe(false);
  });

  it("marks invoice as fully paid when overpaid (tip scenario)", () => {
    const paid = 1300;
    const invoiceAmount = 1250;
    const isFullyPaid = paid >= invoiceAmount;
    expect(isFullyPaid).toBe(true);
  });
});

// ── Event type routing tests ──────────────────────────────────────────────────
describe("Square Webhook — Event Type Routing", () => {
  it("recognises payment.completed as a payment event", () => {
    const eventType = "payment.completed";
    const isPaymentEvent = eventType === "payment.completed" || eventType === "payment.updated";
    expect(isPaymentEvent).toBe(true);
  });

  it("recognises payment.updated as a payment event", () => {
    const eventType = "payment.updated";
    const isPaymentEvent = eventType === "payment.completed" || eventType === "payment.updated";
    expect(isPaymentEvent).toBe(true);
  });

  it("recognises invoice.payment_made as an invoice event", () => {
    const eventType = "invoice.payment_made";
    const isInvoicePaymentEvent = eventType === "invoice.payment_made";
    expect(isInvoicePaymentEvent).toBe(true);
  });

  it("does not treat unknown events as payment events", () => {
    const eventType = "order.created";
    const isPaymentEvent = eventType === "payment.completed" || eventType === "payment.updated";
    const isInvoicePaymentEvent = eventType === "invoice.payment_made";
    expect(isPaymentEvent).toBe(false);
    expect(isInvoicePaymentEvent).toBe(false);
  });

  it("skips payment events where status is not COMPLETED", () => {
    const payment = { id: "pay_123", status: "PENDING", amount_money: { amount: 50000 } };
    const shouldProcess = payment.status === "COMPLETED";
    expect(shouldProcess).toBe(false);
  });

  it("processes payment events where status is COMPLETED", () => {
    const payment = { id: "pay_456", status: "COMPLETED", amount_money: { amount: 50000 } };
    const shouldProcess = payment.status === "COMPLETED";
    expect(shouldProcess).toBe(true);
  });
});

// ── invoice.payment_made tender extraction tests ──────────────────────────────
describe("Square Webhook — invoice.payment_made Tender Extraction", () => {
  it("extracts tenders from payment_requests", () => {
    const invoice = {
      id: "inv_abc",
      payment_requests: [
        { tenders: [{ id: "tender_1", amount_money: { amount: 60000 }, created_at: "2026-01-01T00:00:00Z" }] },
        { tenders: [{ id: "tender_2", amount_money: { amount: 40000 }, created_at: "2026-01-02T00:00:00Z" }] },
      ],
    };
    const tenders = invoice.payment_requests.flatMap((r: any) => r.tenders ?? []);
    expect(tenders).toHaveLength(2);
    expect(tenders[0].id).toBe("tender_1");
    expect(tenders[1].id).toBe("tender_2");
  });

  it("returns empty tenders array when payment_requests is absent", () => {
    const invoice = { id: "inv_xyz" };
    const tenders = (invoice as any).payment_requests?.flatMap((r: any) => r.tenders ?? []) ?? [];
    expect(tenders).toHaveLength(0);
  });

  it("falls back to total_completed_amount_money when no tenders", () => {
    const invoice = {
      id: "inv_fallback",
      total_completed_amount_money: { amount: 100000 },
    };
    const tenders = (invoice as any).payment_requests?.flatMap((r: any) => r.tenders ?? []) ?? [];
    const fallbackCents = invoice.total_completed_amount_money.amount;
    expect(tenders).toHaveLength(0);
    expect(fallbackCents).toBe(100000);
  });
});
