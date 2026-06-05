import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  CheckCircle2, MessageSquare, Phone, Loader2, DollarSign,
  FileText, ChevronRight, Upload, X, AlertCircle, ExternalLink,
  PenLine, RotateCcw, Download
} from "lucide-react";
import { format } from "date-fns";
import { useParams } from "wouter";

const GOLD = "#BF9A3B";
const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663481717136/NJbAuvnBiksaabdpS5d8M3/kitchensplus_logo_0e432498.webp";

type ViewState = "review" | "signing" | "approved" | "discussion_form" | "discussion_sent";

// ─── Legal disclaimer text (ESIGN Act / UETA compliant) ──────────────────────
const LEGAL_DISCLAIMER = `ELECTRONIC SIGNATURE CONSENT & AGREEMENT

By signing below, you ("Client") agree to the following:

1. INTENT TO SIGN. Your electronic signature constitutes your legal signature and is as valid and enforceable as a handwritten signature under the Electronic Signatures in Global and National Commerce Act (E-SIGN Act, 15 U.S.C. § 7001 et seq.) and the Uniform Electronic Transactions Act (UETA).

2. ACCEPTANCE OF PROPOSAL. You authorize Kitchens Plus Upstate LLC ("Contractor") to proceed with the scope of work described in this proposal at the stated price. You acknowledge that you have read, understand, and agree to all terms, specifications, and pricing contained herein.

3. DEPOSIT OBLIGATION. You agree that the deposit amount shown on this proposal is due and payable upon acceptance to schedule your project. Work will not commence until the deposit is received.

4. CHANGE ORDERS. Any changes to the scope of work after acceptance must be agreed upon in writing via a signed change order and may affect the total price and schedule.

5. RECORD RETENTION. A copy of this signed proposal will be emailed to you for your records. You consent to receiving contract documents electronically.

6. WITHDRAWAL OF CONSENT. You may withdraw your consent to electronic signatures at any time by contacting Kitchens Plus Upstate at chad@kitchensplusupstate.com or (864) 567-8777, though withdrawal will not affect the validity of signatures already provided.`;

