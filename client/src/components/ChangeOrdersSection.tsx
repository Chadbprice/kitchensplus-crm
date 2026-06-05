/**
 * ChangeOrdersSection — displayed in the Project Detail Change Orders tab
 * Lists all change orders for a project. Supports creating, viewing, sending
 * for client approval, and manually marking as approved.
 */
import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, GitBranch, Send, CheckCircle2, XCircle, Loader2,
  ChevronDown, ChevronUp, Trash2, FileText, ShoppingCart,
} from "lucide-react";
import ProductImportSidebar, { type ImportedProduct } from "@/components/ProductImportSidebar";
import { toast } from "sonner";
import { format } from "date-fns";

interface ChangeOrdersSectionProps {
  projectId: number;
}

interface LineItem {
  task: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft:    { label: "Draft",    color: "bg-gray-500/20 text-gray-400 border-gray-500/30",    icon: <FileText className="w-3 h-3" /> },
  sent:     { label: "Sent",     color: "bg-blue-500/20 text-blue-400 border-blue-500/30",    icon: <Send className="w-3 h-3" /> },
  approved: { label: "Approved", color: "bg-green-500/20 text-green-400 border-green-500/30", icon: <CheckCircle2 className="w-3 h-3" /> },
  rejected: { label: "Declined", color: "bg-red-500/20 text-red-400 border-red-500/30",       icon: <XCircle className="w-3 h-3" /> },
  voided:   { label: "Voided",   color: "bg-gray-500/20 text-gray-300 border-gray-500/20",    icon: <XCircle className="w-3 h-3" /> },
};

