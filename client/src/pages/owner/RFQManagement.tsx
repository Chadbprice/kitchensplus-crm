import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus,
  Search,
  FileText,
  Clock,
  DollarSign,
  Users,
  CheckCircle2,
  XCircle,
  Send,
  ChevronRight,
  Award,
  Filter,
} from "lucide-react";

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  draft:    { label: "Draft",    color: "#888",     bg: "rgba(100,100,100,0.12)", border: "rgba(100,100,100,0.25)" },
  sent:     { label: "Open",     color: "#E67700",  bg: "rgba(230,119,0,0.12)",   border: "rgba(230,119,0,0.3)" },
  awarded:  { label: "Awarded",  color: "#4CAF50",  bg: "rgba(76,175,80,0.12)",   border: "rgba(76,175,80,0.3)" },
  cancelled:{ label: "Cancelled",color: "#EF5350",  bg: "rgba(239,83,80,0.12)",   border: "rgba(239,83,80,0.3)" },
};

function RFQStatusBadge({ status }: { status: string | null }) {
  const cfg = STATUS_CONFIG[status ?? "draft"] ?? STATUS_CONFIG.draft;
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
      {cfg.label}
    </span>
  );
}

// ─── Create RFQ Dialog ────────────────────────────────────────────────────────

function CreateRFQDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    title: "",
    scopeOfWork: "",
    notes: "",
    dueDate: "",
    budget: "",
    projectId: "",
  });

  const { data: projects = [] } = trpc.projects.list.useQuery({});

  const createMutation = trpc.vms.rfq.create.useMutation({
    onSuccess: () => {
      toast.success("RFQ created");
      onCreated();
      onClose();
      setForm({ title: "", scopeOfWork: "", notes: "", dueDate: "", budget: "", projectId: "" });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--kp-charcoal)", border: "1px solid rgba(191,154,59,0.2)" }}>
        <DialogHeader>
          <DialogTitle style={{ color: "var(--kp-cream)" }}>Create Request for Quote</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div>
            <Label style={{ color: "var(--kp-muted)" }}>Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Custom Cabinetry — Johnson Kitchen"
              className="mt-1"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
            />
          </div>
          <div>
            <Label style={{ color: "var(--kp-muted)" }}>Project (optional)</Label>
            <Select value={form.projectId} onValueChange={(v) => setForm({ ...form, projectId: v })}>
              <SelectTrigger className="mt-1" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}>
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">No project</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label style={{ color: "var(--kp-muted)" }}>Scope of Work</Label>
            <Textarea
              value={form.scopeOfWork}
              onChange={(e) => setForm({ ...form, scopeOfWork: e.target.value })}
              placeholder="Describe the work scope, materials, specifications..."
              rows={4}
              className="mt-1 resize-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label style={{ color: "var(--kp-muted)" }}>Quote Due Date</Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="mt-1"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
              />
            </div>
            <div>
              <Label style={{ color: "var(--kp-muted)" }}>Budget ($)</Label>
              <Input
                type="number"
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
                placeholder="0.00"
                className="mt-1"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
              />
            </div>
          </div>
          <div>
            <Label style={{ color: "var(--kp-muted)" }}>Internal Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Internal notes (not shown to vendors)"
              rows={2}
              className="mt-1 resize-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}
            style={{ borderColor: "rgba(255,255,255,0.15)", color: "var(--kp-muted)" }}>
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate({
              title: form.title,
              scopeOfWork: form.scopeOfWork || undefined,
              notes: form.notes || undefined,
              dueDate: form.dueDate || undefined,
              budget: form.budget ? parseFloat(form.budget) : undefined,
              projectId: form.projectId ? parseInt(form.projectId) : undefined,
            })}
            disabled={!form.title || createMutation.isPending}
            className="btn-gold"
          >
            {createMutation.isPending ? "Creating..." : "Create RFQ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RFQManagementPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showCreate, setShowCreate] = useState(false);

  // Fetch all RFQs (no projectId filter = all)
  const { data: rfqs = [], refetch, isLoading } = trpc.vms.rfq.list.useQuery(
    { projectId: undefined },
    { enabled: true }
  );

  const filtered = useMemo(() => {
    return rfqs.filter((r) => {
      const matchSearch = !search || r.title.toLowerCase().includes(search.toLowerCase());
      const matchStatus = filterStatus === "all" || r.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [rfqs, search, filterStatus]);

  // Summary counts
  const counts = useMemo(() => ({
    draft: rfqs.filter((r) => r.status === "draft").length,
    sent: rfqs.filter((r) => r.status === "sent").length,
    awarded: rfqs.filter((r) => r.status === "awarded").length,
  }), [rfqs]);

  return (
    <>
    <div className="flex flex-col h-full" style={{ background: "var(--kp-charcoal-dark)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b"
          style={{ borderColor: "rgba(191,154,59,0.15)" }}>
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "var(--kp-cream)" }}>
              RFQ Management
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--kp-muted)" }}>
              Request for Quotes — manage bids from vendors
            </p>
          </div>
          <Button className="btn-gold gap-2" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> New RFQ
          </Button>
        </div>

        {/* Summary strip */}
        <div className="flex gap-4 px-6 py-4 border-b" style={{ borderColor: "rgba(191,154,59,0.08)" }}>
          {[
            { label: "Draft", count: counts.draft, color: "#888" },
            { label: "Open", count: counts.sent, color: "#E67700" },
            { label: "Awarded", count: counts.awarded, color: "#4CAF50" },
          ].map(({ label, count, color }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="text-2xl font-semibold" style={{ color }}>{count}</span>
              <span className="text-xs" style={{ color: "var(--kp-muted)" }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3 px-6 py-4 border-b" style={{ borderColor: "rgba(191,154,59,0.08)" }}>
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--kp-muted)" }} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search RFQs..."
              className="pl-9"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}>
              <Filter className="h-3.5 w-3.5 mr-1.5" style={{ color: "var(--kp-muted)" }} />
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Open</SelectItem>
              <SelectItem value="awarded">Awarded</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: "var(--kp-gold)" }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <FileText className="h-12 w-12 mx-auto mb-4" style={{ color: "var(--kp-muted)", opacity: 0.4 }} />
              <p className="text-base font-medium" style={{ color: "var(--kp-cream)" }}>
                {rfqs.length === 0 ? "No RFQs yet" : "No RFQs match your filters"}
              </p>
              {rfqs.length === 0 && (
                <Button className="btn-gold gap-2 mt-4" onClick={() => setShowCreate(true)}>
                  <Plus className="h-4 w-4" /> Create First RFQ
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              {filtered.map((rfq) => (
                <Card
                  key={rfq.id}
                  className="cursor-pointer transition-all hover:scale-[1.005]"
                  onClick={() => navigate(`/vendors/${rfq.vendorId ?? 0}?rfq=${rfq.id}`)}
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: "rgba(191,154,59,0.12)" }}>
                        <FileText className="h-5 w-5" style={{ color: "var(--kp-gold)" }} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-sm" style={{ color: "var(--kp-cream)" }}>
                            {rfq.title}
                          </span>
                          <RFQStatusBadge status={rfq.status} />
                        </div>

                        <div className="flex items-center gap-4 flex-wrap">
                          {rfq.dueDate && (
                            <span className="flex items-center gap-1 text-xs" style={{ color: "var(--kp-muted)" }}>
                              <Clock className="h-3 w-3" />
                              Due {new Date(rfq.dueDate).toLocaleDateString()}
                            </span>
                          )}
                          {rfq.budget && (
                            <span className="flex items-center gap-1 text-xs" style={{ color: "var(--kp-muted)" }}>
                              <DollarSign className="h-3 w-3" />
                              Budget ${parseFloat(String(rfq.budget)).toLocaleString()}
                            </span>
                          )}
                          {(rfq as any).invitationCount > 0 && (
                            <span className="flex items-center gap-1 text-xs" style={{ color: "var(--kp-muted)" }}>
                              <Users className="h-3 w-3" />
                              {(rfq as any).invitationCount} invited
                              {(rfq as any).quotedCount > 0 && ` · ${(rfq as any).quotedCount} quoted`}
                            </span>
                          )}
                        </div>

                        {rfq.scopeOfWork && (
                          <p className="text-xs mt-1.5 line-clamp-2" style={{ color: "var(--kp-muted)" }}>
                            {rfq.scopeOfWork}
                          </p>
                        )}
                      </div>

                      <ChevronRight className="h-4 w-4 shrink-0 mt-1" style={{ color: "var(--kp-muted)" }} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
           )}
        </div>
      </div>
      <CreateRFQDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => refetch()}
      />
    </>
  );
}
