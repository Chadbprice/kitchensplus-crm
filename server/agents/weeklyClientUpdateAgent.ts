/**
 * Weekly Client Update Agent
 * Runs every Monday morning. For each active project with a linked client,
 * generates a draft weekly update using LLM and routes it to the approval queue.
 * Owner reviews and approves before the message is sent to the client.
 */
import { getDb } from "../db";
import {
  projects, milestones, projectTasks, messages, clients, leads,
  documents, invoices,
} from "../../drizzle/schema";
import { eq, and, desc, gte, inArray } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { createApprovalItem } from "./approvalQueue";
import { emitEvent, EVENTS } from "./eventBus";
import { memGet, memSet, agentKey } from "./sharedMemory";
import { logAgentRun } from "./agentRunner";
import { WEEKLY_UPDATE_COOLDOWN_DAYS } from "../../shared/operationalConfig";

const AGENT_NAME = "WeeklyClientUpdateAgent";

export async function runWeeklyClientUpdateAgent(): Promise<void> {
  const runId = await logAgentRun(AGENT_NAME, "started", {});
  const db = await getDb();
  if (!db) {
    await logAgentRun(AGENT_NAME, "failed", { error: "No DB" }, runId);
    return;
  }

  try {
    // Get all active projects with client or lead
    const activeProjects = await db
      .select()
      .from(projects)
      .where(and(
        eq(projects.status, "active"),
      ));

    let drafted = 0;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    for (const project of activeProjects) {
      // Skip if no client contact
      if (!project.clientId && !project.leadId) continue;

      // Idempotency: skip if already drafted this week
      const cooldownKey = agentKey(AGENT_NAME, "weekly", String(project.id));
      const lastRun = await memGet(cooldownKey);
      if (lastRun && Date.now() - Number(lastRun) < WEEKLY_UPDATE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000) continue;

      // Gather project context
      const projectMilestones = await db
        .select()
        .from(milestones)
        .where(eq(milestones.projectId, project.id));

      const recentTasks = await db
        .select()
        .from(projectTasks)
        .where(and(
          eq(projectTasks.projectId, project.id),
          gte(projectTasks.updatedAt, sevenDaysAgo),
        ))
        .orderBy(desc(projectTasks.updatedAt))
        .limit(10);

      const recentDocs = await db
        .select()
        .from(documents)
        .where(and(
          eq(documents.projectId, project.id),
          gte(documents.createdAt, sevenDaysAgo),
        ))
        .limit(5);

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

      // Build context summary for LLM
      const completedMilestones = projectMilestones.filter(m => m.status === "completed").map(m => m.title).join(", ");
      const inProgressMilestones = projectMilestones.filter(m => m.status === "in_progress").map(m => m.title).join(", ");
      const pendingMilestones = projectMilestones.filter(m => m.status === "pending").map(m => m.title).join(", ");
      const completedTasksThisWeek = recentTasks.filter(t => t.status === "completed").map(t => t.title).join(", ");
      const newDocsThisWeek = recentDocs.length;

      const contextPrompt = `You are a luxury renovation company's client communication specialist. Write a warm, professional, concise weekly project update email for a client.

Project: ${project.name ?? "Renovation Project"}
Client: ${clientName}
Project Status: ${project.status}
Completed Milestones: ${completedMilestones || "None yet"}
Currently In Progress: ${inProgressMilestones || "Planning phase"}
Upcoming Milestones: ${pendingMilestones || "TBD"}
Tasks Completed This Week: ${completedTasksThisWeek || "None recorded"}
New Photos/Documents Added: ${newDocsThisWeek}

Write a brief, warm, professional email update (3-4 short paragraphs). 
- Start with a personalized greeting using the client's first name
- Mention what was accomplished this week
- Describe what's happening next
- Close warmly and invite questions
- Tone: premium, warm, reassuring — like a private designer keeping their client informed
- Do NOT include placeholder text like [DATE] or [CONTACT INFO]
- Sign off as "Kitchens Plus Upstate"`;

      let draftMessage = "";
      try {
        const llmResponse = await invokeLLM({
          messages: [
            { role: "system", content: "You write premium client communication for a luxury renovation company." },
            { role: "user", content: contextPrompt },
          ],
        });
        draftMessage = llmResponse?.choices?.[0]?.message?.content ?? "";
      } catch {
        // Fallback to deterministic draft
        draftMessage = `Hi ${clientName.split(" ")[0]},\n\nWe hope you're doing well. Here's a quick update on your ${project.name ?? "renovation project"}.\n\n${inProgressMilestones ? `This week we've been focused on ${inProgressMilestones}.` : "Work is progressing on schedule."} ${completedTasksThisWeek ? `We completed: ${completedTasksThisWeek}.` : ""}\n\n${pendingMilestones ? `Coming up next: ${pendingMilestones}.` : "We'll share the next phase timeline shortly."}\n\nAs always, please don't hesitate to reach out with any questions. We're committed to making this a seamless experience for you.\n\nWarm regards,\nKitchens Plus Upstate`;
      }

      if (!draftMessage) continue;

      // Route to approval queue
      await createApprovalItem({
        agentName: AGENT_NAME,
        actionType: "weekly_client_update",
        severity: "low",
        title: `Weekly Update Draft — ${project.name ?? "Project"} → ${clientName}`,
        description: `Client: ${clientName}${clientEmail ? ` (${clientEmail})` : ""}${clientPhone ? ` | ${clientPhone}` : ""}\n\n---\nDRAFT EMAIL:\n${draftMessage}`,
        relatedEntityType: "project",
        relatedEntityId: project.id,
        projectId: project.id,
        metadata: JSON.stringify({
          projectId: project.id,
          projectName: project.name,
          clientName,
          clientEmail,
          clientPhone,
          subject: `Weekly Update — ${project.name ?? "Your Project"}`,
          draftMessage,
          weekOf: new Date().toISOString(),
        }),
      });

      await memSet(cooldownKey, String(Date.now()));
      drafted++;
    }

    await logAgentRun(AGENT_NAME, "completed", { drafted, total: activeProjects.length }, runId);
    console.log(`[${AGENT_NAME}] Drafted ${drafted} weekly updates for approval`);
  } catch (err) {
    console.error(`[${AGENT_NAME}] Error:`, err);
    await logAgentRun(AGENT_NAME, "failed", { error: String(err) }, runId);
  }
}
