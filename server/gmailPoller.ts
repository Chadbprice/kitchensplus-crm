/**
 * Gmail Poller — fetches emails to/from a client and stores them in the messages table.
 * Uses the Gmail API via the google-auth-library (OAuth2 tokens already stored in env).
 * Falls back gracefully if credentials are not configured.
 */
import { getDb } from "./db";
import { messages, projects, leads } from "../drizzle/schema";
import { eq, and, or } from "drizzle-orm";

const GMAIL_USER = process.env.GOOGLE_CALENDAR_EMAIL ?? "chad@kitchensplusupstate.com";
const CLIENT_ID = process.env.GOOGLE_CALENDAR_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;

async function getAccessToken(): Promise<string | null> {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) return null;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: REFRESH_TOKEN,
        grant_type: "refresh_token",
      }),
    });
    const data = await res.json() as any;
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

function decodeBase64Url(str: string): string {
  try {
    const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(base64, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

function extractBody(payload: any): string {
  if (!payload) return "";
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64Url(part.body.data);
    }
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        const html = decodeBase64Url(part.body.data);
        return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
    }
  }
  return "";
}

function getHeader(headers: any[], name: string): string {
  return headers?.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export async function pollGmailForProject(projectId: number, clientEmail?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const accessToken = await getAccessToken();
  if (!accessToken) {
    console.log("[GmailPoller] No access token — Gmail credentials not configured");
    return 0;
  }

  // Get project info to find client email if not provided
  if (!clientEmail) {
    const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (proj?.leadId) {
      const { leads: leadsTable } = await import("../drizzle/schema");
      const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, proj.leadId)).limit(1);
      clientEmail = lead?.email ?? undefined;
    }
  }

  if (!clientEmail) {
    console.log("[GmailPoller] No client email found for project", projectId);
    return 0;
  }

  try {
    // Search Gmail for emails to/from this client
    const query = encodeURIComponent(`(from:${clientEmail} OR to:${clientEmail})`);
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=50`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const listData = await listRes.json() as any;
    const gmailMessages = listData.messages ?? [];

    let newCount = 0;
    for (const gm of gmailMessages) {
      // Check if already stored
      const existing = await db.select({ id: messages.id }).from(messages)
        .where(eq(messages.gmailMessageId, gm.id)).limit(1);
      if (existing.length > 0) continue;

      // Fetch full message
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${gm.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const msg = await msgRes.json() as any;
      const headers = msg.payload?.headers ?? [];
      const from = getHeader(headers, "from");
      const to = getHeader(headers, "to");
      const subject = getHeader(headers, "subject");
      const dateStr = getHeader(headers, "date");
      const body = extractBody(msg.payload);
      if (!body.trim()) continue;

      const isInbound = from.toLowerCase().includes(clientEmail.toLowerCase());
      const sentAt = dateStr ? new Date(dateStr) : new Date();

      // Check for attachments
      let attachmentUrl: string | undefined;
      let attachmentName: string | undefined;
      let attachmentMime: string | undefined;
      if (msg.payload?.parts) {
        for (const part of msg.payload.parts) {
          if (part.filename && part.body?.attachmentId) {
            attachmentName = part.filename;
            attachmentMime = part.mimeType;
            // Note: downloading attachment bytes requires additional API call
            // We store the reference for now
            break;
          }
        }
      }

      await db.insert(messages).values({
        projectId,
        threadType: "client",
        direction: isInbound ? "inbound" : "outbound",
        channel: "email",
        fromName: from.replace(/<.*>/, "").trim(),
        fromEmail: from.match(/<(.+)>/)?.[1] ?? from,
        toEmail: to,
        body: body.substring(0, 5000),
        subject: subject.substring(0, 499),
        gmailMessageId: gm.id,
        gmailThreadId: gm.threadId,
        attachmentName: attachmentName ?? null,
        attachmentMime: attachmentMime ?? null,
        status: "received",
        sentAt,
      } as any);
      newCount++;
    }

    console.log(`[GmailPoller] Synced ${newCount} new emails for project ${projectId}`);
    return newCount;
  } catch (err: any) {
    console.error("[GmailPoller] Error:", err?.message ?? err);
    return 0;
  }
}
