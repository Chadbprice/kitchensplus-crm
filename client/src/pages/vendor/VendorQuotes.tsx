import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useVendorPortal } from "@/components/VendorPortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FileText, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

const GOLD = "#BF9A3B";
const CREAM = "#F5F0E8";
const MUTED = "#9B9B8B";
const CHARCOAL = "#2A2B26";
const CHARCOAL_DARK = "#1E1F1A";

export default function VendorQuotes() {
  const { vendor } = useVendorPortal();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", amount: "", description: "", validUntil: "" });

  const vendorIdInput = useMemo(() => ({ vendorId: vendor.id }), [vendor.id]);
  const { data: quotes = [], refetch, isLoading } = trpc.vendors.getQuotes.useQuery(vendorIdInput);
  const submit = trpc.vendors.submitQuote.useMutation({
    onSuccess: () => {
      refetch();
      setShowAdd(false);
      setForm({ title: "", amount: "", description: "", validUntil: "" });
      toast.success("Quote submitted!");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="flex flex-col h-full" style={{ background: CHARCOAL_DARK }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b"
        style={{ borderColor: "rgba(191,154,59,0.15)" }}>
        <div>
          <h1 className="text-xl font-semibold" style={{ color: CREAM }}>Quote Requests</h1>
          <p className="text-sm mt-0.5" style={{ color: MUTED }}>Submit and track your quotes</p>
        </div>
        <Button className="gap-2" onClick={() => setShowAdd(true)}
          style={{ background: "linear-gradient(135deg, #BF9A3B 0%, #D4AF5A 100%)", color: "#1A1B17" }}>
          <Plus className="h-4 w-4" /> Submit Quote
        </Button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
          </div>
        ) : quotes.length === 0 ? (
          <div className="text-center py-20">
            <FileText className="h-12 w-12 mx-auto mb-4" style={{ color: MUTED, opacity: 0.4 }} />
            <p className="text-base font-medium" style={{ color: CREAM }}>No quotes yet</p>
            <p className="text-sm mt-1 mb-4" style={{ color: MUTED }}>Submit your first quote to get started</p>
            <Button onClick={() => setShowAdd(true)}
              style={{ background: "linear-gradient(135deg, #BF9A3B 0%, #D4AF5A 100%)", color: "#1A1B17" }}>
              <Plus className="h-4 w-4 mr-2" /> Submit Quote
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {quotes.map((q: any) => (
              <Card key={q.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm mb-0.5" style={{ color: CREAM }}>{q.title}</p>
                      {q.description && <p className="text-xs line-clamp-2" style={{ color: MUTED }}>{q.description}</p>}
                      <p className="text-base font-bold mt-2" style={{ color: GOLD }}>
                        ${Number(q.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize shrink-0"
                      style={{ background: "rgba(191,154,59,0.12)", color: GOLD }}>
                      {q.status ?? "pending"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Submit Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md" style={{ background: CHARCOAL, border: "1px solid rgba(191,154,59,0.2)" }}>
          <DialogHeader>
            <DialogTitle style={{ color: CREAM }}>Submit Quote</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label style={{ color: MUTED }}>Title *</Label>
              <Input className="mt-1" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Quote title"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: CREAM }} />
            </div>
            <div>
              <Label style={{ color: MUTED }}>Amount ($) *</Label>
              <Input className="mt-1" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: CREAM }} />
            </div>
            <div>
              <Label style={{ color: MUTED }}>Description</Label>
              <Textarea className="mt-1 resize-none" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Scope of work..."
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: CREAM }} />
            </div>
            <div>
              <Label style={{ color: MUTED }}>Valid Until</Label>
              <Input className="mt-1" type="date" value={form.validUntil} onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))}
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: CREAM }} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}
              style={{ borderColor: "rgba(255,255,255,0.15)", color: MUTED }}>Cancel</Button>
            <Button
              onClick={() => {
                if (!form.title || !form.amount) { toast.error("Title and amount required"); return; }
                submit.mutate({ vendorId: vendor.id, title: form.title, amount: form.amount, description: form.description, validUntil: form.validUntil || undefined });
              }}
              disabled={submit.isPending}
              style={{ background: "linear-gradient(135deg, #BF9A3B 0%, #D4AF5A 100%)", color: "#1A1B17" }}>
              {submit.isPending ? "Submitting..." : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
