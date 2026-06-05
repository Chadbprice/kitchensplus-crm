import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Bot, CheckCircle, XCircle, AlertTriangle, Clock, ChevronDown, RefreshCw, Bell } from "lucide-react";
import { toast } from "sonner";

const statusConfig = {
  completed: { color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", icon: <CheckCircle className="w-3.5 h-3.5" /> },
  failed:    { color: "bg-red-500/20 text-red-300 border-red-500/30", icon: <XCircle className="w-3.5 h-3.5" /> },
  partial:   { color: "bg-amber-500/20 text-amber-300 border-amber-500/30", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  running:   { color: "bg-blue-500/20 text-blue-300 border-blue-500/30", icon: <Clock className="w-3.5 h-3.5" /> },
};

function RunCard({ run }: { run: any }) {
  const [open, setOpen] = useState(false);
  const sc = statusConfig[run.status as keyof typeof statusConfig] ?? statusConfig.running;
  const details = run.details ? (() => { try { return JSON.parse(run.details); } catch { return null; } })() : null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="bg-[#0f0f0f] border-[#2a2a2a] hover:border-[#3a3a3a] transition-colors">
        <CollapsibleTrigger asChild>
          <CardContent className="p-4 cursor-pointer">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#c9a96e]/10 border border-[#c9a96e]/20 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-[#c9a96e]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-sm font-medium text-[#e8dcc8] truncate">{run.agentName}</span>
                    <Badge className={`text-[10px] px-1.5 py-0 border flex items-center gap-1 ${sc.color}`}>
                      {sc.icon} {run.status}
                    </Badge>
                    <span className="text-xs text-[#666] font-mono">{run.runType}</span>
                  </div>
                  <p className="text-xs text-[#888] truncate">{run.summary}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-[#666]">{new Date(run.startedAt).toLocaleDateString()}</p>
                  <p className="text-xs text-[#555]">{run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : "—"}</p>
                </div>
                <div className="flex gap-3 text-xs text-[#888]">
                  {run.alertsCreated > 0 && <span className="text-amber-400">{run.alertsCreated} alert{run.alertsCreated === 1 ? "" : "s"}</span>}
                  {run.approvalsCreated > 0 && <span className="text-red-400">{run.approvalsCreated} approval{run.approvalsCreated === 1 ? "" : "s"}</span>}
                </div>
                <ChevronDown className={`w-4 h-4 text-[#666] transition-transform ${open ? "rotate-180" : ""}`} />
              </div>
            </div>
          </CardContent>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 border-t border-[#1e1e1e] pt-3">
            {details && (
              <div className="space-y-2">
                {details.totalChecked !== undefined && (
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="bg-[#1a1a1a] rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-[#e8dcc8]">{details.totalChecked}</p>
                      <p className="text-xs text-[#666]">Checked</p>
                    </div>
                    <div className="bg-[#1a1a1a] rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-emerald-400">{details.compliant}</p>
                      <p className="text-xs text-[#666]">Compliant</p>
                    </div>
                    <div className="bg-[#1a1a1a] rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-amber-400">{details.issues}</p>
                      <p className="text-xs text-[#666]">Issues</p>
                    </div>
                  </div>
                )}
                {details.results && details.results.length > 0 && (
                  <div className="space-y-1.5">
                    {details.results.map((r: any, i: number) => (
                      <div key={i} className="flex items-center justify-between bg-[#1a1a1a] rounded px-3 py-2">
                        <span className="text-xs text-[#ccc]">{r.subName}</span>
                        <span className={`text-xs font-medium ${
                          r.overallStatus === "compliant" ? "text-emerald-400" :
                          r.overallStatus === "expiring_soon" ? "text-amber-400" : "text-red-400"
                        }`}>{r.overallStatus}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {!details && run.summary && (
              <p className="text-xs text-[#888]">{run.summary}</p>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function AlertCard({ alert }: { alert: any }) {
  const utils = trpc.useUtils();
  const dismiss = trpc.agents.alerts.dismiss.useMutation({
    onSuccess: () => { utils.agents.alerts.count.invalidate(); utils.agents.alerts.list.invalidate(); },
  });

  const severityColors = {
    critical: "border-red-500/30 bg-red-500/5",
    warning: "border-amber-500/30 bg-amber-500/5",
    info: "border-blue-500/30 bg-blue-500/5",
  };

  return (
    <Card className={`border ${severityColors[alert.severity as keyof typeof severityColors] ?? severityColors.warning} bg-[#0f0f0f]`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${
                alert.severity === "critical" ? "text-red-400" :
                alert.severity === "warning" ? "text-amber-400" : "text-blue-400"
              }`}>{alert.severity}</span>
              <span className="text-xs text-[#666]">{new Date(alert.createdAt).toLocaleDateString()}</span>
            </div>
            <p className="text-sm text-[#e8dcc8] font-medium mb-0.5">{alert.title}</p>
            {alert.body && <p className="text-xs text-[#888]">{alert.body}</p>}
          </div>
          <Button size="sm" variant="ghost" className="text-[#666] hover:text-[#999] text-xs shrink-0"
            onClick={() => dismiss.mutate({ id: alert.id })}>
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AgentActivity() {
  const [view, setView] = useState<"runs" | "alerts">("runs");

  const { data: runs = [], isLoading: runsLoading, refetch: refetchRuns } = trpc.agents.runLog.list.useQuery({ limit: 50 });
  const { data: alerts = [], isLoading: alertsLoading, refetch: refetchAlerts } = trpc.agents.alerts.list.useQuery({ status: "active", limit: 50 });
  const { data: alertCount } = trpc.agents.alerts.count.useQuery();
  const { data: approvalCount } = trpc.agents.approvalQueue.count.useQuery();

  const runCheck = trpc.agents.runComplianceCheck.useMutation({
    onSuccess: () => { toast.success("Compliance check started"); setTimeout(() => refetchRuns(), 3000); },
    onError: () => toast.error("Failed to start check"),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#c9a96e]/10 border border-[#c9a96e]/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-[#c9a96e]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[#e8dcc8]">AI Agent Activity</h1>
            <p className="text-xs text-[#888]">Run history, alerts, and system events</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="border-[#333] text-[#999] text-xs"
            onClick={() => { refetchRuns(); refetchAlerts(); }}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
          <Button size="sm" variant="outline" className="border-[#c9a96e]/40 text-[#c9a96e] hover:bg-[#c9a96e]/10 text-xs"
            disabled={runCheck.isPending}
            onClick={() => runCheck.mutate({})}>
            <Bot className="w-3.5 h-3.5 mr-1" /> Run Now
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-[#0f0f0f] border-[#2a2a2a]">
          <CardContent className="p-4 flex items-center gap-3">
            <Bell className="w-5 h-5 text-amber-400" />
            <div>
              <p className="text-xl font-bold text-[#e8dcc8]">{alertCount?.count ?? 0}</p>
              <p className="text-xs text-[#888]">Active Alerts</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#0f0f0f] border-[#2a2a2a]">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-400" />
            <div>
              <p className="text-xl font-bold text-[#e8dcc8]">{approvalCount?.count ?? 0}</p>
              <p className="text-xs text-[#888]">Pending Approvals</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View toggle */}
      <div className="flex gap-1 bg-[#1a1a1a] p-1 rounded-lg border border-[#2a2a2a] w-fit">
        <button onClick={() => setView("runs")}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${view === "runs" ? "bg-[#c9a96e]/20 text-[#c9a96e]" : "text-[#888] hover:text-[#ccc]"}`}>
          Run History
        </button>
        <button onClick={() => setView("alerts")}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${view === "alerts" ? "bg-[#c9a96e]/20 text-[#c9a96e]" : "text-[#888] hover:text-[#ccc]"}`}>
          Active Alerts
          {(alertCount?.count ?? 0) > 0 && (
            <span className="bg-amber-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full">{alertCount?.count}</span>
          )}
        </button>
      </div>

      {/* Content */}
      {view === "runs" && (
        <div className="space-y-2">
          {runsLoading && [1,2,3].map(i => <div key={i} className="h-16 bg-[#1a1a1a] rounded-lg animate-pulse" />)}
          {!runsLoading && runs.length === 0 && (
            <div className="text-center py-16">
              <Bot className="w-10 h-10 text-[#333] mx-auto mb-3" />
              <p className="text-[#666] text-sm">No agent runs yet</p>
              <p className="text-[#555] text-xs mt-1">Click "Run Now" to trigger the first compliance check</p>
            </div>
          )}
          {!runsLoading && runs.map((run: any) => <RunCard key={run.id} run={run} />)}
        </div>
      )}

      {view === "alerts" && (
        <div className="space-y-2">
          {alertsLoading && [1,2,3].map(i => <div key={i} className="h-16 bg-[#1a1a1a] rounded-lg animate-pulse" />)}
          {!alertsLoading && alerts.length === 0 && (
            <div className="text-center py-16">
              <CheckCircle className="w-10 h-10 text-emerald-500/40 mx-auto mb-3" />
              <p className="text-[#666] text-sm">No active alerts</p>
            </div>
          )}
          {!alertsLoading && alerts.map((alert: any) => <AlertCard key={alert.id} alert={alert} />)}
        </div>
      )}
    </div>
  );
}
