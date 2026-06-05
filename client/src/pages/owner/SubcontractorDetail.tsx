import { useState, useRef, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft,
  HardHat,
  Phone,
  Mail,
  Wrench,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Clock,
  AlertTriangle,
  Upload,
  FileText,
  Send,
  MessageSquare,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Plus,
  Edit,
  Link2,
  Star,
  TrendingUp,
  Trophy,
  DollarSign,
  CalendarDays,
} from "lucide-react";

// ─── Tier Badge ──────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  elite: { label: "Elite", color: "#BF9A3B", bg: "rgba(191,154,59,0.15)", border: "rgba(191,154,59,0.4)" },
  preferred: { label: "Preferred", color: "#4CAF50", bg: "rgba(76,175,80,0.12)", border: "rgba(76,175,80,0.35)" },
  standard: { label: "Standard", color: "#90A4AE", bg: "rgba(144,164,174,0.12)", border: "rgba(144,164,174,0.3)" },
  do_not_use: { label: "Do Not Use", color: "#EF5350", bg: "rgba(239,83,80,0.12)", border: "rgba(239,83,80,0.35)" },
};

function TierBadge({ tier }: { tier: string | null | undefined }) {
  if (!tier) return null;
  const cfg = TIER_CONFIG[tier] ?? { label: tier, color: "#888", bg: "rgba(100,100,100,0.1)", border: "rgba(100,100,100,0.2)" };
  return (
    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
      <Star className="h-3 w-3" /> {cfg.label}
    </span>
  );
}

// ─── Compliance Badge ─────────────────────────────────────────────────────────

