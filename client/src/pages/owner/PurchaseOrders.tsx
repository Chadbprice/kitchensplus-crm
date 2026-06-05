import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Plus, Send, Pencil, Trash2, Package, X, CheckCircle,
  UserPlus, ChevronDown, ChevronUp, ClipboardList,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type PoStatus = "draft" | "request_sent" | "quote_received" | "approved" | "sent" | "acknowledged" | "delivered" | "invoiced" | "paid" | "cancelled";

const STATUS_CONFIG: Record<PoStatus, { label: string; color: string }> = {
  draft:          { label: "Draft",           color: "bg-zinc-700 text-zinc-200" },
  request_sent:   { label: "Request Sent",    color: "bg-sky-900 text-sky-200" },
  quote_received: { label: "Quote Received",  color: "bg-amber-900 text-amber-200" },
  approved:       { label: "Approved",        color: "bg-emerald-900 text-emerald-200" },
  sent:           { label: "PO Sent",         color: "bg-blue-900 text-blue-200" },
  acknowledged:   { label: "Acknowledged",    color: "bg-teal-900 text-teal-200" },
  delivered:      { label: "Delivered",       color: "bg-green-900 text-green-200" },
  invoiced:       { label: "Invoiced",        color: "bg-purple-900 text-purple-200" },
  paid:           { label: "Paid",            color: "bg-green-800 text-green-100" },
  cancelled:      { label: "Cancelled",       color: "bg-red-900 text-red-200" },
};

