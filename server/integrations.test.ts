import { describe, it, expect } from "vitest";

/**
 * Integration credential validation tests.
 * These tests verify the integration modules load correctly and
 * handle missing/invalid credentials gracefully without throwing.
 */

describe("SMS (ClickSend) integration", () => {
  it("validateClickSendCredentials returns false when credentials are missing", async () => {
    // Temporarily clear ClickSend env to test graceful failure
    const origUser = process.env.CLICKSEND_USERNAME;
    const origKey = process.env.CLICKSEND_API_KEY;
    process.env.CLICKSEND_USERNAME = "";
    process.env.CLICKSEND_API_KEY = "";

    const { validateClickSendCredentials } = await import("./sms.js");
    const isValid = await validateClickSendCredentials();

    // Restore
    process.env.CLICKSEND_USERNAME = origUser;
    process.env.CLICKSEND_API_KEY = origKey;

    // With empty credentials, validation must return false
    expect(isValid).toBe(false);
  }, 10000);
});

describe("Payments (Square) integration", () => {
  it("createPaymentLink returns error gracefully when credentials are missing", async () => {
    const origToken = process.env.SQUARE_ACCESS_TOKEN;
    const origLoc = process.env.SQUARE_LOCATION_ID;
    process.env.SQUARE_ACCESS_TOKEN = "";
    process.env.SQUARE_LOCATION_ID = "";

    const { createPaymentLink } = await import("./payments.js");
    const result = await createPaymentLink({
      invoiceId: 1,
      amount: 50000,
      description: "Test payment",
    });

    process.env.SQUARE_ACCESS_TOKEN = origToken;
    process.env.SQUARE_LOCATION_ID = origLoc;

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
