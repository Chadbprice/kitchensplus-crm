import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, DollarSign, CheckCircle, Trash2, FileText, Receipt, Send, Percent, ChevronDown, ChevronRight, Edit2, RotateCcw, XCircle, PlusCircle, Paperclip, Image, X, ExternalLink, Clock, Upload, Download, File, Loader2, Check, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { useInvoiceAutosave, type InvoiceAutosaveStatus } from "@/hooks/useInvoiceAutosave";

const GOLD = "#BF9A3B";
const GREEN = "#4CAF7D";
const BILLING_TYPES = ["deposit", "progress", "final", "change_order", "other"];

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

// ── Save Status Indicator ────────────────────────────────────────────────────
function SaveStatusIndicator({ status, lastError }: { status: InvoiceAutosaveStatus; lastError: string | null }) {
  if (status === "idle") return null;
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {status === "saving" && (
        <>
          <Loader2 className="h-3 w-3 animate-spin" style={{ color: GOLD }} />
          <span className="text-muted-foreground">Saving…</span>
        </>
      )}
      {status === "saved" && (
        <>
          <Check className="h-3 w-3" style={{ color: GREEN }} />
          <span style={{ color: GREEN }}>Saved</span>
        </>
      )}
      {status === "error" && (
        <>
          <AlertCircle className="h-3 w-3 text-red-400" />
          <span className="text-red-400" title={lastError ?? undefined}>Error saving</span>
        </>
      )}
    </div>
  );
}

