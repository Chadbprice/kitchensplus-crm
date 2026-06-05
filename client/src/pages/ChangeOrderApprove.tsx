/**
 * ChangeOrderApprove.tsx — public page, no auth required.
 * Flow: View CO details → Sign (canvas) → Submit → Confirmation (signed PDF link)
 * Also handles Decline with reason + Google Chat notification.
 */
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, PenLine, RotateCcw, Download, Loader2, GitBranch, ThumbsDown } from "lucide-react";

const GOLD = "#BF9A3B";
const CHARCOAL = "#1C1C1A";
const CREAM = "#F5EDE7";

type Stage = "view" | "sign" | "submitting" | "approved" | "declined" | "already_approved" | "already_declined";

export default function ChangeOrderApprove() {
  const [, params] = useRoute("/change-order/approve/:token");
  const token = params?.token ?? "";

  const { data: co, isLoading, error } = trpc.changeOrders.getByToken.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  const [stage, setStage] = useState<Stage>("view");
  const [signerName, setSignerName] = useState("");
  const [signedPdfUrl, setSignedPdfUrl] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [showDeclineForm, setShowDeclineForm] = useState(false);

  // Canvas signature pad
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (stage !== "sign") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = CHARCOAL;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [stage]);

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    setIsDrawing(true);
    lastPos.current = getPos(e, canvas);
  }
  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current!.x, lastPos.current!.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    setHasSigned(true);
  }
  function stopDraw() { setIsDrawing(false); lastPos.current = null; }
  function clearSignature() {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
  }

  const approveWithSig = trpc.changeOrders.approveWithSignature.useMutation({
    onSuccess: (data) => {
      if (data.alreadyApproved) { setStage("already_approved"); return; }
      setSignedPdfUrl(data.signedPdfUrl ?? null);
      setStage("approved");
    },
    onError: (e) => { alert("Error: " + e.message); setStage("sign"); },
  });

  const declineMut = trpc.changeOrders.declineByToken.useMutation({
    onSuccess: (data) => {
      if (data.alreadyDeclined) { setStage("already_declined"); return; }
      setStage("declined");
    },
    onError: (e) => alert("Error: " + e.message),
  });

  function handleSubmitSignature() {
    const canvas = canvasRef.current; if (!canvas) return;
    if (!hasSigned) { alert("Please draw your signature before submitting."); return; }
    if (!signerName.trim()) { alert("Please enter your full name."); return; }
    const dataUrl = canvas.toDataURL("image/png");
    setStage("submitting");
    approveWithSig.mutate({ token, signatureDataUrl: dataUrl, signerName: signerName.trim() });
  }

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: CREAM }}>
      <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
    </div>
  );

  if (error || !co) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: CREAM }}>
      <div className="text-center p-8">
        <XCircle className="h-12 w-12 mx-auto mb-4" style={{ color: "#E05252" }} />
        <h2 className="text-xl font-bold mb-2" style={{ color: CHARCOAL }}>Link Not Found</h2>
        <p className="text-gray-500">This change order link is invalid or has expired.</p>
      </div>
    </div>
  );

  const amountNum = parseFloat(String(co.amount ?? 0));
  const amountStr = `${amountNum >= 0 ? "+" : ""}$${Math.abs(amountNum).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const lineItems: any[] = co.lineItemsJson ? (() => { try { return JSON.parse(co.lineItemsJson); } catch { return []; } })() : [];

  // ── Confirmation screens ──────────────────────────────────────────────────
  if (stage === "approved") return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: CREAM }}>
      <div className="max-w-lg w-full text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: "#4CAF7D20" }}>
          <CheckCircle className="h-8 w-8" style={{ color: "#4CAF7D" }} />
        </div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: CHARCOAL }}>Change Order Signed & Approved</h1>
        <p className="text-gray-600 mb-1 font-medium">{co.changeOrderNumber}: {co.title}</p>
        <p className="text-gray-500 text-sm mb-6">
          Thank you, {signerName}. Your signed copy has been emailed to you and recorded with Kitchens Plus Upstate. Work will proceed as outlined.
        </p>
        {signedPdfUrl && (
          <a href={signedPdfUrl} target="_blank" rel="noopener noreferrer">
            <Button className="gap-2" style={{ background: GOLD, color: "#fff" }}>
              <Download className="h-4 w-4" /> Download Signed Copy
            </Button>
          </a>
        )}
        <p className="text-xs text-gray-400 mt-8 leading-relaxed">
          By signing electronically, you agreed to be legally bound by this change order under the Electronic Signatures in Global and National Commerce Act (E-SIGN, 15 U.S.C. § 7001) and UETA. This electronic signature is legally equivalent to a handwritten signature.
        </p>
      </div>
    </div>
  );

  if (stage === "already_approved") return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: CREAM }}>
      <div className="max-w-lg w-full text-center">
        <CheckCircle className="h-12 w-12 mx-auto mb-4" style={{ color: "#4CAF7D" }} />
        <h1 className="text-2xl font-bold mb-2" style={{ color: CHARCOAL }}>Already Approved</h1>
        <p className="text-gray-500">This change order has already been approved and signed.</p>
        {co.signedPdfUrl && (
          <a href={co.signedPdfUrl} target="_blank" rel="noopener noreferrer" className="inline-block mt-4">
            <Button className="gap-2" style={{ background: GOLD, color: "#fff" }}>
              <Download className="h-4 w-4" /> Download Signed Copy
            </Button>
          </a>
        )}
      </div>
    </div>
  );

  if (stage === "declined") return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: CREAM }}>
      <div className="max-w-lg w-full text-center">
        <XCircle className="h-12 w-12 mx-auto mb-4" style={{ color: "#E05252" }} />
        <h1 className="text-2xl font-bold mb-2" style={{ color: CHARCOAL }}>Change Order Declined</h1>
        <p className="text-gray-500">Your response has been recorded. Kitchens Plus Upstate will be in touch shortly to discuss next steps.</p>
      </div>
    </div>
  );

  if (stage === "already_declined") return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: CREAM }}>
      <div className="max-w-lg w-full text-center">
        <XCircle className="h-12 w-12 mx-auto mb-4" style={{ color: "#E05252" }} />
        <h1 className="text-2xl font-bold mb-2" style={{ color: CHARCOAL }}>Already Declined</h1>
        <p className="text-gray-500">This change order has already been declined.</p>
      </div>
    </div>
  );

  // ── Signature stage ───────────────────────────────────────────────────────
  if (stage === "sign" || stage === "submitting") return (
    <div className="min-h-screen p-6" style={{ background: CREAM }}>
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: GOLD }}>Kitchens Plus Upstate</p>
          <h1 className="text-2xl font-bold" style={{ color: CHARCOAL }}>Sign Change Order</h1>
          <p className="text-gray-500 text-sm mt-1">{co.changeOrderNumber}: {co.title}</p>
        </div>

        <div className="rounded-xl p-4 mb-6 border" style={{ background: "#fff", borderColor: "#E8E0D8" }}>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Change Amount</span>
            <span className="font-bold text-lg" style={{ color: amountNum >= 0 ? GOLD : "#2d7a4f" }}>{amountStr}</span>
          </div>
          {co.description && <p className="text-sm text-gray-600 mt-2">{co.description}</p>}
        </div>

        <div className="mb-4">
          <Label className="text-sm font-medium mb-1 block" style={{ color: CHARCOAL }}>Your Full Legal Name</Label>
          <Input
            value={signerName}
            onChange={e => setSignerName(e.target.value)}
            placeholder="Enter your full legal name exactly as it appears on your ID"
            className="bg-white border-gray-300"
            disabled={stage === "submitting"}
          />
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-medium flex items-center gap-1" style={{ color: CHARCOAL }}>
              <PenLine className="h-4 w-4" /> Draw Your Signature
            </Label>
            <button onClick={clearSignature} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1" disabled={stage === "submitting"}>
              <RotateCcw className="h-3 w-3" /> Clear
            </button>
          </div>
          <div className="rounded-xl border-2 overflow-hidden" style={{ borderColor: hasSigned ? GOLD : "#D0C8C0", background: "#fff" }}>
            <canvas
              ref={canvasRef}
              width={600}
              height={160}
              className="w-full touch-none cursor-crosshair"
              style={{ display: "block" }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={stopDraw}
              onMouseLeave={stopDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={stopDraw}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">Sign using your mouse or finger on a touchscreen</p>
        </div>

        <div className="rounded-lg p-3 mb-6 text-xs text-gray-500 leading-relaxed" style={{ background: "#F0EBE5" }}>
          By clicking "Sign & Approve", I agree to be legally bound by this change order under the Electronic Signatures in Global and National Commerce Act (E-SIGN, 15 U.S.C. § 7001) and the Uniform Electronic Transactions Act (UETA). I acknowledge that my electronic signature is legally equivalent to a handwritten signature and constitutes my formal approval of the scope and cost outlined above.
        </div>

        <div className="flex gap-3">
          <Button
            className="flex-1 h-12 text-base font-semibold gap-2"
            style={{ background: GOLD, color: "#fff" }}
            onClick={handleSubmitSignature}
            disabled={stage === "submitting" || !hasSigned || !signerName.trim()}
          >
            {stage === "submitting"
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
              : <><CheckCircle className="h-4 w-4" /> Sign & Approve</>}
          </Button>
          <Button
            variant="outline"
            className="h-12 px-4 border-gray-300 text-gray-500"
            onClick={() => setStage("view")}
            disabled={stage === "submitting"}
          >
            Back
          </Button>
        </div>
      </div>
    </div>
  );

  // ── Default: View stage ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen p-6" style={{ background: CREAM }}>
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "#BF9A3B20" }}>
            <GitBranch className="h-7 w-7" style={{ color: GOLD }} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: GOLD }}>Kitchens Plus Upstate</p>
          <h1 className="text-2xl font-bold" style={{ color: CHARCOAL }}>Change Order Request</h1>
          <p className="text-gray-500 text-sm mt-1">{co.changeOrderNumber}</p>
        </div>

        <div className="rounded-2xl border overflow-hidden mb-6" style={{ background: "#fff", borderColor: "#E8E0D8" }}>
          <div className="px-6 py-4 border-b" style={{ borderColor: "#E8E0D8", background: CHARCOAL }}>
            <h2 className="text-lg font-bold text-white">{co.title}</h2>
            {co.description && <p className="text-sm mt-1" style={{ color: "#AAAAAA" }}>{co.description}</p>}
          </div>

          <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: "#E8E0D8" }}>
            <span className="text-sm text-gray-500 font-medium">Change Amount</span>
            <span className="text-2xl font-bold" style={{ color: amountNum >= 0 ? GOLD : "#2d7a4f" }}>{amountStr}</span>
          </div>

          {lineItems.length > 0 && (
            <div className="px-6 py-4 border-b" style={{ borderColor: "#E8E0D8" }}>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Scope of Work</p>
              <div className="space-y-2">
                {lineItems.map((li: any, i: number) => (
                  <div key={i} className="flex justify-between text-sm">
                    <div>
                      <span className="font-medium" style={{ color: CHARCOAL }}>{li.task}</span>
                      {li.description && <span className="text-gray-400 ml-2">— {li.description}</span>}
                    </div>
                    <span className="font-semibold ml-4 shrink-0" style={{ color: CHARCOAL }}>
                      ${parseFloat(String(li.lineTotal ?? 0)).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {co.notes && (
            <div className="px-6 py-4 border-b" style={{ borderColor: "#E8E0D8" }}>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Notes</p>
              <p className="text-sm text-gray-600">{co.notes}</p>
            </div>
          )}

          <div className="px-6 py-5">
            <p className="text-sm text-gray-500 mb-4">Please review the change order above and choose to approve with your signature, or decline.</p>
            <div className="flex gap-3">
              <Button
                className="flex-1 h-12 text-base font-semibold gap-2"
                style={{ background: GOLD, color: "#fff" }}
                onClick={() => setStage("sign")}
              >
                <PenLine className="h-4 w-4" /> Review & Sign
              </Button>
              <Button
                variant="outline"
                className="h-12 px-4 border-red-200 text-red-500 hover:bg-red-50 hover:border-red-400"
                onClick={() => setShowDeclineForm(v => !v)}
              >
                <ThumbsDown className="h-4 w-4 mr-1" /> Decline
              </Button>
            </div>

            {showDeclineForm && (
              <div className="mt-4 p-4 rounded-xl border" style={{ borderColor: "#FECACA", background: "#FEF2F2" }}>
                <p className="text-sm font-medium text-red-700 mb-2">Reason for declining (optional)</p>
                <Textarea
                  value={declineReason}
                  onChange={e => setDeclineReason(e.target.value)}
                  placeholder="Let us know why you're declining this change order…"
                  className="bg-white border-red-200 text-sm mb-3"
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
                    onClick={() => declineMut.mutate({ token, reason: declineReason.trim() || undefined })}
                    disabled={declineMut.isPending}
                  >
                    {declineMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Confirm Decline
                  </Button>
                  <Button variant="outline" className="border-gray-300 text-gray-500" onClick={() => setShowDeclineForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400">
          Kitchens Plus Upstate · Renovations &amp; Design<br />
          Questions? Email us at chad@kitchensplusupstate.com
        </p>
      </div>
    </div>
  );
}
