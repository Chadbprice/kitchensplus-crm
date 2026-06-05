/**
 * test-google-apis.mjs
 * Live test of Google Calendar and Gmail API access using current OAuth credentials.
 */
import { google } from "googleapis";

const CLIENT_ID = process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? "";
const REFRESH_TOKEN = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN ?? "";
const CALENDAR_EMAIL = process.env.GOOGLE_CALENDAR_EMAIL ?? "chad@cpenterprisessc.com";

console.log("=== Google API Credential Check ===");
console.log(`CLIENT_ID:      ${CLIENT_ID ? CLIENT_ID.slice(0, 20) + "..." : "❌ MISSING"}`);
console.log(`CLIENT_SECRET:  ${CLIENT_SECRET ? CLIENT_SECRET.slice(0, 8) + "..." : "❌ MISSING"}`);
console.log(`REFRESH_TOKEN:  ${REFRESH_TOKEN ? REFRESH_TOKEN.slice(0, 20) + "..." : "❌ MISSING"}`);
console.log(`CALENDAR_EMAIL: ${CALENDAR_EMAIL || "❌ MISSING"}`);
console.log("");

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error("❌ Missing credentials — cannot run tests.");
  process.exit(1);
}

const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
auth.setCredentials({ refresh_token: REFRESH_TOKEN });

// ── Test 1: Get access token (confirms credentials are valid) ──────────────
console.log("── Test 1: Refresh access token ──");
let accessToken;
try {
  const tokenRes = await auth.getAccessToken();
  accessToken = tokenRes.token;
  console.log(`✅ Access token obtained: ${accessToken?.slice(0, 20)}...`);
} catch (err) {
  console.error("❌ Failed to get access token:", err.message);
  process.exit(1);
}

// ── Test 2: Google Calendar API ───────────────────────────────────────────
console.log("\n── Test 2: Google Calendar API ──");
try {
  const calendar = google.calendar({ version: "v3", auth });
  const calList = await calendar.calendarList.list({ maxResults: 5 });
  const cals = calList.data.items ?? [];
  console.log(`✅ Calendar API accessible. Found ${cals.length} calendar(s):`);
  for (const cal of cals) {
    console.log(`   - ${cal.summary} (${cal.id})`);
  }
} catch (err) {
  console.error("❌ Calendar API error:", err.message);
  if (err.message?.includes("insufficient")) {
    console.error("   → Token is missing 'https://www.googleapis.com/auth/calendar' scope.");
  }
}

// ── Test 3: Gmail API — list labels (confirms gmail.readonly scope) ────────
console.log("\n── Test 3: Gmail API — list labels ──");
try {
  const gmail = google.gmail({ version: "v1", auth });
  const labelsRes = await gmail.users.labels.list({ userId: "me" });
  const labels = labelsRes.data.labels ?? [];
  const systemLabels = labels.filter(l => l.type === "system").map(l => l.name);
  console.log(`✅ Gmail API accessible. System labels: ${systemLabels.join(", ")}`);
} catch (err) {
  console.error("❌ Gmail API error:", err.message);
  if (err.message?.includes("insufficient")) {
    console.error("   → Token is missing 'https://www.googleapis.com/auth/gmail.readonly' scope.");
    console.error("   → The refresh token needs to be regenerated with Gmail scopes.");
  }
}

// ── Test 4: Gmail API — fetch 3 recent messages ───────────────────────────
console.log("\n── Test 4: Gmail API — fetch 3 recent messages ──");
try {
  const gmail = google.gmail({ version: "v1", auth });
  const listRes = await gmail.users.messages.list({
    userId: "me",
    maxResults: 3,
    q: "in:inbox",
  });
  const msgs = listRes.data.messages ?? [];
  console.log(`✅ Gmail messages accessible. Recent message IDs:`);
  for (const m of msgs) {
    const detail = await gmail.users.messages.get({
      userId: "me",
      id: m.id,
      format: "metadata",
      metadataHeaders: ["From", "Subject", "Date"],
    });
    const headers = detail.data.payload?.headers ?? [];
    const from = headers.find(h => h.name === "From")?.value ?? "(unknown)";
    const subject = headers.find(h => h.name === "Subject")?.value ?? "(no subject)";
    const date = headers.find(h => h.name === "Date")?.value ?? "";
    console.log(`   - [${date}] From: ${from} | Subject: ${subject}`);
  }
} catch (err) {
  console.error("❌ Gmail messages fetch error:", err.message);
}

console.log("\n=== Test Complete ===");
