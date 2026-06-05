/**
 * COO Dashboard Router
 * Single tRPC procedure that returns all data needed for the /owner/coo-dashboard page.
 * Designed for the one human COO running the company — answers:
 *   1. Today's Priorities (urgent actions across all active projects)
 *   2. Pending Approvals (approval queue items needing action)
 *   3. Highest-Risk Projects (top risk-scored active projects)
 *   4. Financial Attention Needed (overdue invoices, missing deposits, unbilled COs)
 *   5. Communication Gaps (clients not updated in 7+ days)
 *   6. Subcontractor / Compliance Issues (expired/expiring docs)
 *   7. Fast Action Counts (for the action bar)
 */
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  approvalQueue,
  projects,
  milestones,
  invoices,
  changeOrders,
  messages,
  subcontractors,
  subcontractorDocs,
  projectRiskScores,
  projectNextActions,
  purchaseOrders,
  vendors,
  vendorInvoices,
  scheduleEvents,
  crewMembers,
  invoicePayments,
  rfqs,
  rfqInvitations,
  subcontractorAwardCandidates,
} from "../../drizzle/schema";
import { eq, desc, asc, and, sql, lte, or, ne, isNull, isNotNull, lt, gte, inArray, notInArray } from "drizzle-orm";
import { computeNextAction } from "../agents/NextActionEngine";
import {
  STALE_NEXT_ACTION_HOURS,
  STALE_NEXT_ACTION_ALERT_THRESHOLD,
} from "../../shared/operationalConfig";

