import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { AddressAutocomplete as MapsAddressAutocomplete, PlaceResult } from "@/components/AddressAutocomplete";
import { ClientMapPreview } from "@/components/ClientMapPreview";
import LeadAIIntakeBar, { ExtractedLeadFields } from "@/components/LeadAIIntakeBar";
import RescheduleConsultationDialog from "@/components/RescheduleConsultationDialog";
import InspirationDrawer from "@/components/InspirationDrawer";
import FieldCaptureDrawer from "@/components/FieldCaptureDrawer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus, Search, Phone, Mail, MapPin, Edit2, Trash2, X, CheckCircle2,
  CalendarClock, User, MessageSquare, Sparkles, Eye, Send, FileText,
  CreditCard, Image, AlertTriangle, Clock, FolderPlus, Loader2, Archive,
  CalendarDays, RefreshCw, Home, ScrollText, FolderOpen, ChevronRight, Camera
} from "lucide-react";

const GOLD = "#BF9A3B";
const STATUS_OPTIONS = ["new","consultation_scheduled","visited","quoted","won","lost"];
const SOURCE_OPTIONS = ["website","referral","google","facebook","instagram","yard_sign","other"];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    new: { label: "New", color: "#5B9BD5" },
    consultation_scheduled: { label: "Consultation Scheduled", color: "#9B59B6" },
    visited: { label: "Visited", color: "#8B5CF6" },
    quoted: { label: "Quoted", color: "#E8A838" },
    won: { label: "Won", color: "#4CAF7D" },
    lost: { label: "Lost", color: "#E05252" },
  };
  const s = map[status] ?? { label: status, color: GOLD };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: `${s.color}20`, color: s.color, border: `1px solid ${s.color}40` }}>
      {s.label}
    </span>
  );
}

