/**
 * RFICreateDialog — AI-assisted RFI creation with true voice dictation
 *
 * Voice flow: tap mic → recording (pulsing indicator + timer) → tap stop →
 * auto-transcribe (Whisper via S3) → transcript appears as editable text →
 * user clicks Generate → AI produces professional email + SMS drafts →
 * owner reviews/edits → send preview with channel toggles.
 *
 * Root cause fix: transcript is captured into a local variable AND state,
 * so the same-render combinedText always includes the transcript text.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import {
  Sparkles, Mic, MicOff, Upload, FileText, Image, X, Loader2,
  ChevronRight, CheckCircle2, HelpCircle, Send, Mail, MessageSquare,
  Eye, ArrowLeft, AlertCircle, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

interface RFICreateDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: number;
  projectName: string;
  onCreated: () => void;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
}

type Step = "input" | "review" | "send-preview";

/** Voice dictation state machine */
type DictationState =
  | "idle"           // no recording, no transcript
  | "recording"      // mic active, capturing audio
  | "transcribing"   // audio sent to Whisper, waiting for text
  | "ready"          // transcript available
  | "error";         // transcription failed

export function RFICreateDialog({
  open, onClose, projectId, projectName, onCreated,
  clientName, clientEmail, clientPhone,
}: RFICreateDialogProps) {
  const [step, setStep] = useState<Step>("input");

  // ── Text input ─────────────────────────────────────────────────────────────
  const [rawText, setRawText] = useState("");

  // ── File input ─────────────────────────────────────────────────────────────
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // ── Voice dictation ────────────────────────────────────────────────────────
  const [dictationState, setDictationState] = useState<DictationState>("idle");
  const [transcript, setTranscript] = useState("");        // the primary output of dictation
  const [dictationError, setDictationError] = useState("");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null); // playback reference only

  // ── Generation state ───────────────────────────────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingStage, setGeneratingStage] = useState<"analyzing" | null>(null);
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([]);
  const [followUpAnswers, setFollowUpAnswers] = useState<Record<number, string>>({});
  const [generatedTitle, setGeneratedTitle] = useState("");
  const [generatedBody, setGeneratedBody] = useState("");
  const [generatedSms, setGeneratedSms] = useState("");

  // ── Save / attachment state ────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);

  // ── Send preview state ─────────────────────────────────────────────────────
  const [savedRfiId, setSavedRfiId] = useState<number | null>(null);
  const [sendEmail, setSendEmail] = useState(true);
  const [sendSmsToggle, setSendSmsToggle] = useState(true);
  const [isSending, setIsSending] = useState(false);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const generateMutation = trpc.rfi.generate.useMutation();
  const transcribeVoiceMutation = trpc.rfi.transcribeVoice.useMutation();
  const createMutation = trpc.rfi.create.useMutation();
  const uploadAttachmentMutation = trpc.rfi.uploadAttachment.useMutation();
  const sendMutation = trpc.rfi.send.useMutation();

  // ── Reset ──────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setStep("input");
    setRawText("");
    setSelectedFiles([]);
    setDictationState("idle");
    setTranscript("");
    setDictationError("");
    setRecordingSeconds(0);
    setAudioUrl(null);
    setFollowUpQuestions([]);
    setFollowUpAnswers({});
    setGeneratedTitle("");
    setGeneratedBody("");
    setGeneratedSms("");
    setGeneratingStage(null);
    setPendingAttachments([]);
    setSavedRfiId(null);
    setSendEmail(true);
    setSendSmsToggle(true);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const handleClose = useCallback(() => { handleReset(); onClose(); }, [handleReset, onClose]);

  // ── Recording timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (dictationState === "recording") {
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [dictationState]);

  // ── Auto-transcribe function (called from recorder.onstop) ─────────────────
  const autoTranscribe = useCallback(async (blob: Blob) => {
    setDictationState("transcribing");
    setDictationError("");
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const comma = result.indexOf(",");
          resolve(result.slice(comma + 1));
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const { text } = await transcribeVoiceMutation.mutateAsync({
        base64Audio: base64,
        mimeType: blob.type,
      });

      if (text && text.trim()) {
        setTranscript(text.trim());
        setDictationState("ready");
      } else {
        setDictationError("No speech detected. Try recording again.");
        setDictationState("error");
      }
    } catch (err: any) {
      console.error("[RFI] Transcription failed:", err.message);
      setDictationError(err.message || "Transcription failed. Please try again.");
      setDictationState("error");
    }
  }, [transcribeVoiceMutation]);

  // ── Start recording ────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    setDictationError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        // Set audio URL for optional playback
        setAudioUrl(URL.createObjectURL(blob));
        // Immediately auto-transcribe
        autoTranscribe(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setDictationState("recording");
    } catch (err: any) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        toast.error("Microphone access denied", {
          description: "Please allow microphone access in your browser settings and try again.",
        });
      } else {
        toast.error("Could not start recording", { description: err.message });
      }
      setDictationState("idle");
    }
  }, [autoTranscribe]);

  // ── Stop recording ─────────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    // dictationState will transition to "transcribing" in recorder.onstop → autoTranscribe
  }, []);

  // ── Clear dictation and re-record ──────────────────────────────────────────
  const clearDictation = useCallback(() => {
    setDictationState("idle");
    setTranscript("");
    setDictationError("");
    setAudioUrl(null);
    setRecordingSeconds(0);
  }, []);

  // ── Format seconds as mm:ss ────────────────────────────────────────────────
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  // ── Generate RFI from all available inputs ─────────────────────────────────
  const handleGenerate = async (clearFollowUps = false) => {
    // Determine what inputs are available
    const hasText = rawText.trim().length > 0;
    const hasTranscript = transcript.trim().length > 0;
    const hasFiles = selectedFiles.length > 0;
    const hasAnyInput = hasText || hasTranscript || hasFiles;

    if (!hasAnyInput) {
      toast.error("Please add at least one input — text, a file, or a voice recording.");
      return;
    }

    setIsGenerating(true);
    setGeneratingStage("analyzing");

    try {
      let base64File: string | undefined;
      let fileMimeType: string | undefined;

      // Encode the first file if provided
      if (hasFiles) {
        const firstFile = selectedFiles[0];
        const arrayBuffer = await firstFile.arrayBuffer();
        base64File = btoa(
          new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
        );
        fileMimeType = firstFile.type;
        // Queue all selected files as pending attachments
        setPendingAttachments(prev => {
          const existingNames = new Set(prev.map(f => f.name));
          const newFiles = selectedFiles.filter(f => !existingNames.has(f.name));
          return [...prev, ...newFiles];
        });
      }

      // Build combined text from rawText + transcript + follow-up answers
      // Use local variables (NOT React state) to avoid stale closure issue
      const textParts: string[] = [];
      if (rawText.trim()) textParts.push(rawText.trim());
      if (transcript.trim()) textParts.push(`[Voice dictation]\n${transcript.trim()}`);
      for (const [i, ans] of Object.entries(followUpAnswers)) {
        if (ans.trim()) {
          textParts.push(`Q: ${followUpQuestions[parseInt(i)]}\nA: ${ans}`);
        }
      }
      const combinedText = textParts.join("\n\n");

      if (clearFollowUps) setFollowUpQuestions([]);

      const result = await generateMutation.mutateAsync({
        projectId,
        inputText: combinedText || undefined,
        base64File,
        fileMimeType,
        // No audioUrl — we always transcribe client-side first
      });

      setGeneratedTitle(result.title);
      setGeneratedBody(result.body);
      setGeneratedSms((result as any).smsBody ?? "");
      setFollowUpQuestions(result.followUpQuestions ?? []);

      if ((result.followUpQuestions?.length ?? 0) > 0 && Object.keys(followUpAnswers).length === 0) {
        toast("AI has a few questions", {
          description: "Answer them below to refine the RFI, then click Generate again.",
        });
      } else {
        setStep("review");
      }
    } catch (err: any) {
      toast.error("Generation failed", { description: err.message });
    } finally {
      setIsGenerating(false);
      setGeneratingStage(null);
    }
  };

  // ── Add attachment ─────────────────────────────────────────────────────────
  const handleAddAttachment = (file: File) => {
    setPendingAttachments(prev => [...prev, file]);
  };

  // ── Save draft ─────────────────────────────────────────────────────────────
  const handleSaveDraft = async (): Promise<number | null> => {
    if (!generatedTitle.trim() || !generatedBody.trim()) {
      toast.error("Title and body are required");
      return null;
    }
    setIsSaving(true);
    try {
      const rfi = await createMutation.mutateAsync({
        projectId,
        title: generatedTitle,
        body: generatedBody,
      });

      for (const file of pendingAttachments) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
          );
          await uploadAttachmentMutation.mutateAsync({
            rfiId: rfi.id,
            base64,
            mimeType: file.type,
            fileName: file.name,
          });
        } catch (err: any) {
          console.error("[RFI] Attachment upload failed:", err.message);
        }
      }
      return rfi.id;
    } catch (err: any) {
      toast.error("Save failed", { description: err.message });
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  // ── Review & Send ──────────────────────────────────────────────────────────
  const handleReviewAndSend = async () => {
    const id = await handleSaveDraft();
    if (id == null) return;
    setSavedRfiId(id);
    onCreated();
    setStep("send-preview");
  };

  // ── Final send ─────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!savedRfiId) return;
    setIsSending(true);
    try {
      await sendMutation.mutateAsync({ rfiId: savedRfiId, origin: window.location.origin });
      toast.success("RFI sent!", { description: "The client has been notified via email and SMS." });
      handleClose();
    } catch (err: any) {
      toast.error("Send failed", { description: err.message });
    } finally {
      setIsSending(false);
    }
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  const hasAnyInput = rawText.trim() || transcript.trim() || selectedFiles.length > 0;
  const isDictating = dictationState === "recording" || dictationState === "transcribing";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-[#1A1A1A] border border-[#333] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#BF9A3B] font-serif text-xl">
            <FileText className="w-5 h-5" />
            New Request for Information
          </DialogTitle>
          <p className="text-sm text-gray-400 mt-1">
            Project: <span className="text-gray-200">{projectName}</span>
          </p>
        </DialogHeader>

        {/* ── STEP 1: Input ─────────────────────────────────────────────────── */}
        {step === "input" && (
          <div className="space-y-5">
            <p className="text-xs text-gray-500 leading-relaxed">
              Use any combination below — text, file, or voice dictation. The AI reads everything together and generates a professional RFI.
            </p>

            {/* ① Text / notes — always visible */}
            <div>
              <Label className="text-gray-300 text-sm mb-1.5 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[#BF9A3B]" />
                Notes or text
              </Label>
              <Textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="e.g. Need client to confirm countertop material — they mentioned quartz but haven't confirmed the color."
                className="bg-[#111] border-[#333] text-white placeholder:text-gray-600 min-h-[100px] resize-none focus:border-[#BF9A3B] focus:ring-[#BF9A3B]/20 text-sm"
              />
            </div>

            {/* ② File upload — always visible */}
            <div>
              <Label className="text-gray-300 text-sm mb-1.5 flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5 text-[#BF9A3B]" />
                Upload a file <span className="text-gray-600 font-normal">(PDF, photo — optional)</span>
              </Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/*,.doc,.docx,.heic"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  setSelectedFiles(prev => {
                    const existingNames = new Set(prev.map(f => f.name));
                    return [...prev, ...files.filter(f => !existingNames.has(f.name))];
                  });
                  e.target.value = "";
                }}
              />
              {selectedFiles.length > 0 ? (
                <div className="space-y-1.5">
                  {selectedFiles.map((file, i) => (
                    <div key={i} className="flex items-center gap-3 bg-[#2A2A2A] border border-[#BF9A3B]/40 rounded-lg p-3">
                      {file.type.startsWith("image/") ? (
                        <Image className="w-5 h-5 text-[#BF9A3B] shrink-0" />
                      ) : (
                        <FileText className="w-5 h-5 text-[#BF9A3B] shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{file.name}</p>
                        <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <button type="button" onClick={() => setSelectedFiles(prev => prev.filter((_, j) => j !== i))} className="text-gray-500 hover:text-white">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 text-xs text-gray-500 hover:text-[#BF9A3B] transition-colors mt-1"
                  >
                    <Upload className="w-3 h-3" /> Add another file
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border border-dashed border-[#333] hover:border-[#BF9A3B]/50 rounded-lg p-4 text-center transition-colors group flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4 text-gray-600 group-hover:text-[#BF9A3B] transition-colors" />
                  <span className="text-sm text-gray-500 group-hover:text-gray-300">Click to upload PDFs or images</span>
                </button>
              )}
            </div>

            {/* ③ Voice dictation — true dictation experience */}
            <div>
              <Label className="text-gray-300 text-sm mb-1.5 flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5 text-[#BF9A3B]" />
                Voice dictation <span className="text-gray-600 font-normal">(speak your notes — optional)</span>
              </Label>

              {/* ── Idle: show record button ── */}
              {dictationState === "idle" && (
                <button
                  type="button"
                  onClick={startRecording}
                  className="w-full flex items-center justify-center gap-3 rounded-lg px-4 py-3 border border-[#333] bg-[#2A2A2A] text-gray-400 hover:border-[#BF9A3B]/50 hover:text-white transition-all text-sm font-medium"
                >
                  <Mic className="w-4 h-4" />
                  Tap to dictate
                </button>
              )}

              {/* ── Recording: pulsing indicator + timer + stop button ── */}
              {dictationState === "recording" && (
                <div className="w-full rounded-lg border border-red-500/60 bg-red-500/10 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                      </span>
                      <span className="text-red-400 text-sm font-medium">Recording…</span>
                      <span className="text-red-300/70 text-sm font-mono">{formatTime(recordingSeconds)}</span>
                    </div>
                    {/* Animated voice bars */}
                    <div className="flex items-end gap-0.5 h-4">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div
                          key={i}
                          className="w-1 bg-red-400 rounded-full"
                          style={{
                            animation: `voiceBar 0.8s ease-in-out ${i * 0.1}s infinite alternate`,
                            height: "40%",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30 transition-colors text-sm font-medium"
                  >
                    <MicOff className="w-4 h-4" />
                    Stop dictation
                  </button>
                </div>
              )}

              {/* ── Transcribing: spinner ── */}
              {dictationState === "transcribing" && (
                <div className="w-full rounded-lg border border-[#BF9A3B]/40 bg-[#BF9A3B]/10 p-4 flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-[#BF9A3B] animate-spin shrink-0" />
                  <div>
                    <p className="text-sm text-[#BF9A3B] font-medium">Transcribing your dictation…</p>
                    <p className="text-xs text-gray-500 mt-0.5">Converting speech to text with AI</p>
                  </div>
                </div>
              )}

              {/* ── Ready: show transcript text ── */}
              {dictationState === "ready" && (
                <div className="w-full rounded-lg border border-green-500/30 bg-[#2A2A2A] overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-[#333]">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                      <span className="text-xs text-green-300 font-medium">Dictation transcribed</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {audioUrl && (
                        <audio src={audioUrl} controls className="h-6 max-w-[140px]" />
                      )}
                      <button
                        type="button"
                        onClick={clearDictation}
                        className="text-gray-500 hover:text-white p-1 rounded transition-colors"
                        title="Clear and re-record"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <Textarea
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    className="bg-transparent border-0 text-white min-h-[80px] resize-none focus:ring-0 text-sm leading-relaxed rounded-none"
                    placeholder="Transcript will appear here…"
                  />
                </div>
              )}

              {/* ── Error: show error + retry ── */}
              {dictationState === "error" && (
                <div className="w-full rounded-lg border border-red-500/30 bg-red-500/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span className="text-sm text-red-400 font-medium">Transcription failed</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">{dictationError || "Something went wrong. Please try again."}</p>
                  <button
                    type="button"
                    onClick={clearDictation}
                    className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Try again
                  </button>
                </div>
              )}
            </div>

            {/* Follow-up questions from AI */}
            {followUpQuestions.length > 0 && (
              <div className="bg-[#BF9A3B]/10 border border-[#BF9A3B]/30 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 text-[#BF9A3B] text-sm font-medium">
                  <HelpCircle className="w-4 h-4" />
                  The AI needs a bit more detail:
                </div>
                {followUpQuestions.map((q, i) => (
                  <div key={i}>
                    <Label className="text-gray-300 text-xs mb-1 block">{q}</Label>
                    <Input
                      value={followUpAnswers[i] ?? ""}
                      onChange={(e) => setFollowUpAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                      placeholder="Your answer…"
                      className="bg-[#111] border-[#333] text-white text-sm h-8 focus:border-[#BF9A3B]"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Generate button */}
            <div className="pt-1">
              <Button
                onClick={() => handleGenerate(followUpQuestions.length > 0)}
                disabled={!hasAnyInput || isGenerating || isDictating}
                className="w-full bg-[#BF9A3B] hover:bg-[#A8852E] text-[#1A1A1A] font-semibold h-11"
              >
                {isGenerating ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating professional RFI…</>
                ) : (
                  <><Sparkles className="w-4 h-4 mr-2" /> Generate Professional RFI</>
                )}
              </Button>
              {!hasAnyInput && !isDictating && (
                <p className="text-xs text-gray-600 text-center mt-2">
                  Add text, a file, or a voice recording above to continue.
                </p>
              )}
              {isDictating && (
                <p className="text-xs text-amber-400/70 text-center mt-2">
                  Finish your dictation first, then generate.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 2: Review ────────────────────────────────────────────────── */}
        {step === "review" && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-green-400 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              AI-generated from your inputs — review and edit before sending
            </div>

            {/* Transcript reference (collapsed by default) */}
            {transcript.trim() && (
              <details className="group">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 transition-colors flex items-center gap-1.5">
                  <Mic className="w-3 h-3" />
                  View original dictation transcript
                </summary>
                <div className="mt-2 bg-[#111] border border-[#333] rounded-lg p-3 text-xs text-gray-400 leading-relaxed whitespace-pre-wrap">
                  {transcript}
                </div>
              </details>
            )}

            <div>
              <Label className="text-gray-300 text-sm mb-2 block">RFI Title</Label>
              <Input
                value={generatedTitle}
                onChange={(e) => setGeneratedTitle(e.target.value)}
                className="bg-[#111] border-[#333] text-white focus:border-[#BF9A3B]"
              />
            </div>

            <div>
              <Label className="text-gray-300 text-sm mb-2 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-[#BF9A3B]" />
                Email Body
              </Label>
              <Textarea
                value={generatedBody}
                onChange={(e) => setGeneratedBody(e.target.value)}
                className="bg-[#111] border-[#333] text-white min-h-[200px] resize-none focus:border-[#BF9A3B] text-sm leading-relaxed"
              />
            </div>

            {/* SMS body — editable */}
            <div>
              <Label className="text-gray-300 text-sm mb-2 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-[#BF9A3B]" />
                SMS Draft
                <span className="text-gray-600 font-normal text-xs ml-1">(max 160 chars — edit if needed)</span>
              </Label>
              <Textarea
                value={generatedSms}
                onChange={(e) => setGeneratedSms(e.target.value.slice(0, 320))}
                placeholder="Short SMS message for the client…"
                className="bg-[#111] border-[#333] text-white min-h-[72px] resize-none focus:border-[#BF9A3B] text-sm leading-relaxed"
              />
              <p className={`text-xs mt-1 text-right ${
                generatedSms.length > 160 ? "text-amber-400" : "text-gray-600"
              }`}>
                {generatedSms.length}/160 chars
                {generatedSms.length > 160 ? " — will split into 2 messages" : ""}
              </p>
            </div>

            {/* Attachments */}
            <div>
              <Label className="text-gray-300 text-sm mb-2 block">
                Attachments <span className="text-gray-600 font-normal">(optional — sent to client with RFI)</span>
              </Label>
              <input
                ref={attachInputRef}
                type="file"
                accept=".pdf,image/*,.doc,.docx"
                multiple
                className="hidden"
                onChange={(e) => {
                  Array.from(e.target.files ?? []).forEach(handleAddAttachment);
                  e.target.value = "";
                }}
              />
              {pendingAttachments.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {pendingAttachments.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 bg-[#2A2A2A] rounded px-3 py-2">
                      <FileText className="w-3.5 h-3.5 text-[#BF9A3B] shrink-0" />
                      <span className="text-xs text-gray-300 truncate flex-1">{f.name}</span>
                      <span className="text-xs text-gray-500">{(f.size / 1024).toFixed(0)} KB</span>
                      <button
                        type="button"
                        onClick={() => setPendingAttachments(prev => prev.filter((_, j) => j !== i))}
                        className="text-gray-600 hover:text-white ml-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => attachInputRef.current?.click()}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#BF9A3B] transition-colors border border-dashed border-[#333] hover:border-[#BF9A3B]/50 rounded-md px-3 py-2 w-full"
              >
                <Upload className="w-3.5 h-3.5" />
                Add PDF, image, or document
              </button>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setStep("input")}
                className="flex-1 border-[#333] text-gray-300 hover:text-white bg-transparent"
              >
                ← Revise Input
              </Button>
              <Button
                onClick={handleReviewAndSend}
                disabled={isSaving || !generatedTitle.trim() || !generatedBody.trim()}
                className="flex-1 bg-[#BF9A3B] hover:bg-[#A8852E] text-[#1A1A1A] font-semibold"
              >
                {isSaving ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
                ) : (
                  <><Eye className="w-4 h-4 mr-1.5" /> Review &amp; Send</>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Send Preview ──────────────────────────────────────────── */}
        {step === "send-preview" && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-[#BF9A3B] text-sm font-medium">
              <Eye className="w-4 h-4" />
              Review what the client will receive — then send
            </div>

            {/* Email Preview */}
            <div className="rounded-lg border border-[#333] overflow-hidden">
              <div className="flex items-center justify-between bg-[#2A2A2A] px-4 py-3 border-b border-[#333]">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#BF9A3B]" />
                  <span className="text-sm font-medium text-white">Email Preview</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSendEmail(v => !v)}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-colors ${
                    sendEmail
                      ? "bg-green-500/20 border-green-500/40 text-green-400"
                      : "bg-[#1A1A1A] border-[#444] text-gray-500"
                  }`}
                >
                  {sendEmail ? <CheckCircle2 className="w-3 h-3" /> : <X className="w-3 h-3" />}
                  {sendEmail ? "Included" : "Excluded"}
                </button>
              </div>
              <div className="p-4 space-y-3 bg-[#1A1A1A]">
                <div className="text-xs text-gray-500 space-y-1">
                  <p><span className="text-gray-400 font-medium">From:</span> Kitchens Plus Upstate &lt;chad@kitchensplusupstate.com&gt;</p>
                  {clientEmail && (
                    <p><span className="text-gray-400 font-medium">To:</span> {clientName ? `${clientName} <${clientEmail}>` : clientEmail}</p>
                  )}
                  <p><span className="text-gray-400 font-medium">Subject:</span> Action Required: {generatedTitle} — Kitchens Plus Upstate</p>
                </div>
                <div className="bg-[#F8F6F1] rounded-lg p-4 text-[#333] text-sm space-y-3">
                  <div className="bg-[#1A1A1A] px-4 py-3 rounded-t-lg -mx-4 -mt-4 mb-3">
                    <p className="text-[#BF9A3B] font-serif text-base">Kitchens Plus Upstate</p>
                    <p className="text-[#999] text-xs uppercase tracking-widest">Request for Information</p>
                  </div>
                  <p className="text-[#333] text-sm">Dear {clientName ?? "[Client Name]"},</p>
                  <p className="text-[#555] text-xs leading-relaxed">
                    We have a request for information regarding your project. Please review the details below and respond at your earliest convenience.
                  </p>
                  <div className="bg-[#F8F6F1] border-l-4 border-[#BF9A3B] pl-4 py-3 rounded-r">
                    <p className="text-[#BF9A3B] text-xs font-bold uppercase tracking-wide mb-1">RFI: {generatedTitle}</p>
                    <p className="text-[#333] text-xs leading-relaxed whitespace-pre-wrap">
                      {generatedBody.slice(0, 300)}{generatedBody.length > 300 ? "…" : ""}
                    </p>
                  </div>
                  <div className="text-center py-2">
                    <span className="bg-[#BF9A3B] text-[#1A1A1A] text-xs font-bold px-6 py-2 rounded inline-block">
                      Review &amp; Respond to RFI →
                    </span>
                  </div>
                  <p className="text-[#999] text-xs text-center">
                    Kitchens Plus Upstate · Questions? Call Chad at 864-567-8777 or reply to this email.
                  </p>
                </div>
              </div>
            </div>

            {/* SMS Preview */}
            <div className="rounded-lg border border-[#333] overflow-hidden">
              <div className="flex items-center justify-between bg-[#2A2A2A] px-4 py-3 border-b border-[#333]">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#BF9A3B]" />
                  <span className="text-sm font-medium text-white">SMS Preview</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSendSmsToggle(v => !v)}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-colors ${
                    sendSmsToggle
                      ? "bg-green-500/20 border-green-500/40 text-green-400"
                      : "bg-[#1A1A1A] border-[#444] text-gray-500"
                  }`}
                >
                  {sendSmsToggle ? <CheckCircle2 className="w-3 h-3" /> : <X className="w-3 h-3" />}
                  {sendSmsToggle ? "Included" : "Excluded"}
                </button>
              </div>
              <div className="p-4 bg-[#1A1A1A]">
                <div className="bg-[#2A2A2A] rounded-2xl rounded-tl-sm px-4 py-3 max-w-sm">
                  <p className="text-sm text-gray-200 leading-relaxed">
                    {generatedSms || `Hi ${clientName ?? "[Client Name]"}, Kitchens Plus Upstate has a Request for Information: "${generatedTitle}". Please review and respond here: [portal link]`}
                  </p>
                  {clientPhone && (
                    <p className="text-gray-500 text-xs mt-1">Sending to: {clientPhone}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    Call Chad at 864-567-8777 | Reply STOP to opt out.
                  </p>
                </div>
                {generatedSms && (
                  <p className={`text-xs mt-2 ${
                    generatedSms.length > 160 ? "text-amber-400" : "text-gray-600"
                  }`}>
                    {generatedSms.length}/160 chars
                    {generatedSms.length > 160 ? " — will send as 2 messages" : ""}
                  </p>
                )}
              </div>
            </div>

            {!sendEmail && !sendSmsToggle && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-amber-400 text-sm">
                Both channels are excluded — the RFI is saved as a draft but will not be sent. Enable at least one channel to notify the client.
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setStep("review")}
                className="flex-1 border-[#333] text-gray-300 hover:text-white bg-transparent"
              >
                <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Edit
              </Button>
              <Button
                onClick={handleSend}
                disabled={isSending || (!sendEmail && !sendSmsToggle)}
                className="flex-1 bg-[#BF9A3B] hover:bg-[#A8852E] text-[#1A1A1A] font-semibold"
              >
                {isSending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</>
                ) : (
                  <><Send className="w-4 h-4 mr-1.5" /> Send RFI Now</>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Voice bar animation keyframes */}
        <style>{`
          @keyframes voiceBar {
            0% { height: 20%; }
            100% { height: 100%; }
          }
        `}</style>
      </DialogContent>
    </Dialog>
  );
}
