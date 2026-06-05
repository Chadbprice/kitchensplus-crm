'use client';
import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft, Star, Shield, FileText, Send, Award, TrendingUp,
  CheckCircle, AlertCircle, Clock, XCircle, Bot, Zap, DollarSign
} from "lucide-react";

const GOLD = "#BF9A3B";

const TIER_CONFIG = {
  elite: { label: "Elite", color: "#c9a96e", bg: "rgba(201,169,110,0.15)", icon: "⭐" },
  preferred: { label: "Preferred", color: "#4CAF7D", bg: "rgba(76,175,125,0.15)", icon: "✓" },
  standard: { label: "Standard", color: "#888", bg: "rgba(136,136,136,0.12)", icon: "•" },
  do_not_use: { label: "Do Not Use", color: "#e74c3c", bg: "rgba(231,76,60,0.15)", icon: "✗" },
};

const DOC_TYPE_LABELS: Record<string, string> = {
  insurance: "General Liability Insurance",
  license: "Contractor License",
  w9: "W-9 Form",
  coi: "Certificate of Insurance",
  workers_comp: "Workers' Compensation",
  other: "Other Document",
};

function ScoreBar({ value, max = 10, color }: { value: number | null; max?: number; color: string }) {
  const pct = value != null ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full bg-border/40 rounded-full h-2 overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function TierBadge({ tier }: { tier: string | null }) {
  const cfg = TIER_CONFIG[(tier ?? "standard") as keyof typeof TIER_CONFIG] ?? TIER_CONFIG.standard;
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ color: cfg.color, background: cfg.bg }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

export default function VendorDetail() {
  const [, params] = useRoute("/vendors/:id");
  const [, navigate] = useLocation();
  const vendorId = params?.id ? parseInt(params.id) : null;

  const [showScorecard, setShowScorecard] = useState(false);
  const [scoreForm, setScoreForm] = useState({ onTimePercentage: "", qualityScore: "", responsivenessScore: "" });
  const [showRFQ, setShowRFQ] = useState(false);
  const [rfqForm, setRfqForm] = useState({ title: "", description: "", projectId: "" });
  const [showMagicLink, setShowMagicLink] = useState(false);
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [magicLinkPhone, setMagicLinkPhone] = useState("");
  const [aiRecResult, setAIRecResult] = useState<string | null>(null);
  const [aiRecLoading, setAIRecLoading] = useState(false);

  const utils = trpc.useUtils();

  // ── Data queries ────────────────────────────────────────────────────────────
  const { data: vendor, isLoading } = trpc.vms.scorecard.get.useQuery(
    { vendorId: vendorId! },
    { enabled: !!vendorId }
  );
  const { data: complianceDash } = trpc.vms.compliance.dashboard.useQuery(undefined, { enabled: !!vendorId });
  const { data: rfqs } = trpc.vms.rfq.list.useQuery(
    { vendorId: vendorId! },
    { enabled: !!vendorId }
  );
  const { data: projects = [] } = trpc.projects.list.useQuery({});

  // ── Mutations ────────────────────────────────────────────────────────────────
  const updateScorecard = trpc.vms.scorecard.update.useMutation({
    onSuccess: () => {
      toast.success("Scorecard updated");
      utils.vms.scorecard.get.invalidate({ vendorId: vendorId! });
      setShowScorecard(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const approveDoc = trpc.vms.compliance.approveDoc.useMutation({
    onSuccess: () => { toast.success("Document approved"); utils.vms.compliance.dashboard.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const rejectDoc = trpc.vms.compliance.rejectDoc.useMutation({
    onSuccess: () => { toast.success("Document rejected"); utils.vms.compliance.dashboard.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const sendMagicLink = trpc.vms.vendorPortal.sendMagicLink.useMutation({
    onSuccess: () => { toast.success("Portal access link sent!"); setShowMagicLink(false); },
    onError: (e) => toast.error(e.message),
  });

  const createRFQ = trpc.vms.rfq.create.useMutation({
    onSuccess: async (data) => {
      // After creating, send invitations to this vendor
      await sendRFQInvite.mutateAsync({
        rfqId: data.id,
        vendorIds: [vendorId!],
        origin: window.location.origin,
      });
      toast.success("RFQ created and sent");
      utils.vms.rfq.list.invalidate();
      setShowRFQ(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const sendRFQInvite = trpc.vms.rfq.send.useMutation({
    onError: (e) => toast.error(e.message),
  });

  const awardRFQ = trpc.vms.rfq.award.useMutation({
    onSuccess: () => { toast.success("RFQ awarded! PO created."); utils.vms.rfq.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const recommendVendor = trpc.vms.scorecard.recommend.useMutation({
    onMutate: () => setAIRecLoading(true),
    onSuccess: (data) => {
      setAIRecResult(typeof data.recommendation === "object" && data.recommendation
        ? `${data.recommendation.companyName}\n\n${data.reasoning}`
        : data.reasoning);
      setAIRecLoading(false);
    },
    onError: (e) => { toast.error(e.message); setAIRecLoading(false); },
  });

  if (!vendorId) return <div className="p-8 text-muted-foreground">Vendor not found.</div>;
  if (isLoading) return (
    <div className="p-8 flex items-center gap-3 text-muted-foreground">
      <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      Loading vendor…
    </div>
  );
  if (!vendor) return <div className="p-8 text-muted-foreground">Vendor not found.</div>;

  const v = vendor;
  const score = v.performanceScore != null ? parseFloat(String(v.performanceScore)) : null;

  // Filter compliance docs to this vendor only
  const vendorComplianceDocs = complianceDash ? {
    pending: complianceDash.pending?.filter((d: any) => d.vendorId === vendorId) ?? [],
    expiringSoon: complianceDash.expiringSoon?.filter((d: any) => d.vendorId === vendorId) ?? [],
    expired: complianceDash.expired?.filter((d: any) => d.vendorId === vendorId) ?? [],
  } : null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate("/vendors")} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-serif text-foreground">{v.companyName}</h1>
            <TierBadge tier={v.tier} />
          </div>
          {v.lastScorecardAt && (
            <p className="text-xs text-muted-foreground mt-1">Last scored: {new Date(v.lastScorecardAt).toLocaleDateString()}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowMagicLink(true)} className="gap-1.5">
            <Send className="h-3.5 w-3.5" /> Portal Access
          </Button>
          <Button size="sm" onClick={() => setShowScorecard(true)} className="gap-1.5" style={{ background: GOLD, color: "#1a1a1a" }}>
            <Star className="h-3.5 w-3.5" /> Update Scorecard
          </Button>
        </div>
      </div>

      {/* Score Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Overall Score", value: score != null ? score.toFixed(1) : "—", suffix: "/10", color: GOLD, icon: Award },
          { label: "On-Time %", value: v.onTimePercentage != null ? `${parseFloat(String(v.onTimePercentage)).toFixed(0)}%` : "—", suffix: "", color: "#4CAF7D", icon: TrendingUp },
          { label: "Quality", value: v.qualityScore != null ? parseFloat(String(v.qualityScore)).toFixed(1) : "—", suffix: "/10", color: "#6C9BD2", icon: CheckCircle },
          { label: "Responsiveness", value: v.responsivenessScore != null ? parseFloat(String(v.responsivenessScore)).toFixed(1) : "—", suffix: "/10", color: "#B07FD4", icon: Zap },
        ].map(({ label, value, suffix, color, icon: Icon }) => (
          <Card key={label} className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{label}</span>
                <Icon className="h-4 w-4" style={{ color }} />
              </div>
              <div className="text-2xl font-bold" style={{ color }}>
                {value}<span className="text-sm font-normal text-muted-foreground">{suffix}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Score Bars */}
      {(v.onTimePercentage != null || v.qualityScore != null || v.responsivenessScore != null) && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Performance Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: "On-Time Delivery", value: v.onTimePercentage != null ? parseFloat(String(v.onTimePercentage)) / 10 : null, max: 10, color: "#4CAF7D" },
              { label: "Quality of Work", value: v.qualityScore != null ? parseFloat(String(v.qualityScore)) : null, max: 10, color: "#6C9BD2" },
              { label: "Responsiveness", value: v.responsivenessScore != null ? parseFloat(String(v.responsivenessScore)) : null, max: 10, color: "#B07FD4" },
            ].map(({ label, value, max, color }) => (
              <div key={label}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium" style={{ color }}>{value != null ? value.toFixed(1) : "Not rated"}</span>
                </div>
                <ScoreBar value={value} max={max} color={color} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="compliance">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="compliance" className="gap-1.5"><Shield className="h-3.5 w-3.5" /> Compliance</TabsTrigger>
          <TabsTrigger value="rfq" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> RFQs</TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5"><Bot className="h-3.5 w-3.5" /> AI Insights</TabsTrigger>
        </TabsList>

        {/* Compliance Tab */}
        <TabsContent value="compliance" className="mt-4 space-y-4">
          {vendorComplianceDocs ? (
            <>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Expiring Soon", value: vendorComplianceDocs.expiringSoon.length, color: "#e67e22" },
                  { label: "Expired", value: vendorComplianceDocs.expired.length, color: "#e74c3c" },
                  { label: "Pending Review", value: vendorComplianceDocs.pending.length, color: "#6C9BD2" },
                ].map(({ label, value, color }) => (
                  <Card key={label} className="bg-card border-border">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
                      <div className="text-xs text-muted-foreground mt-1">{label}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {vendorComplianceDocs.pending.length > 0 && (
                <Card className="bg-card border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Pending Review</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {vendorComplianceDocs.pending.map((doc: any) => (
                      <div key={doc.id} className="flex items-center justify-between p-3 bg-background rounded border border-border/50">
                        <div>
                          <p className="text-sm font-medium text-foreground">{DOC_TYPE_LABELS[doc.docType] ?? doc.docType}</p>
                          <p className="text-xs text-muted-foreground">{doc.vendorName} · Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {doc.fileUrl && (
                            <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                                <FileText className="h-3 w-3" /> View
                              </Button>
                            </a>
                          )}
                          <Button size="sm" className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => approveDoc.mutate({ docId: doc.id })}>
                            <CheckCircle className="h-3 w-3" /> Approve
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-red-500/50 text-red-400 hover:bg-red-500/10"
                            onClick={() => rejectDoc.mutate({ docId: doc.id })}>
                            <XCircle className="h-3 w-3" /> Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {vendorComplianceDocs.expiringSoon.length > 0 && (
                <Card className="bg-card border-amber-500/20 border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" /> Expiring Soon
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {vendorComplianceDocs.expiringSoon.map((doc: any) => {
                      const daysLeft = doc.expiryDate
                        ? Math.ceil((new Date(doc.expiryDate).getTime() - Date.now()) / 86400000)
                        : null;
                      return (
                        <div key={doc.id} className="flex items-center justify-between p-3 bg-background rounded border border-amber-500/20">
                          <div>
                            <p className="text-sm font-medium text-foreground">{DOC_TYPE_LABELS[doc.docType] ?? doc.docType}</p>
                            <p className="text-xs text-muted-foreground">{doc.vendorName}</p>
                          </div>
                          <span className="text-xs font-semibold text-amber-400">
                            {daysLeft != null ? `${daysLeft}d left` : "—"}
                          </span>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}

              {vendorComplianceDocs.pending.length === 0 && vendorComplianceDocs.expiringSoon.length === 0 && vendorComplianceDocs.expired.length === 0 && (
                <Card className="bg-card border-border">
                  <CardContent className="py-10 text-center text-muted-foreground">
                    <CheckCircle className="h-8 w-8 mx-auto mb-3 opacity-40" style={{ color: "#4CAF7D" }} />
                    <p className="text-sm">No compliance issues for this vendor.</p>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="py-12 text-center text-muted-foreground text-sm">Loading compliance data…</div>
          )}
        </TabsContent>

        {/* RFQ Tab */}
        <TabsContent value="rfq" className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Request for Quotes</h3>
            <Button size="sm" onClick={() => setShowRFQ(true)} className="gap-1.5 text-xs" style={{ background: GOLD, color: "#1a1a1a" }}>
              <FileText className="h-3.5 w-3.5" /> New RFQ
            </Button>
          </div>
          {rfqs && rfqs.length > 0 ? (
            <div className="space-y-3">
              {rfqs.map((rfq: any) => (
                <Card key={rfq.id} className="bg-card border-border">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-foreground text-sm">{rfq.title}</h4>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            rfq.status === "awarded" ? "bg-emerald-500/20 text-emerald-400" :
                            rfq.status === "sent" ? "bg-blue-500/20 text-blue-400" :
                            rfq.status === "closed" ? "bg-gray-500/20 text-gray-400" :
                            "bg-accent/50 text-muted-foreground"
                          }`}>{rfq.status}</span>
                        </div>
                        {rfq.scopeOfWork && <p className="text-xs text-muted-foreground line-clamp-2">{rfq.scopeOfWork}</p>}
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date(rfq.createdAt).toLocaleDateString()}</span>
                          {rfq.quotedCount > 0 && <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> {rfq.quotedCount} bid{rfq.quotedCount !== 1 ? "s" : ""}</span>}
                        </div>
                      </div>
                      {rfq.status === "sent" && (
                        <Button size="sm" className="text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => awardRFQ.mutate({ rfqId: rfq.id, vendorId: vendorId!, origin: window.location.origin })}>
                          <Award className="h-3 w-3" /> Award
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="bg-card border-border">
              <CardContent className="py-12 text-center text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No RFQs yet. Create one to request a quote from this vendor.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* AI Insights Tab */}
        <TabsContent value="ai" className="mt-4 space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Bot className="h-4 w-4" style={{ color: GOLD }} /> AI Vendor Recommendation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Ask the AI to evaluate this vendor for a specific trade or project type based on their scorecard and history.
              </p>
              <Button
                onClick={() => recommendVendor.mutate({ trade: v.trade ?? "general", projectDescription: v.notes ?? undefined })}
                disabled={aiRecLoading}
                className="gap-2"
                style={{ background: GOLD, color: "#1a1a1a" }}
              >
                {aiRecLoading ? (
                  <><div className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" /> Analyzing…</>
                ) : (
                  <><Bot className="h-4 w-4" /> Generate AI Recommendation</>
                )}
              </Button>
              {aiRecResult && (
                <div className="p-4 bg-background rounded border border-border/50 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {aiRecResult}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Update Scorecard Dialog */}
      <Dialog open={showScorecard} onOpenChange={setShowScorecard}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Update Scorecard — {v.companyName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-muted-foreground">On-Time Delivery %</Label>
              <Input type="number" min="0" max="100" placeholder="e.g. 92"
                value={scoreForm.onTimePercentage}
                onChange={e => setScoreForm(f => ({ ...f, onTimePercentage: e.target.value }))}
                className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Quality of Work (0–10)</Label>
              <Input type="number" min="0" max="10" step="0.1" placeholder="e.g. 8.5"
                value={scoreForm.qualityScore}
                onChange={e => setScoreForm(f => ({ ...f, qualityScore: e.target.value }))}
                className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Responsiveness (0–10)</Label>
              <Input type="number" min="0" max="10" step="0.1" placeholder="e.g. 9.0"
                value={scoreForm.responsivenessScore}
                onChange={e => setScoreForm(f => ({ ...f, responsivenessScore: e.target.value }))}
                className="mt-1" />
            </div>
            <p className="text-xs text-muted-foreground">The composite score and tier badge are calculated automatically.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScorecard(false)}>Cancel</Button>
            <Button style={{ background: GOLD, color: "#1a1a1a" }} disabled={updateScorecard.isPending}
              onClick={() => updateScorecard.mutate({
                vendorId: vendorId!,
                ...(scoreForm.onTimePercentage ? { onTimePercentage: parseFloat(scoreForm.onTimePercentage) } : {}),
                ...(scoreForm.qualityScore ? { qualityScore: parseFloat(scoreForm.qualityScore) } : {}),
                ...(scoreForm.responsivenessScore ? { responsivenessScore: parseFloat(scoreForm.responsivenessScore) } : {}),
              })}>
              {updateScorecard.isPending ? "Saving…" : "Save Scorecard"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Portal Access Dialog */}
      <Dialog open={showMagicLink} onOpenChange={setShowMagicLink}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Send Vendor Portal Access</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Send a magic link so the vendor can upload compliance docs, view POs, and submit quotes — no password needed.</p>
            <div>
              <Label className="text-xs text-muted-foreground">Email Address</Label>
              <Input placeholder="vendor@example.com" value={magicLinkEmail} onChange={e => setMagicLinkEmail(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Phone (optional — for SMS link)</Label>
              <Input placeholder="+1 864 555 0100" value={magicLinkPhone} onChange={e => setMagicLinkPhone(e.target.value)} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMagicLink(false)}>Cancel</Button>
            <Button style={{ background: GOLD, color: "#1a1a1a" }} disabled={sendMagicLink.isPending || !magicLinkEmail}
              onClick={() => sendMagicLink.mutate({ vendorId: vendorId!, email: magicLinkEmail, phone: magicLinkPhone || undefined, origin: window.location.origin })}>
              {sendMagicLink.isPending ? "Sending…" : "Send Access Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New RFQ Dialog */}
      <Dialog open={showRFQ} onOpenChange={setShowRFQ}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">New Request for Quote</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-muted-foreground">Title *</Label>
              <Input placeholder="e.g. Kitchen Tile Installation" value={rfqForm.title} onChange={e => setRfqForm(f => ({ ...f, title: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Scope of Work</Label>
              <Textarea placeholder="Materials, specifications, scope details…" value={rfqForm.description} onChange={e => setRfqForm(f => ({ ...f, description: e.target.value }))} className="mt-1 min-h-[80px]" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Link to Project (optional)</Label>
              <Select value={rfqForm.projectId} onValueChange={v => setRfqForm(f => ({ ...f, projectId: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a project…" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRFQ(false)}>Cancel</Button>
            <Button style={{ background: GOLD, color: "#1a1a1a" }} disabled={createRFQ.isPending || sendRFQInvite.isPending || !rfqForm.title}
              onClick={() => createRFQ.mutate({
                title: rfqForm.title,
                scopeOfWork: rfqForm.description || undefined,
                projectId: rfqForm.projectId ? parseInt(rfqForm.projectId) : undefined,
                vendorIds: [vendorId!],
              })}>
              {(createRFQ.isPending || sendRFQInvite.isPending) ? "Creating…" : "Create & Send RFQ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
