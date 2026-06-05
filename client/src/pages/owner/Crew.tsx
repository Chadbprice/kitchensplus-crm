import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Users, Phone, Mail, Edit2, Trash2, Clock, LogIn, LogOut, DollarSign, ChevronDown, ChevronUp, Calendar } from "lucide-react";

const GOLD = "#BF9A3B";
const ROLES = ["owner","project_manager","lead_carpenter","carpenter","laborer","apprentice","other"];

function formatDuration(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function CrewMemberCard({ member, projects }: { member: any; projects: any[] }) {
  const [expanded, setExpanded] = useState(false);
  const [showClockIn, setShowClockIn] = useState(false);
  const [showSetFee, setShowSetFee] = useState(false);
  const [clockInProjectId, setClockInProjectId] = useState("");
  const [clockInNote, setClockInNote] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [feeWeekOf, setFeeWeekOf] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay()); // start of this week
    return d.toISOString().split("T")[0];
  });
  const [feeNote, setFeeNote] = useState("");

  const utils = trpc.useUtils();
  const { data: timeLogs } = trpc.crew.listTimeLogs.useQuery({ crewMemberId: member.id }, { enabled: expanded });

  const clockIn = trpc.crew.clockIn.useMutation({
    onSuccess: () => { utils.crew.listTimeLogs.invalidate(); setShowClockIn(false); setClockInNote(""); toast.success(`${member.name} clocked in`); },
    onError: (e) => toast.error(e.message),
  });
  const clockOut = trpc.crew.clockOut.useMutation({
    onSuccess: () => { utils.crew.listTimeLogs.invalidate(); toast.success(`${member.name} clocked out`); },
    onError: (e) => toast.error(e.message),
  });
  const addSetFee = trpc.crew.addSetFee.useMutation({
    onSuccess: () => { utils.crew.listTimeLogs.invalidate(); setShowSetFee(false); setFeeAmount(""); setFeeNote(""); toast.success("Set fee recorded"); },
    onError: (e) => toast.error(e.message),
  });

  const activeLog = (timeLogs ?? []).find((l: any) => !l.clockOutAt);
  const isClocked = !!activeLog;
  const totalHoursMs = (timeLogs ?? [])
    .filter((l: any) => l.clockOutAt)
    .reduce((sum: number, l: any) => sum + (new Date(l.clockOutAt).getTime() - new Date(l.clockInAt).getTime()), 0);

  return (
    <Card className="bg-card border-border hover:border-primary/30 transition-all">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative">
              <div className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ background: `${GOLD}20`, color: GOLD }}>
                {member.name.charAt(0).toUpperCase()}
              </div>
              {isClocked && (
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-card" title="Currently clocked in" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground">{member.name}</h3>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-0.5">
                <span className="capitalize">{(member.role ?? "").replace(/_/g, " ")}</span>
                {member.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{member.phone}</span>}
                {member.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{member.email}</span>}
                {member.hourlyRate && <span style={{ color: GOLD }}>${member.hourlyRate}/hr</span>}
              </div>
              {isClocked && (
                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "#4CAF7D" }}>
                  <Clock className="h-3 w-3" />
                  Clocked in {new Date(activeLog.clockInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {activeLog.projectId && projects.find(p => p.id === activeLog.projectId) && (
                    <span className="text-muted-foreground"> · {projects.find(p => p.id === activeLog.projectId)?.name}</span>
                  )}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
            {!isClocked ? (
              <Button size="sm" className="h-7 text-xs gap-1" style={{ background: "#4CAF7D", color: "#fff" }}
                onClick={() => setShowClockIn(true)}>
                <LogIn className="h-3.5 w-3.5" /> Clock In
              </Button>
            ) : (
              <Button size="sm" className="h-7 text-xs gap-1" style={{ background: "#E05252", color: "#fff" }}
                onClick={() => clockOut.mutate({ crewMemberId: member.id })} disabled={clockOut.isPending}>
                <LogOut className="h-3.5 w-3.5" /> Clock Out
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-border"
              onClick={() => setShowSetFee(true)}>
              <DollarSign className="h-3.5 w-3.5" /> Set Fee
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1"
              onClick={() => setExpanded(e => !e)}>
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Logs
            </Button>
          </div>
        </div>

        {/* Time Log History */}
        {expanded && (
          <div className="mt-4 border-t border-border pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Time &amp; Fee Log</p>
              <p className="text-xs" style={{ color: GOLD }}>Total: {formatDuration(totalHoursMs)}</p>
            </div>
            {(!timeLogs || timeLogs.length === 0) ? (
              <p className="text-xs text-muted-foreground py-2">No logs yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {timeLogs.map((log: any) => (
                  <div key={log.id} className="flex items-center justify-between rounded-lg px-3 py-2 text-xs"
                    style={{ background: "rgba(255,255,255,0.04)" }}>
                    <div className="flex flex-col gap-0.5">
                      {log.type === "set_fee" ? (
                        <span className="font-medium" style={{ color: "#4CAF7D" }}>
                          Set Fee — ${Number(log.feeAmount).toLocaleString()}
                        </span>
                      ) : (
                        <span className="font-medium text-foreground">
                          {new Date(log.clockInAt).toLocaleDateString([], { month: "short", day: "numeric" })} · {new Date(log.clockInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {log.clockOutAt && ` → ${new Date(log.clockOutAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                          {log.clockOutAt && <span className="ml-1 text-muted-foreground">({formatDuration(new Date(log.clockOutAt).getTime() - new Date(log.clockInAt).getTime())})</span>}
                          {!log.clockOutAt && <span className="ml-1" style={{ color: "#4CAF7D" }}>(active)</span>}
                        </span>
                      )}
                      {log.projectName && <span className="text-muted-foreground">{log.projectName}</span>}
                      {log.note && <span className="text-muted-foreground italic">{log.note}</span>}
                      {log.weekOf && <span className="text-muted-foreground">Week of {new Date(log.weekOf).toLocaleDateString([], { month: "short", day: "numeric" })}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Clock In Dialog */}
      <Dialog open={showClockIn} onOpenChange={setShowClockIn}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader><DialogTitle className="font-serif text-lg flex items-center gap-2"><LogIn className="h-4 w-4" style={{ color: "#4CAF7D" }} />Clock In — {member.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Project (optional)</Label>
              <Select value={clockInProjectId} onValueChange={setClockInProjectId}>
                <SelectTrigger className="bg-background border-border"><SelectValue placeholder="Select project…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Note (optional)</Label>
              <Input className="bg-background border-border" value={clockInNote} onChange={e => setClockInNote(e.target.value)} placeholder="e.g. Installing upper cabinets" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClockIn(false)}>Cancel</Button>
            <Button style={{ background: "#4CAF7D", color: "#fff" }} disabled={clockIn.isPending}
              onClick={() => clockIn.mutate({ crewMemberId: member.id, projectId: clockInProjectId && clockInProjectId !== "none" ? Number(clockInProjectId) : undefined, note: clockInNote || undefined })}>
              {clockIn.isPending ? "Clocking in…" : "Clock In"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set Fee Dialog */}
      <Dialog open={showSetFee} onOpenChange={setShowSetFee}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader><DialogTitle className="font-serif text-lg flex items-center gap-2"><DollarSign className="h-4 w-4" style={{ color: GOLD }} />Record Set Fee — {member.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">Use this to record a fixed weekly payment instead of hourly tracking.</p>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Amount ($) *</Label>
              <Input className="bg-background border-border" type="number" value={feeAmount} onChange={e => setFeeAmount(e.target.value)} placeholder="1200" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Week of</Label>
              <Input className="bg-background border-border" type="date" value={feeWeekOf} onChange={e => setFeeWeekOf(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Note (optional)</Label>
              <Input className="bg-background border-border" value={feeNote} onChange={e => setFeeNote(e.target.value)} placeholder="Week ending March 28" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSetFee(false)}>Cancel</Button>
            <Button className="btn-gold" disabled={!feeAmount || addSetFee.isPending}
              onClick={() => addSetFee.mutate({ crewMemberId: member.id, feeAmount: Number(feeAmount), weekOf: feeWeekOf, note: feeNote || undefined })}>
              {addSetFee.isPending ? "Saving…" : "Record Fee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function Crew() {
  const [showAdd, setShowAdd] = useState(false);
  const [editMember, setEditMember] = useState<any>(null);
  const [form, setForm] = useState({ name: "", role: "laborer", email: "", phone: "", hourlyRate: "" });

  const { data: crew, refetch } = trpc.crew.list.useQuery();
  const { data: projects } = trpc.projects.list.useQuery({});
  const createMember = trpc.crew.create.useMutation({ onSuccess: () => { refetch(); setShowAdd(false); setForm({ name: "", role: "laborer", email: "", phone: "", hourlyRate: "" }); toast.success("Crew member added! They'll receive a clock-in notification."); } });
  const updateMember = trpc.crew.update.useMutation({ onSuccess: () => { refetch(); setEditMember(null); setShowAdd(false); toast.success("Updated!"); } });
  const deleteMember = trpc.crew.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Crew member removed"); } });

  function openEdit(m: any) {
    setEditMember(m);
    setForm({ name: m.name, role: m.role ?? "laborer", email: m.email ?? "", phone: m.phone ?? "", hourlyRate: m.hourlyRate ?? "" });
    setShowAdd(true);
  }

  function handleSubmit() {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    if (editMember) updateMember.mutate({ id: editMember.id, ...form } as any);
    else createMember.mutate(form as any);
  }

  const clockedIn = (crew ?? []).filter((m: any) => m.isClockedIn);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif" style={{ color: "var(--kp-cream)" }}>Crew Members</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {(crew ?? []).length} members
            {clockedIn.length > 0 && <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{ background: "#4CAF7D20", color: "#4CAF7D" }}>● {clockedIn.length} clocked in</span>}
          </p>
        </div>
        <Button className="btn-gold text-sm px-4" onClick={() => { setEditMember(null); setForm({ name: "", role: "laborer", email: "", phone: "", hourlyRate: "" }); setShowAdd(true); }}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Member
        </Button>
      </div>

      <div className="grid gap-3">
        {(!crew || crew.length === 0) ? (
          <Card className="bg-card border-border">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="text-lg font-serif mb-1">No crew members yet</p>
              <p className="text-sm">Add team members to track time and fees</p>
            </CardContent>
          </Card>
        ) : (
          (crew ?? []).map((member: any) => (
            <div key={member.id} className="relative">
              <CrewMemberCard member={member} projects={projects ?? []} />
              <div className="absolute top-3 right-3 flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-accent/50" onClick={() => openEdit(member)}><Edit2 className="h-3 w-3" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-destructive/20 hover:text-destructive" onClick={() => { if (confirm("Remove crew member?")) deleteMember.mutate({ id: member.id }); }}><Trash2 className="h-3 w-3" /></Button>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader><DialogTitle className="font-serif text-xl">{editMember ? "Edit Member" : "Add Crew Member"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground mb-1.5 block">Full Name *</Label>
              <Input className="bg-background border-border" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Chad Johnson" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Role</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Hourly Rate ($)</Label>
              <Input className="bg-background border-border" type="number" value={form.hourlyRate} onChange={e => setForm(f => ({ ...f, hourlyRate: e.target.value }))} placeholder="35" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Phone (for SMS notifications)</Label>
              <Input className="bg-background border-border" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(864) 555-0000" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Email (for notifications)</Label>
              <Input className="bg-background border-border" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="crew@email.com" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground px-1">When added, the crew member will receive an email and SMS with their clock-in/out instructions.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button className="btn-gold" onClick={handleSubmit} disabled={createMember.isPending || updateMember.isPending}>
              {editMember ? "Save Changes" : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
