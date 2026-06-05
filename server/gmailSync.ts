/**
 * gmailSync.ts
 * Syncs emails from both Gmail accounts to the messages table.
 * Matches emails to leads/clients by email address and phone number.
 * Saves attachments to S3 and stores URLs in attachmentsJson.
 *
 * Accounts watched:
 *   - chad@cpenterprisessc.com  (primary Google account with OAuth)
 *   - chad@kitchensplusupstate.com  (alias / send-as on same account)
 *
 * Since both addresses are on the same Google account (cpenterprisessc.com
 * is the auth account, kitchensplusupstate.com is the alias), we use a
 * single OAuth2 client but search for emails involving BOTH addresses.
 */

import { google } from "googleapis";
import { getDb } from "./db";
import { messages, gmailSyncState, leads, clients, projects, projectTasks } from "../drizzle/schema";
import { eq, or, and, inArray, ne } from "drizzle-orm";
import { storagePut } from "./storage";
import { notifyOwner } from "./_core/notification";

const CLIENT_ID = process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? "";
const REFRESH_TOKEN = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN ?? "";

// Both addresses we watch — the primary auth account + the alias
const WATCHED_ADDRESSES = [
  "chad@cpenterprisessc.com",
  "chad@kitchensplusupstate.com",
];

// How far back to look on first sync (90 days)
const INITIAL_LOOKBACK_DAYS = 90;

function getOAuth2Client() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) return null;
  const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  auth.setCredentials({ refresh_token: REFRESH_TOKEN });
  return auth;
}

/** Extract plain text from a Gmail message part tree */
function extractBody(payload: any): string {
  if (!payload) return "";
  // Direct body
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }
  // Multipart — prefer text/plain, fall back to text/html
  if (payload.parts) {
    const plain = payload.parts.find((p: any) => p.mimeType === "text/plain");
    if (plain?.body?.data) {
      return Buffer.from(plain.body.data, "base64url").toString("utf-8");
    }
    const html = payload.parts.find((p: any) => p.mimeType === "text/html");
    if (html?.body?.data) {
      const raw = Buffer.from(html.body.data, "base64url").toString("utf-8");
      // Strip HTML tags for plain text storage
      return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
    // Recurse into nested multipart
    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
  }
  return "";
}

/** Collect attachment metadata from a Gmail message part tree */
function collectAttachmentParts(payload: any, parts: any[] = []): any[] {
  if (!payload) return parts;
  if (payload.filename && payload.body?.attachmentId) {
    parts.push(payload);
  }
  if (payload.parts) {
    for (const p of payload.parts) collectAttachmentParts(p, parts);
  }
  return parts;
}

/** Get header value from Gmail message headers array */
function getHeader(headers: any[], name: string): string {
  return headers?.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** Parse email address from a header value like "Name <email@example.com>" */
function parseEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim().toLowerCase();
}

/** Parse all email addresses from a comma-separated header */
function parseAllEmails(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => parseEmailAddress(s))
    .filter(Boolean);
}

/** Normalize phone number to digits only for matching */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

interface MatchedEntity {
  leadId: number | null;
  clientId: number | null;
  projectId: number | null;
}

/**
 * Find the lead or client that matches any of the given email addresses or phone numbers.
 * Checks all email/phone fields (email, email2, email3, phone, phone2, phone3).
 */
async function matchEntity(
  db: any,
  emailAddresses: string[],
  phoneNumbers: string[]
): Promise<MatchedEntity> {
  const result: MatchedEntity = { leadId: null, clientId: null, projectId: null };
  if (!emailAddresses.length && !phoneNumbers.length) return result;

  // Filter out our own addresses
  const externalEmails = emailAddresses.filter(
    (e) => !WATCHED_ADDRESSES.includes(e.toLowerCase())
  );
  const normalizedPhones = phoneNumbers.map(normalizePhone).filter((p) => p.length >= 7);

  // Search leads by email
  if (externalEmails.length) {
    const allLeads = await db.select({
      id: leads.id,
      email: leads.email,
      email2: leads.email2,
      email3: leads.email3,
      phone: leads.phone,
      phone2: leads.phone2,
      phone3: leads.phone3,
    }).from(leads).limit(500);

    for (const lead of allLeads) {
      const leadEmails = [lead.email, lead.email2, lead.email3]
        .filter(Boolean)
        .map((e: string) => e.toLowerCase());
      const leadPhones = [lead.phone, lead.phone2, lead.phone3]
        .filter(Boolean)
        .map((p: string) => normalizePhone(p));

      const emailMatch = externalEmails.some((e) => leadEmails.includes(e));
      const phoneMatch = normalizedPhones.some((p) => leadPhones.some((lp) => lp && lp.endsWith(p.slice(-7))));

      if (emailMatch || phoneMatch) {
        result.leadId = lead.id;
        return result;
      }
    }
  }

  // Search clients by email
  if (externalEmails.length) {
    const allClients = await db.select({
      id: clients.id,
      email: clients.email,
    }).from(clients).limit(500);

    for (const client of allClients) {
      if (client.email && externalEmails.includes(client.email.toLowerCase())) {
        result.clientId = client.id;
        return result;
      }
    }
  }

  return result;
}

