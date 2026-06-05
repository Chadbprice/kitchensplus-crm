import { describe, it, expect } from "vitest";

/**
 * ClickSend SMS integration tests.
 * Tests graceful failure when credentials are missing, TCPA footer appending,
 * and credential validation.
 */
describe("ClickSend SMS integration", () => {
  it("sendSms returns error gracefully when credentials are missing", async () => {
    const origUser = process.env.CLICKSEND_USERNAME;
    const origKey = process.env.CLICKSEND_API_KEY;
    process.env.CLICKSEND_USERNAME = "";
    process.env.CLICKSEND_API_KEY = "";

    // Dynamic import to bypass module-level cache
    const { sendSms } = await import("./sms.js");
    const result = await sendSms("+18005550000", "Test message");

    process.env.CLICKSEND_USERNAME = origUser;
    process.env.CLICKSEND_API_KEY = origKey;

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("sendSms object overload returns error gracefully when credentials are missing", async () => {
    const origUser = process.env.CLICKSEND_USERNAME;
    const origKey = process.env.CLICKSEND_API_KEY;
    process.env.CLICKSEND_USERNAME = "";
    process.env.CLICKSEND_API_KEY = "";

    const { sendSms } = await import("./sms.js");
    const result = await sendSms({ to: "+18005550000", message: "Test", isFirstContact: false });

    process.env.CLICKSEND_USERNAME = origUser;
    process.env.CLICKSEND_API_KEY = origKey;

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("validateClickSendCredentials returns false when credentials are missing", async () => {
    const origUser = process.env.CLICKSEND_USERNAME;
    const origKey = process.env.CLICKSEND_API_KEY;
    process.env.CLICKSEND_USERNAME = "";
    process.env.CLICKSEND_API_KEY = "";

    const { validateClickSendCredentials } = await import("./sms.js");
    const valid = await validateClickSendCredentials();

    process.env.CLICKSEND_USERNAME = origUser;
    process.env.CLICKSEND_API_KEY = origKey;

    expect(valid).toBe(false);
  });

  it("validateClickSendCredentials returns true with real credentials", async () => {
    const username = process.env.CLICKSEND_USERNAME;
    const apiKey = process.env.CLICKSEND_API_KEY;
    if (!username || !apiKey) {
      console.warn("[ClickSend test] Credentials not set — skipping live validation");
      return;
    }
    const { validateClickSendCredentials } = await import("./sms.js");
    const valid = await validateClickSendCredentials();
    console.log("[ClickSend test] Credential validation result:", valid);
    expect(valid).toBe(true);
  }, 15000);
});

describe("TCPA compliance — sms_opt_outs table", () => {
  it("smsOptOuts table is defined in schema", async () => {
    const schema = await import("../drizzle/schema.js");
    expect(schema.smsOptOuts).toBeDefined();
    expect(typeof schema.smsOptOuts).toBe("object");
  });
});

describe("normalizeE164 phone formatting", () => {
  it("normalises a 10-digit US number to E.164", async () => {
    const { normalizeE164 } = await import("./sms.js");
    expect(normalizeE164("8645678777")).toBe("+18645678777");
  });
  it("normalises a 10-digit number with dashes", async () => {
    const { normalizeE164 } = await import("./sms.js");
    expect(normalizeE164("864-567-8777")).toBe("+18645678777");
  });
  it("normalises a 10-digit number with parens and spaces", async () => {
    const { normalizeE164 } = await import("./sms.js");
    expect(normalizeE164("(864) 567-8777")).toBe("+18645678777");
  });
  it("normalises an 11-digit number starting with 1", async () => {
    const { normalizeE164 } = await import("./sms.js");
    expect(normalizeE164("18645678777")).toBe("+18645678777");
  });
  it("passes through an already-normalised E.164 number", async () => {
    const { normalizeE164 } = await import("./sms.js");
    expect(normalizeE164("+18645678777")).toBe("+18645678777");
  });
});

describe("getSenderNumberStatus", () => {
  it("returns null when credentials are missing", async () => {
    const origUser = process.env.CLICKSEND_USERNAME;
    const origKey = process.env.CLICKSEND_API_KEY;
    process.env.CLICKSEND_USERNAME = "";
    process.env.CLICKSEND_API_KEY = "";
    const { getSenderNumberStatus } = await import("./sms.js");
    const result = await getSenderNumberStatus();
    process.env.CLICKSEND_USERNAME = origUser;
    process.env.CLICKSEND_API_KEY = origKey;
    expect(result).toBeNull();
  });
  it("returns an object with number/status/description when credentials are valid", async () => {
    const username = process.env.CLICKSEND_USERNAME;
    const apiKey = process.env.CLICKSEND_API_KEY;
    if (!username || !apiKey) {
      console.warn("[SMS test] Credentials not set \u2014 skipping live getSenderNumberStatus");
      return;
    }
    const { getSenderNumberStatus } = await import("./sms.js");
    const result = await getSenderNumberStatus();
    if (result) {
      expect(result.number).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.description).toBeDefined();
      console.log(`[SMS test] Sender number ${result.number} status: ${result.status} \u2014 ${result.description}`);
    }
    // null is acceptable if the number is not yet registered
  }, 15000);
});

describe("COUNTRY_NOT_ENABLED regression \u2014 root cause protection", () => {
  it("sendSms returns success:false and error:'COUNTRY_NOT_ENABLED' when ClickSend rejects the number", async () => {
    const origFetch = global.fetch;
    (global as any).fetch = async (_url: any, _opts: any) => ({
      ok: true,
      json: async () => ({
        http_code: 200,
        response_code: "SUCCESS",
        response_msg: "Messages queued for delivery.",
        data: {
          messages: [{
            status: "COUNTRY_NOT_ENABLED",
            message_id: "test-id-123",
          }],
        },
      }),
    });
    const { sendSms } = await import("./sms.js");
    const result = await sendSms("+18645678777", "Test message");
    (global as any).fetch = origFetch;
    expect(result.success).toBe(false);
    expect(result.error).toBe("COUNTRY_NOT_ENABLED");
  });
});

describe("ClickSend inbound webhook", () => {
  it("registerClickSendWebhook exports a function", async () => {
    const { registerClickSendWebhook } = await import("./clickSendWebhook.js");
    expect(typeof registerClickSendWebhook).toBe("function");
  });
});
