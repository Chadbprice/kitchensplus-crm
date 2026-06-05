/**
 * RFIResponsePage — Public token-based RFI response page
 * No login required. Client clicks link from email/SMS, lands here.
 * Can: Agree (Yes), Decline (No), Request Discussion, or add comments.
 */
import { useState, useRef } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2, XCircle, MessageSquare, AlertTriangle, FileText, Upload, X } from "lucide-react";

const BUSINESS_NAME = "Kitchens Plus Upstate";
const GOLD = "#BF9A3B";

export default function RFIResponsePage() {
  const [, params] = useRoute("/rfi/:token");
  const token = params?.token ?? "";

  const [decision, setDecision] = useState<"yes" | "no" | "discuss" | null>(null);
  const [comments, setComments] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<{ base64: string; mimeType: string; fileName: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: rfi, isLoading, error: loadError } = trpc.rfi.getByToken.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  const respondMutation = trpc.rfi.respond.useMutation({
    onSuccess: () => setSubmitted(true),
    onError: (e) => setError(e.message),
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newPhotos: typeof photos = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;
      const reader = new FileReader();
      await new Promise<void>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(",")[1];
          newPhotos.push({ base64, mimeType: file.type, fileName: file.name });
          resolve();
        };
        reader.readAsDataURL(file);
      });
    }
    setPhotos((prev) => [...prev, ...newPhotos]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!decision) return;
    setSubmitting(true);
    setError(null);
    try {
      await respondMutation.mutateAsync({
        token,
        agreed: decision === "yes" ? true : decision === "no" ? false : null,
        comments: comments.trim() || undefined,
        photos: photos.length > 0 ? photos : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8F6F1] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#BF9A3B]" />
      </div>
    );
  }

  // ─── Error / Not found ─────────────────────────────────────────────────────
  if (loadError || !rfi) {
    return (
      <div className="min-h-screen bg-[#F8F6F1] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-serif font-semibold text-[#1A1A1A] mb-2">Link Not Found</h2>
          <p className="text-gray-600 text-sm">This RFI link may have expired or is no longer valid. Please contact {BUSINESS_NAME} for assistance.</p>
        </div>
      </div>
    );
  }

  // ─── Already responded ─────────────────────────────────────────────────────
  if (rfi.status === "responded" || rfi.status === "reviewed") {
    return (
      <div className="min-h-screen bg-[#F8F6F1] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-serif font-semibold text-[#1A1A1A] mb-2">Already Responded</h2>
          <p className="text-gray-600 text-sm">Your response to this request has already been received. Thank you!</p>
          <p className="text-gray-500 text-xs mt-3">Questions? Contact {BUSINESS_NAME}.</p>
        </div>
      </div>
    );
  }

  // ─── Submitted ─────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-[#F8F6F1] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-2xl font-serif font-semibold text-[#1A1A1A] mb-3">Response Received</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            Thank you for your response. {BUSINESS_NAME} has been notified and will follow up with you shortly.
          </p>
          {decision === "discuss" && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-amber-800 text-sm">We'll be in touch to schedule a time to discuss this further.</p>
            </div>
          )}
          <p className="text-gray-400 text-xs mt-6">You may close this window.</p>
        </div>
      </div>
    );
  }

  // ─── Response form ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F8F6F1]">
      {/* Header */}
      <header className="bg-[#1A1A1A] py-5 px-6">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: GOLD }}>
            <span className="text-[#1A1A1A] font-bold text-sm">K</span>
          </div>
          <div>
            <p className="text-white font-serif text-base">{BUSINESS_NAME}</p>
            <p className="text-gray-400 text-xs tracking-widest uppercase">Request for Information</p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* RFI Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
            <FileText className="w-5 h-5 text-[#BF9A3B]" />
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-widest">Request for Information</p>
              <h1 className="text-lg font-serif font-semibold text-[#1A1A1A] mt-0.5">{rfi.title}</h1>
            </div>
          </div>
          <div className="px-6 py-5">
            <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{rfi.body}</p>
          </div>
        </div>

        {/* Response section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
          <h2 className="text-base font-serif font-semibold text-[#1A1A1A]">Your Response</h2>

          {/* Decision buttons */}
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setDecision("yes")}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                decision === "yes"
                  ? "border-green-500 bg-green-50"
                  : "border-gray-200 hover:border-green-300 hover:bg-green-50/50"
              }`}
            >
              <CheckCircle2 className={`w-7 h-7 ${decision === "yes" ? "text-green-500" : "text-gray-400"}`} />
              <span className={`text-sm font-medium ${decision === "yes" ? "text-green-700" : "text-gray-600"}`}>
                Agree / Yes
              </span>
            </button>

            <button
              onClick={() => setDecision("no")}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                decision === "no"
                  ? "border-red-500 bg-red-50"
                  : "border-gray-200 hover:border-red-300 hover:bg-red-50/50"
              }`}
            >
              <XCircle className={`w-7 h-7 ${decision === "no" ? "text-red-500" : "text-gray-400"}`} />
              <span className={`text-sm font-medium ${decision === "no" ? "text-red-700" : "text-gray-600"}`}>
                Decline / No
              </span>
            </button>

            <button
              onClick={() => setDecision("discuss")}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                decision === "discuss"
                  ? "border-amber-500 bg-amber-50"
                  : "border-gray-200 hover:border-amber-300 hover:bg-amber-50/50"
              }`}
            >
              <MessageSquare className={`w-7 h-7 ${decision === "discuss" ? "text-amber-500" : "text-gray-400"}`} />
              <span className={`text-sm font-medium ${decision === "discuss" ? "text-amber-700" : "text-gray-600"}`}>
                Discuss First
              </span>
            </button>
          </div>

          {/* Comments */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Comments <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <Textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Add any notes, questions, or clarifications here…"
              className="resize-none min-h-[100px] border-gray-200 focus:border-[#BF9A3B] focus:ring-[#BF9A3B]/20 text-sm"
            />
          </div>

          {/* Photo Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Attach Photos <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-[#BF9A3B] hover:text-[#BF9A3B] transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload Photos
            </button>
            {photos.length > 0 && (
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photos.map((photo, i) => (
                  <div key={i} className="relative group">
                    <img
                      src={`data:${photo.mimeType};base64,${photo.base64}`}
                      alt={photo.fileName}
                      className="w-full h-24 object-cover rounded-lg border border-gray-200"
                    />
                    <button
                      onClick={() => removePhoto(i)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <p className="text-xs text-gray-400 mt-1 truncate">{photo.fileName}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!decision || submitting}
            className="w-full h-12 text-base font-semibold"
            style={{ background: decision ? GOLD : undefined, color: decision ? "#1A1A1A" : undefined }}
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting…</>
            ) : (
              "Submit Response →"
            )}
          </Button>

          <p className="text-xs text-gray-400 text-center">
            Your response will be sent directly to {BUSINESS_NAME}.
          </p>
        </div>
      </main>
    </div>
  );
}
