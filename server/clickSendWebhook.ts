/**
 * ClickSend Inbound SMS Webhook
 * POST /api/webhooks/clicksend/sms
 *
 * ClickSend sends a JSON body with the inbound message details.
 * Handles TCPA keywords: STOP, START, HELP.
 * Stores all other inbound messages in the messages table.
 */
import type { Express } from "express";
import { getDb } from "./db";
import { messages, leads, clients, projects, smsOptOuts, projectTasks, taskAssignees } from "../drizzle/schema";
import { eq, and, ne } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";

const BUSINESS_NAME = "Kitchens Plus Upstate";
const BUSINESS_PHONE = "+1 (833) 518-4811";
const CHAD_PHONE = "864-567-8777";

/** Send a plain-text reply via ClickSend REST API. */
async function sendReply(to: string, body: string): Promise<void> {
  const username = process.env.CLICKSEND_USERNAME;
  const apiKey = process.env.CLICKSEND_API_KEY;
  if (!username || !apiKey) return;

  const auth = "Basic " + Buffer.from(`${username}:${apiKey}`).toString("base64");
  const from = process.env.CLICKSEND_FROM ?? "KitchensPlus";

  try {
    await fetch("https://rest.clicksend.com/v3/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({
        messages: [{ source: "kitchensplus-crm", from, to, body }],
      }),
    });
  } catch (err: any) {
    console.error("[ClickSendWebhook] Reply send error:", err?.message);
  }
}

/** Normalise phone to E.164 for matching. */
function normalizeE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

