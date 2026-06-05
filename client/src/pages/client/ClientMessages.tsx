import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Send, Mail, Phone, Globe, Paperclip, Image, X, FileText, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import ProjectFilterBar from "@/components/ProjectFilterBar";

const GOLD = "#C9A84C";
const CHARCOAL = "#2E2F2A";
const CREAM = "#F5F0E8";
const MUTED = "#9A9589";
const MAX_FILE_MB = 10;

interface PendingAttachment {
  id: string;
  name: string;
  mime: string;
  preview?: string; // for images
  base64: string;
  size: number;
}

function ChannelBadge({ channel }: { channel: string }) {
  const map: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    email:  { label: "Email",  icon: <Mail className="h-2.5 w-2.5" />,    color: "#4A90D9" },
    sms:    { label: "SMS",    icon: <Phone className="h-2.5 w-2.5" />,   color: "#E8A838" },
    portal: { label: "Portal", icon: <Globe className="h-2.5 w-2.5" />,   color: GOLD },
  };
  const info = map[channel] ?? { label: channel, icon: null, color: "#888" };
  return (
    <span
      className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wide"
      style={{ background: `${info.color}20`, color: info.color, border: `1px solid ${info.color}35` }}
    >
      {info.icon}{info.label}
    </span>
  );
}

function AttachmentChip({ att, onRemove }: { att: PendingAttachment; onRemove: () => void }) {
  const isImage = att.mime.startsWith("image/");
  return (
    <div
      className="relative flex items-center gap-1.5 rounded-lg overflow-hidden shrink-0"
      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
    >
      {isImage && att.preview ? (
        <img src={att.preview} alt={att.name} className="h-12 w-12 object-cover" />
      ) : (
        <div className="h-12 w-12 flex items-center justify-center" style={{ background: `${GOLD}15` }}>
          <FileText className="h-5 w-5" style={{ color: GOLD }} />
        </div>
      )}
      <div className="pr-6 py-1 max-w-[120px]">
        <p className="text-[10px] font-medium truncate" style={{ color: CREAM }}>{att.name}</p>
        <p className="text-[9px]" style={{ color: MUTED }}>{(att.size / 1024).toFixed(0)} KB</p>
      </div>
      <button
        onClick={onRemove}
        className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.6)" }}
      >
        <X className="h-2.5 w-2.5" style={{ color: CREAM }} />
      </button>
    </div>
  );
}