function ComplianceBadge({ status }: { status: string | null }) {
  const map: Record<string, { icon: any; label: string; color: string; bg: string }> = {
    compliant: { icon: ShieldCheck, label: "Compliant", color: "#2E7D32", bg: "rgba(46,125,50,0.15)" },
    expiring_soon: { icon: Clock, label: "Expiring Soon", color: "#E67700", bg: "rgba(230,119,0,0.12)" },
    expired: { icon: ShieldX, label: "Expired", color: "#C62828", bg: "rgba(198,40,40,0.12)" },
    missing: { icon: AlertTriangle, label: "Missing Docs", color: "#C62828", bg: "rgba(198,40,40,0.1)" },
    pending: { icon: Clock, label: "Pending Review", color: "#888", bg: "rgba(100,100,100,0.12)" },
  };
  const cfg = map[status ?? ""] ?? { icon: ShieldAlert, label: "Unknown", color: "#888", bg: "rgba(100,100,100,0.1)" };
  const Icon = cfg.icon;
  return (
    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}40` }}>
      <Icon className="h-4 w-4" /> {cfg.label}
    </span>
  );
}

// ─── Upload Doc Dialog ────────────────────────────────────────────────────────

function UploadDocDialog({
  subcontractorId,
  open,
  onClose,
  onUploaded,
}: {
  subcontractorId: number;
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}) {
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    docType: "coi" as "coi" | "workers_comp" | "license" | "w9" | "other",
    expiryDate: "",
    notes: "",
  });
  const [file, setFile] = useState<File | null>(null);

  const uploadMutation = trpc.subcontractors.uploadDoc.useMutation({
    onSuccess: () => {
      toast({ title: "Document uploaded successfully" });
      onUploaded();
      onClose();
      setFile(null);
      setForm({ docType: "coi", expiryDate: "", notes: "" });
    },
    onError: (err) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  const handleUpload = useCallback(async () => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      uploadMutation.mutate({
        subcontractorId,
        docType: form.docType,
        fileName: file.name,
        fileDataBase64: base64,
        mimeType: file.type || "application/pdf",
        expiryDate: form.expiryDate || undefined,
        notes: form.notes || undefined,
      });
    };
    reader.readAsDataURL(file);
  }, [file, form, subcontractorId, uploadMutation]);

  const DOC_TYPES = [
    { value: "coi", label: "Certificate of Insurance (COI)" },
    { value: "workers_comp", label: "Workers' Compensation" },
    { value: "license", label: "Contractor License" },
    { value: "w9", label: "W-9 Form" },
    { value: "other", label: "Other Document" },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" style={{ background: "var(--kp-charcoal)", border: "1px solid rgba(191,154,59,0.2)" }}>
        <DialogHeader>
          <DialogTitle style={{ color: "var(--kp-cream)" }}>Upload Compliance Document</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div>
            <Label style={{ color: "var(--kp-muted)" }}>Document Type *</Label>
            <Select value={form.docType} onValueChange={(v: any) => setForm({ ...form, docType: v })}>
              <SelectTrigger className="mt-1" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label style={{ color: "var(--kp-muted)" }}>Expiry Date</Label>
            <Input
              type="date"
              value={form.expiryDate}
              onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
              className="mt-1"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
            />
          </div>
          <div>
            <Label style={{ color: "var(--kp-muted)" }}>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="mt-1 resize-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
            />
          </div>
          <div>
            <Label style={{ color: "var(--kp-muted)" }}>File *</Label>
            <div
              className="mt-1 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors"
              style={{ borderColor: file ? "rgba(191,154,59,0.5)" : "rgba(255,255,255,0.1)" }}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-6 w-6 mx-auto mb-2" style={{ color: "var(--kp-muted)" }} />
              {file ? (
                <p className="text-sm" style={{ color: "var(--kp-gold)" }}>{file.name}</p>
              ) : (
                <p className="text-sm" style={{ color: "var(--kp-muted)" }}>Click to select PDF or image</p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} style={{ borderColor: "rgba(255,255,255,0.15)", color: "var(--kp-muted)" }}>Cancel</Button>
          <Button onClick={handleUpload} disabled={!file || uploadMutation.isPending} className="btn-gold">
            {uploadMutation.isPending ? "Uploading..." : "Upload Document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Contract Dialog ───────────────────────────────────────────────────

function CreateContractDialog({
  subcontractorId,
  open,
  onClose,
  onCreated,
}: {
  subcontractorId: number;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  
  const [form, setForm] = useState({
    title: "",
    projectId: "",
    scopeOfWork: "",
    contractAmount: "",
    startDate: "",
    endDate: "",
    notes: "",
  });

  const { data: projects = [] } = trpc.projects.list.useQuery();

  const createMutation = trpc.subcontractors.createContract.useMutation({
    onSuccess: () => {
      toast({ title: "Contract created" });
      onCreated();
      onClose();
      setForm({ title: "", projectId: "", scopeOfWork: "", contractAmount: "", startDate: "", endDate: "", notes: "" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg" style={{ background: "var(--kp-charcoal)", border: "1px solid rgba(191,154,59,0.2)" }}>
        <DialogHeader>
          <DialogTitle style={{ color: "var(--kp-cream)" }}>Create Subcontractor Contract</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div>
            <Label style={{ color: "var(--kp-muted)" }}>Contract Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g., Master Bath Plumbing Work"
              className="mt-1"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
            />
          </div>
          <div>
            <Label style={{ color: "var(--kp-muted)" }}>Project *</Label>
            <Select value={form.projectId} onValueChange={(v) => setForm({ ...form, projectId: v })}>
              <SelectTrigger className="mt-1" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}>
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {(projects as any[]).map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label style={{ color: "var(--kp-muted)" }}>Scope of Work</Label>
            <Textarea
              value={form.scopeOfWork}
              onChange={(e) => setForm({ ...form, scopeOfWork: e.target.value })}
              placeholder="Describe the specific work to be performed..."
              rows={3}
              className="mt-1 resize-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label style={{ color: "var(--kp-muted)" }}>Amount ($)</Label>
              <Input
                type="number"
                value={form.contractAmount}
                onChange={(e) => setForm({ ...form, contractAmount: e.target.value })}
                placeholder="0.00"
                className="mt-1"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
              />
            </div>
            <div>
              <Label style={{ color: "var(--kp-muted)" }}>Start Date</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="mt-1"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
              />
            </div>
            <div>
              <Label style={{ color: "var(--kp-muted)" }}>End Date</Label>
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="mt-1"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} style={{ borderColor: "rgba(255,255,255,0.15)", color: "var(--kp-muted)" }}>Cancel</Button>
          <Button
            onClick={() => createMutation.mutate({
              subcontractorId,
              projectId: parseInt(form.projectId),
              title: form.title,
              scopeOfWork: form.scopeOfWork || undefined,
              contractAmount: form.contractAmount ? parseFloat(form.contractAmount) : undefined,
              startDate: form.startDate || undefined,
              endDate: form.endDate || undefined,
              notes: form.notes || undefined,
            })}
            disabled={!form.title || !form.projectId || createMutation.isPending}
            className="btn-gold"
          >
            {createMutation.isPending ? "Creating..." : "Create Contract"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Send Message Dialog ──────────────────────────────────────────────────────

function SendMessageDialog({
  subcontractorId,
  open,
  onClose,
  onSent,
}: {
  subcontractorId: number;
  open: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const smsMutation = trpc.subcontractors.sendSms.useMutation({
    onSuccess: () => { toast({ title: "SMS sent" }); onSent(); onClose(); setBody(""); },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const emailMutation = trpc.subcontractors.sendEmail.useMutation({
    onSuccess: () => { toast({ title: "Email sent" }); onSent(); onClose(); setSubject(""); setBody(""); },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSend = () => {
    if (channel === "sms") {
      smsMutation.mutate({ subcontractorId, message: body });
    } else {
      emailMutation.mutate({ subcontractorId, subject, body });
    }
  };

  const isPending = smsMutation.isPending || emailMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" style={{ background: "var(--kp-charcoal)", border: "1px solid rgba(191,154,59,0.2)" }}>
        <DialogHeader>
          <DialogTitle style={{ color: "var(--kp-cream)" }}>Send Message</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="flex gap-2">
            {(["sms", "email"] as const).map((ch) => (
              <button
                key={ch}
                onClick={() => setChannel(ch)}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: channel === ch ? "rgba(191,154,59,0.2)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${channel === ch ? "rgba(191,154,59,0.5)" : "rgba(255,255,255,0.1)"}`,
                  color: channel === ch ? "var(--kp-gold)" : "var(--kp-muted)",
                }}
              >
                {ch === "sms" ? "📱 SMS" : "✉️ Email"}
              </button>
            ))}
          </div>
          {channel === "email" && (
            <div>
              <Label style={{ color: "var(--kp-muted)" }}>Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
              />
            </div>
          )}
          <div>
            <Label style={{ color: "var(--kp-muted)" }}>Message</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="mt-1 resize-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} style={{ borderColor: "rgba(255,255,255,0.15)", color: "var(--kp-muted)" }}>Cancel</Button>
          <Button onClick={handleSend} disabled={!body || isPending} className="btn-gold gap-2">
            <Send className="h-4 w-4" /> {isPending ? "Sending..." : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Detail Page ─────────────────────────────────────────────────────────

// ─── Scorecard Update Dialog ─────────────────────────────────────────────────

function ScorecardDialog({
  subcontractorId,
  current,
  open,
  onClose,
  onUpdated,
}: {
  subcontractorId: number;
  current: { onTimePercentage?: string | null; qualityScore?: string | null; responsivenessScore?: string | null } | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [form, setForm] = useState({
    onTimePercentage: current?.onTimePercentage ? parseFloat(String(current.onTimePercentage)) : 85,
    qualityScore: current?.qualityScore ? parseFloat(String(current.qualityScore)) : 7,
    responsivenessScore: current?.responsivenessScore ? parseFloat(String(current.responsivenessScore)) : 7,
  });

  const updateMutation = trpc.vms.subScorecard.update.useMutation({
    onSuccess: (res) => {
      toast({ title: `Scorecard updated — Tier: ${res.tier ?? "N/A"}` });
      onUpdated();
      onClose();
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" style={{ background: "var(--kp-charcoal)", border: "1px solid rgba(191,154,59,0.2)" }}>
        <DialogHeader>
          <DialogTitle style={{ color: "var(--kp-cream)" }}>Update Scorecard</DialogTitle>
        </DialogHeader>
        <div className="grid gap-5 py-2">
          {([
            { key: "onTimePercentage" as const, label: "On-Time %", min: 0, max: 100, step: 1, suffix: "%" },
            { key: "qualityScore" as const, label: "Quality Score", min: 0, max: 10, step: 0.5, suffix: "/10" },
            { key: "responsivenessScore" as const, label: "Responsiveness", min: 0, max: 10, step: 0.5, suffix: "/10" },
          ] as const).map(({ key, label, min, max, step, suffix }) => (
            <div key={key}>
              <div className="flex justify-between mb-1">
                <Label style={{ color: "var(--kp-muted)" }}>{label}</Label>
                <span className="text-sm font-medium" style={{ color: "var(--kp-gold)" }}>{form[key]}{suffix}</span>
              </div>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: parseFloat(e.target.value) })}
                className="w-full accent-amber-500"
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} style={{ borderColor: "rgba(255,255,255,0.15)", color: "var(--kp-muted)" }}>Cancel</Button>
          <Button
            onClick={() => updateMutation.mutate({ subcontractorId, ...form })}
            disabled={updateMutation.isPending}
            className="btn-gold"
          >
            {updateMutation.isPending ? "Saving..." : "Save Scorecard"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SubcontractorDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  
  const subId = parseInt(params.id ?? "0");

  const [showUploadDoc, setShowUploadDoc] = useState(false);
  const [showCreateContract, setShowCreateContract] = useState(false);
  const [showSendMessage, setShowSendMessage] = useState(false);
  const [showScorecard, setShowScorecard] = useState(false);
  const [showSendAward, setShowSendAward] = useState(false);
  const [selectedAwardId, setSelectedAwardId] = useState<number | null>(null);
  const [awardForm, setAwardForm] = useState({ paymentTerms: "", depositPercent: "30", startDate: "", endDate: "", notes: "", sendEmail: true, sendSmsNotification: true });
  const sendAwardMutation = trpc.subcontractors.sendAward.useMutation({
    onSuccess: (res) => {
      toast(res.emailSent ? "Award contract sent via email" : "Award contract created (no email on file)");
      setShowSendAward(false);
      setSelectedAwardId(null);
      refetch();
    },
    onError: (e) => toast(e.message),
  });

  const { data, refetch, isLoading } = trpc.subcontractors.get.useQuery({ id: subId });
  const { data: scorecard, refetch: refetchScorecard } = trpc.vms.subScorecard.get.useQuery({ subcontractorId: subId });

  const reviewDocMutation = trpc.subcontractors.reviewDoc.useMutation({
    onSuccess: () => { toast({ title: "Document reviewed" }); refetch(); },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const sendContractMutation = trpc.subcontractors.sendContract.useMutation({
    onSuccess: (res) => {
      toast({ title: "Contract sent for signature", description: res.emailSent ? "Email sent" : "Check phone number" });
      refetch();
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const sendPortalLinkMutation = trpc.subcontractors.sendPortalLink.useMutation({
    onSuccess: (res) => {
      toast({ title: "Portal link sent", description: res.emailSent ? "Email sent" : "Check contact info" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full" style={{ background: "var(--kp-charcoal-dark)" }}>
          <div className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--kp-gold)" }} />
        </div>
      </DashboardLayout>
    );
  }

  if (!data) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-full gap-4" style={{ background: "var(--kp-charcoal-dark)" }}>
          <p style={{ color: "var(--kp-cream)" }}>Subcontractor not found</p>
          <Button onClick={() => navigate("/subcontractors")} variant="outline">Back to List</Button>
        </div>
      </DashboardLayout>
    );
  }

  const { docs = [], contracts = [], comms = [], awardCandidates = [] } = data as any;

  const coiDoc = docs.find((d) => d.docType === "coi" && d.status === "approved");
  const wcDoc = docs.find((d) => d.docType === "workers_comp" && d.status === "approved");

  const DOC_TYPE_LABELS: Record<string, string> = {
    coi: "Certificate of Insurance",
    workers_comp: "Workers' Compensation",
    license: "Contractor License",
    w9: "W-9 Form",
    other: "Other",
  };

  const CONTRACT_STATUS_COLORS: Record<string, string> = {
    draft: "#888",
    sent: "#E67700",
    signed: "#2E7D32",
    voided: "#C62828",
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full" style={{ background: "var(--kp-charcoal-dark)" }}>
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-4 border-b" style={{ borderColor: "rgba(191,154,59,0.15)" }}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/subcontractors")}
            style={{ color: "var(--kp-muted)" }}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-12 w-12 rounded-xl flex items-center justify-center font-bold text-lg"
            style={{ background: "rgba(191,154,59,0.15)", color: "var(--kp-gold)" }}>
            {data.companyName.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-semibold" style={{ color: "var(--kp-cream)" }}>{data.companyName}</h1>
              {data.trade && (
                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(191,154,59,0.12)", color: "var(--kp-gold)" }}>
                  <Wrench className="h-3 w-3" /> {data.trade}
                </span>
              )}
              <ComplianceBadge status={data.complianceStatus} />
              <TierBadge tier={scorecard?.tier} />
            </div>
            <div className="flex items-center gap-4 mt-1 flex-wrap">
              {data.contactName && <span className="text-sm" style={{ color: "var(--kp-muted)" }}>{data.contactName}</span>}
              {data.phone && (
                <span className="flex items-center gap-1 text-sm" style={{ color: "var(--kp-muted)" }}>
                  <Phone className="h-3.5 w-3.5" /> {data.phone}
                </span>
              )}
              {data.email && (
                <span className="flex items-center gap-1 text-sm" style={{ color: "var(--kp-muted)" }}>
                  <Mail className="h-3.5 w-3.5" /> {data.email}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => sendPortalLinkMutation.mutate({ subcontractorId: subId, origin: window.location.origin })}
              disabled={sendPortalLinkMutation.isPending}
              style={{ borderColor: "rgba(191,154,59,0.3)", color: "var(--kp-gold)" }}
            >
              <Link2 className="h-4 w-4" />
              {sendPortalLinkMutation.isPending ? "Sending..." : "Send Portal Link"}
            </Button>
            <Button
              size="sm"
              className="btn-gold gap-2"
              onClick={() => setShowSendMessage(true)}
            >
              <MessageSquare className="h-4 w-4" /> Message
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex-1 overflow-hidden">
          <Tabs defaultValue="compliance" className="h-full flex flex-col">
            <TabsList className="mx-6 mt-4 w-fit" style={{ background: "rgba(255,255,255,0.05)" }}>
              <TabsTrigger value="compliance" style={{ color: "var(--kp-muted)" }}>Compliance</TabsTrigger>
              <TabsTrigger value="contracts" style={{ color: "var(--kp-muted)" }}>Contracts ({contracts.length})</TabsTrigger>
              <TabsTrigger value="awards" style={{ color: "var(--kp-muted)" }}>Awards ({awardCandidates.length})</TabsTrigger>
              <TabsTrigger value="scorecard" style={{ color: "var(--kp-muted)" }}>Scorecard</TabsTrigger>
              <TabsTrigger value="comms" style={{ color: "var(--kp-muted)" }}>Communications ({comms.length})</TabsTrigger>
              <TabsTrigger value="profile" style={{ color: "var(--kp-muted)" }}>Profile</TabsTrigger>
            </TabsList>

            {/* ── Compliance Tab ─────────────────────────────────────────── */}
            <TabsContent value="compliance" className="flex-1 overflow-y-auto px-6 pb-6 mt-4">
              {/* Required docs status */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                {[
                  { key: "coi", label: "Certificate of Insurance (COI)", doc: coiDoc },
                  { key: "workers_comp", label: "Workers' Compensation", doc: wcDoc },
                ].map(({ key, label, doc }) => (
                  <Card key={key} style={{
                    background: doc ? "rgba(46,125,50,0.08)" : "rgba(198,40,40,0.08)",
                    border: `1px solid ${doc ? "rgba(46,125,50,0.25)" : "rgba(198,40,40,0.25)"}`,
                  }}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium" style={{ color: "var(--kp-cream)" }}>{label}</p>
                          {doc ? (
                            <>
                              <p className="text-xs mt-1" style={{ color: "#2E7D32" }}>✓ Approved</p>
                              {doc.expiryDate && (
                                <p className="text-xs" style={{ color: "var(--kp-muted)" }}>
                                  Expires: {new Date(doc.expiryDate).toLocaleDateString()}
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-xs mt-1" style={{ color: "#C62828" }}>✗ Not on file</p>
                          )}
                        </div>
                        {doc ? (
                          <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: "#2E7D32" }} />
                        ) : (
                          <AlertTriangle className="h-5 w-5 shrink-0" style={{ color: "#C62828" }} />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* All docs */}
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold" style={{ color: "var(--kp-cream)" }}>All Documents ({docs.length})</h3>
                <Button size="sm" className="btn-gold gap-2" onClick={() => setShowUploadDoc(true)}>
                  <Upload className="h-3.5 w-3.5" /> Upload Document
                </Button>
              </div>

              {docs.length === 0 ? (
                <div className="text-center py-10">
                  <FileText className="h-10 w-10 mx-auto mb-3" style={{ color: "var(--kp-muted)", opacity: 0.4 }} />
                  <p className="text-sm" style={{ color: "var(--kp-muted)" }}>No documents uploaded yet</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {docs.map((doc) => (
                    <Card key={doc.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 shrink-0" style={{ color: "var(--kp-gold)" }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: "var(--kp-cream)" }}>
                              {DOC_TYPE_LABELS[doc.docType] ?? doc.docType}
                            </p>
                            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                              {doc.fileName && (
                                <span className="text-xs truncate" style={{ color: "var(--kp-muted)" }}>{doc.fileName}</span>
                              )}
                              {doc.expiryDate && (
                                <span className="text-xs" style={{ color: "var(--kp-muted)" }}>
                                  Exp: {new Date(doc.expiryDate).toLocaleDateString()}
                                </span>
                              )}
                              <span className="text-xs px-2 py-0.5 rounded-full"
                                style={{
                                  background: doc.status === "approved" ? "rgba(46,125,50,0.15)" : doc.status === "rejected" ? "rgba(198,40,40,0.15)" : "rgba(100,100,100,0.15)",
                                  color: doc.status === "approved" ? "#2E7D32" : doc.status === "rejected" ? "#C62828" : "#888",
                                }}>
                                {doc.status}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {doc.fileUrl && (
                              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                                <Button variant="ghost" size="icon" style={{ color: "var(--kp-muted)" }}>
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </a>
                            )}
                            {doc.status === "pending" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => reviewDocMutation.mutate({ docId: doc.id, status: "approved" })}
                                  style={{ color: "#2E7D32" }}
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => reviewDocMutation.mutate({ docId: doc.id, status: "rejected" })}
                                  style={{ color: "#C62828" }}
                                >
                                  <XCircle className="h-4 w-4 mr-1" /> Reject
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── Contracts Tab ──────────────────────────────────────────── */}
            <TabsContent value="contracts" className="flex-1 overflow-y-auto px-6 pb-6 mt-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold" style={{ color: "var(--kp-cream)" }}>Subcontractor Contracts</h3>
                <Button size="sm" className="btn-gold gap-2" onClick={() => setShowCreateContract(true)}>
                  <Plus className="h-3.5 w-3.5" /> New Contract
                </Button>
              </div>

              {contracts.length === 0 ? (
                <div className="text-center py-10">
                  <FileText className="h-10 w-10 mx-auto mb-3" style={{ color: "var(--kp-muted)", opacity: 0.4 }} />
                  <p className="text-sm" style={{ color: "var(--kp-muted)" }}>No contracts yet</p>
                  <Button size="sm" className="btn-gold gap-2 mt-4" onClick={() => setShowCreateContract(true)}>
                    <Plus className="h-3.5 w-3.5" /> Create First Contract
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3">
                  {contracts.map((contract) => (
                    <Card key={contract.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm" style={{ color: "var(--kp-cream)" }}>{contract.title}</span>
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                style={{
                                  background: `${CONTRACT_STATUS_COLORS[contract.status ?? "draft"]}20`,
                                  color: CONTRACT_STATUS_COLORS[contract.status ?? "draft"],
                                  border: `1px solid ${CONTRACT_STATUS_COLORS[contract.status ?? "draft"]}40`,
                                }}>
                                {contract.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              <span className="text-xs" style={{ color: "var(--kp-muted)" }}>#{contract.contractNumber}</span>
                              {contract.contractAmount && (
                                <span className="text-xs" style={{ color: "var(--kp-muted)" }}>
                                  ${parseFloat(String(contract.contractAmount)).toLocaleString()}
                                </span>
                              )}
                              {contract.startDate && (
                                <span className="text-xs" style={{ color: "var(--kp-muted)" }}>
                                  {new Date(contract.startDate).toLocaleDateString()} →{" "}
                                  {contract.endDate ? new Date(contract.endDate).toLocaleDateString() : "TBD"}
                                </span>
                              )}
                            </div>
                            {contract.signedAt && (
                              <p className="text-xs mt-1" style={{ color: "#2E7D32" }}>
                                ✓ Signed by {contract.signerName} on {new Date(contract.signedAt).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {contract.signedPdfUrl && (
                              <a href={contract.signedPdfUrl} target="_blank" rel="noopener noreferrer">
                                <Button variant="ghost" size="sm" style={{ color: "var(--kp-gold)" }}>
                                  <ExternalLink className="h-4 w-4 mr-1" /> Signed PDF
                                </Button>
                              </a>
                            )}
                            {contract.pdfUrl && !contract.signedPdfUrl && (
                              <a href={contract.pdfUrl} target="_blank" rel="noopener noreferrer">
                                <Button variant="ghost" size="sm" style={{ color: "var(--kp-muted)" }}>
                                  <ExternalLink className="h-4 w-4 mr-1" /> View PDF
                                </Button>
                              </a>
                            )}
                            {contract.status === "draft" && (
                              <Button
                                size="sm"
                                className="btn-gold gap-1"
                                onClick={() => sendContractMutation.mutate({
                                  contractId: contract.id,
                                  origin: window.location.origin,
                                  sendSms: true,
                                  sendEmail: true,
                                })}
                                disabled={sendContractMutation.isPending}
                              >
                                <Send className="h-3.5 w-3.5" />
                                {sendContractMutation.isPending ? "Sending..." : "Send for Signature"}
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── Awards Tab ────────────────────────────────────────────── */}
            <TabsContent value="awards" className="flex-1 overflow-y-auto px-6 pb-6 mt-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold" style={{ color: "var(--kp-cream)" }}>Award Candidates</h3>
              </div>
              {awardCandidates.length === 0 ? (
                <div className="text-center py-10">
                  <Trophy className="h-10 w-10 mx-auto mb-3" style={{ color: "var(--kp-muted)", opacity: 0.4 }} />
                  <p className="text-sm" style={{ color: "var(--kp-muted)" }}>No award candidates yet — assign this subcontractor to a proposal line item to generate candidates</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {(awardCandidates as any[]).map((award: any) => {
                    const statusColors: Record<string, string> = {
                      pending: "#8A8B82",
                      awarded: "#BF9A3B",
                      accepted: "#4CAF7D",
                      declined: "#E05252",
                      cancelled: "#888",
                    };
                    const statusColor = statusColors[award.status] ?? "#888";
                    return (
                      <Card key={award.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                  style={{ background: `${statusColor}20`, color: statusColor, border: `1px solid ${statusColor}40` }}>
                                  {award.status.charAt(0).toUpperCase() + award.status.slice(1)}
                                </span>
                                {award.estimate && (
                                  <span className="text-xs" style={{ color: "var(--kp-muted)" }}>
                                    Proposal #{award.estimate.estimateNumber ?? award.estimateId}
                                  </span>
                                )}
                                {award.project && (
                                  <span className="text-xs" style={{ color: "var(--kp-muted)" }}>
                                    · {award.project.title}
                                  </span>
                                )}
                              </div>
                              {award.lineItem && (
                                <p className="text-sm font-medium" style={{ color: "var(--kp-cream)" }}>{award.lineItem.task}</p>
                              )}
                              {award.scopeOfWork && (
                                <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--kp-muted)" }}>{award.scopeOfWork}</p>
                              )}
                              {award.agreedAmount && (
                                <p className="text-sm mt-1 font-semibold" style={{ color: "var(--kp-gold)" }}>
                                  ${parseFloat(String(award.agreedAmount)).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                </p>
                              )}
                              <p className="text-xs mt-1" style={{ color: "var(--kp-muted)" }}>
                                Created {new Date(award.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            {award.status === "pending" && (
                              <Button
                                size="sm"
                                className="btn-gold shrink-0 gap-1.5"
                                onClick={() => {
                                  setSelectedAwardId(award.id);
                                  setAwardForm({ paymentTerms: "", depositPercent: "30", startDate: "", endDate: "", notes: award.scopeOfWork ?? "", sendEmail: true, sendSmsNotification: true });
                                  setShowSendAward(true);
                                }}
                              >
                                <Send className="h-3.5 w-3.5" /> Send Award
                              </Button>
                            )}
                            {award.contractId && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="shrink-0 gap-1.5"
                                style={{ borderColor: "rgba(255,255,255,0.15)", color: "var(--kp-cream)" }}
                                onClick={() => navigate("/subcontractors")}
                              >
                                <FileText className="h-3.5 w-3.5" /> View Contract
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ── Scorecard Tab ──────────────────────────────────────────── */}
            <TabsContent value="scorecard" className="flex-1 overflow-y-auto px-6 pb-6 mt-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold" style={{ color: "var(--kp-cream)" }}>Performance Scorecard</h3>
                <Button size="sm" className="btn-gold gap-2" onClick={() => setShowScorecard(true)}>
                  <Edit className="h-3.5 w-3.5" /> Update Scores
                </Button>
              </div>

              {/* Tier badge */}
              <div className="flex items-center gap-3 mb-6">
                <TierBadge tier={scorecard?.tier} />
                {scorecard?.lastScorecardAt && (
                  <span className="text-xs" style={{ color: "var(--kp-muted)" }}>
                    Last updated {new Date(scorecard.lastScorecardAt).toLocaleDateString()}
                  </span>
                )}
              </div>

              {/* Score cards */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                {([
                  { label: "Composite Score", value: scorecard?.performanceScore, suffix: "/10", icon: TrendingUp },
                  { label: "On-Time %", value: scorecard?.onTimePercentage, suffix: "%", icon: Clock },
                  { label: "Quality Score", value: scorecard?.qualityScore, suffix: "/10", icon: Star },
                  { label: "Responsiveness", value: scorecard?.responsivenessScore, suffix: "/10", icon: MessageSquare },
                ] as const).map(({ label, value, suffix, icon: Icon }) => (
                  <Card key={label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="h-4 w-4" style={{ color: "var(--kp-gold)" }} />
                        <span className="text-xs" style={{ color: "var(--kp-muted)" }}>{label}</span>
                      </div>
                      <p className="text-2xl font-semibold" style={{ color: value ? "var(--kp-cream)" : "var(--kp-muted)" }}>
                        {value ? `${parseFloat(String(value)).toFixed(1)}${suffix}` : "—"}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Completed tasks */}
              <Card style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <CardContent className="p-4 flex items-center justify-between">
                  <span className="text-sm" style={{ color: "var(--kp-muted)" }}>Completed Tasks</span>
                  <span className="text-lg font-semibold" style={{ color: "var(--kp-cream)" }}>{scorecard?.completedTaskCount ?? 0}</span>
                </CardContent>
              </Card>

              {!scorecard?.performanceScore && (
                <div className="text-center py-8 mt-4">
                  <Star className="h-10 w-10 mx-auto mb-3" style={{ color: "var(--kp-muted)", opacity: 0.4 }} />
                  <p className="text-sm" style={{ color: "var(--kp-muted)" }}>No scorecard data yet — click Update Scores to add ratings</p>
                </div>
              )}
            </TabsContent>

            {/* ── Communications Tab ─────────────────────────────────────── */}
            <TabsContent value="comms" className="flex-1 overflow-y-auto px-6 pb-6 mt-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold" style={{ color: "var(--kp-cream)" }}>Communication History</h3>
                <Button size="sm" className="btn-gold gap-2" onClick={() => setShowSendMessage(true)}>
                  <Send className="h-3.5 w-3.5" /> Send Message
                </Button>
              </div>

              {comms.length === 0 ? (
                <div className="text-center py-10">
                  <MessageSquare className="h-10 w-10 mx-auto mb-3" style={{ color: "var(--kp-muted)", opacity: 0.4 }} />
                  <p className="text-sm" style={{ color: "var(--kp-muted)" }}>No communications yet</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {comms.map((comm) => (
                    <div
                      key={comm.id}
                      className="flex gap-3 p-3 rounded-lg"
                      style={{
                        background: comm.direction === "outbound" ? "rgba(191,154,59,0.06)" : "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.07)",
                      }}
                    >
                      <div className="shrink-0 mt-0.5">
                        {comm.channel === "sms" ? (
                          <Phone className="h-4 w-4" style={{ color: comm.direction === "outbound" ? "var(--kp-gold)" : "var(--kp-muted)" }} />
                        ) : (
                          <Mail className="h-4 w-4" style={{ color: comm.direction === "outbound" ? "var(--kp-gold)" : "var(--kp-muted)" }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium" style={{ color: comm.direction === "outbound" ? "var(--kp-gold)" : "var(--kp-cream)" }}>
                            {comm.direction === "outbound" ? "Sent" : "Received"} · {comm.channel.toUpperCase()}
                          </span>
                          {comm.subject && (
                            <span className="text-xs" style={{ color: "var(--kp-muted)" }}>{comm.subject}</span>
                          )}
                          <span className="text-xs ml-auto" style={{ color: "var(--kp-muted)" }}>
                            {new Date(comm.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm mt-1 line-clamp-2" style={{ color: "var(--kp-cream)", opacity: 0.85 }}>{comm.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── Profile Tab ───────────────────────────────────────────── */}
            <TabsContent value="profile" className="flex-1 overflow-y-auto px-6 pb-6 mt-4">
              <Card style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <CardHeader>
                  <CardTitle className="text-sm" style={{ color: "var(--kp-cream)" }}>Subcontractor Profile</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {[
                    { label: "Company Name", value: data.companyName },
                    { label: "Contact Name", value: data.contactName },
                    { label: "Trade", value: data.trade },
                    { label: "Email", value: data.email },
                    { label: "Phone", value: data.phone },
                    { label: "License #", value: data.licenseNumber },
                    { label: "Address", value: data.address },
                    { label: "Status", value: data.isActive ? "Active" : "Inactive" },
                    { label: "Performance Score", value: data.performanceScore ? `${data.performanceScore}/10` : "N/A" },
                    { label: "Completed Tasks", value: String(data.completedTaskCount ?? 0) },
                  ].map(({ label, value }) => value ? (
                    <div key={label} className="flex justify-between items-start gap-4">
                      <span className="text-sm" style={{ color: "var(--kp-muted)" }}>{label}</span>
                      <span className="text-sm text-right" style={{ color: "var(--kp-cream)" }}>{value}</span>
                    </div>
                  ) : null)}
                  {data.notes && (
                    <div>
                      <span className="text-sm" style={{ color: "var(--kp-muted)" }}>Notes</span>
                      <p className="text-sm mt-1" style={{ color: "var(--kp-cream)" }}>{data.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Dialogs */}
      <UploadDocDialog
        subcontractorId={subId}
        open={showUploadDoc}
        onClose={() => setShowUploadDoc(false)}
        onUploaded={() => refetch()}
      />
      <CreateContractDialog
        subcontractorId={subId}
        open={showCreateContract}
        onClose={() => setShowCreateContract(false)}
        onCreated={() => refetch()}
      />
      <SendMessageDialog
        subcontractorId={subId}
        open={showSendMessage}
        onClose={() => setShowSendMessage(false)}
        onSent={() => refetch()}
      />
      <ScorecardDialog
        subcontractorId={subId}
        current={scorecard ?? null}
        open={showScorecard}
        onClose={() => setShowScorecard(false)}
        onUpdated={() => { refetch(); refetchScorecard(); }}
      />

      {/* Send Award Dialog */}
      <Dialog open={showSendAward} onOpenChange={v => !v && setShowSendAward(false)}>
        <DialogContent className="max-w-lg" style={{ background: "var(--kp-charcoal-dark)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "var(--kp-cream)" }} className="flex items-center gap-2">
              <Trophy className="h-5 w-5" style={{ color: "var(--kp-gold)" }} />
              Send Award Contract
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label style={{ color: "var(--kp-muted)" }}>Payment Terms *</Label>
              <Textarea
                placeholder="e.g. 30% deposit upon signing, 40% at rough-in, 30% upon completion"
                value={awardForm.paymentTerms}
                onChange={e => setAwardForm(f => ({ ...f, paymentTerms: e.target.value }))}
                className="mt-1 min-h-[80px]"
                style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)", color: "var(--kp-cream)" }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label style={{ color: "var(--kp-muted)" }}>Deposit %</Label>
                <Input
                  type="number" min="0" max="100"
                  value={awardForm.depositPercent}
                  onChange={e => setAwardForm(f => ({ ...f, depositPercent: e.target.value }))}
                  className="mt-1"
                  style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)", color: "var(--kp-cream)" }}
                />
              </div>
              <div />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label style={{ color: "var(--kp-muted)" }}>Start Date</Label>
                <Input
                  type="date"
                  value={awardForm.startDate}
                  onChange={e => setAwardForm(f => ({ ...f, startDate: e.target.value }))}
                  className="mt-1"
                  style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)", color: "var(--kp-cream)" }}
                />
              </div>
              <div>
                <Label style={{ color: "var(--kp-muted)" }}>End Date</Label>
                <Input
                  type="date"
                  value={awardForm.endDate}
                  onChange={e => setAwardForm(f => ({ ...f, endDate: e.target.value }))}
                  className="mt-1"
                  style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)", color: "var(--kp-cream)" }}
                />
              </div>
            </div>
            <div>
              <Label style={{ color: "var(--kp-muted)" }}>Additional Notes</Label>
              <Textarea
                placeholder="Any additional notes for the subcontractor..."
                value={awardForm.notes}
                onChange={e => setAwardForm(f => ({ ...f, notes: e.target.value }))}
                className="mt-1"
                style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)", color: "var(--kp-cream)" }}
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={awardForm.sendEmail}
                  onChange={e => setAwardForm(f => ({ ...f, sendEmail: e.target.checked }))}
                  className="rounded" />
                <span className="text-sm" style={{ color: "var(--kp-muted)" }}>Send email</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={awardForm.sendSmsNotification}
                  onChange={e => setAwardForm(f => ({ ...f, sendSmsNotification: e.target.checked }))}
                  className="rounded" />
                <span className="text-sm" style={{ color: "var(--kp-muted)" }}>Send SMS</span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendAward(false)}
              style={{ borderColor: "rgba(255,255,255,0.15)", color: "var(--kp-cream)" }}>
              Cancel
            </Button>
            <Button
              className="btn-gold gap-2"
              disabled={!awardForm.paymentTerms.trim() || sendAwardMutation.isPending}
              onClick={() => {
                if (!selectedAwardId) return;
                sendAwardMutation.mutate({
                  awardCandidateId: selectedAwardId,
                  paymentTerms: awardForm.paymentTerms,
                  depositPercent: parseFloat(awardForm.depositPercent) || 30,
                  startDate: awardForm.startDate || undefined,
                  endDate: awardForm.endDate || undefined,
                  notes: awardForm.notes || undefined,
                  sendEmail: awardForm.sendEmail,
                  sendSmsNotification: awardForm.sendSmsNotification,
                  origin: window.location.origin,
                });
              }}
            >
              {sendAwardMutation.isPending ? <><span className="h-4 w-4 rounded-full border-2 border-t-transparent animate-spin" /> Sending...</> : <><Send className="h-4 w-4" /> Send Award</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
