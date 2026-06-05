/**
 * Agents Router
 * tRPC procedures for the AI agent system:
 *   - Approval Queue (list, count, resolve, reject)
 *   - Domain Alerts (list, count, dismiss)
 *   - Agent Run Log (list, get)
 *   - Manual Triggers (run compliance check)
 */
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { approvalQueue, domainAlerts, agentRunLog, complianceChecks, financialSnapshots, projectRiskScores } from "../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { resolveApprovalItem, rejectApprovalItem, countPendingApprovals } from "../agents/approvalQueue";
import { dismissAlert, resolveAlert, countActiveAlerts } from "../agents/alertService";
import { runSubcontractorComplianceAgent } from "../agents/SubcontractorComplianceAgent";
import { runFinancialReviewAgent } from "../agents/FinancialReviewAgent";
import { runProjectRiskAgent } from "../agents/ProjectRiskAgent";
import { computeNextAction, getNextAction, markNextActionStale } from "../agents/NextActionEngine";
import { COMM_ACTION_TYPES, isCommActionType } from "../../shared/commActionTypes";
import { triggerNextActionRecompute } from "../agents/triggerNextActionRecompute";
import { sendSms } from "../sms";
import { createTransporter } from "../email";
import { wrapInBrandedTemplate } from "../agents/brandedEmailTemplate";