export default function ClientMessages() {
  const [body, setBody] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: messages, refetch } = trpc.clientPortal.getMyMessages.useQuery(
    selectedProjectId ? { projectId: selectedProjectId } : undefined
  );
  const send = trpc.clientPortal.sendPortalMessage.useMutation({
    onSuccess: () => { refetch(); setBody(""); setPendingAttachments([]); },
    onError: (e) => toast.error(e.message),
  });
  const uploadFile = trpc.clientPortal.uploadPortalFile.useMutation({
    onError: (e) => toast.error(`Upload failed: ${e.message}`),
  });

  // Newest at top (descending)
  const sorted = [...(messages ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sorted.length]);

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    const valid = arr.filter(f => {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`${f.name} exceeds ${MAX_FILE_MB}MB limit`);
        return false;
      }
      return true;
    });
    if (!valid.length) return;

    const newAtts: PendingAttachment[] = await Promise.all(
      valid.map(async (f) => ({
        id: `${Date.now()}-${Math.random()}`,
        name: f.name,
        mime: f.type || "application/octet-stream",
        preview: f.type.startsWith("image/") ? await readFileAsDataUrl(f) : undefined,
        base64: await readFileAsBase64(f),
        size: f.size,
      }))
    );
    setPendingAttachments(prev => [...prev, ...newAtts]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  async function handleSend() {
    if (!body.trim() && pendingAttachments.length === 0) return;
    setIsUploading(true);
    try {
      // Upload each attachment to S3 first
      const uploadedAtts: { url: string; name: string; mime: string }[] = [];
      for (const att of pendingAttachments) {
        const result = await uploadFile.mutateAsync({
          base64: att.base64,
          fileName: att.name,
          mimeType: att.mime,
        });
        uploadedAtts.push({ url: result.url, name: att.name, mime: att.mime });
      }
      await send.mutateAsync({
        body: body.trim() || (uploadedAtts.length > 0 ? `Shared ${uploadedAtts.length} file${uploadedAtts.length > 1 ? "s" : ""}` : ""),
        projectId: selectedProjectId,
        attachments: uploadedAtts.length > 0 ? uploadedAtts : undefined,
      });
    } finally {
      setIsUploading(false);
    }
  }

  const canSend = (body.trim() || pendingAttachments.length > 0) && !isUploading && !send.isPending;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col" style={{ minHeight: "calc(100vh - 64px)" }}>
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: GOLD }}>
          Stay in Touch
        </p>
        <h1 className="text-4xl font-serif leading-tight" style={{ color: CREAM, fontStyle: "italic" }}>
          Messages
        </h1>
        <p className="text-sm mt-1" style={{ color: MUTED }}>
          Send us a message, photo, or file — we're here to help.
        </p>
        <div className="mt-4">
          <ProjectFilterBar selectedProjectId={selectedProjectId} onSelect={setSelectedProjectId} />
        </div>
      </div>

      {/* Thread */}
      <div className="flex-1 space-y-3 pb-4">
        {sorted.length === 0 && (
          <div
            className="rounded-xl p-10 text-center space-y-3"
            style={{ background: CHARCOAL, border: `1px solid rgba(255,255,255,0.06)` }}
          >
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ background: `${GOLD}15` }}>
              <MessageSquare className="h-6 w-6" style={{ color: GOLD }} />
            </div>
            <h2 className="text-xl font-serif" style={{ color: CREAM, fontStyle: "italic" }}>Start the conversation</h2>
            <p className="text-sm" style={{ color: MUTED }}>Send us a message below — we typically respond within a few hours.</p>
          </div>
        )}

        {sorted.map((msg, idx) => {
          const isOutbound = msg.direction === "outbound";
          const prevMsg = sorted[idx - 1];
          const showDate = !prevMsg || new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();

          return (
            <div key={msg.id}>
              {showDate && (
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
                  <span className="text-[10px] font-semibold uppercase tracking-widest px-2" style={{ color: MUTED }}>
                    {format(new Date(msg.createdAt), "MMMM d, yyyy")}
                  </span>
                  <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
                </div>
              )}

              <div className={`flex gap-3 ${isOutbound ? "flex-row-reverse" : "flex-row"}`}>
                {!isOutbound && (
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-1"
                    style={{ background: `${GOLD}25`, color: GOLD, border: `1.5px solid ${GOLD}40` }}
                  >
                    KP
                  </div>
                )}

                <div className={`max-w-[78%] space-y-1 ${isOutbound ? "items-end" : "items-start"} flex flex-col`}>
                  <div className={`flex items-center gap-2 flex-wrap ${isOutbound ? "flex-row-reverse" : ""}`}>
                    <span className="text-[10px]" style={{ color: MUTED }}>{format(new Date(msg.createdAt), "h:mm a")}</span>
                    <ChannelBadge channel={msg.channel ?? "portal"} />
                  </div>

                  <div
                    className="rounded-2xl px-4 py-2.5 text-sm"
                    style={
                      isOutbound
                        ? { background: `rgba(201,168,76,0.12)`, border: `1px solid rgba(201,168,76,0.3)`, color: CREAM, borderBottomRightRadius: 4 }
                        : { background: CHARCOAL, border: `1px solid rgba(255,255,255,0.08)`, color: CREAM, borderBottomLeftRadius: 4 }
                    }
                  >
                    {msg.subject && (
                      <p className="text-[10px] font-semibold mb-1.5 uppercase tracking-wide" style={{ color: MUTED }}>
                        Re: {msg.subject}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.body}</p>

                    {/* Attachments */}
                    {msg.attachmentsJson && (() => {
                      try {
                        const atts = JSON.parse(msg.attachmentsJson as string);
                        if (Array.isArray(atts) && atts.length > 0) {
                          return (
                            <div className="mt-2 space-y-1.5">
                              {atts.map((att: any, i: number) => {
                                const isImg = att.mime?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.url ?? "");
                                return isImg ? (
                                  <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" className="block">
                                    <img
                                      src={att.url}
                                      alt={att.name ?? "Image"}
                                      className="rounded-lg max-w-full max-h-48 object-cover"
                                      style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                                    />
                                  </a>
                                ) : (
                                  <a
                                    key={i}
                                    href={att.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full transition-colors"
                                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: MUTED }}
                                  >
                                    <Paperclip className="h-2.5 w-2.5" />
                                    {att.name ?? `Attachment ${i + 1}`}
                                  </a>
                                );
                              })}
                            </div>
                          );
                        }
                      } catch { /* ignore */ }
                      return null;
                    })()}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {/* Compose bar */}
      <div className="sticky bottom-0 pt-4 pb-2" style={{ background: "var(--background)" }}>
        {/* Pending attachments preview */}
        {pendingAttachments.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-2 p-2 rounded-xl" style={{ background: CHARCOAL, border: "1px solid rgba(255,255,255,0.06)" }}>
            {pendingAttachments.map(att => (
              <AttachmentChip
                key={att.id}
                att={att}
                onRemove={() => setPendingAttachments(prev => prev.filter(a => a.id !== att.id))}
              />
            ))}
          </div>
        )}

        <div
          className="rounded-xl p-2"
          style={{ background: CHARCOAL, border: `1.5px solid rgba(201,168,76,0.2)` }}
        >
          <Textarea
            className="flex-1 w-full bg-transparent border-0 resize-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm placeholder:text-muted-foreground min-h-[44px] max-h-32"
            style={{ color: CREAM }}
            placeholder="Type a message to your team…"
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
          />

          {/* Action row */}
          <div className="flex items-center justify-between mt-1 px-1">
            <div className="flex items-center gap-1">
              {/* Photo upload */}
              <button
                type="button"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.accept = "image/*";
                    fileInputRef.current.click();
                  }
                }}
                className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
                style={{ color: MUTED }}
                title="Upload photo"
              >
                <Image className="h-4 w-4" />
              </button>

              {/* File upload */}
              <button
                type="button"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.accept = "*/*";
                    fileInputRef.current.click();
                  }
                }}
                className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
                style={{ color: MUTED }}
                title="Attach file"
              >
                <Paperclip className="h-4 w-4" />
              </button>
            </div>

            <Button
              onClick={handleSend}
              disabled={!canSend}
              className="h-9 w-9 p-0 rounded-lg shrink-0"
              style={{
                background: canSend ? `linear-gradient(135deg, ${GOLD}, #E8C96A)` : "rgba(201,168,76,0.2)",
                color: canSend ? "#1A1B17" : MUTED,
              }}
            >
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <p className="text-[10px] text-center mt-2" style={{ color: MUTED }}>
          Enter to send · Shift+Enter for new line · Max {MAX_FILE_MB}MB per file
        </p>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={e => handleFileSelect(e.target.files)}
        />
      </div>
    </div>
  );
}