export interface GmailSyncResult {
  account: string;
  newMessages: number;
  errors: string[];
}

/**
 * Sync Gmail for a single account.
 * Uses the shared OAuth2 client (both addresses are on the same Google account).
 */
export async function syncGmailAccount(
  accountEmail: string
): Promise<GmailSyncResult> {
  const result: GmailSyncResult = { account: accountEmail, newMessages: 0, errors: [] };

  const auth = getOAuth2Client();
  if (!auth) {
    result.errors.push("Google OAuth2 credentials not configured");
    return result;
  }

  const db = await getDb();
  if (!db) {
    result.errors.push("Database unavailable");
    return result;
  }

  const gmail = google.gmail({ version: "v1", auth });

  try {
    // Get or create sync state for this account
    const [syncState] = await db
      .select()
      .from(gmailSyncState)
      .where(eq(gmailSyncState.accountEmail, accountEmail))
      .limit(1);

    // Build query: emails involving this address in last 90 days (or since last sync)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - INITIAL_LOOKBACK_DAYS);
    const afterTimestamp = Math.floor(cutoffDate.getTime() / 1000);

    // Search both inbox and sent mail involving this address
    const query = `(to:${accountEmail} OR from:${accountEmail}) after:${afterTimestamp}`;

    // List all matching message IDs
    let allMessageIds: string[] = [];
    let pageToken: string | undefined;

    do {
      const listRes = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 500,
        pageToken,
      });
      const msgs = listRes.data.messages ?? [];
      allMessageIds.push(...msgs.map((m: any) => m.id!).filter(Boolean));
      pageToken = listRes.data.nextPageToken ?? undefined;
    } while (pageToken);

    if (!allMessageIds.length) {
      // Update sync state
      await upsertSyncState(db, accountEmail, null, 0);
      return result;
    }

    // Find which message IDs we already have
    const existingRows = await db
      .select({ gmailMessageId: messages.gmailMessageId })
      .from(messages)
      .where(
        inArray(
          messages.gmailMessageId,
          allMessageIds.slice(0, 1000) // MySQL IN limit safety
        )
      );
    const existingIds = new Set(existingRows.map((r: any) => r.gmailMessageId));

    const newIds = allMessageIds.filter((id) => !existingIds.has(id));

    // Process new messages in batches
    let lastHistoryId: string | null = null;
    for (const msgId of newIds) {
      try {
        const msgRes = await gmail.users.messages.get({
          userId: "me",
          id: msgId,
          format: "full",
        });
        const msg = msgRes.data;
        lastHistoryId = msg.historyId ?? lastHistoryId;

        const headers = msg.payload?.headers ?? [];
        const fromRaw = getHeader(headers, "From");
        const toRaw = getHeader(headers, "To");
        const ccRaw = getHeader(headers, "Cc");
        const subject = getHeader(headers, "Subject");
        const dateStr = getHeader(headers, "Date");

        const fromEmail = parseEmailAddress(fromRaw);
        const fromName = fromRaw.replace(/<[^>]+>/, "").trim().replace(/^"|"$/g, "");
        const toEmails = parseAllEmails(toRaw + (ccRaw ? "," + ccRaw : ""));
        const allEmails = [fromEmail, ...toEmails].filter(Boolean);

        // Determine direction
        const isOutbound = WATCHED_ADDRESSES.includes(fromEmail.toLowerCase());
        const direction = isOutbound ? "outbound" : "inbound";

        // Extract body
        const body = extractBody(msg.payload);
        if (!body.trim()) continue; // Skip empty messages

        // Match to lead/client
        const matched = await matchEntity(db, allEmails, []);

        // Process attachments
        const attachmentParts = collectAttachmentParts(msg.payload);
        const attachments: Array<{ name: string; url: string; mime: string; size: number }> = [];

        for (const part of attachmentParts) {
          try {
            const attRes = await gmail.users.messages.attachments.get({
              userId: "me",
              messageId: msgId,
              id: part.body.attachmentId,
            });
            const attData = attRes.data.data;
            if (!attData) continue;
            const buffer = Buffer.from(attData, "base64url");
            const safeFilename = part.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
            const key = `gmail-attachments/${msgId}/${safeFilename}`;
            const { url } = await storagePut(key, buffer, part.mimeType ?? "application/octet-stream");
            attachments.push({
              name: part.filename,
              url,
              mime: part.mimeType ?? "application/octet-stream",
              size: buffer.length,
            });

            // Also save to documents table if matched to a lead/project
            if (matched.leadId || matched.clientId) {
              try {
                const { documents } = await import("../drizzle/schema");
                await db.insert(documents).values({
                  leadId: matched.leadId ?? undefined,
                  clientId: matched.clientId ?? undefined,
                  docType: "other",
                  fileName: part.filename,
                  fileUrl: url,
                  fileKey: key,
                  mimeType: part.mimeType ?? "application/octet-stream",
                  fileSize: buffer.length,
                  isPublic: true,
                  description: `Email attachment from: ${subject || "(no subject)"}`,
                });
              } catch (_docErr) {
                // Non-fatal — attachment still saved to S3
              }
            }
          } catch (attErr: any) {
            result.errors.push(`Attachment error for msg ${msgId}: ${attErr?.message}`);
          }
        }

        // Parse sent date
        const sentAt = dateStr ? new Date(dateStr) : new Date(Number(msg.internalDate));

        // Build the message row
        const msgRow: any = {
          leadId: matched.leadId ?? undefined,
          clientId: matched.clientId ?? undefined,
          threadType: "lead",
          direction,
          channel: "email",
          fromName: fromName || undefined,
          fromEmail,
          toEmail: toEmails.filter((e) => !WATCHED_ADDRESSES.includes(e)).join(", ") || undefined,
          body: body.slice(0, 10000), // cap at 10k chars
          subject: subject || undefined,
          gmailMessageId: msgId,
          gmailThreadId: msg.threadId ?? undefined,
          accountEmail,
          attachmentsJson: attachments.length ? JSON.stringify(attachments) : undefined,
          attachmentUrl: attachments[0]?.url ?? undefined,
          attachmentName: attachments[0]?.name ?? undefined,
          attachmentMime: attachments[0]?.mime ?? undefined,
          status: "received",
          isRead: false,
          sentAt,
          createdAt: sentAt,
        };

        await db.insert(messages).values(msgRow);
        result.newMessages++;

        // ── If this is an inbound email, check for open question tasks and notify owner ──
        if (direction === "inbound" && (matched.leadId || matched.clientId)) {
          try {
            // Find open question tasks for projects linked to this lead/client
            const linkedProjects = await db
              .select({ id: projects.id })
              .from(projects)
              .where(
                matched.leadId
                  ? eq(projects.leadId, matched.leadId)
                  : eq(projects.clientId, matched.clientId!)
              );

            let isQuestionReply = false;
            let questionTaskTitle = "";

            for (const proj of linkedProjects) {
              const openTasks = await db
                .select()
                .from(projectTasks)
                .where(
                  and(
                    eq(projectTasks.projectId, proj.id),
                    ne(projectTasks.status, "completed")
                  )
                );
              const questionTasks = openTasks.filter(
                (t: any) => t.category && t.category.toLowerCase().includes("question")
              );
              if (questionTasks.length > 0) {
                isQuestionReply = true;
                questionTaskTitle = questionTasks[0].title ?? "";
                // Mark the first open question task as completed
                await db
                  .update(projectTasks)
                  .set({ status: "completed" } as any)
                  .where(eq(projectTasks.id, questionTasks[0].id));
                break;
              }
            }

            // Always notify owner of inbound emails that may need a response
            const preview = body.length > 200 ? body.substring(0, 200) + "…" : body;
            const urgencyPrefix = isQuestionReply
              ? `✅ QUESTION ANSWERED — "${questionTaskTitle}"\n\n`
              : "";
            const notifContent = [
              `${urgencyPrefix}From: ${fromName || fromEmail}`,
              `Subject: ${subject || "(no subject)"}`,
              `Message: "${preview}"`,
              isQuestionReply
                ? `The client has replied to the open question task. It has been marked as completed.`
                : `This email may need your attention. Please check the Messages tab.`,
            ]
              .filter(Boolean)
              .join("\n");

            await notifyOwner({
              title: isQuestionReply
                ? `📧 Question Answered via Email — ${fromName || fromEmail}`
                : `📧 New Email Reply — ${fromName || fromEmail} (needs attention)`,
              content: notifContent,
            });
          } catch (notifyErr) {
            console.warn("[GmailSync] Owner notification failed:", notifyErr);
          }
        }

        // ── Check if this inbound email is a reply to an open RFI thread ──
        if (direction === "inbound" && subject) {
          try {
            const { rfis, rfiThreads: rfiThreadsTable } = await import("../drizzle/schema");
            // Match by subject containing RFI title (replies have "Re: <rfi title>")
            const subjectLower = subject.toLowerCase().replace(/^re:\s*/i, "").trim();
            const openRfis = await db.select().from(rfis)
              .where(eq(rfis.status, "sent"));
            const matchedRfi = openRfis.find(r =>
              subjectLower.includes(r.title.toLowerCase()) ||
              r.title.toLowerCase().includes(subjectLower)
            );
            if (matchedRfi) {
              await db.insert(rfiThreadsTable).values({
                rfiId: matchedRfi.id,
                projectId: matchedRfi.projectId,
                direction: "inbound",
                senderName: fromName || fromEmail,
                senderEmail: fromEmail,
                subject,
                body: body.slice(0, 10000),
                gmailMessageId: msgId,
                gmailThreadId: msg.threadId ?? undefined,
                createdAt: sentAt,
              });
              await notifyOwner({
                title: `📋 RFI Reply Received — ${matchedRfi.title}`,
                content: `From: ${fromName || fromEmail}\nRFI: ${matchedRfi.title}\nMessage: "${body.slice(0, 200)}"`,
              });
            }
          } catch (rfiErr) {
            console.warn("[GmailSync] RFI thread matching failed:", rfiErr);
          }
        }
      } catch (msgErr: any) {
        result.errors.push(`Message ${msgId}: ${msgErr?.message}`);
      }
    }

    await upsertSyncState(db, accountEmail, lastHistoryId, result.newMessages);
  } catch (err: any) {
    result.errors.push(`Sync failed: ${err?.message}`);
  }

  return result;
}

