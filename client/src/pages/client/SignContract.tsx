import React, { useRef, useState } from "react";
import { useRoute } from "wouter";
import SignatureCanvas from "react-signature-canvas";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CheckCircle2, PenLine, RotateCcw, AlertCircle } from "lucide-react";

export default function SignContract() {
  const [, params] = useRoute("/client/sign-contract/:token");
  const token = params?.token ?? "";

  const { data: contract, isLoading, error } = trpc.invoices.getContractByToken.useQuery(
    { token },
    { enabled: !!token }
  );

  const sigRef = useRef<SignatureCanvas>(null);
  const [signerName, setSignerName] = useState("");
  const [isEmpty, setIsEmpty] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [signed, setSigned] = useState(false);

  const signMutation = trpc.invoices.signContract.useMutation({
    onSuccess: () => {
      setSigned(true);
      toast.success("Contract signed successfully!");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to sign contract");
    },
  });

  const handleClear = () => {
    sigRef.current?.clear();
    setIsEmpty(true);
  };

  const handleSign = () => {
    if (!signerName.trim() || signerName.trim().length < 2) {
      toast.error("Please enter your full name");
      return;
    }
    if (isEmpty || !sigRef.current || sigRef.current.isEmpty()) {
      toast.error("Please draw your signature");
      return;
    }
    if (!agreed) {
      toast.error("Please agree to the terms before signing");
      return;
    }
    const signatureDataUrl = sigRef.current.toDataURL("image/png");
    signMutation.mutate({ token, signerName: signerName.trim(), signatureDataUrl });
  };

  // Already signed (from DB)
  if (contract?.contractSigned || signed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#1A1B16" }}>
        <div className="max-w-lg w-full text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: "rgba(212,175,55,0.15)" }}>
            <CheckCircle2 className="w-10 h-10" style={{ color: "#D4AF37" }} />
          </div>
          <h1 className="text-3xl font-bold mb-3" style={{ fontFamily: "Cormorant Garamond, Georgia, serif", color: "#D4AF37" }}>
            Contract Signed
          </h1>
          <p className="text-gray-300 mb-2">
            {contract?.contractSignerName
              ? `Signed by ${contract.contractSignerName}`
              : "Your contract has been signed."}
          </p>
          {contract?.contractSignedAt && (
            <p className="text-sm text-gray-500">
              {new Date(contract.contractSignedAt).toLocaleString("en-US", {
                timeZone: "America/New_York",
                dateStyle: "full",
                timeStyle: "short",
              })} ET
            </p>
          )}
          <div className="mt-8 p-4 rounded-lg border text-sm text-gray-400" style={{ borderColor: "rgba(212,175,55,0.3)", background: "rgba(212,175,55,0.05)" }}>
            Thank you! Chad will be in touch shortly to confirm your project start date. If you have any questions, call us at <strong style={{ color: "#D4AF37" }}>(864) 567-8777</strong>.
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#1A1B16" }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#D4AF37", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#1A1B16" }}>
        <div className="max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-400" />
          <h2 className="text-xl font-semibold text-white mb-2">Link Not Found</h2>
          <p className="text-gray-400">This contract link is invalid or has expired. Please contact Kitchens Plus Upstate at (864) 567-8777.</p>
        </div>
      </div>
    );
  }

  const amount = parseFloat(String(contract.amount)).toFixed(2);

  return (
    <div className="min-h-screen py-10 px-4" style={{ background: "#1A1B16" }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-xs tracking-[0.3em] uppercase mb-2" style={{ color: "#D4AF37" }}>Kitchens Plus Upstate</p>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "Cormorant Garamond, Georgia, serif", color: "#E8E0D0" }}>
            Project Contract
          </h1>
          <p className="text-gray-400 mt-1">Invoice #{contract.invoiceNumber} · Deposit: ${amount}</p>
        </div>

        {/* Contract Terms */}
        <div className="rounded-xl p-6 mb-6 border" style={{ background: "#23241E", borderColor: "rgba(212,175,55,0.2)" }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: "#D4AF37", fontFamily: "Cormorant Garamond, Georgia, serif" }}>
            Contract Terms &amp; Agreement
          </h2>
          <div className="text-sm text-gray-300 space-y-3 leading-relaxed">
            <p>This agreement is entered into between <strong style={{ color: "#E8E0D0" }}>CP Enterprises SC / Kitchens Plus Upstate</strong> ("Contractor") and <strong style={{ color: "#E8E0D0" }}>{contract.clientName}</strong> ("Client").</p>

            <p><strong style={{ color: "#D4AF37" }}>1. Scope of Work.</strong> Contractor agrees to perform the renovation and remodeling services as described in the approved project proposal. All work will be completed in a professional and workmanlike manner.</p>

            <p><strong style={{ color: "#D4AF37" }}>2. Payment Terms.</strong> Client agrees to pay the deposit of <strong style={{ color: "#E8E0D0" }}>${amount}</strong> upon signing this contract. Progress payments will be invoiced as work milestones are completed. Final payment is due upon project completion.</p>

            <p><strong style={{ color: "#D4AF37" }}>3. Change Orders.</strong> Any changes to the scope of work must be agreed upon in writing. Additional costs resulting from change orders will be invoiced separately.</p>

            <p><strong style={{ color: "#D4AF37" }}>4. Timeline.</strong> Contractor will provide a project schedule upon receipt of deposit. Timelines are estimates and may be affected by material availability, weather, or other factors beyond Contractor's control.</p>

            <p><strong style={{ color: "#D4AF37" }}>5. Materials.</strong> Contractor will source materials as specified in the proposal. Client-supplied materials are accepted but Contractor assumes no liability for defects in client-supplied items.</p>

            <p><strong style={{ color: "#D4AF37" }}>6. Warranty.</strong> Contractor warrants all labor for one (1) year from project completion. Manufacturer warranties apply to materials and fixtures.</p>

            <p><strong style={{ color: "#D4AF37" }}>7. Dispute Resolution.</strong> Any disputes shall first be addressed through good-faith negotiation. If unresolved, disputes shall be submitted to binding arbitration in Greenville County, SC.</p>

            {contract.notes && (
              <p><strong style={{ color: "#D4AF37" }}>Project Notes.</strong> {contract.notes}</p>
            )}
          </div>
        </div>

        {/* Signature Section */}
        <div className="rounded-xl p-6 border" style={{ background: "#23241E", borderColor: "rgba(212,175,55,0.2)" }}>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: "#D4AF37", fontFamily: "Cormorant Garamond, Georgia, serif" }}>
            <PenLine className="w-5 h-5" />
            Sign Below
          </h2>

          {/* Full Name */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1.5 text-gray-300">Full Legal Name</label>
            <Input
              placeholder="Type your full name"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              className="bg-[#1A1B16] border-gray-600 text-white placeholder:text-gray-500"
            />
          </div>

          {/* Signature Canvas */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1.5 text-gray-300">Signature</label>
            <div className="rounded-lg border-2 overflow-hidden relative" style={{ borderColor: isEmpty ? "rgba(212,175,55,0.3)" : "#D4AF37", background: "#fff" }}>
              <SignatureCanvas
                ref={sigRef}
                penColor="#1A1B16"
                canvasProps={{ width: 600, height: 160, className: "w-full h-40 touch-none" }}
                onBegin={() => setIsEmpty(false)}
              />
              {isEmpty && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <p className="text-gray-400 text-sm italic">Draw your signature here</p>
                </div>
              )}
            </div>
            <button
              onClick={handleClear}
              className="mt-1.5 text-xs flex items-center gap-1 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Clear signature
            </button>
          </div>

          {/* Agreement Checkbox */}
          <label className="flex items-start gap-3 cursor-pointer mb-6 p-3 rounded-lg" style={{ background: "rgba(212,175,55,0.05)", border: "1px solid rgba(212,175,55,0.15)" }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-yellow-600 flex-shrink-0"
            />
            <span className="text-sm text-gray-300 leading-relaxed">
              By checking this box and signing above, I, <strong style={{ color: "#E8E0D0" }}>{signerName || "[your name]"}</strong>, agree to the terms of this contract and acknowledge that my electronic signature is legally binding under the <strong>Electronic Signatures in Global and National Commerce Act (ESIGN)</strong> and the <strong>Uniform Electronic Transactions Act (UETA)</strong>.
            </span>
          </label>

          {/* Submit */}
          <Button
            onClick={handleSign}
            disabled={signMutation.isPending || !signerName.trim() || isEmpty || !agreed}
            className="w-full h-12 text-base font-semibold"
            style={{ background: "#D4AF37", color: "#1A1B16" }}
          >
            {signMutation.isPending ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-[#1A1B16] border-t-transparent rounded-full animate-spin" />
                Signing...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                Sign &amp; Submit Contract
              </span>
            )}
          </Button>

          <p className="text-xs text-gray-500 text-center mt-3">
            Your signature will be securely stored. A confirmation will be sent to your email.
          </p>
        </div>
      </div>
    </div>
  );
}
