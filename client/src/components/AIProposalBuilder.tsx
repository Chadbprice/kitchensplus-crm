import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Sparkles, Send, Trash2, ChevronDown, ChevronUp,
  Plus, Loader2, Bot, User, CheckCheck, Mic, MicOff,
  TrendingUp, Paperclip, X, FileText, Image as ImageIcon,
  Check, XCircle, AlertCircle, PenLine, ShieldCheck, Square,
  Edit3,
} from "lucide-react";
import ProposalFileUpload, { type UploadedFile } from "@/components/ProposalFileUpload";

const GOLD = "#BF9A3B";
const GREEN = "#4CAF7D";
const RED = "#E05252";

export type AILineItem = {
  task: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  category: string;
  /** Optional: source of the price pre-fill */
  pricedFrom?: { avgPrice: string; matchCount: number; sampleTask: string };
};

// ─── Simplified review state ─────────────────────────────────────────────────
type ReviewItem = {
  id: string;
  task: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  category: string;
  pricedFrom?: AILineItem["pricedFrom"];
  accepted: boolean; // true = will be inserted, false = rejected/removed
  editing: boolean;  // true = inline edit mode open
};

type Message = {
  role: "user" | "assistant";
  content: string;
  isVoice?: boolean;
};

interface AIProposalBuilderProps {
  proposalTitle?: string;
  existingItems?: Array<{
    task?: string;
    description?: string;
    quantity?: string;
    unitPrice?: string;
    category?: string;
  }>;
  onApplySuggestions: (items: AILineItem[]) => void;
  defaultOpen?: boolean;
}

// ─── Voice recording hook with duration tracking ─────────────────────────────
function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } catch {
      toast.error("Microphone access denied. Please allow microphone access and try again.");
    }
  }, []);

  const stopRecording = useCallback((): Promise<{ blob: Blob; mimeType: string } | null> => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") { setIsRecording(false); resolve(null); return; }
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        recorder.stream.getTracks().forEach(t => t.stop());
        setIsRecording(false);
        resolve({ blob, mimeType });
      };
      recorder.stop();
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return { isRecording, isProcessing, setIsProcessing, startRecording, stopRecording, duration };
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Price hint badge ─────────────────────────────────────────────────────────
function PriceHint({ matchCount, avgPrice, sampleTask }: {
  matchCount: number; avgPrice: string; sampleTask: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium cursor-help"
      style={{ background: `${GOLD}18`, color: GOLD, border: `1px solid ${GOLD}30` }}
      title={`Based on ${matchCount} past proposal${matchCount !== 1 ? "s" : ""} — last similar: "${sampleTask}"`}
    >
      <TrendingUp className="h-2.5 w-2.5" />
      Avg ${avgPrice} · {matchCount} past job{matchCount !== 1 ? "s" : ""}
    </span>
  );
}

// ─── Category colors ─────────────────────────────────────────────────────────
const categoryColor: Record<string, string> = {
  material: "#5B9BD5",
  labor: "#4CAF7D",
  subcontractor: "#9B59B6",
  permit: "#E8A838",
  other: "#8A8B82",
};