async function upsertSyncState(
  db: any,
  accountEmail: string,
  historyId: string | null,
  count: number
) {
  const [existing] = await db
    .select()
    .from(gmailSyncState)
    .where(eq(gmailSyncState.accountEmail, accountEmail))
    .limit(1);

  if (existing) {
    await db
      .update(gmailSyncState)
      .set({
        lastHistoryId: historyId ?? existing.lastHistoryId,
        lastSyncAt: new Date(),
        syncedCount: (existing.syncedCount ?? 0) + count,
      })
      .where(eq(gmailSyncState.accountEmail, accountEmail));
  } else {
    await db.insert(gmailSyncState).values({
      accountEmail,
      lastHistoryId: historyId ?? undefined,
      lastSyncAt: new Date(),
      syncedCount: count,
    });
  }
}

/**
 * Sync all watched Gmail accounts.
 * Called by the hourly cron and by the manual tRPC trigger.
 */
export async function syncAllGmailAccounts(): Promise<GmailSyncResult[]> {
  const results: GmailSyncResult[] = [];
  // Both addresses are on the same Google account (cpenterprisessc.com).
  // We run two separate syncs with different query addresses so each account
  // gets its own sync state and message attribution.
  for (const address of WATCHED_ADDRESSES) {
    const r = await syncGmailAccount(address);
    results.push(r);
    console.log(
      `[GmailSync] ${address}: +${r.newMessages} messages${r.errors.length ? " | errors: " + r.errors.join("; ") : ""}`
    );
  }
  return results;
}
