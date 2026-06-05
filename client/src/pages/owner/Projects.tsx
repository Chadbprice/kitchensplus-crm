import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Search, MapPin, Calendar, DollarSign, ArrowRight, Archive, X, ShieldAlert } from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";

const GOLD = "#BF9A3B";
const STATUS_OPTIONS = ["planning","active","on_hold","completed","cancelled"];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    planning: { label: "Planning", color: "#9B59B6" },
    active: { label: "Active", color: "#4CAF7D" },
    on_hold: { label: "On Hold", color: "#E8A838" },
    completed: { label: "Completed", color: "#4CAF7D" },
    cancelled: { label: "Cancelled", color: "#E05252" },
  };
  const s = map[status] ?? { label: status, color: GOLD };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: `${s.color}20`, color: s.color, border: `1px solid ${s.color}40` }}>
      {s.label}
    </span>
  );
}

/** Two-step archive button. First click shows a confirmation state; second click archives. */
function ArchiveButton({ projectId, projectName, onArchived }: { projectId: number; projectName: string; onArchived: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const archive = trpc.projects.archive.useMutation({
    onSuccess: () => {
      toast.success(`"${projectName}" moved to archive`);
      onArchived();
      setConfirming(false);
    },
    onError: (e) => toast.error(e.message ?? "Archive failed"),
  });

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
        <span className="text-xs text-muted-foreground whitespace-nowrap">Archive this project?</span>
        <button
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
          style={{ background: "#E0525220", color: "#E05252", border: "1px solid #E0525240" }}
          onClick={() => archive.mutate({ id: projectId })}
          disabled={archive.isPending}
        >
          <Archive className="h-3 w-3" />
          {archive.isPending ? "Archiving…" : "Confirm"}
        </button>
        <button
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setConfirming(false)}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0 opacity-0 group-hover:opacity-100"
      title="Archive project"
      onClick={e => { e.stopPropagation(); setConfirming(true); }}
    >
      <Archive className="h-4 w-4" />
    </button>
  );
}

