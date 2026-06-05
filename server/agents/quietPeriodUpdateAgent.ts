/**
 * Quiet-Period Proactive Update Agent
 *
 * Runs daily. For each active project where no outbound client communication
 * has occurred in QUIET_PERIOD_DAYS (default 5), generates a proactive
 * "check-in" draft and routes it to the approval queue.
 *
 * This is separate from the weekly Monday schedule — it catches communication
 * gaps mid-week and ensures no client goes too long without hearing from us.
 *
 * All drafts require owner approval before sending.
 */
import { getDb } from "../db";
import {
  projects, milestones, projectTasks, messages, clients, leads,
} from "../../drizzle/schema";
import { eq, and, desc, gte, isNotNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { createApprovalItem, pendingApprovalExists } from "./approvalQueue";
import { memGet, memSet, agentKey } from "./sharedMemory";
import { logAgentRun } from "./agentRunner";
import {
  QUIET_PERIOD_DAYS as QUIET_PERIOD_DAYS_CONFIG,
  QUIET_PERIOD_COOLDOWN_DAYS,
} from "../../shared/operationalConfig";

const AGENT_NAME = "QuietPeriodUpdateAgent";

/** Days without outbound communication before triggering a proactive update */
export const QUIET_PERIOD_DAYS = QUIET_PERIOD_DAYS_CONFIG;

/** Cooldown: don't re-draft for the same project within this window */
const COOLDOWN_MS = QUIET_PERIOD_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

export async function runQuietPeriodUpdateAgent(): Promise<void> {
  const runId = await logAgentRun(AGENT_NAME, "started", {});
  const db = await getDb();
  if (!db) {
    await logAgentRun(AGENT_NAME, "failed", { error: "No DB" }, runId);
    return;
  }

  try {
    const now = new Date();
    const quietCutoff = new Date(now.getTime() - QUIET_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    // Get all active projects
    const activeProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.status, "active"));

    // Get last outbound client message per project
    const recentOutbound = await db
      .select({
        projectId: messages.projectId,
        latestSentAt: sql<Date>`MAX(${messages.createdAt})`,
      })
      .from(messages)
      .where(
        and(
          eq(messages.direction, "outbound"),
          eq(messages.threadType, "client"),
          isNotNull(messages.projectId),
        )
      )
      .groupBy(messages.projectId);

    const lastMessageByProject = new Map<number, Date>();
    for (const row of recentOutbound) {
      if (row.projectId) lastMessageByProject.set(row.projectId, new Date(row.latestSentAt));
    }

    let drafted = 0;

    for (const project of activeProjects) {
      // Skip if no client contact
      if (!project.clientId && !project.leadId) continue;

      // Check communication gap
      const lastMsg = lastMessageByProject.get(project.id);
      if (lastMsg && lastMsg >= quietCutoff) continue; // Recently communicated

      // Cooldown: skip if already drafted recently
      const cooldownKey = agentKey(AGENT_NAME, "quiet", String(project.id));
      const lastRun = await memGet(cooldownKey);
      if (lastRun && now.getTime() - Number(lastRun) < COOLDOWN_MS) continue;

      // Dedup: skip if a pending weekly/proactive update already exists
      const hasPending = await pendingApprovalExists("project", project.id, "weekly_client_update");
      if (hasPending) continue;

      // Resolve client info
      let clientName = "Valued Client";
      let clientEmail: string | null = null;
      let clientPhone: string | null = null;

      if (project.clientId) {
        const [client] = await db.select().from(clients).where(eq(clients.id, project.clientId)).limit(1);
        if (client) {
          clientName = client.name ?? clientName;
          clientEmail = client.email ?? null;
          clientPhone = client.phone ?? null;
        }
      } else if (project.leadId) {
        const [lead] = await db.select().from(leads).where(eq(leads.id, project.leadId)).limit(1);
        if (lead) {
          clientName = lead.name ?? clientName;
          clientEmail = lead.email ?? null;
          clientPhone = lead.phone ?? null;
        }
      }

      const firstName = clientName.split(" ")[0];
      const projectName = project.name ?? "Renovation Project";
      const daysSinceContact = lastMsg
        ? Math.floor((now.getTime() - lastMsg.getTime()) / (24 * 60 * 60 * 1000))
        : null;

      // Gather project context for LLM
      const projectMilestones = await db
        .select({ title: milestones.title, status: milestones.status })
        .from(milestones)
        .where(eq(milestones.projectId, project.id));

      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const recentTasks = await db
        .select({ title: projectTasks.title, status: projectTasks.status })
        .from(projectTasks)
        .where(and(
          eq(projectTasks.projectId, project.id),
          gte(projectTasks.updatedAt, sevenDaysAgo),
        ))
        .orderBy(desc(projectTasks.updatedAt))
        .limit(8);

      const inProgressMilestones = projectMilestones.filter(m => m.status === "in_progress").map(m => m.title).join(", ");
      const upcomingMilestones = projectMilestones.filter(m => m.status === "pending").map(m => m.title).join(", ");
      const recentTaskNames = recentTasks.map(t => `${t.title} (${t.status})`).join(", ");

      // Generate draft
      let draftMessage = `Hi ${firstName},\n\nWe wanted to check in on your ${projectName} project. ${inProgressMilestones ? `We're currently working on ${inProgressMilestones}.` : "Work is progressing well."} ${recentTaskNames ? `Recent activity includes: ${recentTasks.filter(t => t.status === "completed").map(t => t.title).join(", ") || "ongoing work"}.` : ""}\n\n${upcomingMilestones ? `Coming up next: ${upcomingMilestones}.` : "We'll share the next phase timeline shortly."}\n\nAs always, please don't hesitate to reach out with any questions. We're committed to making this a seamless experience for you.\n\nWarm regards,\nKitchens Plus Upstate`;

      try {
        const prompt = `You are a luxury renovation company's client communication specialist for Kitchens Plus Upstate.

Project: ${projectName}
Client: ${clientName}
${daysSinceContact ? `Days since last contact: ${daysSinceContact}` : "No previous outbound messages recorded"}
${inProgressMilestones ? `Currently in progress: ${inProgressMilestones}` : ""}
${upcomingMilestones ? `Upcoming milestones: ${upcomingMilestones}` : ""}
${recentTaskNames ? `Recent task activity: ${recentTaskNames}` : ""}

Write a brief, warm, proactive check-in email (2-3 short paragraphs).
- Start with "Hi ${firstName},"
- This is a proactive check-in — the client hasn't heard from us in a while
- Mention what's been happening and what's coming next
- Invite them to reach out with questions or concerns
- Tone: premium, warm, reassuring — like a private designer keeping their client informed
- Do NOT include placeholder text like [DATE] or [CONTACT INFO]
- Do NOT include a subject line — just the email body
- Sign off as "Kitchens Plus Upstate"
- Keep it under 200 words`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: "You write premium client communication for a luxury renovation company. Be concise and warm." },
            { role: "user", content: prompt },
          ],
        });
        const text = response?.choices?.[0]?.message?.content?.trim() ?? "";
        if (text.length > 30) {
          draftMessage = text;
        }
      } catch {
        // Use deterministic fallback
      }

      const subject = `Project Check-In — ${projectName}`;

      // Route to approval queue
      await createApprovalItem({
        agentName: AGENT_NAME,
        actionType: "weekly_client_update",
        severity: "low",
        title: `📬 Proactive check-in draft — ${projectName} → ${clientName}${daysSinceContact ? ` (${daysSinceContact}d quiet)` : ""}`,
        description: `Client: ${clientName}${clientEmail ? ` (${clientEmail})` : ""}${clientPhone ? ` | ${clientPhone}` : ""}\n${daysSinceContact ? `Days since last contact: ${daysSinceContact}` : "No outbound messages on record"}\n\n---\nDRAFT MESSAGE:\n${draftMessage}`,
        relatedEntityType: "project",
        relatedEntityId: project.id,
        projectId: project.id,
        metadata: JSON.stringify({
          projectId: project.id,
          projectName,
          clientName,
          clientEmail,
          clientPhone,
          subject,
          draftMessage,
          trigger: "quiet_period",
          daysSinceContact,
        }),
      });

      await memSet(cooldownKey, String(now.getTime()));
      drafted++;
    }

    await logAgentRun(AGENT_NAME, "completed", { drafted, total: activeProjects.length }, runId);
    console.log(`[${AGENT_NAME}] Drafted ${drafted} proactive check-ins for approval`);
  } catch (err) {
    console.error(`[${AGENT_NAME}] Error:`, err);
    await logAgentRun(AGENT_NAME, "failed", { error: String(err) }, runId);
  }
}