export default function ClientProposalView() {
  const params = useParams<{ id: string }>();
  const proposalId = parseInt(params.id ?? "0");

  const [viewState, setViewState] = useState<ViewState>("review");
  const [discussionText, setDiscussionText] = useState("");
  const [discussionFiles, setDiscussionFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Signature state
  const [signerName, setSignerName] = useState("");
  const [hasDrawn, setHasDrawn] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signedPdfUrl, setSignedPdfUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const { data: proposal, isLoading } = trpc.estimates.get.useQuery(
    { id: proposalId },
    { enabled: !!proposalId }
  );

  const approveProposal = trpc.estimates.approveFromPortal.useMutation({
    onSuccess: (data: any) => {
      if (data?.signedPdfUrl) setSignedPdfUrl(data.signedPdfUrl);
      setViewState("approved");
    },
    onError: (err) => toast.error("Approval failed: " + err.message),
  });

  const { data: clientSession } = trpc.clientPortal.me.useQuery();

  const requestDiscussion = trpc.estimates.requestDiscussion.useMutation({
    onSuccess: () => {
      setViewState("discussion_sent");
      setIsSubmitting(false);
    },
    onError: (err) => {
      setIsSubmitting(false);
      toast.error("Failed to send: " + err.message);
    },
  });

  const lineItems = (proposal as any)?.lineItems ?? [];
  const total = parseFloat(String(proposal?.total ?? 0));
  const deposit = parseFloat(String(proposal?.depositAmount ?? 0));
  const depositPercent = parseFloat(String(proposal?.depositPercent ?? 50));
  const hidePrices = !!(proposal as any)?.hidePrices;
  // Fetch client-visible attachments (public endpoint, no auth required)
  const { data: clientAttachments = [] } = trpc.proposalAttachments.listClientVisible.useQuery(
    { estimateId: proposalId },
    { enabled: !!proposalId }
  );
  // Group: per-line-item vs proposal-level
  const attachmentsByLineItem = (clientAttachments as any[]).reduce((acc: Record<number, any[]>, a: any) => {
    if (a.lineItemId) { acc[a.lineItemId] = [...(acc[a.lineItemId] ?? []), a]; }
    return acc;
  }, {} as Record<number, any[]>);
  const proposalLevelAttachments = (clientAttachments as any[]).filter((a: any) => !a.lineItemId);

  // ─── Canvas drawing helpers ───────────────────────────────────────────────
  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY };
  };

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsDrawing(true);
    lastPos.current = getPos(e, canvas);
  }, []);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e, canvas);
    if (lastPos.current) {
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = "#1A1B17";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      setHasDrawn(true);
    }
    lastPos.current = pos;
  }, [isDrawing]);

  const endDraw = useCallback(() => {
    setIsDrawing(false);
    lastPos.current = null;
  }, []);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  // Initialize canvas background
  useEffect(() => {
    if (viewState === "signing") {
      setTimeout(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }, 50);
    }
  }, [viewState]);

  async function handleSign() {
    if (!signerName.trim()) {
      toast.error("Please type your full name to confirm your identity");
      return;
    }
    if (!hasDrawn) {
      toast.error("Please draw your signature in the box above");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const signatureDataUrl = canvas.toDataURL("image/png");

    approveProposal.mutate({
      id: proposalId,
      signatureDataUrl,
      signerName: signerName.trim(),
    } as any);
  }

  async function handleDiscussionSubmit() {
    if (!discussionText.trim()) {
      toast.error("Please describe your questions or concerns");
      return;
    }
    setIsSubmitting(true);
    let attachmentUrls: string[] = [];
    if (discussionFiles.length > 0) {
      try {
        for (const file of discussionFiles) {
          const formData = new FormData();
          formData.append("file", file);
          const res = await fetch("/api/upload", { method: "POST", body: formData });
          if (res.ok) {
            const { url } = await res.json();
            attachmentUrls.push(url);
          }
        }
      } catch {
        // Non-blocking
      }
    }
    await requestDiscussion.mutateAsync({
      id: proposalId,
      message: discussionText,
      clientName: clientSession?.name ?? undefined,
      attachmentUrls,
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setDiscussionFiles(prev => [...prev, ...files].slice(0, 5));
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#1A1B17" }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#1A1B17" }}>
        <div className="text-center space-y-3">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground" />
          <p className="text-lg font-serif text-foreground">Proposal not found</p>
          <p className="text-sm text-muted-foreground">This link may have expired or the proposal was removed.</p>
        </div>
      </div>
    );
  }

  // ─── Approved State ───────────────────────────────────────────────────────
  if (viewState === "approved" || (proposal.status as string) === "approved") {
    const alreadySignedAt = (proposal as any).signedAt;
    const displayPdfUrl = signedPdfUrl || (proposal as any).signedPdfUrl;
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#1A1B17" }}>
        <div className="max-w-md w-full text-center space-y-6">
          <img src={LOGO_URL} alt="Kitchens Plus Upstate" className="h-14 mx-auto object-contain" />
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto" style={{ background: "#4CAF7D20", border: "2px solid #4CAF7D" }}>
            <CheckCircle2 className="h-10 w-10" style={{ color: "#4CAF7D" }} />
          </div>
          <div>
            <h1 className="text-2xl font-serif mb-2" style={{ color: "var(--kp-cream, #F5EDE7)" }}>Proposal Approved!</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Thank you for signing your proposal. Chad will be in touch shortly to confirm next steps and collect your deposit of{" "}
              <strong style={{ color: GOLD }}>${deposit.toFixed(2)}</strong>.
            </p>
            {alreadySignedAt && (
              <p className="text-xs text-muted-foreground mt-2">
                Signed on {format(new Date(alreadySignedAt), "MMMM d, yyyy 'at' h:mm a")}
              </p>
            )}
          </div>

          {displayPdfUrl && (
            <a href={displayPdfUrl} target="_blank" rel="noreferrer">
              <Button className="w-full" variant="outline" size="lg"
                style={{ borderColor: GOLD, color: GOLD }}>
                <Download className="h-4 w-4 mr-2" />
                Download Signed Proposal
              </Button>
            </a>
          )}

          <div className="p-4 rounded-xl border border-border/60 text-left space-y-2" style={{ background: "#2E2F2A" }}>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Here's what happens next</p>
            {[
              "A copy of your signed proposal has been emailed to you",
              "Chad will call or text you within 1 business day",
              `Your ${depositPercent}% deposit invoice will be sent via Square`,
              "We'll schedule your project start date together",
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm text-foreground/80">
                <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold"
                  style={{ background: `${GOLD}20`, color: GOLD }}>
                  {i + 1}
                </div>
                {step}
              </div>
            ))}
          </div>
          {/* Check Payment Notice */}
          <div className="p-4 rounded-xl text-left" style={{
            background: "#1E1F1A",
            border: `1px solid ${GOLD}55`,
          }}>
            <div className="flex items-start gap-3">
              <div className="shrink-0 mt-0.5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2"/>
                  <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                  <line x1="12" y1="12" x2="12" y2="16"/>
                  <line x1="10" y1="14" x2="14" y2="14"/>
                </svg>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Paying by Check?</p>
                <p className="text-sm leading-relaxed" style={{ color: "var(--kp-cream, #F5EDE7)", opacity: 0.85 }}>
                  If you are remitting payment by check, please make all checks payable to{" "}
                  <strong style={{ color: GOLD }}>CP Enterprises SC</strong>, the parent company of Kitchens Plus Upstate Renovations &amp; Design.
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Please include your proposal number in the memo line and deliver or mail your check to the address provided by your project coordinator.
                </p>
              </div>
            </div>
          </div>

          <a href="tel:8645678777">
            <Button className="w-full btn-gold" size="lg">
              <Phone className="h-4 w-4 mr-2" /> Call Chad: (864) 567-8777
            </Button>
          </a>
        </div>
      </div>
    );
  }

  // ─── E-Signature Modal State ──────────────────────────────────────────────
  if (viewState === "signing") {
    return (
      <div className="min-h-screen p-4 md:p-8" style={{ background: "#1A1B17" }}>
        <div className="max-w-xl mx-auto space-y-5">
          {/* Header */}
          <div className="flex items-center gap-3">
            <button onClick={() => setViewState("review")}
              className="p-2 rounded-lg hover:bg-accent/30 transition-colors text-muted-foreground">
              <ChevronRight className="h-4 w-4 rotate-180" />
            </button>
            <img src={LOGO_URL} alt="Kitchens Plus Upstate" className="h-10 object-contain" />
          </div>

          <div>
            <h1 className="text-2xl font-serif mb-1" style={{ color: "var(--kp-cream, #F5EDE7)" }}>
              Sign &amp; Approve Proposal
            </h1>
            <p className="text-sm text-muted-foreground">
              {proposal.title} · {proposal.estimateNumber}
            </p>
          </div>

          {/* Proposal summary */}
          <div className="p-4 rounded-xl border flex items-center justify-between"
            style={{ background: `${GOLD}10`, borderColor: `${GOLD}30` }}>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Total Investment</p>
              <p className="text-xl font-serif" style={{ color: GOLD }}>${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Deposit Due</p>
              <p className="text-lg font-semibold" style={{ color: "var(--kp-cream, #F5EDE7)" }}>${deposit.toFixed(2)}</p>
            </div>
          </div>

          {/* Legal disclaimer */}
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Electronic Signature Agreement</p>
              <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto rounded-lg p-3 border border-border/40"
                style={{ background: "#1A1B17", fontFamily: "monospace", fontSize: "10.5px" }}>
                {LEGAL_DISCLAIMER}
              </div>
            </CardContent>
          </Card>

          {/* Typed name confirmation */}
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-3">
              <label className="text-xs text-muted-foreground uppercase tracking-wider block">
                Type Your Full Legal Name to Confirm Identity *
              </label>
              <Input
                placeholder="e.g. John A. Smith"
                value={signerName}
                onChange={e => setSignerName(e.target.value)}
                className="bg-background border-border text-foreground"
              />
              <p className="text-xs text-muted-foreground">
                This confirms that you are the authorized party approving this proposal.
              </p>
            </CardContent>
          </Card>

          {/* Signature canvas */}
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Draw Your Signature *
                </label>
                <button onClick={clearCanvas}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <RotateCcw className="h-3 w-3" />
                  Clear
                </button>
              </div>
              <div className="rounded-lg border-2 overflow-hidden select-none"
                style={{ borderColor: hasDrawn ? GOLD : "#444", background: "#fff" }}>
                <canvas
                  ref={canvasRef}
                  width={560}
                  height={160}
                  className="w-full touch-none cursor-crosshair"
                  style={{ display: "block" }}
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={endDraw}
                  onMouseLeave={endDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={endDraw}
                />
              </div>
              {!hasDrawn && (
                <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
                  <PenLine className="h-3 w-3" />
                  Sign in the box above using your mouse or finger
                </p>
              )}
            </CardContent>
          </Card>

          {/* Submit */}
          <Button
            className="w-full btn-gold"
            size="lg"
            onClick={handleSign}
            disabled={approveProposal.isPending || !signerName.trim() || !hasDrawn}
          >
            {approveProposal.isPending
              ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" />Processing…</>
              : <><CheckCircle2 className="h-5 w-5 mr-2" />Sign &amp; Approve Proposal</>}
          </Button>

          <p className="text-center text-xs text-muted-foreground pb-2">
            By clicking "Sign &amp; Approve Proposal" you confirm you have read and agree to the Electronic Signature Agreement above.
          </p>
        </div>
      </div>
    );
  }

  // ─── Discussion Sent State ────────────────────────────────────────────────
  if (viewState === "discussion_sent") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#1A1B17" }}>
        <div className="max-w-md w-full text-center space-y-6">
          <img src={LOGO_URL} alt="Kitchens Plus Upstate" className="h-14 mx-auto object-contain" />
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
            style={{ background: `${GOLD}20`, border: `2px solid ${GOLD}` }}>
            <MessageSquare className="h-10 w-10" style={{ color: GOLD }} />
          </div>
          <div>
            <h1 className="text-2xl font-serif mb-2" style={{ color: "var(--kp-cream, #F5EDE7)" }}>Message Received!</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              We've received your message and will be in touch within one business day.
            </p>
          </div>
          <a href="tel:8645678777">
            <Button className="w-full btn-gold" size="lg">
              <Phone className="h-4 w-4 mr-2" /> Call or Text Chad: (864) 567-8777
            </Button>
          </a>
        </div>
      </div>
    );
  }

  // ─── Discussion Form State ────────────────────────────────────────────────
  if (viewState === "discussion_form") {
    return (
      <div className="min-h-screen p-4 md:p-8" style={{ background: "#1A1B17" }}>
        <div className="max-w-xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setViewState("review")}
              className="p-2 rounded-lg hover:bg-accent/30 transition-colors text-muted-foreground">
              <ChevronRight className="h-4 w-4 rotate-180" />
            </button>
            <img src={LOGO_URL} alt="Kitchens Plus Upstate" className="h-10 object-contain" />
          </div>

          <div>
            <h1 className="text-2xl font-serif mb-1" style={{ color: "var(--kp-cream, #F5EDE7)" }}>Have Questions?</h1>
            <p className="text-sm text-muted-foreground">Share your questions or thoughts and we'll get back to you within one business day.</p>
          </div>

          <Card className="bg-card border-border">
            <CardContent className="p-5 space-y-4">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
                  Your Questions or Concerns *
                </label>
                <Textarea
                  className="bg-background border-border resize-none min-h-[140px]"
                  placeholder="e.g. I'd like to discuss the cabinet options, or can we adjust the timeline for the backsplash work?"
                  value={discussionText}
                  onChange={e => setDiscussionText(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
                  Attach Photos or References (optional, up to 5)
                </label>
                <label className="flex items-center gap-2 p-3 rounded-lg border border-dashed border-border/60 cursor-pointer hover:border-primary/40 transition-colors">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Click to attach files</span>
                  <input type="file" className="hidden" multiple accept="image/*,.pdf" onChange={handleFileChange} />
                </label>
                {discussionFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {discussionFiles.map((file, i) => (
                      <div key={i} className="flex items-center justify-between text-xs text-muted-foreground bg-accent/20 rounded px-2 py-1">
                        <span className="truncate">{file.name}</span>
                        <button onClick={() => setDiscussionFiles(f => f.filter((_, idx) => idx !== i))}>
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button className="w-full btn-gold" size="lg" onClick={handleDiscussionSubmit} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MessageSquare className="h-4 w-4 mr-2" />}
                {isSubmitting ? "Sending…" : "Send to Chad"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ─── Main Proposal Review ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: "#1A1B17" }}>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <img src={LOGO_URL} alt="Kitchens Plus Upstate" className="h-14 mx-auto object-contain" />
          <p className="text-xs tracking-widest uppercase text-muted-foreground">Renovations &amp; Design</p>
        </div>

        {/* Proposal Card */}
        <Card className="bg-card border-border overflow-hidden">
          <div className="h-1.5 w-full" style={{ background: GOLD }} />
          <CardContent className="p-6 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-serif mb-1" style={{ color: "var(--kp-cream, #F5EDE7)" }}>{proposal.title}</h1>
                <p className="text-xs text-muted-foreground">{proposal.estimateNumber}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-2xl font-serif" style={{ color: GOLD }}>${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
                <p className="text-xs text-muted-foreground">Your Total</p>
              </div>
            </div>

            <div className="p-3 rounded-lg border flex items-center justify-between"
              style={{ background: `${GOLD}10`, borderColor: `${GOLD}30` }}>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" style={{ color: GOLD }} />
                <span className="text-sm font-medium" style={{ color: "var(--kp-cream, #F5EDE7)" }}>
                  Initial Deposit ({depositPercent}%)
                </span>
              </div>
              <span className="text-sm font-semibold" style={{ color: GOLD }}>${deposit.toFixed(2)}</span>
            </div>

            {lineItems.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">What's Included</p>
                <div className="space-y-2">
                  {lineItems.map((item: any, i: number) => {
                    const base = parseFloat(String(item.unitPrice ?? 0)) * parseFloat(String(item.quantity ?? 1));
                    const markup = item.showMarkup ? base * (parseFloat(String(item.markupPercent ?? 0)) / 100) : 0;
                    const lineTotal = base + markup;
                    const hasImage = !!item.imageUrl;
                    const hasLink = !!item.productUrl;
                    return (
                      <div key={i} className="py-3 border-b border-border/30 last:border-0">
                        <div className="flex items-start gap-3">
                          {hasImage && (
                            <div className="shrink-0">
                              {hasLink ? (
                                <a href={item.productUrl} target="_blank" rel="noreferrer"
                                  title={`View on ${item.productSource ?? "supplier site"}`}
                                  className="block rounded-lg overflow-hidden border border-border/40 hover:border-amber-400/60 transition-colors"
                                  style={{ width: 72, height: 72 }}>
                                  <img src={item.imageUrl} alt={item.task ?? "Product"}
                                    className="w-full h-full object-contain bg-white"
                                    onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }} />
                                </a>
                              ) : (
                                <div className="rounded-lg overflow-hidden border border-border/40" style={{ width: 72, height: 72 }}>
                                  <img src={item.imageUrl} alt={item.task ?? "Product"}
                                    className="w-full h-full object-contain bg-white"
                                    onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }} />
                                </div>
                              )}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">{item.task || item.description || "—"}</p>
                            {item.task && item.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                            )}
                            {item.quantity && parseFloat(String(item.quantity)) !== 1 && (
                              <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                            )}
                            {hasLink && (
                              <a href={item.productUrl} target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs mt-1 hover:underline"
                                style={{ color: GOLD }}>
                                <ExternalLink className="h-3 w-3" />
                                {item.productSource ? `View at ${item.productSource}` : "View product"}
                              </a>
                            )}
                            {/* Per-line-item reference photos */}
                            {attachmentsByLineItem[item.id] && attachmentsByLineItem[item.id].length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {attachmentsByLineItem[item.id].map((att: any) => (
                                  <a key={att.id} href={att.fileUrl} target="_blank" rel="noreferrer"
                                    className="block rounded-md overflow-hidden border border-border/40 hover:border-amber-400/60 transition-colors"
                                    style={{ width: 56, height: 56 }}>
                                    <img src={att.fileUrl} alt={att.fileName ?? "Photo"}
                                      className="w-full h-full object-cover"
                                      onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }} />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                          {!hidePrices && (
                            <p className="text-sm font-medium shrink-0" style={{ color: GOLD }}>
                              ${lineTotal.toFixed(2)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {!hidePrices && (
                  <div className="flex justify-between items-center pt-3 mt-1 border-t border-border/40">
                    <span className="text-sm font-semibold text-foreground">Total</span>
                    <span className="text-lg font-serif" style={{ color: GOLD }}>${total.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Proposal-level reference photos */}
            {proposalLevelAttachments.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Reference Images</p>
                <div className="grid grid-cols-3 gap-2">
                  {proposalLevelAttachments.map((att: any) => (
                    <a key={att.id} href={att.fileUrl} target="_blank" rel="noreferrer"
                      className="block rounded-lg overflow-hidden border border-border/40 hover:border-amber-400/60 transition-colors aspect-square">
                      <img src={att.fileUrl} alt={att.fileName ?? "Photo"}
                        className="w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }} />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {proposal.notes && (
              <div className="p-4 rounded-lg border-l-2 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap"
                style={{ borderColor: GOLD, background: `${GOLD}06` }}>
                {proposal.notes}
              </div>
            )}

            {proposal.validUntil && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Valid until {format(new Date(proposal.validUntil), "MMMM d, yyyy")}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        {proposal.status !== "approved" && (
          <div className="space-y-3">
            <Button
              className="w-full btn-gold"
              size="lg"
              onClick={() => setViewState("signing")}
            >
              <PenLine className="h-5 w-5 mr-2" />
              Review &amp; Sign
            </Button>

            <Button
              variant="outline"
              className="w-full border-border/60 text-foreground hover:bg-accent/30"
              size="lg"
              onClick={() => setViewState("discussion_form")}
            >
              <MessageSquare className="h-5 w-5 mr-2" />
              I Have Questions
            </Button>

            <div className="text-center pt-1">
              <a href="tel:8645678777" className="inline-flex items-center gap-1.5 text-sm transition-colors" style={{ color: GOLD }}>
                <Phone className="h-3.5 w-3.5" />
                Prefer to talk? Call Chad: (864) 567-8777
              </a>
            </div>
          </div>
        )}

        {(proposal.status as string) === "approved" && (
          <div className="flex items-center gap-2 p-4 rounded-xl border text-sm"
            style={{ background: "#4CAF7D10", borderColor: "#4CAF7D30", color: "#4CAF7D" }}>
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span>This proposal was approved on {(proposal as any).approvedAt ? format(new Date((proposal as any).approvedAt), "MMMM d, yyyy") : "—"}.</span>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground pb-4">
          Kitchens Plus Upstate · Upstate SC · (864) 567-8777
        </p>
      </div>
    </div>
  );
}
