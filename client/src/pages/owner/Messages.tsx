import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus, MessageSquare, Sparkles, CheckCircle, Send, ArrowLeft,
  Phone, Mail, Globe, Lock, FileText, ChevronRight, User,
  RefreshCw, ArrowDown, ArrowUp, Paperclip, Brain, ExternalLink, GripVertical,
  Camera, Image, MapPin
} from "lucide-react";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/useMobile";
const GOLD = "#BF9A3B";

type Lead = { id: number; name: string; phone?: string | null; email?: string | null; status?: string | null };
type Msg = {
  id: number; leadId?: number | null; projectId?: number | null;
  threadType: string; direction: string; channel: string;
  fromName?: string | null; fromEmail?: string | null;
  body: string; status: string; subject?: string | null;
  attachmentsJson?: string | null; attachmentUrl?: string | null;
  attachmentName?: string | null; attachmentMime?: string | null;
  isRead?: boolean; accountEmail?: string | null;
  createdAt: Date | string;
};

type ChannelFilter = "all" | "sms" | "email" | "portal" | "internal";

const CHANNEL_TABS: { value: ChannelFilter; label: string; icon: React.ReactNode }[] = [
  { value: "all",      label: "All",      icon: <MessageSquare className="h-3 w-3" /> },
  { value: "sms",      label: "SMS",      icon: <Phone className="h-3 w-3" /> },
  { value: "email",    label: "Email",    icon: <Mail className="h-3 w-3" /> },
  { value: "portal",   label: "Portal",   icon: <Globe className="h-3 w-3" /> },
  { value: "internal", label: "Internal", icon: <Lock className="h-3 w-3" /> },
];

// Channel badge colors
const CHANNEL_COLORS: Record<string, { bg: string; text: string }> = {
  sms:      { bg: "bg-amber-500/20",  text: "text-amber-400" },
  email:    { bg: "bg-blue-500/20",   text: "text-blue-400" },
  portal:   { bg: "bg-yellow-500/20", text: "text-yellow-400" },
  internal: { bg: "bg-zinc-500/20",   text: "text-zinc-400" },
};

