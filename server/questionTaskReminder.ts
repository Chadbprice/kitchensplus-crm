/**
 * Question Task Reminder Scheduler
 * Runs every hour. For any project task that is:
 *   - category contains "question" (case-insensitive)
 *   - status is NOT "completed"
 *   - questionReminderSentAt is null OR more than 24 hours ago
 * Re-sends the question email + SMS to all assignees, then updates questionReminderSentAt.
 *
 * ⚠️ INTENTIONAL AUTO-SEND: This scheduler sends directly to task assignees
 * without approval queue routing. Rationale: These are internal operational
 * reminders to team members/assignees, not client-facing communications.
 */
import { getDb } from "./db";
import { projectTasks, taskAssignees } from "../drizzle/schema";
import { eq, and, sql, or, isNull, ne } from "drizzle-orm";

async function sendQuestionTaskReminders() {
  const db = await getDb();
  if (!db) return;

  const now = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

  // Find all open question tasks that need a reminder
  const openQuestions = await db.select().from(projectTasks).where(
    and(
      sql`LOWER(category) LIKE '%question%'`,
      ne(projectTasks.status, "completed"),
      or(
        isNull(sql`questionReminderSentAt`),
        sql`questionReminderSentAt < ${cutoff}`
      )
    )
  );

  if (openQuestions.length === 0) return;

  const { createTransporter, GMAIL_FROM_USER } = await import("./email");
  const { sendSms } = await import("./sms");

  for (const task of openQuestions) {
    try {
      // Get all assignees for this task
      const assignees = await db.select().from(taskAssignees)
        .where(eq(taskAssignees.taskId, task.id));

      if (assignees.length === 0) continue;

      for (const a of assignees) {
        const smsBody = `Hi ${a.name}, this is Kitchens Plus Upstate. This is a friendly reminder that we are still awaiting your response to: "${task.title}"${task.description ? ` — ${task.description}` : ""}. Please reply to this message at your earliest convenience, ${a.name}. Thank you!`;

        if (a.phone) {
          try {
            await sendSms({ to: a.phone, message: smsBody, isFirstContact: false });
          } catch (e) {
            console.error(`[QuestionReminder] SMS failed for task ${task.id} to ${a.name}:`, e);
          }
        }

        if (a.email) {
          try {
            const transporter = createTransporter();
            await transporter.sendMail({
              from: `"Chad Price — Kitchens Plus Upstate" <${GMAIL_FROM_USER}>`,
              replyTo: GMAIL_FROM_USER,
              to: a.email,
              subject: `Reminder: Question Awaiting Your Reply — ${task.title}`,
              html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e8e0d0;border-radius:8px;overflow:hidden;">
                <div style="background:#2E2F2A;padding:20px 28px;text-align:center;">
                  <h1 style="color:#BF9A3B;font-size:20px;margin:0;letter-spacing:2px;font-family:Georgia,serif;">KITCHENS PLUS UPSTATE</h1>
                  <p style="color:#ccc;font-size:11px;margin:4px 0 0;letter-spacing:1px;">RENOVATIONS &amp; DESIGN</p>
                </div>
                <div style="padding:28px;">
                  <p style="font-size:16px;font-weight:bold;color:#BF9A3B;margin:0 0 8px;">Friendly Reminder</p>
                  <p style="font-size:15px;color:#444;margin:0 0 20px;">Hi ${a.name},</p>
                  <p style="font-size:14px;color:#555;margin:0 0 16px;">We're still waiting for your reply to the following question:</p>
                  <div style="background:#FFF8EC;border-left:4px solid #BF9A3B;padding:16px 20px;border-radius:0 6px 6px 0;margin:0 0 20px;">
                    <p style="font-size:15px;font-weight:600;color:#2E2F2A;margin:0 0 8px;">${task.title}</p>
                    ${task.description ? `<p style="font-size:14px;color:#555;margin:0;">${task.description}</p>` : ""}
                  </div>
                  <p style="font-size:14px;color:#555;margin:0 0 20px;">Please reply directly to this email with your answer. Your response will be recorded on your project.</p>
                  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
                  <p style="font-size:12px;color:#aaa;">Kitchens Plus Upstate &middot; +1 (833) 518-4811 &middot; kitchensplusupstate.com</p>
                </div>
              </div>`,
            });
          } catch (e) {
            console.error(`[QuestionReminder] Email failed for task ${task.id} to ${a.name}:`, e);
          }
        }
      }

      // Update the reminder timestamp
      await db.update(projectTasks)
        .set({ questionReminderSentAt: now } as any)
        .where(eq(projectTasks.id, task.id));

      console.log(`[QuestionReminder] Sent reminder for task "${task.title}" (id=${task.id}) to ${assignees.length} assignee(s)`);
    } catch (err) {
      console.error(`[QuestionReminder] Failed for task ${task.id}:`, err);
    }
  }
}

let _started = false;
export function startQuestionTaskReminderScheduler() {
  if (_started) return;
  _started = true;
  // First run after 2 minutes, then every hour
  setTimeout(() => sendQuestionTaskReminders().catch(console.error), 2 * 60 * 1000);
  setInterval(() => sendQuestionTaskReminders().catch(console.error), 60 * 60 * 1000);
  console.log("[QuestionReminder] Question task reminder scheduler started (runs every hour)");
}
