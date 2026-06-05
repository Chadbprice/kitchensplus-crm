/**
 * Google Calendar helper — creates and updates events on chad@cpenterprisessc.com
 * Uses OAuth2 with a long-lived refresh token (no user interaction required).
 */
import { google } from "googleapis";

const CLIENT_ID = process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? "";
const REFRESH_TOKEN = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN ?? "";
const CALENDAR_EMAIL = process.env.GOOGLE_CALENDAR_EMAIL ?? "chad@cpenterprisessc.com";

function getOAuth2Client() {
  const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  auth.setCredentials({ refresh_token: REFRESH_TOKEN });
  return auth;
}

export interface CalendarEventInput {
  summary: string;        // Event title
  description?: string;   // Event body / notes
  startTime: Date;        // UTC start
  durationMinutes?: number; // default 60
  location?: string;
  attendeeEmail?: string; // client email to invite (optional)
}

export interface CalendarEventResult {
  ok: boolean;
  eventId?: string;
  htmlLink?: string;
  error?: string;
}

/**
 * Create a new calendar event. Returns the Google Calendar event ID so it
 * can be stored on the meeting record for future updates.
 */
export async function createCalendarEvent(
  input: CalendarEventInput
): Promise<CalendarEventResult> {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    return { ok: false, error: "Google Calendar credentials not configured" };
  }
  try {
    const auth = getOAuth2Client();
    const calendar = google.calendar({ version: "v3", auth });

    const startDt = new Date(input.startTime);
    const endDt = new Date(startDt.getTime() + (input.durationMinutes ?? 60) * 60_000);

    const attendees = input.attendeeEmail
      ? [{ email: input.attendeeEmail }]
      : [];

    const res = await calendar.events.insert({
      calendarId: CALENDAR_EMAIL,
      requestBody: {
        summary: input.summary,
        description: input.description,
        location: input.location,
        start: { dateTime: startDt.toISOString(), timeZone: "America/New_York" },
        end: { dateTime: endDt.toISOString(), timeZone: "America/New_York" },
        attendees,
        reminders: {
          useDefault: false,
          overrides: [
            { method: "email", minutes: 24 * 60 }, // 1 day before
            { method: "popup", minutes: 60 },       // 1 hour before
          ],
        },
      },
    });

    return {
      ok: true,
      eventId: res.data.id ?? undefined,
      htmlLink: res.data.htmlLink ?? undefined,
    };
  } catch (err: any) {
    console.error("[GoogleCalendar] createCalendarEvent error:", err?.message ?? err);
    return { ok: false, error: err?.message ?? String(err) };
  }
}

/**
 * Delete (cancel) a calendar event.
 */
export async function deleteCalendarEvent(
  eventId: string
): Promise<CalendarEventResult> {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    return { ok: false, error: "Google Calendar credentials not configured" };
  }
  try {
    const auth = getOAuth2Client();
    const calendar = google.calendar({ version: "v3", auth });
    await calendar.events.delete({ calendarId: CALENDAR_EMAIL, eventId });
    return { ok: true, eventId };
  } catch (err: any) {
    // 410 Gone = already deleted, treat as success
    if (err?.code === 410 || err?.status === 410) return { ok: true, eventId };
    console.error("[GoogleCalendar] deleteCalendarEvent error:", err?.message ?? err);
    return { ok: false, error: err?.message ?? String(err) };
  }
}

/**
 * Update an existing calendar event (e.g. mark as confirmed, change title).
 */
export async function updateCalendarEvent(
  eventId: string,
  patch: Partial<CalendarEventInput> & { confirmed?: boolean }
): Promise<CalendarEventResult> {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    return { ok: false, error: "Google Calendar credentials not configured" };
  }
  try {
    const auth = getOAuth2Client();
    const calendar = google.calendar({ version: "v3", auth });

    // Build patch body
    const body: Record<string, any> = {};
    if (patch.summary) body.summary = patch.summary;
    if (patch.description !== undefined) body.description = patch.description;
    if (patch.location) body.location = patch.location;
    if (patch.startTime) {
      const startDt = new Date(patch.startTime);
      const endDt = new Date(startDt.getTime() + (patch.durationMinutes ?? 60) * 60_000);
      body.start = { dateTime: startDt.toISOString(), timeZone: "America/New_York" };
      body.end = { dateTime: endDt.toISOString(), timeZone: "America/New_York" };
    }
    if (patch.confirmed) {
      // Prepend ✓ to the title to indicate client confirmed
      const existing = await calendar.events.get({ calendarId: CALENDAR_EMAIL, eventId });
      const currentSummary = existing.data.summary ?? "";
      if (!currentSummary.startsWith("✓")) {
        body.summary = `✓ ${currentSummary}`;
      }
    }

    const res = await calendar.events.patch({
      calendarId: CALENDAR_EMAIL,
      eventId,
      requestBody: body,
    });

    return {
      ok: true,
      eventId: res.data.id ?? undefined,
      htmlLink: res.data.htmlLink ?? undefined,
    };
  } catch (err: any) {
    console.error("[GoogleCalendar] updateCalendarEvent error:", err?.message ?? err);
    return { ok: false, error: err?.message ?? String(err) };
  }
}
