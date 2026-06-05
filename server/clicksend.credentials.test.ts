import { describe, it, expect } from "vitest";

/**
 * Validates that ClickSend credentials are set and the account endpoint
 * responds with HTTP 200. This test hits the real ClickSend API.
 */
describe("ClickSend credentials", () => {
  it("should have CLICKSEND_USERNAME and CLICKSEND_API_KEY set", () => {
    expect(process.env.CLICKSEND_USERNAME, "CLICKSEND_USERNAME must be set").toBeTruthy();
    expect(process.env.CLICKSEND_API_KEY, "CLICKSEND_API_KEY must be set").toBeTruthy();
  });

  it("should have CLICKSEND_FROM set to the registered toll-free number", () => {
    const from = process.env.CLICKSEND_FROM;
    expect(from, "CLICKSEND_FROM must be set").toBeTruthy();
    expect(from, "CLICKSEND_FROM must start with +1833 (toll-free)").toMatch(/^\+1833/);
    console.log("[ClickSend] FROM number:", from);
  });

  it("should authenticate successfully with ClickSend account endpoint", async () => {
    const username = process.env.CLICKSEND_USERNAME!;
    const apiKey = process.env.CLICKSEND_API_KEY!;
    const auth = "Basic " + Buffer.from(`${username}:${apiKey}`).toString("base64");

    const res = await fetch("https://rest.clicksend.com/v3/account", {
      headers: { Authorization: auth },
    });

    expect(res.status, `ClickSend account endpoint returned ${res.status} — check credentials`).toBe(200);

    const json = (await res.json()) as any;
    expect(json?.http_code).toBe(200);
    console.log("[ClickSend] Account validated:", json?.data?.username ?? "(no username)");
    console.log("[ClickSend] Balance:", json?.data?.balance ?? "unknown");
  }, 15000); // 15s timeout for network call
});
