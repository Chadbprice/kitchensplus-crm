/**
 * SMS module — ClickSend REST API
 * Auth: HTTP Basic (username:apiKey base64-encoded).
 * Endpoint: POST https://rest.clicksend.com/v3/sms/send
 *
 * TCPA Compliance:
 *  - Every outbound message appends the standard footer.
 *  - isFirstContact=true sends a consent message BEFORE the actual content.
 *  - Before any send, the sms_opt_outs table is checked; opted-out numbers are skipped silently.
 *
 * Known failure modes (surfaced in logs):
 *  - COUNTRY_NOT_ENABLED: toll-free number registration is pending at ClickSend/carrier level.
 *    Fix: complete toll-free verification at app.clicksend.com → Numbers.
 *  - SMS provider not configured: CLICKSEND_USERNAME or CLICKSEND_API_KEY env vars are missing.
 *  - opted_out: recipient has sent STOP — message is silently skipped (TCPA compliant).
 */

import { getDb } from "./db";
import { smsOptOuts } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const CLICKSEND_API_URL = "https://rest.clicksend.com/v3/sms/send";
const FROM_NUMBER = process.env.CLICKSEND_FROM ?? "KitchensPlus";

/** Standard TCPA footer appended to every outbound message. */
const TCPA_FOOTER =
  "\n\nQuestions? Text back here any time or call Chad at 864-567-8777. | Reply STOP to opt out. Msg & data rates may apply. Kitchens Plus Upstate.";

/** Consent message sent ONCE before the actual content when isFirstContact=true. */
const FIRST_CONTACT_CONSENT =
  "Hi! This is Kitchens Plus Upstate. You are receiving project updates and appointment reminders by text from us. Msg & data rates may apply. Reply STOP to opt out at any time, HELP for info. Questions? Call Chad at 864-567-8777.";

export interface SendSmsOptions {
  to: string;
  message: string;
  /** When true, a TCPA consent message is sent BEFORE the actual content. */
  isFirstContact?: boolean;
}

export interface SendSmsResult {
  success: boolean;
  messageId?: string;
  /** Machine-readable error code, e.g. "COUNTRY_NOT_ENABLED", "opted_out", "SMS provider not configured" */
  error?: string;
}

/** Normalise a phone number to E.164 (+1XXXXXXXXXX for US numbers). */
export function normalizeE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

/** Build the Basic Auth header value from env vars. */
function getAuthHeader(): string | null {
  const username = process.env.CLICKSEND_USERNAME;
  const apiKey = process.env.CLICKSEND_API_KEY;
  if (!username || !apiKey) return null;
  return "Basic " + Buffer.from(`${username}:${apiKey}`).toString("base64");
}

/** Send a single raw message via ClickSend (no footer, no opt-out check). */
async function sendRaw(to: string, body: string): Promise<SendSmsResult> {
  const auth = getAuthHeader();
  if (!auth) {
    console.warn("[SMS] ⚠ BLOCKED — CLICKSEND_USERNAME or CLICKSEND_API_KEY env var is missing. SMS not sent.");
    return { success: false, error: "SMS provider not configured" };
  }

  const payload = {
    messages: [
      {
        source: "kitchensplus-crm",
        from: FROM_NUMBER,
        to,
        body,
      },
    ],
  };

  console.log(`[SMS] → Attempting send to ${to} from ${FROM_NUMBER} (${body.length} chars)`);

  try {
    const res = await fetch(CLICKSEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify(payload),
    });

    const json = (await res.json()) as any;

    if (!res.ok) {
      const errMsg = json?.response_msg ?? `HTTP ${res.status}`;
      console.error(`[SMS] ✗ HTTP error ${res.status}: ${errMsg}`);
      return { success: false, error: errMsg };
    }

    const msgData = json?.data?.messages?.[0];
    const status: string = msgData?.status ?? "";
    const messageId: string = msgData?.message_id ?? "";

    if (status === "SUCCESS" || status === "QUEUED") {
      console.log(`[SMS] ✓ Accepted by ClickSend — to: ${to}, id: ${messageId}, status: ${status}`);
      return { success: true, messageId };
    }

    // Surface known blocking statuses with actionable guidance
    if (status === "COUNTRY_NOT_ENABLED") {
      console.error(
        `[SMS] ✗ BLOCKED — COUNTRY_NOT_ENABLED for ${to}. ` +
        `The toll-free number ${FROM_NUMBER} registration is pending at ClickSend. ` +
        `Action required: log in to app.clicksend.com → Numbers → complete toll-free verification.`
      );
    } else {
      console.error(`[SMS] ✗ Non-success status from ClickSend — to: ${to}, status: ${status}, id: ${messageId}`);
    }

    return { success: false, error: status || "Unknown SMS status" };
  } catch (err: any) {
    console.error(`[SMS] ✗ Network error sending to ${to}:`, err?.message ?? err);
    return { success: false, error: err?.message ?? "Network error" };
  }
}

