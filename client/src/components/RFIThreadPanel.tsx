/**
 * RFIThreadPanel — email conversation thread panel for a single RFI
 * Shows the back-and-forth email chain, reply composer with file upload,
 * and a "Convert to Change Order" button.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Send, Paperclip, X, Loader2, MessageSquare, ArrowDownLeft, ArrowUpRight,
  GitBranch, Plus, Trash2, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useLocation } from "wouter";

interface RFIThreadPanelProps {
  rfiId: number;
  rfiTitle: string;
  projectId: number;
}

interface LineItem {
  task: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

// ── Convert to Change Order Dialog ────────────────────────────────────────────
function ConvertToCODialog({
  rfiId, rfiTitle, projectId, onClose, onSuccess,
}: {
  rfiId: number; rfiTitle: string; projectId: number;
  onClose: () => void; onSuccess: (coId: number, projectId: number) => void;
}) {
  const [title, setTitle] = useState(rfiTitle);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { task: "", description: "", quantity: 1, unitPrice: 0, lineTotal: 0 },
  ]);

  const totalAmount = lineItems.reduce((sum, li) => sum + li.lineTotal, 0);

  const convertMutation = trpc.rfiThreads.convertToChangeOrder.useMutation({
    onSuccess: (data) => {
      toast.success(`Change Order ${data.changeOrderNumber} created as draft.`);
      onSuccess(data.id, data.projectId);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateLineItem = (idx: number, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      // Recalculate lineTotal when qty or unitPrice changes
      if (field === "quantity" || field === "unitPrice") {
        const qty = field === "quantity" ? Number(value) : updated[idx].quantity;
        const price = field === "unitPrice" ? Number(value) : updated[idx].unitPrice;
        updated[idx].lineTotal = parseFloat((qty * price).toFixed(2));
      }
      return updated;
    });
  };

  const addLineItem = () => setLineItems(prev => [
    ...prev,
    { task: "", description: "", quantity: 1, unitPrice: 0, lineTotal: 0 },
  ]);

  const removeLineItem = (idx: number) => setLineItems(prev => prev.filter((_, i) => i !== idx));

  const handleSubmit = () => {
    if (!title.trim()) { toast.error("Title is required."); return; }
    convertMutation.mutate({
      rfiId,
      title: title.trim(),
      description: description.trim() || undefined,
      lineItems: lineItems.filter(li => li.task.trim()),
      amount: totalAmount,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-foreground flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-[#BF9A3B]" />
            Convert RFI to Change Order
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-widest mb-1.5 block">Title</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="bg-background border-border"
              placeholder="Change order title…"
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-widest mb-1.5 block">Description</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="bg-background border-border min-h-[80px] resize-none"
              placeholder="Describe the scope of this change…"
            />
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-widest">Line Items</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addLineItem}
                className="h-6 text-xs px-2 border-[#BF9A3B]/40 text-[#BF9A3B] hover:bg-[#BF9A3B]/10"
              >
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </div>
            <div className="space-y-2">
              {lineItems.map((li, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-4">
                    <Input
                      value={li.task}
                      onChange={e => updateLineItem(idx, "task", e.target.value)}
                      placeholder="Task"
                      className="bg-background border-border text-xs h-8"
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      value={li.description}
                      onChange={e => updateLineItem(idx, "description", e.target.value)}
                      placeholder="Description"
                      className="bg-background border-border text-xs h-8"
                    />
                  </div>
                  <div className="col-span-1">
                    <Input
                      type="number"
                      value={li.quantity}
                      onChange={e => updateLineItem(idx, "quantity", parseFloat(e.target.value) || 0)}
                      placeholder="Qty"
                      className="bg-background border-border text-xs h-8"
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      value={li.unitPrice}
                      onChange={e => updateLineItem(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                      placeholder="Unit $"
                      className="bg-background border-border text-xs h-8"
                    />
                  </div>
                  <div className="col-span-1 flex items-center justify-center h-8">
                    <span className="text-xs text-muted-foreground font-mono">${li.lineTotal.toFixed(2)}</span>
                  </div>
                  <div className="col-span-1 flex items-center justify-center h-8">
                    {lineItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLineItem(idx)}
                        className="text-muted-foreground hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-2 pt-2 border-t border-border">
              <span className="text-sm font-semibold text-foreground">
                Total: <span className={`${totalAmount >= 0 ? "text-[#BF9A3B]" : "text-green-400"}`}>
                  {totalAmount >= 0 ? "+" : ""}${Math.abs(totalAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </span>
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-widest mb-1.5 block">Internal Notes</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="bg-background border-border min-h-[60px] resize-none"
              placeholder="Internal notes (not sent to client)…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-border">Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={convertMutation.isPending}
            className="bg-[#BF9A3B] hover:bg-[#A8852E] text-[#1A1A1A] font-medium"
          >
            {convertMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating…</>
            ) : (
              <><GitBranch className="w-4 h-4 mr-2" /> Create Change Order</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Thread Panel ─────────────────────────────────────────────────────────
export function RFIThreadPanel({ rfiId, rfiTitle, projectId }: RFIThreadPanelProps) {
  const [replyBody, setReplyBody] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [uploadingThreadId, setUploadingThreadId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();

  const utils = trpc.useUtils();
  const { data: threads, isLoading } = trpc.rfiThreads.list.useQuery({ rfiId });

  // ── Auto-sync from Gmail on mount + manual Refresh ────────────────────────
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ imported: number } | null>(null);

  const syncMutation = trpc.rfiThreads.syncFromGmail.useMutation({
    onMutate: () => { setIsSyncing(true); setSyncResult(null); },
    onSuccess: (data) => {
      setIsSyncing(false);
      setSyncResult(data);
      if (data.imported > 0) {
        utils.rfiThreads.list.invalidate({ rfiId });
        toast.success(`${data.imported} new email${data.imported > 1 ? 's' : ''} imported from Gmail.`);
      }
    },
    onError: () => { setIsSyncing(false); },
  });

  // Auto-sync once when the panel first mounts for this rfiId
  useEffect(() => {
    syncMutation.mutate({ rfiId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfiId]);

  const addCommentMutation = trpc.rfiThreads.addComment.useMutation({
    onSuccess: async (data) => {
      // Upload any pending files to the new thread message
      if (pendingFiles.length > 0) {
        setUploadingThreadId(data.id);
        for (const file of pendingFiles) {
          try {
            const base64 = await fileToBase64(file);
            await uploadAttachmentMutation.mutateAsync({
              rfiId,
              rfiThreadId: data.id,
              fileName: file.name,
              mimeType: file.type || "application/octet-stream",
              fileBase64: base64,
            });
          } catch (e: any) {
            toast.error(`Failed to upload ${file.name}: ${e.message}`);
          }
        }
        setUploadingThreadId(null);
        setPendingFiles([]);
      }
      setReplyBody("");
      utils.rfiThreads.list.invalidate({ rfiId });
      toast.success("Reply sent to client.");
    },
    onError: (e) => toast.error(e.message),
  });

  const uploadAttachmentMutation = trpc.rfiThreads.uploadAttachment.useMutation({
    onSuccess: () => utils.rfiThreads.list.invalidate({ rfiId }),
  });

  const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]); // strip data:...;base64, prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setPendingFiles(prev => [...prev, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleSend = () => {
    if (!replyBody.trim() && pendingFiles.length === 0) {
      toast.error("Please enter a message or attach a file.");
      return;
    }
    addCommentMutation.mutate({
      rfiId,
      body: replyBody.trim() || `[${pendingFiles.length} attachment${pendingFiles.length > 1 ? "s" : ""} attached]`,
      sendEmail: true,
    });
  };

  const handleConvertSuccess = (_coId: number, _projectId: number) => {
    // Navigate to the Change Orders tab in the project
    setLocation(`/projects/${projectId}?tab=change-orders`);
  };

  const isSending = addCommentMutation.isPending || uploadingThreadId !== null;

  return (
    <div className="mt-4 border-t border-border pt-4 space-y-4">
      {/* Thread header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <MessageSquare className="w-4 h-4 text-[#BF9A3B]" />
          <span className="text-xs font-medium text-foreground uppercase tracking-widest">Email Thread</span>
          {threads && threads.length > 0 && (
            <Badge className="text-xs bg-[#BF9A3B]/10 text-[#BF9A3B] border border-[#BF9A3B]/20">
              {threads.length}
            </Badge>
          )}
          {isSyncing && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Syncing Gmail…
            </span>
          )}
          {!isSyncing && syncResult && syncResult.imported === 0 && (
            <span className="text-xs text-muted-foreground">Up to date</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => syncMutation.mutate({ rfiId })}
            disabled={isSyncing}
            title="Re-scan Gmail for new replies to this RFI"
            className="h-7 text-xs px-2.5 border-border text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${isSyncing ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowConvertDialog(true)}
            className="h-7 text-xs px-2.5 border-purple-500/40 text-purple-400 hover:bg-purple-500/10"
          >
            <GitBranch className="w-3 h-3 mr-1" /> Convert to Change Order
          </Button>
        </div>
      </div>

      {/* Thread messages */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading thread…
        </div>
      ) : !threads || threads.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2">
          No messages yet. Use the composer below to send a follow-up to the client.
        </p>
      ) : (
        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {threads.map(msg => {
            const isOutbound = msg.direction === "outbound";
            return (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${isOutbound ? "flex-row-reverse" : "flex-row"}`}
              >
                {/* Direction indicator */}
                <div className={`mt-1 p-1.5 rounded-full shrink-0 ${
                  isOutbound ? "bg-[#BF9A3B]/20" : "bg-blue-500/20"
                }`}>
                  {isOutbound
                    ? <ArrowUpRight className="w-3 h-3 text-[#BF9A3B]" />
                    : <ArrowDownLeft className="w-3 h-3 text-blue-400" />
                  }
                </div>

                {/* Bubble */}
                <div className={`flex-1 max-w-[85%] ${isOutbound ? "items-end" : "items-start"} flex flex-col gap-1`}>
                  <div className={`rounded-lg px-3 py-2.5 text-sm leading-relaxed ${
                    isOutbound
                      ? "bg-[#BF9A3B]/10 border border-[#BF9A3B]/20 text-foreground"
                      : "bg-blue-500/10 border border-blue-500/20 text-foreground"
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.body}</p>
                  </div>

                  {/* Attachments */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="space-y-1 mt-1">
                      {msg.attachments.map((att: any) => (
                        <a
                          key={att.id}
                          href={att.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-[#BF9A3B] hover:underline"
                        >
                          <Paperclip className="w-3 h-3" /> {att.fileName}
                        </a>
                      ))}
                    </div>
                  )}

                  <div className={`flex items-center gap-2 text-xs text-muted-foreground ${isOutbound ? "flex-row-reverse" : ""}`}>
                    <span>{msg.senderName || (isOutbound ? "You" : "Client")}</span>
                    <span>·</span>
                    <span>{format(new Date(msg.createdAt), "MMM d, h:mm a")}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reply composer */}
      <div className="bg-background/50 border border-border rounded-lg p-3 space-y-2">
        <Textarea
          value={replyBody}
          onChange={e => setReplyBody(e.target.value)}
          placeholder="Type a follow-up message or request for more information…"
          className="bg-transparent border-0 p-0 resize-none min-h-[72px] text-sm focus-visible:ring-0 placeholder:text-muted-foreground/60"
          onKeyDown={e => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend();
          }}
        />

        {/* Pending files */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
            {pendingFiles.map((file, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-muted rounded px-2 py-1 text-xs text-foreground">
                <Paperclip className="w-3 h-3 text-muted-foreground" />
                <span className="max-w-[120px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))}
                  className="text-muted-foreground hover:text-red-400 transition-colors ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-border">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
              title="Attach files (images, PDFs, documents)"
            >
              <Paperclip className="w-3.5 h-3.5 mr-1" /> Attach
            </Button>
          </div>

          <Button
            size="sm"
            onClick={handleSend}
            disabled={isSending}
            className="bg-[#BF9A3B] hover:bg-[#A8852E] text-[#1A1A1A] h-7 text-xs px-3 font-medium"
          >
            {isSending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <><Send className="w-3.5 h-3.5 mr-1.5" /> Send Reply</>
            )}
          </Button>
        </div>
      </div>

      {/* Convert to CO dialog */}
      {showConvertDialog && (
        <ConvertToCODialog
          rfiId={rfiId}
          rfiTitle={rfiTitle}
          projectId={projectId}
          onClose={() => setShowConvertDialog(false)}
          onSuccess={handleConvertSuccess}
        />
      )}
    </div>
  );
}