// ─── Config alias (for local readability) ────────────────────────────────────
const STALE_HOURS = STALE_NEXT_ACTION_HOURS;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const cooRouter = router({
  /**
   * Main summary query — returns all 7 sections in one round-trip.
   */
  summary: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;

    const now = new Date();
    const sevenDaysAgo = daysAgo(7);
    const fourteenDaysAgo = daysAgo(14);
    const thirtyDaysFromNow = daysFromNow(30);

    // ── 1. Pending Approvals ───────────────────────────────────────────────
    const pendingApprovals = await db
      .select({
        id: approvalQueue.id,
        agentName: approvalQueue.agentName,
        actionType: approvalQueue.actionType,
        entityType: approvalQueue.entityType,
        entityId: approvalQueue.entityId,
        title: approvalQueue.title,
        description: approvalQueue.description,
        severity: approvalQueue.severity,
        createdAt: approvalQueue.createdAt,
        payload: approvalQueue.payload,
      })
      .from(approvalQueue)
      .where(eq(approvalQueue.status, "pending"))
      .orderBy(
        // critical first, then warning, then info; newest within each
        sql`FIELD(${approvalQueue.severity}, 'critical', 'warning', 'info')`,
        desc(approvalQueue.createdAt)
      )
      .limit(20);

    // ── 2. Highest-Risk Projects ───────────────────────────────────────────
    // Get latest risk score per active project
    const allRiskScores = await db
      .select({
        id: projectRiskScores.id,
        projectId: projectRiskScores.projectId,
        overallRiskScore: projectRiskScores.overallRiskScore,
        riskLevel: projectRiskScores.riskLevel,
        topRiskFactor: projectRiskScores.topRiskFactor,
        notes: projectRiskScores.notes,
        scoredAt: projectRiskScores.scoredAt,
      })
      .from(projectRiskScores)
      .orderBy(desc(projectRiskScores.scoredAt))
      .limit(500);

    // Deduplicate: keep latest per project
    const latestRiskByProject = new Map<number, typeof allRiskScores[0]>();
    for (const score of allRiskScores) {
      if (!latestRiskByProject.has(score.projectId)) {
        latestRiskByProject.set(score.projectId, score);
      }
    }

    // Get active projects
    const activeProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
        status: projects.status,
        leadId: projects.leadId,
        estimatedEndDate: projects.estimatedEndDate,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(or(eq(projects.status, "active"), eq(projects.status, "planning")));

    const activeProjectIds = new Set(activeProjects.map((p) => p.id));

    // Build risk list for active projects only, sorted by score desc
    const highRiskProjects = Array.from(latestRiskByProject.values())
      .filter((s) => activeProjectIds.has(s.projectId))
      .sort((a, b) => (b.overallRiskScore ?? 0) - (a.overallRiskScore ?? 0))
      .slice(0, 5)
      .map((score) => {
        const project = activeProjects.find((p) => p.id === score.projectId);
        return {
          projectId: score.projectId,
          projectName: project?.name ?? "Unknown Project",
          status: project?.status ?? "unknown",
          overallRiskScore: score.overallRiskScore ?? 0,
          riskLevel: score.riskLevel ?? "low",
          topRiskFactor: score.topRiskFactor,
          notes: score.notes,
          scoredAt: score.scoredAt,
          estimatedEndDate: project?.estimatedEndDate ?? null,
        };
      });

    // ── 3. Financial Attention Needed ──────────────────────────────────────
    // 3a. Overdue invoices (status=sent, dueDate < now)
    const overdueInvoices = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        invoiceType: invoices.invoiceType,
        amount: invoices.amount,
        amountPaid: invoices.amountPaid,
        dueDate: invoices.dueDate,
        projectId: invoices.projectId,
        leadId: invoices.leadId,
        status: invoices.status,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.status, "sent"),
          isNotNull(invoices.dueDate),
          lte(invoices.dueDate, now)
        )
      )
      .orderBy(asc(invoices.dueDate))
      .limit(10);

    // 3b. Sent invoices with no due date (no urgency signal)
    const sentNoDueDate = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        invoiceType: invoices.invoiceType,
        amount: invoices.amount,
        amountPaid: invoices.amountPaid,
        projectId: invoices.projectId,
        leadId: invoices.leadId,
        sentAt: invoices.sentAt,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.status, "sent"),
          isNull(invoices.dueDate),
          isNotNull(invoices.sentAt),
          lte(invoices.sentAt, sevenDaysAgo)
        )
      )
      .orderBy(asc(invoices.sentAt))
      .limit(5);

    // 3c. Approved change orders with no invoice (unbilled)
    const approvedCOs = await db
      .select({
        id: changeOrders.id,
        changeOrderNumber: changeOrders.changeOrderNumber,
        title: changeOrders.title,
        amount: changeOrders.amount,
        projectId: changeOrders.projectId,
        approvedAt: changeOrders.approvedAt,
      })
      .from(changeOrders)
      .where(eq(changeOrders.status, "approved"))
      .orderBy(desc(changeOrders.approvedAt))
      .limit(10);

    // Check which approved COs already have an invoice (invoiceType = 'change_order')
    const billedCoProjectIds = approvedCOs.length > 0
      ? await db
          .select({ projectId: invoices.projectId })
          .from(invoices)
          .where(
            and(
              eq(invoices.invoiceType, "change_order"),
              inArray(invoices.projectId, approvedCOs.map((co) => co.projectId).filter(Boolean) as number[])
            )
          )
      : [];
    const billedCoProjectSet = new Set(billedCoProjectIds.map((r) => r.projectId));
    const unbilledCOs = approvedCOs.filter(
      (co) => co.projectId && !billedCoProjectSet.has(co.projectId)
    );

    // 3d. Active projects with no deposit invoice at all
    const depositInvoiceProjectIds = await db
      .select({ projectId: invoices.projectId })
      .from(invoices)
      .where(eq(invoices.invoiceType, "deposit"));
    const depositProjectSet = new Set(depositInvoiceProjectIds.map((r) => r.projectId));
    const projectsMissingDeposit = activeProjects
      .filter((p) => p.status === "active" && !depositProjectSet.has(p.id))
      .slice(0, 5);

    // ── 4. Communication Gaps ──────────────────────────────────────────────
    // Active projects where the last outbound client message is > 7 days ago (or never)
    const recentOutboundMessages = await db
      .select({
        projectId: messages.projectId,
        latestSentAt: sql<Date>`MAX(${messages.createdAt})`,
      })
      .from(messages)
      .where(
        and(
          eq(messages.direction, "outbound"),
          eq(messages.threadType, "client"),
          isNotNull(messages.projectId)
        )
      )
      .groupBy(messages.projectId);

    const lastMessageByProject = new Map<number, Date>();
    for (const row of recentOutboundMessages) {
      if (row.projectId) lastMessageByProject.set(row.projectId, new Date(row.latestSentAt));
    }

    const communicationGaps = activeProjects
      .filter((p) => {
        const lastMsg = lastMessageByProject.get(p.id);
        if (!lastMsg) return true; // never messaged
        return lastMsg < sevenDaysAgo;
      })
      .map((p) => ({
        projectId: p.id,
        projectName: p.name,
        status: p.status,
        leadId: p.leadId,
        lastOutboundAt: lastMessageByProject.get(p.id) ?? null,
        daysSinceLastMessage: lastMessageByProject.get(p.id)
          ? Math.floor((now.getTime() - lastMessageByProject.get(p.id)!.getTime()) / 86400000)
          : null,
      }))
      .sort((a, b) => {
        // Never-messaged first, then oldest-last-message first
        if (a.lastOutboundAt === null && b.lastOutboundAt !== null) return -1;
        if (a.lastOutboundAt !== null && b.lastOutboundAt === null) return 1;
        if (!a.lastOutboundAt || !b.lastOutboundAt) return 0;
        return a.lastOutboundAt.getTime() - b.lastOutboundAt.getTime();
      })
      .slice(0, 8);

    // ── 5. Subcontractor / Compliance Issues ──────────────────────────────
    // Docs that are expired or expiring within 30 days
    const complianceDocs = await db
      .select({
        id: subcontractorDocs.id,
        subcontractorId: subcontractorDocs.subcontractorId,
        docType: subcontractorDocs.docType,
        expiryDate: subcontractorDocs.expiryDate,
        status: subcontractorDocs.status,
        fileName: subcontractorDocs.fileName,
      })
      .from(subcontractorDocs)
      .where(
        and(
          isNotNull(subcontractorDocs.expiryDate),
          lte(subcontractorDocs.expiryDate, thirtyDaysFromNow),
          ne(subcontractorDocs.status, "rejected")
        )
      )
      .orderBy(asc(subcontractorDocs.expiryDate))
      .limit(20);

    // Get subcontractor names for the doc list
    const subIds = [...new Set(complianceDocs.map((d) => d.subcontractorId))];
    const subNames = subIds.length > 0
      ? await db
          .select({ id: subcontractors.id, companyName: subcontractors.companyName, trade: subcontractors.trade })
          .from(subcontractors)
          .where(inArray(subcontractors.id, subIds))
      : [];
    const subNameMap = new Map(subNames.map((s) => [s.id, s]));

    const complianceIssues = complianceDocs.map((doc) => {
      const sub = subNameMap.get(doc.subcontractorId);
      const isExpired = doc.expiryDate ? new Date(doc.expiryDate) < now : false;
      const daysUntilExpiry = doc.expiryDate
        ? Math.ceil((new Date(doc.expiryDate).getTime() - now.getTime()) / 86400000)
        : null;
      return {
        docId: doc.id,
        subcontractorId: doc.subcontractorId,
        companyName: sub?.companyName ?? "Unknown",
        trade: sub?.trade ?? null,
        docType: doc.docType,
        expiryDate: doc.expiryDate,
        isExpired,
        daysUntilExpiry,
        status: doc.status,
      };
    });

    // ── 6. Today's Priorities (synthesized from all sections) ─────────────
    type Priority = {
      urgency: "critical" | "high" | "medium";
      category: string;
      title: string;
      description: string;
      link: string;
      entityId?: number;
    };
    const priorities: Priority[] = [];

    // Critical approvals
    pendingApprovals
      .filter((a) => a.severity === "critical")
      .slice(0, 3)
      .forEach((a) => {
        priorities.push({
          urgency: "critical",
          category: "Approval",
          title: a.title,
          description: a.description ?? a.agentName,
          link: "/owner/agent-approvals",
          entityId: a.id,
        });
      });

    // Critical-risk projects
    highRiskProjects
      .filter((p) => p.riskLevel === "critical" || p.riskLevel === "high")
      .slice(0, 2)
      .forEach((p) => {
        priorities.push({
          urgency: p.riskLevel === "critical" ? "critical" : "high",
          category: "Risk",
          title: `${p.projectName} — Risk Score ${p.overallRiskScore}`,
          description: p.topRiskFactor ?? `${p.riskLevel} risk level`,
          link: `/owner/projects/${p.projectId}`,
          entityId: p.projectId,
        });
      });

    // Overdue invoices
    overdueInvoices.slice(0, 3).forEach((inv) => {
      const balance = Math.max(0, Number(inv.amount) - Number(inv.amountPaid ?? 0));
      priorities.push({
        urgency: "high",
        category: "Finance",
        title: `Overdue Invoice ${inv.invoiceNumber ?? `#${inv.id}`} — $${balance.toLocaleString()}`,
        description: `${inv.invoiceType} invoice past due`,
        link: "/owner/invoices",
        entityId: inv.id,
      });
    });

    // Communication gaps (never messaged)
    communicationGaps
      .filter((g) => g.lastOutboundAt === null)
      .slice(0, 2)
      .forEach((g) => {
        priorities.push({
          urgency: "medium",
          category: "Communication",
          title: `${g.projectName} — No client messages yet`,
          description: "No outbound messages have been sent for this project",
          link: `/owner/projects/${g.projectId}`,
          entityId: g.projectId,
        });
      });

    // Expired compliance docs
    complianceIssues
      .filter((c) => c.isExpired)
      .slice(0, 2)
      .forEach((c) => {
        priorities.push({
          urgency: "high",
          category: "Compliance",
          title: `${c.companyName} — ${c.docType.toUpperCase()} expired`,
          description: `Document expired ${c.daysUntilExpiry !== null ? Math.abs(c.daysUntilExpiry) + " days ago" : ""}`,
          link: `/owner/subcontractors/${c.subcontractorId}`,
          entityId: c.subcontractorId,
        });
      });

    // Warning approvals (if no critical)
    if (priorities.filter((p) => p.category === "Approval").length === 0) {
      pendingApprovals
        .filter((a) => a.severity === "warning")
        .slice(0, 2)
        .forEach((a) => {
          priorities.push({
            urgency: "medium",
            category: "Approval",
            title: a.title,
            description: a.description ?? a.agentName,
            link: "/owner/agent-approvals",
            entityId: a.id,
          });
        });
    }

    // Sort: critical → high → medium
    const urgencyOrder: Record<string, number> = { critical: 0, high: 1, medium: 2 };
    priorities.sort((a, b) => (urgencyOrder[a.urgency] ?? 3) - (urgencyOrder[b.urgency] ?? 3));

    // ── 7. Fast Action Counts ──────────────────────────────────────────────
    const [pendingApprovalCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(approvalQueue)
      .where(eq(approvalQueue.status, "pending"));
    const [pendingAwardCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(subcontractorAwardCandidates)
      .where(eq(subcontractorAwardCandidates.status, "awarded"));

    const [overdueCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(invoices)
      .where(
        and(
          eq(invoices.status, "sent"),
          isNotNull(invoices.dueDate),
          lte(invoices.dueDate, now)
        )
      );

    const [activeProjectCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(projects)
      .where(eq(projects.status, "active"));

    // ── 8. Stale / Missing Next Action Count ────────────────────────────────
    // Quick scan of project_next_actions for active projects to surface in Best Path Forward.
    const staleThreshold = new Date(Date.now() - STALE_HOURS * 3600000);
    const activeProjectIds2 = activeProjects.map((p) => p.id);
    let staleOrMissingNextActionCount = 0;

    if (activeProjectIds2.length > 0) {
      const allNextActions = await db
        .select({
          projectId: projectNextActions.projectId,
          computedAt: projectNextActions.computedAt,
          isStale: projectNextActions.isStale,
        })
        .from(projectNextActions)
        .where(inArray(projectNextActions.projectId, activeProjectIds2))
        .orderBy(desc(projectNextActions.computedAt));

      // Deduplicate: keep latest per project
      const latestNA = new Map<number, { computedAt: Date | string; isStale: boolean | null }>();
      for (const a of allNextActions) {
        if (!latestNA.has(a.projectId)) {
          latestNA.set(a.projectId, { computedAt: a.computedAt, isStale: a.isStale });
        }
      }

      for (const pid of activeProjectIds2) {
        const na = latestNA.get(pid);
        if (!na) {
          staleOrMissingNextActionCount++; // missing
        } else if (na.isStale || new Date(na.computedAt) < staleThreshold) {
          staleOrMissingNextActionCount++; // stale
        }
      }
    }

    // ── 9. Sub / Vendor Operations ──────────────────────────────────────────
    // Overdue POs (past expected delivery, still in active status)
    const overduePOs = await db
      .select({
        id: purchaseOrders.id,
        poNumber: purchaseOrders.poNumber,
        title: purchaseOrders.title,
        vendorId: purchaseOrders.vendorId,
        projectId: purchaseOrders.projectId,
        expectedDelivery: purchaseOrders.expectedDelivery,
        status: purchaseOrders.status,
      })
      .from(purchaseOrders)
      .where(
        and(
          inArray(purchaseOrders.status, ["sent", "acknowledged"]),
          lte(purchaseOrders.expectedDelivery, now)
        )
      )
      .orderBy(asc(purchaseOrders.expectedDelivery))
      .limit(10);

    // Resolve vendor names for overdue POs
    const overduePOVendorIds = [...new Set(overduePOs.filter(p => p.vendorId).map(p => p.vendorId!))];
    const overduePOVendors = overduePOVendorIds.length > 0
      ? await db.select({ id: vendors.id, companyName: vendors.companyName }).from(vendors).where(inArray(vendors.id, overduePOVendorIds))
      : [];
    const vendorNameMap = new Map(overduePOVendors.map(v => [v.id, v.companyName]));

    const overduePOsEnriched = overduePOs.map(po => ({
      ...po,
      vendorName: po.vendorId ? vendorNameMap.get(po.vendorId) ?? "Unknown" : "No vendor",
      daysOverdue: po.expectedDelivery
        ? Math.floor((now.getTime() - new Date(po.expectedDelivery).getTime()) / 86400000)
        : 0,
    }));

    // Unreviewed vendor invoices (submitted but not yet reviewed)
    const unreviewedInvoices = await db
      .select({
        id: vendorInvoices.id,
        vendorId: vendorInvoices.vendorId,
        poId: vendorInvoices.poId,
        projectId: vendorInvoices.projectId,
        invoiceNumber: vendorInvoices.invoiceNumber,
        amount: vendorInvoices.amount,
        submittedAt: vendorInvoices.submittedAt,
      })
      .from(vendorInvoices)
      .where(eq(vendorInvoices.status, "submitted"))
      .orderBy(asc(vendorInvoices.submittedAt))
      .limit(10);

    // Arrival issues: schedule events past start time still in "scheduled" status (last 24h)
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const arrivalIssues = await db
      .select({
        id: scheduleEvents.id,
        title: scheduleEvents.title,
        eventType: scheduleEvents.eventType,
        assigneeType: scheduleEvents.assigneeType,
        assigneeId: scheduleEvents.assigneeId,
        projectId: scheduleEvents.projectId,
        startTime: scheduleEvents.startTime,
      })
      .from(scheduleEvents)
      .where(
        and(
          inArray(scheduleEvents.eventType, ["crew_assignment", "vendor_visit"]),
          eq(scheduleEvents.status, "scheduled"),
          lte(scheduleEvents.startTime, oneHourAgo),
          gte(scheduleEvents.startTime, oneDayAgo)
        )
      )
      .orderBy(asc(scheduleEvents.startTime))
      .limit(10);

    // Resolve assignee names for arrival issues
    const arrivalIssuesEnriched = await Promise.all(arrivalIssues.map(async (evt) => {
      let assigneeName = "Unknown";
      if (evt.assigneeType === "crew" && evt.assigneeId) {
        const [crew] = await db.select({ name: crewMembers.name }).from(crewMembers).where(eq(crewMembers.id, evt.assigneeId)).limit(1);
        if (crew) assigneeName = crew.name;
      } else if (evt.assigneeType === "vendor" && evt.assigneeId) {
        const [sub] = await db.select({ companyName: subcontractors.companyName }).from(subcontractors).where(eq(subcontractors.id, evt.assigneeId)).limit(1);
        if (sub) assigneeName = sub.companyName;
      }
      const hoursLate = Math.round((now.getTime() - evt.startTime.getTime()) / (1000 * 60 * 60) * 10) / 10;
      return { ...evt, assigneeName, hoursLate };
    }));

    // Inject sub/vendor ops priorities
    arrivalIssuesEnriched
      .filter(a => a.hoursLate >= 4)
      .slice(0, 2)
      .forEach(a => {
        priorities.push({
          urgency: "critical",
          category: "Arrival",
          title: `No-show: ${a.assigneeName} — ${a.title}`,
          description: `${Math.round(a.hoursLate)}h past scheduled start with no check-in`,
          link: a.projectId ? `/projects/${a.projectId}` : "/schedule",
        });
      });

    overduePOsEnriched
      .filter(po => po.daysOverdue >= 7)
      .slice(0, 2)
      .forEach(po => {
        priorities.push({
          urgency: "high",
          category: "Vendor",
          title: `Overdue PO: ${po.poNumber ?? `PO-${po.id}`} — ${po.vendorName}`,
          description: `${po.daysOverdue} days past expected delivery`,
          link: "/purchase-orders",
        });
      });

    if (unreviewedInvoices.length >= 3) {
      priorities.push({
        urgency: "medium",
        category: "Vendor",
        title: `${unreviewedInvoices.length} vendor invoices awaiting review`,
        description: "Submitted invoices need approval or rejection",
        link: "/owner/vendors",
      });
    }

    // ── Portfolio Financial Health Summary ──────────────────────────────────
    const [portfolioInvoiced] = await db
      .select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
      .from(invoices)
      .where(ne(invoices.status, "cancelled"));
    const [portfolioCollected] = await db
      .select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
      .from(invoicePayments);
    const [portfolioOverdue] = await db
      .select({ total: sql<string>`COALESCE(SUM(amount - COALESCE(amountPaid, 0)), 0)` })
      .from(invoices)
      .where(
        and(
          eq(invoices.status, "sent"),
          isNotNull(invoices.dueDate),
          lte(invoices.dueDate, now)
        )
      );
    // Per-project margin data for active projects
    const projectMargins = activeProjects
      .filter((p) => parseFloat(String(p.budgetEstimated ?? "0")) > 0)
      .map((p) => {
        const estimated = parseFloat(String(p.budgetEstimated ?? "0"));
        const actual = parseFloat(String(p.budgetActual ?? "0"));
        const marginPct = estimated > 0 ? ((estimated - actual) / estimated) * 100 : null;
        return {
          projectId: p.id,
          projectName: p.name,
          budgetEstimated: estimated,
          budgetActual: actual,
          marginPercent: marginPct !== null ? parseFloat(marginPct.toFixed(1)) : null,
          status: marginPct !== null && marginPct < 10 ? "at_risk" as const : marginPct !== null && marginPct < 20 ? "watch" as const : "healthy" as const,
        };
      })
      .sort((a, b) => (a.marginPercent ?? 100) - (b.marginPercent ?? 100));

    const portfolioHealth = {
      totalInvoiced: parseFloat(String(portfolioInvoiced?.total ?? "0")),
      totalCollected: parseFloat(String(portfolioCollected?.total ?? "0")),
      totalOutstanding: parseFloat(String(portfolioInvoiced?.total ?? "0")) - parseFloat(String(portfolioCollected?.total ?? "0")),
      totalOverdue: parseFloat(String(portfolioOverdue?.total ?? "0")),
      projectMargins: projectMargins.slice(0, 8),
      atRiskMarginCount: projectMargins.filter((p) => p.status === "at_risk").length,
    };

    // Inject margin-risk priorities
    projectMargins.filter((p) => p.status === "at_risk").forEach((p) => {
      priorities.push({
        level: "high" as const,
        title: `Margin at risk: ${p.projectName}`,
        description: `Project margin is ${p.marginPercent}% (budget: $${p.budgetEstimated.toLocaleString()}, actual: $${p.budgetActual.toLocaleString()}). Review costs and consider change orders.`,
        link: `/projects/${p.projectId}`,
      });
    });

    // Re-sort priorities after injecting margin-risk
    const levelOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    priorities.sort((a, b) => (levelOrder[a.level] ?? 4) - (levelOrder[b.level] ?? 4));

    // ── 10. Open RFQs (sent, awaiting responses) ───────────────────────────
    const openRfqRows = await db
      .select({ id: rfqs.id, title: rfqs.title, projectId: rfqs.projectId, status: rfqs.status, createdAt: rfqs.createdAt })
      .from(rfqs)
      .where(eq(rfqs.status, "sent"))
      .orderBy(desc(rfqs.createdAt))
      .limit(10);

    // Count pending invitations per RFQ (invited but not yet responded)
    const openRfqIds = openRfqRows.map(r => r.id);
    const pendingInviteCounts = openRfqIds.length > 0
      ? await db
          .select({ rfqId: rfqInvitations.rfqId, count: sql<number>`COUNT(*)` })
          .from(rfqInvitations)
          .where(and(inArray(rfqInvitations.rfqId, openRfqIds), eq(rfqInvitations.status, "invited")))
          .groupBy(rfqInvitations.rfqId)
      : [];
    const pendingCountMap = new Map(pendingInviteCounts.map(r => [r.rfqId, Number(r.count)]));
    const openRfqs = openRfqRows.map(r => ({ ...r, pendingResponseCount: pendingCountMap.get(r.id) ?? 0 }));

    // ── 11. Do-Not-Use Partners ─────────────────────────────────────────────
    const doNotUseVendors = await db
      .select({ id: vendors.id, companyName: vendors.companyName, tier: vendors.tier, trade: vendors.trade })
      .from(vendors)
      .where(and(eq(vendors.tier, "do_not_use"), eq(vendors.isActive, true)))
      .limit(10);
    const doNotUseSubs = await db
      .select({ id: subcontractors.id, companyName: subcontractors.companyName, tier: subcontractors.tier, trade: subcontractors.trade })
      .from(subcontractors)
      .where(eq(subcontractors.tier, "do_not_use"))
      .limit(10);
    const doNotUsePartners = [
      ...doNotUseVendors.map(v => ({ ...v, partnerType: "vendor" as const })),
      ...doNotUseSubs.map(s => ({ ...s, partnerType: "subcontractor" as const })),
    ];

    // Inject open RFQ priority if any are stale (> 7 days with no response)
    const staleRfqs = openRfqs.filter(r => {
      const daysSinceSent = Math.floor((now.getTime() - new Date(r.createdAt).getTime()) / 86400000);
      return daysSinceSent >= 7 && r.pendingResponseCount > 0;
    });
    if (staleRfqs.length > 0) {
      priorities.push({
        urgency: "medium",
        category: "RFQ",
        title: `${staleRfqs.length} RFQ${staleRfqs.length > 1 ? "s" : ""} awaiting vendor response (7+ days)`,
        description: staleRfqs.map(r => r.title).slice(0, 2).join(", "),
        link: "/rfq-management",
      });
    }

    // ── Return ─────────────────────────────────────────────────────────────
    return {
      generatedAt: now,
      priorities: priorities.slice(0, 10),
      pendingApprovals,
      highRiskProjects,
      financial: {
        overdueInvoices,
        sentNoDueDate,
        unbilledCOs,
        projectsMissingDeposit,
      },
      portfolioHealth,
      communicationGaps,
      complianceIssues,
      subVendorOps: {
        overduePOs: overduePOsEnriched,
        unreviewedInvoices,
        arrivalIssues: arrivalIssuesEnriched,
        openRfqs,
        doNotUsePartners,
      },
      fastActions: {
        pendingApprovalCount: Number(pendingApprovalCount?.count ?? 0),
        overdueInvoiceCount: Number(overdueCount?.count ?? 0),
        activeProjectCount: Number(activeProjectCount?.count ?? 0),
        highRiskProjectCount: highRiskProjects.filter(
          (p) => p.riskLevel === "high" || p.riskLevel === "critical"
        ).length,
        communicationGapCount: communicationGaps.length,
        complianceIssueCount: complianceIssues.length,
        overduePOCount: overduePOsEnriched.length,
        arrivalIssueCount: arrivalIssuesEnriched.length,
        unreviewedInvoiceCount: unreviewedInvoices.length,
        openRfqCount: openRfqs.length,
        doNotUsePartnerCount: doNotUsePartners.length,
        pendingAwardCount: Number(pendingAwardCount?.count ?? 0),
      },
      staleOrMissingNextActionCount,
      staleNextActionAlertThreshold: STALE_NEXT_ACTION_ALERT_THRESHOLD,
    };
  }),

  /**
   * Next Action status for all active projects.
   * Returns each active project with its latest next action (or null if missing/stale).
   */
  nextActionStatus: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;

    const staleThreshold = new Date(Date.now() - STALE_HOURS * 3600000);

    // All active projects
    const activeProjects = await db
      .select({ id: projects.id, name: projects.name, status: projects.status })
      .from(projects)
      .where(eq(projects.status, "active"));

    if (activeProjects.length === 0) {
      return { projects: [], missingCount: 0, staleCount: 0, freshCount: 0 };
    }

    const projectIds = activeProjects.map((p) => p.id);

    // Count pending approval items per project (queued drafts from NextActionExecutor)
    // approval_queue uses entityType='project' + entityId as the project reference
    const pendingApprovals = await db
      .select({
        entityId: approvalQueue.entityId,
        count: sql<number>`COUNT(*)`.as("count"),
      })
      .from(approvalQueue)
      .where(and(
        eq(approvalQueue.entityType, "project"),
        inArray(approvalQueue.entityId, projectIds),
        eq(approvalQueue.status, "pending"),
      ))
      .groupBy(approvalQueue.entityId);
    const pendingByProject = new Map(pendingApprovals.map((r) => [r.entityId!, Number(r.count)]));

    // Latest next action per project (subquery: max computedAt per projectId)
    const allActions = await db
      .select()
      .from(projectNextActions)
      .where(inArray(projectNextActions.projectId, projectIds))
      .orderBy(desc(projectNextActions.computedAt));

    // Deduplicate: keep only the latest per project
    const latestByProject = new Map<number, typeof allActions[0]>();
    for (const a of allActions) {
      if (!latestByProject.has(a.projectId)) {
        latestByProject.set(a.projectId, a);
      }
    }

    let missingCount = 0;
    let staleCount = 0;
    let freshCount = 0;

    const result = activeProjects.map((proj) => {
      const action = latestByProject.get(proj.id) ?? null;
      let freshness: "missing" | "stale" | "fresh" = "missing";
      if (action) {
        const isStale = action.isStale || new Date(action.computedAt) < staleThreshold;
        freshness = isStale ? "stale" : "fresh";
      }
      if (freshness === "missing") missingCount++;
      else if (freshness === "stale") staleCount++;
      else freshCount++;

      return {
        projectId: proj.id,
        projectName: proj.name,
        freshness,
        pendingDrafts: pendingByProject.get(proj.id) ?? 0,
        action: action
          ? {
              primaryAction: action.primaryAction,
              primaryActionType: action.primaryActionType,
              urgency: action.urgency,
              confidence: action.confidence,
              computedAt: action.computedAt,
              isStale: action.isStale,
            }
          : null,
      };
    });

    // Sort: missing first, then stale, then fresh
    const order: Record<string, number> = { missing: 0, stale: 1, fresh: 2 };
    result.sort((a, b) => (order[a.freshness] ?? 3) - (order[b.freshness] ?? 3));

    return { projects: result, missingCount, staleCount, freshCount };
  }),

  /**
   * Recompute next actions for all active projects.
   * Returns per-project results with success/failure status.
   */
  recomputeAll: protectedProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) return { total: 0, succeeded: 0, failed: 0, results: [] };

    const activeProjects = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(eq(projects.status, "active"));

    const results: Array<{
      projectId: number;
      projectName: string;
      success: boolean;
      primaryAction?: string;
      error?: string;
    }> = [];

    let succeeded = 0;
    let failed = 0;

    for (const proj of activeProjects) {
      try {
        const action = await computeNextAction(proj.id, false); // skipAI for speed
        if (action) {
          succeeded++;
          results.push({
            projectId: proj.id,
            projectName: proj.name,
            success: true,
            primaryAction: action.primaryAction,
          });
        } else {
          // No matching rules — still counts as success (no action needed)
          succeeded++;
          results.push({
            projectId: proj.id,
            projectName: proj.name,
            success: true,
            primaryAction: "No action needed",
          });
        }
      } catch (err: any) {
        failed++;
        results.push({
          projectId: proj.id,
          projectName: proj.name,
          success: false,
          error: err?.message ?? "Unknown error",
        });
      }
    }

    return { total: activeProjects.length, succeeded, failed, results };
  }),
});
