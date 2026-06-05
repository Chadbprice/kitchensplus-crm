import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Sparkles, Mic, MicOff, Upload, FileText, Image as ImageIcon,
  ChevronDown, ChevronUp, Loader2, X, MessageSquare, CheckCircle2, CornerDownLeft
} from "lucide-react";

const GOLD = "#BF9A3B";

export interface ExtractedLeadFields {
  name?: string;
  phones?: string[];
  emails?: string[];
  address?: string;
  projectType?: string;
  source?: string;
  notes?: string;
}

interface LeadAIIntakeBarProps {
  /** Called when AI successfully extracts fields — caller should merge into form state */
  onFieldsExtracted: (fields: ExtractedLeadFields) => void;
  /** Current form values so AI can avoid asking about already-filled fields */
  currentFields?: ExtractedLeadFields;
}

type Mode = "collapsed" | "paste" | "upload" | "dictate";

export default function LeadAIIntakeBar({ onFieldsExtracted, currentFields }: LeadAIIntakeBarProps) {
  const [mode, setMode] = useState<Mode>("collapsed");
  const [pasteText, setPasteText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [followUpAnswer, setFollowUpAnswer] = useState("");
  const [previousFields, setPreviousFields] = useState<Record<string, any>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const aiExtract = trpc.leads.aiExtract.useMutation();
  const transcribeAndExtract = trpc.leads.transcribeAndExtract.useMutation();

  // ── Merge extracted fields into the parent form ───────────────────────────
  function applyFields(extracted: any) {
    const phones: string[] = [
      extracted.phone,
      extracted.phone2,
      extracted.phone3,
    ].filter(Boolean) as string[];

    const emails: string[] = [
      extracted.email,
      extracted.email2,
      extracted.email3,
    ].filter(Boolean) as string[];

    const merged: ExtractedLeadFields = {};
    if (extracted.name) merged.name = extracted.name;
    if (phones.length > 0) merged.phones = phones;
    if (emails.length > 0) merged.emails = emails;
    if (extracted.address) merged.address = extracted.address;
    if (extracted.projectType) merged.projectType = extracted.projectType;
    if (extracted.source) merged.source = extracted.source;
    if (extracted.notes) merged.notes = extracted.notes;

    onFieldsExtracted(merged);

    // Store for follow-up merging
    setPreviousFields((prev) => ({ ...prev, ...extracted }));

    return extracted.followUpQuestions ?? [];
  }

  // ── Process pasted text ───────────────────────────────────────────────────
  const handlePasteExtract = useCallback(async () => {
    if (!pasteText.trim()) { toast.error("Please paste some text first"); return; }
    setIsProcessing(true);
    try {
      const result = await aiExtract.mutateAsync({
        text: pasteText,
        previousFields: currentFields as any,
      });
      const questions = applyFields(result);
      if (questions.length > 0) {
        setFollowUpQuestions(questions);
        setCurrentQuestionIdx(0);
        setFollowUpAnswer("");
        toast.success("Fields extracted! Please answer the follow-up questions.");
      } else {
        toast.success("Lead info extracted and filled in!");
        setMode("collapsed");
        setPasteText("");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Extraction failed");
    } finally {
      setIsProcessing(false);
    }
  }, [pasteText, aiExtract, currentFields]);

  // ── Process uploaded file ─────────────────────────────────────────────────
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const isPdf = file.type === "application/pdf";
    const isImage = file.type.startsWith("image/");
    if (!isPdf && !isImage) {
      toast.error("Please upload a PDF or image file");
      return;
    }

    setIsProcessing(true);
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = (ev) => res(ev.target?.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });

      const result = await aiExtract.mutateAsync({
        fileDataUrl: dataUrl,
        fileMime: file.type,
        previousFields: currentFields as any,
      });
      const questions = applyFields(result);
      if (questions.length > 0) {
        setFollowUpQuestions(questions);
        setCurrentQuestionIdx(0);
        setFollowUpAnswer("");
        toast.success("Fields extracted from file! Please answer follow-up questions.");
      } else {
        toast.success("Lead info extracted from file!");
        setMode("collapsed");
      }
    } catch (e: any) {
      toast.error(e.message ?? "File extraction failed");
    } finally {
      setIsProcessing(false);
    }
  }, [aiExtract, currentFields]);

  // ── Voice dictation ───────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      toast.error("Microphone access denied. Please allow microphone access and try again.");
    }
  }, []);

  const stopRecordingAndProcess = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    setIsRecording(false);

    await new Promise<void>((res) => {
      recorder.onstop = () => res();
      recorder.stop();
      recorder.stream.getTracks().forEach((t) => t.stop());
    });

    const mimeType = recorder.mimeType || "audio/webm";
    const blob = new Blob(audioChunksRef.current, { type: mimeType });
    if (blob.size < 1000) { toast.error("Recording too short — please try again"); return; }

    setIsProcessing(true);
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = (ev) => res(ev.target?.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(blob);
      });

      const result = await transcribeAndExtract.mutateAsync({
        audioDataUrl: dataUrl,
        audioMime: mimeType,
      });
      const questions = applyFields(result);
      if (result.transcript) {
        toast.success(`Transcribed: "${result.transcript.slice(0, 60)}${result.transcript.length > 60 ? "…" : ""}"`);
      }
      if (questions.length > 0) {
        setFollowUpQuestions(questions);
        setCurrentQuestionIdx(0);
        setFollowUpAnswer("");
      } else {
        setMode("collapsed");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Transcription failed");
    } finally {
      setIsProcessing(false);
    }
  }, [transcribeAndExtract]);

  // ── Answer a follow-up question ───────────────────────────────────────────
  const handleFollowUpSubmit = useCallback(async () => {
    if (!followUpAnswer.trim()) return;
    const question = followUpQuestions[currentQuestionIdx];
    setIsProcessing(true);
    try {
      const result = await aiExtract.mutateAsync({
        followUpAnswer: { question, answer: followUpAnswer },
        previousFields,
      });
      const newQuestions = applyFields(result);
      const nextIdx = currentQuestionIdx + 1;
      if (newQuestions.length > 0 && nextIdx < newQuestions.length) {
        setFollowUpQuestions(newQuestions);
        setCurrentQuestionIdx(nextIdx);
        setFollowUpAnswer("");
      } else if (nextIdx < followUpQuestions.length) {
        setCurrentQuestionIdx(nextIdx);
        setFollowUpAnswer("");
      } else {
        setFollowUpQuestions([]);
        setCurrentQuestionIdx(0);
        setFollowUpAnswer("");
        setMode("collapsed");
        setPasteText("");
        toast.success("All done — form filled in!");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Failed to process answer");
    } finally {
      setIsProcessing(false);
    }
  }, [followUpAnswer, followUpQuestions, currentQuestionIdx, aiExtract, previousFields]);

  const dismissFollowUps = () => {
    setFollowUpQuestions([]);
    setCurrentQuestionIdx(0);
    setFollowUpAnswer("");
    setMode("collapsed");
    setPasteText("");
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-border/60 overflow-hidden"
      style={{ background: "linear-gradient(135deg, #1E1F1A 0%, #252620 100%)", borderColor: `${GOLD}30` }}>

      {/* Follow-up question bubble */}
      {followUpQuestions.length > 0 && (
        <div className="px-4 pt-3 pb-2">
          <div className="rounded-lg p-3 space-y-2"
            style={{ background: `${GOLD}12`, border: `1px solid ${GOLD}30` }}>
            <div className="flex items-start gap-2">
              <MessageSquare className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" style={{ color: GOLD }} />
              <div className="flex-1 space-y-2">
                <p className="text-xs font-medium" style={{ color: GOLD }}>
                  Question {currentQuestionIdx + 1} of {followUpQuestions.length}
                </p>
                <p className="text-sm text-foreground leading-snug">
                  {followUpQuestions[currentQuestionIdx]}
                </p>
                <div className="flex gap-2">
                  <Input
                    className="bg-background border-border text-sm h-8 flex-1"
                    placeholder="Type your answer…"
                    value={followUpAnswer}
                    onChange={(e) => setFollowUpAnswer(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleFollowUpSubmit(); } }}
                    disabled={isProcessing}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    className="h-8 px-3 gap-1"
                    style={{ background: GOLD, color: "#1E1F1A" }}
                    onClick={handleFollowUpSubmit}
                    disabled={isProcessing || !followUpAnswer.trim()}
                  >
                    {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CornerDownLeft className="h-3 w-3" />}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-muted-foreground" onClick={dismissFollowUps}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main bar */}
      <div className="px-4 py-3">
        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" style={{ color: GOLD }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
              AI Lead Intake
            </span>
            <span className="text-[10px] text-muted-foreground">
              — paste text, upload a file, or dictate
            </span>
          </div>
          <button
            className="text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setMode(mode === "collapsed" ? "paste" : "collapsed")}
          >
            {mode === "collapsed"
              ? <ChevronDown className="h-4 w-4" />
              : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>

        {/* Mode buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode(mode === "paste" ? "collapsed" : "paste")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              mode === "paste"
                ? "text-[#1E1F1A]"
                : "text-muted-foreground hover:text-foreground border border-border/60 hover:border-border"
            }`}
            style={mode === "paste" ? { background: GOLD } : {}}
          >
            <FileText className="h-3 w-3" />
            Paste Text
          </button>

          <button
            onClick={() => { setMode("upload"); fileInputRef.current?.click(); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              mode === "upload"
                ? "text-[#1E1F1A]"
                : "text-muted-foreground hover:text-foreground border border-border/60 hover:border-border"
            }`}
            style={mode === "upload" ? { background: GOLD } : {}}
            disabled={isProcessing}
          >
            {isProcessing && mode === "upload"
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <ImageIcon className="h-3 w-3" />}
            Upload File
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={handleFileUpload}
          />

          <button
            onClick={isRecording ? stopRecordingAndProcess : startRecording}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isRecording
                ? "animate-pulse"
                : "text-muted-foreground hover:text-foreground border border-border/60 hover:border-border"
            }`}
            style={isRecording ? { background: "#E05252", color: "#fff" } : {}}
            disabled={isProcessing && !isRecording}
          >
            {isProcessing && mode === "dictate"
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : isRecording
              ? <MicOff className="h-3 w-3" />
              : <Mic className="h-3 w-3" />}
            {isRecording ? "Stop & Process" : "Dictate"}
          </button>
        </div>

        {/* Paste text area */}
        {mode === "paste" && (
          <div className="mt-3 space-y-2">
            <Textarea
              className="bg-background border-border resize-none text-sm"
              rows={4}
              placeholder="Paste an email, text message, web form submission, or any text with client contact info…"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              disabled={isProcessing}
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground h-8"
                onClick={() => { setMode("collapsed"); setPasteText(""); }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 gap-1.5"
                style={{ background: GOLD, color: "#1E1F1A" }}
                onClick={handlePasteExtract}
                disabled={isProcessing || !pasteText.trim()}
              >
                {isProcessing
                  ? <><Loader2 className="h-3 w-3 animate-spin" /> Extracting…</>
                  : <><CheckCircle2 className="h-3 w-3" /> Extract & Fill</>}
              </Button>
            </div>
          </div>
        )}

        {/* Recording indicator */}
        {isRecording && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: "#E0525215", border: "1px solid #E0525240" }}>
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs text-red-400 font-medium">Recording… speak clearly, then click "Stop &amp; Process"</span>
          </div>
        )}

        {/* Processing indicator */}
        {isProcessing && !isRecording && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: `${GOLD}10`, border: `1px solid ${GOLD}25` }}>
            <Loader2 className="h-3 w-3 animate-spin" style={{ color: GOLD }} />
            <span className="text-xs" style={{ color: GOLD }}>AI is reading the content and extracting lead info…</span>
          </div>
        )}
      </div>
    </div>
  );
}
