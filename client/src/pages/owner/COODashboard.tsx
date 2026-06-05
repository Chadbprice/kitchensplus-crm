/**
 * COO Dashboard — /owner/coo-dashboard
 * The single-pane command center for the one human COO running the company.
 *
 * Layout (top → bottom):
 *   1. Best Path Forward — the single most important daily decision (hero)
 *   2. Fast Action Bar — 6 KPI tiles with one-click navigation
 *   3. Urgent Attention — merged priorities + pending approvals
 *   4. Risk & Finance — risk projects + portfolio health + financial flags
 *   5. Operations — compliance + sub/vendor ops + communication gaps
 *   6. Next Action Status — monitoring view with recompute controls
 */
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  DollarSign,
  FileWarning,
  Loader2,
  MessageSquareOff,
  ShieldAlert,
  Cpu,
  RefreshCw,
  RotateCcw,
  TrendingUp,
  Users,
  Zap,
  Truck,
  Package,
  Wallet,
  TrendingDown,
  Target,
  Inbox,
  Wrench,
  ClipboardCheck,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ─── Utility helpers ──────────────────────────────────────────────────────────

function formatCurrency(val: string | number | null | undefined): string {
  const n = Number(val ?? 0);
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toLocaleString()}`;
}

function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "never";
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function urgencyColor(urgency: string): string {
  if (urgency === "critical") return "#ef4444";
  if (urgency === "high") return "#f97316";
  return "#BF9A3B";
}

function urgencyBg(urgency: string): string {
  if (urgency === "critical") return "rgba(239,68,68,0.1)";
  if (urgency === "high") return "rgba(249,115,22,0.1)";
  return "rgba(191,154,59,0.1)";
}

function riskColor(level: string): string {
  if (level === "critical") return "#ef4444";
  if (level === "high") return "#f97316";
  if (level === "medium") return "#BF9A3B";
  return "#22c55e";
}

function severityColor(sev: string): string {
  if (sev === "critical") return "#ef4444";
  if (sev === "warning") return "#f97316";
  return "#BF9A3B";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, count, color, badge }: {
  icon: React.ElementType;
  title: string;
  count?: number;
  color?: string;
  badge?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 shrink-0" style={{ color: color ?? "var(--kp-gold)" }} />
      <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: "var(--kp-cream)", opacity: 0.8 }}>
        {title}
      </h2>
      {count !== undefined && count > 0 && (
        <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(191,154,59,0.2)", color: "var(--kp-gold)" }}>
          {count}
        </span>
      )}
      {badge && (
        <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(191,154,59,0.15)", color: "var(--kp-gold)" }}>
          {badge}
        </span>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 py-3 px-4 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
      <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "#22c55e" }} />
      <span className="text-sm" style={{ color: "var(--kp-muted)" }}>{message}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function COODashboard() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const [recomputeRunning, setRecomputeRunning] = useState(false);
  const [recomputeResult, setRecomputeResult] = useState<{
    total: number;
    succeeded: number;
    failed: number;
    results: Array<{ projectId: number; projectName: string; success: boolean; primaryAction?: string; error?: string }>;
  } | null>(null);

  const { data, isLoading, error, dataUpdatedAt } = trpc.coo.summary.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });

  const { data: naStatus, isLoading: naLoading } = trpc.coo.nextActionStatus.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });

  const recomputeAll = trpc.coo.recomputeAll.useMutation({
    onMutate: () => { setRecomputeRunning(true); setRecomputeResult(null); },
    onSuccess: (result) => {
      setRecomputeRunning(false);
      setRecomputeResult(result);
      utils.coo.nextActionStatus.invalidate();
      utils.coo.summary.invalidate();
    },
    onError: () => {
      setRecomputeRunning(false);
      toast.error("Recompute Failed — Could not recompute next actions.");
    },
  });

  const handleRefresh = () => {
    utils.coo.summary.invalidate();
    utils.coo.nextActionStatus.invalidate();
  };

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Cpu className="h-6 w-6" style={{ color: "var(--kp-gold)" }} />
          <h1 className="text-2xl font-serif" style={{ color: "var(--kp-cream)" }}>COO Dashboard</h1>
        </div>
        <Skeleton className="h-36 rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error || !data) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Cpu className="h-6 w-6" style={{ color: "var(--kp-gold)" }} />
          <h1 className="text-2xl font-serif" style={{ color: "var(--kp-cream)" }}>COO Dashboard</h1>
        </div>
        <div className="rounded-xl p-6 text-center" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
          <AlertTriangle className="h-8 w-8 mx-auto mb-2" style={{ color: "#ef4444" }} />
          <p style={{ color: "var(--kp-cream)" }}>Failed to load dashboard data.</p>
          <Button className="mt-3 btn-gold" onClick={handleRefresh}>Retry</Button>
        </div>
      </div>
    );
  }

  const { priorities, pendingApprovals, highRiskProjects, financial, portfolioHealth, communicationGaps, complianceIssues, subVendorOps, fastActions, staleOrMissingNextActionCount, staleNextActionAlertThreshold } = data;
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  // ── Best Path Forward logic ──
  const bpf = (() => {
    const criticalRisk = highRiskProjects.find(p => p.riskLevel === "critical");
    const overdueInvoice = financial.overdueInvoices[0];
    const pendingApproval = pendingApprovals[0];
    const topPriority = priorities[0];
    const commGap = communicationGaps[0];
    const staleCount = staleOrMissingNextActionCount ?? 0;
    const staleThreshold = staleNextActionAlertThreshold ?? 3;
    const hasStaleAlert = staleCount >= staleThreshold;
    let action = "All systems nominal — review active projects for next steps.";
    let problem = "No critical issues detected.";
    let outcome = "Maintain current momentum.";
    let uc = "#4CAF7D";
    let link: string | null = null;

    if (criticalRisk) {
      problem = `${criticalRisk.projectName} has a critical risk score (${criticalRisk.overallRiskScore ?? 0}/100).`;
      action = `Open ${criticalRisk.projectName} and address the top risk factor.`;
      outcome = "Reduce risk exposure before it impacts timeline or budget.";
      uc = "#EF4444";
      link = `/projects/${criticalRisk.projectId}`;
    } else if (overdueInvoice) {
      problem = `Invoice #${overdueInvoice.invoiceNumber} ($${Number(overdueInvoice.amount).toLocaleString()}) is overdue.`;
      action = `Follow up with ${overdueInvoice.clientName ?? "the client"} on Invoice #${overdueInvoice.invoiceNumber}.`;
      outcome = `Recover $${Number(overdueInvoice.amount).toLocaleString()} in outstanding revenue.`;
      uc = "#EF4444";
      link = "/invoices";
    } else if (pendingApproval) {
      problem = `${fastActions.pendingApprovalCount} item${fastActions.pendingApprovalCount !== 1 ? "s" : ""} waiting in the Approval Queue.`;
      action = `Review and approve: "${pendingApproval.title}".`;
      outcome = "Unblock automated communications and financial reviews.";
      uc = "#F97316";
      link = "/agent-approvals";
    } else if (hasStaleAlert) {
      problem = `${staleCount} active project${staleCount !== 1 ? "s have" : " has"} outdated or missing next actions.`;
      action = `Recompute next actions for ${staleCount} project${staleCount !== 1 ? "s" : ""}.`;
      outcome = "Restore operational visibility and unblock AI recommendations.";
      uc = "#F97316";
      link = null;
    } else if (topPriority) {
      problem = topPriority.description ?? `${topPriority.title} needs attention.`;
      action = topPriority.title;
      outcome = "Address the highest-urgency item across all active projects.";
      uc = topPriority.urgency === "critical" ? "#EF4444" : topPriority.urgency === "high" ? "#F97316" : "#EAB308";
      link = topPriority.link;
    } else if (commGap) {
      problem = `${commGap.projectName} has had no client communication in over 7 days.`;
      action = `Send a project update to the client for ${commGap.projectName}.`;
      outcome = "Maintain client trust and reduce inbound inquiry volume.";
      uc = "#BF9A3B";
      link = `/projects/${commGap.projectId}`;
    }
    return { problem, action, outcome, uc, link };
  })();

  // ── Compute section counts for noise reduction ──
  const urgentCount = priorities.length + pendingApprovals.length;
  const opsIssueCount = complianceIssues.filter(c => c.isExpired).length
    + (subVendorOps?.arrivalIssues?.length ?? 0)
    + (subVendorOps?.overduePOs?.length ?? 0)
    + communicationGaps.length;
  const financeIssueCount = financial.overdueInvoices.length + financial.unbilledCOs.length + financial.projectsMissingDeposit.length;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Cpu className="h-6 w-6" style={{ color: "var(--kp-gold)" }} />
          <div>
            <h1 className="text-2xl font-serif" style={{ color: "var(--kp-cream)" }}>COO Dashboard</h1>
            {lastUpdated && (
              <p className="text-xs mt-0.5" style={{ color: "var(--kp-muted)" }}>
                Updated {timeAgo(lastUpdated)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-xs"
            style={{ borderColor: "rgba(191,154,59,0.3)", color: "var(--kp-gold)" }}
            disabled={recomputeRunning}
            onClick={() => recomputeAll.mutate()}
          >
            {recomputeRunning ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Recomputing...</>
            ) : (
              <><RotateCcw className="h-3.5 w-3.5" /> Recompute All</>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-xs"
            style={{ borderColor: "rgba(191,154,59,0.3)", color: "var(--kp-gold)" }}
            onClick={handleRefresh}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Recompute Result Panel ─────────────────────────────────────────── */}
      {recomputeResult && (
        <div className="rounded-lg p-4" style={{ background: "rgba(191,154,59,0.07)", border: "1px solid rgba(191,154,59,0.25)" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" style={{ color: "#22c55e" }} />
              <span className="text-sm font-medium" style={{ color: "var(--kp-cream)" }}>Recompute Complete</span>
              <Badge variant="outline" className="text-[10px]" style={{ borderColor: "rgba(34,197,94,0.4)", color: "#22c55e" }}>
                {recomputeResult.succeeded}/{recomputeResult.total} succeeded
              </Badge>
              {recomputeResult.failed > 0 && (
                <Badge variant="outline" className="text-[10px]" style={{ borderColor: "rgba(239,68,68,0.4)", color: "#ef4444" }}>
                  {recomputeResult.failed} failed
                </Badge>
              )}
            </div>
            <button
              className="text-[10px] uppercase tracking-widest opacity-50 hover:opacity-80 transition-opacity"
              style={{ color: "var(--kp-muted)" }}
              onClick={() => setRecomputeResult(null)}
            >
              Dismiss
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {recomputeResult.results.map((r) => (
              <div
                key={r.projectId}
                className="flex items-start gap-2 rounded p-2"
                style={{ background: r.success ? "rgba(34,197,94,0.05)" : "rgba(239,68,68,0.05)", border: `1px solid ${r.success ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"}` }}
              >
                <div className="mt-0.5 h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: r.success ? "#22c55e" : "#ef4444", marginTop: "0.35rem" }} />
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: "var(--kp-cream)" }}>{r.projectName}</p>
                  <p className="text-[10px] truncate" style={{ color: "var(--kp-muted)" }}>
                    {r.success ? (r.primaryAction ?? "No action needed") : (r.error ?? "Error")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
       *  SECTION 1 — BEST PATH FORWARD (Hero)
       *  The single most important daily decision — always visible at the top.
       * ═══════════════════════════════════════════════════════════════════════ */}
      <Card style={{ background: "linear-gradient(135deg, rgba(191,154,59,0.10) 0%, rgba(191,154,59,0.03) 100%)", border: "1px solid rgba(191,154,59,0.35)" }}>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4" style={{ color: "var(--kp-gold)" }} />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--kp-gold)" }}>Best Path Forward</span>
            <div className="flex-1" />
            <div className="h-1.5 w-1.5 rounded-full" style={{ background: bpf.uc }} />
            <span className="text-[10px]" style={{ color: "var(--kp-muted)" }}>
              {priorities.length} priorit{priorities.length !== 1 ? "ies" : "y"} · {fastActions.activeProjectCount} project{fastActions.activeProjectCount !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg p-3" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
              <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--kp-muted)" }}>Biggest Problem</p>
              <p className="text-sm leading-snug" style={{ color: "var(--kp-cream)" }}>{bpf.problem}</p>
            </div>
            <div className="rounded-lg p-3" style={{ background: `${bpf.uc}0d`, border: `1px solid ${bpf.uc}30` }}>
              <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--kp-muted)" }}>Single Best Action</p>
              <p className="text-sm font-semibold leading-snug" style={{ color: bpf.uc }}>{bpf.action}</p>
            </div>
            <div className="rounded-lg p-3" style={{ background: "rgba(74,207,125,0.06)", border: "1px solid rgba(74,207,125,0.15)" }}>
              <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--kp-muted)" }}>Expected Outcome</p>
              <p className="text-sm leading-snug" style={{ color: "var(--kp-cream)" }}>{bpf.outcome}</p>
            </div>
          </div>
          {bpf.link && (
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                className="gap-1.5 text-xs btn-gold"
                onClick={() => navigate(bpf.link!)}
              >
                Take Action <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════════
       *  SECTION 2 — FAST ACTION BAR (KPI tiles)
       * ═══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Pending Approvals", value: fastActions.pendingApprovalCount, color: fastActions.pendingApprovalCount > 0 ? "#f97316" : "#22c55e", link: "/agent-approvals" },
          { label: "Overdue Invoices", value: fastActions.overdueInvoiceCount, color: fastActions.overdueInvoiceCount > 0 ? "#ef4444" : "#22c55e", link: "/invoices" },
          { label: "Active Projects", value: fastActions.activeProjectCount, color: "var(--kp-gold)", link: "/projects" },
          { label: "High-Risk Projects", value: fastActions.highRiskProjectCount, color: fastActions.highRiskProjectCount > 0 ? "#f97316" : "#22c55e", link: "/projects" },
          { label: "Overdue POs", value: fastActions.overduePOCount ?? 0, color: (fastActions.overduePOCount ?? 0) > 0 ? "#ef4444" : "#22c55e", link: "/purchase-orders" },
          { label: "Compliance Issues", value: fastActions.complianceIssueCount, color: fastActions.complianceIssueCount > 0 ? "#f97316" : "#22c55e", link: "/subcontractors" },
          { label: "Pending Awards", value: (fastActions as any).pendingAwardCount ?? 0, color: ((fastActions as any).pendingAwardCount ?? 0) > 0 ? "#BF9A3B" : "#22c55e", link: "/subcontractors" },
        ].map((stat) => (
          <button
            key={stat.label}
            onClick={() => navigate(stat.link)}
            className="rounded-xl p-3 text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div className="text-2xl font-bold font-serif" style={{ color: stat.color }}>{stat.value}</div>
            <div className="text-[11px] mt-1 leading-tight" style={{ color: "var(--kp-muted)" }}>{stat.label}</div>
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
       *  SECTION 3 — URGENT ATTENTION (Priorities + Approvals merged)
       * ═══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Today's Priorities */}
        <Card style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(191,154,59,0.15)" }}>
          <CardHeader className="pb-2">
            <SectionHeader icon={Zap} title="Today's Priorities" count={priorities.length} color="#BF9A3B" />
          </CardHeader>
          <CardContent>
            {priorities.length === 0 ? (
              <EmptyState message="No urgent items — all systems clear." />
            ) : (
              <div className="space-y-2">
                {priorities.slice(0, 5).map((p, i) => (
                  <button
                    key={i}
                    onClick={() => navigate(p.link)}
                    className="w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all hover:brightness-110"
                    style={{ background: urgencyBg(p.urgency), border: `1px solid ${urgencyColor(p.urgency)}30` }}
                  >
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5" style={{ background: urgencyColor(p.urgency) + "25", color: urgencyColor(p.urgency) }}>
                      {p.urgency}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: "var(--kp-cream)" }}>{p.title}</div>
                      <div className="text-xs mt-0.5 truncate" style={{ color: "var(--kp-muted)" }}>{p.description}</div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 mt-0.5" style={{ color: urgencyColor(p.urgency) }} />
                  </button>
                ))}
                {priorities.length > 5 && (
                  <p className="text-center text-xs py-1" style={{ color: "var(--kp-muted)" }}>
                    +{priorities.length - 5} more priorities
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending Approvals */}
        <Card style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(191,154,59,0.15)" }}>
          <CardHeader className="pb-2">
            <SectionHeader icon={Inbox} title="Pending Approvals" count={pendingApprovals.length} />
          </CardHeader>
          <CardContent>
            {pendingApprovals.length === 0 ? (
              <EmptyState message="Approval queue is clear." />
            ) : (
              <div className="space-y-2">
                {pendingApprovals.slice(0, 5).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => navigate("/agent-approvals")}
                    className="w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all hover:brightness-110"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <div className="h-2 w-2 rounded-full mt-1.5 shrink-0" style={{ background: severityColor(item.severity) }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium leading-snug" style={{ color: "var(--kp-cream)" }}>{item.title}</div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--kp-muted)" }}>{item.agentName} · {timeAgo(item.createdAt)}</div>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0" style={{ borderColor: severityColor(item.severity) + "50", color: severityColor(item.severity) }}>
                      {item.severity}
                    </Badge>
                  </button>
                ))}
                {pendingApprovals.length > 5 && (
                  <button onClick={() => navigate("/agent-approvals")} className="w-full text-center text-xs py-2 rounded-lg" style={{ color: "var(--kp-gold)", background: "rgba(191,154,59,0.07)" }}>
                    View all {pendingApprovals.length} approvals →
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ═══════════════════════════════════════════════════════════════════════
         *  SECTION 4 — RISK & FINANCE
         * ═══════════════════════════════════════════════════════════════════════ */}

        {/* Highest-Risk Projects */}
        <Card style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(191,154,59,0.15)" }}>
          <CardHeader className="pb-2">
            <SectionHeader icon={TrendingUp} title="Highest-Risk Projects" count={highRiskProjects.filter(p => p.riskLevel === "high" || p.riskLevel === "critical").length} color="#f97316" />
          </CardHeader>
          <CardContent>
            {highRiskProjects.length === 0 ? (
              <EmptyState message="No risk scores yet — run a risk scan to populate." />
            ) : (
              <div className="space-y-2">
                {highRiskProjects.map((proj) => (
                  <button
                    key={proj.projectId}
                    onClick={() => navigate(`/projects/${proj.projectId}`)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all hover:brightness-110"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <div className="flex-shrink-0 text-center" style={{ minWidth: 40 }}>
                      <div className="text-xl font-bold font-serif" style={{ color: riskColor(proj.riskLevel) }}>{proj.overallRiskScore}</div>
                      <div className="text-[9px] uppercase tracking-wide" style={{ color: riskColor(proj.riskLevel) }}>{proj.riskLevel}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: "var(--kp-cream)" }}>{proj.projectName}</div>
                      <div className="text-xs mt-0.5 truncate" style={{ color: "var(--kp-muted)" }}>{proj.topRiskFactor ?? "No factor noted"}</div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0" style={{ color: "var(--kp-muted)" }} />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Financial Attention */}
        <Card style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(191,154,59,0.15)" }}>
          <CardHeader className="pb-2">
            <SectionHeader
              icon={DollarSign}
              title="Financial Attention"
              count={financeIssueCount}
              color={financeIssueCount > 0 ? "#ef4444" : "#22c55e"}
            />
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Overdue invoices */}
            {financial.overdueInvoices.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest mb-1.5 font-semibold" style={{ color: "#ef4444" }}>Overdue Invoices</p>
                <div className="space-y-1.5">
                  {financial.overdueInvoices.slice(0, 3).map((inv) => (
                    <button
                      key={inv.id}
                      onClick={() => navigate("/invoices")}
                      className="w-full flex items-center gap-2 p-2 rounded-lg text-left hover:brightness-110"
                      style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}
                    >
                      <FileWarning className="h-3.5 w-3.5 shrink-0" style={{ color: "#ef4444" }} />
                      <span className="flex-1 text-xs truncate" style={{ color: "var(--kp-cream)" }}>
                        {inv.invoiceNumber ?? `Invoice #${inv.id}`} · {inv.invoiceType}
                      </span>
                      <span className="text-xs font-semibold shrink-0" style={{ color: "#ef4444" }}>
                        {formatCurrency(Number(inv.amount) - Number(inv.amountPaid ?? 0))}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Unbilled approved COs */}
            {financial.unbilledCOs.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest mb-1.5 font-semibold" style={{ color: "#f97316" }}>Unbilled Change Orders</p>
                <div className="space-y-1.5">
                  {financial.unbilledCOs.slice(0, 3).map((co) => (
                    <button
                      key={co.id}
                      onClick={() => navigate(`/projects/${co.projectId}`)}
                      className="w-full flex items-center gap-2 p-2 rounded-lg text-left hover:brightness-110"
                      style={{ background: "rgba(249,115,22,0.07)", border: "1px solid rgba(249,115,22,0.2)" }}
                    >
                      <DollarSign className="h-3.5 w-3.5 shrink-0" style={{ color: "#f97316" }} />
                      <span className="flex-1 text-xs truncate" style={{ color: "var(--kp-cream)" }}>{co.title}</span>
                      <span className="text-xs font-semibold shrink-0" style={{ color: "#f97316" }}>{formatCurrency(co.amount)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Missing deposits */}
            {financial.projectsMissingDeposit.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest mb-1.5 font-semibold" style={{ color: "#BF9A3B" }}>No Deposit Invoice</p>
                <div className="space-y-1.5">
                  {financial.projectsMissingDeposit.slice(0, 3).map((proj) => (
                    <button
                      key={proj.id}
                      onClick={() => navigate(`/projects/${proj.id}`)}
                      className="w-full flex items-center gap-2 p-2 rounded-lg text-left hover:brightness-110"
                      style={{ background: "rgba(191,154,59,0.07)", border: "1px solid rgba(191,154,59,0.2)" }}
                    >
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: "#BF9A3B" }} />
                      <span className="flex-1 text-xs truncate" style={{ color: "var(--kp-cream)" }}>{proj.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {financeIssueCount === 0 && (
              <EmptyState message="No financial flags at this time." />
            )}
          </CardContent>
        </Card>

        {/* Portfolio Financial Health (full-width) */}
        {portfolioHealth && (
          <Card className="lg:col-span-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(191,154,59,0.15)" }}>
            <CardHeader className="pb-2">
              <SectionHeader icon={Wallet} title="Portfolio Financial Health" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Total Invoiced", value: portfolioHealth.totalInvoiced, color: "#BF9A3B" },
                  { label: "Collected", value: portfolioHealth.totalCollected, color: "#22c55e" },
                  { label: "Outstanding", value: portfolioHealth.totalOutstanding, color: "#f97316" },
                  { label: "Overdue", value: portfolioHealth.totalOverdue, color: "#ef4444" },
                ].map((m) => (
                  <div key={m.label} className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.04)" }}>
                    <div className="text-xs text-neutral-400 mb-1">{m.label}</div>
                    <div className="text-lg font-semibold" style={{ color: m.color }}>
                      ${m.value >= 1000 ? `${(m.value / 1000).toFixed(1)}k` : m.value.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                    </div>
                  </div>
                ))}
              </div>
              {portfolioHealth.projectMargins.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-neutral-400 mb-2 flex items-center gap-1.5">
                    <TrendingDown className="w-3.5 h-3.5" /> Project Margin Risk
                    {portfolioHealth.atRiskMarginCount > 0 && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0 ml-1">
                        {portfolioHealth.atRiskMarginCount} at risk
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {portfolioHealth.projectMargins.map((pm: any) => (
                      <div
                        key={pm.projectId}
                        className="flex items-center justify-between rounded px-3 py-2 cursor-pointer hover:bg-white/5 transition-colors"
                        style={{ background: "rgba(255,255,255,0.02)" }}
                        onClick={() => navigate(`/projects/${pm.projectId}`)}
                      >
                        <span className="text-sm truncate max-w-[180px]">{pm.projectName}</span>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-neutral-400">
                            ${pm.budgetEstimated >= 1000 ? `${(pm.budgetEstimated / 1000).toFixed(0)}k` : pm.budgetEstimated} est
                          </span>
                          <span className="text-neutral-400">
                            ${pm.budgetActual >= 1000 ? `${(pm.budgetActual / 1000).toFixed(0)}k` : pm.budgetActual} actual
                          </span>
                          <Badge
                            variant={pm.status === "at_risk" ? "destructive" : pm.status === "watch" ? "outline" : "secondary"}
                            className="text-[10px] px-1.5 py-0"
                          >
                            {pm.marginPercent !== null ? `${pm.marginPercent}%` : "N/A"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {portfolioHealth.projectMargins.length === 0 && (
                <p className="text-sm text-neutral-500 italic">No projects with budget data to compute margins.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
         *  SECTION 5 — OPERATIONS (Compliance + Sub/Vendor + Comms merged)
         * ═══════════════════════════════════════════════════════════════════════ */}

        {/* Trade Partner Operations (Compliance + Sub/Vendor merged) */}
        <Card style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(191,154,59,0.15)" }}>
          <CardHeader className="pb-2">
            <SectionHeader
              icon={Wrench}
              title="Trade Partner Ops"
              count={complianceIssues.filter(c => c.isExpired).length + (subVendorOps?.arrivalIssues?.length ?? 0) + (subVendorOps?.overduePOs?.length ?? 0)}
              color={(subVendorOps?.arrivalIssues?.length ?? 0) > 0 || complianceIssues.some(c => c.isExpired) ? "#ef4444" : "#f97316"}
            />
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Arrival Issues (most urgent) */}
            {(subVendorOps?.arrivalIssues ?? []).length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest mb-1.5 font-semibold" style={{ color: "#ef4444" }}>Arrival Issues</p>
                <div className="space-y-1.5">
                  {(subVendorOps.arrivalIssues ?? []).slice(0, 3).map((issue: any) => (
                    <button
                      key={`arrival-${issue.id}`}
                      onClick={() => navigate(issue.projectId ? `/projects/${issue.projectId}` : "/schedule")}
                      className="w-full flex items-center gap-2 p-2 rounded-lg text-left hover:brightness-110"
                      style={{
                        background: issue.hoursLate >= 4 ? "rgba(239,68,68,0.07)" : "rgba(249,115,22,0.07)",
                        border: `1px solid ${issue.hoursLate >= 4 ? "rgba(239,68,68,0.2)" : "rgba(249,115,22,0.2)"}`,
                      }}
                    >
                      <Users className="h-3.5 w-3.5 shrink-0" style={{ color: issue.hoursLate >= 4 ? "#ef4444" : "#f97316" }} />
                      <span className="flex-1 text-xs truncate" style={{ color: "var(--kp-cream)" }}>
                        {issue.assigneeName} — {Math.round(issue.hoursLate)}h late
                      </span>
                      <Badge variant="outline" className="text-[10px] shrink-0" style={{ borderColor: issue.hoursLate >= 4 ? "rgba(239,68,68,0.4)" : "rgba(249,115,22,0.4)", color: issue.hoursLate >= 4 ? "#ef4444" : "#f97316" }}>
                        {issue.hoursLate >= 4 ? "NO-SHOW" : "LATE"}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Overdue POs */}
            {(subVendorOps?.overduePOs ?? []).length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest mb-1.5 font-semibold" style={{ color: "#f97316" }}>Overdue Deliveries</p>
                <div className="space-y-1.5">
                  {(subVendorOps.overduePOs ?? []).slice(0, 3).map((po: any) => (
                    <button
                      key={`po-${po.id}`}
                      onClick={() => navigate("/purchase-orders")}
                      className="w-full flex items-center gap-2 p-2 rounded-lg text-left hover:brightness-110"
                      style={{ background: "rgba(249,115,22,0.07)", border: "1px solid rgba(249,115,22,0.2)" }}
                    >
                      <Package className="h-3.5 w-3.5 shrink-0" style={{ color: "#f97316" }} />
                      <span className="flex-1 text-xs truncate" style={{ color: "var(--kp-cream)" }}>
                        {po.poNumber ?? `PO-${po.id}`} — {po.vendorName} · {po.daysOverdue}d late
                      </span>
                      <Badge variant="outline" className="text-[10px] shrink-0" style={{ borderColor: "rgba(249,115,22,0.4)", color: "#f97316" }}>
                        {po.daysOverdue}d
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Compliance Issues */}
            {complianceIssues.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest mb-1.5 font-semibold" style={{ color: complianceIssues.some(c => c.isExpired) ? "#ef4444" : "#f97316" }}>Compliance</p>
                <div className="space-y-1.5">
                  {complianceIssues.slice(0, 4).map((issue) => (
                    <button
                      key={issue.docId}
                      onClick={() => navigate("/subcontractors")}
                      className="w-full flex items-center gap-2 p-2 rounded-lg text-left hover:brightness-110"
                      style={{
                        background: issue.isExpired ? "rgba(239,68,68,0.07)" : "rgba(249,115,22,0.07)",
                        border: `1px solid ${issue.isExpired ? "rgba(239,68,68,0.2)" : "rgba(249,115,22,0.2)"}`,
                      }}
                    >
                      <ShieldAlert className="h-3.5 w-3.5 shrink-0" style={{ color: issue.isExpired ? "#ef4444" : "#f97316" }} />
                      <span className="flex-1 text-xs truncate" style={{ color: "var(--kp-cream)" }}>
                        {issue.companyName} · {issue.docType.toUpperCase()}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[10px] shrink-0"
                        style={{
                          borderColor: issue.isExpired ? "rgba(239,68,68,0.4)" : "rgba(249,115,22,0.4)",
                          color: issue.isExpired ? "#ef4444" : "#f97316",
                        }}
                      >
                        {issue.isExpired ? "EXPIRED" : `${issue.daysUntilExpiry}d`}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Unreviewed Vendor Invoices */}
            {(subVendorOps?.unreviewedInvoices ?? []).length > 0 && (
              <button
                onClick={() => navigate("/owner/vendors")}
                className="w-full flex items-center gap-2 p-2 rounded-lg text-left hover:brightness-110"
                style={{ background: "rgba(191,154,59,0.07)", border: "1px solid rgba(191,154,59,0.2)" }}
              >
                <DollarSign className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--kp-gold)" }} />
                <span className="flex-1 text-xs" style={{ color: "var(--kp-cream)" }}>
                  {subVendorOps.unreviewedInvoices.length} vendor invoice{subVendorOps.unreviewedInvoices.length === 1 ? "" : "s"} awaiting review
                </span>
                <Badge variant="outline" className="text-[10px] shrink-0" style={{ borderColor: "rgba(191,154,59,0.4)", color: "var(--kp-gold)" }}>REVIEW</Badge>
              </button>
            )}

            {/* Open RFQs awaiting vendor responses */}
            {(subVendorOps?.openRfqs ?? []).length > 0 && (
              <button
                onClick={() => navigate("/rfq-management")}
                className="w-full flex items-center gap-2 p-2 rounded-lg text-left hover:brightness-110"
                style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.2)" }}
              >
                <ClipboardCheck className="h-3.5 w-3.5 shrink-0" style={{ color: "#818cf8" }} />
                <span className="flex-1 text-xs" style={{ color: "var(--kp-cream)" }}>
                  {subVendorOps.openRfqs.length} open RFQ{subVendorOps.openRfqs.length === 1 ? "" : "s"} — {subVendorOps.openRfqs.reduce((sum: number, r: any) => sum + (r.pendingResponseCount ?? 0), 0)} pending response{subVendorOps.openRfqs.reduce((sum: number, r: any) => sum + (r.pendingResponseCount ?? 0), 0) === 1 ? "" : "s"}
                </span>
                <Badge variant="outline" className="text-[10px] shrink-0" style={{ borderColor: "rgba(99,102,241,0.4)", color: "#818cf8" }}>RFQ</Badge>
              </button>
            )}

            {/* Do-Not-Use Partners Warning */}
            {(subVendorOps?.doNotUsePartners ?? []).length > 0 && (
              <div
                className="w-full p-2 rounded-lg"
                style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)" }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: "#ef4444" }} />
                  <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "#ef4444" }}>Do-Not-Use Partners ({subVendorOps.doNotUsePartners.length})</span>
                </div>
                <div className="space-y-1">
                  {(subVendorOps.doNotUsePartners as any[]).slice(0, 3).map((p: any) => (
                    <button
                      key={`${p.partnerType}-${p.id}`}
                      onClick={() => navigate(p.partnerType === "vendor" ? `/vendors/${p.id}` : `/subcontractors/${p.id}`)}
                      className="w-full flex items-center gap-2 text-left hover:opacity-80"
                    >
                      <span className="text-xs flex-1 truncate" style={{ color: "var(--kp-cream)" }}>{p.companyName}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0" style={{ borderColor: "rgba(239,68,68,0.4)", color: "#ef4444" }}>{p.partnerType === "vendor" ? "VENDOR" : "SUB"}</Badge>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {complianceIssues.length === 0 && (subVendorOps?.arrivalIssues?.length ?? 0) === 0 && (subVendorOps?.overduePOs?.length ?? 0) === 0 && (subVendorOps?.unreviewedInvoices?.length ?? 0) === 0 && (subVendorOps?.openRfqs?.length ?? 0) === 0 && (subVendorOps?.doNotUsePartners?.length ?? 0) === 0 && (
              <EmptyState message="All trade partners are current." />
            )}
          </CardContent>
        </Card>

        {/* Communication Gaps */}
        <Card style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(191,154,59,0.15)" }}>
          <CardHeader className="pb-2">
            <SectionHeader icon={MessageSquareOff} title="Communication Gaps" count={communicationGaps.length} color="#BF9A3B" />
          </CardHeader>
          <CardContent>
            {communicationGaps.length === 0 ? (
              <EmptyState message="All active projects have recent client messages." />
            ) : (
              <div className="space-y-2">
                {communicationGaps.map((gap) => (
                  <button
                    key={gap.projectId}
                    onClick={() => navigate(`/projects/${gap.projectId}`)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg text-left hover:brightness-110"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <MessageSquareOff className="h-4 w-4 shrink-0" style={{ color: "var(--kp-gold)" }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: "var(--kp-cream)" }}>{gap.projectName}</div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--kp-muted)" }}>
                        {gap.lastOutboundAt === null
                          ? "No messages sent yet"
                          : `Last message ${gap.daysSinceLastMessage}d ago`}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0" style={{ color: "var(--kp-muted)" }} />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ═══════════════════════════════════════════════════════════════════════
         *  SECTION 6 — NEXT ACTION STATUS (Monitoring)
         * ═══════════════════════════════════════════════════════════════════════ */}
        <Card className="lg:col-span-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(191,154,59,0.15)" }}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <SectionHeader
                icon={RotateCcw}
                title="Next Action Status"
                count={naStatus ? naStatus.missingCount + naStatus.staleCount : undefined}
                color="#BF9A3B"
              />
            </div>
          </CardHeader>
          <CardContent>
            {naLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
              </div>
            ) : !naStatus || naStatus.projects.length === 0 ? (
              <EmptyState message="No active projects to evaluate." />
            ) : (
              <div className="space-y-3">
                {/* Freshness summary bar */}
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: "#ef4444" }} />
                    <span style={{ color: "var(--kp-muted)" }}>Missing: <strong style={{ color: "var(--kp-cream)" }}>{naStatus.missingCount}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: "#f97316" }} />
                    <span style={{ color: "var(--kp-muted)" }}>Stale: <strong style={{ color: "var(--kp-cream)" }}>{naStatus.staleCount}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: "#22c55e" }} />
                    <span style={{ color: "var(--kp-muted)" }}>Fresh: <strong style={{ color: "var(--kp-cream)" }}>{naStatus.freshCount}</strong></span>
                  </div>
                </div>

                {/* Project list */}
                <div className="space-y-2">
                  {naStatus.projects.map((proj) => {
                    const freshnessColor = proj.freshness === "missing" ? "#ef4444" : proj.freshness === "stale" ? "#f97316" : "#22c55e";
                    const freshnessLabel = proj.freshness === "missing" ? "NO ACTION" : proj.freshness === "stale" ? "STALE" : "FRESH";
                    const hasDrafts = (proj.pendingDrafts ?? 0) > 0;
                    return (
                      <button
                        key={proj.projectId}
                        onClick={() => navigate(`/projects/${proj.projectId}`)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all hover:brightness-110"
                        style={{
                          background: proj.freshness === "fresh" ? "rgba(255,255,255,0.03)" : `${freshnessColor}08`,
                          border: `1px solid ${freshnessColor}25`,
                        }}
                      >
                        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: freshnessColor }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate" style={{ color: "var(--kp-cream)" }}>{proj.projectName}</div>
                          <div className="text-xs mt-0.5 truncate" style={{ color: "var(--kp-muted)" }}>
                            {proj.action
                              ? `${proj.action.primaryAction} · ${timeAgo(proj.action.computedAt)}`
                              : "No next action computed yet"}
                          </div>
                        </div>
                        {hasDrafts && (
                          <Badge
                            variant="outline"
                            className="text-[10px] shrink-0"
                            style={{ borderColor: "rgba(191,154,59,0.5)", color: "var(--kp-gold)", background: "rgba(191,154,59,0.1)" }}
                          >
                            {proj.pendingDrafts} draft{proj.pendingDrafts !== 1 ? "s" : ""}
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className="text-[10px] shrink-0"
                          style={{ borderColor: `${freshnessColor}50`, color: freshnessColor }}
                        >
                          {freshnessLabel}
                        </Badge>
                        <ArrowRight className="h-4 w-4 shrink-0" style={{ color: "var(--kp-muted)" }} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
