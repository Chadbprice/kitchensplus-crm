import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useVendorPortal } from "@/components/VendorPortalLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus,
  FileText,
  DollarSign,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from "lucide-react";

const GOLD = "#BF9A3B";
const CREAM = "#F5F0E8";
const MUTED = "#9B9B8B";
const CHARCOAL = "#2A2B26";
const CHARCOAL_DARK = "#1E1F1A";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: "Pending Review", color: "#E67700", bg: "rgba(230,119,0,0.12)" },
  approved: { label: "Approved",       color: "#4CAF50", bg: "rgba(76,175,80,0.12)" },
  rejected: { label: "Rejected",       color: "#EF5350", bg: "rgba(239,83,80,0.12)" },
  paid:     { label: "Paid",           color: GOLD,      bg: "rgba(191,154,59,0.12)" },
};

export default function VendorInvoicesPage() {
  const { token, vendor } = useVendorPortal();
  const [showSubmit, setShowSubmit] = useState(false);
  const [form, setForm] = useState({
    poId: "",
    invoiceNumber: "",
    amount: "",
    notes: "",
  });

  const tokenInput = useMemo(() => ({ token }), [token]);
  const { data: invoices = [], refetch, isLoading } = trpc.vms.vendorPortal.listInvoices.useQuery(tokenInput);
  const { data: pos = [] } = trpc.vms.vendorPortal.listMyPOs.useQuery(tokenInput);

  const submitMutation = trpc.vms.vendorPortal.submitInvoice.useMutation({
    onSuccess: () => {
      toast.success("Invoice submitted successfully");
      refetch();
      setShowSubmit(false);
      setForm({ poId: "", invoiceNumber: "", amount: "", notes: "" });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = () => {
    if (!form.amount || parseFloat(form.amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    submitMutation.mutate({
      token,
      poId: form.poId ? parseInt(form.poId) : 0,
      invoiceNumber: form.invoiceNumber || undefined,
      amount: parseFloat(form.amount),
      notes: form.notes || undefined,
    });
  };

  return (
    <div className="flex flex-col h-full" style={{ background: CHARCOAL_DARK }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b"
        style={{ borderColor: "rgba(191,154,59,0.15)" }}>
        <div>
          <h1 className="text-xl font-semibold" style={{ color: CREAM }}>Invoices</h1>
          <p className="text-sm mt-0.5" style={{ color: MUTED }}>Submit and track your invoices</p>
        </div>
        <Button className="gap-2" onClick={() => setShowSubmit(true)}
          style={{ background: "linear-gradient(135deg, #BF9A3B 0%, #D4AF5A 100%)", color: "#1A1B17" }}>
          <Plus className="h-4 w-4" /> Submit Invoice
        </Button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-20">
            <FileText className="h-12 w-12 mx-auto mb-4" style={{ color: MUTED, opacity: 0.4 }} />
            <p className="text-base font-medium" style={{ color: CREAM }}>No invoices yet</p>
            <p className="text-sm mt-1 mb-4" style={{ color: MUTED }}>Submit your first invoice below</p>
            <Button onClick={() => setShowSubmit(true)}
              style={{ background: "linear-gradient(135deg, #BF9A3B 0%, #D4AF5A 100%)", color: "#1A1B17" }}>
              <Plus className="h-4 w-4 mr-2" /> Submit Invoice
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {invoices.map((inv) => {
              const cfg = STATUS_CONFIG[inv.status ?? "pending"] ?? STATUS_CONFIG.pending;
              return (
                <Card key={inv.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: "rgba(191,154,59,0.12)" }}>
                        <FileText className="h-5 w-5" style={{ color: GOLD }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-sm" style={{ color: CREAM }}>
                            {inv.invoiceNumber ? `Invoice #${inv.invoiceNumber}` : `Invoice #${inv.id}`}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ background: cfg.bg, color: cfg.color }}>
                            {cfg.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 flex-wrap">
                          <span className="flex items-center gap-1 text-sm font-semibold" style={{ color: GOLD }}>
                            <DollarSign className="h-3.5 w-3.5" />
                            {parseFloat(String(inv.amount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                          {inv.submittedAt && (
                            <span className="flex items-center gap-1 text-xs" style={{ color: MUTED }}>
                              <Clock className="h-3 w-3" />
                              Submitted {new Date(inv.submittedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {inv.notes && (
                          <p className="text-xs mt-1.5 line-clamp-2" style={{ color: MUTED }}>{inv.notes}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Submit Invoice Dialog */}
      <Dialog open={showSubmit} onOpenChange={setShowSubmit}>
        <DialogContent className="max-w-md" style={{ background: CHARCOAL, border: "1px solid rgba(191,154,59,0.2)" }}>
          <DialogHeader>
            <DialogTitle style={{ color: CREAM }}>Submit Invoice</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {pos.length > 0 && (
              <div>
                <Label style={{ color: MUTED }}>Purchase Order (optional)</Label>
                <Select value={form.poId} onValueChange={(v) => setForm({ ...form, poId: v })}>
                  <SelectTrigger className="mt-1"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: CREAM }}>
                    <SelectValue placeholder="Select PO (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">No PO</SelectItem>
                    {pos.map((po) => (
                      <SelectItem key={po.id} value={String(po.id)}>
                        {po.poNumber} — {po.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label style={{ color: MUTED }}>Invoice Number</Label>
              <Input
                value={form.invoiceNumber}
                onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                placeholder="e.g. INV-2026-001"
                className="mt-1"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: CREAM }}
              />
            </div>
            <div>
              <Label style={{ color: MUTED }}>Amount ($) *</Label>
              <div className="relative mt-1">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: MUTED }} />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                  className="pl-9"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: CREAM }}
                />
              </div>
            </div>
            <div>
              <Label style={{ color: MUTED }}>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Any notes about this invoice..."
                rows={3}
                className="mt-1 resize-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: CREAM }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubmit(false)}
              style={{ borderColor: "rgba(255,255,255,0.15)", color: MUTED }}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!form.amount || submitMutation.isPending}
              style={{ background: "linear-gradient(135deg, #BF9A3B 0%, #D4AF5A 100%)", color: "#1A1B17" }}
            >
              {submitMutation.isPending ? "Submitting..." : "Submit Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
