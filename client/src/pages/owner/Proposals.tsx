import { useState, useEffect, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useLocation } from "wouter";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Plus, FileText, DollarSign, Trash2, Send, Eye, Sparkles,
  UserPlus, CheckCircle2, X, Loader2, Mail, MessageSquare,
  Phone, User, MapPin, Pencil, Download, RefreshCw, ChevronLeft, Receipt,
  ShoppingCart, ImageOff, ExternalLink, FolderOpen, Image, Copy, Check, Camera, Paperclip,
  Cloud, AlertCircle, Undo2, Redo2, History, RotateCcw,
} from "lucide-react";
import ProductImportSidebar, { type ImportedProduct } from "@/components/ProductImportSidebar";
import AIProposalBuilder, { type AILineItem } from "@/components/AIProposalBuilder";
import { useProposalAutosave, type AutosaveStatus } from "@/hooks/useProposalAutosave";
import { useUndoRedo, useUndoRedoKeyboard } from "@/hooks/useUndoRedo";
import ProposalMediaPanel from "@/components/ProposalMediaPanel";
import InternalCostingPanel from "@/components/InternalCostingPanel";
import InspirationDrawer from "@/components/InspirationDrawer";
import FieldCaptureDrawer from "@/components/FieldCaptureDrawer";
import { format } from "date-fns";

const GOLD = "#BF9A3B";
const GREEN = "#4CAF7D";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    draft:    { label: "Draft",    color: "#8A8B82" },
    sent:     { label: "Sent",     color: "#5B9BD5" },
    viewed:   { label: "Viewed",   color: "#9B59B6" },
    approved: { label: "Approved", color: GREEN },
    rejected: { label: "Rejected", color: "#E05252" },
    expired:  { label: "Expired",  color: "#E8A838" },
  };
  const s = map[status] ?? { label: status, color: GOLD };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: `${s.color}20`, color: s.color, border: `1px solid ${s.color}40` }}>
      {s.label}
    </span>
  );
}

const emptyLineItem = () => ({
  task: "", description: "", quantity: "1", unitPrice: "",
  showMarkup: false, markupPercent: "20", category: "labor",
  imageUrl: "", productUrl: "", productSource: "",
});

const emptyForm = () => ({
  clientId: "", title: "", notes: "", validDays: "30", depositPercent: "50", proposalNumber: "",
});

const emptyNewClient = () => ({
  name: "", email: "", phone: "", address: "",
});

