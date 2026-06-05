/**
 * RFISection — displayed in the Project Detail RFI tab
 * Shows all RFIs for the project with status badges, reminder badges, review flow,
 * and a Resend button that opens an edit dialog pre-populated with existing content.
 */
import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RFICreateDialog } from "./RFICreateDialog";
import { RFIThreadPanel } from "./RFIThreadPanel";
import {
  Plus, FileText, Send, Clock, CheckCircle2, XCircle, AlertTriangle,
  Bell, Eye, RefreshCw, Loader2, ChevronDown, ChevronUp, MailOpen, Paperclip, X,
  Mic, MicOff, Sparkles, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface RFISectionProps {
  projectId: number;
  projectName: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft:     { label: "Draft",     color: "bg-gray-500/20 text-gray-400 border-gray-500/30",    icon: <FileText className="w-3 h-3" /> },
  sent:      { label: "Sent",      color: "bg-blue-500/20 text-blue-400 border-blue-500/30",    icon: <Send className="w-3 h-3" /> },
  returned:  { label: "Returned",  color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: <AlertTriangle className="w-3 h-3" /> },
  responded: { label: "Responded", color: "bg-green-500/20 text-green-400 border-green-500/30", icon: <MailOpen className="w-3 h-3" /> },
  reviewed:  { label: "Reviewed",  color: "bg-gray-500/20 text-gray-400 border-gray-500/30",    icon: <CheckCircle2 className="w-3 h-3" /> },
  expired:   { label: "Expired",   color: "bg-red-500/20 text-red-400 border-red-500/30",       icon: <XCircle className="w-3 h-3" /> },
};

// ── Resend Edit Dialog ────────────────────────────────────────────────────────
interface ResendDialogProps {
  rfi: {
    id: number;
    title: string;
    body: string;
    attachmentUrls?: string | null;
  };
  onClose: () => void;
  onSuccess: () => void;
}

function ResendDialog({ rfi, onClose, onSuccess }: ResendDialogProps) {
  const [title, setTitle] = useState(rfi.title);
  const [body, setBody] = useState(rfi.body);
  const [attachments, setAttachments] = useState<{ url: string; name: string }[]>(
    rfi.attachmentUrls ? JSON.parse(rfi.attachmentUrls) : []
  );
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<"idle" | "recording" | "transcribing" | "refining">("idle");
  const [isUploading, setIsUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resendMutation = trpc.rfi.updateAndResend.useMutation({
    onSuccess: (data) => {
      const emailCount = data.sentTo?.emails?.length ?? 0;
      const phoneCount = data.sentTo?.phones?.length ?? 0;
      toast.success(`RFI resent to ${emailCount} email${emailCount !== 1 ? "s" : ""} and ${phoneCount} phone${phoneCount !== 1 ? "s" : ""}.`);
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const transcribeMutation = trpc.rfi.transcribeVoice.useMutation();
  const refineMutation = trpc.rfi.refineBody.useMutation();
  const uploadMutation = trpc.rfi.uploadAttachment.useMutation();

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(",")[1];
          setRecordingStatus("transcribing");
          try {
            const { text } = await transcribeMutation.mutateAsync({ base64Audio: base64, mimeType: "audio/webm" });
            if (text) {
              setRecordingStatus("refining");
              const { body: refined } = await refineMutation.mutateAsync({
                existingBody: body,
                newText: text,
                projectName: rfi.title,
              });
              setBody(refined);
              toast.success("AI has refined the RFI body with your dictation.");
            }
          } catch (err: any) {
            toast.error("Transcription failed: " + err.message);
          } finally {
            setRecordingStatus("idle");
            setIsRecording(false);
          }
        };
        reader.readAsDataURL(blob);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setRecordingStatus("recording");
    } catch {
      toast.error("Microphone access denied.");
    }
  }, [body, rfi.title, transcribeMutation, refineMutation]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 16 * 1024 * 1024) { toast.error(`${file.name} exceeds 16 MB limit.`); continue; }
        const reader = new FileReader();
        await new Promise<void>((resolve) => {
          reader.onload = async () => {
            const base64 = (reader.result as string).split(",")[1];
            try {
              const result = await uploadMutation.mutateAsync({
                rfiId: rfi.id,
                base64,
                mimeType: file.type || "application/octet-stream",
                fileName: file.name,
              });
              setAttachments(prev => [...prev, { url: result.url, name: result.name }]);
              toast.success(`${file.name} attached.`);
            } catch (err: any) {
              toast.error(`Failed to upload ${file.name}: ` + err.message);
            }
            resolve();
          };
          reader.readAsDataURL(file);
        });
      }
    } finally {
      setIsUploading(false);
    }
  }, [rfi.id, uploadMutation]);

  const handleResend = () => {
    if (!title.trim() || !body.trim()) {
      toast.error("Title and body are required.");
      return;
    }
    resendMutation.mutate({
      rfiId: rfi.id,
      title: title.trim(),
      body: body.trim(),
      attachmentUrls: JSON.stringify(attachments),
      origin: window.location.origin,
    });
  };

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const recordingLabel = recordingStatus === "recording" ? "Recording… click to stop"
    : recordingStatus === "transcribing" ? "Transcribing…"
    : recordingStatus === "refining" ? "AI refining body…"
    : "Dictate changes";

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-foreground flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-[#BF9A3B]" />
            Edit &amp; Resend RFI
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Make any changes below, then click Resend. The updated RFI will be sent to the client via email and SMS, and the reminder schedule will reset.
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-widest">RFI Title</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Cabinet Hardware Selection"
              className="bg-background border-border"
            />
          </div>

          {/* Body + AI Dictation */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground uppercase tracking-widest">RFI Body</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={recordingStatus === "transcribing" || recordingStatus === "refining"}
                className={`h-7 px-2.5 text-xs gap-1.5 ${
                  isRecording
                    ? "bg-red-500/20 text-red-400 border-red-500/40 animate-pulse"
                    : "text-[#BF9A3B] border-[#BF9A3B]/40 hover:bg-[#BF9A3B]/10"
                }`}
              >
                {recordingStatus === "transcribing" || recordingStatus === "refining" ? (
                  <><Loader2 className="w-3 h-3 animate-spin" />{recordingLabel}</>
                ) : isRecording ? (
                  <><MicOff className="w-3 h-3" />Stop Recording</>
                ) : (
                  <><Mic className="w-3 h-3" /><Sparkles className="w-3 h-3" />AI Dictate</>
                )}
              </Button>
            </div>
            <Textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={8}
              placeholder="Describe what information you need from the client…"
              className="bg-background border-border resize-none text-sm leading-relaxed"
            />
          </div>

          {/* Attachments */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground uppercase tracking-widest">Attachments</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="h-7 px-2.5 text-xs gap-1.5 text-[#BF9A3B] border-[#BF9A3B]/40 hover:bg-[#BF9A3B]/10"
              >
                {isUploading ? <><Loader2 className="w-3 h-3 animate-spin" />Uploading…</> : <><Upload className="w-3 h-3" />Add Files</>}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf,.pdf,.jpg,.jpeg,.png,.webp,.heic"
                multiple
                className="hidden"
                onChange={e => handleFileUpload(e.target.files)}
              />
            </div>
            {attachments.length > 0 ? (
              <div className="space-y-1.5">
                {attachments.map((att, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-background/50 border border-border rounded-md px-3 py-2">
                    <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#BF9A3B] hover:underline flex-1 truncate"
                    >
                      {att.name}
                    </a>
                    <button
                      onClick={() => removeAttachment(idx)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      title="Remove attachment"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground/60">No attachments. Click "Add Files" to attach PDFs or images from your computer or phone.</p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={resendMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleResend}
            disabled={resendMutation.isPending || !title.trim() || !body.trim()}
            className="bg-[#BF9A3B] hover:bg-[#A8852E] text-[#1A1A1A] font-medium"
          >
            {resendMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Sending…</>
            ) : (
              <><RefreshCw className="w-4 h-4 mr-2" /> Resend RFI</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Section ──────────────────────────────────────────────────────────────
export function RFISection({ projectId, projectName, clientName, clientEmail, clientPhone }: RFISectionProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [resendRfi, setResendRfi] = useState<{
    id: number; title: string; body: string; attachmentUrls?: string | null;
  } | null>(null);

  const { data: rfis, refetch, isLoading } = trpc.rfi.listByProject.useQuery({ projectId });
  const sendMutation = trpc.rfi.send.useMutation({
    onSuccess: () => { refetch(); toast.success("RFI sent to client via email and SMS."); },
    onError: (e) => toast.error(e.message),
  });
  const reviewMutation = trpc.rfi.markReviewed.useMutation({
    onSuccess: () => { refetch(); toast.success("RFI marked as reviewed."); },
    onError: (e) => toast.error(e.message),
  });
  const reminderMutation = trpc.rfi.sendReminder.useMutation({
    onSuccess: (data) => {
      refetch();
      toast.success(`Reminder ${data.reminderCount}/5 sent via email and SMS.`);
    },
    onError: (e) => toast.error(e.message),
  });

  const pendingReviewCount = (rfis ?? []).filter(r => r.status === "responded").length;
  const reminderBadgeCount = (rfis ?? []).filter(r => r.status === "sent" && (r.reminderCount ?? 0) > 0).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-foreground font-serif">Requests for Information</h3>
          {pendingReviewCount > 0 && (
            <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs animate-pulse">
              {pendingReviewCount} awaiting review
            </Badge>
          )}
          {reminderBadgeCount > 0 && (
            <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs">
              <Bell className="w-3 h-3 mr-1" />{reminderBadgeCount} reminder{reminderBadgeCount > 1 ? "s" : ""} sent
            </Badge>
          )}
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="bg-[#BF9A3B] hover:bg-[#A8852E] text-[#1A1A1A] text-sm h-8 px-3 font-medium"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" /> New RFI
        </Button>
      </div>

      {/* RFI list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading RFIs…
        </div>
      ) : (rfis ?? []).length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No RFIs yet for this project.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Create one to request information from the client.</p>
            <Button
              onClick={() => setShowCreate(true)}
              variant="outline"
              className="mt-4 border-[#BF9A3B]/40 text-[#BF9A3B] hover:bg-[#BF9A3B]/10"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Create First RFI
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(rfis ?? []).map((rfi) => {
            // Determine effective status: if responded but responseAgreed is null → "returned" (needs discussion)
            const effectiveStatus = rfi.status === "responded" && rfi.responseAgreed === null ? "returned" : rfi.status;
            const statusCfg = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG.draft;
            const isExpanded = expandedId === rfi.id;
            const needsReview = rfi.status === "responded";
            const hasReminders = (rfi.reminderCount ?? 0) > 0;
            const canResend = rfi.status !== "draft"; // draft uses Send; all others use Resend

            return (
              <Card
                key={rfi.id}
                className={`bg-card border transition-all ${
                  needsReview
                    ? "border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.15)]"
                    : "border-border"
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Status icon */}
                    <div className={`mt-0.5 p-1.5 rounded-md ${needsReview ? "bg-amber-500/20" : "bg-muted"}`}>
                      {needsReview ? (
                        <MailOpen className="w-4 h-4 text-amber-400" />
                      ) : (
                        <FileText className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-foreground truncate">{rfi.title}</span>
                        <Badge className={`text-xs border ${statusCfg.color} flex items-center gap-1`}>
                          {statusCfg.icon} {statusCfg.label}
                        </Badge>
                        {hasReminders && rfi.status === "sent" && (
                          <Badge className="text-xs border bg-blue-500/10 text-blue-400 border-blue-500/20 flex items-center gap-1">
                            <Bell className="w-2.5 h-2.5" /> {rfi.reminderCount}/5 reminders
                          </Badge>
                        )}
                        {needsReview && (
                          <Badge className="text-xs border bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse">
                            ● Response received
                          </Badge>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground mt-1">
                        Created {rfi.createdAt ? format(new Date(rfi.createdAt), "MMM d, yyyy") : "—"}
                        {rfi.sentAt && ` · Sent ${format(new Date(rfi.sentAt), "MMM d")}`}
                        {rfi.respondedAt && ` · Responded ${format(new Date(rfi.respondedAt), "MMM d")}`}
                      </p>

                      {/* Expand/collapse body */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : rfi.id)}
                        className="flex items-center gap-1 text-xs text-[#BF9A3B] hover:text-[#A8852E] mt-2 transition-colors"
                      >
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {isExpanded ? "Hide details" : "View RFI"}
                      </button>

                      {isExpanded && (
                        <div className="mt-3 space-y-3">
                          {/* RFI body */}
                          <div className="bg-background/50 border border-border rounded-md p-3">
                            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">RFI Content</p>
                            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{rfi.body}</p>
                          </div>

                          {/* Attachments */}
                          {rfi.attachmentUrls && JSON.parse(rfi.attachmentUrls).length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground uppercase tracking-widest">Attachments</p>
                              {JSON.parse(rfi.attachmentUrls).map((att: { url: string; name: string }, i: number) => (
                                <a
                                  key={i}
                                  href={att.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 text-xs text-[#BF9A3B] hover:underline"
                                >
                                  <Paperclip className="w-3 h-3" /> {att.name}
                                </a>
                              ))}
                            </div>
                          )}

                          {/* Email Thread Panel */}
                          <RFIThreadPanel
                            rfiId={rfi.id}
                            rfiTitle={rfi.title}
                            projectId={projectId}
                          />

                          {/* Client response */}
                          {(rfi.responseComments || rfi.responseText || rfi.responsePhotosJson) && (
                            <div className={`border rounded-md p-3 ${
                              rfi.responseAgreed === 1
                                ? "bg-green-500/10 border-green-500/30"
                                : rfi.responseAgreed === 0
                                ? "bg-red-500/10 border-red-500/30"
                                : "bg-amber-500/10 border-amber-500/30"
                            }`}>
                              <div className="flex items-center gap-2 mb-2">
                                <p className="text-xs text-muted-foreground uppercase tracking-widest">Client Response</p>
                                {rfi.responseAgreed !== null && (
                                  <Badge className={`text-xs border ${
                                    rfi.responseAgreed === 1
                                      ? "bg-green-500/20 text-green-400 border-green-500/30"
                                      : rfi.responseAgreed === 0
                                      ? "bg-red-500/20 text-red-400 border-red-500/30"
                                      : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                                  }`}>
                                    {rfi.responseAgreed === 1 ? "✓ Agreed" : rfi.responseAgreed === 0 ? "✗ Declined" : "⏳ Needs Discussion"}
                                  </Badge>
                                )}
                              </div>
                              {rfi.responseComments && (
                                <p className="text-sm text-foreground whitespace-pre-wrap mb-2">{rfi.responseComments}</p>
                              )}
                              {rfi.responseText && (
                                <p className="text-xs text-muted-foreground whitespace-pre-wrap mb-2">{rfi.responseText}</p>
                              )}
                              {rfi.responsePhotosJson && (
                                <div className="grid grid-cols-3 gap-2 mt-2">
                                  {JSON.parse(rfi.responsePhotosJson).map((photo: { url: string; name: string }, i: number) => (
                                    <a key={i} href={photo.url} target="_blank" rel="noopener noreferrer" className="block">
                                      <img src={photo.url} alt={photo.name} className="w-full h-20 object-cover rounded border" />
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 shrink-0">
                      {/* Draft: Send button */}
                      {rfi.status === "draft" && (
                        <Button
                          size="sm"
                          onClick={() => sendMutation.mutate({ rfiId: rfi.id, origin: window.location.origin })}
                          disabled={sendMutation.isPending}
                          className="bg-[#BF9A3B] hover:bg-[#A8852E] text-[#1A1A1A] h-7 text-xs px-2.5"
                        >
                          {sendMutation.isPending ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <><Send className="w-3 h-3 mr-1" /> Send</>
                          )}
                        </Button>
                      )}

                      {/* Non-draft: Resend button (opens edit dialog) */}
                      {canResend && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setResendRfi({
                            id: rfi.id,
                            title: rfi.title,
                            body: rfi.body,
                            attachmentUrls: rfi.attachmentUrls,
                          })}
                          className="h-7 text-xs px-2.5 border-[#BF9A3B]/40 text-[#BF9A3B] hover:bg-[#BF9A3B]/10"
                          title="Edit and resend this RFI to the client"
                        >
                          <RefreshCw className="w-3 h-3 mr-1" /> Resend
                        </Button>
                      )}

                      {/* Sent: Remind button */}
                      {rfi.status === "sent" && (rfi.reminderCount ?? 0) < 5 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => reminderMutation.mutate({ rfiId: rfi.id, origin: window.location.origin })}
                          disabled={reminderMutation.isPending && reminderMutation.variables?.rfiId === rfi.id}
                          className="h-7 text-xs px-2.5 border-blue-500/40 text-blue-400 hover:bg-blue-500/10"
                          title={`Send reminder now (${rfi.reminderCount ?? 0}/5 sent)`}
                        >
                          {reminderMutation.isPending && reminderMutation.variables?.rfiId === rfi.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <><Bell className="w-3 h-3 mr-1" /> Remind</>
                          )}
                        </Button>
                      )}

                      {/* Responded: Mark Reviewed button */}
                      {needsReview && (
                        <Button
                          size="sm"
                          onClick={() => reviewMutation.mutate({ rfiId: rfi.id })}
                          disabled={reviewMutation.isPending}
                          className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs px-2.5"
                        >
                          {reviewMutation.isPending ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <><Eye className="w-3 h-3 mr-1" /> Reviewed</>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <RFICreateDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        projectId={projectId}
        projectName={projectName}
        onCreated={() => { refetch(); }}
        clientName={clientName}
        clientEmail={clientEmail}
        clientPhone={clientPhone}
      />

      {/* Resend edit dialog */}
      {resendRfi && (
        <ResendDialog
          rfi={resendRfi}
          onClose={() => setResendRfi(null)}
          onSuccess={() => refetch()}
        />
      )}
    </div>
  );
}