// ── Create Dialog ─────────────────────────────────────────────────────────────
function CreateCODialog({
  projectId, onClose, onSuccess,
}: {
  projectId: number; onClose: () => void; onSuccess: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { task: "", description: "", quantity: 1, unitPrice: 0, lineTotal: 0 },
  ]);
  const [showProductSidebar, setShowProductSidebar] = useState(false);
  const [productSidebarDefault, setProductSidebarDefault] = useState<string | undefined>(undefined);
  const dialogContentRef = useRef<HTMLDivElement>(null);

  function handleProductImport(product: ImportedProduct) {
    const newItem: LineItem = {
      task: product.title.substring(0, 80),
      description: product.description.substring(0, 120),
      quantity: 1,
      unitPrice: product.price ?? 0,
      lineTotal: product.price ?? 0,
    };
    setLineItems(prev => {
      const last = prev[prev.length - 1];
      if (!last?.task && !last?.unitPrice) return [...prev.slice(0, -1), newItem];
      return [...prev, newItem];
    });
    setShowProductSidebar(false);
  }

  const totalAmount = lineItems.reduce((sum, li) => sum + li.lineTotal, 0);

  const createMutation = trpc.changeOrders.create.useMutation({
    onSuccess: () => { toast.success("Change order created as draft."); onSuccess(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const updateLineItem = (idx: number, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      if (field === "quantity" || field === "unitPrice") {
        const qty = field === "quantity" ? Number(value) : updated[idx].quantity;
        const price = field === "unitPrice" ? Number(value) : updated[idx].unitPrice;
        updated[idx].lineTotal = parseFloat((qty * price).toFixed(2));
      }
      return updated;
    });
  };

  return (
    <>
    <Dialog open onOpenChange={onClose}>
      <DialogContent ref={dialogContentRef} className="max-w-2xl bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-foreground flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-[#BF9A3B]" /> New Change Order
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-widest mb-1.5 block">Title *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)}
              className="bg-background border-border" placeholder="e.g., Add under-cabinet lighting" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-widest mb-1.5 block">Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)}
              className="bg-background border-border min-h-[80px] resize-none"
              placeholder="Describe the scope of this change…" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-widest">Line Items</Label>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline"
                  style={{ background: "#F96302", borderColor: "#F96302", color: "#fff" }}
                  className="h-6 text-xs px-2 gap-1"
                  onClick={() => { setProductSidebarDefault("The Home Depot"); setShowProductSidebar(true); }}>
                  <ShoppingCart className="w-3 h-3" /> Home Depot
                </Button>
                <Button type="button" size="sm" variant="outline"
                  className="h-6 text-xs px-2 border-[#BF9A3B]/40 text-[#BF9A3B] hover:bg-[#BF9A3B]/10 gap-1"
                  onClick={() => { setProductSidebarDefault(undefined); setShowProductSidebar(true); }}>
                  <ShoppingCart className="w-3 h-3" /> Other Supplier
                </Button>
                <Button type="button" size="sm" variant="outline"
                  onClick={() => setLineItems(prev => [...prev, { task: "", description: "", quantity: 1, unitPrice: 0, lineTotal: 0 }])}
                  className="h-6 text-xs px-2 border-[#BF9A3B]/40 text-[#BF9A3B] hover:bg-[#BF9A3B]/10">
                  <Plus className="w-3 h-3 mr-1" /> Add Row
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-12 gap-2 mb-1 text-xs text-muted-foreground">
              <div className="col-span-4">Task</div><div className="col-span-3">Description</div>
              <div className="col-span-1">Qty</div><div className="col-span-2">Unit $</div>
              <div className="col-span-1 text-right">Total</div><div className="col-span-1" />
            </div>
            <div className="space-y-2">
              {lineItems.map((li, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-4">
                    <Input value={li.task} onChange={e => updateLineItem(idx, "task", e.target.value)}
                      placeholder="Task" className="bg-background border-border text-xs h-8" />
                  </div>
                  <div className="col-span-3">
                    <Input value={li.description} onChange={e => updateLineItem(idx, "description", e.target.value)}
                      placeholder="Details" className="bg-background border-border text-xs h-8" />
                  </div>
                  <div className="col-span-1">
                    <Input type="number" value={li.quantity}
                      onChange={e => updateLineItem(idx, "quantity", parseFloat(e.target.value) || 0)}
                      className="bg-background border-border text-xs h-8" />
                  </div>
                  <div className="col-span-2">
                    <Input type="number" value={li.unitPrice}
                      onChange={e => updateLineItem(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                      className="bg-background border-border text-xs h-8" />
                  </div>
                  <div className="col-span-1 text-right">
                    <span className="text-xs text-muted-foreground font-mono">${li.lineTotal.toFixed(2)}</span>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {lineItems.length > 1 && (
                      <button type="button" onClick={() => setLineItems(prev => prev.filter((_, i) => i !== idx))}
                        className="text-muted-foreground hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-2 pt-2 border-t border-border">
              <span className="text-sm font-semibold text-foreground">
                Total: <span className={totalAmount >= 0 ? "text-[#BF9A3B]" : "text-green-400"}>
                  {totalAmount >= 0 ? "+" : ""}${Math.abs(totalAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </span>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-widest mb-1.5 block">Internal Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)}
              className="bg-background border-border min-h-[60px] resize-none"
              placeholder="Internal notes (not sent to client)…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-border">Cancel</Button>
          <Button onClick={() => {
            if (!title.trim()) { toast.error("Title is required."); return; }
            createMutation.mutate({
              projectId, title: title.trim(),
              description: description.trim() || undefined,
              lineItems: lineItems.filter(li => li.task.trim()),
              amount: totalAmount,
              notes: notes.trim() || undefined,
            });
          }} disabled={createMutation.isPending}
            className="bg-[#BF9A3B] hover:bg-[#A8852E] text-[#1A1A1A] font-medium">
            {createMutation.isPending
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating…</>
              : <><Plus className="w-4 h-4 mr-2" /> Create Draft</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <ProductImportSidebar
      open={showProductSidebar}
      onClose={() => setShowProductSidebar(false)}
      defaultSupplier={productSidebarDefault}
      portalContainer={dialogContentRef.current}
      onImport={handleProductImport}
    />
    </>
  );
}

// ── Main Section ──────────────────────────────────────────────────────────────
export function ChangeOrdersSection({ projectId }: ChangeOrdersSectionProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: changeOrders, refetch, isLoading } = trpc.changeOrders.listByProject.useQuery({ projectId });

  const sendMutation = trpc.changeOrders.send.useMutation({
    onSuccess: (data) => { refetch(); toast.success(`Change order sent to ${data.sentTo} for approval.`); },
    onError: (e) => toast.error(e.message),
  });

  const approveMutation = trpc.changeOrders.approveManually.useMutation({
    onSuccess: () => { refetch(); toast.success("Change order marked as approved."); },
    onError: (e) => toast.error(e.message),
  });

  const voidMutation = trpc.changeOrders.void.useMutation({
    onSuccess: () => { refetch(); toast.success("Change order voided."); },
    onError: (e) => toast.error(e.message),
  });

  const pendingCount = (changeOrders ?? []).filter(co => co.status === "sent").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-foreground font-serif">Change Orders</h3>
          {pendingCount > 0 && (
            <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs animate-pulse">
              {pendingCount} awaiting approval
            </Badge>
          )}
        </div>
        <Button onClick={() => setShowCreate(true)}
          className="bg-[#BF9A3B] hover:bg-[#A8852E] text-[#1A1A1A] text-sm h-8 px-3 font-medium">
          <Plus className="w-3.5 h-3.5 mr-1.5" /> New Change Order
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (changeOrders ?? []).length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <GitBranch className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No change orders yet.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Create one manually or convert an RFI into a change order.</p>
            <Button onClick={() => setShowCreate(true)} variant="outline"
              className="mt-4 border-[#BF9A3B]/40 text-[#BF9A3B] hover:bg-[#BF9A3B]/10">
              <Plus className="w-4 h-4 mr-1.5" /> Create First Change Order
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(changeOrders ?? []).map(co => {
            const statusCfg = STATUS_CONFIG[co.status] ?? STATUS_CONFIG.draft;
            const isExpanded = expandedId === co.id;
            const amountNum = co.amount;
            const amountStr = `${amountNum >= 0 ? "+" : ""}$${Math.abs(amountNum).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

            return (
              <Card key={co.id} className={`bg-card border transition-all ${
                co.status === "sent" ? "border-blue-500/40 shadow-[0_0_12px_rgba(59,130,246,0.1)]"
                : co.status === "approved" ? "border-green-500/30" : "border-border"
              }`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 p-1.5 rounded-md ${co.status === "approved" ? "bg-green-500/20" : "bg-muted"}`}>
                      <GitBranch className={`w-4 h-4 ${co.status === "approved" ? "text-green-400" : "text-muted-foreground"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-foreground">{co.changeOrderNumber}</span>
                        <span className="text-sm text-foreground truncate">{co.title}</span>
                        <Badge className={`text-xs border ${statusCfg.color} flex items-center gap-1`}>
                          {statusCfg.icon} {statusCfg.label}
                        </Badge>
                        <span className={`text-sm font-semibold ${amountNum >= 0 ? "text-[#BF9A3B]" : "text-green-400"}`}>
                          {amountStr}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Created {co.createdAt ? format(new Date(co.createdAt), "MMM d, yyyy") : "—"}
                        {co.sentAt && ` · Sent ${format(new Date(co.sentAt), "MMM d")}`}
                        {co.approvedAt && ` · Approved ${format(new Date(co.approvedAt), "MMM d")}`}
                        {co.approvedBy && ` by ${co.approvedBy}`}
                        {co.approvalMethod && ` (${co.approvalMethod.replace("_", " ")})`}
                      </p>
                      <button onClick={() => setExpandedId(isExpanded ? null : co.id)}
                        className="flex items-center gap-1 text-xs text-[#BF9A3B] hover:text-[#A8852E] mt-2 transition-colors">
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {isExpanded ? "Hide details" : "View details"}
                      </button>

                      {isExpanded && (
                        <div className="mt-3 space-y-3">
                          {co.description && (
                            <div className="bg-background/50 border border-border rounded-md p-3">
                              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1.5">Description</p>
                              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{co.description}</p>
                            </div>
                          )}
                          {co.lineItems && co.lineItems.length > 0 && (
                            <div className="bg-background/50 border border-border rounded-md overflow-hidden">
                              <div className="px-3 py-2 border-b border-border">
                                <p className="text-xs text-muted-foreground uppercase tracking-widest">Line Items</p>
                              </div>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-border">
                                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">Task</th>
                                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">Description</th>
                                    <th className="text-right px-3 py-2 text-muted-foreground font-medium">Qty</th>
                                    <th className="text-right px-3 py-2 text-muted-foreground font-medium">Unit</th>
                                    <th className="text-right px-3 py-2 text-muted-foreground font-medium">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {co.lineItems.map((li: any, i: number) => (
                                    <tr key={i} className="border-b border-border/50 last:border-0">
                                      <td className="px-3 py-2 text-foreground">{li.task}</td>
                                      <td className="px-3 py-2 text-muted-foreground">{li.description}</td>
                                      <td className="px-3 py-2 text-right text-foreground">{li.quantity}</td>
                                      <td className="px-3 py-2 text-right text-foreground">${Number(li.unitPrice).toFixed(2)}</td>
                                      <td className="px-3 py-2 text-right font-medium text-foreground">${Number(li.lineTotal).toFixed(2)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t border-border bg-muted/30">
                                    <td colSpan={4} className="px-3 py-2 text-right font-semibold text-foreground">Total</td>
                                    <td className="px-3 py-2 text-right font-bold text-[#BF9A3B]">{amountStr}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          )}
                          {co.notes && (
                            <div className="bg-background/50 border border-border rounded-md p-3">
                              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1.5">Internal Notes</p>
                              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{co.notes}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                      {co.status === "draft" && (
                        <Button size="sm"
                          onClick={() => sendMutation.mutate({ id: co.id, origin: window.location.origin })}
                          disabled={sendMutation.isPending && sendMutation.variables?.id === co.id}
                          className="bg-[#BF9A3B] hover:bg-[#A8852E] text-[#1A1A1A] h-7 text-xs px-2.5">
                          {sendMutation.isPending && sendMutation.variables?.id === co.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <><Send className="w-3 h-3 mr-1" /> Send for Approval</>}
                        </Button>
                      )}
                      {co.status === "sent" && (
                        <>
                          <Button size="sm" variant="outline"
                            onClick={() => sendMutation.mutate({ id: co.id, origin: window.location.origin })}
                            disabled={sendMutation.isPending && sendMutation.variables?.id === co.id}
                            className="h-7 text-xs px-2.5 border-blue-500/40 text-blue-400 hover:bg-blue-500/10">
                            <Send className="w-3 h-3 mr-1" /> Resend
                          </Button>
                          <Button size="sm"
                            onClick={() => approveMutation.mutate({ id: co.id })}
                            disabled={approveMutation.isPending && approveMutation.variables?.id === co.id}
                            className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs px-2.5">
                            {approveMutation.isPending && approveMutation.variables?.id === co.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <><CheckCircle2 className="w-3 h-3 mr-1" /> Mark Approved</>}
                          </Button>
                        </>
                      )}
                      {co.status !== "voided" && co.status !== "approved" && (
                        <Button size="sm" variant="ghost"
                          onClick={() => { if (confirm("Void this change order?")) voidMutation.mutate({ id: co.id }); }}
                          className="h-7 text-xs px-2.5 text-muted-foreground hover:text-red-400">
                          <XCircle className="w-3 h-3 mr-1" /> Void
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

      {showCreate && (
        <CreateCODialog projectId={projectId} onClose={() => setShowCreate(false)} onSuccess={() => refetch()} />
      )}
    </div>
  );
}