// ─── Review item card (compact, inline-editable) ─────────────────────────────
function ReviewItemCard({
  item,
  index,
  onToggleAccept,
  onToggleEdit,
  onUpdate,
  onRemove,
}: {
  item: ReviewItem;
  index: number;
  onToggleAccept: () => void;
  onToggleEdit: () => void;
  onUpdate: (updates: Partial<ReviewItem>) => void;
  onRemove: () => void;
}) {
  const catColor = categoryColor[item.category] ?? "#8A8B82";

  return (
    <div
      className="rounded-lg border transition-all"
      style={{
        borderColor: !item.accepted ? `${RED}30` : `${GOLD}25`,
        opacity: item.accepted ? 1 : 0.5,
        background: !item.accepted ? `${RED}05` : "var(--card)",
      }}
    >
      {/* Compact header */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: item.editing ? `1px solid ${GOLD}20` : "none" }}>
        {/* Accept/reject toggle */}
        <button
          type="button"
          onClick={onToggleAccept}
          className="h-6 w-6 rounded-full flex items-center justify-center border transition-all shrink-0"
          style={item.accepted
            ? { background: GREEN, borderColor: GREEN, color: "white" }
            : { borderColor: `${RED}50`, color: RED, background: `${RED}10` }}
          title={item.accepted ? "Click to exclude this item" : "Click to include this item"}
        >
          {item.accepted ? <Check className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
        </button>

        {/* Item summary */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium truncate">{item.task || "Untitled"}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
              style={{ background: `${catColor}20`, color: catColor }}>
              {item.category}
            </span>
            {item.pricedFrom && (
              <PriceHint
                avgPrice={item.pricedFrom.avgPrice}
                matchCount={item.pricedFrom.matchCount}
                sampleTask={item.pricedFrom.sampleTask}
              />
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span>Qty: {item.quantity} {item.unit}</span>
            {item.unitPrice ? (
              <span>@ ${item.unitPrice}/{item.unit || "ea"}</span>
            ) : (
              <span className="italic" style={{ color: GOLD }}>Price: TBD</span>
            )}
          </div>
        </div>

        {/* Edit toggle */}
        <button
          type="button"
          onClick={onToggleEdit}
          className="h-7 w-7 rounded flex items-center justify-center transition-all shrink-0"
          style={item.editing
            ? { background: `${GOLD}20`, color: GOLD }
            : { color: "var(--muted-foreground)" }}
          title="Edit this item"
        >
          <Edit3 className="h-3.5 w-3.5" />
        </button>

        {/* Remove */}
        <button
          type="button"
          onClick={onRemove}
          className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors shrink-0"
          title="Remove this item"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Inline edit panel */}
      {item.editing && (
        <div className="px-3 pb-3 pt-1 space-y-2">
          <div className="grid grid-cols-1 gap-2">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Task / Title</label>
              <Input
                value={item.task}
                onChange={e => onUpdate({ task: e.target.value })}
                className="text-sm mt-0.5"
                placeholder="Task name"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Description</label>
              <Textarea
                value={item.description}
                onChange={e => onUpdate({ description: e.target.value })}
                className="text-sm mt-0.5 min-h-[50px] resize-none"
                placeholder="Description"
              />
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Qty</label>
                <Input
                  value={item.quantity}
                  onChange={e => onUpdate({ quantity: e.target.value })}
                  className="text-sm mt-0.5"
                  placeholder="1"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Unit</label>
                <Input
                  value={item.unit}
                  onChange={e => onUpdate({ unit: e.target.value })}
                  className="text-sm mt-0.5"
                  placeholder="EA"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Price ($)</label>
                <Input
                  value={item.unitPrice}
                  onChange={e => onUpdate({ unitPrice: e.target.value })}
                  className="text-sm mt-0.5"
                  placeholder="—"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Category</label>
                <select
                  value={item.category}
                  onChange={e => onUpdate({ category: e.target.value })}
                  className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm mt-0.5"
                >
                  <option value="labor">Labor</option>
                  <option value="material">Material</option>
                  <option value="subcontractor">Subcontractor</option>
                  <option value="permit">Permit</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AIProposalBuilder({
  proposalTitle,
  existingItems = [],
  onApplySuggestions,
  defaultOpen = false,
}: AIProposalBuilderProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const aiSuggest = trpc.estimates.aiSuggestLineItems.useMutation();
  const voiceToLineItems = trpc.estimates.voiceToLineItems.useMutation();
  const utils = trpc.useUtils();
  const [voiceStage, setVoiceStage] = useState<"" | "uploading" | "transcribing" | "generating">("")

  const { isRecording, isProcessing, setIsProcessing, startRecording, stopRecording, duration } = useVoiceRecorder();

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const conversationHistory = messages.map(m => ({ role: m.role, content: m.content }));

  // ─── Enrich AI items with historical pricing ──────────────────────────────
  async function enrichWithHistoricalPricing(items: AILineItem[]): Promise<AILineItem[]> {
    return Promise.all(items.map(async (item) => {
      if (item.unitPrice && item.unitPrice !== "" && item.unitPrice !== "0") return item;
      try {
        const hist = await utils.estimates.getHistoricalPricing.fetch({ taskName: item.task });
        if (hist && parseFloat(hist.avgUnitPrice) > 0) {
          return {
            ...item,
            unitPrice: hist.avgUnitPrice,
            pricedFrom: { avgPrice: hist.avgUnitPrice, matchCount: hist.matchCount, sampleTask: hist.sampleTask },
          };
        }
      } catch { /* silently skip */ }
      return item;
    }));
  }

  // ─── Convert AI items → review items (all accepted by default) ────────────
  function buildReviewItems(items: AILineItem[]): ReviewItem[] {
    return items.map((item, i) => ({
      id: `${Date.now()}-${i}`,
      task: item.task,
      description: item.description,
      quantity: item.quantity || "1",
      unit: item.unit || "EA",
      unitPrice: item.unitPrice || "",
      category: item.category || "labor",
      pricedFrom: item.pricedFrom,
      accepted: true,
      editing: false,
    }));
  }

  function buildFileContext(): string {
    const readyFiles = uploadedFiles.filter(f => f.status === "ready");
    const textFiles = readyFiles.filter(f => f.extractedText?.trim());
    const imageFiles = readyFiles.filter(f => f.previewUrl && !f.extractedText);
    if (textFiles.length === 0 && imageFiles.length === 0) return "";
    const parts: string[] = [];
    if (textFiles.length > 0) {
      parts.push(
        `[Attached documents — use this content to inform the proposal line items:]\n` +
        textFiles.map(f => `--- ${f.name} ---\n${f.extractedText!.slice(0, 4000)}`).join("\n\n")
      );
    }
    if (imageFiles.length > 0) {
      parts.push(`[Attached images: ${imageFiles.map(f => f.name).join(", ")} — use these as visual references for the scope of work]`);
    }
    return parts.join("\n\n");
  }

  function removeFile(fileId: string) {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  }

  async function handleSend(overrideMsg?: string) {
    const msg = (overrideMsg ?? input).trim();
    if (!msg) return;

    const isVoice = !!overrideMsg && overrideMsg !== input;
    setMessages(prev => [...prev, { role: "user", content: msg, isVoice }]);
    setInput("");
    setReviewItems([]);

    const fileContext = buildFileContext();
    const enrichedMsg = fileContext ? `${fileContext}\n\nUser request: ${msg}` : msg;

    try {
      const result = await aiSuggest.mutateAsync({
        userMessage: enrichedMsg,
        proposalTitle: proposalTitle || undefined,
        existingItems: existingItems.map(item => ({
          task: item.task || undefined,
          description: item.description || undefined,
          quantity: item.quantity || undefined,
          unitPrice: item.unitPrice || undefined,
          category: item.category || undefined,
        })),
        conversationHistory: conversationHistory.map(m => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      });

      const enrichedItems = await enrichWithHistoricalPricing(result.items as AILineItem[]);

      setMessages(prev => [...prev, { role: "assistant", content: result.assistantMessage }]);

      if (enrichedItems.length > 0) {
        setReviewItems(buildReviewItems(enrichedItems));
        toast.success(`${enrichedItems.length} line item${enrichedItems.length > 1 ? "s" : ""} ready for review`);
      } else {
        toast.info("AI didn't generate any line items. Try describing the work more specifically.");
      }
    } catch (err: any) {
      const errMsg = err?.message || "Unknown error";
      toast.error("AI processing failed: " + errMsg);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Sorry, I encountered an error: ${errMsg}. Please try again — if the issue persists, try simplifying your description.`,
      }]);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  // ─── Voice recording → single-call voice-to-line-items ────────────────────
  async function handleVoiceToggle() {
    if (isRecording) {
      setIsProcessing(true);
      setVoiceStage("uploading");
      const result = await stopRecording();
      if (!result) { setIsProcessing(false); setVoiceStage(""); return; }
      try {
        // Convert blob to base64
        const arrayBuffer = await result.blob.arrayBuffer();
        const base64 = btoa(new Uint8Array(arrayBuffer).reduce((d, b) => d + String.fromCharCode(b), ""));

        setVoiceStage("transcribing");

        // Build file context if any files are attached
        const fileContext = buildFileContext();

        // Single server call: audio → transcript → line items
        const voiceResult = await voiceToLineItems.mutateAsync({
          audioBase64: base64,
          mimeType: result.mimeType,
          proposalTitle: proposalTitle || undefined,
          existingItems: existingItems.map(item => ({
            task: item.task || undefined,
            description: item.description || undefined,
            quantity: item.quantity || undefined,
            unitPrice: item.unitPrice || undefined,
            category: item.category || undefined,
          })),
          fileContext: fileContext || undefined,
          conversationHistory: conversationHistory.map(m => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        });

        setVoiceStage("generating");

        // Show transcript as a voice message in chat
        if (voiceResult.transcript) {
          setMessages(prev => [...prev, { role: "user", content: voiceResult.transcript, isVoice: true }]);
        }

        // Show AI response in chat
        setMessages(prev => [...prev, { role: "assistant", content: voiceResult.assistantMessage }]);

        // Enrich items with historical pricing and build review queue
        const enrichedItems = await enrichWithHistoricalPricing(voiceResult.items as AILineItem[]);
        if (enrichedItems.length > 0) {
          setReviewItems(buildReviewItems(enrichedItems));
          toast.success(`${enrichedItems.length} line item${enrichedItems.length > 1 ? "s" : ""} ready for review`);
        } else {
          toast.info("AI didn't generate any line items from your voice. Try again with more detail.");
        }
      } catch (err: any) {
        const errMsg = err?.message || "Unknown error";
        toast.error("Voice processing failed: " + errMsg);
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `Sorry, I couldn't process your voice input: ${errMsg}. Try again — speak clearly and describe the scope of work.`,
        }]);
      } finally {
        setIsProcessing(false);
        setVoiceStage("");
      }
    } else {
      await startRecording();
    }
  }

  // ─── Review item mutations ────────────────────────────────────────────────
  function toggleItemAccept(id: string) {
    setReviewItems(prev => prev.map(item =>
      item.id === id ? { ...item, accepted: !item.accepted } : item
    ));
  }

  function toggleItemEdit(id: string) {
    setReviewItems(prev => prev.map(item =>
      item.id === id ? { ...item, editing: !item.editing } : item
    ));
  }

  function updateItem(id: string, updates: Partial<ReviewItem>) {
    setReviewItems(prev => prev.map(item =>
      item.id === id ? { ...item, ...updates } : item
    ));
  }

  function removeItem(id: string) {
    setReviewItems(prev => prev.filter(item => item.id !== id));
  }

  // ─── Insert accepted items into the proposal form ─────────────────────────
  function handleInsertAccepted() {
    const toInsert: AILineItem[] = reviewItems
      .filter(item => item.accepted)
      .map(item => ({
        task: item.task,
        description: item.description,
        quantity: item.quantity || "1",
        unit: item.unit || "",
        unitPrice: item.unitPrice || "",
        category: item.category,
        pricedFrom: item.pricedFrom,
      }));

    if (toInsert.length === 0) {
      toast.error("No items selected. Accept at least one item to insert.");
      return;
    }

    onApplySuggestions(toInsert);
    setReviewItems([]);
    toast.success(`${toInsert.length} line item${toInsert.length > 1 ? "s" : ""} inserted into proposal`);
  }

  function handleClearReview() {
    setReviewItems([]);
  }

  function handleClearChat() {
    setMessages([]);
    setReviewItems([]);
    setInput("");
  }

  const readyFileCount = uploadedFiles.filter(f => f.status === "ready").length;
  const isVoiceBusy = isRecording || isProcessing || voiceToLineItems.isPending;
  const acceptedCount = reviewItems.filter(i => i.accepted).length;

  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ borderColor: `${GOLD}40`, background: `${GOLD}06` }}>
      {/* Header / Toggle */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 hover:opacity-80 transition-opacity"
        style={{ background: `${GOLD}12` }}
        onClick={() => setIsOpen(v => !v)}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" style={{ color: GOLD }} />
          <span className="font-semibold text-sm" style={{ color: GOLD }}>
            AI Proposal Builder
          </span>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            — speak or type the scope, review items, insert into proposal
          </span>
        </div>
        <div className="flex items-center gap-2">
          {readyFileCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: `${GOLD}25`, color: GOLD, border: `1px solid ${GOLD}50` }}
              title={`${readyFileCount} file${readyFileCount !== 1 ? "s" : ""} in AI context`}>
              <Paperclip className="h-3 w-3" />
              {readyFileCount}
            </span>
          )}
          {reviewItems.length > 0 && (
            <Badge variant="secondary" className="text-xs" style={{ background: `${GOLD}20`, color: GOLD }}>
              {reviewItems.length} items ready
            </Badge>
          )}
          {messages.length > 0 && reviewItems.length === 0 && (
            <Badge variant="secondary" className="text-xs">
              {messages.filter(m => m.role === "user").length} message{messages.filter(m => m.role === "user").length !== 1 ? "s" : ""}
            </Badge>
          )}
          {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Body */}
      {isOpen && (
        <div className="flex flex-col">

          {/* ── RECORDING INDICATOR (prominent, full-width) ──────────────── */}
          {isRecording && (
            <div className="px-4 py-3 flex items-center gap-3"
              style={{ background: "#ef444415", borderBottom: "1px solid #ef444440" }}>
              {/* Pulsing red dot */}
              <div className="relative flex items-center justify-center">
                <span className="absolute h-8 w-8 rounded-full bg-red-500/30 animate-ping" />
                <span className="relative h-4 w-4 rounded-full bg-red-500 shadow-lg shadow-red-500/50" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-red-400">Recording</span>
                  <span className="text-sm font-mono text-red-300">{formatDuration(duration)}</span>
                </div>
                <p className="text-xs text-red-300/70 mt-0.5">
                  Speak the scope of work — tap the stop button when done
                </p>
              </div>
              {/* Animated bars */}
              <div className="flex items-end gap-0.5 h-6">
                {[1, 2, 3, 4, 5].map(i => (
                  <div
                    key={i}
                    className="w-1 rounded-full bg-red-400"
                    style={{
                      animation: `voiceBar 0.8s ease-in-out ${i * 0.1}s infinite alternate`,
                      height: "30%",
                    }}
                  />
                ))}
              </div>
              {/* Stop button */}
              <Button
                type="button"
                size="sm"
                className="shrink-0"
                style={{ background: "#ef4444", color: "white", border: "none" }}
                onClick={handleVoiceToggle}
              >
                <Square className="h-3.5 w-3.5 mr-1.5" />
                Stop
              </Button>
              <style>{`
                @keyframes voiceBar {
                  0% { height: 15%; }
                  100% { height: 100%; }
                }
              `}</style>
            </div>
          )}

          {/* ── PROCESSING INDICATOR ─────────────────────────────────────── */}
          {(isVoiceBusy && !isRecording) && (
            <div className="px-4 py-3 flex items-center gap-3"
              style={{ background: `${GOLD}10`, borderBottom: `1px solid ${GOLD}30` }}>
              <Loader2 className="h-5 w-5 animate-spin shrink-0" style={{ color: GOLD }} />
              <div className="flex-1">
                <span className="text-sm font-medium" style={{ color: GOLD }}>
                  {voiceStage === "uploading" ? "Preparing audio…" : voiceStage === "transcribing" ? "Transcribing speech…" : voiceStage === "generating" ? "Generating line items…" : "Processing voice…"}
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {voiceStage === "uploading" ? "Sending recording to server" : voiceStage === "transcribing" ? "Converting your voice to text with Whisper AI" : voiceStage === "generating" ? "Building priced line items from your transcript" : "Please wait…"}
                </p>
              </div>
            </div>
          )}

          {aiSuggest.isPending && (
            <div className="px-4 py-3 flex items-center gap-3"
              style={{ background: `${GOLD}10`, borderBottom: `1px solid ${GOLD}30` }}>
              <div className="relative flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: GOLD }} />
              </div>
              <div className="flex-1">
                <span className="text-sm font-medium" style={{ color: GOLD }}>
                  AI is building your line items…
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Analyzing scope, breaking out items, classifying labor vs material
                </p>
              </div>
            </div>
          )}

          {/* ── REVIEW QUEUE (streamlined) ────────────────────────────────── */}
          {reviewItems.length > 0 && (
            <div className="border-b border-border/40" style={{ background: "var(--card)" }}>
              {/* Review header */}
              <div className="flex items-center justify-between gap-3 px-4 py-2.5"
                style={{ background: `${GREEN}10`, borderBottom: `1px solid ${GREEN}25` }}>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" style={{ color: GREEN }} />
                  <span className="font-semibold text-sm" style={{ color: GREEN }}>
                    {reviewItems.length} Line Item{reviewItems.length > 1 ? "s" : ""} Generated
                  </span>
                  <span className="text-xs text-muted-foreground">
                    — review, edit if needed, then insert
                  </span>
                </div>
                <span className="text-xs font-medium" style={{ color: GREEN }}>
                  {acceptedCount} of {reviewItems.length} selected
                </span>
              </div>

              {/* Item cards */}
              <div className="p-3 space-y-2 overflow-y-auto" style={{ maxHeight: "400px" }}>
                {reviewItems.map((item, idx) => (
                  <ReviewItemCard
                    key={item.id}
                    item={item}
                    index={idx}
                    onToggleAccept={() => toggleItemAccept(item.id)}
                    onToggleEdit={() => toggleItemEdit(item.id)}
                    onUpdate={(updates) => updateItem(item.id, updates)}
                    onRemove={() => removeItem(item.id)}
                  />
                ))}
              </div>

              {/* Action footer */}
              <div className="px-4 py-3 border-t border-border/40 flex items-center gap-3"
                style={{ background: `${GOLD}08` }}>
                <Button
                  type="button"
                  className="flex-1 font-semibold"
                  style={{ background: GOLD, color: "#1A1B17", border: "none" }}
                  onClick={handleInsertAccepted}
                  disabled={acceptedCount === 0}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Insert {acceptedCount} Item{acceptedCount !== 1 ? "s" : ""} into Proposal
                </Button>
                <button
                  type="button"
                  onClick={handleClearReview}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1.5"
                >
                  <Trash2 className="h-3 w-3" />
                  Discard
                </button>
              </div>
            </div>
          )}

          {/* ── CHAT MESSAGES ──────────────────────────────────────────────── */}
          {reviewItems.length === 0 && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ minHeight: "180px", maxHeight: "300px" }}>
              {messages.length === 0 ? (
                <div className="text-center py-6 space-y-2">
                  <Bot className="h-8 w-8 mx-auto text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    Describe the work in plain language — or tap the mic to speak — and I'll build the line items.
                  </p>
                  <p className="text-xs text-muted-foreground/60 flex items-center justify-center gap-1">
                    <ShieldCheck className="h-3 w-3" style={{ color: GOLD }} />
                    You'll review every item before it enters the proposal
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center mt-3">
                    {[
                      "Demo full bathroom, tile shower labor, tile material, frameless glass shower door",
                      "Shaker-style white cabinetry, 20 linear feet, quartz countertops",
                      "Full kitchen demo and installation labor, farmhouse sink",
                    ].map(example => (
                      <button
                        key={example}
                        type="button"
                        className="text-xs px-3 py-1.5 rounded-full border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors bg-background/50"
                        onClick={() => { setInput(example); textareaRef.current?.focus(); }}
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      msg.role === "user" ? "bg-accent text-accent-foreground" : ""
                    }`}
                      style={msg.role === "assistant" ? { background: `${GOLD}20`, color: GOLD } : {}}>
                      {msg.role === "user"
                        ? (msg.isVoice ? <Mic className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />)
                        : <Bot className="h-3.5 w-3.5" />}
                    </div>
                    <div className={`flex-1 space-y-2 ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
                      <div className={`px-3 py-2 rounded-xl text-sm max-w-[90%] ${
                        msg.role === "user"
                          ? "bg-accent text-accent-foreground rounded-tr-sm"
                          : "bg-card border border-border/60 text-foreground rounded-tl-sm"
                      }`}>
                        {msg.isVoice && (
                          <span className="inline-flex items-center gap-1 text-[10px] opacity-60 mb-1 block">
                            <Mic className="h-2.5 w-2.5" /> Voice input
                          </span>
                        )}
                        {msg.content}
                      </div>
                    </div>
                  </div>
                ))
              )}
              {aiSuggest.isPending && (
                <div className="flex gap-3">
                  <div className="h-7 w-7 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: `${GOLD}20`, color: GOLD }}>
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                  <div className="px-3 py-2 rounded-xl rounded-tl-sm bg-card border border-border/60 text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Building line items from your scope…
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* File upload area */}
          {showUpload && (
            <div className="px-3 pb-2 border-t border-border/40 pt-3">
              <ProposalFileUpload onFilesChange={setUploadedFiles} visible={showUpload} />
            </div>
          )}

          {/* Files in context pill row */}
          {readyFileCount > 0 && (
            <div className="px-3 py-2 border-t border-border/30 flex flex-wrap gap-1.5 items-center"
              style={{ background: `${GOLD}06` }}>
              <span className="text-[10px] text-muted-foreground font-medium mr-0.5">In context:</span>
              {uploadedFiles.filter(f => f.status === "ready").map(f => (
                <span key={f.id}
                  className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{ background: `${GOLD}18`, color: GOLD, border: `1px solid ${GOLD}30` }}>
                  {f.name.match(/\.(jpg|jpeg|png|gif|webp|heic)$/i)
                    ? <ImageIcon className="h-2.5 w-2.5 shrink-0" />
                    : <FileText className="h-2.5 w-2.5 shrink-0" />}
                  <span className="max-w-[120px] truncate">{f.name}</span>
                  <button type="button" onClick={() => removeFile(f.id)}
                    className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
                    title={`Remove ${f.name} from context`} aria-label={`Remove ${f.name} from AI context`}>
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Input area — hidden while review queue is open */}
          {reviewItems.length === 0 && !isRecording && (
            <div className="p-3 border-t border-border/40 space-y-2">
              <div className="flex gap-2">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe the work… e.g. 'Demo full bathroom, tile shower labor, tile material, frameless glass shower door'"
                  className="flex-1 min-h-[60px] max-h-[120px] text-sm resize-none bg-background"
                  disabled={aiSuggest.isPending || isVoiceBusy}
                />
                <div className="flex flex-col gap-1.5 shrink-0 self-end">
                  <Button size="icon" variant="outline" className="h-9 w-9" type="button"
                    onClick={handleVoiceToggle}
                    disabled={aiSuggest.isPending || (isVoiceBusy && !isRecording)}
                    title="Start voice input"
                    style={{ borderColor: `${GOLD}40`, color: GOLD }}>
                    <Mic className="h-4 w-4" />
                  </Button>
                  <Button size="icon" className="h-9 w-9"
                    style={{ background: GOLD, color: "#1A1B17", border: "none" }}
                    type="button"
                    onClick={() => handleSend()}
                    disabled={!input.trim() || aiSuggest.isPending || isVoiceBusy}>
                    {aiSuggest.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] text-muted-foreground">
                    Press <kbd className="px-1 py-0.5 rounded border border-border/60 text-[10px]">Enter</kbd> to send,{" "}
                    <kbd className="px-1 py-0.5 rounded border border-border/60 text-[10px]">Shift+Enter</kbd> for new line
                  </p>
                  <button type="button"
                    className="text-[10px] flex items-center gap-1 transition-colors rounded px-1.5 py-0.5"
                    style={showUpload ? { background: `#BF9A3B20`, color: "#BF9A3B" } : { color: "var(--muted-foreground)" }}
                    onClick={() => setShowUpload(v => !v)}
                    aria-expanded={showUpload}
                    aria-label={showUpload ? "Hide file upload" : "Attach files for AI context"}>
                    <Paperclip className="h-3 w-3" />
                    {showUpload ? "Hide files" : "Attach files"}
                    {readyFileCount > 0 && (
                      <span className="ml-0.5 text-[9px] font-bold px-1 rounded-full"
                        style={{ background: "#BF9A3B", color: "#1A1B17" }}>
                        {readyFileCount}
                      </span>
                    )}
                  </button>
                </div>
                {messages.length > 0 && (
                  <button type="button"
                    className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
                    onClick={handleClearChat}>
                    <Trash2 className="h-3 w-3" />
                    Clear chat
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