// ─── Address Autocomplete (uses shared reliable component) ───────────────────
function AddressAutocomplete({
  value, onChange, onPlaceSelect,
}: {
  value: string;
  onChange: (v: string) => void;
  onPlaceSelect: (address: string, placeId: string) => void;
}) {
  return (
    <MapsAddressAutocomplete
      value={value}
      onChange={onChange}
      onPlaceSelect={(place: PlaceResult) => onPlaceSelect(place.formattedAddress, place.placeId)}
      placeholder="Start typing a property address…"
    />
  );
}
// ─── Multi-field input (phones or emails, up to 3) ───────────────────────────
function MultiInput({
  label, icon: Icon, values, onChange, placeholder, type = "text",
}: {
  label: string; icon: React.ElementType; values: string[];
  onChange: (vals: string[]) => void; placeholder: string; type?: string;
}) {
  const max = 3;
  const add = () => { if (values.length < max) onChange([...values, ""]); };
  const remove = (i: number) => onChange(values.filter((_, idx) => idx !== i));
  const update = (i: number, v: string) => onChange(values.map((old, idx) => idx === i ? v : old));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Icon className="h-3 w-3" />{label}
        </Label>
        {values.length < max && (
          <button type="button" className="text-xs flex items-center gap-0.5 transition-colors" style={{ color: GOLD }} onClick={add}>
            <Plus className="h-3 w-3" />Add {label.replace(/s$/, "")}
          </button>
        )}
      </div>
      {values.map((val, i) => (
        <div key={i} className="flex gap-2 items-center">
          <Input
            className="bg-background border-border flex-1"
            type={type}
            value={val}
            onChange={e => update(i, e.target.value)}
            placeholder={i === 0 ? placeholder : `${label.replace(/s$/, "")} ${i + 1}`}
          />
          {i > 0 && (
            <button type="button" onClick={() => remove(i)} className="p-1.5 rounded-md hover:bg-destructive/20 hover:text-destructive text-muted-foreground transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}

    </div>
  );
}

// ─── Client Dashboard Preview Modal ─────────────────────────────────────────
function ClientDashboardPreview({ lead, onClose }: { lead: any; onClose: () => void }) {
  const { data: projects } = trpc.projects.list.useQuery({ clientId: undefined });
  const { data: estimates } = trpc.estimates.list.useQuery({});
  const { data: invoices } = trpc.invoices.list.useQuery({});
  const { data: documents } = trpc.documents.list.useQuery({});

  // Find all projects linked to this lead
  const leadProjects = (projects ?? []).filter((p: any) => p.leadId === lead.id);
  const project = leadProjects[0] ?? null;
  const { data: milestones } = trpc.projects.getMilestones.useQuery(
    { projectId: project?.id ?? 0 },
    { enabled: !!project?.id }
  );

  const leadEstimates = (estimates ?? []).filter((e: any) => e.leadId === lead.id);
  const leadInvoices = (invoices ?? []).filter((i: any) => i.leadId === lead.id);
  const leadDocs = (documents ?? []).filter((d: any) => d.leadId === lead.id && d.docType !== "compliance");

  const completedMilestones = (milestones ?? []).filter((m: any) => m.status === "completed").length;
  const totalMilestones = (milestones ?? []).length;
  const progress = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;
  const unpaidInvoices = leadInvoices.filter((i: any) => i.status !== "paid" && i.status !== "cancelled");

  // Portal colors matching real client portal
  const P_GOLD = "#C9A84C";
  const P_DARK = "#1A1B17";
  const P_CHARCOAL = "#2E2F2A";
  const P_CREAM = "#F5F0E8";
  const P_MUTED = "#9A9589";
  const P_GREEN = "#4CAF7D";

  // Sidebar nav items matching real portal
  const navItems = [
    { icon: Home, label: "All Projects", badge: leadProjects.length > 0 ? `${leadProjects.length}` : null },
    { icon: ScrollText, label: "Proposals", badge: leadEstimates.length > 0 ? `${leadEstimates.length}` : null },
    { icon: CreditCard, label: "Payments", badge: unpaidInvoices.length > 0 ? `${unpaidInvoices.length} due` : null },
    { icon: MessageSquare, label: "Messages", badge: null },
    { icon: FolderOpen, label: "Documents", badge: leadDocs.length > 0 ? `${leadDocs.length}` : null },
    { icon: Sparkles, label: "Inspiration", badge: null },
  ];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="p-0 overflow-hidden" style={{ maxWidth: 680, maxHeight: "90vh", background: P_DARK, border: `1px solid rgba(201,168,76,0.2)` }}>
        <DialogTitle className="sr-only">Client Portal Preview — {lead.name}</DialogTitle>

        {/* Preview Banner */}
        <div className="flex items-center gap-2 px-4 py-2 text-xs font-medium"
          style={{ background: "rgba(201,168,76,0.12)", borderBottom: "1px solid rgba(201,168,76,0.25)", color: P_GOLD }}>
          <Eye className="h-3.5 w-3.5" />
          <span>Owner Preview — exactly what <strong>{lead.name}</strong> sees in their portal</span>
        </div>

        <div className="flex overflow-hidden" style={{ height: "calc(90vh - 36px)" }}>
          {/* Simulated Sidebar */}
          <div className="flex flex-col shrink-0 border-r" style={{ width: 200, background: P_DARK, borderColor: "rgba(255,255,255,0.07)" }}>
            {/* Logo */}
            <div className="px-4 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
              <p className="font-serif text-sm font-semibold" style={{ color: P_GOLD }}>Kitchens Plus</p>
              <p className="text-[10px] uppercase tracking-widest mt-0.5" style={{ color: P_MUTED }}>Client Portal</p>
            </div>
            {/* Nav items */}
            <div className="flex-1 p-2 space-y-0.5">
              {navItems.map((item, idx) => (
                <div
                  key={item.label}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs"
                  style={idx === 0
                    ? { background: "rgba(201,168,76,0.15)", color: P_GOLD, border: "1px solid rgba(201,168,76,0.25)", fontWeight: 600 }
                    : { color: P_MUTED, border: "1px solid transparent" }
                  }
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                      style={{ background: "rgba(201,168,76,0.2)", color: P_GOLD }}>
                      {item.badge}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {/* Footer */}
            <div className="p-3 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: "rgba(201,168,76,0.15)", color: P_GOLD, border: "1.5px solid rgba(201,168,76,0.4)" }}>
                  {lead.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: P_CREAM }}>{lead.name}</p>
                  <p className="text-[10px]" style={{ color: P_MUTED }}>Your Portal</p>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content — All Projects view */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5" style={{ background: "var(--background)" }}>
            {/* Page header */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: P_GOLD }}>Your Renovations</p>
              <h2 className="text-2xl font-serif" style={{ color: P_CREAM, fontStyle: "italic" }}>All Projects</h2>
            </div>

            {/* No project yet */}
            {leadProjects.length === 0 && (
              <div className="rounded-xl p-8 text-center space-y-3"
                style={{ background: P_CHARCOAL, border: `1px solid rgba(201,168,76,0.15)` }}>
                <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto text-xl font-serif"
                  style={{ background: "rgba(201,168,76,0.15)", color: P_GOLD }}>✦</div>
                <p className="font-serif text-base" style={{ color: P_CREAM, fontStyle: "italic" }}>Your project is being set up</p>
                <p className="text-xs" style={{ color: P_MUTED }}>We'll have everything ready soon. Questions? Call Chad at 864-567-8777</p>
              </div>
            )}

            {/* Project cards */}
            {leadProjects.map((proj: any) => {
              const projMs = (milestones ?? []);
              const projCompleted = projMs.filter((m: any) => m.status === "completed").length;
              const projTotal = projMs.length;
              const projProgress = projTotal > 0 ? Math.round((projCompleted / projTotal) * 100) : 0;
              return (
                <div key={proj.id} className="rounded-xl p-5 space-y-3"
                  style={{ background: P_CHARCOAL, border: `1px solid rgba(255,255,255,0.06)` }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold truncate" style={{ color: P_CREAM }}>{proj.name}</h3>
                      {proj.projectType && <p className="text-xs mt-0.5" style={{ color: P_MUTED }}>{proj.projectType}</p>}
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                      style={{ background: proj.status === "completed" ? `${P_GREEN}20` : "rgba(201,168,76,0.15)", color: proj.status === "completed" ? P_GREEN : P_GOLD }}>
                      {(proj.status ?? "planning").replace(/_/g, " ").replace(/\w/g, (c: string) => c.toUpperCase())}
                    </span>
                  </div>
                  {projTotal > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs" style={{ color: P_MUTED }}>
                        <span>Project Progress</span>
                        <span style={{ color: projProgress === 100 ? P_GREEN : P_GOLD, fontWeight: 600 }}>{projProgress}%</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                        <div className="h-full rounded-full" style={{ width: `${projProgress}%`, background: `linear-gradient(90deg, ${P_GOLD}, #E8C96A)` }} />
                      </div>
                      <p className="text-xs" style={{ color: P_MUTED }}>{projCompleted} of {projTotal} steps complete</p>
                    </div>
                  )}
                  <div className="flex items-center justify-end">
                    <span className="flex items-center gap-1 text-xs" style={{ color: P_MUTED }}>
                      View project <ChevronRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Billing snapshot (if invoices exist) */}
            {leadInvoices.length > 0 && (
              <div className="rounded-xl p-4 space-y-2"
                style={{ background: P_CHARCOAL, border: `1px solid rgba(255,255,255,0.06)` }}>
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: P_MUTED }}>Billing Snapshot</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: P_CREAM }}>{unpaidInvoices.length} invoice{unpaidInvoices.length !== 1 ? "s" : ""} due</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(224,82,82,0.15)", color: "#E05252" }}>
                    ${unpaidInvoices.reduce((s: number, i: any) => s + Number(i.amount ?? 0), 0).toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-3 border-t" style={{ borderColor: "rgba(255,255,255,0.07)", background: P_DARK }}>
          <Button variant="outline" className="w-full" onClick={onClose}>Close Preview</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── First Contact Dialog ─────────────────────────────────────────────────────
function FirstContactDialog({ lead, onClose }: { lead: any; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [step, setStep] = useState<"schedule" | "confirm">("schedule");
  const [form, setForm] = useState({
    scheduledAt: "",
    meetingLength: "60",
    assignee: "Chad Price",
    internalNotes: "",
    aiNotes: "",
    sendEmail: true,
    sendSms: true,
  });
  const [meetingId, setMeetingId] = useState<number | null>(null);
  const [sendResult, setSendResult] = useState<{ emailSent: boolean; smsSent: boolean; emailError?: string; smsError?: string } | null>(null);

  const createMeeting = trpc.meetings.create.useMutation({
    onSuccess: (data) => {
      setMeetingId(data.id);
      setStep("confirm");
      utils.leads.list.invalidate();
    },
    onError: (e) => toast.error("Failed to schedule: " + e.message),
  });

  const sendFirstContact = trpc.meetings.sendFirstContact.useMutation({
    onSuccess: (result) => {
      setSendResult(result);
      if (result.emailSent || result.smsSent) {
        toast.success("First contact sent successfully!");
      } else {
        toast.warning("Meeting saved but messages could not be sent. Check your Twilio/Gmail credentials.");
      }
      utils.leads.list.invalidate();
    },
    onError: (e) => toast.error("Send failed: " + e.message),
  });

  function handleSchedule() {
    if (!form.scheduledAt) { toast.error("Please select a date and time for the consultation"); return; }
    createMeeting.mutate({
      leadId: lead.id,
      scheduledAt: form.scheduledAt,
      durationMinutes: parseInt(form.meetingLength, 10) || 1,
      assignee: form.assignee,
      internalNotes: form.internalNotes || undefined,
      aiNotes: form.aiNotes || undefined,
    });
  }

  function handleSend() {
    if (!meetingId) return;
    sendFirstContact.mutate({
      leadId: lead.id,
      meetingId,
      sendEmail: form.sendEmail,
      sendSms: form.sendSms,
      origin: window.location.origin,
    });
  }

  const allPhones = [lead.phone, lead.phone2, lead.phone3].filter(Boolean);
  const allEmails = [lead.email, lead.email2, lead.email3].filter(Boolean);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <CalendarClock className="h-5 w-5" style={{ color: GOLD }} />
            First Contact — {lead.name}
          </DialogTitle>
        </DialogHeader>

        {step === "schedule" && (
          <div className="space-y-5 py-2">
            {/* Lead Summary */}
            <div className="rounded-lg p-3 border border-border/50 bg-accent/10 text-sm space-y-1">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
                {allPhones.map((p, i) => <span key={i} className="flex items-center gap-1"><Phone className="h-3 w-3" />{p}</span>)}
                {allEmails.map((e, i) => <span key={i} className="flex items-center gap-1"><Mail className="h-3 w-3" />{e}</span>)}
                {lead.address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{lead.address}</span>}
              </div>
            </div>

            {/* Date & Time — Required */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                <CalendarClock className="h-3 w-3" /> Consultation Date & Time <span className="text-destructive ml-0.5">*</span>
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {/* Date */}
                <Input
                  type="date"
                  className="bg-background border-border col-span-1"
                  value={form.scheduledAt ? form.scheduledAt.split("T")[0] : ""}
                  onChange={e => {
                    const datePart = e.target.value;
                    const timePart = form.scheduledAt.includes("T") ? form.scheduledAt.split("T")[1] : "09:00";
                    setForm(f => ({ ...f, scheduledAt: datePart ? `${datePart}T${timePart}` : "" }));
                  }}
                />
                {/* Hour */}
                <Select
                  value={form.scheduledAt.includes("T") ? form.scheduledAt.split("T")[1].split(":")[0] : ""}
                  onValueChange={hour => {
                    const datePart = form.scheduledAt.includes("T") ? form.scheduledAt.split("T")[0] : "";
                    const minPart = form.scheduledAt.includes("T") ? form.scheduledAt.split("T")[1].split(":")[1] : "00";
                    if (datePart) setForm(f => ({ ...f, scheduledAt: `${datePart}T${hour}:${minPart}` }));
                  }}
                >
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue placeholder="Hour" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => {
                      const h = String(i).padStart(2, "0");
                      const label = i === 0 ? "12 AM" : i < 12 ? `${i} AM` : i === 12 ? "12 PM" : `${i - 12} PM`;
                      return <SelectItem key={h} value={h}>{label}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
                {/* Minute — 15-min increments only */}
                <Select
                  value={form.scheduledAt.includes("T") ? form.scheduledAt.split("T")[1].split(":")[1] : ""}
                  onValueChange={min => {
                    const datePart = form.scheduledAt.includes("T") ? form.scheduledAt.split("T")[0] : "";
                    const hourPart = form.scheduledAt.includes("T") ? form.scheduledAt.split("T")[1].split(":")[0] : "09";
                    if (datePart) setForm(f => ({ ...f, scheduledAt: `${datePart}T${hourPart}:${min}` }));
                  }}
                >
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue placeholder=":mm" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="00">:00</SelectItem>
                    <SelectItem value="15">:15</SelectItem>
                    <SelectItem value="30">:30</SelectItem>
                    <SelectItem value="45">:45</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Select date, then hour and minute (15-min increments).</p>
            </div>

            {/* Meeting Length */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Meeting Length
              </Label>
              <Select value={form.meetingLength} onValueChange={v => setForm(f => ({ ...f, meetingLength: v }))}>
                <SelectTrigger className="bg-background border-border w-48">
                  <SelectValue placeholder="Duration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0 min</SelectItem>
                  <SelectItem value="15">15 min</SelectItem>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="60">60 min</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Assignee */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                <User className="h-3 w-3" /> Assignee (who's going to the meeting)
              </Label>
              <Input
                className="bg-background border-border"
                value={form.assignee}
                onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}
                placeholder="Chad Price"
              />
              <p className="text-xs text-muted-foreground mt-1">Defaults to Chad Price. Change if someone else is attending.</p>
            </div>

            {/* Internal Notes (private, follows the client) */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                <MessageSquare className="h-3 w-3" /> Internal Notes
                <span className="ml-1 px-1.5 py-0.5 rounded text-xs" style={{ background: "#E0525220", color: "#E05252" }}>Private — not sent to client</span>
              </Label>
              <Textarea
                className="bg-background border-border resize-none"
                rows={3}
                value={form.internalNotes}
                onChange={e => setForm(f => ({ ...f, internalNotes: e.target.value }))}
                placeholder="Beware of dog… Husband handles decisions… Prefers calls before 5pm… Gate code is 1234…"
              />
              <p className="text-xs text-muted-foreground mt-1">These notes stay with this client forever and are visible only to your team.</p>
            </div>

            {/* AI Notes (used to personalize outgoing email & SMS) */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                <Sparkles className="h-3 w-3" style={{ color: GOLD }} /> AI Personalization Notes
                <span className="ml-1 px-1.5 py-0.5 rounded text-xs" style={{ background: "#BF9A3B20", color: GOLD }}>Used to customize email & SMS</span>
              </Label>
              <Textarea
                className="bg-background border-border resize-none"
                rows={3}
                value={form.aiNotes}
                onChange={e => setForm(f => ({ ...f, aiNotes: e.target.value }))}
                placeholder="They mentioned they love farmhouse style and have a tight timeline for the holidays… They were referred by the Johnsons on Maple Street…"
              />
              <p className="text-xs text-muted-foreground mt-1">The AI uses this to write a warm, personalized sentence in the outgoing email and text. Leave blank for a generic message.</p>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-5 py-2">
            <div className="rounded-xl p-4 border text-center space-y-1" style={{ borderColor: "#BF9A3B40", background: "#BF9A3B10" }}>
              <CheckCircle2 className="h-8 w-8 mx-auto" style={{ color: GOLD }} />
              <p className="font-semibold text-foreground">Consultation Scheduled!</p>
              <p className="text-sm text-muted-foreground">
                {new Date(form.scheduledAt).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
              </p>
              <p className="text-xs text-muted-foreground">Assignee: {form.assignee}</p>
            </div>

            {!sendResult ? (
              <>
                <p className="text-sm text-muted-foreground text-center">Now send the first contact message to <strong>{lead.name}</strong>:</p>

                {/* Send Options */}
                <div className="space-y-3">
                  {allEmails.length > 0 && (
                    <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-border hover:bg-accent/20 transition-colors">
                      <input type="checkbox" className="mt-0.5" checked={form.sendEmail}
                        onChange={e => setForm(f => ({ ...f, sendEmail: e.target.checked }))} />
                      <div>
                        <p className="text-sm font-medium text-foreground">Send Email</p>
                        <p className="text-xs text-muted-foreground">To: {allEmails.join(", ")}</p>
                        <p className="text-xs text-muted-foreground">Branded HTML email with consultation details from chad@kitchensplusupstate.com</p>
                      </div>
                    </label>
                  )}
                  {allPhones.length > 0 && (
                    <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-border hover:bg-accent/20 transition-colors">
                      <input type="checkbox" className="mt-0.5" checked={form.sendSms}
                        onChange={e => setForm(f => ({ ...f, sendSms: e.target.checked }))} />
                      <div>
                        <p className="text-sm font-medium text-foreground">Send SMS</p>
                        <p className="text-xs text-muted-foreground">To: {allPhones[0]}</p>
                        <p className="text-xs text-muted-foreground">Friendly text from +1 (833) 518-4811 with date, time, and address</p>
                      </div>
                    </label>
                  )}
                  {allEmails.length === 0 && allPhones.length === 0 && (
                    <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/10 text-sm text-destructive">
                      No phone or email on file — add contact info to this lead first.
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-3">
                {sendResult.emailSent && (
                  <div className="flex items-center gap-2 p-3 rounded-lg border" style={{ borderColor: "#4CAF7D40", background: "#4CAF7D10" }}>
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    <p className="text-sm text-foreground">Email sent to {allEmails.join(", ")}</p>
                  </div>
                )}
                {sendResult.emailError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/10">
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                    <p className="text-sm text-destructive">Email failed: {sendResult.emailError}</p>
                  </div>
                )}
                {sendResult.smsSent && (
                  <div className="flex items-center gap-2 p-3 rounded-lg border" style={{ borderColor: "#4CAF7D40", background: "#4CAF7D10" }}>
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    <p className="text-sm text-foreground">SMS sent to {allPhones[0]}</p>
                  </div>
                )}
                {sendResult.smsError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/10">
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                    <p className="text-sm text-destructive">SMS failed: {sendResult.smsError}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {sendResult ? "Close" : "Cancel"}
          </Button>
          {step === "schedule" && (
            <Button className="btn-gold" onClick={handleSchedule} disabled={createMeeting.isPending}>
              {createMeeting.isPending ? "Scheduling…" : "Schedule Consultation"}
            </Button>
          )}
          {step === "confirm" && !sendResult && (
            <Button className="btn-gold" onClick={handleSend} disabled={sendFirstContact.isPending || (!form.sendEmail && !form.sendSms)}>
              <Send className="h-4 w-4 mr-1.5" />
              {sendFirstContact.isPending ? "Sending…" : "Send First Contact"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Leads Page ─────────────────────────────────────────────────────────
const emptyForm = () => ({
  name: "", phones: [""], emails: [""],
  projectType: "", source: "", notes: "",
  address: "", addressPlaceId: "", status: "new",
});

export default function Leads() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [editLead, setEditLead] = useState<any>(null);
  const [form, setForm] = useState(emptyForm());
  const [firstContactLead, setFirstContactLead] = useState<any>(null);
  const [previewLead, setPreviewLead] = useState<any>(null);

  const { data: leads, refetch } = trpc.leads.list.useQuery({});
  // Stabilize with useMemo so the array reference doesn't change every render
  const leadIds = useMemo(() => (leads ?? []).map((l: any) => l.id), [leads]);
  const { data: fieldCaptureCounts = {} } = trpc.fieldCapture.countByLeadIds.useQuery(
    { leadIds },
    { enabled: leadIds.length > 0 }
  );
  const { data: projectTypes } = trpc.settings.getProjectTypes.useQuery();
  const { data: pendingReschedules, refetch: refetchReschedules } = trpc.clientPortal.listRescheduleRequests.useQuery();

  const reviewReschedule = trpc.clientPortal.reviewReschedule.useMutation({
    onSuccess: () => { refetchReschedules(); toast.success("Reschedule request updated"); },
    onError: (e) => toast.error(e.message),
  });

  const createLead = trpc.leads.create.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(emptyForm()); toast.success("Lead added!"); },
  });
  const updateLead = trpc.leads.update.useMutation({
    onSuccess: () => { refetch(); setEditLead(null); setShowAdd(false); toast.success("Lead updated!"); },
  });
  const deleteLead = trpc.leads.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Lead deleted"); },
  });
  const archiveLead = trpc.leads.archive.useMutation({
    onSuccess: () => { refetch(); setDeleteTarget(null); toast.success("Lead archived"); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteLeadWithData = trpc.leads.deleteWithData.useMutation({
    onSuccess: () => { refetch(); setDeleteTarget(null); toast.success("Lead and all data permanently deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  // Smart delete state
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deleteCheckResult, setDeleteCheckResult] = useState<{ hasData: boolean; counts: Record<string, number> } | null>(null);
  const [deleteCheckLoading, setDeleteCheckLoading] = useState(false);
  const utils = trpc.useUtils();

  async function handleTrashClick(lead: any) {
    setDeleteCheckLoading(true);
    setDeleteTarget({ id: lead.id, name: lead.name });
    try {
      const result = await utils.leads.checkConnectedData.fetch({ id: lead.id });
      setDeleteCheckResult(result);
      if (!result.hasData) {
        // No connected data — delete immediately
        deleteLead.mutate({ id: lead.id });
        setDeleteTarget(null);
        setDeleteCheckResult(null);
      }
    } catch (e: any) {
      toast.error("Could not check lead data");
      setDeleteTarget(null);
    } finally {
      setDeleteCheckLoading(false);
    }
  }
  const [convertLeadId, setConvertLeadId] = useState<number | null>(null);
  const [convertProjectName, setConvertProjectName] = useState("");
  const convertToProject = trpc.leads.convertToProject.useMutation({
    onSuccess: (data: any) => {
      refetch();
      setConvertLeadId(null);
      setConvertProjectName("");
      toast.success("Project created! Opening project\u2026");
      setTimeout(() => { window.location.href = `/projects/${data.projectId}`; }, 800);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Owner-initiated reschedule state ──
  const [rescheduleLead, setRescheduleLead] = useState<any>(null);
  const { data: pendingOwnerReschedules, refetch: refetchOwnerReschedules } = trpc.meetings.listPendingRescheduleProposals.useQuery();
  const proposeReschedule = trpc.meetings.proposeReschedule.useMutation({
    onSuccess: (data: any) => {
      refetchOwnerReschedules();
      setRescheduleLead(null);
      const parts: string[] = [];
      if (data.emailSent) parts.push("email");
      if (data.smsSent) parts.push("SMS");
      toast.success(parts.length > 0 ? `Reschedule proposal sent via ${parts.join(" & ")}!` : "Reschedule proposal saved (no contact info to notify).");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [sendingDashboardId, setSendingDashboardId] = useState<number | null>(null);
  const [syncingEmailLeadId, setSyncingEmailLeadId] = useState<number | null>(null);
  const [inspirationDrawerLead, setInspirationDrawerLead] = useState<any>(null);
  const [fieldCaptureDrawerLead, setFieldCaptureDrawerLead] = useState<any>(null);
  const syncPriorEmails = trpc.clients.syncPriorEmails.useMutation({
    onSuccess: (data: any, vars: any) => {
      setSyncingEmailLeadId(null);
      if (data.imported > 0) {
        toast.success(`✓ ${data.message}`);
      } else {
        toast.info(data.message ?? "No new emails found");
      }
    },
    onError: (e: any) => { setSyncingEmailLeadId(null); toast.error(e.message); },
  });
  const sendDashboardLink = trpc.leads.sendDashboardLink.useMutation({
    onSuccess: (data: any, vars: any) => {
      setSendingDashboardId(null);
      const parts: string[] = [];
      if (data.emailSent) parts.push("email");
      if (data.smsSent) parts.push("SMS");
      if (parts.length > 0) {
        toast.success(`Dashboard link sent via ${parts.join(" & ")}!`);
      } else {
        toast.warning("No contact info found — link not sent.");
      }
    },
    onError: (e: any) => { setSendingDashboardId(null); toast.error(e.message); },
  });

  const filtered = (leads ?? []).filter(l => {
    const matchSearch = !search
      || l.name.toLowerCase().includes(search.toLowerCase())
      || (l.phone ?? "").includes(search)
      || (l.email ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || l.status === filterStatus;
    return matchSearch && matchStatus;
  });

  function openAdd() { setEditLead(null); setForm(emptyForm()); setShowAdd(true); }

  function openEdit(lead: any) {
    setEditLead(lead);
    setForm({
      name: lead.name ?? "",
      phones: [lead.phone ?? "", lead.phone2 ?? "", lead.phone3 ?? ""].filter((v: string, i: number) => i === 0 || v),
      emails: [lead.email ?? "", lead.email2 ?? "", lead.email3 ?? ""].filter((v: string, i: number) => i === 0 || v),
      projectType: lead.projectType ?? "",
      source: lead.source ?? "",
      notes: lead.notes ?? "",
      address: lead.address ?? "",
      addressPlaceId: lead.addressPlaceId ?? "",
      status: lead.status ?? "new",
    });
    setShowAdd(true);
  }

  function handleSubmit() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    const payload = {
      name: form.name,
      phone: form.phones[0] || undefined,
      phone2: form.phones[1] || undefined,
      phone3: form.phones[2] || undefined,
      email: form.emails[0] || undefined,
      email2: form.emails[1] || undefined,
      email3: form.emails[2] || undefined,
      projectType: form.projectType || undefined,
      source: form.source || undefined,
      notes: form.notes || undefined,
      address: form.address || undefined,
      addressPlaceId: form.addressPlaceId || undefined,
    };
    if (editLead) {
      updateLead.mutate({ id: editLead.id, ...payload, status: form.status as any });
    } else {
      createLead.mutate(payload);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif" style={{ color: "var(--kp-cream)" }}>Lead / Client</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{(leads ?? []).length} total leads</p>
        </div>
        <Button className="btn-gold" onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1.5" /> New Lead
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="bg-card border-border pl-9" placeholder="Search by name, phone, email…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="bg-card border-border w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Lead List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground text-sm">No leads found. Click <strong>New Lead</strong> to get started.</p>
            </CardContent>
          </Card>
        ) : (
          filtered.map(lead => {
            const allPhones = [lead.phone, lead.phone2, lead.phone3].filter(Boolean) as string[];
            const allEmails = [lead.email, lead.email2, lead.email3].filter(Boolean) as string[];
            const isNew = lead.status === "new";
            const leadReschedules = (pendingReschedules ?? []).filter((r: any) => r.leadId === lead.id);
            return (
              <Card key={lead.id} className="bg-card border-border hover:border-primary/30 transition-all">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground">{lead.name}</h3>
                        <StatusBadge status={lead.status} />
                        {lead.projectType && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-accent/50 text-muted-foreground">{lead.projectType}</span>
                        )}
                        {lead.firstContactSentAt && (
                          <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
                            style={{ background: "#4CAF7D20", color: "#4CAF7D" }}>
                            <CheckCircle2 className="h-3 w-3" /> First Contact Sent
                          </span>
                        )}
                        {lead.latestMeeting?.status === "confirmed" && (
                          <span
                            className="text-xs px-2.5 py-0.5 rounded-full flex items-center gap-1 font-semibold"
                            style={{ background: "#4CAF7D", color: "#fff" }}
                            title={lead.latestMeeting.confirmedAt
                              ? `Confirmed ${new Date(lead.latestMeeting.confirmedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                              : "Client confirmed appointment"}
                          >
                            <CheckCircle2 className="h-3 w-3" /> Confirmed
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {allPhones.map((p, i) => (
                          <span key={i} className="flex items-center gap-1"><Phone className="h-3 w-3" />{p}</span>
                        ))}
                        {allEmails.map((e, i) => (
                          <span key={i} className="flex items-center gap-1"><Mail className="h-3 w-3" />{e}</span>
                        ))}
                        {lead.address && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />{lead.address}
                            {lead.addressPlaceId && <CheckCircle2 className="h-3 w-3 ml-0.5" style={{ color: "#4CAF7D" }} />}
                          </span>
                        )}
                        {lead.source && <span>Source: {lead.source.replace(/_/g, " ")}</span>}
                        {lead.createdAt && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />Added {new Date(lead.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} {new Date(lead.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                          </span>
                        )}
                      </div>
                      {lead.notes && <p className="text-xs text-muted-foreground line-clamp-2">{lead.notes}</p>}
                      {lead.internalNotes && (
                        <p className="text-xs italic line-clamp-1 flex items-center gap-1"
                          style={{ color: "#E8A838" }}>
                          <MessageSquare className="h-3 w-3" /> {lead.internalNotes}
                        </p>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-2 flex-wrap pt-1 items-center justify-between">
                        {/* First Contact — always visible so it can be resent if phone/email was wrong */}
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1.5 font-medium"
                          style={{ background: GOLD, color: "#fff" }}
                          onClick={() => setFirstContactLead(lead)}
                        >
                          <CalendarClock className="h-3.5 w-3.5" />
                          {lead.firstContactSentAt ? "Resend First Contact" : "Send First Contact"}
                        </Button>
                        {/* Convert to Project — only for won leads */}
                        {lead.status === "won" && (
                          <Button
                            size="sm"
                            className="h-7 text-xs gap-1.5 font-medium"
                            style={{ background: "#4CAF7D", color: "#fff" }}
                            onClick={() => { setConvertLeadId(lead.id); setConvertProjectName(lead.name + " — " + (lead.projectType ?? "Project")); }}
                          >
                            <FolderPlus className="h-3.5 w-3.5" />
                            Convert to Project
                          </Button>
                        )}
                        {/* See Client Dashboard */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1.5 border-border hover:bg-accent/50"
                          onClick={() => setPreviewLead(lead)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          See Client Dashboard
                        </Button>
                        {/* Send Client Dashboard Link */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1.5"
                          style={{ borderColor: GOLD, color: GOLD }}
                          disabled={sendingDashboardId === lead.id}
                          onClick={() => {
                            setSendingDashboardId(lead.id);
                            sendDashboardLink.mutate({ leadId: lead.id, origin: window.location.origin });
                          }}
                        >
                          {sendingDashboardId === lead.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Send className="h-3.5 w-3.5" />}
                          Send Client Dashboard Link
                        </Button>
                        {/* Sync Prior Emails — only shown when a client record exists for this lead */}
                        {(lead as any).clientId && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1.5"
                            style={{ borderColor: "#5B9BD5", color: "#5B9BD5" }}
                            disabled={syncingEmailLeadId === lead.id}
                            title="Search all Gmail workspace history for this client's email and import any prior threads"
                            onClick={() => {
                              setSyncingEmailLeadId(lead.id);
                              syncPriorEmails.mutate({ clientId: (lead as any).clientId });
                            }}
                          >
                            {syncingEmailLeadId === lead.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Mail className="h-3.5 w-3.5" />}
                            Sync Prior Emails
                          </Button>
                        )}
                        {/* Reschedule Consultation — only shown when a meeting exists */}
                        {lead.latestMeeting && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1.5 font-medium"
                            style={{ borderColor: "#9B59B6", color: "#9B59B6" }}
                            title="Propose a new consultation time and send to client for confirmation"
                            onClick={() => setRescheduleLead(lead)}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Reschedule Consultation
                            {/* Show pending badge if there's an outstanding proposal */}
                            {(pendingOwnerReschedules ?? []).some((p: any) => p.leadId === lead.id) && (
                              <span className="ml-1 px-1.5 py-0 rounded-full text-[10px] font-bold" style={{ background: "#E8A83840", color: "#E8A838" }}>Pending</span>
                            )}
                          </Button>
                        )}
                        {/* View Inspiration — opens side drawer with design ideas */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1.5 font-medium"
                          style={{ borderColor: "#BF9A3B", color: "#BF9A3B" }}
                          title="View client's inspiration photos, links, and design notes"
                          onClick={() => setInspirationDrawerLead(lead)}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          View Inspiration
                        </Button>
                        {/* View Field Captures — opens side drawer with field photos/notes */}
                        {(fieldCaptureCounts as Record<number, number>)[lead.id] > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1.5 font-medium"
                            style={{ borderColor: "#BF9A3B", color: "#BF9A3B" }}
                            title="View field photos and notes captured at this client's site"
                            onClick={() => setFieldCaptureDrawerLead(lead)}
                          >
                            <Camera className="h-3.5 w-3.5" />
                            Field Captures
                            <span className="ml-0.5 px-1.5 py-0 rounded-full text-[10px] font-bold" style={{ background: "#BF9A3B30", color: "#BF9A3B" }}>
                              {(fieldCaptureCounts as Record<number, number>)[lead.id]}
                            </span>
                          </Button>
                        )}
                        {/* Create Proposal shortcut — navigates to Proposals tab with this lead pre-selected */}
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1.5 font-semibold ml-auto"
                          style={{ background: "#2A5C8A", color: "#fff" }}
                          title="Open the Proposals tab with this client pre-selected"
                          onClick={() => setLocation(`/proposals?newFor=${lead.id}`)}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          Create Proposal
                        </Button>
                      </div>

                      {/* Reschedule Request Badges */}
                      {leadReschedules.length > 0 && (
                        <div className="space-y-2 pt-1">
                          {leadReschedules.map((req: any) => (
                            <div key={req.id} className="rounded-lg border p-3 space-y-2"
                              style={{ borderColor: "#E8A83860", background: "#E8A83810" }}>
                              <div className="flex items-center gap-2">
                                <Clock className="h-3.5 w-3.5" style={{ color: "#E8A838" }} />
                                <span className="text-xs font-semibold" style={{ color: "#E8A838" }}>Reschedule Request</span>
                              </div>
                              <div className="text-xs text-muted-foreground space-y-0.5">
                                <p><span className="font-medium">Option 1:</span> {new Date(req.suggestedTime1).toLocaleString()}</p>
                                {req.suggestedTime2 && <p><span className="font-medium">Option 2:</span> {new Date(req.suggestedTime2).toLocaleString()}</p>}
                                {req.suggestedTime3 && <p><span className="font-medium">Option 3:</span> {new Date(req.suggestedTime3).toLocaleString()}</p>}
                                {req.clientMessage && <p className="italic">"{req.clientMessage}"</p>}
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" className="h-6 text-xs gap-1" style={{ background: "#4CAF7D", color: "#fff" }}
                                  disabled={reviewReschedule.isPending}
                                  onClick={() => reviewReschedule.mutate({ id: req.id, action: "accepted" })}>
                                  Accept
                                </Button>
                                <Button size="sm" variant="outline" className="h-6 text-xs gap-1 border-destructive/50 text-destructive hover:bg-destructive/10"
                                  disabled={reviewReschedule.isPending}
                                  onClick={() => reviewReschedule.mutate({ id: req.id, action: "declined" })}>
                                  Decline
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Map preview — shown on medium+ screens when address is present */}
                    {lead.address && (
                      <ClientMapPreview
                        address={lead.address}
                        clientName={lead.name}
                        className="hidden md:block"
                      />
                    )}
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-accent/50" onClick={() => openEdit(lead)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/20 hover:text-destructive"
                        disabled={deleteCheckLoading}
                        onClick={() => handleTrashClick(lead)}>
                        {deleteCheckLoading && deleteTarget?.id === lead.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Smart Delete Confirmation Dialog */}
      <Dialog
        open={deleteTarget !== null && deleteCheckResult !== null && deleteCheckResult.hasData}
        onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteCheckResult(null); } }}
      >
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Delete Lead?
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-1">
              <span className="font-semibold text-foreground">{deleteTarget?.name}</span> has connected data:
              {deleteCheckResult && (
                <ul className="mt-2 space-y-0.5 text-xs">
                  {(deleteCheckResult.counts.estimates ?? 0) > 0 && (
                    <li>• {deleteCheckResult.counts.estimates} proposal{deleteCheckResult.counts.estimates !== 1 ? "s" : ""}</li>
                  )}
                  {(deleteCheckResult.counts.projects ?? 0) > 0 && (
                    <li>• {deleteCheckResult.counts.projects} project{deleteCheckResult.counts.projects !== 1 ? "s" : ""}</li>
                  )}
                  {(deleteCheckResult.counts.messages ?? 0) > 0 && (
                    <li>• {deleteCheckResult.counts.messages} message{deleteCheckResult.counts.messages !== 1 ? "s" : ""}</li>
                  )}
                </ul>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              variant="outline"
              className="justify-start gap-2 border-amber-500/40 hover:bg-amber-500/10"
              disabled={archiveLead.isPending || deleteLeadWithData.isPending}
              onClick={() => deleteTarget && archiveLead.mutate({ id: deleteTarget.id })}
            >
              <Archive className="h-4 w-4 text-amber-500" />
              <div className="text-left">
                <div className="font-medium">Archive</div>
                <div className="text-xs text-muted-foreground">Hide from lists, keep all data. Can be restored.</div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="justify-start gap-2 border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              disabled={archiveLead.isPending || deleteLeadWithData.isPending}
              onClick={() => deleteTarget && deleteLeadWithData.mutate({ id: deleteTarget.id })}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
              <div className="text-left">
                <div className="font-medium text-destructive">Delete Everything</div>
                <div className="text-xs text-muted-foreground">Permanently remove lead and all connected data.</div>
              </div>
            </Button>
            <Button
              variant="ghost"
              className="mt-1"
              onClick={() => { setDeleteTarget(null); setDeleteCheckResult(null); }}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={v => { setShowAdd(v); if (!v) setEditLead(null); }}>
        <DialogContent className="bg-card border-border max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">{editLead ? "Edit Lead" : "Add New Lead"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Full Name *</Label>
              <Input className="bg-background border-border" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="John & Jane Smith" />
            </div>

            <MultiInput
              label="Phone Numbers" icon={Phone}
              values={form.phones}
              onChange={vals => setForm(f => ({ ...f, phones: vals }))}
              placeholder="(864) 555-0000" type="tel"
            />

            <MultiInput
              label="Email Addresses" icon={Mail}
              values={form.emails}
              onChange={vals => setForm(f => ({ ...f, emails: vals }))}
              placeholder="john@email.com" type="email"
            />

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Property Address</Label>
              <AddressAutocomplete
                value={form.address}
                onChange={v => setForm(f => ({ ...f, address: v, addressPlaceId: "" }))}
                onPlaceSelect={(address, placeId) => setForm(f => ({ ...f, address, addressPlaceId: placeId }))}
              />
              {form.addressPlaceId && (
                <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: "#4CAF7D" }}>
                  <CheckCircle2 className="h-3 w-3" /> Address verified via Google Maps
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
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
                <Label className="text-xs text-muted-foreground mb-1.5 block">Lead Source</Label>
                <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
                  <SelectTrigger className="bg-background border-border"><SelectValue placeholder="Select source" /></SelectTrigger>
                  <SelectContent>
                    {SOURCE_OPTIONS.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {editLead && editLead.createdAt && (
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  Record Created
                </Label>
                <div className="px-3 py-2 rounded-md text-sm text-muted-foreground bg-muted/40 border border-border/40 select-none">
                  {new Date(editLead.createdAt).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })} {new Date(editLead.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">This field is set automatically and cannot be edited.</p>
              </div>
            )}

            {editLead && (
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* AI Lead Intake Bar — only on new lead form */}
            {!editLead && (
              <LeadAIIntakeBar
                currentFields={{
                  name: form.name || undefined,
                  phones: form.phones.filter(Boolean),
                  emails: form.emails.filter(Boolean),
                  address: form.address || undefined,
                  projectType: form.projectType || undefined,
                  source: form.source || undefined,
                  notes: form.notes || undefined,
                }}
                onFieldsExtracted={(fields: ExtractedLeadFields) => {
                  setForm(f => ({
                    ...f,
                    ...(fields.name ? { name: fields.name } : {}),
                    ...(fields.phones && fields.phones.length > 0 ? { phones: fields.phones.length >= f.phones.length ? fields.phones : [...fields.phones, ...f.phones.slice(fields.phones.length)] } : {}),
                    ...(fields.emails && fields.emails.length > 0 ? { emails: fields.emails.length >= f.emails.length ? fields.emails : [...fields.emails, ...f.emails.slice(fields.emails.length)] } : {}),
                    ...(fields.address ? { address: fields.address, addressPlaceId: "" } : {}),
                    ...(fields.projectType ? { projectType: fields.projectType } : {}),
                    ...(fields.source ? { source: fields.source } : {}),
                    ...(fields.notes ? { notes: f.notes ? f.notes + "\n" + fields.notes : fields.notes } : {}),
                  }));
                }}
              />
            )}

            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Label className="text-xs text-muted-foreground">Private Lead Notes</Label>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: "#E0525220", color: "#E05252" }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  In-house only — never shared with client
                </span>
              </div>
              <Textarea className="bg-background border-border resize-none" rows={3}
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Beware of dog, gate code, how they heard about you, scope preferences…" />
              <p className="text-[10px] text-muted-foreground mt-1">These notes are visible only to your team and follow this lead throughout the entire project lifecycle.</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); setEditLead(null); }}>Cancel</Button>
            <Button className="btn-gold" onClick={handleSubmit} disabled={createLead.isPending || updateLead.isPending}>
              {editLead ? "Save Changes" : "Add Lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* First Contact Dialog */}
      {firstContactLead && (
        <FirstContactDialog
          lead={firstContactLead}
          onClose={() => { setFirstContactLead(null); refetch(); }}
        />
      )}

      {/* Client Dashboard Preview */}
      {previewLead && (
        <ClientDashboardPreview
          lead={previewLead}
          onClose={() => setPreviewLead(null)}
        />
      )}

      {/* Convert to Project Dialog */}
      <Dialog open={convertLeadId !== null} onOpenChange={v => { if (!v) { setConvertLeadId(null); setConvertProjectName(""); } }}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl flex items-center gap-2">
              <FolderPlus className="h-5 w-5" style={{ color: "#4CAF7D" }} />
              Convert Lead to Project
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              This will create a new project pre-filled with the lead's name, address, and project type. The lead status will remain "Won."
            </p>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Project Name</Label>
              <Input
                className="bg-background border-border"
                value={convertProjectName}
                onChange={e => setConvertProjectName(e.target.value)}
                placeholder="e.g. Smith Kitchen Remodel"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConvertLeadId(null); setConvertProjectName(""); }}>Cancel</Button>
            <Button
              className="font-semibold"
              style={{ background: "#4CAF7D", color: "#fff" }}
              disabled={!convertProjectName.trim() || convertToProject.isPending}
              onClick={() => convertLeadId && convertToProject.mutate({ leadId: convertLeadId, projectName: convertProjectName })}
            >
              {convertToProject.isPending ? "Creating…" : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Owner-Initiated Reschedule Dialog */}
      {rescheduleLead && (
        <RescheduleConsultationDialog
          lead={rescheduleLead}
          onClose={() => setRescheduleLead(null)}
          onSubmit={(meetingId, proposedTime, note) => {
            proposeReschedule.mutate({
              meetingId,
              leadId: rescheduleLead.id,
              proposedTime,
              note,
              origin: window.location.origin,
            });
          }}
          isPending={proposeReschedule.isPending}
        />
      )}

      {/* Inspiration Drawer — side panel for design ideas */}
      <InspirationDrawer
        open={!!inspirationDrawerLead}
        onClose={() => setInspirationDrawerLead(null)}
        leadId={inspirationDrawerLead?.id}
        projectId={inspirationDrawerLead?.projectId}
        clientName={inspirationDrawerLead?.name}
      />

      {/* Field Capture Drawer — side panel for field photos/notes */}
      <FieldCaptureDrawer
        open={!!fieldCaptureDrawerLead}
        onClose={() => setFieldCaptureDrawerLead(null)}
        leadId={fieldCaptureDrawerLead?.id}
        clientName={fieldCaptureDrawerLead?.name}
      />
    </div>
  );
}