function ChannelBadge({ channel }: { channel: string }) {
  const c = CHANNEL_COLORS[channel] ?? { bg: "bg-zinc-500/20", text: "text-zinc-400" };
  const icon = channel === "sms" ? <Phone className="h-2.5 w-2.5" />
    : channel === "email" ? <Mail className="h-2.5 w-2.5" />
    : channel === "portal" ? <Globe className="h-2.5 w-2.5" />
    : <Lock className="h-2.5 w-2.5" />;
  const label = channel === "sms" ? "SMS" : channel === "email" ? "Email"
    : channel === "portal" ? "Portal" : "Internal";
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${c.bg} ${c.text}`}>
      {icon} {label}
    </span>
  );
}

function channelLabel(channel: string) {
  if (channel === "sms") return "SMS";
  if (channel === "email") return "Email";
  if (channel === "portal") return "Portal";
  return "Internal";
}

function isLegacyAttachment(body: string) {
  return body.startsWith("[ATTACHMENT]");
}

function legacyAttachmentUrl(body: string) {
  return body.replace("[ATTACHMENT] ", "").trim();
}

function isImageMime(mime?: string | null) {
  return mime?.startsWith("image/") ?? false;
}

function isImageUrl(url: string) {
  return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url);
}

// Parse attachmentsJson and return array of attachment objects
function parseAttachments(json?: string | null): Array<{ name: string; url: string; mime: string; size?: number }> {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}

// ── Attachment renderer ───────────────────────────────────────────────────────
function AttachmentList({ attachmentsJson, attachmentUrl, attachmentMime, attachmentName }: {
  attachmentsJson?: string | null;
  attachmentUrl?: string | null;
  attachmentMime?: string | null;
  attachmentName?: string | null;
}) {
  const atts = parseAttachments(attachmentsJson);
  // Fall back to single attachment fields if no JSON
  if (atts.length === 0 && attachmentUrl) {
    atts.push({ name: attachmentName ?? "Attachment", url: attachmentUrl, mime: attachmentMime ?? "" });
  }
  if (atts.length === 0) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {atts.map((att, i) => (
        isImageMime(att.mime) || isImageUrl(att.url) ? (
          <a key={i} href={att.url} target="_blank" rel="noopener noreferrer">
            <img
              src={att.url}
              alt={att.name}
              className="rounded-lg max-h-48 max-w-[200px] object-cover border border-border/40 hover:opacity-90 transition-opacity"
            />
          </a>
        ) : (
          <a
            key={i}
            href={att.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 bg-card/60 text-xs text-primary hover:underline hover:bg-accent/20 transition-colors"
          >
            <Paperclip className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate max-w-[180px]">{att.name}</span>
          </a>
        )
      ))}
    </div>
  );
}

// ── Per-client thread view ────────────────────────────────────────────────────
function ClientThread({ lead, onBack, onUnreadDecrement, msgRefs }: {
  lead: Lead;
  onBack: () => void;
  onUnreadDecrement: () => void;
  msgRefs?: React.MutableRefObject<Map<number, HTMLDivElement>>;
}) {
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [isSyncing, setIsSyncing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();
  const { data: msgs, refetch } = trpc.messages.listByLead.useQuery({ leadId: lead.id });

  const markAllRead = trpc.messages.markAllReadForLead.useMutation({
    onSuccess: () => {
      onUnreadDecrement();
      utils.messages.getUnreadCount.invalidate();
    },
  });

  const syncGmail = trpc.messages.syncGmail.useMutation({
    onSuccess: (data) => {
      setIsSyncing(false);
      if (data.success) {
        toast.success(`Gmail synced — ${data.newMessages} new message${data.newMessages !== 1 ? "s" : ""}`);
        refetch();
      } else {
        toast.error("Sync failed: " + (data.error ?? "Unknown error"));
      }
    },
    onError: (err) => {
      setIsSyncing(false);
      toast.error("Sync error: " + err.message);
    },
  });

  const createMessage = trpc.messages.create.useMutation({
    onSuccess: () => { setBody(""); refetch(); },
    onError: (err) => toast.error("Failed to send: " + err.message),
  });

  // Mark all unread messages as read when thread is opened
  useEffect(() => {
    const unreadCount = (msgs ?? []).filter(m => !m.isRead && m.direction === "inbound").length;
    if (unreadCount > 0) {
      markAllRead.mutate({ leadId: lead.id });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  // Filter messages by selected channel tab
  const filteredMsgs = (msgs ?? []).filter(m => {
    if (channelFilter === "all") return true;
    return m.channel === channelFilter;
  });

  // Count per channel for tab badges
  const countByChannel: Record<string, number> = {};
  (msgs ?? []).forEach(m => {
    countByChannel[m.channel] = (countByChannel[m.channel] ?? 0) + 1;
  });

  function handleSend() {
    if (!body.trim()) { toast.error("Message body required"); return; }
    createMessage.mutate({
      leadId: lead.id,
      threadType: "client",
      direction: "outbound",
      channel,
      toPhone: channel === "sms" ? (lead.phone ?? undefined) : undefined,
      toEmail: channel === "email" ? (lead.email ?? undefined) : undefined,
      body,
    } as any);
  }

  function handleSyncGmail() {
    setIsSyncing(true);
    syncGmail.mutate();
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="p-2 rounded-full bg-primary/15">
          <User className="h-4 w-4" style={{ color: GOLD }} />
        </div>
        <div>
          <p className="font-semibold text-foreground">{lead.name}</p>
          <p className="text-xs text-muted-foreground">
            {lead.phone && <span className="mr-3">{lead.phone}</span>}
            {lead.email && <span>{lead.email}</span>}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {msgs && msgs.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {msgs.length} message{msgs.length !== 1 ? "s" : ""}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs border-border/60 gap-1.5"
            onClick={handleSyncGmail}
            disabled={isSyncing}
          >
            <RefreshCw className={`h-3 w-3 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing…" : "Sync Gmail"}
          </Button>
        </div>
      </div>

      {/* Channel filter tabs */}
      <div className="flex gap-1 mb-3 shrink-0 border-b border-border/40 pb-2">
        {CHANNEL_TABS.map(tab => {
          const count = tab.value === "all" ? (msgs ?? []).length : (countByChannel[tab.value] ?? 0);
          const isActive = channelFilter === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setChannelFilter(tab.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                isActive
                  ? "text-white"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
              }`}
              style={isActive ? { background: GOLD, color: "#1A1B17" } : {}}
            >
              {tab.icon}
              {tab.label}
              {count > 0 && (
                <span
                  className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] leading-none ${
                    isActive ? "bg-black/20 text-black/80" : "bg-accent/50 text-muted-foreground"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-4">
        {filteredMsgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
            <MessageSquare className="h-8 w-8 opacity-30" />
            {channelFilter === "all"
              ? <p>No messages yet with {lead.name}</p>
              : <p>No {channelLabel(channelFilter)} messages with {lead.name}</p>
            }
          </div>
        ) : (
          filteredMsgs.map(msg => {
            const isOut = msg.direction === "outbound";

            // Legacy attachment body format
            if (isLegacyAttachment(msg.body)) {
              const url = legacyAttachmentUrl(msg.body);
              return (
                <div key={msg.id} className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[70%]">
                    {isImageUrl(url) ? (
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt="attachment" className="rounded-lg max-h-48 object-cover border border-border/40" />
                      </a>
                    ) : (
                      <a href={url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 bg-card text-xs text-primary hover:underline">
                        <FileText className="h-3.5 w-3.5" /> View Attachment
                      </a>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1 text-right">
                      {format(new Date(msg.createdAt), "MMM d, h:mm a")}
                    </p>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={`flex ${isOut ? "justify-end" : "justify-start"}`}
                ref={el => { if (el && msgRefs) msgRefs.current.set(msg.id, el); }}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${isOut
                    ? "rounded-br-sm text-white"
                    : "rounded-bl-sm bg-accent/40 text-foreground"}`}
                  style={isOut ? { background: GOLD } : {}}
                >
                  {/* Sender name for inbound */}
                  {!isOut && (
                    <p className="text-[10px] font-medium mb-0.5 opacity-70">
                      {msg.fromName ?? msg.fromEmail ?? "Client"}
                    </p>
                  )}

                  {/* Email subject line */}
                  {msg.channel === "email" && msg.subject && (
                    <p className={`text-[11px] font-semibold mb-1 ${isOut ? "text-white/80" : "text-foreground/70"}`}>
                      {msg.subject}
                    </p>
                  )}

                  {/* Message body */}
                  {msg.channel === "email" && msg.body && /<[a-z][\s\S]*>/i.test(msg.body) ? (
                    <div
                      className="text-sm leading-relaxed email-body"
                      dangerouslySetInnerHTML={{ __html: msg.body }}
                    />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.body}</p>
                  )}

                  {/* Attachments */}
                  <AttachmentList
                    attachmentsJson={msg.attachmentsJson}
                    attachmentUrl={msg.attachmentUrl}
                    attachmentMime={msg.attachmentMime}
                    attachmentName={msg.attachmentName}
                  />

                  {/* Footer: timestamp + channel badge + direction */}
                  <div className={`flex items-center gap-1.5 mt-1.5 flex-wrap ${isOut ? "justify-end" : "justify-start"}`}>
                    <span className="text-[10px] opacity-60">
                      {format(new Date(msg.createdAt), "MMM d, h:mm a")}
                    </span>
                    <span className={`text-[10px] opacity-60 flex items-center gap-0.5`}>
                      {isOut
                        ? <ArrowUp className="h-2.5 w-2.5" />
                        : <ArrowDown className="h-2.5 w-2.5" />
                      }
                    </span>
                    <ChannelBadge channel={msg.channel} />
                    {msg.accountEmail && (
                      <span className="text-[9px] opacity-40 truncate max-w-[120px]">{msg.accountEmail}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Messages from the Field ─────────────────────────────────────── */}
      <FieldCapturesSection lead={lead} />

      {/* Compose bar */}
      <div className="shrink-0 border border-border/60 rounded-xl p-3 bg-card space-y-2">
        <div className="flex gap-2">
          <Select value={channel} onValueChange={v => setChannel(v as any)}>
            <SelectTrigger className="bg-background border-border h-8 text-xs w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="email">Email</SelectItem>
            </SelectContent>
          </Select>
          {channel === "sms" && lead.phone && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="h-3 w-3" />{lead.phone}
            </span>
          )}
          {channel === "email" && lead.email && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Mail className="h-3 w-3" />{lead.email}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Textarea
            className="bg-background border-border resize-none text-sm flex-1"
            rows={2}
            placeholder={`Send a ${channel === "sms" ? "text" : "email"} to ${lead.name}…`}
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend(); }}
          />
          <Button
            className="btn-gold self-end h-9 px-3"
            onClick={handleSend}
            disabled={createMessage.isPending || !body.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Messages from the Field section ─────────────────────────────────────────
function FieldCapturesSection({ lead }: { lead: Lead }) {
  const [expanded, setExpanded] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [, navigate] = useLocation();

  // Try to find clientId for this lead by matching email
  const { data: clients = [] } = trpc.fieldCapture.listClients.useQuery();
  const client = clients.find((c: any) =>
    c.email && lead.email && c.email.toLowerCase() === lead.email.toLowerCase()
  );
  const clientId = client?.id;

  const { data: captures = [] } = trpc.fieldCapture.listByClient.useQuery(
    { clientId },
    { enabled: !!clientId }
  );

  if (!clientId || captures.length === 0) return null;

  const photos = captures.filter((c: any) => c.type === "photo");
  const notes = captures.filter((c: any) => c.type === "note");

  return (
    <div className="shrink-0 mb-3">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-[#BF9A3B]/40 bg-[#BF9A3B]/5 hover:bg-[#BF9A3B]/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-[#BF9A3B]" />
          <span className="text-sm font-medium text-[#BF9A3B]">Messages from the Field</span>
          <Badge variant="outline" className="border-[#BF9A3B]/40 text-[#BF9A3B] text-xs">
            {captures.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/field-gallery/${clientId}`); }}
            className="text-xs text-[#BF9A3B]/70 hover:text-[#BF9A3B] underline"
          >
            View all
          </button>
          <span className="text-[#BF9A3B]/60 text-sm">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 max-h-72 overflow-y-auto">
          {/* Photo thumbnails */}
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5">
              {photos.slice(0, 6).map((cap: any) => (
                <div key={cap.id} className="relative rounded-lg overflow-hidden bg-accent/20 aspect-square cursor-pointer" onClick={() => setLightbox(cap.photoUrl)}>
                  {cap.photoUrl ? (
                    <img src={cap.photoUrl} alt="field" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Image className="h-5 w-5 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5">
                    <p className="text-[9px] text-white/70">{format(new Date(cap.capturedAt), "MMM d")}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Notes */}
          {notes.slice(0, 3).map((cap: any) => (
            <div key={cap.id} className="flex items-start gap-2 bg-accent/20 rounded-lg px-3 py-2">
              <FileText className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground/80 leading-snug line-clamp-2">{cap.noteText}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{format(new Date(cap.capturedAt), "MMM d, h:mm a")}</p>
              </div>
              {cap.latitude && (
                <MapPin className="h-3 w-3 text-green-400/60 mt-0.5 flex-shrink-0" />
              )}
            </div>
          ))}
          {captures.length > 6 && (
            <button
              onClick={() => navigate(`/field-gallery/${clientId}`)}
              className="w-full text-xs text-[#BF9A3B]/70 hover:text-[#BF9A3B] text-center py-1"
            >
              View all {captures.length} captures →
            </button>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="Field capture" className="max-w-full max-h-full object-contain rounded-lg" />
          <button className="absolute top-4 right-4 p-2 bg-white/10 rounded-full text-white" onClick={() => setLightbox(null)}>✕</button>
        </div>
      )}
    </div>
  );
}

// ── AI Summary Pane ──────────────────────────────────────────────────────────
function AISummaryPane({ lead, msgs, onJumpToMessage }: {
  lead: Lead;
  msgs: Msg[];
  onJumpToMessage: (id: number) => void;
}) {
  const { data: summaries, refetch: refetchSummaries } = trpc.messages.getSummaries.useQuery(
    { leadId: lead.id },
    { enabled: !!lead.id }
  );

  const generateBatch = trpc.messages.generateSummariesBatch.useMutation({
    onSuccess: (data) => {
      toast.success(`Generated ${data.generated} AI summaries`);
      refetchSummaries();
    },
    onError: (err) => toast.error("Summary generation failed: " + err.message),
  });

  const generateSingle = trpc.messages.generateSummary.useMutation({
    onSuccess: () => refetchSummaries(),
    onError: (err) => toast.error("Summary failed: " + err.message),
  });

  // Build a map from messageId → summary
  const summaryMap = new Map((summaries ?? []).map(s => [s.messageId, s]));

  // Only show messages that have content worth summarising
  const summarisable = msgs.filter(m => m.body && m.body.trim().length > 10 && !m.body.startsWith("[ATTACHMENT]"));
  const unsummarised = summarisable.filter(m => !summaryMap.has(m.id));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4" style={{ color: GOLD }} />
          <span className="text-sm font-semibold text-foreground">AI Summaries</span>
          {summaries && summaries.length > 0 && (
            <span className="text-xs text-muted-foreground">({summaries.length} stored)</span>
          )}
        </div>
        {unsummarised.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-border/60 gap-1.5"
            onClick={() => generateBatch.mutate({ leadId: lead.id })}
            disabled={generateBatch.isPending}
          >
            <Sparkles className="h-3 w-3" style={{ color: GOLD }} />
            {generateBatch.isPending ? "Generating…" : `Summarise ${unsummarised.length} new`}
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {summarisable.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
            <Brain className="h-8 w-8 opacity-20" />
            <p className="text-xs text-center">No messages to summarise yet</p>
          </div>
        ) : (
          [...summarisable].reverse().map(msg => {
            const summary = summaryMap.get(msg.id);
            const isOut = msg.direction === "outbound";
            return (
              <div
                key={msg.id}
                className="border border-border/50 rounded-xl p-3 bg-card/60 space-y-2 hover:border-border transition-colors"
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <ChannelBadge channel={msg.channel} />
                    <span className="text-[10px] text-muted-foreground">
                      {isOut ? "Sent" : (msg.fromName ?? msg.fromEmail ?? "Client")}
                    </span>
                    <span className="text-[10px] text-muted-foreground opacity-60">
                      {format(new Date(msg.createdAt), "MMM d, h:mm a")}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground shrink-0"
                    onClick={() => onJumpToMessage(msg.id)}
                  >
                    <ExternalLink className="h-2.5 w-2.5 mr-1" /> View
                  </Button>
                </div>

                {/* Summary text or generate button */}
                {summary ? (
                  <p className="text-xs text-foreground/80 leading-relaxed">{summary.summary}</p>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground italic flex-1 truncate">
                      {msg.body.slice(0, 60)}{msg.body.length > 60 ? "…" : ""}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] shrink-0"
                      style={{ color: GOLD }}
                      onClick={() => generateSingle.mutate({ messageId: msg.id, leadId: lead.id })}
                      disabled={generateSingle.isPending}
                    >
                      <Sparkles className="h-2.5 w-2.5 mr-1" />
                      {generateSingle.isPending ? "…" : "AI"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Client list sidebar ───────────────────────────────────────────────────────
function ClientList({ onSelect, selectedId }: { onSelect: (lead: Lead) => void; selectedId?: number }) {
  const [search, setSearch] = useState("");
  const { data: leads } = trpc.leads.list.useQuery();
  const { data: allMessages } = trpc.messages.listAll.useQuery();

  const filtered = (leads ?? []).filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    (l.phone ?? "").includes(search) ||
    (l.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  // Count messages per lead + unread count per lead
  const msgCountByLead: Record<number, number> = {};
  const unreadByLead: Record<number, number> = {};
  (allMessages ?? []).forEach(m => {
    if (m.leadId) {
      msgCountByLead[m.leadId] = (msgCountByLead[m.leadId] ?? 0) + 1;
      if (!m.isRead && m.direction === "inbound") {
        unreadByLead[m.leadId] = (unreadByLead[m.leadId] ?? 0) + 1;
      }
    }
  });

  // Sort leads with unread messages first, then by message count
  const sorted = [...filtered].sort((a, b) => {
    const unreadDiff = (unreadByLead[b.id] ?? 0) - (unreadByLead[a.id] ?? 0);
    if (unreadDiff !== 0) return unreadDiff;
    return (msgCountByLead[b.id] ?? 0) - (msgCountByLead[a.id] ?? 0);
  });

  return (
    <div className="flex flex-col h-full">
      <Input
        className="bg-background border-border mb-3 text-sm"
        placeholder="Search clients…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div className="flex-1 overflow-y-auto space-y-1">
        {sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No clients found</p>
        ) : sorted.map(lead => (
          <button
            key={lead.id}
            onClick={() => onSelect(lead)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors hover:bg-accent/30 ${selectedId === lead.id ? "bg-accent/40 border border-border/60" : ""}`}
          >
            <div className="p-1.5 rounded-full bg-primary/10 shrink-0 relative">
              <User className="h-3.5 w-3.5" style={{ color: GOLD }} />
              {/* Unread dot */}
              {(unreadByLead[lead.id] ?? 0) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 border border-background" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{lead.name}</p>
              <p className="text-xs text-muted-foreground truncate">{lead.phone ?? lead.email ?? "No contact"}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {(unreadByLead[lead.id] ?? 0) > 0 ? (
                <Badge className="text-[10px] h-4 px-1.5 bg-red-500 hover:bg-red-500 text-white border-0">
                  {unreadByLead[lead.id]}
                </Badge>
              ) : msgCountByLead[lead.id] ? (
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{msgCountByLead[lead.id]}</Badge>
              ) : null}
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Resizable split-pane wrapper ───────────────────────────────────────────────────────
function SplitPane({ lead, msgs, onBack, onUnreadDecrement }: {
  lead: Lead;
  msgs: Msg[];
  onBack: () => void;
  onUnreadDecrement: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPct, setLeftPct] = useState(50); // percentage
  const isDragging = useRef(false);
  const highlightedMsgId = useRef<number | null>(null);
  const msgRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.min(Math.max(pct, 20), 80)); // clamp 20%–80%
    };
    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  function handleJumpToMessage(id: number) {
    highlightedMsgId.current = id;
    const el = msgRefs.current.get(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.outline = `2px solid ${GOLD}`;
      el.style.borderRadius = "12px";
      setTimeout(() => { el.style.outline = ""; el.style.borderRadius = ""; }, 2000);
    }
  }

  return (
    <div ref={containerRef} className="flex h-full w-full gap-0 overflow-hidden" style={{ userSelect: isDragging.current ? "none" : "auto" }}>
      {/* Left pane — raw thread */}
      <div className="overflow-hidden flex flex-col" style={{ width: `${leftPct}%`, minWidth: 200 }}>
        <ClientThread
          lead={lead}
          onBack={onBack}
          onUnreadDecrement={onUnreadDecrement}
          msgRefs={msgRefs}
        />
      </div>

      {/* Draggable divider */}
      <div
        className="w-2 shrink-0 flex items-center justify-center cursor-col-resize hover:bg-accent/40 transition-colors group"
        onMouseDown={startDrag}
        style={{ background: "transparent" }}
      >
        <GripVertical className="h-5 w-5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
      </div>

      {/* Right pane — AI summaries */}
      <div className="overflow-hidden flex flex-col border-l border-border/40 pl-3" style={{ flex: 1, minWidth: 200 }}>
        <AISummaryPane lead={lead} msgs={msgs} onJumpToMessage={handleJumpToMessage} />
      </div>
    </div>
  );
}

// ── Main Messages page ───────────────────────────────────────────────────────
export default function Messages() {
  const isMobile = useIsMobile();
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [aiContext, setAiContext] = useState("");
  const [aiType, setAiType] = useState("project_update");
  const [composing, setComposing] = useState({ threadType: "client" as any, channel: "sms" as any, toPhone: "", toEmail: "", body: "", projectId: "" });

  const utils = trpc.useUtils();
  const { data: allMessages, refetch: refetchAll } = trpc.messages.listAll.useQuery();
  const { data: unreadData, refetch: refetchUnread } = trpc.messages.getUnreadCount.useQuery();
  const { data: selectedLeadMsgs } = trpc.messages.listByLead.useQuery(
    { leadId: selectedLead?.id ?? 0 },
    { enabled: !!selectedLead }
  );

  const createMessage = trpc.messages.create.useMutation({
    onSuccess: () => {
      setShowCompose(false);
      setComposing({ threadType: "client", channel: "sms", toPhone: "", toEmail: "", body: "", projectId: "" });
      refetchAll();
      toast.success("Message sent!");
    },
    onError: (err) => toast.error("Failed to send: " + err.message),
  });
  const approveMessage = trpc.messages.approve.useMutation({ onSuccess: () => { refetchAll(); toast.success("Message approved!"); } });
  const generateDraft = trpc.messages.generateAiDraft.useMutation({
    onSuccess: (data) => {
      const draft = typeof data.draft === "string" ? data.draft : String(data.draft ?? "");
      setComposing(c => ({ ...c, body: draft }));
    }
  });

  const pending = (allMessages ?? []).filter(m => m.status === "pending_approval");
  const totalUnread = unreadData?.count ?? 0;

  function handleUnreadDecrement() {
    refetchUnread();
    utils.messages.listAll.invalidate();
  }

  return (
    <div className="space-y-5 h-full">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-serif" style={{ color: "var(--kp-cream)" }}>Communication Hub</h1>
            {totalUnread > 0 && (
              <Badge className="bg-red-500 hover:bg-red-500 text-white border-0 text-xs px-2">
                {totalUnread} unread
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">Per-client threads · SMS · Email · Portal messages · Gmail sync</p>
        </div>
        <Button className="btn-gold text-sm px-4" onClick={() => setShowCompose(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Compose
        </Button>
      </div>

      {/* AI Pending Approvals */}
      {pending.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">Pending AI Approval</h2>
          <div className="space-y-2">
            {pending.map(msg => (
              <Card key={msg.id} className="bg-card border-amber-500/30">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Sparkles className="h-3.5 w-3.5" style={{ color: GOLD }} />
                        <span className="text-xs font-medium" style={{ color: GOLD }}>AI Draft — Awaiting Approval</span>
                        <ChannelBadge channel={msg.channel} />
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{msg.body}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" className="text-xs h-7 border-border/60">Edit</Button>
                      <Button size="sm" className="btn-gold text-xs h-7 px-3" onClick={() => approveMessage.mutate({ id: msg.id })}>
                        <CheckCircle className="h-3 w-3 mr-1" /> Approve & Send
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Two-column layout: client list + thread (desktop) / single-panel (mobile) */}
      <div className={isMobile ? "flex flex-col gap-4" : "grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 h-[calc(100vh-280px)]"}>
        {/* Left: client list — hidden on mobile when a thread is open */}
        {(!isMobile || !selectedLead) && (
          <Card className="bg-card border-border overflow-hidden">
            <CardContent className="p-3 h-full flex flex-col">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Clients</p>
              <ClientList
                onSelect={setSelectedLead}
                selectedId={selectedLead?.id}
              />
            </CardContent>
          </Card>
        )}

        {/* Right: full-screen thread on mobile, split-pane on desktop */}
        {(!isMobile || selectedLead) && (
          <Card className="bg-card border-border overflow-hidden">
            <CardContent className="p-4 h-full">
              {selectedLead ? (
                <SplitPane
                  lead={selectedLead}
                  msgs={selectedLeadMsgs ?? []}
                  onBack={() => setSelectedLead(null)}
                  onUnreadDecrement={handleUnreadDecrement}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                  <MessageSquare className="h-10 w-10 opacity-20" />
                  <p className="text-sm">Select a client to view their message thread</p>
                  <p className="text-xs opacity-60">All SMS, emails, and portal messages are logged here per client</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Compose Dialog */}
      <Dialog open={showCompose} onOpenChange={setShowCompose}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader><DialogTitle className="font-serif text-xl">Compose Message</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Type</Label>
                <Select value={composing.threadType} onValueChange={v => setComposing(c => ({ ...c, threadType: v as any }))}>
                  <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client">Client</SelectItem>
                    <SelectItem value="vendor">Vendor</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="internal">Internal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Channel</Label>
                <Select value={composing.channel} onValueChange={v => setComposing(c => ({ ...c, channel: v as any }))}>
                  <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sms">SMS (ClickSend)</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="portal">Portal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {composing.channel === "sms" ? (
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">To Phone</Label>
                <Input className="bg-background border-border" value={composing.toPhone} onChange={e => setComposing(c => ({ ...c, toPhone: e.target.value }))} placeholder="(864) 555-0000" />
              </div>
            ) : (
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">To Email</Label>
                <Input className="bg-background border-border" value={composing.toEmail} onChange={e => setComposing(c => ({ ...c, toEmail: e.target.value }))} placeholder="client@email.com" />
              </div>
            )}
            {/* AI Draft */}
            <div className="border border-border/60 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" style={{ color: GOLD }} />
                <span className="text-xs font-medium" style={{ color: GOLD }}>AI Draft Generator</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select value={aiType} onValueChange={setAiType}>
                  <SelectTrigger className="bg-background border-border h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="project_update">Project Update</SelectItem>
                    <SelectItem value="check_in">Check-In</SelectItem>
                    <SelectItem value="review_request">Review Request</SelectItem>
                    <SelectItem value="payment_reminder">Payment Reminder</SelectItem>
                    <SelectItem value="schedule_change">Schedule Change</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" className="h-8 text-xs border-border/60"
                  onClick={() => generateDraft.mutate({ messageType: aiType, context: aiContext })}
                  disabled={generateDraft.isPending}>
                  {generateDraft.isPending ? "Generating..." : "Generate Draft"}
                </Button>
              </div>
              <Input className="bg-background border-border h-8 text-xs" placeholder="Context (e.g., 'tile install complete, painting starts Monday')" value={aiContext} onChange={e => setAiContext(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Message</Label>
              <Textarea className="bg-background border-border resize-none" rows={5} value={composing.body} onChange={e => setComposing(c => ({ ...c, body: e.target.value }))} placeholder="Type your message..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompose(false)}>Cancel</Button>
            <Button className="btn-gold" onClick={() => {
              if (!composing.body.trim()) { toast.error("Message body required"); return; }
              createMessage.mutate({ ...composing, direction: "outbound", projectId: composing.projectId ? parseInt(composing.projectId) : undefined } as any);
            }} disabled={createMessage.isPending}>
              <Send className="h-3.5 w-3.5 mr-1.5" /> Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
