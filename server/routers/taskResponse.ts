/**
 * Task Response Router
 * Handles one-click task responses via unique tokens embedded in emails/SMS.
 * No authentication required — tokens are single-use and expire after 30 days.
 */
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { projectTasks, taskReplies, messages, projects, clients, leads } from "../../drizzle/schema";
import { notifyOwner } from "../_core/notification";
import crypto from "crypto";

export const taskResponseRouter = router({
  /** Look up a task by its response token — returns enough info to render the form */
  getByToken: publicProcedure
    .input(z.object({ token: z.string().min(8) }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db
        .select({
          id: projectTasks.id,
          title: projectTasks.title,
          description: projectTasks.description,
          projectId: projectTasks.projectId,
          status: projectTasks.status,
          dueDate: projectTasks.dueDate,
        })
        .from(projectTasks)
        .where(eq(projectTasks.responseToken, input.token))
        .limit(1);

      if (!rows.length) return null;
      return rows[0];
    }),

  /** Submit a response to a task via token */
  submit: publicProcedure
    .input(z.object({
      token: z.string().min(8),
      replierName: z.string().min(1).max(255),
      replyText: z.string().min(1).max(4000),
      channel: z.enum(["portal", "email", "sms", "manual"]).default("portal"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      // Look up the task
      const taskRows = await db
        .select()
        .from(projectTasks)
        .where(eq(projectTasks.responseToken, input.token))
        .limit(1);

      if (!taskRows.length) throw new Error("Invalid or expired response link.");
      const task = taskRows[0];

      // Save to task_replies
      await db.insert(taskReplies).values({
        taskId: task.id,
        projectId: task.projectId,
        repliedBy: input.replierName,
        replyChannel: input.channel,
        replyText: input.replyText,
        rawPayload: { token: input.token, channel: input.channel },
      });

      // Mark task as completed
      await db.update(projectTasks)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(projectTasks.id, task.id));

      // Save to messages table so it appears in the Messages tab
      // Find the project to get clientId/leadId
      const projectRows = await db
        .select({ clientId: projects.clientId, leadId: projects.leadId, name: projects.name })
        .from(projects)
        .where(eq(projects.id, task.projectId))
        .limit(1);

      if (projectRows.length) {
        const proj = projectRows[0];
        await db.insert(messages).values({
          projectId: task.projectId,
          leadId: proj.leadId ?? undefined,
          threadType: "client",
          direction: "inbound",
          channel: "portal",
          fromName: input.replierName,
          body: `📋 Task Response — "${task.title}"\n\nFrom: ${input.replierName}\n\n${input.replyText}`,
          subject: `Task Response: ${task.title}`,
          status: "received",
          isRead: false,
        });
      }

      // Notify owner immediately
      await notifyOwner({
        title: `✅ Task Answered: "${task.title}"`,
        content: `${input.replierName} responded via ${input.channel}:\n\n"${input.replyText.slice(0, 300)}${input.replyText.length > 300 ? "…" : ""}"`,
      });

      return { success: true };
    }),

  /** Generate a fresh response token for a task (admin only — called when sending the task) */
  generateToken: publicProcedure
    .input(z.object({ taskId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const token = crypto.randomBytes(24).toString("hex");
      await db.update(projectTasks)
        .set({ responseToken: token })
        .where(eq(projectTasks.id, input.taskId));
      return { token };
    }),
});
