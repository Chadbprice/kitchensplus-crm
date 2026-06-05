import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { CheckCircle, FileText, PenLine, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const GOLD = "#C9A84C";
const DARK = "#1A1B17";
const CHARCOAL = "#2E2F2A";
const CREAM = "#F5F0E8";
const MUTED = "#9A9589";
const GREEN = "#4CAF7D";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function SignatureCanvas({ onSave }: { onSave: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setDrawing(true);
  }

  function move(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasStrokes(true);
  }

  function end() { setDrawing(false); }

  function clear() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  }

  function save() {
    if (!hasStrokes) { toast.error("Please draw your signature first."); return; }
    const dataUrl = canvasRef.current!.toDataURL("image/png");
    onSave(dataUrl);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>
        Sign Below
      </p>
      <div
        className="rounded-lg overflow-hidden"
        style={{ border: `1.5px solid rgba(201,168,76,0.35)` }}
      >
        <canvas
          ref={canvasRef}
          width={600}
          height={160}
          className="w-full touch-none cursor-crosshair"
          style={{ background: "rgba(255,255,255,0.04)", display: "block" }}
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={clear}
          className="text-xs h-8"
          style={{ borderColor: "rgba(255,255,255,0.12)", color: MUTED }}
        >
          Clear
        </Button>
        <Button
          size="sm"
          onClick={save}
          disabled={!hasStrokes}
          className="text-xs h-8 font-semibold"
          style={{ background: hasStrokes ? `linear-gradient(135deg, ${GOLD}, #E8C96A)` : "rgba(201,168,76,0.3)", color: DARK }}
        >
          <PenLine className="h-3 w-3 mr-1" />
          Submit Signature
        </Button>
      </div>
    </div>
  );
}

export default function ClientApprovals() {
  const utils = trpc.useUtils();
  const { data: estimates = [], isLoading } = trpc.clientPortal.getMyEstimates.useQuery();
  const { data: clientSession } = trpc.clientPortal.me.useQuery();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [signingId, setSigningId] = useState<number | null>(null);

  const approve = trpc.estimates.approveFromPortal.useMutation({
    onSuccess: () => {
      utils.clientPortal.getMyEstimates.invalidate();
      setSigningId(null);
      toast.success("Proposal approved and signed! A copy has been emailed to you.");
    },
    onError: (err) => toast.error(err.message || "Approval failed. Please try again."),
  });

  const pending = estimates.filter(e => e.status === "sent" || e.status === "viewed");
  const approved = estimates.filter(e => e.status === "approved");
  const other = estimates.filter(e => !["sent", "viewed", "approved"].includes(e.status));

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: GOLD }}>
          Your Proposals
        </p>
        <h1 className="text-4xl font-serif leading-tight" style={{ color: CREAM, fontStyle: "italic" }}>
          Review &amp; Sign
        </h1>
        <p className="text-sm mt-1" style={{ color: MUTED }}>
          Review your renovation proposals and sign when you're ready to move forward.
        </p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: CHARCOAL }} />
          ))}
        </div>
      )}

      {/* Pending approvals */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>
            Awaiting Your Signature
          </h2>
          {pending.map(est => (
            <div
              key={est.id}
              className="rounded-xl overflow-hidden"
              style={{ background: CHARCOAL, border: `1.5px solid rgba(201,168,76,0.35)` }}
            >
              {/* Amber accent bar */}
              <div style={{ height: 3, background: `linear-gradient(90deg, ${GOLD}, #E8C96A)` }} />
              <div className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: `${GOLD}20` }}
                    >
                      <FileText className="h-4 w-4" style={{ color: GOLD }} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: CREAM }}>
                        {est.title ?? `Proposal #${est.estimateNumber}`}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                        {est.estimateNumber} · Sent {format(new Date(est.createdAt), "MMMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold" style={{ color: GOLD }}>
                      {fmt(Number(est.total ?? 0))}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide" style={{ color: MUTED }}>Total</p>
                  </div>
                </div>

                {/* Expand/collapse details */}
                <button
                  className="flex items-center gap-1 text-xs transition-colors"
                  style={{ color: MUTED }}
                  onClick={() => setExpandedId(expandedId === est.id ? null : est.id)}
                >
                  {expandedId === est.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {expandedId === est.id ? "Hide details" : "View details"}
                </button>

                {expandedId === est.id && est.notes && (
                  <div
                    className="rounded-lg p-4 text-sm"
                    style={{ background: "rgba(255,255,255,0.04)", color: MUTED, lineHeight: 1.6 }}
                  >
                    {est.notes}
                  </div>
                )}

                {/* Signature area */}
                {signingId === est.id ? (
                  <div className="space-y-3">
                    <div
                      className="rounded-lg p-3 text-xs"
                      style={{ background: `${GOLD}10`, border: `1px solid ${GOLD}30`, color: MUTED }}
                    >
                      By signing below, you authorize Kitchens Plus Upstate to proceed with the work described in this proposal for the total amount of <strong style={{ color: GOLD }}>{fmt(Number(est.total ?? 0))}</strong>.
                    </div>
                    <SignatureCanvas
                      onSave={(dataUrl) => {
                        approve.mutate({
                          id: est.id,
                          signatureDataUrl: dataUrl,
                          signerName: clientSession?.name ?? undefined,
                        });
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSigningId(null)}
                      className="text-xs h-8"
                      style={{ borderColor: "rgba(255,255,255,0.12)", color: MUTED }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={() => setSigningId(est.id)}
                    className="w-full h-11 font-semibold text-sm"
                    style={{
                      background: `linear-gradient(135deg, ${GOLD}, #E8C96A)`,
                      color: DARK,
                      boxShadow: `0 4px 16px rgba(201,168,76,0.3)`,
                    }}
                  >
                    <PenLine className="h-4 w-4 mr-2" />
                    Review &amp; Sign
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Approved */}
      {approved.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>
            Signed &amp; Approved
          </h2>
          {approved.map(est => (
            <div
              key={est.id}
              className="rounded-xl p-4 flex items-center gap-3"
              style={{ background: CHARCOAL, border: `1px solid rgba(76,175,125,0.2)` }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${GREEN}15` }}
              >
                <CheckCircle className="h-4 w-4" style={{ color: GREEN }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm" style={{ color: CREAM }}>
                  {est.title ?? `Proposal #${est.estimateNumber}`}
                </p>
                <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                  {fmt(Number(est.total ?? 0))} · Signed{" "}
                  {est.approvedAt ? format(new Date(est.approvedAt), "MMMM d, yyyy") : ""}
                </p>
              </div>
              {est.signedPdfUrl && (
                <a
                  href={est.signedPdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs shrink-0 transition-colors hover:underline"
                  style={{ color: GOLD }}
                >
                  <ExternalLink className="h-3 w-3" />
                  View Signed Copy
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && pending.length === 0 && approved.length === 0 && (
        <div
          className="rounded-xl p-10 text-center space-y-3"
          style={{ background: CHARCOAL, border: `1px solid rgba(255,255,255,0.06)` }}
        >
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
            style={{ background: `${GREEN}15` }}
          >
            <CheckCircle className="h-6 w-6" style={{ color: GREEN }} />
          </div>
          <h2 className="text-xl font-serif" style={{ color: CREAM, fontStyle: "italic" }}>
            All caught up!
          </h2>
          <p className="text-sm" style={{ color: MUTED }}>
            No proposals are waiting for your review right now.
          </p>
        </div>
      )}
    </div>
  );
}