// ── InvoiceDocuments sub-component (dedicated invoice_documents table) ─────────────────────────────────────────────────────
function InvoiceDocuments({ invoiceId, leadId }: { invoiceId: number; leadId?: number }) {
  const utils = trpc.useUtils();
  const { data: docs, isLoading } = trpc.invoices.listDocuments.useQuery({ invoiceId });
  const uploadDoc = trpc.invoices.uploadDocument.useMutation({
    onSuccess: () => { utils.invoices.listDocuments.invalidate({ invoiceId }); toast.success("Document uploaded"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteDoc = trpc.invoices.deleteDocument.useMutation({
    onSuccess: () => { utils.invoices.listDocuments.invalidate({ invoiceId }); toast.success("Document removed"); },
    onError: (e) => toast.error(e.message),
  });
  const fileRef = useRef<HTMLInputElement>(null);

  function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    Array.from(files).forEach(file => {
      if (file.size > 25 * 1024 * 1024) { toast.error(`${file.name} exceeds 25 MB limit`); return; }
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = (e.target?.result as string).replace(/^data:[^;]+;base64,/, "");
        uploadDoc.mutate({ invoiceId, leadId, filename: file.name, mimeType: file.type || "application/octet-stream", fileSize: file.size, fileDataBase64: base64 });
      };
      reader.readAsDataURL(file);
    });
  }

  function fmtSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="mt-3 pt-3 border-t border-border/40">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Documents & Drawings {docs && docs.length > 0 ? `(${docs.length})` : ""}</p>
        <Button size="sm" variant="outline" className="text-xs h-7" style={{ borderColor: `${GOLD}40`, color: GOLD }}
          disabled={uploadDoc.isPending}
          onClick={() => fileRef.current?.click()}>
          <Upload className="h-3 w-3 mr-1" />
          {uploadDoc.isPending ? "Uploading…" : "Upload Documents / Drawings"}
        </Button>
        <input ref={fileRef} type="file" multiple className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.heic,.svg,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.dwg"
          onChange={e => { handleUpload(e.target.files); e.target.value = ""; }} />
      </div>
      {isLoading && <p className="text-xs text-muted-foreground py-1">Loading…</p>}
      {!isLoading && (!docs || docs.length === 0) && (
        <p className="text-xs text-muted-foreground py-1 italic">No documents uploaded yet. Click "Upload Documents / Drawings" to attach files to this invoice.</p>
      )}
      {docs && docs.length > 0 && (
        <div className="space-y-1.5">
          {docs.map((doc: any) => {
            const isImage = doc.mimeType?.startsWith("image/");
            return (
              <div key={doc.id} className="flex items-center gap-2 bg-background/50 rounded-lg px-3 py-2 group text-xs">
                {isImage ? <Image className="h-4 w-4 shrink-0 text-muted-foreground" /> : <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <div className="flex-1 min-w-0">
                  <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                    className="font-medium hover:underline truncate block" style={{ color: GOLD }}>{doc.filename}</a>
                  <span className="text-muted-foreground">{fmtSize(doc.fileSize)} · {format(new Date(doc.uploadedAt), "MMM d, yyyy h:mm a")}</span>
                </div>
                <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" download={doc.filename}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
                  title="Download">
                  <Download className="h-3.5 w-3.5 text-muted-foreground" />
                </a>
                <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive transition-opacity"
                  onClick={() => { if (confirm(`Remove ${doc.filename}?`)) deleteDoc.mutate({ id: doc.id }); }}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── InvoiceAttachments sub-component (legacy documents table) ─────────────────────────────────────────────────────
function InvoiceAttachments({ invoiceId, onDelete }: { invoiceId: number; onDelete: (docId: number) => void }) {
  const { data: attachments, isLoading } = trpc.invoices.getAttachments.useQuery({ invoiceId });
  if (isLoading) return <p className="text-xs text-muted-foreground mt-2 py-1">Loading attachments…</p>;
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="mt-3 pt-3 border-t border-border/40">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Attachments ({attachments.length})</p>
      <div className="grid grid-cols-2 gap-2">
        {attachments.map((doc: any) => {
          const isImage = doc.mimeType?.startsWith("image/");
          return (
            <div key={doc.id} className="flex items-center gap-2 bg-background/50 rounded-lg px-3 py-2 group text-xs">
              {isImage
                ? <Image className="h-4 w-4 shrink-0 text-muted-foreground" />
                : <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                className="flex-1 truncate hover:underline" style={{ color: GOLD }}>
                {doc.fileName}
              </a>
              <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive transition-opacity"
                onClick={() => { if (confirm(`Remove ${doc.fileName}?`)) onDelete(doc.id); }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function fmtMoney(val: number | string | null | undefined) {
  const n = Number(val ?? 0);
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "paid") {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
        style={{ background: `${GREEN}22`, color: GREEN, border: `1px solid ${GREEN}55` }}
      >
        <CheckCircle className="h-3 w-3" />
        Paid
      </span>
    );
  }
  const map: Record<string, { label: string; color: string }> = {
    draft:     { label: "Draft",     color: "#8A8B82" },
    sent:      { label: "Sent",      color: "#5B9BD5" },
    overdue:   { label: "Overdue",   color: "#E05252" },
    cancelled: { label: "Cancelled", color: "#E8A838" },
  };
  const s = map[status] ?? { label: status, color: GOLD };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: `${s.color}20`, color: s.color, border: `1px solid ${s.color}40` }}>
      {s.label}
    </span>
  );
}

const emptyForm = () => ({
  sourceKey: "",   // "proposal:ID" | "project:ID" | ""
  amount: "",
  percentage: "",  // optional % of proposal total
  billingType: "deposit",
  dueDate: todayStr(),
  notes: "",
  // resolved from sourceKey:
  proposalTotal: 0,
  leadId: undefined as number | undefined,
  projectId: undefined as number | undefined,
});

export default function Invoices() {
  const [showAdd, setShowAdd] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null); // null = new, number = editing existing
  const [form, setForm] = useState(emptyForm());
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [showRecordPay, setShowRecordPay] = useState<number | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", method: "check" as "square"|"check"|"cash"|"ach"|"other", note: "", checkNumber: "", paidDate: new Date().toISOString().slice(0, 10), sendReceipt: false, ccOperator: false });
  const [expandedPayId, setExpandedPayId] = useState<number | null>(null);
  const [editPayment, setEditPayment] = useState<{ id: number; amount: string; method: string; note: string } | null>(null);
  const [uploadingAttachId, setUploadingAttachId] = useState<number | null>(null);
  const attachFileRef = useRef<HTMLInputElement>(null);
  const [attachTargetInvoiceId, setAttachTargetInvoiceId] = useState<number | null>(null);

  // ── Autosave hook ────────────────────────────────────────────────────────
  const autosave = useInvoiceAutosave();

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: invoiceList, refetch } = trpc.invoices.list.useQuery({});
  const { data: projects } = trpc.projects.list.useQuery({});
  const { data: allProposals } = trpc.estimates.list.useQuery({});
  const approvedProposals = useMemo(
    () => (allProposals ?? []).filter((p: any) => p.approvedAt || p.status === "approved"),
    [allProposals]
  );

  // Billing summary: total already billed for the selected lead/project
  const { data: billedData } = trpc.invoices.getTotalBilled.useQuery(
    { leadId: form.leadId, projectId: form.projectId, excludeInvoiceId: editingInvoiceId ?? undefined },
    { enabled: !!(form.leadId || form.projectId) }
  );
  const totalBilledSoFar = billedData?.total ?? 0;

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createInvoice = trpc.invoices.create.useMutation({
    onSuccess: () => {
      refetch();
      closeInvoiceForm();
      toast.success("Invoice created!");
    },
    onError: (err) => toast.error(err.message ?? "Failed to create invoice"),
  });
  const markPaid = trpc.invoices.markPaid.useMutation({
    onSuccess: () => { refetch(); toast.success("Invoice marked as paid!"); },
    onError: (e) => toast.error(e.message),
  });
  const markUnpaid = trpc.invoices.markUnpaid.useMutation({
    onSuccess: () => { refetch(); toast.success("Invoice marked as unpaid — all payments cleared."); },
    onError: (e) => toast.error(e.message),
  });
  const addPaymentToInvoice = trpc.invoices.addPaymentToInvoice.useMutation({
    onSuccess: (data) => {
      refetch();
      setShowAddPayment(null);
      setAddPayForm({ amount: "", method: "check", note: "" });
      if (expandedPayId) utils.invoices.listPayments.invalidate({ invoiceId: expandedPayId });
      toast.success(data.fullyPaid ? "Invoice fully paid!" : `Payment added — balance: $${data.balance.toLocaleString()}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const recordPaymentMut = trpc.invoices.recordPayment.useMutation({
    onSuccess: (data) => {
      refetch();
      setShowRecordPay(null);
      setPayForm({ amount: "", method: "check", note: "", checkNumber: "", paidDate: new Date().toISOString().slice(0, 10), sendReceipt: false, ccOperator: false });
      if (expandedPayId) utils.invoices.listPayments.invalidate({ invoiceId: expandedPayId });
      toast.success(data.fullyPaid ? "Invoice fully paid!" : `Payment recorded — balance: $${data.balance.toLocaleString()}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const deletePaymentMut = trpc.invoices.deletePayment.useMutation({
    onSuccess: () => {
      refetch();
      if (expandedPayId) utils.invoices.listPayments.invalidate({ invoiceId: expandedPayId });
      toast.success("Payment removed");
    },
    onError: (e) => toast.error(e.message),
  });
  const [showAddPayment, setShowAddPayment] = useState<number | null>(null);
  const [addPayForm, setAddPayForm] = useState<{ amount: string; method: string; note: string }>({ amount: "", method: "check", note: "" });
  const utils = trpc.useUtils();
  const { data: expandedPayments } = trpc.invoices.listPayments.useQuery(
    { invoiceId: expandedPayId ?? 0 },
    { enabled: !!expandedPayId }
  );
  const uploadAttachment = trpc.invoices.uploadAttachment.useMutation({
    onSuccess: () => {
      utils.invoices.getAttachments.invalidate();
      setUploadingAttachId(null);
      toast.success("File attached to invoice!");
    },
    onError: (e) => { setUploadingAttachId(null); toast.error(e.message ?? "Upload failed"); },
  });
  const deleteAttachment = trpc.invoices.deleteAttachment.useMutation({
    onSuccess: () => { utils.invoices.getAttachments.invalidate(); toast.success("Attachment removed"); },
    onError: (e) => toast.error(e.message),
  });

  function handleAttachFiles(invoiceId: number, files: FileList | null) {
    if (!files || files.length === 0) return;
    const inv = (invoiceList ?? []).find(i => i.id === invoiceId);
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setUploadingAttachId(invoiceId);
        uploadAttachment.mutate({
          invoiceId,
          projectId: (inv as any)?.projectId ?? undefined,
          leadId: (inv as any)?.leadId ?? undefined,
          clientId: (inv as any)?.clientId ?? undefined,
          fileName: file.name,
          fileDataBase64: dataUrl,
          mimeType: file.type || "application/octet-stream",
          fileSize: file.size,
        });
      };
      reader.readAsDataURL(file);
    });
  }

  const deleteInvoice = trpc.invoices.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Invoice deleted"); },
  });
  const sendInvoice = trpc.invoices.send.useMutation({
    onSuccess: (data) => {
      refetch();
      setSendingId(null);
      if (data.squarePaymentUrl) {
        toast.success("Invoice sent! Square payment link created.");
      } else {
        toast.success("Invoice sent to client!");
      }
    },
    onError: (err) => {
      setSendingId(null);
      toast.error(err.message ?? "Failed to send invoice");
    },
  });

  // ── URL pre-selection (from Proposals "Invoice" button) ───────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const proposalId = params.get("proposalId");
    const amount = params.get("amount");
    if (proposalId) {
      const p = (allProposals ?? []).find((x: any) => String(x.id) === proposalId);
      setForm(f => ({
        ...f,
        sourceKey: `proposal:${proposalId}`,
        amount: amount ? String(Math.round(Number(amount) * 100) / 100) : f.amount,
        dueDate: todayStr(),
        proposalTotal: p?.total ? Number(p.total) : 0,
        leadId: p?.leadId ?? undefined,
        projectId: p?.projectId ?? undefined,
      }));
      setEditingInvoiceId(null);
      setShowAdd(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [allProposals]);

  // ── Derived: resolve projectId / leadId from sourceKey ───────────────────
  function resolveSource(sourceKey: string) {
    if (!sourceKey) return {};
    const [type, id] = sourceKey.split(":");
    if (type === "project") return { projectId: parseInt(id) };
    if (type === "proposal") {
      const p = (allProposals ?? []).find((x: any) => String(x.id) === id);
      return {
        projectId: p?.projectId ?? undefined,
        leadId: p?.leadId ?? undefined,
        clientId: p?.clientId ?? undefined,
      };
    }
    return {};
  }

  // ── Handle source selection ───────────────────────────────────────────────
  function handleSourceChange(v: string) {
    let amount = form.amount;
    let proposalTotal = 0;
    let leadId: number | undefined;
    let projectId: number | undefined;

    if (v.startsWith("proposal:")) {
      const id = v.split(":")[1];
      const p = (allProposals ?? []).find((x: any) => String(x.id) === id);
      if (p?.total) {
        amount = String(Math.round(Number(p.total) * 100) / 100);
        proposalTotal = Number(p.total);
      }
      leadId = p?.leadId ?? undefined;
      projectId = p?.projectId ?? undefined;
    } else if (v.startsWith("project:")) {
      projectId = parseInt(v.split(":")[1]);
    }

    setForm(f => ({ ...f, sourceKey: v, amount, proposalTotal, leadId, projectId, percentage: "" }));
  }

  // ── Handle percentage change ──────────────────────────────────────────────
  function handlePercentageChange(pct: string) {
    setForm(f => {
      const newPct = pct;
      let newAmount = f.amount;
      if (pct && f.proposalTotal > 0) {
        const computed = (Number(pct) / 100) * f.proposalTotal;
        newAmount = String(Math.round(computed * 100) / 100);
      }
      return { ...f, percentage: newPct, amount: newAmount };
    });
  }

  // ── Autosave trigger — called on every form change ────────────────────────
  const triggerAutosave = useCallback((updatedForm: ReturnType<typeof emptyForm>, invoiceId: number | null) => {
    // Only autosave if we have an ID (editing) or if we have enough data to create
    const effectiveId = invoiceId ?? autosave.createdId ?? undefined;
    const { projectId, leadId, clientId } = resolveSource(updatedForm.sourceKey);

    // Don't autosave if there's nothing meaningful yet
    if (!effectiveId && !updatedForm.amount && !updatedForm.notes) return;

    autosave.triggerSave({
      id: effectiveId ?? undefined,
      amount: updatedForm.amount || undefined,
      invoiceType: updatedForm.billingType as any,
      dueDate: updatedForm.dueDate || undefined,
      notes: updatedForm.notes || undefined,
      projectId: projectId ?? updatedForm.projectId,
      clientId,
      leadId: leadId ?? updatedForm.leadId,
    });
  }, [autosave]);

  // ── Form change handler with autosave ─────────────────────────────────────
  function updateForm(updater: (prev: ReturnType<typeof emptyForm>) => ReturnType<typeof emptyForm>) {
    setForm(prev => {
      const next = updater(prev);
      // Trigger autosave after state update
      setTimeout(() => triggerAutosave(next, editingInvoiceId), 0);
      return next;
    });
  }

  // ── Open Edit dialog for an existing invoice ──────────────────────────────
  function handleEditInvoice(inv: any) {
    // Determine source key from the invoice's linked proposal/project
    let sourceKey = "";
    if (inv.leadId) {
      const proposal = (allProposals ?? []).find((p: any) => p.leadId === inv.leadId);
      if (proposal) sourceKey = `proposal:${proposal.id}`;
    } else if (inv.projectId) {
      sourceKey = `project:${inv.projectId}`;
    }

    const proposalTotal = sourceKey.startsWith("proposal:")
      ? Number((allProposals ?? []).find((p: any) => String(p.id) === sourceKey.split(":")[1])?.total ?? 0)
      : 0;

    setEditingInvoiceId(inv.id);
    setForm({
      sourceKey,
      amount: String(inv.amount ?? ""),
      percentage: "",
      billingType: inv.invoiceType ?? "other",
      dueDate: inv.dueDate ? new Date(inv.dueDate).toISOString().split("T")[0] : todayStr(),
      notes: inv.notes ?? "",
      proposalTotal,
      leadId: inv.leadId ?? undefined,
      projectId: inv.projectId ?? undefined,
    });
    autosave.reset();
    setShowAdd(true);
  }

  // ── Close invoice form ────────────────────────────────────────────────────
  function closeInvoiceForm() {
    // Force save any pending changes before closing
    if (autosave.isDirty) {
      autosave.forceSave();
    }
    setShowAdd(false);
    setEditingInvoiceId(null);
    setForm(emptyForm());
    autosave.reset();
    // Refresh list to show any autosaved changes
    refetch();
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalPaid = (invoiceList ?? []).filter(i => i.status === "paid").reduce((s, i) => s + Number(i.amount ?? 0), 0);
  const totalPending = (invoiceList ?? []).filter(i => i.status !== "paid" && i.status !== "cancelled").reduce((s, i) => s + Number(i.amount ?? 0), 0);

  // ── Submit (manual create — fallback for new invoices) ────────────────────
  function handleCreate() {
    if (!form.amount) { toast.error("Amount is required"); return; }
    const { projectId, leadId, clientId } = resolveSource(form.sourceKey);

    // If autosave already created the invoice, just close
    if (autosave.createdId) {
      // Force save final state
      autosave.forceSave();
      setTimeout(() => {
        closeInvoiceForm();
        toast.success("Invoice saved!");
      }, 500);
      return;
    }

    createInvoice.mutate({
      projectId: projectId ?? 0,
      clientId,
      leadId,
      invoiceType: form.billingType as any,
      amount: form.amount,
      notes: form.notes || undefined,
      dueDate: form.dueDate || undefined,
    } as any);
  }

  // ── Save edits (manual save for editing) ──────────────────────────────────
  function handleSaveEdit() {
    autosave.forceSave();
    setTimeout(() => {
      closeInvoiceForm();
      toast.success("Invoice updated!");
    }, 500);
  }

  // Remaining after this invoice
  const remaining = form.proposalTotal > 0
    ? form.proposalTotal - totalBilledSoFar - Number(form.amount || 0)
    : null;

  const isEditing = editingInvoiceId !== null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif" style={{ color: "var(--kp-cream)" }}>Invoices</h1>
          <p className="text-sm text-muted-foreground mt-1">{(invoiceList ?? []).length} invoices</p>
        </div>
        <Button className="btn-gold text-sm px-4" onClick={() => { setForm(emptyForm()); setEditingInvoiceId(null); autosave.reset(); setShowAdd(true); }}>
          <Plus className="h-4 w-4 mr-1.5" /> New Invoice
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Total Collected</p>
            <p className="text-2xl font-serif" style={{ color: GREEN }}>${totalPaid.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Outstanding</p>
            <p className="text-2xl font-serif" style={{ color: GOLD }}>${totalPending.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Invoice list */}
      <div className="grid gap-3">
        {(!invoiceList || invoiceList.length === 0) ? (
          <Card className="bg-card border-border">
            <CardContent className="py-12 text-center text-muted-foreground">
              <DollarSign className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="text-lg font-serif mb-1">No invoices yet</p>
              <p className="text-sm">Create your first invoice to track payments</p>
            </CardContent>
          </Card>
        ) : (
          invoiceList.map(inv => (
            <Card key={inv.id} className="bg-card border-border hover:border-primary/30 transition-all">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <h3 className="font-semibold text-foreground">Invoice #{(inv as any).invoiceNumber ?? inv.id}</h3>
                      {(inv as any).proposalTitle && (
                        <span className="text-sm font-medium" style={{ color: GOLD }}>
                          {(inv as any).proposalTitle}
                        </span>
                      )}
                      {(inv as any).clientName && (
                        <span className="text-sm text-muted-foreground">
                          &mdash; {(inv as any).clientName}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <StatusBadge status={inv.status} />
                      {inv.invoiceType && (
                        <span className="text-xs text-muted-foreground capitalize">
                          {inv.invoiceType.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1 font-semibold" style={{ color: GOLD }}>
                        <DollarSign className="h-3 w-3" />{fmtMoney(inv.amount)}
                      </span>
                      <span>Created {format(new Date(inv.createdAt), "MMM d, yyyy")}</span>
                      {inv.dueDate && <span>Due {format(new Date(inv.dueDate), "MMM d, yyyy")}</span>}
                      {(inv as any).sentAt && <span style={{ color: "#5B9BD5" }}>Sent {format(new Date((inv as any).sentAt), "MMM d, yyyy")}</span>}
                      {inv.paidAt && <span style={{ color: GREEN }}>Paid {format(new Date(inv.paidAt), "MMM d, yyyy")}</span>}
                    </div>
                    {inv.notes && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">{inv.notes}</p>}
                    {(inv as any).squarePaymentUrl && (
                      <a href={(inv as any).squarePaymentUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs mt-1 inline-flex items-center gap-1 hover:underline"
                        style={{ color: GOLD }}>
                        <DollarSign className="h-3 w-3" /> Pay Now (Square)
                      </a>
                    )}
                    {/* Contract status badge for deposit invoices */}
                    {(inv as any).invoiceType === "deposit" && (inv as any).contractRequired && (
                      <div className="mt-1.5">
                        {(inv as any).contractSigned ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: "rgba(76,175,125,0.15)", color: "#4CAF7D" }}>
                            <CheckCircle className="h-3 w-3" />
                            Contract Signed{(inv as any).contractSignerName ? ` — ${(inv as any).contractSignerName}` : ""}
                            {(inv as any).contractSignedAt && (
                              <span className="opacity-70 ml-1">&middot; {format(new Date((inv as any).contractSignedAt), "MMM d")}</span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: "rgba(212,175,55,0.12)", color: "#D4AF37" }}>
                            <Clock className="h-3 w-3" />
                            Awaiting Signature
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0 flex-wrap justify-start sm:justify-end">
                    {/* ── EDIT BUTTON ── */}
                    {inv.status !== "cancelled" && (
                      <Button size="sm" variant="outline"
                        className="text-xs h-7"
                        style={{ borderColor: `${GOLD}60`, color: GOLD }}
                        onClick={() => handleEditInvoice(inv)}>
                        <Edit2 className="h-3 w-3 mr-1" /> Edit
                      </Button>
                    )}
                    {/* Send / Resend button */}
                    {inv.status !== "paid" && inv.status !== "cancelled" && (
                      <Button size="sm" variant="outline"
                        className="text-xs h-7 border-border/60"
                        style={{ borderColor: `${GOLD}60`, color: GOLD }}
                        disabled={sendingId === inv.id}
                        onClick={() => {
                          setSendingId(inv.id);
                          sendInvoice.mutate({ id: inv.id, origin: window.location.origin });
                        }}>
                        <Send className="h-3 w-3 mr-1" />
                        {sendingId === inv.id ? "Sending…" : inv.status === "sent" ? "Resend" : "Send"}
                      </Button>
                    )}
                    {/* Mark Paid (one-click) — unpaid invoices */}
                    {inv.status !== "paid" && inv.status !== "cancelled" && (
                      <Button size="sm" variant="outline" className="text-xs h-7"
                        style={{ borderColor: `${GREEN}60`, color: GREEN }}
                        disabled={markPaid.isPending}
                        onClick={() => {
                          if (confirm(`Mark invoice #${(inv as any).invoiceNumber ?? inv.id} as fully paid?`)) {
                            markPaid.mutate({ id: inv.id });
                          }
                        }}>
                        <CheckCircle className="h-3 w-3 mr-1" /> Mark Paid
                      </Button>
                    )}
                    {/* Record partial payment — unpaid invoices */}
                    {inv.status !== "paid" && inv.status !== "cancelled" && (
                      <Button size="sm" variant="outline" className="text-xs h-7"
                        style={{ borderColor: `${GOLD}60`, color: GOLD }}
                        onClick={() => {
                          const balance = Math.max(0, Number(inv.amount) - Number((inv as any).amountPaid ?? 0));
                          setShowRecordPay(inv.id);
                          setPayForm({ amount: String(balance), method: "check", note: "", checkNumber: "", paidDate: new Date().toISOString().slice(0, 10), sendReceipt: false, ccOperator: false });
                        }}>
                        <DollarSign className="h-3 w-3 mr-1" /> Record Payment
                      </Button>
                    )}
                    {/* Paid invoice controls: Add extra payment + Mark Unpaid */}
                    {inv.status === "paid" && (
                      <>
                        <Button size="sm" variant="outline" className="text-xs h-7"
                          style={{ borderColor: `${GOLD}60`, color: GOLD }}
                          onClick={() => {
                            setShowAddPayment(inv.id);
                            setAddPayForm({ amount: "", method: "check", note: "" });
                          }}>
                          <PlusCircle className="h-3 w-3 mr-1" /> Add Payment
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs h-7"
                          style={{ borderColor: "#E0525260", color: "#E05252" }}
                          disabled={markUnpaid.isPending}
                          onClick={() => {
                            if (confirm(`Mark invoice #${(inv as any).invoiceNumber ?? inv.id} as UNPAID? This will clear all recorded payments.`)) {
                              markUnpaid.mutate({ id: inv.id });
                            }
                          }}>
                          <XCircle className="h-3 w-3 mr-1" /> Mark Unpaid
                        </Button>
                      </>
                    )}
                    {/* Payment history toggle */}
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      title="Payment history"
                      onClick={() => setExpandedPayId(expandedPayId === inv.id ? null : inv.id)}>
                      {expandedPayId === inv.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/20 hover:text-destructive"
                      onClick={() => { if (confirm("Delete this invoice?")) deleteInvoice.mutate({ id: inv.id }); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Attachment button — always visible */}
                <div className="mt-2 flex items-center gap-2">
                  <input
                    ref={attachTargetInvoiceId === inv.id ? attachFileRef : undefined}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                    className="hidden"
                    onChange={(e) => { handleAttachFiles(inv.id, e.target.files); e.target.value = ""; }}
                  />
                  <Button size="sm" variant="outline" className="text-xs h-7"
                    style={{ borderColor: `${GOLD}40`, color: GOLD }}
                    disabled={uploadingAttachId === inv.id}
                    onClick={() => {
                      setAttachTargetInvoiceId(inv.id);
                      setTimeout(() => attachFileRef.current?.click(), 50);
                    }}>
                    <Paperclip className="h-3 w-3 mr-1" />
                    {uploadingAttachId === inv.id ? "Uploading…" : "Attach Files"}
                  </Button>
                </div>

                {/* Attachments list (shown when expanded) */}
                {expandedPayId === inv.id && <InvoiceAttachments invoiceId={inv.id} onDelete={(docId) => deleteAttachment.mutate({ documentId: docId })} />}

                {/* Invoice Documents & Drawings panel (always visible) */}
                <InvoiceDocuments invoiceId={inv.id} leadId={(inv as any).leadId ?? undefined} />

                {/* Payment history accordion */}
                {expandedPayId === inv.id && (
                  <div className="mt-3 pt-3 border-t border-border/40">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Payment History</p>
                      <div className="flex gap-3 text-xs">
                        <span style={{ color: GOLD }}>Total: {fmtMoney(inv.amount)}</span>
                        <span style={{ color: GREEN }}>Paid: {fmtMoney((inv as any).amountPaid ?? 0)}</span>
                        {inv.status !== "paid" && (
                          <span style={{ color: "#E8A838" }}>Balance: {fmtMoney(Math.max(0, Number(inv.amount) - Number((inv as any).amountPaid ?? 0)))}</span>
                        )}
                      </div>
                    </div>
                    {!expandedPayments || expandedPayments.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No payments recorded yet.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {expandedPayments.map((pmt: any) => (
                          <div key={pmt.id} className="flex items-center justify-between text-xs bg-background/50 rounded-lg px-3 py-2 group">
                            <div className="flex items-center gap-3">
                              <span className="font-semibold" style={{ color: GREEN }}>{fmtMoney(pmt.amount)}</span>
                              <span className="capitalize text-muted-foreground">{pmt.method}</span>
                              {pmt.squarePaymentId && <span className="text-muted-foreground text-[10px]">Square #{pmt.squarePaymentId.slice(0, 8)}</span>}
                              {pmt.note && <span className="text-muted-foreground truncate max-w-[140px]">{pmt.note}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">{format(new Date(pmt.paidAt), "MMM d, yyyy")}</span>
                              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive transition-opacity"
                                title="Undo / remove this payment"
                                onClick={() => { if (confirm(`Remove $${Number(pmt.amount).toLocaleString()} ${pmt.method} payment?`)) deletePaymentMut.mutate({ paymentId: pmt.id }); }}>
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* ── Add Payment to Paid Invoice Dialog ── */}
      <Dialog open={!!showAddPayment} onOpenChange={open => { if (!open) setShowAddPayment(null); }}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader><DialogTitle className="font-serif">Add Payment</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1 pb-1">Record an additional or corrected payment against this invoice.</p>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Amount ($) *</Label>
              <Input className="bg-background border-border" type="number" step="0.01" min="0"
                value={addPayForm.amount} onChange={e => setAddPayForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Payment Method</Label>
              <Select value={addPayForm.method} onValueChange={v => setAddPayForm(f => ({ ...f, method: v }))}>
                <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="square">Square / Card</SelectItem>
                  <SelectItem value="ach">ACH / Bank Transfer</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Note (optional)</Label>
              <Input className="bg-background border-border" value={addPayForm.note}
                onChange={e => setAddPayForm(f => ({ ...f, note: e.target.value }))} placeholder="Check #1234, etc." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddPayment(null)}>Cancel</Button>
            <Button className="btn-gold" disabled={addPaymentToInvoice.isPending || !addPayForm.amount}
              onClick={() => {
                if (!showAddPayment || !addPayForm.amount) return;
                addPaymentToInvoice.mutate({ invoiceId: showAddPayment, amount: parseFloat(addPayForm.amount), method: addPayForm.method as any, note: addPayForm.note || undefined });
              }}>
              {addPaymentToInvoice.isPending ? "Saving..." : "Add Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Record Payment Dialog ── */}
      <Dialog open={!!showRecordPay} onOpenChange={open => { if (!open) { setShowRecordPay(null); setPayForm({ amount: "", method: "check", note: "", checkNumber: "", paidDate: new Date().toISOString().slice(0, 10), sendReceipt: false, ccOperator: false }); } }}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader><DialogTitle className="font-serif">Record Payment</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Amount ($) *</Label>
              <Input className="bg-background border-border" type="number" step="0.01" min="0"
                value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Payment Method</Label>
                <Select value={payForm.method} onValueChange={v => setPayForm(f => ({ ...f, method: v as any }))}>
                  <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="check">Check</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="square">Square / Card</SelectItem>
                    <SelectItem value="ach">ACH / Bank Transfer</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Date Received</Label>
                <Input className="bg-background border-border" type="date" value={payForm.paidDate}
                  onChange={e => setPayForm(f => ({ ...f, paidDate: e.target.value }))} />
              </div>
            </div>
            {payForm.method === "check" && (
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Check Number</Label>
                <Input className="bg-background border-border" value={payForm.checkNumber}
                  onChange={e => setPayForm(f => ({ ...f, checkNumber: e.target.value }))} placeholder="e.g. 1042" />
              </div>
            )}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Note (optional)</Label>
              <Input className="bg-background border-border" value={payForm.note}
                onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))} placeholder="Internal note…" />
            </div>
            <div className="border border-border/50 rounded-lg p-3 space-y-2 bg-background/40">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium cursor-pointer" htmlFor="sendReceiptInv">Send receipt email to client</Label>
                <input id="sendReceiptInv" type="checkbox" className="h-4 w-4 accent-[#BF9A3B] cursor-pointer"
                  checked={payForm.sendReceipt} onChange={e => setPayForm(f => ({ ...f, sendReceipt: e.target.checked, ccOperator: e.target.checked ? f.ccOperator : false })) } />
              </div>
              {payForm.sendReceipt && (
                <div className="flex items-center justify-between pl-2 border-l-2 border-[#BF9A3B]/30">
                  <Label className="text-xs text-muted-foreground cursor-pointer" htmlFor="ccOperatorInv">CC me (chad@kitchensplusupstate.com)</Label>
                  <input id="ccOperatorInv" type="checkbox" className="h-4 w-4 accent-[#BF9A3B] cursor-pointer"
                    checked={payForm.ccOperator} onChange={e => setPayForm(f => ({ ...f, ccOperator: e.target.checked }))} />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRecordPay(null)}>Cancel</Button>
            <Button className="btn-gold" disabled={recordPaymentMut.isPending || !payForm.amount}
              onClick={() => {
                if (!showRecordPay || !payForm.amount) return;
                recordPaymentMut.mutate({
                  invoiceId: showRecordPay,
                  amount: parseFloat(payForm.amount),
                  method: payForm.method,
                  note: payForm.note || undefined,
                  checkNumber: payForm.checkNumber || undefined,
                  paidDate: payForm.paidDate || undefined,
                  sendReceipt: payForm.sendReceipt,
                  ccOperator: payForm.ccOperator,
                });
              }}>
              {recordPaymentMut.isPending ? "Saving..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New / Edit Invoice Dialog ── */}
      <Dialog open={showAdd} onOpenChange={v => { if (!v) closeInvoiceForm(); else setShowAdd(v); }}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="font-serif text-xl flex items-center gap-2">
                <Receipt className="h-5 w-5" style={{ color: GOLD }} />
                {isEditing ? "Edit Invoice" : "New Invoice"}
              </DialogTitle>
              <SaveStatusIndicator status={autosave.status} lastError={autosave.lastError} />
            </div>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Unified source selector — only for new invoices */}
            {!isEditing && (
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">
                  Approved Proposal or Project
                </Label>
                <Select value={form.sourceKey} onValueChange={handleSourceChange}>
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue placeholder="Select approved proposal or project…" />
                  </SelectTrigger>
                  <SelectContent>
                    {approvedProposals.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <FileText className="h-3 w-3" /> Approved Proposals
                        </SelectLabel>
                        {approvedProposals.map((p: any) => (
                          <SelectItem key={`proposal:${p.id}`} value={`proposal:${p.id}`}>
                            {p.estimateNumber ? `${p.estimateNumber} — ` : ""}{p.title ?? "Untitled Proposal"}
                            {p.total ? ` (${fmtMoney(p.total)})` : ""}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {(projects ?? []).length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Receipt className="h-3 w-3" /> Active Projects
                        </SelectLabel>
                        {(projects ?? []).map((p: any) => (
                          <SelectItem key={`project:${p.id}`} value={`project:${p.id}`}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {approvedProposals.length === 0 && (projects ?? []).length === 0 && (
                      <SelectItem value="__none__" disabled>No approved proposals or projects yet</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Selecting an approved proposal auto-fills the amount. You can still edit it below.
                </p>
              </div>
            )}

            {/* Source info for editing */}
            {isEditing && form.sourceKey && (
              <div className="rounded-lg border border-border/40 p-3 bg-background/30">
                <p className="text-xs text-muted-foreground">
                  Linked to: <span className="font-medium text-foreground">
                    {form.sourceKey.startsWith("proposal:")
                      ? (() => {
                          const p = (allProposals ?? []).find((x: any) => String(x.id) === form.sourceKey.split(":")[1]);
                          return p ? `${p.estimateNumber ? `${p.estimateNumber} — ` : ""}${p.title ?? "Proposal"}` : "Proposal";
                        })()
                      : (() => {
                          const p = (projects ?? []).find((x: any) => String(x.id) === form.sourceKey.split(":")[1]);
                          return p ? p.name : "Project";
                        })()
                    }
                  </span>
                </p>
              </div>
            )}

            {/* Billing Summary (shown when a proposal is selected) */}
            {form.proposalTotal > 0 && (
              <div className="rounded-lg border border-border/60 p-3 space-y-1.5 text-xs"
                style={{ background: "rgba(191,154,59,0.06)" }}>
                <p className="font-semibold text-muted-foreground uppercase tracking-widest text-[10px] mb-2">Billing Summary</p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Proposal Total</span>
                  <span className="font-semibold text-foreground">{fmtMoney(form.proposalTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Previously Billed</span>
                  <span className="text-foreground">{fmtMoney(totalBilledSoFar)}</span>
                </div>
                <div className="flex justify-between border-t border-border/40 pt-1.5 mt-1">
                  <span className="text-muted-foreground">This Invoice</span>
                  <span className="font-bold" style={{ color: GOLD }}>{fmtMoney(form.amount || 0)}</span>
                </div>
                {remaining !== null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Remaining After</span>
                    <span className={remaining < 0 ? "text-red-400" : "text-muted-foreground"}>
                      {fmtMoney(Math.max(0, remaining))}
                      {remaining < 0 ? " (over!)" : ""}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Amount + Percentage + Billing Type */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <Label className="text-xs text-muted-foreground mb-1.5 block">Amount ($) *</Label>
                <Input className="bg-background border-border" type="number" min="0" step="0.01"
                  value={form.amount}
                  onChange={e => updateForm(f => ({ ...f, amount: e.target.value, percentage: "" }))}
                  placeholder="25000" />
              </div>
              {form.proposalTotal > 0 && (
                <div className="col-span-1">
                  <Label className="text-xs text-muted-foreground mb-1.5 block flex items-center gap-1">
                    <Percent className="h-3 w-3" /> of Proposal
                  </Label>
                  <Input className="bg-background border-border" type="number" min="0" max="100" step="1"
                    value={form.percentage}
                    onChange={e => {
                      const pct = e.target.value;
                      setForm(f => {
                        let newAmount = f.amount;
                        if (pct && f.proposalTotal > 0) {
                          const computed = (Number(pct) / 100) * f.proposalTotal;
                          newAmount = String(Math.round(computed * 100) / 100);
                        }
                        const next = { ...f, percentage: pct, amount: newAmount };
                        setTimeout(() => triggerAutosave(next, editingInvoiceId), 0);
                        return next;
                      });
                    }}
                    placeholder="50" />
                </div>
              )}
              <div className={form.proposalTotal > 0 ? "col-span-1" : "col-span-2"}>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Billing Type</Label>
                <Select value={form.billingType} onValueChange={v => updateForm(f => ({ ...f, billingType: v }))}>
                  <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BILLING_TYPES.map(t => (
                      <SelectItem key={t} value={t}>
                        {t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.proposalTotal > 0 && (
              <p className="text-[10px] text-muted-foreground -mt-2">
                Enter a % to auto-calculate the amount from the proposal total, or type a dollar amount directly.
              </p>
            )}

            {/* Due Date */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Due Date</Label>
              <Input className="bg-background border-border" type="date"
                value={form.dueDate}
                onChange={e => updateForm(f => ({ ...f, dueDate: e.target.value }))} />
              <p className="text-[10px] text-muted-foreground mt-1">Defaults to today — change if needed.</p>
            </div>

            {/* Notes */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Notes (optional)</Label>
              <Textarea className="bg-background border-border resize-none text-sm" rows={2}
                value={form.notes}
                onChange={e => updateForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. 50% deposit per signed agreement" />
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <SaveStatusIndicator status={autosave.status} lastError={autosave.lastError} />
            <div className="flex gap-2">
              <Button variant="outline" onClick={closeInvoiceForm}>
                {autosave.isDirty ? "Save & Close" : "Close"}
              </Button>
              {isEditing ? (
                <Button className="btn-gold" onClick={handleSaveEdit}>
                  Save Changes
                </Button>
              ) : (
                <Button className="btn-gold" onClick={handleCreate} disabled={createInvoice.isPending}>
                  {createInvoice.isPending ? "Creating…" : autosave.createdId ? "Done" : "Create Invoice"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
