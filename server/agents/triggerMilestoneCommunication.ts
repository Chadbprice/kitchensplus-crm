/**
 * Milestone Communication Trigger
 * Fires when a milestone status changes to "completed" or "delayed".
 * Creates an approval queue item with an LLM-enriched draft client message.
 * The owner reviews and approves before the message is sent.
 */
import { getDb } from "../db";
import { milestones, projects, clients, leads, projectTasks } from "../../drizzle/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { createApprovalItem } from "./approvalQueue";
import { emitEvent, EVENTS } from "./eventBus";
import { memGet, memSet, agentKey } from "./sharedMemory";
import { MILESTONE_COMM_COOLDOWN_MS } from "../../shared/operationalConfig";

const COOLDOWN_MS = MILESTONE_COMM_COOLDOWN_MS;

export async function triggerMilestoneCommunication(
  milestoneId: number,
  newStatus: "completed" | "delayed"
): Promise<void> {
  // Idempotency: skip if same status was triggered recently
  const cooldownKey = agentKey("MilestoneCommunication", String(milestoneId), newStatus);
  const lastRun = await memGet(cooldownKey);
  if (lastRun && Date.now() - Number(lastRun) < COOLDOWN_MS) return;
  await memSet(cooldownKey, String(Date.now()));

  const db = await getDb();
  if (!db) return;

  try {
    // Get milestone + project + client
    const [milestone] = await db.select().from(milestones).where(eq(milestones.id, milestoneId)).limit(1);
    if (!milestone) return;

    const [project] = await db.select().from(projects).where(eq(projects.id, milestone.projectId)).limit(1);
    if (!project) return;

    // Resolve client contact info
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

    const milestoneName = milestone.title ?? "your current phase";
    const projectName = project.name ?? "your project";
    const firstName = clientName.split(" ")[0];

    // Gather recent context for LLM enrichment
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentTasks = await db
      .select({ title: projectTasks.title, status: projectTasks.status })
      .from(projectTasks)
      .where(and(
        eq(projectTasks.projectId, milestone.projectId),
        gte(projectTasks.updatedAt, sevenDaysAgo),
      ))
      .orderBy(desc(projectTasks.updatedAt))
      .limit(5);

    // Get sibling milestones for context
    const allMilestones = await db
      .select({ title: milestones.title, status: milestones.status })
      .from(milestones)
      .where(eq(milestones.projectId, milestone.projectId));

    const completedMilestones = allMilestones.filter(m => m.status === "completed").map(m => m.title).join(", ");
    const upcomingMilestones = allMilestones.filter(m => m.status === "pending" || m.status === "in_progress").map(m => m.title).join(", ");
    const recentTaskNames = recentTasks.map(t => `${t.title} (${t.status})`).join(", ");

    // Deterministic fallback drafts
    let subject: string;
    let fallbackMessage: string;

    if (newStatus === "completed") {
      subject = `${milestoneName} Complete — ${projectName}`;
      fallbackMessage = `Hi ${firstName},\n\nGreat news — we've completed the "${milestoneName}" phase of your ${projectName} project. Everything is looking great and we're moving forward on schedule.\n\n${upcomingMilestones ? `Coming up next: ${upcomingMilestones}.` : "We'll be in touch soon with the next steps."}\n\nAs always, don't hesitate to reach out if you have any questions.\n\nWarm regards,\nKitchens Plus Upstate`;
    } else {
      subject = `Project Update — ${projectName}`;
      fallbackMessage = `Hi ${firstName},\n\nWe wanted to keep you informed about your ${projectName} project. The "${milestoneName}" phase has experienced a brief delay. We're actively working to resolve this and will update you as soon as we have a revised timeline.\n\nWe appreciate your patience and are committed to delivering exceptional results. Please feel free to reach out with any questions.\n\nWarm regards,\nKitchens Plus Upstate`;
    }

    // Try LLM enrichment
    let draftMessage = fallbackMessage;
    try {
      const statusVerb = newStatus === "completed" ? "just been completed" : "experienced a delay";
      const prompt = `You are a luxury renovation company's client communication specialist for Kitchens Plus Upstate.

Project: ${projectName}
Client: ${clientName}
Milestone "${milestoneName}" has ${statusVerb}.
${completedMilestones ? `Completed milestones: ${completedMilestones}` : ""}
${upcomingMilestones ? `Upcoming milestones: ${upcomingMilestones}` : ""}
${recentTaskNames ? `Recent task activity: ${recentTaskNames}` : ""}

Write a brief, warm, professional email (2-3 short paragraphs).
- Start with "Hi ${firstName},"
- ${newStatus === "completed" ? "Celebrate the milestone completion and mention what's coming next" : "Acknowledge the delay reassuringly, mention you're actively working on it"}
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
      // Fall through to deterministic draft
    }

    // Route to approval queue — owner must approve before send
    await createApprovalItem({
      agentName: "MilestoneCommunicationAgent",
      actionType: newStatus === "completed" ? "milestone_complete_client_message" : "milestone_delayed_client_message",
      severity: newStatus === "delayed" ? "high" : "medium",
      title: `${newStatus === "completed" ? "✓" : "⚠"} Draft client message: "${milestoneName}" ${newStatus}`,
      description: `Project: ${projectName} | Client: ${clientName}${clientEmail ? ` (${clientEmail})` : ""}${clientPhone ? ` | ${clientPhone}` : ""}\n\n---\nDRAFT MESSAGE:\n${draftMessage}`,
      relatedEntityType: "milestone",
      relatedEntityId: milestoneId,
      projectId: milestone.projectId,
      metadata: JSON.stringify({
        milestoneId,
        milestoneTitle: milestoneName,
        projectId: milestone.projectId,
        projectName,
        clientName,
        clientEmail,
        clientPhone,
        subject,
        draftMessage,
        newStatus,
      }),
    });

    // Emit domain event
    await emitEvent(EVENTS.MILESTONE_STATUS_CHANGED, "milestone", milestoneId, {
      projectId: milestone.projectId,
      newStatus,
      communicationQueued: true,
    });

    console.log(`[MilestoneCommunication] Queued draft message for milestone ${milestoneId} (${newStatus})`);
  } catch (err) {
    console.error("[MilestoneCommunication] Error:", err);
  }
}