export function registerClickSendWebhook(app: Express) {
  app.post("/api/webhooks/clicksend/sms", async (req, res) => {
    try {
      // ClickSend sends JSON; fall back to form-encoded fields for compatibility
      const payload = req.body ?? {};

      // ClickSend inbound payload fields (v3 format)
      const from: string =
        payload.from ?? payload.From ?? payload.mobile_number ?? "";
      const msgBody: string =
        payload.body ?? payload.Body ?? payload.message ?? "";
      const messageId: string =
        payload.message_id ?? payload.MessageSid ?? "";

      if (!from || !msgBody) {
        res.status(200).json({ success: true });
        return;
      }

      const normalizedFrom = normalizeE164(from);
      const keyword = msgBody.trim().toUpperCase();

      const db = await getDb();
      if (!db) {
        res.status(200).json({ success: true });
        return;
      }

      // ── STOP ────────────────────────────────────────────────────────────────
      if (keyword === "STOP" || keyword.startsWith("STOP ")) {
        await db
          .insert(smsOptOuts)
          .values({ phone: normalizedFrom })
          .onDuplicateKeyUpdate({ set: { optedOutAt: new Date() } });

        await sendReply(
          normalizedFrom,
          `You have been unsubscribed from ${BUSINESS_NAME} messages. Reply START to resubscribe.`
        );
        console.log(`[ClickSendWebhook] STOP received — opted out ${normalizedFrom}`);
        res.status(200).json({ success: true });
        return;
      }

      // ── START ────────────────────────────────────────────────────────────────
      if (keyword === "START" || keyword.startsWith("START ")) {
        await db
          .delete(smsOptOuts)
          .where(eq(smsOptOuts.phone, normalizedFrom));

        await sendReply(
          normalizedFrom,
          `You have been resubscribed to ${BUSINESS_NAME} messages.`
        );
        console.log(`[ClickSendWebhook] START received — re-subscribed ${normalizedFrom}`);
        res.status(200).json({ success: true });
        return;
      }

      // ── HELP ─────────────────────────────────────────────────────────────────
      if (keyword === "HELP" || keyword.startsWith("HELP ")) {
        await sendReply(
          normalizedFrom,
          `${BUSINESS_NAME} — ${BUSINESS_PHONE}. Reply STOP to stop receiving messages, START to resume. Msg & data rates may apply.`
        );
        console.log(`[ClickSendWebhook] HELP received from ${normalizedFrom}`);
        res.status(200).json({ success: true });
        return;
      }

      // ── Regular inbound message — store in messages table ─────────────────
      const normalizePhone = (p: string) => p.replace(/\D/g, "").slice(-10);
      const fromNormalized10 = normalizePhone(from);

      let projectId: number | undefined;
      let leadId: number | undefined;
      let clientId: number | undefined;
      let fromName = from;

      // Match against leads
      const allLeads = await db
        .select({ id: leads.id, phone: leads.phone, name: leads.name })
        .from(leads);
      const matchedLead = allLeads.find(
        (l) => l.phone && normalizePhone(l.phone) === fromNormalized10
      );
      if (matchedLead) {
        leadId = matchedLead.id;
        fromName = matchedLead.name;
        const projRows = await db
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.leadId, matchedLead.id))
          .limit(1);
        if (projRows[0]) projectId = projRows[0].id;
      }

      // Match against clients if no lead found
      if (!leadId) {
        const allClients = await db
          .select({ id: clients.id, phone: clients.phone, name: clients.name })
          .from(clients);
        const matchedClient = allClients.find(
          (c) => c.phone && normalizePhone(c.phone) === fromNormalized10
        );
        if (matchedClient) {
          clientId = matchedClient.id;
          fromName = matchedClient.name;
          const projRows = await db
            .select({ id: projects.id })
            .from(projects)
            .where(eq(projects.clientId, matchedClient.id))
            .limit(1);
          if (projRows[0]) projectId = projRows[0].id;
        }
      }

      await db.insert(messages).values({
        projectId: projectId ?? null,
        leadId: leadId ?? null,
        clientId: clientId ?? null,
        threadType: "client",
        direction: "inbound",
        channel: "sms",
        fromName,
        fromPhone: from,
        body: msgBody,
        status: "received",
        sentAt: new Date(),
        externalId: messageId,
      } as any);

      console.log(
        `[ClickSendWebhook] Stored inbound SMS from ${from} (${fromName}): "${msgBody.substring(0, 60)}"`
      );

      // ── Check if this reply is answering an open question task ───────────────
      let isQuestionReply = false;
      let questionTaskTitle = "";
      if (leadId || clientId) {
        try {
          // Find open question tasks for projects linked to this lead/client
          const openProjects = await db
            .select({ id: projects.id })
            .from(projects)
            .where(leadId ? eq(projects.leadId, leadId) : eq(projects.clientId, clientId!));

          for (const proj of openProjects) {
            const openQuestions = await db
              .select()
              .from(projectTasks)
              .where(
                and(
                  eq(projectTasks.projectId, proj.id),
                  ne(projectTasks.status, "completed")
                )
              );
            const questionTasks = openQuestions.filter(
              (t) => t.category && t.category.toLowerCase().includes("question")
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
        } catch (qErr) {
          console.warn("[ClickSendWebhook] Question task check failed:", qErr);
        }
      }

      // ── Notify owner of every inbound SMS reply ───────────────────────────────
      try {
        const preview = msgBody.length > 120 ? msgBody.substring(0, 120) + "…" : msgBody;
        const urgencyPrefix = isQuestionReply
          ? `✅ QUESTION ANSWERED — "${questionTaskTitle}"\n\n`
          : "";
        // Build a deep-link to the Messages thread for this contact
        const appOrigin = "https://kitchenscrm-njbauvnb.manus.space";
        let replyLink = `${appOrigin}/messages`;
        if (leadId) replyLink += `?lead=${leadId}`;
        else if (clientId) replyLink += `?client=${clientId}`;

        const notifContent = [
          `${urgencyPrefix}From: ${fromName} (${from})`,
          `Message: "${preview}"`,
          projectId ? `Project ID: ${projectId}` : null,
          isQuestionReply
            ? `The client has replied to the open question task. It has been marked as completed.`
            : `This reply may need your attention.`,
          ``,
          `👉 Reply now: ${replyLink}`,
          ``,
          `Call Chad at ${CHAD_PHONE} for urgent matters.`,
        ]
          .filter(Boolean)
          .join("\n");

        await notifyOwner({
          title: isQuestionReply
            ? `📬 Question Answered via SMS — ${fromName}`
            : `📱 New SMS Reply — ${fromName} (needs attention)`,
          content: notifContent,
        });
      } catch (notifyErr) {
        console.warn("[ClickSendWebhook] Owner notification failed:", notifyErr);
      }

      res.status(200).json({ success: true });
    } catch (err: any) {
      console.error("[ClickSendWebhook] Error:", err?.message ?? err);
      res.status(200).json({ success: true }); // Always 200 to prevent retries
    }
  });
}
