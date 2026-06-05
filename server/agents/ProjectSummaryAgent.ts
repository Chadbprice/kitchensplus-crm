/**
 * Project Summary Agent
 * Generates an AI-powered project context summary and persists it to the
 * project_summaries table. Called on meaningful project state changes.
 * Used by other agents as shared memory context.
 */
import { getDb } from "../db";
import {
  projects, milestones, projectTasks, messages, documents,
  invoices, changeOrders, projectSummaries, clients, leads,
} from "../../drizzle/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { memGet, memSet, agentKey } from "./sharedMemory";
import { logAgentRun } from "./agentRunner";
import { PROJECT_SUMMARY_COOLDOWN_MS } from "../../shared/operationalConfig";

const AGENT_NAME = "ProjectSummaryAgent";
const COOLDOWN_MS = PROJECT_SUMMARY_COOLDOWN_MS;

export async function runProjectSummaryAgent(projectId: number): Promise<string | null> {
  const cooldownKey = agentKey(AGENT_NAME, String(projectId));

  // Cooldown guard: skip if this project was summarized within the last 30 minutes
  const lastRun = await memGet(cooldownKey);
  if (lastRun && Date.now() - Number(lastRun) < COOLDOWN_MS) {
    console.log(`[${AGENT_NAME}] Skipping project ${projectId} — cooldown active`);
    return null;
  }

  const db = await getDb();
  if (!db) return null;

  try {
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) return null;

    // Gather context
    const projectMilestones = await db.select().from(milestones).where(eq(milestones.projectId, projectId));
    const tasks = await db.select().from(projectTasks).where(eq(projectTasks.projectId, projectId)).orderBy(desc(projectTasks.updatedAt)).limit(20);
    const recentMessages = await db.select().from(messages).where(eq(messages.projectId, projectId)).orderBy(desc(messages.createdAt)).limit(5);
    const openChangeOrders = await db.select().from(changeOrders).where(and(eq(changeOrders.projectId, projectId), eq(changeOrders.status, "pending"))).limit(5);
    const unpaidInvoices = await db.select().from(invoices).where(and(eq(invoices.projectId, projectId), eq(invoices.status, "sent"))).limit(5);

    // Resolve client name
    let clientName = "Unknown Client";
    if (project.clientId) {
      const [client] = await db.select().from(clients).where(eq(clients.id, project.clientId)).limit(1);
      if (client) clientName = client.name ?? clientName;
    } else if (project.leadId) {
      const [lead] = await db.select().from(leads).where(eq(leads.id, project.leadId)).limit(1);
      if (lead) clientName = `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() || clientName;
    }

    const completedMilestones = projectMilestones.filter(m => m.status === "completed").length;
    const totalMilestones = projectMilestones.length;
    const completedTasks = tasks.filter(t => t.status === "completed").length;
    const blockedTasks = tasks.filter(t => t.status === "blocked").length;
    const currentMilestone = projectMilestones.find(m => m.status === "in_progress")?.title ?? "None in progress";

    const contextPrompt = `Summarize this renovation project in 2-3 sentences for internal AI agent use. Be factual and concise.

Project: ${project.name ?? "Renovation"}
Client: ${clientName}
Status: ${project.status}
Budget: $${project.budgetEstimated ?? 0} estimated / $${project.budgetActual ?? 0} actual
Milestones: ${completedMilestones}/${totalMilestones} complete
Current Phase: ${currentMilestone}
Tasks: ${completedTasks} completed, ${blockedTasks} blocked
Open Change Orders: ${openChangeOrders.length}
Unpaid Invoices: ${unpaidInvoices.length}
Recent Activity: ${recentMessages.length} messages in last batch

Write a 2-3 sentence factual summary that captures the project's current state, financial position, and any notable issues.`;

    let summary = "";
    try {
      const llmResponse = await invokeLLM({
        messages: [
          { role: "system", content: "You are a construction project intelligence system. Write concise, factual project summaries for internal use." },
          { role: "user", content: contextPrompt },
        ],
      });
      summary = llmResponse?.choices?.[0]?.message?.content ?? "";
    } catch {
      // Deterministic fallback
      summary = `${project.name ?? "Project"} for ${clientName} is ${project.status}. ${completedMilestones}/${totalMilestones} milestones complete, currently on "${currentMilestone}". Budget: $${project.budgetEstimated ?? 0} estimated / $${project.budgetActual ?? 0} actual.${blockedTasks > 0 ? ` ${blockedTasks} task(s) blocked.` : ""}${openChangeOrders.length > 0 ? ` ${openChangeOrders.length} open change order(s).` : ""}`;
    }

    if (!summary) return null;

    // Upsert into project_summaries
    const existing = await db.select().from(projectSummaries).where(eq(projectSummaries.projectId, projectId)).limit(1);
    if (existing.length > 0) {
      await db.update(projectSummaries).set({ summary, generatedAt: new Date(), model: "auto" }).where(eq(projectSummaries.projectId, projectId));
    } else {
      await db.insert(projectSummaries).values({ projectId, summary, model: "auto" });
    }

    // Store cooldown timestamp to prevent re-runs within 30 minutes
    await memSet(cooldownKey, String(Date.now()));
    // Also store in shared memory for fast agent access
    await memSet(agentKey(AGENT_NAME, "summary", String(projectId)), summary);

    console.log(`[${AGENT_NAME}] Updated summary for project ${projectId}`);
    return summary;
  } catch (err) {
    console.error(`[${AGENT_NAME}] Error for project ${projectId}:`, err);
    return null;
  }
}
