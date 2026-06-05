import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  FileText, CheckCircle, XCircle, DollarSign, Search,
  ExternalLink, Clock, Building2, Receipt, Loader2, Filter,
} from "lucide-react";
import { format } from "date-fns";

const GOLD = "#BF9A3B";
const GREEN = "#4CAF7D";

type InvoiceStatus = "submitted" | "approved" | "rejected" | "paid";

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; color: string; bg: string }> = {
  submitted: { label: "Pending Review", color: "#E8A838", bg: "#E8A83820" },
  approved:  { label: "Approved",       color: GREEN,     bg: `${GREEN}20` },
  rejected:  { label: "Rejected",       color: "#ef4444", bg: "#ef444420" },
  paid:      { label: "Paid",           color: "#5B9BD5", bg: "#5B9BD520" },
};

function fmt(n: number | string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n));
}

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.submitted;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}40` }}
    >
      {cfg.label}
    </span>
  );
}

interface ReviewDialogProps {
  invoice: any;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

function ReviewDialog({ invoice, open, onClose, onDone }: ReviewDialogProps) {
  const [reviewNotes, setReviewNotes] = useState("");
  const utils = trpc.useUtils();

  const reviewMutation = trpc.vms.vendorPortal.reviewInvoice.useMutation({
    onSuccess: () => {
      utils.vms.vendorPortal.listAllInvoices.invalidate();
      onDone();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleAction(action: "approved" | "rejected" | "paid") {
    reviewMutation.mutate({ invoiceId: invoice.id, action });
    toast.success(
      action === "approved" ? "Invoice approved" :
      action === "paid" ? "Invoice marked as paid" :
      "Invoice rejected"
    );
  }

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg flex items-center gap-2">
            <Receipt className="h-5 w-5" style={{ color: GOLD }} />
            Review Vendor Invoice
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Invoice summary */}
          <div className="rounded-xl border border-border/60 p-4 space-y-3"
            style={{ background: `${GOLD}06` }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground">{invoice.companyName}</p>
                {invoice.invoiceNumber && (
                  <p className="text-xs text-muted-foreground font-mono">#{invoice.invoiceNumber}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xl font-bold" style={{ color: GOLD }}>{fmt(invoice.amount)}</p>
                <StatusBadge status={invoice.status} />
              </div>
            </div>

            {invoice.submittedAt && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Submitted {format(new Date(invoice.submittedAt), "MMM d, yyyy 'at' h:mm a")}
              </p>
            )}

            {invoice.notes && (
              <div className="rounded-lg bg-background/60 border border-border/40 p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Vendor Notes</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{invoice.notes}</p>
              </div>
            )}

            {invoice.fileUrl && (
              <a
                href={invoice.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs hover:underline"
                style={{ color: GOLD }}
              >
                <FileText className="h-3.5 w-3.5" />
                View Invoice Document
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {/* Review notes */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Review Notes (optional)
            </Label>
            <Textarea
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              placeholder="Add notes for your records..."
              className="bg-background border-border text-sm resize-none"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {invoice.status !== "paid" && (
            <Button
              variant="outline"
              className="border-border text-muted-foreground hover:text-foreground"
              onClick={onClose}
              disabled={reviewMutation.isPending}
            >
              Cancel
            </Button>
          )}
          {invoice.status === "submitted" && (
            <>
              <Button
                variant="outline"
                className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                onClick={() => handleAction("rejected")}
                disabled={reviewMutation.isPending}
              >
                {reviewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4 mr-1" />}
                Reject
              </Button>
              <Button
                onClick={() => handleAction("approved")}
                disabled={reviewMutation.isPending}
                style={{ background: GREEN, color: "#fff" }}
              >
                {reviewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                Approve Invoice
              </Button>
            </>
          )}
          {invoice.status === "approved" && (
            <Button
              onClick={() => handleAction("paid")}
              disabled={reviewMutation.isPending}
              style={{ background: GOLD, color: "#1a1a1a" }}
            >
              {reviewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4 mr-1" />}
              Mark as Paid
            </Button>
          )}
          {(invoice.status === "rejected" || invoice.status === "paid") && (
            <Button variant="outline" onClick={onClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function VendorInvoiceReview() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);

  const { data: invoices, isLoading } = trpc.vms.vendorPortal.listAllInvoices.useQuery();

  const filtered = useMemo(() => {
    if (!invoices) return [];
    return invoices.filter((inv: any) => {
      const matchSearch =
        !search ||
        inv.companyName?.toLowerCase().includes(search.toLowerCase()) ||
        inv.invoiceNumber?.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || inv.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [invoices, search, statusFilter]);

  const pendingCount = invoices?.filter((i: any) => i.status === "submitted").length ?? 0;
  const totalApproved = invoices?.filter((i: any) => i.status === "approved" || i.status === "paid")
    .reduce((sum: number, i: any) => sum + Number(i.amount), 0) ?? 0;
  const totalPending = invoices?.filter((i: any) => i.status === "submitted")
    .reduce((sum: number, i: any) => sum + Number(i.amount), 0) ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif text-foreground">Vendor Invoice Review</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Review and approve invoices submitted by vendors through the portal
          </p>
        </div>
        {pendingCount > 0 && (
          <Badge
            className="text-sm px-3 py-1 font-semibold"
            style={{ background: `${GOLD}20`, color: GOLD, border: `1px solid ${GOLD}40` }}
          >
            {pendingCount} Pending Review
          </Badge>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-border/60" style={{ background: `${GOLD}06` }}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Pending Review</p>
            <p className="text-2xl font-bold" style={{ color: GOLD }}>{pendingCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{fmt(totalPending)} awaiting approval</p>
          </CardContent>
        </Card>
        <Card className="border-border/60" style={{ background: `${GREEN}06` }}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Approved / Paid</p>
            <p className="text-2xl font-bold" style={{ color: GREEN }}>
              {invoices?.filter((i: any) => i.status === "approved" || i.status === "paid").length ?? 0}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{fmt(totalApproved)} total value</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Invoices</p>
            <p className="text-2xl font-bold text-foreground">{invoices?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">All time submissions</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendor or invoice #..."
            className="pl-9 bg-background border-border"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {(["all", "submitted", "approved", "paid", "rejected"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={
                statusFilter === s
                  ? { background: GOLD, color: "#1a1a1a" }
                  : { background: "var(--kp-charcoal-light)", color: "var(--muted-foreground)" }
              }
            >
              {s === "all" ? "All" :
               s === "submitted" ? "Pending" :
               s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Invoice list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <Receipt className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <p className="text-muted-foreground">
            {invoices?.length === 0
              ? "No vendor invoices have been submitted yet."
              : "No invoices match your current filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((invoice: any) => (
            <div
              key={invoice.id}
              className="rounded-xl border border-border/60 p-4 hover:border-border transition-colors cursor-pointer"
              style={{ background: "var(--kp-charcoal-light)" }}
              onClick={() => setSelectedInvoice(invoice)}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div
                    className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: `${GOLD}20` }}
                  >
                    <Building2 className="h-4 w-4" style={{ color: GOLD }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground">{invoice.companyName}</p>
                      {invoice.invoiceNumber && (
                        <span className="text-xs font-mono text-muted-foreground">#{invoice.invoiceNumber}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {invoice.submittedAt
                        ? `Submitted ${format(new Date(invoice.submittedAt), "MMM d, yyyy")}`
                        : "Submission date unknown"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <p className="font-bold text-foreground">{fmt(invoice.amount)}</p>
                  </div>
                  <StatusBadge status={invoice.status} />
                  {invoice.status === "submitted" && (
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      style={{ background: GOLD, color: "#1a1a1a" }}
                      onClick={(e) => { e.stopPropagation(); setSelectedInvoice(invoice); }}
                    >
                      Review
                    </Button>
                  )}
                  {invoice.status === "approved" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs border-border/60"
                      style={{ color: GREEN }}
                      onClick={(e) => { e.stopPropagation(); setSelectedInvoice(invoice); }}
                    >
                      Mark Paid
                    </Button>
                  )}
                  {invoice.fileUrl && (
                    <a
                      href={invoice.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Review dialog */}
      {selectedInvoice && (
        <ReviewDialog
          invoice={selectedInvoice}
          open={!!selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onDone={() => setSelectedInvoice(null)}
        />
      )}
    </div>
  );
}