// ─── Client Confirmation Card ─────────────────────────────────────────────────
function ClientCard({ client, proposalNumber }: { client: { name: string; email?: string | null; phone?: string | null; address?: string | null }; proposalNumber?: string }) {
  return (
    <div className="mt-2 rounded-xl border p-4 space-y-2"
      style={{ background: `${GOLD}08`, borderColor: `${GOLD}30` }}>
        <div className="flex items-center gap-2 mb-1">
        <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold"
          style={{ background: `${GOLD}25`, color: GOLD }}>
          {client.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground">{client.name}</p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Selected Client</p>
        </div>
        {proposalNumber && (
          <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full border"
            style={{ color: GOLD, borderColor: `${GOLD}50`, background: `${GOLD}12` }}>
            {proposalNumber}
          </span>
        )}
        <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: GREEN }} />
      </div>
      <div className="grid grid-cols-1 gap-1 text-xs text-muted-foreground pl-1">
        {client.email && (
          <span className="flex items-center gap-1.5">
            <Mail className="h-3 w-3 shrink-0" style={{ color: GOLD }} />
            {client.email}
          </span>
        )}
        {client.phone && (
          <span className="flex items-center gap-1.5">
            <Phone className="h-3 w-3 shrink-0" style={{ color: GOLD }} />
            {client.phone}
          </span>
        )}
        {client.address && (
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3 shrink-0" style={{ color: GOLD }} />
            {client.address}
          </span>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground/60 pl-1 pt-0.5">
        This proposal will be sent to the contact info above — verify before proceeding.
      </p>
    </div>
  );
}

// ─── PDF Preview Modal ────────────────────────────────────────────────────────
function PdfPreviewModal({
  open, onClose, onConfirmSend, onConfirmSendWithCopy, proposal, lineItems, client, isSending,
}: {
  open: boolean; onClose: () => void;
  onConfirmSend: (attachmentIds: number[]) => void;
  onConfirmSendWithCopy: (attachmentIds: number[]) => void;
  proposal: any; lineItems: any[]; client: any; isSending: boolean;
}) {
  const total = lineItems.reduce((sum, item) => {
    const base = parseFloat(item.unitPrice || "0") * parseFloat(item.quantity || "1");
    const markup = item.showMarkup ? base * (parseFloat(item.markupPercent || "0") / 100) : 0;
    return sum + base + markup;
  }, 0);
  const deposit = total * (parseFloat(proposal?.depositPercent || "50") / 100);

  // ── Send-time attachment state ──
  const [stagedAttachments, setStagedAttachments] = useState<Array<{ id: number; fileName: string; fileUrl: string }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadDirect = trpc.proposalAttachments.uploadDirect.useMutation();

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !proposal?.id) return;
    // Cap at 5 attachments total
    const remaining = 5 - stagedAttachments.length;
    if (remaining <= 0) { toast.error("Maximum 5 attachments per email"); return; }
    const toUpload = files.slice(0, remaining);
    setIsUploading(true);
    try {
      for (const file of toUpload) {
        if (file.size > 8 * 1024 * 1024) { toast.error(`${file.name} is too large (max 8 MB)`); continue; }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const result = await uploadDirect.mutateAsync({
          estimateId: proposal.id,
          dataUrl,
          mime: file.type || "application/octet-stream",
          fileName: file.name,
          clientVisible: true,
        });
        setStagedAttachments(prev => [...prev, { id: result.id, fileName: file.name, fileUrl: result.fileUrl }]);
      }
    } catch (err: any) {
      toast.error("Upload failed: " + (err.message ?? "unknown error"));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeAttachment(id: number) {
    setStagedAttachments(prev => prev.filter(a => a.id !== id));
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <Eye className="h-5 w-5" style={{ color: GOLD }} />
            Preview Proposal Before Sending
          </DialogTitle>
          <p className="text-sm text-muted-foreground">Review carefully — this is exactly what your client will receive.</p>
        </DialogHeader>

        <div className="border border-border rounded-xl overflow-hidden">
          {/* Header */}
          <div className="p-6" style={{ background: "#2E2F2A" }}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-serif" style={{ color: GOLD }}>Kitchens Plus Upstate</h2>
                <p className="text-xs tracking-widest uppercase mt-0.5" style={{ color: "#F5EDE7" }}>Renovations &amp; Design</p>
              </div>
              {proposal?.estimateNumber && (
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: "#F5EDE7", opacity: 0.6 }}>Proposal No.</p>
                  <p className="text-lg font-mono font-bold" style={{ color: GOLD }}>{proposal.estimateNumber}</p>
                </div>
              )}
            </div>
          </div>

          <div className="p-6 space-y-5 bg-background">
            {/* Client + Proposal Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Proposal For</p>
                <p className="font-semibold text-foreground">{client?.name ?? "—"}</p>
                {client?.email && <p className="text-sm text-muted-foreground">{client.email}</p>}
                {client?.phone && <p className="text-sm text-muted-foreground">{client.phone}</p>}
                {client?.address && <p className="text-xs text-muted-foreground mt-0.5">{client.address}</p>}
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Proposal</p>
                <p className="font-semibold text-foreground">{proposal?.title}</p>
                <p className="text-sm text-muted-foreground">Valid {proposal?.validDays ?? 30} days</p>
              </div>
            </div>

            {/* Line Items */}
            <div>
              <div className="grid grid-cols-12 gap-2 px-3 py-2 rounded-t-lg text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                style={{ background: "var(--kp-charcoal-light)" }}>
                <div className="col-span-4">Task</div>
                <div className="col-span-3">Description</div>
                <div className="col-span-1 text-right">Qty</div>
                <div className="col-span-2 text-right">Unit Price</div>
                <div className="col-span-2 text-right">Total</div>
              </div>
              {lineItems.map((item, i) => {
                const base = parseFloat(item.unitPrice || "0") * parseFloat(item.quantity || "1");
                const markup = item.showMarkup ? base * (parseFloat(item.markupPercent || "0") / 100) : 0;
                const lineTotal = base + markup;
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2.5 border-b border-border/40 text-sm">
                    <div className="col-span-4 font-medium text-foreground">{item.task || "—"}</div>
                    <div className="col-span-3 text-muted-foreground text-xs">{item.description || "—"}</div>
                    <div className="col-span-1 text-right text-muted-foreground">{item.quantity}</div>
                    <div className="col-span-2 text-right text-muted-foreground">
                      ${parseFloat(item.unitPrice || "0").toFixed(2)}
                      {item.showMarkup && <span className="text-xs ml-1 opacity-60">+{item.markupPercent}%</span>}
                    </div>
                    <div className="col-span-2 text-right font-medium text-foreground">${lineTotal.toFixed(2)}</div>
                  </div>
                );
              })}
              <div className="px-3 py-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">${total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-base font-semibold border-t border-border pt-2 mt-2">
                  <span>Total Investment</span>
                  <span style={{ color: GOLD }}>${total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Deposit Required ({proposal?.depositPercent ?? 50}%)</span>
                  <span>${deposit.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {proposal?.notes && (
              <div className="p-3 rounded-lg border-l-2 text-sm text-muted-foreground"
                style={{ borderColor: GOLD, background: `${GOLD}08` }}>
                {proposal.notes}
              </div>
            )}

            {/* Client Actions Preview */}
            <div className="p-4 rounded-lg border border-border/60 bg-card space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Client will see these options:</p>
              <div className="flex gap-3">
                <div className="flex-1 py-2 px-3 rounded-lg text-center text-sm font-medium"
                  style={{ background: `${GOLD}20`, color: GOLD, border: `1px solid ${GOLD}40` }}>
                  ✓ Approve As-Is
                </div>
                <div className="flex-1 py-2 px-3 rounded-lg text-center text-sm font-medium bg-accent/50 text-muted-foreground border border-border/60">
                  💬 Request Discussion
                </div>
              </div>
            </div>

            {/* Send-time attachments */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Paperclip className="h-3 w-3" /> Additional Attachments
                  <span className="text-muted-foreground/60 normal-case tracking-normal font-normal">— optional files to include in this email</span>
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={isUploading || isSending || stagedAttachments.length >= 5}
                  onClick={() => fileInputRef.current?.click()}>
                  {isUploading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                  {isUploading ? "Uploading…" : "Attach File"}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>
              {stagedAttachments.length > 0 ? (
                <div className="space-y-1.5">
                  {stagedAttachments.map(att => (
                    <div key={att.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 text-sm"
                      style={{ background: `${GOLD}08` }}>
                      <Paperclip className="h-3.5 w-3.5 shrink-0" style={{ color: GOLD }} />
                      <span className="flex-1 truncate text-foreground">{att.fileName}</span>
                      <a href={att.fileUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors">Preview</a>
                      <button type="button" onClick={() => removeAttachment(att.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors ml-1">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground/60 pl-1">
                    {stagedAttachments.length}/5 files — these will be attached to the email and visible to the client in their portal.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/60 pl-1">No additional files attached. The proposal PDF is always included.</p>
              )}
            </div>

            {/* Send channels */}
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> Email to {client?.email || "client"}</span>
              {client?.phone && <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> SMS to {client.phone}</span>}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose} disabled={isSending}>
            <X className="h-4 w-4 mr-1.5" /> Cancel
          </Button>
          <Button className="btn-gold" onClick={() => onConfirmSend(stagedAttachments.map(a => a.id))} disabled={isSending || isUploading}>
            {isSending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
            {isSending ? "Sending…" : `Send to Client${stagedAttachments.length > 0 ? ` (+${stagedAttachments.length})` : ""}`}
          </Button>
          <Button
            variant="outline"
            className="border-amber-500/60 text-amber-400 hover:bg-amber-500/10"
            onClick={() => onConfirmSendWithCopy(stagedAttachments.map(a => a.id))}
            disabled={isSending || isUploading}
            title="Sends to client + CC copy to chad@cpenterprisessc.com">
            {isSending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
            {isSending ? "Sending…" : `Send + Copy to Me${stagedAttachments.length > 0 ? ` (+${stagedAttachments.length})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Proposal Detail Sheet ───────────────────────────────────────────────────
function ProposalDetailSheet({
  proposalId, open, onClose, clients, onResend, onResendWithCopy, onCreateInvoice,
  onOpenInspiration, onOpenFieldCapture,
}: {
  proposalId: number | null;
  open: boolean;
  onClose: () => void;
  clients: any[];
  onResend: (id: number) => void;
  onResendWithCopy: (id: number) => void;
  onCreateInvoice?: (proposalId: number, amount: number, leadId?: number) => void;
  onOpenInspiration?: (leadId: number | undefined) => void;
  onOpenFieldCapture?: (leadId: number | undefined) => void;
}) {
  const [, setLocation] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editDeposit, setEditDeposit] = useState("50");
  const [editItems, setEditItems] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  // Guard: skip the first autosave trigger when entering edit mode
  const editInitializedRef = useRef(false);
  const [showApprovalPreview, setShowApprovalPreview] = useState(false);
  const [showEditProductSidebar, setShowEditProductSidebar] = useState(false);
  const [editProductSidebarDefault, setEditProductSidebarDefault] = useState<string | undefined>(undefined);
  const sheetContentRef = useRef<HTMLDivElement>(null);
  const [showSendPreview, setShowSendPreview] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showPricesToClient, setShowPricesToClient] = useState<boolean>(true);

  // ── Undo / Redo ──
  const undoRedo = useUndoRedo<any[]>({ enabled: isEditing });

  function handleUndo() {
    const prev = undoRedo.undo();
    if (prev) setEditItems(prev);
  }
  function handleRedo() {
    const next = undoRedo.redo();
    if (next) setEditItems(next);
  }

  useUndoRedoKeyboard({
    enabled: isEditing,
    onUndo: handleUndo,
    onRedo: handleRedo,
  });

  // ── Autosave ──
  const autosave = useProposalAutosave();

  const utils = trpc.useUtils();
  const { data: proposal, isLoading } = trpc.estimates.get.useQuery(
    { id: proposalId! },
    { enabled: !!proposalId && open }
  );

  const updateProposal = trpc.estimates.update.useMutation();
  const addLineItem = trpc.estimates.addLineItem.useMutation();
  const deleteLineItem = trpc.estimates.deleteLineItem.useMutation();
  const saveAllMutation = trpc.estimates.saveAll.useMutation();
  const contractorApprove = trpc.estimates.contractorApprove.useMutation({
    onSuccess: (data) => {
      utils.estimates.get.invalidate({ id: proposalId! });
      utils.estimates.list.invalidate();
      const msgs: string[] = ["Proposal marked as approved!"];
      if (data.emailSent) msgs.push("Approval email sent to client.");
      if (data.smsSent) msgs.push("SMS sent to client.");
      if (!data.emailSent && data.emailError) msgs.push(`⚠️ Email not sent: ${data.emailError}`);
      if (!data.emailSent && !data.emailError) msgs.push("⚠️ No email on file — email not sent.");
      toast.success(msgs.join(" "));
    },
    onError: (err) => toast.error(err.message),
  });

  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  // Per-line-item photo upload state
  const [isLineItemUploading, setIsLineItemUploading] = useState(false);
  const lineItemUploadRef = useRef<HTMLInputElement>(null);
  const [pendingLineItemId, setPendingLineItemId] = useState<number | null>(null);
  const { data: lineItemAttachments = [] } = trpc.proposalAttachments.listByEstimate.useQuery(
    { estimateId: proposalId! },
    { enabled: !!proposalId && open }
  );
  const uploadLineItemPhoto = trpc.proposalAttachments.uploadDirect.useMutation({
    onSuccess: () => {
      utils.proposalAttachments.listByEstimate.invalidate({ estimateId: proposalId! });
      toast.success("Photo attached to line item");
    },
    onError: (e) => toast.error(e.message),
  });
  const removeLineItemPhoto = trpc.proposalAttachments.remove.useMutation({
    onSuccess: () => utils.proposalAttachments.listByEstimate.invalidate({ estimateId: proposalId! }),
    onError: (e) => toast.error(e.message),
  });
  const toggleLineItemPhotoVisible = trpc.proposalAttachments.toggleClientVisible.useMutation({
    onSettled: () => utils.proposalAttachments.listByEstimate.invalidate({ estimateId: proposalId! }),
  });
  async function handleLineItemPhotoUpload(e: React.ChangeEvent<HTMLInputElement>, lineItemId: number) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = "";
    setIsLineItemUploading(true);
    try {
      for (const file of files) {
        const dataUrl = await new Promise<string>((res) => {
          const reader = new FileReader();
          reader.onload = (ev) => res(ev.target?.result as string);
          reader.readAsDataURL(file);
        });
        await uploadLineItemPhoto.mutateAsync({
          estimateId: proposalId!,
          dataUrl,
          mime: file.type || "image/jpeg",
          fileName: file.name,
          clientVisible: true,
          lineItemId,
        });
      }
    } finally {
      setIsLineItemUploading(false);
      setPendingLineItemId(null);
    }
  }
  // iOS Safari blocks window.open() inside async callbacks (popup blocker).
  // Fix: open the window synchronously on tap, then navigate it once the URL arrives.
  const pdfWindowRef = useRef<Window | null>(null);
  const generatePdf = trpc.estimates.generatePdf.useMutation({
    onSuccess: (data) => {
      if (pdfWindowRef.current && !pdfWindowRef.current.closed) {
        // Navigate the pre-opened window to the PDF URL
        pdfWindowRef.current.location.href = data.url;
      } else {
        // Fallback: try window.open again (works on non-iOS)
        const w = window.open(data.url, "_blank");
        if (!w) {
          // Last resort for iOS: navigate current tab then go back
          const a = document.createElement("a");
          a.href = data.url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      }
      pdfWindowRef.current = null;
      utils.estimates.get.invalidate({ id: proposalId! });
    },
    onError: (err) => {
      if (pdfWindowRef.current && !pdfWindowRef.current.closed) {
        pdfWindowRef.current.close();
      }
      pdfWindowRef.current = null;
      toast.error("PDF generation failed: " + err.message);
    },
    onSettled: () => setIsPdfGenerating(false),
  });

  const resendApprovalEmail = trpc.estimates.resendApprovalEmail.useMutation({
    onSuccess: (data) => {
      const msgs: string[] = [];
      if (data.emailSent) msgs.push("Approval email resent to client.");
      if (data.smsSent) msgs.push("SMS resent.");
      if (!data.emailSent && data.emailError) msgs.push(`⚠️ Email failed: ${data.emailError}`);
      toast.success(msgs.length > 0 ? msgs.join(" ") : "Done");
    },
    onError: (err) => toast.error(err.message),
  });

  // Populate edit state when proposal loads
  useEffect(() => {
    if (proposal && !isEditing) {
      setEditTitle(proposal.title ?? "");
      setEditNotes(proposal.notes ?? "");
      setEditDeposit(String(parseFloat(String(proposal.depositPercent ?? "50"))));
      setShowPricesToClient((proposal as any).hidePrices ? false : true);
      setEditItems((proposal.lineItems ?? []).map((li: any) => ({
        id: li.id,
        task: li.task ?? "",
        description: li.description ?? "",
        quantity: String(parseFloat(String(li.quantity ?? "1"))),
        unitPrice: String(parseFloat(String(li.unitCost ?? "0"))),
        showMarkup: li.showMarkup ?? false,
        markupPercent: String(parseFloat(String(li.markupPercent ?? "0"))),
        category: li.category ?? "labor",
        unit: li.unit ?? "",
        imageUrl: li.imageUrl ?? "",
        productUrl: li.productUrl ?? "",
        productSource: li.productSource ?? "",
      })));
      editInitializedRef.current = false; // reset guard when data loads
    }
  }, [proposal?.id, isEditing]);

  // Record undo/redo snapshots when editItems change
  useEffect(() => {
    if (!isEditing || editItems.length === 0) return;
    undoRedo.record(editItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editItems, isEditing]);

  // ── Autosave: trigger on every edit state change ──
  useEffect(() => {
    if (!isEditing || !proposal) return;
    // Skip the first trigger when entering edit mode (data just loaded)
    if (!editInitializedRef.current) {
      editInitializedRef.current = true;
      return;
    }
    autosave.triggerSave({
      id: proposal.id,
      title: editTitle,
      notes: editNotes,
      depositPercent: editDeposit,
      hidePrices: showPricesToClient ? 0 : 1,
      lineItems: editItems.map((item, i) => ({
        id: item.id || undefined,
        task: item.task || undefined,
        description: item.description || undefined,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit || undefined,
        unitCost: item.unitPrice || "0",
        markupPercent: item.showMarkup ? item.markupPercent : "0",
        showMarkup: item.showMarkup,
        productUrl: item.productUrl || undefined,
        productSource: item.productSource || undefined,
        imageUrl: item.imageUrl || undefined,
        sortOrder: i,
      })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, editTitle, editNotes, editDeposit, showPricesToClient, editItems]);

  // Reset autosave + undo/redo when entering/exiting edit mode
  useEffect(() => {
    if (!isEditing) {
      autosave.reset();
      undoRedo.reset();
    } else if (editItems.length > 0) {
      // Seed undo/redo with initial state when entering edit mode
      undoRedo.reset(editItems);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  const pClient = proposal
    ? clients.find((c: any) => c.id === ((proposal as any).leadId ?? (proposal as any).clientId))
    : null;

  const editSubtotal = editItems.reduce((sum, item) => {
    const base = parseFloat(item.unitPrice || "0") * parseFloat(item.quantity || "1");
    const markup = item.showMarkup ? base * (parseFloat(item.markupPercent || "0") / 100) : 0;
    return sum + base + markup;
  }, 0);
  const editDepositAmt = editSubtotal * (parseFloat(editDeposit || "50") / 100);

  function updateEditItem(i: number, field: string, value: any) {
    setEditItems(items => items.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  }

  async function handleEditTaskBlur(i: number, taskName: string) {
    if (!taskName.trim()) return;
    const item = editItems[i];
    if (item.unitPrice && item.unitPrice !== "" && item.unitPrice !== "0") return;
    try {
      const hist = await utils.estimates.getHistoricalPricing.fetch({ taskName });
      if (hist && parseFloat(hist.avgUnitPrice) > 0) {
        updateEditItem(i, "unitPrice", hist.avgUnitPrice);
        toast.info(`Price pre-filled from ${hist.matchCount} past job${hist.matchCount !== 1 ? "s" : ""}: $${hist.avgUnitPrice} avg`, { duration: 3000 });
      }
    } catch { /* silently skip */ }
  }

  async function handleSaveEdit() {
    if (!proposal) return;
    // Cancel any pending autosave debounce
    autosave.reset();
    setIsSaving(true);
    try {
      await saveAllMutation.mutateAsync({
        id: proposal.id,
        title: editTitle,
        notes: editNotes,
        depositPercent: editDeposit,
        hidePrices: showPricesToClient ? 0 : 1,
        lineItems: editItems.map((item, i) => ({
          id: item.id || undefined,
          task: item.task || undefined,
          description: item.description || undefined,
          category: item.category,
          quantity: item.quantity,
          unit: item.unit || undefined,
          unitCost: item.unitPrice || "0",
          markupPercent: item.showMarkup ? item.markupPercent : "0",
          showMarkup: item.showMarkup,
          productUrl: item.productUrl || undefined,
          productSource: item.productSource || undefined,
          imageUrl: item.imageUrl || undefined,
          sortOrder: i,
        })),
        _savedAt: Date.now(),
      });
      await utils.estimates.get.invalidate({ id: proposal.id });
      await utils.estimates.list.invalidate();
      setIsEditing(false);
      toast.success("Proposal saved");
    } catch (err: any) {
      toast.error("Save failed: " + err.message);
    } finally {
      setIsSaving(false);
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

  return (
    <Sheet open={open} onOpenChange={v => {
      if (!v) {
        if (isEditing && autosave.isDirty) autosave.forceSave();
        autosave.reset();
        setIsEditing(false);
        onClose();
      }
    }}>
      <SheetContent ref={sheetContentRef} className="w-full sm:max-w-5xl overflow-y-auto bg-card border-border p-0" side="right">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isEditing ? (
              <button onClick={() => {
                if (autosave.isDirty) autosave.forceSave();
                setIsEditing(false);
              }} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
            ) : (
              <SheetTitle className="font-serif text-lg" style={{ color: "var(--kp-cream)" }}>
                {proposal?.estimateNumber ?? "Proposal"}
              </SheetTitle>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && proposal && (
              <>
                <Button size="sm" variant="outline" className="h-8 text-xs border-border/60"
                  disabled={isPdfGenerating}
                  onClick={() => {
                    // Open window synchronously (required for iOS Safari popup policy)
                    pdfWindowRef.current = window.open("", "_blank");
                    if (pdfWindowRef.current) {
                      pdfWindowRef.current.document.write('<html><body style="background:#111;color:#ccc;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><p>Generating PDF…</p></body></html>');
                    }
                    setIsPdfGenerating(true);
                    generatePdf.mutate({ id: proposal.id });
                  }}>
                  {isPdfGenerating
                    ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    : <Download className="h-3.5 w-3.5 mr-1" />}
                  {isPdfGenerating ? "Generating…" : "PDF"}
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs border-border/60"
                  onClick={() => setIsEditing(true)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs border-border/60"
                  onClick={() => setShowVersionHistory(!showVersionHistory)}>
                  <History className="h-3.5 w-3.5 mr-1" /> History
                </Button>
                <Button size="sm" className="h-8 text-xs btn-gold"
                  onClick={() => { onResend(proposal.id); }}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Resend
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs border-amber-500/60 text-amber-400 hover:bg-amber-500/10"
                  title="Resend to client + CC copy to chad@cpenterprisessc.com"
                  onClick={() => { onResendWithCopy(proposal.id); }}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Resend + Copy
                </Button>
                {/* Contractor Approval button — only shown when proposal is NOT yet approved */}
                {proposal.status !== "approved" && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs border-border/60"
                      onClick={() => setShowSendPreview(true)}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Preview Send Email
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs border-border/60"
                      onClick={() => setShowApprovalPreview(true)}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Preview Approval Email
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 text-xs font-semibold"
                      style={{ background: "#4CAF7D", color: "#fff", border: "none" }}
                      disabled={contractorApprove.isPending}
                      onClick={() => {
                        if (!confirm(`Mark this proposal as approved on behalf of the client?\n\nThis will:\n• Set status to Approved\n• Send an approval confirmation email to the client\n• Send an approval SMS to the client\n\nContinue?`)) return;
                        contractorApprove.mutate({ id: proposal.id, origin: window.location.origin });
                      }}>
                      {contractorApprove.isPending
                        ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                      {contractorApprove.isPending ? "Approving…" : "Contractor Approval"}
                    </Button>
                  </>
                )}
                {proposal.approvedAt && (
                  <>
                    <Button size="sm" variant="outline" className="h-8 text-xs border-border/60"
                      onClick={() => setShowSendPreview(true)}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Preview Send Email
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs border-border/60"
                      onClick={() => setShowApprovalPreview(true)}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Preview Approval Email
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs border-border/60"
                      disabled={resendApprovalEmail.isPending}
                      onClick={() => {
                        if (!confirm(`Resend the approval confirmation email and SMS to the client?\n\nThis will re-send the "Your Project is Approved" email.`)) return;
                        resendApprovalEmail.mutate({ id: proposal.id, origin: window.location.origin });
                      }}>
                      {resendApprovalEmail.isPending
                        ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        : <Mail className="h-3.5 w-3.5 mr-1" />}
                      {resendApprovalEmail.isPending ? "Sending…" : "Resend Approval"}
                    </Button>
                    <Button size="sm" className="h-8 text-xs" style={{ background: GREEN, color: "#fff" }}
                      onClick={() => {
                        const total = (proposal as any).total ?? 0;
                        const leadId = (proposal as any).leadId ?? undefined;
                        if (onCreateInvoice) {
                          onCreateInvoice(proposal.id, total, leadId);
                        } else {
                          const params = new URLSearchParams({ proposalId: String(proposal.id), amount: String(total) });
                          if (leadId) params.set("leadId", String(leadId));
                          setLocation(`/invoices?${params.toString()}`);
                        }
                        onClose();
                      }}>
                      <Receipt className="h-3.5 w-3.5 mr-1" /> Invoice
                    </Button>
                    {(proposal as any).projectId && (
                      <Button size="sm" variant="outline" className="h-8 text-xs border-border/60"
                        onClick={() => { setLocation(`/projects/${(proposal as any).projectId}`); onClose(); }}>
                        <FolderOpen className="h-3.5 w-3.5 mr-1" /> Go to Project
                      </Button>
                    )}
                  </>
                )}
              </>
            )}
            {isEditing && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-1.5" style={{ background: "var(--kp-charcoal-light)" }}>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Show Prices to Client</span>
                  <Switch
                    checked={showPricesToClient}
                    onCheckedChange={setShowPricesToClient}
                    className="scale-75"
                  />
                  <span className="text-xs font-medium" style={{ color: showPricesToClient ? "#4CAF7D" : "var(--muted-foreground)" }}>
                    {showPricesToClient ? "Visible" : "Hidden"}
                  </span>
                </div>
                {/* Undo / Redo */}
                <div className="flex items-center gap-0.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={!undoRedo.canUndo}
                    onClick={handleUndo}
                    title="Undo (Ctrl+Z)">
                    <Undo2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={!undoRedo.canRedo}
                    onClick={handleRedo}
                    title="Redo (Ctrl+Shift+Z)">
                    <Redo2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {/* Autosave status */}
                <div className="flex items-center gap-1.5 text-xs">
                  {autosave.status === "saving" && (
                    <><Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /><span className="text-muted-foreground">Saving…</span></>
                  )}
                  {autosave.status === "saved" && (
                    <><Cloud className="h-3 w-3" style={{ color: GREEN }} /><span style={{ color: GREEN }}>Saved</span></>
                  )}
                  {autosave.status === "error" && (
                    <><AlertCircle className="h-3 w-3 text-red-400" /><span className="text-red-400">Save failed</span></>
                  )}
                </div>
                <Button size="sm" className="h-8 text-xs btn-gold" onClick={handleSaveEdit} disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                  {isSaving ? "Saving…" : "Done Editing"}
                </Button>
              </div>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: GOLD }} />
          </div>
        ) : !proposal ? (
          <div className="py-20 text-center text-muted-foreground">Proposal not found</div>
        ) : isEditing ? (
          /* ── EDIT MODE ── */
          <div className="p-6 space-y-5">
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Proposal Title</Label>
                <Input className="bg-background border-border" value={editTitle}
                  onChange={e => setEditTitle(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Deposit %</Label>
                  <Input className="bg-background border-border" type="number" value={editDeposit}
                    onChange={e => setEditDeposit(e.target.value)} />
                </div>
                <div className="flex items-end pb-1">
                  <p className="text-sm text-muted-foreground">Deposit: <span className="font-semibold" style={{ color: GOLD }}>{fmt(editDepositAmt)}</span></p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Edit Line Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Line Items</span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                    style={{ background: "#F96302", borderColor: "#F96302", color: "#fff" }}
                    onClick={() => { setEditProductSidebarDefault("The Home Depot"); setShowEditProductSidebar(true); }}>
                    <ShoppingCart className="h-3 w-3" /> Home Depot
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs border-border/60 gap-1"
                    style={{ borderColor: `${GOLD}60`, color: GOLD }}
                    onClick={() => { setEditProductSidebarDefault(undefined); setShowEditProductSidebar(true); }}>
                    <ShoppingCart className="h-3 w-3" /> Other Supplier
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs border-border/60"
                    onClick={() => setEditItems(items => [...items, emptyLineItem()])}>
                    <Plus className="h-3 w-3 mr-1" /> Add Item
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {editItems.map((item, i) => {
                  const base = parseFloat(item.unitPrice || "0") * parseFloat(item.quantity || "1");
                  const markup = item.showMarkup ? base * (parseFloat(item.markupPercent || "0") / 100) : 0;
                  const lineTotal = base + markup;
                  return (
                    <div key={i} className="border border-border/50 rounded-lg p-3 space-y-2 bg-background/50">
                      {/* Product image strip (if imported from supplier) */}
                      {item.imageUrl && (
                        <div className="flex items-center gap-3 pb-2 border-b border-border/30">
                          <img
                            src={item.imageUrl}
                            alt={item.task}
                            className="h-14 w-14 rounded object-contain bg-white shrink-0"
                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground truncate">{item.productSource}</p>
                            {item.productUrl && (
                              <a href={item.productUrl} target="_blank" rel="noreferrer"
                                className="text-xs flex items-center gap-1 hover:underline"
                                style={{ color: GOLD }}>
                                <ExternalLink className="h-3 w-3" /> View on supplier site
                              </a>
                            )}
                          </div>
                          <button type="button" title="Remove image"
                            className="p-1 rounded text-muted-foreground hover:text-destructive"
                            onClick={() => updateEditItem(i, "imageUrl", "")}>
                            <ImageOff className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-4">
                          <Input className="bg-background border-border h-9 text-sm" placeholder="Task name"
                            value={item.task}
                            onChange={e => updateEditItem(i, "task", e.target.value)}
                            onBlur={e => handleEditTaskBlur(i, e.target.value)} />
                        </div>
                        <div className="col-span-4">
                          <Input className="bg-background border-border h-9 text-sm" placeholder="Description / details"
                            value={item.description} onChange={e => updateEditItem(i, "description", e.target.value)} />
                        </div>
                        <div className="col-span-1">
                          <Input className="bg-background border-border h-9 text-sm text-center" type="number" placeholder="1"
                            value={item.quantity} onChange={e => updateEditItem(i, "quantity", e.target.value)} />
                        </div>
                        <div className="col-span-2">
                          <Input className="bg-background border-border h-9 text-sm" type="number" placeholder="0.00"
                            value={item.unitPrice} onChange={e => updateEditItem(i, "unitPrice", e.target.value)} />
                        </div>
                        <div className="col-span-1 flex items-center justify-between gap-1">
                          <span className="text-sm font-medium" style={{ color: lineTotal > 0 ? GOLD : undefined }}>
                            {fmt(lineTotal)}
                          </span>
                          {editItems.length > 1 && (
                            <button type="button" onClick={() => setEditItems(items => items.filter((_, idx) => idx !== i))}
                              className="p-1 rounded hover:bg-destructive/20 hover:text-destructive text-muted-foreground transition-colors">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 pl-1">
                        <div className="flex items-center gap-2">
                          <Switch checked={item.showMarkup} onCheckedChange={v => updateEditItem(i, "showMarkup", v)} />
                          <span className="text-xs text-muted-foreground">Markup</span>
                        </div>
                        {item.showMarkup && (
                          <div className="flex items-center gap-1">
                            <Input className="bg-background border-border h-7 w-16 text-xs" type="number"
                              value={item.markupPercent} onChange={e => updateEditItem(i, "markupPercent", e.target.value)} />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                        )}
                        <Select value={item.category} onValueChange={v => updateEditItem(i, "category", v)}>
                          <SelectTrigger className="bg-background border-border h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="labor">Labor</SelectItem>
                            <SelectItem value="material">Material</SelectItem>
                            <SelectItem value="subcontractor">Sub</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {/* Source / Vendor Link */}
                      <div className="flex items-center gap-2 pl-1 mt-1">
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <Input
                          type="url"
                          placeholder="Source / vendor URL (optional)"
                          className="bg-background border-border h-7 text-xs flex-1"
                          value={item.productUrl || ""}
                          onChange={e => updateEditItem(i, "productUrl", e.target.value)}
                        />
                        {item.productUrl && (
                          <a
                            href={item.productUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 p-1 rounded hover:bg-accent transition-colors"
                            title="Open source link"
                          >
                            <ExternalLink className="h-3.5 w-3.5" style={{ color: GOLD }} />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* AI Proposal Builder — Edit Mode */}
            <AIProposalBuilder
              proposalTitle={editTitle}
              existingItems={editItems.map(item => ({
                task: item.task,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                category: item.category,
              }))}
              onApplySuggestions={(suggestions: AILineItem[]) => {
                setEditItems(prev => [
                  ...prev.filter(it => it.task || it.unitPrice),
                  ...suggestions.map(s => ({
                    task: s.task,
                    description: s.description,
                    quantity: s.quantity,
                    unitPrice: s.unitPrice,
                    showMarkup: false,
                    markupPercent: "0",
                    category: s.category,
                  })),
                ]);
              }}
            />

            <Separator />

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Notes &amp; Terms</Label>
              <Textarea className="bg-background border-border min-h-[100px] text-sm" value={editNotes}
                onChange={e => setEditNotes(e.target.value)} placeholder="Payment terms, warranty info, scope exclusions…" />
            </div>

            {/* Edit Totals Summary */}
            <div className="rounded-xl border border-border/60 p-4 space-y-2" style={{ background: `${GOLD}08` }}>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{fmt(editSubtotal)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-border pt-2">
                <span>Total</span>
                <span style={{ color: GOLD }}>{fmt(editSubtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Deposit ({editDeposit}%)</span>
                <span>{fmt(editDepositAmt)}</span>
              </div>
            </div>
          </div>
        ) : (
          /* ── VIEW MODE ── */
          <div className="p-6 space-y-5">
            {/* Status + meta */}
            <div className="flex items-center gap-3 flex-wrap">
              <StatusBadge status={proposal.status} />
              {proposal.estimateNumber && (
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full border"
                  style={{ color: GOLD, borderColor: `${GOLD}50`, background: `${GOLD}12` }}>
                  {proposal.estimateNumber}
                </span>
              )}
              <span className="text-xs text-muted-foreground">Created {format(new Date(proposal.createdAt), "MMM d, yyyy")}</span>
              {proposal.sentAt && <span className="text-xs text-muted-foreground">Sent {format(new Date(proposal.sentAt), "MMM d, yyyy")}</span>}
              {proposal.approvedAt && (
                <span className="text-xs flex items-center gap-1" style={{ color: GREEN }}>
                  <CheckCircle2 className="h-3 w-3" /> Approved {format(new Date(proposal.approvedAt), "MMM d, yyyy")}
                </span>
              )}
            </div>

            {/* Title */}
            <div>
              <h2 className="text-xl font-serif" style={{ color: "var(--kp-cream)" }}>{proposal.title}</h2>
              {proposal.validUntil && (
                <p className="text-xs text-muted-foreground mt-1">Valid until {format(new Date(proposal.validUntil), "MMM d, yyyy")}</p>
              )}
            </div>

            {/* Client info */}
            {pClient && (
              <div className="rounded-xl border p-4" style={{ background: `${GOLD}08`, borderColor: `${GOLD}30` }}>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Client</p>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{ background: `${GOLD}25`, color: GOLD }}>
                    {pClient.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-semibold text-foreground">{pClient.name}</span>
                </div>
                <div className="grid grid-cols-1 gap-1 text-xs text-muted-foreground">
                  {pClient.email && <span className="flex items-center gap-1.5"><Mail className="h-3 w-3" style={{ color: GOLD }} />{pClient.email}</span>}
                  {pClient.phone && <span className="flex items-center gap-1.5"><Phone className="h-3 w-3" style={{ color: GOLD }} />{pClient.phone}</span>}
                  {pClient.address && <span className="flex items-center gap-1.5"><MapPin className="h-3 w-3" style={{ color: GOLD }} />{pClient.address}</span>}
                </div>
              </div>
            )}

            {/* Quick-view panels: Inspiration + Field Captures */}
            {pClient && (
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5 font-medium"
                  style={{ borderColor: `${GOLD}60`, color: GOLD }}
                  onClick={() => onOpenInspiration?.((proposal as any).leadId ?? undefined)}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  View Inspiration
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5 font-medium"
                  style={{ borderColor: `${GOLD}60`, color: GOLD }}
                  onClick={() => onOpenFieldCapture?.((proposal as any).leadId ?? undefined)}
                >
                  <Camera className="h-3.5 w-3.5" />
                  View Field Captures
                </Button>
              </div>
            )}

            <Separator />

            {/* Line Items */}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Line Items</p>
              <div className="space-y-1">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 rounded-t-lg text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70"
                  style={{ background: "var(--kp-charcoal-light)" }}>
                  <div className="col-span-4">Task</div>
                  <div className="col-span-3">Description</div>
                  <div className="col-span-1 text-center">Qty</div>
                  <div className="col-span-2 text-right">Unit</div>
                  <div className="col-span-2 text-right">Total</div>
                </div>
                {/* Hidden file input for line item photo upload */}
                <input
                  ref={lineItemUploadRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => pendingLineItemId !== null && handleLineItemPhotoUpload(e, pendingLineItemId)}
                />
                {(proposal.lineItems ?? []).map((li: any, i: number) => {
                  const base = parseFloat(String(li.unitCost ?? "0")) * parseFloat(String(li.quantity ?? "1"));
                  const markup = li.showMarkup ? base * (parseFloat(String(li.markupPercent ?? "0")) / 100) : 0;
                  const lineTotal = base + markup;
                  const liPhotos = (lineItemAttachments as any[]).filter((a: any) => a.lineItemId === li.id);
                  return (
                    <div key={i} className="border-b border-border/40">
                      <div className="grid grid-cols-12 gap-2 px-3 py-2.5 text-sm">
                        <div className="col-span-4 font-medium text-foreground">{li.task || "—"}</div>
                        <div className="col-span-3 text-muted-foreground text-xs">{li.description || "—"}</div>
                        <div className="col-span-1 text-center text-muted-foreground">{parseFloat(String(li.quantity ?? "1"))}</div>
                        <div className="col-span-2 text-right text-muted-foreground">
                          {fmt(parseFloat(String(li.unitCost ?? "0")))}
                          {li.showMarkup && <span className="text-xs ml-1 opacity-60">+{parseFloat(String(li.markupPercent ?? "0"))}%</span>}
                        </div>
                        <div className="col-span-2 text-right font-medium flex items-center justify-end gap-1">
                          <span style={{ color: lineTotal > 0 ? GOLD : undefined }}>{fmt(lineTotal)}</span>
                          {li.id && (
                            <button
                              title="Attach photo to this line item"
                              className="ml-1 p-0.5 rounded opacity-40 hover:opacity-100 transition-opacity"
                              onClick={() => { setPendingLineItemId(li.id); lineItemUploadRef.current?.click(); }}
                            >
                              {isLineItemUploading && pendingLineItemId === li.id
                                ? <Loader2 className="h-3 w-3 animate-spin" style={{ color: GOLD }} />
                                : <Camera className="h-3 w-3" style={{ color: GOLD }} />}
                            </button>
                          )}
                        </div>
                      </div>
                      {/* Per-line-item photos */}
                      {liPhotos.length > 0 && (
                        <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                          {liPhotos.map((att: any) => (
                            <div key={att.id} className="relative group" style={{ width: 52, height: 52 }}>
                              <a href={att.fileUrl} target="_blank" rel="noreferrer"
                                className="block rounded overflow-hidden border border-border/40 w-full h-full">
                                <img src={att.fileUrl} alt={att.fileName ?? "Photo"}
                                  className="w-full h-full object-cover" />
                              </a>
                              <div className="absolute inset-0 flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity rounded bg-black/50">
                                <button
                                  title={att.clientVisible ? "Hide from client" : "Show to client"}
                                  className="p-0.5 rounded text-white/80 hover:text-white"
                                  onClick={() => toggleLineItemPhotoVisible.mutate({ id: att.id, clientVisible: !att.clientVisible })}
                                >
                                  <Eye className="h-3 w-3" style={{ color: att.clientVisible ? GOLD : undefined }} />
                                </button>
                                <button
                                  title="Remove"
                                  className="p-0.5 rounded text-white/80 hover:text-red-400"
                                  onClick={() => removeLineItemPhoto.mutate({ id: att.id })}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                              {!att.clientVisible && (
                                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[8px] text-center text-white/70 py-0.5">hidden</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Source / Vendor Link (read-only view) */}
                      {li.productUrl && (
                        <div className="px-3 pb-2">
                          <a
                            href={li.productUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs hover:underline"
                            style={{ color: GOLD }}
                          >
                            <ExternalLink className="h-3 w-3" />
                            {li.productSource ? `View on ${li.productSource}` : "View source"}
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Totals */}
            <div className="rounded-xl border border-border/60 p-4 space-y-2" style={{ background: `${GOLD}08` }}>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{fmt(parseFloat(String(proposal.subtotal ?? "0")))}</span>
              </div>
              {parseFloat(String(proposal.taxRate ?? "0")) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax ({parseFloat(String(proposal.taxRate ?? "0"))}%)</span>
                  <span className="font-medium">{fmt(parseFloat(String(proposal.taxAmount ?? "0")))}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t border-border pt-2 text-base">
                <span>Total</span>
                <span style={{ color: GOLD }}>{fmt(parseFloat(String(proposal.total ?? "0")))}</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Deposit Required ({parseFloat(String(proposal.depositPercent ?? "50"))}%)</span>
                <span className="font-semibold text-foreground">{fmt(parseFloat(String(proposal.depositAmount ?? "0")))}</span>
              </div>
            </div>

            {/* Internal Costing — owner only */}
            <InternalCostingPanel
              estimateId={proposal.id}
              lineItems={proposal.lineItems ?? []}
              totalSellPrice={parseFloat(String(proposal.total ?? "0"))}
              onRefresh={() => utils.estimates.get.invalidate({ id: proposal.id })}
            />
            {/* Notes */}
            {proposal.notes && (
              <div className="p-3 rounded-lg border-l-2 text-sm text-muted-foreground"
                style={{ borderColor: GOLD, background: `${GOLD}08` }}>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Notes &amp; Terms</p>
                <p className="whitespace-pre-wrap">{proposal.notes}</p>
              </div>
            )}
            {/* Media Attachments */}
            <div className="rounded-xl border border-border/60 p-4"
              style={{ background: `${GOLD}05` }}>
              <ProposalMediaPanel
                estimateId={proposal.id}
                clientId={(proposal as any).clientId ?? undefined}
                leadId={(proposal as any).leadId ?? undefined}
              />
            </div>
          </div>
        )}

        {/* ─── Version History Panel ─── */}
        {showVersionHistory && proposal && (
          <VersionHistoryPanel
            estimateId={proposal.id}
            onRestore={() => {
              setShowVersionHistory(false);
              utils.estimates.getById.invalidate({ id: proposal.id });
            }}
          />
        )}
      </SheetContent>

      {/* ─── Send Proposal Email Preview Modal ─── */}
      <Dialog open={showSendPreview} onOpenChange={v => !v && setShowSendPreview(false)}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl flex items-center gap-2">
              <Mail className="h-5 w-5" style={{ color: GOLD }} />
              Send Proposal Email Preview
            </DialogTitle>
            <p className="text-sm text-muted-foreground">This is exactly what the client will receive when you click "Resend" or send the proposal.</p>
          </DialogHeader>

          {proposal && (
            <div className="space-y-4">
              {/* Email meta */}
              <div className="rounded-lg border border-border/60 p-3 space-y-2 text-sm" style={{ background: "var(--kp-charcoal-light)" }}>
                <div className="flex gap-3">
                  <span className="text-muted-foreground w-14 shrink-0">To:</span>
                  <span className="font-medium">{pClient?.email ?? "(no email on file)"}</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-muted-foreground w-14 shrink-0">Subject:</span>
                  <span className="font-medium">Your Proposal from Kitchens Plus Upstate — {proposal.title}</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-muted-foreground w-14 shrink-0">Attach:</span>
                  <span className="font-medium text-muted-foreground">Proposal PDF ({proposal.estimateNumber ?? "KP-XXXX-XXX"})</span>
                </div>
              </div>

              {/* Email body preview */}
              <div className="rounded-xl border border-border overflow-hidden">
                {/* Header */}
                <div className="p-5" style={{ background: "#2E2F2A" }}>
                  <h2 className="text-xl font-serif" style={{ color: GOLD }}>Kitchens Plus Upstate</h2>
                  <p className="text-xs tracking-widest uppercase mt-0.5" style={{ color: "#F5EDE7", opacity: 0.7 }}>Renovations &amp; Design</p>
                </div>
                {/* Body */}
                <div className="p-6 space-y-4 bg-background">
                  <div>
                    <p className="text-sm text-muted-foreground">Dear {pClient?.name ?? "there"},</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Thank you for the opportunity to work with you. Please find your proposal from <strong className="text-foreground">Kitchens Plus Upstate</strong> below.
                    </p>
                  </div>

                  {/* Proposal card */}
                  <div className="rounded-lg p-4 space-y-2" style={{ background: `${GOLD}10`, border: `1px solid ${GOLD}30` }}>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Proposal</p>
                    <p className="font-semibold text-foreground text-lg">{proposal.title}</p>
                    <p className="text-xs text-muted-foreground">Reference: {proposal.estimateNumber ?? "KP-XXXX-XXX"}</p>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mt-2">Total Investment</p>
                    <p className="text-2xl font-bold" style={{ color: GOLD }}>
                      ${parseFloat(String(proposal.total ?? "0")).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </p>
                  </div>

                  {proposal.notes && (
                    <p className="text-sm text-muted-foreground" style={{ borderLeft: `3px solid ${GOLD}`, paddingLeft: "12px" }}>
                      {proposal.notes}
                    </p>
                  )}

                  {/* CTA button */}
                  <div className="flex justify-center py-2">
                    <div className="px-6 py-3 rounded-full text-sm font-semibold text-center"
                      style={{ background: GOLD, color: "#fff" }}>
                      View &amp; Respond to Your Proposal
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    In your portal you can <strong className="text-foreground">approve the proposal as-is</strong> or open a <strong className="text-foreground">discussion</strong> to request changes. A PDF copy is attached to this email for your records.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    You can also reply directly to this email or text us back at <strong className="text-foreground">+1 (833) 518-4811</strong> — all messages go to our full team. If you'd prefer to speak directly with Chad, call <strong className="text-foreground">(864) 567 8777</strong>.
                  </p>

                  {/* Footer */}
                  <div className="pt-3 border-t border-border/40 text-xs text-muted-foreground space-y-1">
                    <p>Kitchens Plus Upstate · Upstate South Carolina</p>
                    <p><a href="https://kitchensplusupstate.com" className="underline" style={{ color: GOLD }}>kitchensplusupstate.com</a></p>
                  </div>
                </div>
                {/* Footer band */}
                <div className="p-4 text-center" style={{ background: "#2E2F2A" }}>
                  <p className="text-xs" style={{ color: "#888" }}>© {new Date().getFullYear()} Kitchens Plus Upstate. All rights reserved.</p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              const text = `Dear ${pClient?.name ?? "there"},\n\nThank you for the opportunity to work with you. Please find your proposal from Kitchens Plus Upstate below.\n\nProposal: ${proposal?.title}\nReference: ${proposal?.estimateNumber ?? "KP-XXXX-XXX"}\nTotal Investment: $${parseFloat(String(proposal?.total ?? "0")).toLocaleString("en-US", { minimumFractionDigits: 2 })}\n\nView & Respond to Your Proposal:\n[Portal link sent via email]\n\nYou can approve the proposal as-is or open a discussion to request changes. A PDF copy is attached to this email for your records.\n\nQuestions? Call Chad at +1 (833) 518-4811.\n\nKitchens Plus Upstate\nkitchensplusupstate.com`;
              navigator.clipboard.writeText(text).then(() => toast.success("Email text copied to clipboard!"));
            }}>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy Email Text
            </Button>
            <Button variant="outline" onClick={() => setShowSendPreview(false)}>Close Preview</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Approval Email Preview Modal ─── */}
      <Dialog open={showApprovalPreview} onOpenChange={v => !v && setShowApprovalPreview(false)}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl flex items-center gap-2">
              <Mail className="h-5 w-5" style={{ color: GOLD }} />
              Approval Email Preview
            </DialogTitle>
            <p className="text-sm text-muted-foreground">This is exactly what the client will receive when they approve the proposal or you click "Contractor Approval".</p>
          </DialogHeader>

          {proposal && (
            <div className="space-y-4">
              {/* Email meta */}
              <div className="rounded-lg border border-border/60 p-3 space-y-2 text-sm" style={{ background: "var(--kp-charcoal-light)" }}>
                <div className="flex gap-3">
                  <span className="text-muted-foreground w-14 shrink-0">To:</span>
                  <span className="font-medium">{pClient?.email ?? "(no email on file)"}</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-muted-foreground w-14 shrink-0">Subject:</span>
                  <span className="font-medium">Your Project is Approved — {proposal.title}</span>
                </div>
                {pClient?.phone && (
                  <div className="flex gap-3">
                    <span className="text-muted-foreground w-14 shrink-0">SMS:</span>
                    <span className="font-medium">{pClient.phone}</span>
                  </div>
                )}
              </div>

              {/* Email body preview */}
              <div className="rounded-xl border border-border overflow-hidden">
                {/* Header */}
                <div className="p-5" style={{ background: "#2E2F2A" }}>
                  <h2 className="text-xl font-serif" style={{ color: GOLD }}>Kitchens Plus Upstate</h2>
                  <p className="text-xs tracking-widest uppercase mt-0.5" style={{ color: "#F5EDE7", opacity: 0.7 }}>Renovations &amp; Design</p>
                </div>
                {/* Body */}
                <div className="p-6 space-y-4 bg-background">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-1">Great News — Your Project is Approved!</h3>
                    <p className="text-sm text-muted-foreground">Hi {pClient?.name ?? "there"},</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      We're excited to confirm that your project proposal has been approved and we're ready to move forward.
                    </p>
                  </div>

                  {/* Proposal summary box */}
                  <div className="rounded-lg p-4 space-y-2" style={{ background: `${GOLD}10`, border: `1px solid ${GOLD}30` }}>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Project Summary</p>
                    <p className="font-semibold text-foreground">{proposal.title}</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Investment</span>
                      <span className="font-semibold" style={{ color: GOLD }}>
                        ${parseFloat(String(proposal.total ?? "0")).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Deposit Required ({parseFloat(String(proposal.depositPercent ?? "50"))}%)</span>
                      <span className="font-semibold text-foreground">
                        ${(parseFloat(String(proposal.total ?? "0")) * parseFloat(String(proposal.depositPercent ?? "50")) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    You can view your project details, track progress, and communicate with us through your client portal.
                  </p>

                  {/* CTA button preview */}
                  <div className="flex justify-center py-2">
                    <div className="px-6 py-3 rounded-lg text-sm font-semibold text-center"
                      style={{ background: GOLD, color: "#1A1B17" }}>
                      View Your Project Portal
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="pt-3 border-t border-border/40 text-xs text-muted-foreground space-y-1">
                    <p>Kitchens Plus Upstate — Renovations &amp; Design</p>
                    <p>chad@kitchensplusupstate.com | +1 (833) 518-4811</p>
                  </div>
                </div>
              </div>

              {/* SMS preview */}
              {pClient?.phone && (
                <div className="rounded-lg border border-border/60 p-4" style={{ background: "var(--kp-charcoal-light)" }}>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">SMS Preview</p>
                  <p className="text-sm text-foreground">
                    Great news, {pClient.name}! Your project "{proposal.title}" has been approved by Kitchens Plus Upstate. We'll be in touch shortly with next steps. View your portal: [portal link]
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              const depositAmt = (parseFloat(String(proposal?.total ?? "0")) * parseFloat(String(proposal?.depositPercent ?? "50")) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });
              const text = `Great News — Your Project is Approved!\n\nHi ${pClient?.name ?? "there"},\n\nWe're excited to confirm that your project proposal has been approved and we're ready to move forward.\n\nProject: ${proposal?.title}\nTotal Investment: $${parseFloat(String(proposal?.total ?? "0")).toLocaleString("en-US", { minimumFractionDigits: 2 })}\nDeposit Required (${parseFloat(String(proposal?.depositPercent ?? "50"))}%): $${depositAmt}\n\nYou can view your project details, track progress, and communicate with us through your client portal.\n\nKitchens Plus Upstate — Renovations & Design\nchad@kitchensplusupstate.com | +1 (833) 518-4811`;
              navigator.clipboard.writeText(text).then(() => toast.success("Email text copied to clipboard!"));
            }}>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy Email Text
            </Button>
            <Button variant="outline" onClick={() => setShowApprovalPreview(false)}>Close Preview</Button>
            <Button
              className="font-semibold"
              style={{ background: "#4CAF7D", color: "#fff", border: "none" }}
              disabled={contractorApprove.isPending}
              onClick={() => {
                setShowApprovalPreview(false);
                contractorApprove.mutate({ id: proposal!.id, origin: window.location.origin });
              }}>
              {contractorApprove.isPending
                ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
              Approve &amp; Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ─── Edit Mode Product Import Sidebar ─── */}
      <ProductImportSidebar
        open={showEditProductSidebar}
        onClose={() => setShowEditProductSidebar(false)}
        defaultSupplier={editProductSidebarDefault}
        portalContainer={sheetContentRef.current}
        onImport={(product) => {
          const newItem = {
            ...emptyLineItem(),
            task: product.title.substring(0, 80),
            description: product.description.substring(0, 120),
            unitPrice: product.price != null ? String(product.price) : "",
            category: "material",
            imageUrl: product.imageUrl,
            productUrl: product.sourceUrl,
            productSource: product.sourceName,
          };
          setEditItems(items => {
            const last = items[items.length - 1];
            if (!last?.task && !last?.unitPrice) {
              return [...items.slice(0, -1), newItem];
            }
            return [...items, newItem];
          });
          setShowEditProductSidebar(false);
        }}
      />
    </Sheet>
  );
}

// ─── Version History Panel ─────────────────────────────────────────────────────────────────────────────
function VersionHistoryPanel({ estimateId, onRestore }: { estimateId: number; onRestore: () => void }) {
  const { data: versions, isLoading } = trpc.estimates.listVersions.useQuery({ estimateId });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { data: expandedVersion } = trpc.estimates.getVersion.useQuery(
    { versionId: expandedId! },
    { enabled: !!expandedId }
  );
  const restoreMutation = trpc.estimates.restoreVersion.useMutation({
    onSuccess: () => {
      onRestore();
    },
  });

  const GOLD = "#C9A96E";

  function formatTrigger(trigger: string) {
    switch (trigger) {
      case "autosave": return "Auto-saved";
      case "send": return "Sent to client";
      case "restore": return "Restored";
      case "manual": return "Manual save";
      default: return trigger;
    }
  }

  return (
    <div className="border-t border-border/60 p-4 space-y-3" style={{ background: "var(--card)" }}>
      <div className="flex items-center justify-between">
        <h4 className="font-serif text-sm font-semibold flex items-center gap-2">
          <History className="h-4 w-4" style={{ color: GOLD }} />
          Version History
        </h4>
        <span className="text-xs text-muted-foreground">{versions?.length ?? 0} versions</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: GOLD }} />
        </div>
      ) : !versions?.length ? (
        <p className="text-xs text-muted-foreground py-2">No version history yet. Versions are created automatically when you save or send proposals.</p>
      ) : (
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {versions.map((v: any) => (
            <div key={v.id} className="rounded-lg border border-border/40 p-2.5 hover:border-border/80 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-semibold" style={{ color: GOLD }}>v{v.versionNumber}</span>
                  <span className="text-xs text-muted-foreground">{formatTrigger(v.trigger)}</span>
                  {v.label && <span className="text-xs text-muted-foreground/70">— {v.label}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(v.createdAt).toLocaleString()}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}>
                    {expandedId === v.id ? "Hide" : "Preview"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px] border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                    disabled={restoreMutation.isPending}
                    onClick={() => {
                      if (confirm(`Restore to version ${v.versionNumber}? Current changes will be saved as a new version first.`)) {
                        restoreMutation.mutate({ estimateId, versionId: v.id });
                      }
                    }}>
                    <RotateCcw className="h-3 w-3 mr-1" />
                    {restoreMutation.isPending ? "Restoring…" : "Restore"}
                  </Button>
                </div>
              </div>
              {expandedId === v.id && expandedVersion && (
                <div className="mt-2 pt-2 border-t border-border/30 space-y-1">
                  <p className="text-xs text-muted-foreground">
                    <strong>Title:</strong> {(expandedVersion.snapshot as any)?.header?.title ?? "N/A"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <strong>Total:</strong> ${parseFloat((expandedVersion.snapshot as any)?.header?.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <strong>Line Items:</strong> {(expandedVersion.snapshot as any)?.lineItems?.length ?? 0} items
                  </p>
                  {(expandedVersion.snapshot as any)?.lineItems?.slice(0, 5).map((li: any, i: number) => (
                    <div key={i} className="text-[10px] text-muted-foreground/70 pl-2">
                      • {li.task || "Untitled"} — {li.quantity} {li.unit} @ ${parseFloat(li.unitPrice || 0).toFixed(2)}
                    </div>
                  ))}
                  {((expandedVersion.snapshot as any)?.lineItems?.length ?? 0) > 5 && (
                    <div className="text-[10px] text-muted-foreground/50 pl-2">
                      … and {(expandedVersion.snapshot as any).lineItems.length - 5} more
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Proposals Page ────────────────────────────────────────────────────────────────────────
export default function Proposals() {
  const [showAdd, setShowAdd] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewProposalId, setPreviewProposalId] = useState<number | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailProposalId, setDetailProposalId] = useState<number | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [showNewClient, setShowNewClient] = useState(false);
  const [showProductSidebar, setShowProductSidebar] = useState(false);
  const newProposalDialogRef = useRef<HTMLDivElement>(null);
  const [productSidebarDefault, setProductSidebarDefault] = useState<string | undefined>(undefined);
  const [form, setForm] = useState(emptyForm());
  // proposalNumber is set after the proposal is created on the server
  const [createdProposalNumber, setCreatedProposalNumber] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<any[]>([emptyLineItem()]);
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [savingAsDraft, setSavingAsDraft] = useState(false);
  const [convertingProjectId, setConvertingProjectId] = useState<number | null>(null);
  const [newClientForm, setNewClientForm] = useState(emptyNewClient());
  const [newClientAddressVerified, setNewClientAddressVerified] = useState(false);
  // Locally store the just-created client so it shows immediately even before cache refresh
  const [pendingNewClient, setPendingNewClient] = useState<{ id: number; name: string; email?: string; phone?: string; address?: string } | null>(null);

  const utils = trpc.useUtils();

  // Capture URL params once on mount so we can act on them after data loads.
  const [pendingNewForLeadId] = useState(() => new URLSearchParams(window.location.search).get("newFor"));
  // Tracks whether the preview modal was opened via the "Send + Copy" button
  const [pendingSendWithCopy, setPendingSendWithCopy] = useState(false);
  const [inspirationDrawerLeadId, setInspirationDrawerLeadId] = useState<number | undefined>(undefined);
  const [fieldCaptureDrawerLeadId, setFieldCaptureDrawerLeadId] = useState<number | undefined>(undefined);

  // Auto-open proposal from ?highlight=ID (e.g. coming from a project's View Proposal button)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const highlightId = params.get("highlight");
    if (highlightId) {
      const id = parseInt(highlightId, 10);
      if (!isNaN(id)) {
        setDetailProposalId(id);
        setShowDetail(true);
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, []);

  const { data: proposals, refetch } = trpc.estimates.list.useQuery({});
  // Stabilize with useMemo to prevent new array reference every render (avoids React hook ordering issues)
  const proposalIds = useMemo(
    () => (proposals ?? []).map((p: any) => p.id as number),
    [proposals]
  );
  const { data: attachmentCounts } = trpc.proposalAttachments.countByEstimateIds.useQuery(
    { estimateIds: proposalIds },
    { enabled: proposalIds.length > 0 }
  );
  const { data: leadsFromDB } = trpc.leads.list.useQuery();
  const { data: projectTypes } = trpc.settings.getProjectTypes.useQuery();

  // Auto-open New Proposal dialog pre-filled for a specific lead (?newFor=LEAD_ID).
  // Wait until leadsFromDB is loaded so the Select dropdown shows the lead name.
  useEffect(() => {
    if (!pendingNewForLeadId || !leadsFromDB) return;
    setForm({ ...emptyForm(), clientId: pendingNewForLeadId });
    setLineItems([emptyLineItem()]);
    setPendingNewClient(null);
    setShowAdd(true);
    window.history.replaceState({}, "", window.location.pathname);
  }, [pendingNewForLeadId, leadsFromDB]);

  // Merge DB leads with any pending new lead so it appears immediately after creation
  const clients = (() => {
    if (!leadsFromDB) return pendingNewClient ? [pendingNewClient] : [];
    if (pendingNewClient && !leadsFromDB.find((c: any) => c.id === pendingNewClient.id)) {
      return [pendingNewClient, ...leadsFromDB];
    }
    return leadsFromDB ?? [];
  })();

  const createProposal = trpc.estimates.create.useMutation({
    onSuccess: (data) => {
      // Store the generated KP-YYYY-NNN number so it shows on the confirmation card
      if (data.estimateNumber) setCreatedProposalNumber(data.estimateNumber);
      if (savingAsDraft) {
        saveLineItemsAsDraft(data.id);
      } else {
        saveLineItemsAndPreview(data.id);
      }
    },
  });
  const addLineItem = trpc.estimates.addLineItem.useMutation();
  const deleteProposal = trpc.estimates.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Proposal deleted"); }
  });
  const convertProposalToProject = trpc.estimates.convertProposalToProject.useMutation({
    onSuccess: (data) => {
      setConvertingProjectId(null);
      // Immediately navigate to the new project page
      window.location.href = `/projects/${data.projectId}`;
    },
    onError: (err) => {
      setConvertingProjectId(null);
      toast.error("Failed to create project: " + err.message);
    },
  });
  const getAiNotes = trpc.estimates.getAiNotes.useMutation();
  const sendProposal = trpc.estimates.sendProposal.useMutation({
    onSuccess: (result) => {
      setIsSending(false);
      setShowPreview(false);
      refetch();
      if (result.emailSent) {
        toast.success("Proposal sent! Email and SMS delivered to client.");
      } else {
        toast.warning(`Proposal marked sent. Email issue: ${result.emailError ?? "unknown"}. ${result.smsSent ? "SMS sent." : ""}`);
      }
    },
    onError: (err) => {
      setIsSending(false);
      toast.error(`Send failed: ${err.message}`);
    },
  });

  const createClient = trpc.leads.create.useMutation({
    onSuccess: async (data) => {
      // 1. Build the full lead object locally so it appears in the dropdown immediately
      const newClient = {
        id: data.id,
        name: newClientForm.name,
        email: newClientForm.email || undefined,
        phone: newClientForm.phone || undefined,
        address: newClientForm.address || undefined,
      };
      setPendingNewClient(newClient);

      // 2. Auto-select the new lead in the proposal form
      setForm(f => ({ ...f, clientId: String(data.id) }));

      // 3. Invalidate the leads cache so the Lead/Client list also refreshes
      await utils.leads.list.invalidate();

      // 4. Close the new client dialog and reset its form
      setShowNewClient(false);
      setNewClientForm(emptyNewClient());
      setNewClientAddressVerified(false);

      toast.success(`"${newClient.name}" added and selected for this proposal.`);
    },
    onError: (err) => {
      toast.error(`Failed to add client: ${err.message}`);
    },
  });

  // The currently selected client — prefer pendingNewClient if IDs match (freshest data)
  const selectedClient = (() => {
    if (!form.clientId) return null;
    const id = parseInt(form.clientId);
    if (pendingNewClient && pendingNewClient.id === id) return pendingNewClient;
    return clients.find(c => c.id === id) ?? null;
  })();

  const subtotal = lineItems.reduce((sum, item) => {
    const base = parseFloat(item.unitPrice || "0") * parseFloat(item.quantity || "1");
    const markup = item.showMarkup ? base * (parseFloat(item.markupPercent || "0") / 100) : 0;
    return sum + base + markup;
  }, 0);
  const deposit = subtotal * (parseFloat(form.depositPercent || "50") / 100);

  const addItem = () => setLineItems(items => [...items, emptyLineItem()]);
  const removeItem = (i: number) => setLineItems(items => items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, value: any) =>
    setLineItems(items => items.map((item, idx) => idx === i ? { ...item, [field]: value } : item));

  async function handleTaskBlur(i: number, taskName: string) {
    if (!taskName.trim()) return;
    const item = lineItems[i];
    if (item.unitPrice && item.unitPrice !== "" && item.unitPrice !== "0") return;
    try {
      const hist = await utils.estimates.getHistoricalPricing.fetch({ taskName });
      if (hist && parseFloat(hist.avgUnitPrice) > 0) {
        updateItem(i, "unitPrice", hist.avgUnitPrice);
        toast.info(`Price pre-filled from ${hist.matchCount} past job${hist.matchCount !== 1 ? "s" : ""}: $${hist.avgUnitPrice} avg`, { duration: 3000 });
      }
    } catch { /* silently skip */ }
  }

  function handleProductImport(product: ImportedProduct) {
    const newItem = {
      ...emptyLineItem(),
      task: product.title.substring(0, 80),
      description: product.description.substring(0, 120),
      unitPrice: product.price != null ? String(product.price) : "",
      category: "material",
      imageUrl: product.imageUrl,
      productUrl: product.sourceUrl,
      productSource: product.sourceName,
    };
    setLineItems(items => {
      // Replace the last empty item if it's blank, otherwise append
      const last = items[items.length - 1];
      if (!last.task && !last.unitPrice) {
        return [...items.slice(0, -1), newItem];
      }
      return [...items, newItem];
    });
  }

  async function handleGenerateNotes() {
    if (!form.title.trim()) { toast.error("Enter a title first so the AI has context"); return; }
    setIsGeneratingNotes(true);
    try {
      const result = await getAiNotes.mutateAsync({
        clientId: form.clientId ? parseInt(form.clientId) : undefined,
        projectType: projectTypes?.find(pt => pt.name === form.title)?.name,
        title: form.title,
      });
      if (result.suggestion) {
        setForm(f => ({ ...f, notes: result.suggestion }));
        toast.success("AI notes generated — edit as needed");
      }
    } catch {
      toast.error("AI notes generation failed");
    } finally {
      setIsGeneratingNotes(false);
    }
  }

  async function saveLineItemsAndPreview(proposalId: number) {
    try {
      for (let i = 0; i < lineItems.length; i++) {
        const item = lineItems[i];
        await addLineItem.mutateAsync({
          estimateId: proposalId,
          task: item.task || undefined,
          description: item.description || undefined,
          category: item.category,
          quantity: item.quantity,
          unitCost: item.unitPrice || "0",
          markupPercent: item.showMarkup ? item.markupPercent : "0",
          showMarkup: item.showMarkup,
          sortOrder: i,
          imageUrl: item.imageUrl || undefined,
          productUrl: item.productUrl || undefined,
          productSource: item.productSource || undefined,
        });
      }
      setPreviewProposalId(proposalId);
      setShowAdd(false);
      setShowPreview(true);
    } catch (err: any) {
      toast.error("Failed to save line items: " + err.message);
    }
  }

  function handleCreateAndPreview() {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    if (!form.clientId) { toast.error("Please select or add a client first"); return; }
    const parsedClientId = parseInt(form.clientId, 10);
    if (isNaN(parsedClientId) || parsedClientId <= 0) {
      toast.error("Invalid client — please re-select the client and try again");
      return;
    }
    createProposal.mutate({
      leadId: parsedClientId,
      title: form.title,
      notes: form.notes || undefined,
      depositPercent: form.depositPercent,
      validUntil: form.validDays
        ? new Date(Date.now() + parseInt(form.validDays) * 86400000).toISOString()
        : undefined,
    });
  }

  async function saveLineItemsAsDraft(proposalId: number) {
    try {
      for (let i = 0; i < lineItems.length; i++) {
        const item = lineItems[i];
        await addLineItem.mutateAsync({
          estimateId: proposalId,
          task: item.task || undefined,
          description: item.description || undefined,
          category: item.category,
          quantity: item.quantity,
          unitCost: item.unitPrice || "0",
          markupPercent: item.showMarkup ? item.markupPercent : "0",
          showMarkup: item.showMarkup,
          sortOrder: i,
          imageUrl: item.imageUrl || undefined,
          productUrl: item.productUrl || undefined,
          productSource: item.productSource || undefined,
        });
      }
      await refetch();
      setShowAdd(false);
      setSavingAsDraft(false);
      toast.success("Draft saved! Open the proposal anytime to continue editing or send.");
    } catch (err: any) {
      setSavingAsDraft(false);
      toast.error("Failed to save draft: " + err.message);
    }
  }

  function handleSaveDraft() {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    if (!form.clientId) { toast.error("Please select or add a client first"); return; }
    const parsedClientId = parseInt(form.clientId, 10);
    if (isNaN(parsedClientId) || parsedClientId <= 0) {
      toast.error("Invalid client — please re-select the client and try again");
      return;
    }
    setSavingAsDraft(true);
    createProposal.mutate({
      leadId: parsedClientId,
      title: form.title,
      notes: form.notes || undefined,
      depositPercent: form.depositPercent,
      validUntil: form.validDays
        ? new Date(Date.now() + parseInt(form.validDays) * 86400000).toISOString()
        : undefined,
    });
  }

  function handleConfirmSend(attachmentIds: number[] = []) {
    if (!previewProposalId) return;
    setIsSending(true);
    sendProposal.mutate({ id: previewProposalId, origin: window.location.origin, attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined });
  }

  function handleConfirmSendWithCopy(attachmentIds: number[] = []) {
    if (!previewProposalId) return;
    setIsSending(true);
    sendProposal.mutate({ id: previewProposalId, origin: window.location.origin, ccOwner: true, attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined });
  }

  // Also reset the pendingSendWithCopy flag when the preview modal closes
  function handlePreviewClose() {
    setShowPreview(false);
    setPendingSendWithCopy(false);
    refetch();
  }

  async function handleResend(id: number) {
    setIsResending(true);
    try {
      await sendProposal.mutateAsync({ id, origin: window.location.origin });
      setShowDetail(false);
    } catch (err: any) {
      toast.error("Resend failed: " + err.message);
    } finally {
      setIsResending(false);
    }
  }

  async function handleResendWithCopy(id: number) {
    setIsResending(true);
    try {
      await sendProposal.mutateAsync({ id, origin: window.location.origin, ccOwner: true });
      setShowDetail(false);
      toast.success("Resent! A copy was also sent to chad@cpenterprisessc.com.");
    } catch (err: any) {
      toast.error("Resend failed: " + err.message);
    } finally {
      setIsResending(false);
    }
  }

  const previewProposal = proposals?.find(p => p.id === previewProposalId);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif" style={{ color: "var(--kp-cream)" }}>Proposals</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{(proposals ?? []).length} proposals</p>
        </div>
        <Button className="btn-gold" onClick={() => {
          setForm(emptyForm());
          setLineItems([emptyLineItem()]);
          setPendingNewClient(null);
          setShowAdd(true);
        }}>
          <Plus className="h-4 w-4 mr-1.5" /> New Proposal
        </Button>
      </div>

      {/* Proposals List */}
      <div className="grid gap-3">
        {(!proposals || proposals.length === 0) ? (
          <Card className="bg-card border-border">
            <CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="text-lg font-serif mb-1">No proposals yet</p>
              <p className="text-sm">Create your first proposal to send to a client</p>
            </CardContent>
          </Card>
        ) : (
          proposals.map(p => {
            const pClient = clients.find((c: any) => c.id === ((p as any).leadId ?? (p as any).clientId));
            return (
              <Card key={p.id}
                className="bg-card border-border hover:border-primary/30 transition-all cursor-pointer"
                onClick={() => { setDetailProposalId(p.id); setShowDetail(true); }}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                        <h3 className="font-semibold text-foreground">{p.title}</h3>
                        <StatusBadge status={p.status} />
                        {p.estimateNumber && (
                          <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full border"
                            style={{ color: GOLD, borderColor: `${GOLD}50`, background: `${GOLD}12` }}>
                            {p.estimateNumber}
                          </span>
                        )}
                        {(p as any).discussionAt && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
                            style={{ background: "#ef444420", color: "#ef4444", border: "1px solid #ef444440" }}>
                            <MessageSquare className="h-3 w-3" /> Client Response
                          </span>
                        )}
                        {attachmentCounts && (attachmentCounts[p.id] ?? 0) > 0 && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
                            style={{ background: "#3b82f620", color: "#60a5fa", border: "1px solid #3b82f640" }}>
                            <Image className="h-3 w-3" />
                            {attachmentCounts[p.id]} photo{attachmentCounts[p.id] === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        {pClient && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />{pClient.name}
                          </span>
                        )}
                        <span className="flex items-center gap-1 font-medium" style={{ color: GOLD }}>
                          <DollarSign className="h-3 w-3" />${Number(p.total ?? 0).toLocaleString()}
                        </span>
                        <span>Created {format(new Date(p.createdAt), "MMM d, yyyy")}</span>
                        {p.sentAt && <span>Sent {format(new Date(p.sentAt), "MMM d, yyyy")}</span>}
                        {p.approvedAt && (
                          <span className="flex items-center gap-1" style={{ color: GREEN }}>
                            <CheckCircle2 className="h-3 w-3" />Approved {format(new Date(p.approvedAt), "MMM d, yyyy")}
                          </span>
                        )}
                        {p.validUntil && <span>Valid until {format(new Date(p.validUntil), "MMM d, yyyy")}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0 flex-wrap" onClick={e => e.stopPropagation()}>
                      {p.status === "draft" && (
                        <>
                          <Button size="sm" className="h-8 text-xs btn-gold"
                            onClick={() => { setPreviewProposalId(p.id); setShowPreview(true); }}>
                            <Send className="h-3 w-3 mr-1" /> Send
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs border-amber-500/60 text-amber-400 hover:bg-amber-500/10"
                            title="Send to client + CC copy to chad@cpenterprisessc.com"
                            onClick={() => { setPreviewProposalId(p.id); setPendingSendWithCopy(true); setShowPreview(true); }}>
                            <Send className="h-3 w-3 mr-1" /> Send + Copy
                          </Button>
                        </>
                      )}
                      {/* Create Project button — visible on every proposal */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs border-border/60"
                        disabled={convertingProjectId === p.id || convertProposalToProject.isPending}
                        onClick={() => {
                          if (!confirm(`Create a project from "${p.title}"?\n\nThis will:\n• Create a new project (or add to existing) for this client\n• Convert each line item into an In-House Work task\n\nContinue?`)) return;
                          setConvertingProjectId(p.id);
                          convertProposalToProject.mutate({ estimateId: p.id });
                        }}>
                        {convertingProjectId === p.id
                          ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          : <FolderOpen className="h-3 w-3 mr-1" />}
                        {convertingProjectId === p.id ? "Creating…" : "Create Project"}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/20 hover:text-destructive"
                        onClick={() => { if (confirm("Delete this proposal?")) deleteProposal.mutate({ id: p.id }); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* ─── New Proposal Dialog ─── */}
      <Dialog open={showAdd} onOpenChange={v => setShowAdd(v)}>
        <DialogContent ref={newProposalDialogRef} className="bg-card border-border w-[98vw] max-w-7xl max-h-[92vh] overflow-y-auto !sm:max-w-7xl" style={{maxWidth:'min(98vw,1280px)'}}>
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">New Proposal</DialogTitle>
          </DialogHeader>

          <div className="py-2">

            {/* ── Step 1: Client Selection ── */}
            <div className="rounded-xl border border-border/60 p-4 space-y-3" style={{ background: "var(--kp-charcoal-light)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: GOLD, color: "#1A1B17" }}>1</div>
                  <span className="text-sm font-semibold text-foreground">Select Client</span>
                </div>
                <button
                  type="button"
                  className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors font-medium"
                  style={{ background: `${GOLD}15`, color: GOLD, border: `1px solid ${GOLD}30` }}
                  onClick={() => setShowNewClient(true)}>
                  <UserPlus className="h-3.5 w-3.5" /> New Client
                </button>
              </div>

              <Select
                value={form.clientId}
                onValueChange={v => {
                  setForm(f => ({ ...f, clientId: v }));
                  // Clear pending new client if user selects a different one
                  if (pendingNewClient && String(pendingNewClient.id) !== v) {
                    setPendingNewClient(null);
                  }
                }}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Choose an existing client…" />
                </SelectTrigger>
                <SelectContent>
                  {clients.length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No clients yet — click "New Client" above</div>
                  )}
                  {clients.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      <span className="font-medium">{c.name}</span>
                      {c.email ? <span className="text-muted-foreground ml-2 text-xs">{c.email}</span> : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Client Confirmation Card — shows as soon as a client is selected */}
              {selectedClient && <ClientCard client={selectedClient} proposalNumber={createdProposalNumber ?? undefined} />}

              {!form.clientId && (
                <p className="text-xs text-muted-foreground text-center py-1">
                  Select an existing client above or click <strong style={{ color: GOLD }}>New Client</strong> to add one now.
                </p>
              )}
            </div>


            {/* ── Steps 2-4: Two-column layout once client is selected ── */}
            {form.clientId && (
              <div className="grid gap-4 items-start mt-4" style={{gridTemplateColumns:"1fr 2fr"}}>
              {/* LEFT: Proposal Details + Notes */}
              <div className="space-y-4">
                {/* Title & Settings */}
                <div className="rounded-xl border border-border/60 p-4 space-y-4" style={{ background: "var(--kp-charcoal-light)" }}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: GOLD, color: "#1A1B17" }}>2</div>
                    <span className="text-sm font-semibold text-foreground">Proposal Details</span>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Proposal Title *</Label>
                    <Input className="bg-background border-border text-base h-11" value={form.title}
                      onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="Kitchen Remodel — Smith Residence" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Notes / Scope Summary</Label>
                      <Textarea className="bg-background border-border resize-none text-sm" rows={3}
                        value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="Brief scope summary visible on the proposal…" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Valid (days)</Label>
                      <Input className="bg-background border-border" type="number" value={form.validDays}
                        onChange={e => setForm(f => ({ ...f, validDays: e.target.value }))} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Deposit %</Label>
                      <Input className="bg-background border-border" type="number" value={form.depositPercent}
                        onChange={e => setForm(f => ({ ...f, depositPercent: e.target.value }))} />
                    </div>
                    <div className="flex items-end pb-1">
                      <p className="text-sm text-muted-foreground">
                        Deposit: <span className="font-semibold" style={{ color: GOLD }}>${deposit.toFixed(2)}</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Notes with AI — belongs in left column */}
                <div className="rounded-xl border border-border/60 p-4" style={{ background: "var(--kp-charcoal-light)" }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: GOLD, color: "#1A1B17" }}>4</div>
                      <span className="text-sm font-semibold text-foreground">Notes &amp; Terms</span>
                    </div>
                    <button type="button" className="text-xs flex items-center gap-1 transition-colors" style={{ color: GOLD }}
                      onClick={handleGenerateNotes} disabled={isGeneratingNotes}>
                      {isGeneratingNotes
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Sparkles className="h-3 w-3" />}
                      {isGeneratingNotes ? "Generating…" : "AI Suggest Notes"}
                    </button>
                  </div>
                  <Textarea className="bg-background border-border resize-none" rows={4}
                    value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Payment terms, scope notes, timeline, etc. — or click AI Suggest to auto-fill from past proposals." />
                </div>
              </div>{/* end LEFT column */}

              {/* RIGHT: Line Items + AI Builder */}
              <div className="space-y-4">
                {/* Line Items */}
                <div className="rounded-xl border border-border/60 p-4 space-y-3" style={{ background: "var(--kp-charcoal-light)" }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: GOLD, color: "#1A1B17" }}>3</div>
                      <span className="text-sm font-semibold text-foreground">Line Items</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                        style={{ background: "#F96302", borderColor: "#F96302", color: "#fff" }}
                        onClick={() => { setProductSidebarDefault("The Home Depot"); setShowProductSidebar(true); }}>
                        <ShoppingCart className="h-3 w-3" /> Home Depot
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs border-border/60 gap-1"
                        style={{ borderColor: `${GOLD}60`, color: GOLD }}
                        onClick={() => { setProductSidebarDefault(undefined); setShowProductSidebar(true); }}>
                        <ShoppingCart className="h-3 w-3" /> Other Supplier
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs border-border/60" onClick={addItem}>
                        <Plus className="h-3 w-3 mr-1" /> Add Item
                      </Button>
                    </div>
                  </div>

                  {/* Column Headers */}
                  <div className="grid grid-cols-12 gap-2 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 border-b border-border/40">
                    <div className="col-span-4">Task / Description</div>
                    <div className="col-span-3">Details / Notes</div>
                    <div className="col-span-1 text-center">Qty</div>
                    <div className="col-span-2">Unit Price</div>
                    <div className="col-span-2">Total</div>
                  </div>

                  <div className="space-y-1.5">
                    {lineItems.map((item, i) => {
                      const base = parseFloat(item.unitPrice || "0") * parseFloat(item.quantity || "1");
                      const markup = item.showMarkup ? base * (parseFloat(item.markupPercent || "0") / 100) : 0;
                      const lineTotal = base + markup;
                      return (
                        <div key={i} className="border border-border/50 rounded-lg p-2.5 space-y-2 bg-background/50">
                          {/* Product image strip (if imported from supplier) */}
                          {item.imageUrl && (
                            <div className="flex items-center gap-3 pb-2 border-b border-border/30">
                              <img
                                src={item.imageUrl}
                                alt={item.task}
                                className="h-14 w-14 rounded object-contain bg-white shrink-0"
                                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-muted-foreground truncate">{item.productSource}</p>
                                {item.productUrl && (
                                  <a href={item.productUrl} target="_blank" rel="noreferrer"
                                    className="text-xs flex items-center gap-1 hover:underline"
                                    style={{ color: GOLD }}>
                                    <ExternalLink className="h-3 w-3" /> View on supplier site
                                  </a>
                                )}
                              </div>
                              <button type="button" title="Remove image"
                                className="p-1 rounded text-muted-foreground hover:text-destructive"
                                onClick={() => updateItem(i, "imageUrl", "")}>
                                <ImageOff className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                          <div className="grid grid-cols-12 gap-2 items-start">
                            <div className="col-span-4" style={{minWidth:0}}>
                              <Input className="bg-background border-border h-9 text-sm" placeholder="Task name or description"
                                value={item.task}
                                onChange={e => updateItem(i, "task", e.target.value)}
                                onBlur={e => handleTaskBlur(i, e.target.value)} />
                            </div>
                            <div className="col-span-3">
                              <Textarea className="bg-background border-border text-xs resize-none" rows={2} placeholder="Additional details, notes…"
                                value={item.description} onChange={e => updateItem(i, "description", e.target.value)} />
                            </div>
                            <div className="col-span-1">
                              <Input className="bg-background border-border h-9 text-sm text-center" type="number" placeholder="1"
                                value={item.quantity} onChange={e => updateItem(i, "quantity", e.target.value)} />
                            </div>
                            <div className="col-span-2">
                              <Input className="bg-background border-border h-9 text-sm" type="number" placeholder="0.00"
                                value={item.unitPrice} onChange={e => updateItem(i, "unitPrice", e.target.value)} />
                            </div>
                            <div className="col-span-2 flex items-center justify-between gap-1">
                              <span className="text-sm font-medium" style={{ color: lineTotal > 0 ? GOLD : undefined }}>
                                ${lineTotal.toFixed(2)}
                              </span>
                              {lineItems.length > 1 && (
                                <button type="button" onClick={() => setLineItems(items => items.filter((_, idx) => idx !== i))}
                                  className="p-1 rounded hover:bg-destructive/20 hover:text-destructive text-muted-foreground transition-colors">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          {/* Markup row */}
                          <div className="flex items-center gap-3 pl-1">
                            <div className="flex items-center gap-2">
                              <Switch checked={item.showMarkup} onCheckedChange={v => updateItem(i, "showMarkup", v)} />
                              <span className="text-xs text-muted-foreground">Show markup</span>
                            </div>
                            {item.showMarkup && (
                              <div className="flex items-center gap-1">
                                <Input className="bg-background border-border h-7 w-16 text-xs" type="number"
                                  value={item.markupPercent} onChange={e => updateItem(i, "markupPercent", e.target.value)} />
                                <span className="text-xs text-muted-foreground">%</span>
                              </div>
                            )}
                            <Select value={item.category} onValueChange={v => updateItem(i, "category", v)}>
                              <SelectTrigger className="bg-background border-border h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="labor">Labor</SelectItem>
                                <SelectItem value="material">Material</SelectItem>
                                <SelectItem value="subcontractor">Sub</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {/* Source / Vendor Link */}
                          <div className="flex items-center gap-2 pl-1 mt-1">
                            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <Input
                              type="url"
                              placeholder="Source / vendor URL (optional)"
                              className="bg-background border-border h-7 text-xs flex-1"
                              value={item.productUrl || ""}
                              onChange={e => updateItem(i, "productUrl", e.target.value)}
                            />
                            {item.productUrl && (
                              <a
                                href={item.productUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="shrink-0 p-1 rounded hover:bg-accent transition-colors"
                                title="Open source link"
                              >
                                <ExternalLink className="h-3.5 w-3.5" style={{ color: GOLD }} />
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Totals */}
                  <div className="flex justify-end mt-3">
                    <div className="text-right space-y-1">
                      <div className="flex gap-8 text-sm text-muted-foreground">
                        <span>Subtotal</span>
                        <span>${subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex gap-8 text-sm text-muted-foreground">
                        <span>Deposit ({form.depositPercent}%)</span>
                        <span>${deposit.toFixed(2)}</span>
                      </div>
                      <div className="flex gap-8 text-lg font-serif border-t border-border pt-2 mt-1" style={{ color: GOLD }}>
                        <span>Total</span>
                        <span>${subtotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI Proposal Builder — New Proposal Form */}
                <AIProposalBuilder
                  proposalTitle={form.title}
                  existingItems={lineItems.map(item => ({
                    task: item.task,
                    description: item.description,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    category: item.category,
                  }))}
                  onApplySuggestions={(suggestions: AILineItem[]) => {
                    setLineItems(prev => [
                      ...prev.filter(it => it.task || it.unitPrice),
                      ...suggestions.map(s => ({
                        task: s.task,
                        description: s.description,
                        quantity: s.quantity,
                        unitPrice: s.unitPrice,
                        showMarkup: false,
                        markupPercent: "0",
                        category: s.category,
                        imageUrl: "",
                        productUrl: "",
                        productSource: "",
                      })),
                    ]);
                  }}
                />

              </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button variant="outline" className="border-border/60"
              onClick={handleSaveDraft}
              disabled={!form.clientId || !form.title.trim() || createProposal.isPending || addLineItem.isPending}>
              {createProposal.isPending && savingAsDraft
                ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                : <FileText className="h-4 w-4 mr-1.5" />}
              Save Draft
            </Button>
            <Button className="btn-gold" onClick={handleCreateAndPreview}
              disabled={!form.clientId || createProposal.isPending || addLineItem.isPending}>
              {createProposal.isPending || addLineItem.isPending
                ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                : <Eye className="h-4 w-4 mr-1.5" />}
              Preview &amp; Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── New Client Quick-Add Dialog ─── */}
      <Dialog open={showNewClient} onOpenChange={setShowNewClient}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl flex items-center gap-2">
              <UserPlus className="h-5 w-5" style={{ color: GOLD }} />
              Add New Client
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              They'll be automatically selected for this proposal and added to your Lead/Client list.
            </p>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Full Name *</Label>
              <Input className="bg-background border-border" value={newClientForm.name}
                onChange={e => setNewClientForm(f => ({ ...f, name: e.target.value }))}
                placeholder="John & Jane Smith" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Email</Label>
                <Input className="bg-background border-border" type="email" value={newClientForm.email}
                  onChange={e => setNewClientForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="john@email.com" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Phone</Label>
                <Input className="bg-background border-border" type="tel" value={newClientForm.phone}
                  onChange={e => setNewClientForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="(864) 555-0000" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Address</Label>
              <AddressAutocomplete
                value={newClientForm.address}
                onChange={v => { setNewClientForm(f => ({ ...f, address: v })); setNewClientAddressVerified(false); }}
                onPlaceSelect={place => {
                  setNewClientForm(f => ({ ...f, address: place.formattedAddress }));
                  setNewClientAddressVerified(true);
                }}
                placeholder="123 Main St, Greenville, SC 29601"
              />
            </div>
          </div>

          {/* Preview of what will be shown */}
          {newClientForm.name && (
            <div className="px-1">
              <p className="text-xs text-muted-foreground mb-1.5">Preview — this is what will appear on the proposal:</p>
              <ClientCard client={{
                name: newClientForm.name,
                email: newClientForm.email || undefined,
                phone: newClientForm.phone || undefined,
                address: newClientForm.address || undefined,
              }} />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNewClient(false); setNewClientForm(emptyNewClient()); }}>
              Cancel
            </Button>
            <Button className="btn-gold" onClick={() => {
              if (!newClientForm.name.trim()) { toast.error("Name is required"); return; }
              createClient.mutate({
                name: newClientForm.name,
                email: newClientForm.email || undefined,
                phone: newClientForm.phone || undefined,
                address: newClientForm.address || undefined,
                source: "proposal",
              });
            }} disabled={createClient.isPending}>
              {createClient.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <UserPlus className="h-4 w-4 mr-1.5" />}
              Add Client &amp; Select
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Proposal Detail Sheet ─── */}
      <ProposalDetailSheet
        proposalId={detailProposalId}
        open={showDetail}
        onClose={() => { setShowDetail(false); setDetailProposalId(null); refetch(); }}
        clients={clients}
        onResend={handleResend}
        onResendWithCopy={handleResendWithCopy}
        onOpenInspiration={(leadId) => setInspirationDrawerLeadId(leadId)}
        onOpenFieldCapture={(leadId) => setFieldCaptureDrawerLeadId(leadId)}
      />

      {/* ─── PDF Preview Modal ─── */}
      <PdfPreviewModal
        open={showPreview}
        onClose={handlePreviewClose}
        onConfirmSend={pendingSendWithCopy ? handleConfirmSendWithCopy : handleConfirmSend}
        onConfirmSendWithCopy={handleConfirmSendWithCopy}
        proposal={{ ...form, title: previewProposal?.title ?? form.title }}
        lineItems={lineItems}
        client={selectedClient ?? clients.find((c: any) => c.id === ((previewProposal as any)?.leadId ?? (previewProposal as any)?.clientId))}
        isSending={isSending}
      />

      {/* ─── Product Import Sidebar ─── */}
      <ProductImportSidebar
        open={showProductSidebar}
        onClose={() => setShowProductSidebar(false)}
        defaultSupplier={productSidebarDefault}
        portalContainer={newProposalDialogRef.current}
        onImport={(product) => {
          handleProductImport(product);
          setShowProductSidebar(false);
        }}
      />

      {/* Inspiration Drawer — side panel for design ideas */}
      <InspirationDrawer
        open={!!inspirationDrawerLeadId}
        onClose={() => setInspirationDrawerLeadId(undefined)}
        leadId={inspirationDrawerLeadId}
      />

      {/* Field Capture Drawer — side panel for field photos/notes */}
      <FieldCaptureDrawer
        open={!!fieldCaptureDrawerLeadId}
        onClose={() => setFieldCaptureDrawerLeadId(undefined)}
        leadId={fieldCaptureDrawerLeadId}
      />
    </div>
  );
}