// ── In-memory rate limiter: max 10 SMS per phone per hour ─────────────────
// Prevents accidental send loops from automation re-triggering.
const SMS_RATE_LIMIT_MAX = 10;
const SMS_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const _smsRateMap = new Map<string, number[]>(); // phone → send timestamps

function checkSmsRateLimit(phone: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const windowStart = now - SMS_RATE_LIMIT_WINDOW_MS;
  const timestamps = (_smsRateMap.get(phone) ?? []).filter(t => t > windowStart);
  if (timestamps.length >= SMS_RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 };
  }
  timestamps.push(now);
  _smsRateMap.set(phone, timestamps);
  return { allowed: true, remaining: SMS_RATE_LIMIT_MAX - timestamps.length };
}

/**
 * Primary send function.
 * 1. Normalises the phone number.
 * 2. Checks sms_opt_outs — skips silently if opted out.
 * 3. Checks in-memory rate limit (max 10/hr per phone).
 * 4. If isFirstContact, sends the consent message first.
 * 5. Appends TCPA footer to the actual message and sends it.
 */
export async function sendSms(opts: SendSmsOptions): Promise<SendSmsResult>;
/** Overload: legacy positional signature used by some call sites. */
export async function sendSms(to: string, message: string): Promise<SendSmsResult>;
export async function sendSms(
  optsOrTo: SendSmsOptions | string,
  legacyMessage?: string
): Promise<SendSmsResult> {
  let to: string;
  let message: string;
  let isFirstContact = false;

  if (typeof optsOrTo === "string") {
    to = optsOrTo;
    message = legacyMessage ?? "";
    isFirstContact = false;
  } else {
    to = optsOrTo.to;
    message = optsOrTo.message;
    isFirstContact = optsOrTo.isFirstContact ?? false;
  }

  const normalizedTo = normalizeE164(to);

  // ── Rate limit check ──────────────────────────────────────────────────────
  const rateCheck = checkSmsRateLimit(normalizedTo);
  if (!rateCheck.allowed) {
    console.warn(`[SMS] ⚠ RATE LIMITED — ${normalizedTo} has exceeded ${SMS_RATE_LIMIT_MAX} messages/hour. Message dropped.`);
    return { success: false, error: "rate_limited" };
  }

  // ── Opt-out check ──────────────────────────────────────────────────────────
  try {
    const db = await getDb();
    if (db) {
      const [optOut] = await db
        .select({ phone: smsOptOuts.phone })
        .from(smsOptOuts)
        .where(eq(smsOptOuts.phone, normalizedTo))
        .limit(1);
      if (optOut) {
        console.log(`[SMS] Skipped — ${normalizedTo} has opted out (TCPA compliant)`);
        return { success: false, error: "opted_out" };
      }
    }
  } catch (dbErr: any) {
    console.warn("[SMS] Could not check opt-out table:", dbErr?.message);
  }

  // ── First-contact consent message ─────────────────────────────────────────
  if (isFirstContact) {
    await sendRaw(normalizedTo, FIRST_CONTACT_CONSENT);
  }

  // ── Actual message with TCPA footer ───────────────────────────────────────
  const fullBody = message + TCPA_FOOTER;
  return sendRaw(normalizedTo, fullBody);
}

// ── Legacy alias ───────────────────────────────────────────────────────────
/** @deprecated Use sendSms() instead. */
export const sendSMS = sendSms;

/**
 * Validate ClickSend credentials by hitting the account endpoint.
 * Returns true only if credentials are set AND the API responds 200.
 */
export async function validateClickSendCredentials(): Promise<boolean> {
  const auth = getAuthHeader();
  if (!auth) return false;
  try {
    const res = await fetch("https://rest.clicksend.com/v3/account", {
      headers: { Authorization: auth },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Check the registration status of the configured sender number.
 * Returns the status label from ClickSend, or null if unavailable.
 * Used for startup diagnostics and the SMS settings page.
 */
export async function getSenderNumberStatus(): Promise<{
  number: string;
  status: string;
  description: string;
} | null> {
  const auth = getAuthHeader();
  if (!auth) return null;
  try {
    const res = await fetch("https://rest.clicksend.com/v3/numbers", {
      headers: { Authorization: auth },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const numbers: any[] = json?.data?.data ?? [];
    const match = numbers.find((n: any) => n.dedicated_number === FROM_NUMBER);
    if (!match) return null;
    return {
      number: match.dedicated_number,
      status: match.status?.name ?? match.status?.label ?? "Unknown",
      description: match.status?.description ?? "",
    };
  } catch {
    return null;
  }
}
