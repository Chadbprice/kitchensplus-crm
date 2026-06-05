import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CheckCircle, XCircle, Clock, AlertTriangle, AlertCircle, Info, Bot, RefreshCw, Send, Mail, MessageSquare } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Link } from "wouter";
import { COMM_ACTION_TYPES } from "../../../../shared/commActionTypes";

type Severity = "info" | "warning" | "critical";
type Status = "pending" | "approved" | "rejected" | "auto_resolved";

const severityConfig: Record<Severity, { color: string; icon: React.ReactNode; label: string }> = {
  critical: { color: "bg-red-500/10 border-red-500/30 text-red-400", icon: <AlertCircle className="w-4 h-4 text-red-400" />, label: "Critical" },
  warning:  { color: "bg-amber-500/10 border-amber-500/30 text-amber-400", icon: <AlertTriangle className="w-4 h-4 text-amber-400" />, label: "Warning" },
  info:     { color: "bg-blue-500/10 border-blue-500/30 text-blue-400", icon: <Info className="w-4 h-4 text-blue-400" />, label: "Info" },
};

const statusConfig: Record<Status, { color: string; label: string }> = {
  pending:      { color: "bg-amber-500/20 text-amber-300 border-amber-500/30", label: "Pending" },
  approved:     { color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", label: "Approved" },
  rejected:     { color: "bg-red-500/20 text-red-300 border-red-500/30", label: "Rejected" },
  auto_resolved:{ color: "bg-slate-500/20 text-slate-300 border-slate-500/30", label: "Auto-Resolved" },
};

function ApprovalCard({ item, onResolved }: { item: any; onResolved: () => void }) {
  const [showResolve, setShowResolve] = useState(false);
  const [resolveType, setResolveType] = useState<"approve" | "reject">("approve");
  const [showSend, setShowSend] = useState(false);
  const [note, setNote] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [sendSmsMsg, setSendSmsMsg] = useState(false);

  const isCommunication = COMM_ACTION_TYPES.includes(item.actionType);
  const payload = item.payload ? (() => { try { return JSON.parse(item.payload); } catch { return {}; } })() : {};

  const utils = trpc.useUtils();
  const resolveMutation = trpc.agents.approvalQueue.resolve.useMutation({
    onSuccess: () => { toast.success("Item approved"); setShowResolve(false); onResolved(); utils.agents.approvalQueue.count.invalidate(); },
    onError: () => toast.error("Failed to approve"),
  });
  const rejectMutation = trpc.agents.approvalQueue.reject.useMutation({
    onSuccess: () => { toast.success("Item rejected"); setShowResolve(false); onResolved(); utils.agents.approvalQueue.count.invalidate(); },
    onError: () => toast.error("Failed to reject"),
  });
  const sendMutation = trpc.agents.approvalQueue.sendCommunication.useMutation({
    onSuccess: (data) => {
      const sent = data.sent?.join(", ") ?? "Message sent";
      const warn = data.warnings?.length ? ` (warnings: ${data.warnings.join(", ")})` : "";
      toast.success(`Sent & approved — ${sent}${warn}`);
      setShowSend(false);
      onResolved();
      utils.agents.approvalQueue.count.invalidate();
    },
    onError: (err) => toast.error(err.message ?? "Failed to send"),
  });

  const sev = severityConfig[item.severity as Severity] ?? severityConfig.warning;

  return (
    <>
      <Card className={`border ${sev.color} bg-[#0f0f0f]`}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="mt-0.5 shrink-0">{sev.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${sev.color}`}>{sev.label}</span>
                  <span className="text-xs text-[#888] font-mono">{item.agentName}</span>
                  <span className="text-xs text-[#666]">{new Date(item.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="text-sm font-semibold text-[#e8dcc8] mb-1">{item.title}</p>
                {item.description && <p className="text-xs text-[#999] leading-relaxed mb-2">{item.description}</p>}
                {payload.activeTaskCount > 0 && (
                  <p className="text-xs text-amber-400">⚠ {payload.activeTaskCount} active task{payload.activeTaskCount === 1 ? "" : "s"} affected</p>
                )}
                {item.entityType === "subcontractor" && item.entityId && (
                  <Link href={`/subcontractors/${item.entityId}`}>
                    <span className="text-xs text-[#c9a96e] hover:underline cursor-pointer">View Subcontractor →</span>
                  </Link>
                )}
              </div>
            </div>
            {item.status === "pending" && (
              <div className="flex gap-2 shrink-0 flex-wrap">
                {isCommunication && (
                  <Button size="sm" className="bg-[#c9a96e] hover:bg-[#b8935a] text-black text-xs font-semibold"
                    onClick={() => setShowSend(true)}>
                    <Send className="w-3.5 h-3.5 mr-1" /> Send Now
                  </Button>
                )}
                <Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 text-xs"
                  onClick={() => { setResolveType("approve"); setShowResolve(true); }}>
                  <CheckCircle className="w-3.5 h-3.5 mr-1" /> {isCommunication ? "Approve (no send)" : "Approve"}
                </Button>
                <Button size="sm" variant="outline" className="border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs"
                  onClick={() => { setResolveType("reject"); setShowResolve(true); }}>
                  <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                </Button>
              </div>
            )}
            {item.status !== "pending" && (
              <Badge className={`text-xs shrink-0 ${statusConfig[item.status as Status]?.color}`}>
                {statusConfig[item.status as Status]?.label ?? item.status}
              </Badge>
            )}
          </div>
          {item.resolutionNote && (
            <div className="mt-3 pt-3 border-t border-[#2a2a2a]">
              <p className="text-xs text-[#888]"><span className="text-[#c9a96e]">Note:</span> {item.resolutionNote}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showResolve} onOpenChange={setShowResolve}>
        <DialogContent className="bg-[#111] border-[#2a2a2a] text-[#e8dcc8]">
          <DialogHeader>
            <DialogTitle>{resolveType === "approve" ? "Approve" : "Reject"} Item</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#999]">{item.title}</p>
          <Textarea
            placeholder="Add a note (optional)..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="bg-[#1a1a1a] border-[#2a2a2a] text-[#e8dcc8] text-sm resize-none"
            rows={3}
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowResolve(false)} className="border-[#333] text-[#999]">Cancel</Button>
            <Button
              className={resolveType === "approve" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
              disabled={resolveMutation.isPending || rejectMutation.isPending}
              onClick={() => {
                if (resolveType === "approve") resolveMutation.mutate({ id: item.id, note: note || undefined });
                else rejectMutation.mutate({ id: item.id, note: note || undefined });
              }}>
              {resolveType === "approve" ? "Confirm Approve" : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Communication Dialog */}
      <Dialog open={showSend} onOpenChange={setShowSend}>
        <DialogContent className="bg-[#111] border-[#2a2a2a] text-[#e8dcc8] max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Send className="w-4 h-4 text-[#c9a96e]" /> Send Client Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-[#1a1a1a] rounded-lg p-3 border border-[#2a2a2a]">
              <p className="text-xs text-[#888] mb-1">To</p>
              <p className="text-sm text-[#e8dcc8]">{payload.clientName ?? "Client"}</p>
              {payload.clientEmail && <p className="text-xs text-[#999]">{payload.clientEmail}</p>}
              {payload.clientPhone && <p className="text-xs text-[#999]">{payload.clientPhone}</p>}
            </div>
            {payload.subject && (
              <div>
                <p className="text-xs text-[#888] mb-1">Subject</p>
                <p className="text-sm text-[#e8dcc8]">{payload.subject}</p>
              </div>
            )}
            {payload.draftMessage && (
              <div>
                <p className="text-xs text-[#888] mb-1">Message Preview</p>
                <div className="bg-[#1a1a1a] rounded-lg p-3 border border-[#2a2a2a] max-h-40 overflow-y-auto">
                  <p className="text-xs text-[#ccc] whitespace-pre-wrap leading-relaxed">{payload.draftMessage}</p>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <p className="text-xs text-[#888] font-medium">Send via</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={sendEmail} onCheckedChange={(v) => setSendEmail(!!v)}
                  className="border-[#444]" />
                <Mail className="w-3.5 h-3.5 text-[#888]" />
                <span className="text-sm text-[#ccc]">Email{payload.clientEmail ? ` (${payload.clientEmail})` : " (no email on file)"}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={sendSmsMsg} onCheckedChange={(v) => setSendSmsMsg(!!v)}
                  className="border-[#444]" />
                <MessageSquare className="w-3.5 h-3.5 text-[#888]" />
                <span className="text-sm text-[#ccc]">SMS{payload.clientPhone ? ` (${payload.clientPhone})` : " (no phone on file)"}</span>
              </label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowSend(false)} className="border-[#333] text-[#999]">Cancel</Button>
            <Button
              className="bg-[#c9a96e] hover:bg-[#b8935a] text-black font-semibold"
              disabled={sendMutation.isPending || (!sendEmail && !sendSmsMsg)}
              onClick={() => sendMutation.mutate({ id: item.id, sendEmail, sendSmsMsg })}>
              {sendMutation.isPending ? "Sending..." : "Send & Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function AgentApprovals() {
  const [tab, setTab] = useState("pending");
  const utils = trpc.useUtils();

  const { data: items = [], isLoading, refetch } = trpc.agents.approvalQueue.list.useQuery({
    status: tab as any,
    limit: 50,
  });

  const { data: countData } = trpc.agents.approvalQueue.count.useQuery();
  const pendingCount = countData?.count ?? 0;

  // Manual compliance trigger
  const runCheck = trpc.agents.runComplianceCheck.useMutation({
    onSuccess: () => { toast.success("Compliance check started — results will appear in the activity log."); },
    onError: () => toast.error("Failed to start compliance check"),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[#e8dcc8]">AI Approval Queue</h1>
            <p className="text-xs text-[#888]">Items requiring your review and decision</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="border-[#333] text-[#999] text-xs"
            onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
          <Button size="sm" variant="outline" className="border-[#c9a96e]/40 text-[#c9a96e] hover:bg-[#c9a96e]/10 text-xs"
            disabled={runCheck.isPending}
            onClick={() => runCheck.mutate({})}>
            <Bot className="w-3.5 h-3.5 mr-1" /> Run Compliance Check
          </Button>
        </div>
      </div>

      {/* Pending badge */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <Clock className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-sm text-amber-300">
            <span className="font-semibold">{pendingCount} item{pendingCount === 1 ? "" : "s"}</span> pending your review
          </p>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-[#1a1a1a] border border-[#2a2a2a]">
          <TabsTrigger value="pending" className="data-[state=active]:bg-[#c9a96e]/20 data-[state=active]:text-[#c9a96e] text-xs">
            Pending {pendingCount > 0 && <span className="ml-1.5 bg-amber-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="approved" className="data-[state=active]:bg-[#c9a96e]/20 data-[state=active]:text-[#c9a96e] text-xs">Approved</TabsTrigger>
          <TabsTrigger value="rejected" className="data-[state=active]:bg-[#c9a96e]/20 data-[state=active]:text-[#c9a96e] text-xs">Rejected</TabsTrigger>
          <TabsTrigger value="all" className="data-[state=active]:bg-[#c9a96e]/20 data-[state=active]:text-[#c9a96e] text-xs">All</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-3">
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-[#1a1a1a] rounded-lg animate-pulse" />
              ))}
            </div>
          )}
          {!isLoading && items.length === 0 && (
            <div className="text-center py-16">
              <CheckCircle className="w-10 h-10 text-emerald-500/40 mx-auto mb-3" />
              <p className="text-[#666] text-sm">No {tab === "all" ? "" : tab} items</p>
            </div>
          )}
          {!isLoading && items.map((item: any) => (
            <ApprovalCard key={item.id} item={item} onResolved={() => refetch()} />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
