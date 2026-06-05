import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, FileText, DollarSign, Trash2 } from "lucide-react";
import { format } from "date-fns";

const GOLD = "#BF9A3B";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    draft: { label: "Draft", color: "#8A8B82" },
    sent: { label: "Sent", color: "#5B9BD5" },
    approved: { label: "Approved", color: "#4CAF7D" },
    rejected: { label: "Rejected", color: "#E05252" },
    expired: { label: "Expired", color: "#E8A838" },
  };
  const s = map[status] ?? { label: status, color: GOLD };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: `${s.color}20`, color: s.color, border: `1px solid ${s.color}40` }}>
      {s.label}
    </span>
  );
}

export default function Estimates() {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ projectId: "", title: "", notes: "", validDays: "30" });
  const [lineItems, setLineItems] = useState<any[]>([{ description: "", quantity: "1", unitPrice: "", showMarkup: false, markupPercent: "20", category: "labor" }]);

  const { data: estimates, refetch } = trpc.estimates.list.useQuery({});
  const { data: projects } = trpc.projects.list.useQuery({});
  const createEstimate = trpc.estimates.create.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm({ projectId: "", title: "", notes: "", validDays: "30" }); setLineItems([{ description: "", quantity: "1", unitPrice: "", showMarkup: false, markupPercent: "20", category: "labor" }]); toast.success("Estimate created!"); }
  });
  const deleteEstimate = trpc.estimates.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Estimate deleted"); } });

  const addLineItem = () => setLineItems(items => [...items, { description: "", quantity: "1", unitPrice: "", showMarkup: false, markupPercent: "20", category: "material" }]);
  const removeLineItem = (i: number) => setLineItems(items => items.filter((_, idx) => idx !== i));
  const updateLineItem = (i: number, field: string, value: any) => setLineItems(items => items.map((item, idx) => idx === i ? { ...item, [field]: value } : item));

  const subtotal = lineItems.reduce((sum, item) => {
    const base = parseFloat(item.unitPrice || "0") * parseFloat(item.quantity || "1");
    const markup = item.showMarkup ? base * (parseFloat(item.markupPercent || "0") / 100) : 0;
    return sum + base + markup;
  }, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif" style={{ color: "var(--kp-cream)" }}>Estimates</h1>
          <p className="text-sm text-muted-foreground mt-1">{(estimates ?? []).length} estimates</p>
        </div>
        <Button className="btn-gold text-sm px-4" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> New Estimate
        </Button>
      </div>
      <div className="grid gap-3">
        {(!estimates || estimates.length === 0) ? (
          <Card className="bg-card border-border">
            <CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="text-lg font-serif mb-1">No estimates yet</p>
              <p className="text-sm">Create your first estimate to send to clients</p>
            </CardContent>
          </Card>
        ) : (
          estimates.map(est => (
            <Card key={est.id} className="bg-card border-border hover:border-primary/30 transition-all">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1.5">
                      <h3 className="font-semibold text-foreground">{est.title}</h3>
                      <StatusBadge status={est.status} />
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1" style={{ color: GOLD }}><DollarSign className="h-3 w-3" />${Number(est.total ?? 0).toLocaleString()}</span>
                      <span>Created {format(new Date(est.createdAt), "MMM d, yyyy")}</span>
                      {est.validUntil && <span>Valid until {format(new Date(est.validUntil), "MMM d, yyyy")}</span>}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/20 hover:text-destructive" onClick={() => { if (confirm("Delete estimate?")) deleteEstimate.mutate({ id: est.id }); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-serif text-xl">New Estimate</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Project</Label>
                <Select value={form.projectId} onValueChange={v => setForm(f => ({ ...f, projectId: v }))}>
                  <SelectTrigger className="bg-background border-border"><SelectValue placeholder="Select project" /></SelectTrigger>
                  <SelectContent>{(projects ?? []).map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Valid Days</Label>
                <Input className="bg-background border-border" type="number" value={form.validDays} onChange={e => setForm(f => ({ ...f, validDays: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground mb-1.5 block">Title *</Label>
                <Input className="bg-background border-border" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Kitchen Remodel Estimate" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-widest">Line Items</Label>
                <Button size="sm" variant="outline" className="h-7 text-xs border-border/60" onClick={addLineItem}><Plus className="h-3 w-3 mr-1" /> Add Item</Button>
              </div>
              <div className="space-y-2">
                {lineItems.map((item, i) => (
                  <div key={i} className="border border-border/60 rounded-lg p-3 space-y-2">
                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-5"><Input className="bg-background border-border h-8 text-xs" placeholder="Description" value={item.description} onChange={e => updateLineItem(i, "description", e.target.value)} /></div>
                      <div className="col-span-2"><Input className="bg-background border-border h-8 text-xs" placeholder="Qty" type="number" value={item.quantity} onChange={e => updateLineItem(i, "quantity", e.target.value)} /></div>
                      <div className="col-span-3"><Input className="bg-background border-border h-8 text-xs" placeholder="Unit Price" type="number" value={item.unitPrice} onChange={e => updateLineItem(i, "unitPrice", e.target.value)} /></div>
                      <div className="col-span-2 flex justify-end"><Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => removeLineItem(i)}><Trash2 className="h-3 w-3" /></Button></div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Switch checked={item.showMarkup} onCheckedChange={v => updateLineItem(i, "showMarkup", v)} />
                        <span className="text-xs text-muted-foreground">Show markup</span>
                      </div>
                      {item.showMarkup && (
                        <div className="flex items-center gap-1">
                          <Input className="bg-background border-border h-7 w-16 text-xs" type="number" value={item.markupPercent} onChange={e => updateLineItem(i, "markupPercent", e.target.value)} />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      )}
                      <Select value={item.category} onValueChange={v => updateLineItem(i, "category", v)}>
                        <SelectTrigger className="bg-background border-border h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="labor">Labor</SelectItem>
                          <SelectItem value="material">Material</SelectItem>
                          <SelectItem value="subcontractor">Sub</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Subtotal</p>
                <p className="text-2xl font-serif" style={{ color: GOLD }}>${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Notes</Label>
              <Textarea className="bg-background border-border resize-none" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Payment terms, scope notes, etc." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button className="btn-gold" onClick={() => { if (!form.title.trim()) { toast.error("Title required"); return; } createEstimate.mutate({ ...form, projectId: form.projectId ? parseInt(form.projectId) : undefined, lineItems, totalAmount: subtotal } as any); }} disabled={createEstimate.isPending}>Create Estimate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