function StatusBadge({ status }: { status: PoStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// ─── Empty line item template ─────────────────────────────────────────────────
function emptyItem() {
  return { itemTitle: "", description: "", quantity: "1", unit: "", unitCost: "", lineTotal: 0 };
}

// ─── Add New Vendor Mini-Dialog ───────────────────────────────────────────────
function AddVendorDialog({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (vendor: { id: number; companyName: string }) => void;
}) {
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [trade, setTrade] = useState("");
  const createVendor = trpc.vendors.create.useMutation();
  const utils = trpc.useUtils();

  async function handleCreate() {
    if (!companyName.trim()) { toast.error("Company name is required"); return; }
    try {
      const result = await createVendor.mutateAsync({ companyName: companyName.trim(), contactName: contactName || undefined, email: email || undefined, phone: phone || undefined, trade: trade || undefined });
      await utils.vendors.list.invalidate();
      toast.success(`Vendor "${companyName}" added`);
      onCreated({ id: result.id, companyName: companyName.trim() });
      setCompanyName(""); setContactName(""); setEmail(""); setPhone(""); setTrade("");
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to add vendor");
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md bg-[#1C1C1A] border-[#3A3A35]">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg text-[#C9A84C]">Add New Vendor</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-zinc-300">Company Name *</Label>
            <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. ABC Cabinets LLC" className="bg-[#2A2A26] border-[#3A3A35] text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-zinc-300">Contact Name</Label>
              <Input value={contactName} onChange={e => setContactName(e.target.value)} className="bg-[#2A2A26] border-[#3A3A35] text-white" />
            </div>
            <div className="space-y-1">
              <Label className="text-zinc-300">Trade / Specialty</Label>
              <Input value={trade} onChange={e => setTrade(e.target.value)} placeholder="e.g. Cabinets" className="bg-[#2A2A26] border-[#3A3A35] text-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-zinc-300">Email</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="bg-[#2A2A26] border-[#3A3A35] text-white" />
            </div>
            <div className="space-y-1">
              <Label className="text-zinc-300">Phone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} className="bg-[#2A2A26] border-[#3A3A35] text-white" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-[#3A3A35] text-zinc-300">Cancel</Button>
          <Button onClick={handleCreate} disabled={createVendor.isPending} className="bg-[#C9A84C] text-black hover:bg-[#b8963e]">
            {createVendor.isPending ? "Adding..." : "Add Vendor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Vendor Selector with inline Add ─────────────────────────────────────────
function VendorSelector({
  value, onChange, vendors,
}: {
  value: string;
  onChange: (id: string) => void;
  vendors: any[];
}) {
  const [showAddVendor, setShowAddVendor] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="bg-[#2A2A26] border-[#3A3A35] text-white flex-1">
            <SelectValue placeholder="Select vendor" />
          </SelectTrigger>
          <SelectContent className="bg-[#2A2A26] border-[#3A3A35]">
            {vendors.map(v => (
              <SelectItem key={v.id} value={String(v.id)} className="text-white focus:bg-[#3A3A35]">
                {v.companyName}{v.trade ? ` — ${v.trade}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowAddVendor(true)}
          className="border-[#3A3A35] text-zinc-400 hover:text-[#C9A84C] hover:border-[#C9A84C] shrink-0 px-2"
          title="Add new vendor"
        >
          <UserPlus className="h-4 w-4" />
        </Button>
      </div>
      <AddVendorDialog
        open={showAddVendor}
        onClose={() => setShowAddVendor(false)}
        onCreated={v => onChange(String(v.id))}
      />
    </div>
  );
}

// ─── Line Items Table ─────────────────────────────────────────────────────────
function LineItemsTable({
  items,
  onChange,
  showCost = true,
}: {
  items: ReturnType<typeof emptyItem>[];
  onChange: (items: ReturnType<typeof emptyItem>[]) => void;
  showCost?: boolean;
}) {
  function update(idx: number, field: string, value: string) {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: value };
    const qty = parseFloat(updated[idx].quantity || "1");
    const cost = parseFloat(updated[idx].unitCost || "0");
    updated[idx].lineTotal = isNaN(qty) || isNaN(cost) ? 0 : qty * cost;
    onChange(updated);
  }

  const subtotal = items.reduce((s, li) => s + (li.lineTotal || 0), 0);

  return (
    <div className="space-y-2">
      {items.map((li, idx) => (
        <div key={idx} className="rounded border border-[#3A3A35] bg-[#222220] p-3 space-y-2">
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-2">
              {/* Item Title */}
              <Input
                value={li.itemTitle}
                onChange={e => update(idx, "itemTitle", e.target.value)}
                placeholder="Item title (e.g. Upper Cabinet - 36in W x 42in H)"
                className="bg-[#2A2A26] border-[#3A3A35] text-white font-medium placeholder:text-zinc-600 h-8 text-sm"
              />
              {/* Description */}
              <Textarea
                value={li.description}
                onChange={e => update(idx, "description", e.target.value)}
                placeholder="Detailed description — material specs, finish, model number, color, dimensions..."
                className="bg-[#2A2A26] border-[#3A3A35] text-white text-sm placeholder:text-zinc-600 resize-none"
                rows={2}
              />
              {/* Qty / Unit / Cost row */}
              <div className="flex gap-2 items-center">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-500">Qty</span>
                  <Input
                    value={li.quantity}
                    onChange={e => update(idx, "quantity", e.target.value)}
                    className="bg-[#2A2A26] border-[#3A3A35] text-white text-center h-7 w-16 text-sm px-1 focus-visible:ring-0"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-500">Unit</span>
                  <Input
                    value={li.unit}
                    onChange={e => update(idx, "unit", e.target.value)}
                    placeholder="ea"
                    className="bg-[#2A2A26] border-[#3A3A35] text-white text-center h-7 w-16 text-sm px-1 focus-visible:ring-0"
                  />
                </div>
                {showCost && (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-xs text-zinc-500">Unit Cost</span>
                    <Input
                      value={li.unitCost}
                      onChange={e => update(idx, "unitCost", e.target.value)}
                      placeholder="0.00"
                      className="bg-[#2A2A26] border-[#3A3A35] text-white text-right h-7 w-24 text-sm px-2 focus-visible:ring-0"
                    />
                    <span className="text-sm text-[#C9A84C] font-medium tabular-nums w-20 text-right">
                      ${li.lineTotal.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => onChange(items.filter((_, i) => i !== idx))}
              className="text-zinc-600 hover:text-red-400 transition-colors mt-1 shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange([...items, emptyItem()])}
        className="border-[#3A3A35] text-zinc-300 hover:bg-[#2A2A26] w-full"
      >
        <Plus className="h-3.5 w-3.5 mr-1" /> Add Line Item
      </Button>

      {showCost && items.length > 0 && (
        <div className="text-right text-sm font-medium text-[#C9A84C] pr-2">
          Estimated Total: ${subtotal.toFixed(2)}
        </div>
      )}
    </div>
  );
}

// ─── New PO Dialog ────────────────────────────────────────────────────────────
function NewPoDialog({
  open, onClose, vendors, projects, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  vendors: any[];
  projects: any[];
  onCreated: (id: number) => void;
}) {
  const [title, setTitle] = useState("");
  const [vendorId, setVendorId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [lineItems, setLineItems] = useState([emptyItem()]);
  const [isRequest, setIsRequest] = useState(true); // default: PO Request mode

  const createPo = trpc.purchaseOrders.create.useMutation();
  const addLineItem = trpc.purchaseOrders.addLineItem.useMutation();
  const sendRequest = trpc.purchaseOrders.sendRequest.useMutation();

  async function handleSubmit() {
    if (!title.trim()) { toast.error("PO title is required"); return; }
    const validItems = lineItems.filter(li => li.description.trim());
    try {
      const result = await createPo.mutateAsync({
        title: title.trim(),
        vendorId: vendorId ? parseInt(vendorId) : undefined,
        projectId: projectId ? parseInt(projectId) : undefined,
        notes: notes.trim() || undefined,
        expectedDelivery: expectedDelivery || undefined,
      });
      for (let i = 0; i < validItems.length; i++) {
        await addLineItem.mutateAsync({
          poId: result.id,
          itemTitle: validItems[i].itemTitle || undefined,
          description: validItems[i].description,
          quantity: validItems[i].quantity || "1",
          unit: validItems[i].unit || undefined,
          unitCost: validItems[i].unitCost || "0",
          sortOrder: i,
        });
      }
      // If request mode and vendor has email, send the request
      if (isRequest && vendorId) {
        try {
          await sendRequest.mutateAsync({ id: result.id, origin: window.location.origin });
          toast.success(`PO Request ${result.poNumber} sent to vendor for pricing`);
        } catch {
          toast.success(`PO ${result.poNumber} created — send request from the detail view`);
        }
      } else {
        toast.success(`PO ${result.poNumber} created as draft`);
      }
      onCreated(result.id);
      onClose();
      setTitle(""); setVendorId(""); setProjectId(""); setNotes(""); setExpectedDelivery(""); setLineItems([emptyItem()]); setIsRequest(true);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create PO");
    }
  }

  const isPending = createPo.isPending || addLineItem.isPending || sendRequest.isPending;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto bg-[#1C1C1A] border-[#3A3A35]">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl text-[#C9A84C]">New Purchase Order Request</DialogTitle>
          <p className="text-xs text-zinc-400 mt-1">
            Fill in the scope — no pricing needed. The vendor will receive a request email and reply with their quote. You then approve and issue the formal PO.
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-1">
            <Label className="text-zinc-300">PO Title *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Cabinet Hardware — Smith Kitchen Remodel" className="bg-[#2A2A26] border-[#3A3A35] text-white" />
          </div>

          {/* Vendor & Project */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-zinc-300">Vendor</Label>
              <VendorSelector value={vendorId} onChange={setVendorId} vendors={vendors} />
            </div>
            <div className="space-y-1">
              <Label className="text-zinc-300">Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="bg-[#2A2A26] border-[#3A3A35] text-white">
                  <SelectValue placeholder="Select project (optional)" />
                </SelectTrigger>
                <SelectContent className="bg-[#2A2A26] border-[#3A3A35]">
                  {projects.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)} className="text-white focus:bg-[#3A3A35]">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Expected Delivery */}
          <div className="space-y-1">
            <Label className="text-zinc-300">Expected Delivery Date (optional)</Label>
            <Input type="date" value={expectedDelivery} onChange={e => setExpectedDelivery(e.target.value)} className="bg-[#2A2A26] border-[#3A3A35] text-white" />
          </div>

          {/* Line Items */}
          <div className="space-y-2">
            <Label className="text-zinc-300">Scope of Work / Line Items</Label>
            <p className="text-xs text-zinc-500">Add a title and detailed description for each item. Pricing is optional here — the vendor will quote it back.</p>
            <LineItemsTable items={lineItems} onChange={setLineItems} showCost={false} />
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-zinc-300">Notes / Special Instructions</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Delivery instructions, color specs, model numbers, finish details..." className="bg-[#2A2A26] border-[#3A3A35] text-white resize-none" rows={3} />
          </div>

          {/* Mode toggle */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setIsRequest(true)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${isRequest ? "bg-sky-900/40 border-sky-600 text-sky-200" : "bg-[#2A2A26] border-[#3A3A35] text-zinc-400 hover:border-zinc-500"}`}
            >
              <Send className="h-4 w-4" /> Send Request to Vendor
            </button>
            <button
              type="button"
              onClick={() => setIsRequest(false)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${!isRequest ? "bg-zinc-700 border-zinc-500 text-zinc-200" : "bg-[#2A2A26] border-[#3A3A35] text-zinc-400 hover:border-zinc-500"}`}
            >
              <ClipboardList className="h-4 w-4" /> Save as Draft
            </button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-[#3A3A35] text-zinc-300">Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending} className="bg-[#C9A84C] text-black hover:bg-[#b8963e]">
            {isPending ? "Saving..." : isRequest ? "Create & Send Request" : "Save as Draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── PO Detail Sheet ──────────────────────────────────────────────────────────
function PoDetailSheet({
  poId, open, onClose, vendors, projects, onRefresh,
}: {
  poId: number | null;
  open: boolean;
  onClose: () => void;
  vendors: any[];
  projects: any[];
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editVendorId, setEditVendorId] = useState("");
  const [editProjectId, setEditProjectId] = useState("");
  const [editExpectedDelivery, setEditExpectedDelivery] = useState("");
  const [editItems, setEditItems] = useState<ReturnType<typeof emptyItem>[]>([]);
  const [sending, setSending] = useState(false);
  const [showLineItems, setShowLineItems] = useState(true);

  const { data: po, refetch } = trpc.purchaseOrders.get.useQuery(
    { id: poId! },
    { enabled: !!poId }
  );

  const updatePo = trpc.purchaseOrders.update.useMutation();
  const addLineItem = trpc.purchaseOrders.addLineItem.useMutation();
  const deleteLineItem = trpc.purchaseOrders.deleteLineItem.useMutation();
  const deletePo = trpc.purchaseOrders.delete.useMutation();
  const sendPo = trpc.purchaseOrders.send.useMutation();
  const sendRequest = trpc.purchaseOrders.sendRequest.useMutation();
  const approvePo = trpc.purchaseOrders.approve.useMutation();
  const utils = trpc.useUtils();

  function startEdit() {
    if (!po) return;
    setEditTitle(po.title ?? "");
    setEditNotes(po.notes ?? "");
    setEditVendorId(po.vendorId ? String(po.vendorId) : "");
    setEditProjectId(po.projectId ? String(po.projectId) : "");
    setEditExpectedDelivery(po.expectedDelivery ? new Date(po.expectedDelivery).toISOString().split("T")[0] : "");
    setEditItems((po.lineItems ?? []).map((li: any) => ({
      id: li.id,
      itemTitle: li.itemTitle ?? "",
      description: li.description,
      quantity: String(li.quantity ?? "1"),
      unit: li.unit ?? "",
      unitCost: String(li.unitCost ?? "0"),
      lineTotal: parseFloat(String(li.lineTotal ?? "0")),
    })));
    setEditing(true);
  }

  async function saveEdit() {
    if (!po) return;
    try {
      await updatePo.mutateAsync({
        id: po.id,
        title: editTitle,
        notes: editNotes || undefined,
        vendorId: editVendorId ? parseInt(editVendorId) : undefined,
        projectId: editProjectId ? parseInt(editProjectId) : undefined,
        expectedDelivery: editExpectedDelivery || undefined,
      });
      for (const li of (po.lineItems ?? [])) {
        await deleteLineItem.mutateAsync({ id: li.id, poId: po.id });
      }
      const validItems = editItems.filter(li => li.description.trim());
      for (let i = 0; i < validItems.length; i++) {
        await addLineItem.mutateAsync({
          poId: po.id,
          itemTitle: validItems[i].itemTitle || undefined,
          description: validItems[i].description,
          quantity: validItems[i].quantity || "1",
          unit: validItems[i].unit || undefined,
          unitCost: validItems[i].unitCost || "0",
          sortOrder: i,
        });
      }
      toast.success("PO updated");
      setEditing(false);
      refetch();
      onRefresh();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save");
    }
  }

  async function handleSendRequest() {
    if (!po) return;
    setSending(true);
    try {
      const result = await sendRequest.mutateAsync({ id: po.id, origin: window.location.origin });
      if (result.emailSent) {
        toast.success(`Pricing request sent to vendor`);
      } else {
        toast.info(`PO marked as request sent — ${result.emailError ? `email failed: ${result.emailError}` : "no vendor email on file"}`);
      }
      refetch(); onRefresh();
    } catch (err: any) {
      toast.error(err.message ?? "Send failed");
    } finally { setSending(false); }
  }

  async function handleApprove() {
    if (!po) return;
    try {
      await approvePo.mutateAsync({ id: po.id });
      toast.success(`PO ${po.poNumber} approved — ready to send formal PO`);
      refetch(); onRefresh();
    } catch (err: any) {
      toast.error(err.message ?? "Approve failed");
    }
  }

  async function handleSendFormalPo() {
    if (!po) return;
    setSending(true);
    try {
      const result = await sendPo.mutateAsync({ id: po.id, origin: window.location.origin });
      if (result.emailSent) {
        toast.success(`Formal PO ${po.poNumber} sent to vendor with PDF`);
      } else {
        toast.info(`PO marked as sent — ${result.emailError ?? "no vendor email on file"}`);
      }
      refetch(); onRefresh();
    } catch (err: any) {
      toast.error(err.message ?? "Send failed");
    } finally { setSending(false); }
  }

  async function handleStatusChange(status: PoStatus) {
    if (!po) return;
    try {
      await updatePo.mutateAsync({ id: po.id, status });
      toast.success(`Status updated to ${STATUS_CONFIG[status].label}`);
      refetch(); onRefresh();
    } catch {}
  }

  async function handleDelete() {
    if (!po) return;
    if (!confirm(`Delete PO ${po.poNumber}? This cannot be undone.`)) return;
    try {
      await deletePo.mutateAsync({ id: po.id });
      toast.success("PO deleted");
      onClose(); onRefresh();
    } catch (err: any) {
      toast.error(err.message ?? "Delete failed");
    }
  }

  const vendor = po?.vendorId ? vendors.find((v: any) => v.id === po.vendorId) : null;
  const project = po?.projectId ? projects.find((p: any) => p.id === po.projectId) : null;
  const poStatus = (po?.status ?? "draft") as PoStatus;

  // Determine which action buttons to show based on status
  const isRequest = poStatus === "draft" || poStatus === "request_sent";
  const needsApproval = poStatus === "quote_received";
  const isApproved = poStatus === "approved";
  const isSent = ["sent", "acknowledged", "delivered", "invoiced", "paid"].includes(poStatus);

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) { setEditing(false); onClose(); } }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl bg-[#1C1C1A] border-[#3A3A35] overflow-y-auto p-0">
        {!po ? (
          <div className="flex items-center justify-center h-full text-zinc-500">Loading...</div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Header */}
            <SheetHeader className="px-6 py-4 border-b border-[#3A3A35] flex-shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-[#C9A84C]">{po.poNumber}</span>
                    <StatusBadge status={poStatus} />
                  </div>
                  <SheetTitle className="font-serif text-xl text-white">{po.title}</SheetTitle>
                  {vendor && <p className="text-sm text-zinc-400 mt-0.5">{vendor.companyName}{vendor.trade ? ` — ${vendor.trade}` : ""}</p>}
                  {project && <p className="text-xs text-zinc-500 mt-0.5">Project: {project.name}</p>}
                </div>
                <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
                  {!editing && (
                    <>
                      <Button size="sm" variant="outline" onClick={startEdit} className="border-[#3A3A35] text-zinc-300 hover:bg-[#2A2A26]">
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                      </Button>
                      {/* Step 1: Send Request */}
                      {(poStatus === "draft") && (
                        <Button size="sm" onClick={handleSendRequest} disabled={sending} className="bg-sky-700 text-white hover:bg-sky-600">
                          <Send className="h-3.5 w-3.5 mr-1" /> Send Request
                        </Button>
                      )}
                      {/* Re-send request */}
                      {poStatus === "request_sent" && (
                        <Button size="sm" variant="outline" onClick={handleSendRequest} disabled={sending} className="border-sky-700 text-sky-300 hover:bg-sky-900/30">
                          <Send className="h-3.5 w-3.5 mr-1" /> Resend Request
                        </Button>
                      )}
                      {/* Mark quote received */}
                      {poStatus === "request_sent" && (
                        <Button size="sm" variant="outline" onClick={() => handleStatusChange("quote_received")} className="border-amber-700 text-amber-300 hover:bg-amber-900/30">
                          Quote Received
                        </Button>
                      )}
                      {/* Step 2: Approve */}
                      {needsApproval && (
                        <Button size="sm" onClick={handleApprove} className="bg-emerald-700 text-white hover:bg-emerald-600">
                          <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve PO
                        </Button>
                      )}
                      {/* Step 3: Send formal PO */}
                      {isApproved && (
                        <Button size="sm" onClick={handleSendFormalPo} disabled={sending} className="bg-[#C9A84C] text-black hover:bg-[#b8963e]">
                          <Send className="h-3.5 w-3.5 mr-1" /> Send Formal PO
                        </Button>
                      )}
                    </>
                  )}
                  {editing && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="border-[#3A3A35] text-zinc-300">Cancel</Button>
                      <Button size="sm" onClick={saveEdit} disabled={updatePo.isPending} className="bg-[#C9A84C] text-black hover:bg-[#b8963e]">
                        Save Changes
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Workflow steps indicator */}
              {!editing && (
                <div className="flex items-center gap-1 mt-3 text-xs">
                  {[
                    { key: "draft", label: "1. Draft" },
                    { key: "request_sent", label: "2. Request Sent" },
                    { key: "quote_received", label: "3. Quote Received" },
                    { key: "approved", label: "4. Approved" },
                    { key: "sent", label: "5. PO Sent" },
                  ].map((step, i, arr) => {
                    const statuses: PoStatus[] = ["draft", "request_sent", "quote_received", "approved", "sent", "acknowledged", "delivered", "invoiced", "paid"];
                    const currentIdx = statuses.indexOf(poStatus);
                    const stepIdx = statuses.indexOf(step.key as PoStatus);
                    const isDone = currentIdx > stepIdx;
                    const isCurrent = currentIdx === stepIdx;
                    return (
                      <div key={step.key} className="flex items-center gap-1">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${isDone ? "bg-emerald-900/50 text-emerald-400" : isCurrent ? "bg-[#C9A84C]/20 text-[#C9A84C]" : "text-zinc-600"}`}>
                          {step.label}
                        </span>
                        {i < arr.length - 1 && <span className="text-zinc-700">›</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </SheetHeader>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {!editing ? (
                <>
                  {/* Info cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#2A2A26] rounded-lg p-3">
                      <p className="text-xs text-zinc-500 mb-1">Vendor</p>
                      <p className="text-sm text-white font-medium">{vendor?.companyName ?? "—"}</p>
                      {vendor?.email && <p className="text-xs text-zinc-400">{vendor.email}</p>}
                      {vendor?.phone && <p className="text-xs text-zinc-400">{vendor.phone}</p>}
                    </div>
                    <div className="bg-[#2A2A26] rounded-lg p-3">
                      <p className="text-xs text-zinc-500 mb-1">Project</p>
                      <p className="text-sm text-white font-medium">{project?.name ?? "—"}</p>
                      {po.expectedDelivery && (
                        <p className="text-xs text-zinc-400 mt-1">
                          Expected: {new Date(po.expectedDelivery).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Line items */}
                  <div>
                    <button
                      className="flex items-center gap-2 text-xs text-zinc-500 uppercase tracking-wide mb-2 hover:text-zinc-300 transition-colors"
                      onClick={() => setShowLineItems(v => !v)}
                    >
                      {showLineItems ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      Scope / Line Items ({(po.lineItems ?? []).length})
                    </button>
                    {showLineItems && (
                      <div className="space-y-2">
                        {(po.lineItems ?? []).map((li: any, idx: number) => (
                          <div key={li.id} className="rounded border border-[#3A3A35] bg-[#222220] p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                {li.itemTitle && (
                                  <p className="text-sm font-medium text-white mb-0.5">{li.itemTitle}</p>
                                )}
                                <p className="text-sm text-zinc-300">{li.description}</p>
                                <div className="flex gap-3 mt-1.5 text-xs text-zinc-500">
                                  <span>Qty: {parseFloat(String(li.quantity)).toFixed(2)} {li.unit ?? ""}</span>
                                  {parseFloat(String(li.unitCost ?? "0")) > 0 && (
                                    <>
                                      <span>Unit: ${parseFloat(String(li.unitCost)).toFixed(2)}</span>
                                      <span className="text-[#C9A84C] font-medium">Total: ${parseFloat(String(li.lineTotal)).toFixed(2)}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <span className="text-xs text-zinc-600 shrink-0">#{idx + 1}</span>
                            </div>
                          </div>
                        ))}
                        {parseFloat(String(po.total ?? "0")) > 0 && (
                          <div className="text-right text-sm font-medium text-[#C9A84C] pr-1">
                            Total: ${parseFloat(String(po.total ?? "0")).toFixed(2)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  {po.notes && (
                    <div>
                      <p className="text-xs text-zinc-500 mb-1 uppercase tracking-wide">Notes</p>
                      <p className="text-sm text-zinc-300 bg-[#2A2A26] rounded p-3 whitespace-pre-wrap">{po.notes}</p>
                    </div>
                  )}

                  {/* Status workflow (post-approval) */}
                  {isSent && (
                    <div>
                      <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wide">Update Status</p>
                      <div className="flex flex-wrap gap-2">
                        {(["sent", "acknowledged", "delivered", "invoiced", "paid", "cancelled"] as PoStatus[]).map(s => (
                          <button
                            key={s}
                            onClick={() => handleStatusChange(s)}
                            className={`px-3 py-1 rounded text-xs font-medium transition-all ${poStatus === s ? STATUS_CONFIG[s].color + " ring-1 ring-white/20" : "bg-[#2A2A26] text-zinc-400 hover:bg-[#3A3A35]"}`}
                          >
                            {STATUS_CONFIG[s].label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Dates */}
                  <div className="text-xs text-zinc-600 space-y-0.5">
                    <p>Created: {new Date(po.createdAt).toLocaleString()}</p>
                    {po.deliveredAt && <p>Delivered: {new Date(po.deliveredAt).toLocaleString()}</p>}
                  </div>

                  {/* Delete */}
                  <div className="pt-2 border-t border-[#3A3A35]">
                    <Button variant="outline" size="sm" onClick={handleDelete} className="border-red-900 text-red-400 hover:bg-red-950">
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete PO
                    </Button>
                  </div>
                </>
              ) : (
                /* Edit mode */
                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label className="text-zinc-300">Title</Label>
                    <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="bg-[#2A2A26] border-[#3A3A35] text-white" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-zinc-300">Vendor</Label>
                      <VendorSelector value={editVendorId} onChange={setEditVendorId} vendors={vendors} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-zinc-300">Project</Label>
                      <Select value={editProjectId} onValueChange={setEditProjectId}>
                        <SelectTrigger className="bg-[#2A2A26] border-[#3A3A35] text-white">
                          <SelectValue placeholder="Select project" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#2A2A26] border-[#3A3A35]">
                          {projects.map((p: any) => (
                            <SelectItem key={p.id} value={String(p.id)} className="text-white focus:bg-[#3A3A35]">
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-zinc-300">Expected Delivery</Label>
                    <Input type="date" value={editExpectedDelivery} onChange={e => setEditExpectedDelivery(e.target.value)} className="bg-[#2A2A26] border-[#3A3A35] text-white" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-300">Line Items</Label>
                    <LineItemsTable items={editItems} onChange={setEditItems} showCost={true} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-zinc-300">Notes</Label>
                    <Textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} className="bg-[#2A2A26] border-[#3A3A35] text-white resize-none" rows={3} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PurchaseOrders() {
  const [showNew, setShowNew] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: pos = [], refetch } = trpc.purchaseOrders.list.useQuery();
  const { data: vendors = [] } = trpc.vendors.list.useQuery();
  const { data: projects = [] } = trpc.projects.list.useQuery();

  const filtered = useMemo(() => {
    return (pos as any[]).filter((po: any) => {
      const matchStatus = filterStatus === "all" || po.status === filterStatus;
      const matchSearch = !search || (po.title ?? "").toLowerCase().includes(search.toLowerCase()) || (po.poNumber ?? "").toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [pos, filterStatus, search]);

  function openDetail(id: number) {
    setDetailId(id);
    setShowDetail(true);
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif" style={{ color: "var(--kp-cream)" }}>Purchase Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">Request pricing from vendors, approve quotes, and issue formal POs</p>
        </div>
        <Button onClick={() => setShowNew(true)} className="bg-[#C9A84C] text-black hover:bg-[#b8963e]">
          <Plus className="h-4 w-4 mr-1.5" /> New PO Request
        </Button>
      </div>

      {/* Workflow guide */}
      <div className="flex items-center gap-2 text-xs text-zinc-500 bg-[#1C1C1A] border border-[#3A3A35] rounded-lg px-4 py-3">
        <span className="text-sky-400 font-medium">1. Create &amp; Send Request</span>
        <span className="text-zinc-700">→</span>
        <span className="text-amber-400 font-medium">2. Vendor Quotes Back</span>
        <span className="text-zinc-700">→</span>
        <span className="text-emerald-400 font-medium">3. Approve PO</span>
        <span className="text-zinc-700">→</span>
        <span className="text-[#C9A84C] font-medium">4. Send Formal PO</span>
        <span className="text-zinc-700">→</span>
        <span className="text-zinc-400 font-medium">5. Delivered &amp; Paid</span>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Search POs..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-[#1C1C1A] border-[#3A3A35] text-white w-64"
        />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="bg-[#1C1C1A] border-[#3A3A35] text-white w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#1C1C1A] border-[#3A3A35]">
            <SelectItem value="all" className="text-white focus:bg-[#2A2A26]">All Statuses</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k} className="text-white focus:bg-[#2A2A26]">{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* PO Cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Package className="h-12 w-12 text-zinc-700 mb-4" />
          <p className="text-zinc-400 font-medium">No purchase orders yet</p>
          <p className="text-zinc-600 text-sm mt-1">Create a PO request to get pricing from a vendor</p>
          <Button onClick={() => setShowNew(true)} className="mt-4 bg-[#C9A84C] text-black hover:bg-[#b8963e]">
            <Plus className="h-4 w-4 mr-1" /> New PO Request
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((po: any) => {
            const vendor = vendors.find((v: any) => v.id === po.vendorId);
            const project = projects.find((p: any) => p.id === po.projectId);
            const total = parseFloat(String(po.total ?? "0"));
            return (
              <Card
                key={po.id}
                className="bg-[#1C1C1A] border-[#3A3A35] hover:border-[#C9A84C]/40 cursor-pointer transition-all"
                onClick={() => openDetail(po.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-[#C9A84C] mb-0.5">{po.poNumber}</p>
                      <p className="text-sm font-medium text-white truncate">{po.title}</p>
                    </div>
                    <StatusBadge status={po.status as PoStatus} />
                  </div>
                  {vendor && (
                    <p className="text-xs text-zinc-400 mb-1">{vendor.companyName}{vendor.trade ? ` — ${vendor.trade}` : ""}</p>
                  )}
                  {project && (
                    <p className="text-xs text-zinc-500 mb-2">Project: {project.name}</p>
                  )}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#3A3A35]">
                    <span className="text-xs text-zinc-500">{new Date(po.createdAt).toLocaleDateString()}</span>
                    {total > 0 ? (
                      <span className="text-sm font-medium text-[#C9A84C]">${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                    ) : (
                      <span className="text-xs text-zinc-600 italic">Awaiting quote</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <NewPoDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        vendors={vendors as any[]}
        projects={projects as any[]}
        onCreated={id => { refetch(); openDetail(id); }}
      />
      <PoDetailSheet
        poId={detailId}
        open={showDetail}
        onClose={() => setShowDetail(false)}
        vendors={vendors as any[]}
        projects={projects as any[]}
        onRefresh={refetch}
      />
    </div>
  );
}