export const agentsRouter = router({

  // ─── Approval Queue ──────────────────────────────────────────────────────

  approvalQueue: router({
    count: protectedProcedure.query(async () => {
      return { count: await countPendingApprovals() };
    }),

    list: protectedProcedure
      .input(z.object({
        status: z.enum(["pending", "approved", "rejected", "auto_resolved", "all"]).default("pending"),
        limit: z.number().min(1).max(100).default(50),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const conditions = input.status === "all" ? undefined : eq(approvalQueue.status, input.status);
        return db
          .select()
          .from(approvalQueue)
          .where(conditions)
          .orderBy(desc(approvalQueue.createdAt))
          .limit(input.limit);
      }),

    resolve: protectedProcedure
      .input(z.object({
        id: z.number(),
        note: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Fetch the item before resolving to get entityType/entityId for downstream triggers
        const db = await getDb();
        let projectId: number | null = null;
        if (db) {
          const [item] = await db.select({ entityType: approvalQueue.entityType, entityId: approvalQueue.entityId })
            .from(approvalQueue).where(eq(approvalQueue.id, input.id)).limit(1);
          if (item?.entityType === "project" && item.entityId) projectId = item.entityId;
        }
        await resolveApprovalItem(input.id, ctx.user.id, input.note);
        // ── Event-triggered Next Action recompute on approval resolution ─────
        if (projectId) void triggerNextActionRecompute(projectId);
        return { success: true };
      }),

    reject: protectedProcedure
      .input(z.object({
        id: z.number(),
        note: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await rejectApprovalItem(input.id, ctx.user.id, input.note);
        return { success: true };
      }),

    /**
     * Execute a communication approval item — send the draft message via email
     * and/or SMS, then mark the item as approved.
     * Only valid for actionTypes: weekly_client_update, milestone_complete_client_message,
     * milestone_delayed_client_message.
     */
    sendCommunication: protectedProcedure
      .input(z.object({
        id: z.number(),
        note: z.string().optional(),
        sendEmail: z.boolean().default(true),
        sendSmsMsg: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Load the approval item
        const rows = await db.select().from(approvalQueue).where(eq(approvalQueue.id, input.id)).limit(1);
        const item = rows[0];
        if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Approval item not found" });
        if (item.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Item is no longer pending" });

        if (!isCommActionType(item.actionType)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This item is not a client communication draft" });
        }

        // Parse payload for contact info and draft
        let payload: Record<string, any> = {};
        try { payload = item.payload ? JSON.parse(item.payload) : {}; } catch {}

        const { clientEmail, clientPhone, subject, draftMessage } = payload;
        if (!draftMessage) throw new TRPCError({ code: "BAD_REQUEST", message: "No draft message found in this item" });

        const results: string[] = [];
        const errors: string[] = [];

        // Send email
        if (input.sendEmail && clientEmail) {
          try {
            const transporter = createTransporter();
            const isSubComm = ["compliance_doc_request", "subcontractor_eta_request"].includes(item.actionType);
            const recipientName = payload.clientName ?? "Valued Client";
            const brandedHtml = wrapInBrandedTemplate({
              recipientName,
              subject: subject ?? "Update from Kitchens Plus Upstate",
              body: draftMessage,
              isSubcontractor: isSubComm,
            });
            await transporter.sendMail({
              from: `"Kitchens Plus Upstate" <chad@kitchensplusupstate.com>`,
              to: clientEmail,
              subject: subject ?? "Update from Kitchens Plus Upstate",
              text: draftMessage,
              html: brandedHtml,
            });
            results.push(`Email sent to ${clientEmail}`);
          } catch (err: any) {
            errors.push(`Email failed: ${err?.message ?? String(err)}`);
          }
        } else if (input.sendEmail && !clientEmail) {
          errors.push("No email address on file for this client");
        }

        // Send SMS
        if (input.sendSmsMsg && clientPhone) {
          try {
            // Trim message to SMS-friendly length (first 320 chars + link hint)
            const smsBody = draftMessage.length > 320
              ? draftMessage.slice(0, 317) + "..."
              : draftMessage;
            await sendSms(clientPhone, smsBody);
            results.push(`SMS sent to ${clientPhone}`);
          } catch (err: any) {
            errors.push(`SMS failed: ${err?.message ?? String(err)}`);
          }
        } else if (input.sendSmsMsg && !clientPhone) {
          errors.push("No phone number on file for this client");
        }

        if (errors.length > 0 && results.length === 0) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: errors.join("; ") });
        }

        // Mark as approved regardless of partial send success
        await resolveApprovalItem(input.id, ctx.user.id, input.note ?? results.join("; "));

        return { success: true, sent: results, warnings: errors };
      }),
  }),

  // ─── Domain Alerts ───────────────────────────────────────────────────────

  alerts: router({
    count: protectedProcedure.query(async () => {
      return { count: await countActiveAlerts() };
    }),

    list: protectedProcedure
      .input(z.object({
        status: z.enum(["active", "dismissed", "resolved", "all"]).default("active"),
        limit: z.number().min(1).max(100).default(50),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const conditions = input.status === "all" ? undefined : eq(domainAlerts.status, input.status);
        return db
          .select()
          .from(domainAlerts)
          .where(conditions)
          .orderBy(desc(domainAlerts.createdAt))
          .limit(input.limit);
      }),

    dismiss: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await dismissAlert(input.id);
        return { success: true };
      }),

    resolve: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await resolveAlert(input.id);
        return { success: true };
      }),
  }),

  // ─── Agent Run Log ───────────────────────────────────────────────────────

  runLog: router({
    list: protectedProcedure
      .input(z.object({
        agentName: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const conditions = input.agentName ? eq(agentRunLog.agentName, input.agentName) : undefined;
        return db
          .select()
          .from(agentRunLog)
          .where(conditions)
          .orderBy(desc(agentRunLog.startedAt))
          .limit(input.limit);
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const rows = await db.select().from(agentRunLog).where(eq(agentRunLog.id, input.id)).limit(1);
        return rows[0] ?? null;
      }),
  }),

  // ─── Compliance Checks ───────────────────────────────────────────────────

  complianceChecks: router({
    forSub: protectedProcedure
      .input(z.object({
        subcontractorId: z.number(),
        limit: z.number().min(1).max(200).default(20),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return db
          .select()
          .from(complianceChecks)
          .where(eq(complianceChecks.subcontractorId, input.subcontractorId))
          .orderBy(desc(complianceChecks.checkedAt))
          .limit(input.limit);
      }),
  }),

  // ─── Financial Snapshots ─────────────────────────────────────────────────

  financialSnapshots: router({
    forProject: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        limit: z.number().min(1).max(100).default(10),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return db
          .select()
          .from(financialSnapshots)
          .where(eq(financialSnapshots.projectId, input.projectId))
          .orderBy(desc(financialSnapshots.snapshotAt))
          .limit(input.limit);
      }),

    latest: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const rows = await db
          .select()
          .from(financialSnapshots)
          .where(eq(financialSnapshots.projectId, input.projectId))
          .orderBy(desc(financialSnapshots.snapshotAt))
          .limit(1);
        return rows[0] ?? null;
      }),
  }),

  // ─── Project Risk Scores ──────────────────────────────────────────────────

  riskScores: router({
    forProject: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        limit: z.number().min(1).max(100).default(10),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return db
          .select()
          .from(projectRiskScores)
          .where(eq(projectRiskScores.projectId, input.projectId))
          .orderBy(desc(projectRiskScores.scoredAt))
          .limit(input.limit);
      }),

    history: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        limit: z.number().min(1).max(30).default(14),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        // Return oldest-first for sparkline rendering
        const rows = await db
          .select({
            id: projectRiskScores.id,
            // alias overallRiskScore as riskScore so RiskSparkline component works without changes
            riskScore: projectRiskScores.overallRiskScore,
            riskLevel: projectRiskScores.riskLevel,
            scoredAt: projectRiskScores.scoredAt,
          })
          .from(projectRiskScores)
          .where(eq(projectRiskScores.projectId, input.projectId))
          .orderBy(desc(projectRiskScores.scoredAt))
          .limit(input.limit);
        return rows.reverse(); // oldest first for left-to-right sparkline
      }),

    latestAll: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      // Return the most recent risk score per project using a subquery approach
      const allScores = await db
        .select()
        .from(projectRiskScores)
        .orderBy(desc(projectRiskScores.scoredAt))
        .limit(500);
      // Deduplicate: keep only the latest score per project
      const seen = new Set<number>();
      return allScores.filter((s) => {
        if (seen.has(s.projectId)) return false;
        seen.add(s.projectId);
        return true;
      });
    }),
  }),

  // ─── Manual Triggers ─────────────────────────────────────────────────────

  runComplianceCheck: protectedProcedure
    .input(z.object({
      subcontractorId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      // Fire and forget — don't await so the HTTP response returns immediately
      runSubcontractorComplianceAgent("manual", input.subcontractorId).catch((err) => {
        console.error("[AgentsRouter] Manual compliance check failed:", err);
      });
      return { started: true, message: "Compliance check started. Results will appear in the agent activity log." };
    }),

  runFinancialReview: protectedProcedure
    .input(z.object({
      projectId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      runFinancialReviewAgent("manual", input.projectId).catch((err) => {
        console.error("[AgentsRouter] Manual financial review failed:", err);
      });
      return { started: true, message: "Financial review started. Results will appear in the agent activity log." };
    }),

  runProjectRisk: protectedProcedure
    .input(z.object({
      projectId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      runProjectRiskAgent("manual", input.projectId).catch((err) => {
        console.error("[AgentsRouter] Manual project risk scan failed:", err);
      });
      return { started: true, message: "Project risk scan started. Results will appear in the agent activity log." };
    }),

  // ─── Next Action Engine ──────────────────────────────────────────────────
  nextActions: router({
    /** Get the latest persisted next action for a project (fast, no recompute) */
    get: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        return getNextAction(input.projectId);
      }),

    /** Compute (or recompute) the next action for a project with AI enrichment */
    compute: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        skipAI: z.boolean().optional().default(false),
      }))
      .mutation(async ({ input }) => {
        const result = await computeNextAction(input.projectId, !input.skipAI);
        if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
        return result;
      }),

    /** Mark a project's next action as stale (will show refresh prompt in UI) */
    markStale: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .mutation(async ({ input }) => {
        await markNextActionStale(input.projectId);
        return { success: true };
      }),
  }),
});