export default function Projects() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", projectType: "", address: "", addressPlaceId: "", description: "", budgetEstimated: "", depositPercent: "50", startDate: "", estimatedEndDate: "" });

  const { data: projects, refetch } = trpc.projects.list.useQuery({});
  const { data: projectTypes } = trpc.settings.getProjectTypes.useQuery();
  const createProject = trpc.projects.create.useMutation({ onSuccess: (data) => { refetch(); setShowAdd(false); toast.success("Project created!"); setLocation(`/projects/${data.id}`); } });
  // Batch RFI open-count for all project cards
  const projectIds = useMemo(() => (projects ?? []).map(p => p.id), [projects]);
  // Latest AI risk scores for all projects
  const { data: riskScores } = trpc.agents.riskScores.latestAll.useQuery(undefined, { refetchInterval: 5 * 60 * 1000 });
  const riskScoreMap = useMemo(() => {
    const map: Record<number, { overallRiskScore: number; riskLevel: string }> = {};
    (riskScores ?? []).forEach(s => { map[s.projectId] = { overallRiskScore: s.overallRiskScore ?? 0, riskLevel: s.riskLevel ?? "low" }; });
    return map;
  }, [riskScores]);
  const { data: rfiCounts } = trpc.rfi.countPendingByProjects.useQuery(
    { projectIds },
    { enabled: projectIds.length > 0, refetchInterval: 5 * 60 * 1000 }
  );

  const filtered = (projects ?? []).filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.address ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif" style={{ color: "var(--kp-cream)" }}>Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} projects</p>
        </div>
        <Button className="btn-gold text-sm px-4" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> New Project
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search projects..." className="pl-9 bg-card border-border" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40 bg-card border-border"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3">
        {filtered.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="py-12 text-center text-muted-foreground">
              <p className="text-lg font-serif mb-2">No projects found</p>
              <p className="text-sm">Create your first project to get started</p>
            </CardContent>
          </Card>
        ) : (
          filtered.map(project => (
            <Card
              key={project.id}
              className="group bg-card border-border hover:border-primary/30 transition-all cursor-pointer"
              onClick={() => setLocation(`/projects/${project.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-foreground">{project.name}</h3>
                      <StatusBadge status={project.status} />
                      {project.projectType && <span className="text-xs px-2 py-0.5 rounded-full bg-accent/50 text-muted-foreground">{project.projectType}</span>}
                      {riskScoreMap[project.id] && riskScoreMap[project.id].riskLevel !== "low" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            background: riskScoreMap[project.id].riskLevel === "critical" ? "rgba(239,68,68,0.15)"
                              : riskScoreMap[project.id].riskLevel === "high" ? "rgba(249,115,22,0.15)"
                              : "rgba(234,179,8,0.15)",
                            color: riskScoreMap[project.id].riskLevel === "critical" ? "#EF4444"
                              : riskScoreMap[project.id].riskLevel === "high" ? "#F97316"
                              : "#EAB308",
                            border: `1px solid ${riskScoreMap[project.id].riskLevel === "critical" ? "rgba(239,68,68,0.3)" : riskScoreMap[project.id].riskLevel === "high" ? "rgba(249,115,22,0.3)" : "rgba(234,179,8,0.3)"}`,
                          }}>
                          <ShieldAlert className="h-3 w-3" />
                          Risk {riskScoreMap[project.id].overallRiskScore}/100
                        </span>
                      )}
                      {rfiCounts && (rfiCounts[project.id] ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: "rgba(245,158,11,0.15)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.3)" }}>
                          ● {rfiCounts[project.id]} open RFI{(rfiCounts[project.id] ?? 0) > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      {project.address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{project.address}</span>}
                      {project.startDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Started {format(new Date(project.startDate), "MMM d, yyyy")}</span>}
                      {project.budgetEstimated && <span className="flex items-center gap-1" style={{ color: GOLD }}><DollarSign className="h-3 w-3" />${Number(project.budgetEstimated).toLocaleString()}</span>}
                    </div>
                  </div>
                  {/* Right side: archive button + arrow */}
                  <div className="flex items-center gap-2 shrink-0">
                    <ArchiveButton
                      projectId={project.id}
                      projectName={project.name}
                      onArchived={refetch}
                    />
                    <ArrowRight className="h-4 w-4 text-muted-foreground mt-0.5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader><DialogTitle className="font-serif text-xl">New Project</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground mb-1.5 block">Project Name *</Label>
              <Input className="bg-background border-border" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Smith Kitchen Remodel" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Project Type</Label>
              <Select value={form.projectType} onValueChange={v => setForm(f => ({ ...f, projectType: v }))}>
                <SelectTrigger className="bg-background border-border"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {(projectTypes ?? []).map(pt => <SelectItem key={pt.id} value={pt.name}>{pt.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Deposit %</Label>
              <Input className="bg-background border-border" type="number" value={form.depositPercent} onChange={e => setForm(f => ({ ...f, depositPercent: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground mb-1.5 block">Property Address</Label>
              <AddressAutocomplete
                value={form.address}
                onChange={v => setForm(f => ({ ...f, address: v, addressPlaceId: "" }))}
                onPlaceSelect={place => setForm(f => ({ ...f, address: place.formattedAddress, addressPlaceId: place.placeId }))}
                placeholder="123 Main St, Greenville, SC 29601"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Budget Estimate ($)</Label>
              <Input className="bg-background border-border" type="number" value={form.budgetEstimated} onChange={e => setForm(f => ({ ...f, budgetEstimated: e.target.value }))} placeholder="50000" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Start Date</Label>
              <Input className="bg-background border-border" type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground mb-1.5 block">Description</Label>
              <Textarea className="bg-background border-border resize-none" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief project description..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button className="btn-gold" onClick={() => { if (!form.name.trim()) { toast.error("Name required"); return; } createProject.mutate(form); }} disabled={createProject.isPending}>
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
