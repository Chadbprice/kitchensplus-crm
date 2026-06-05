import { describe, it, expect } from "vitest";
import { google } from "googleapis";

describe("Google Calendar credentials", () => {
  it("can exchange refresh token for an access token", async () => {
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;

    expect(clientId, "GOOGLE_CALENDAR_CLIENT_ID must be set").toBeTruthy();
    expect(clientSecret, "GOOGLE_CALENDAR_CLIENT_SECRET must be set").toBeTruthy();
    expect(refreshToken, "GOOGLE_CALENDAR_REFRESH_TOKEN must be set").toBeTruthy();

    const auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });

    // This call hits Google's token endpoint — if credentials are invalid it throws
    const { token } = await auth.getAccessToken();
    expect(token).toBeTruthy();
  }, 15_000);
});
