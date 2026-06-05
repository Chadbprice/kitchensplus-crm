'use client';
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Plus, Search, Phone, Mail, Edit2, Trash2, X, ChevronRight, ShoppingCart, Globe, Star } from "lucide-react";

const TIER_CONFIG_V: Record<string, { label: string; color: string; bg: string; border: string }> = {
  elite: { label: "Elite", color: "#BF9A3B", bg: "rgba(191,154,59,0.15)", border: "rgba(191,154,59,0.4)" },
  preferred: { label: "Preferred", color: "#4CAF50", bg: "rgba(76,175,80,0.12)", border: "rgba(76,175,80,0.35)" },
  standard: { label: "Standard", color: "#90A4AE", bg: "rgba(144,164,174,0.12)", border: "rgba(144,164,174,0.3)" },
  do_not_use: { label: "Do Not Use", color: "#EF5350", bg: "rgba(239,83,80,0.12)", border: "rgba(239,83,80,0.35)" },
};

function VendorTierBadge({ tier }: { tier: string | null | undefined }) {
  if (!tier) return null;
  const cfg = TIER_CONFIG_V[tier] ?? { label: tier, color: "#888", bg: "rgba(100,100,100,0.1)", border: "rgba(100,100,100,0.2)" };
  return (
    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
      <Star className="h-3 w-3" /> {cfg.label}
    </span>
  );
}
const GOLD = "#BF9A3B";

const CATEGORIES = [
  "appliances", "cabinetry", "countertops", "flooring", "hardware",
  "lighting", "plumbing fixtures", "tile", "paint & finishes",
  "lumber & materials", "tools & equipment", "other"
];

interface Contact {
  id?: number;
  contactName: string;
  phone: string;
  email: string;
  receivePhoneMessages: boolean;
  receiveEmailMessages: boolean;
}

interface VendorForm {
  companyName: string;
  companyEmail: string;
  website: string;
  trade: string;
  notes: string;
  contacts: Contact[];
}

const emptyContact = (): Contact => ({
  contactName: "",
  phone: "",
  email: "",
  receivePhoneMessages: true,
  receiveEmailMessages: true,
});

const emptyForm = (): VendorForm => ({
  companyName: "",
  companyEmail: "",
  website: "",
  trade: "",
  notes: "",
  contacts: [emptyContact()],
});

export default function Vendors() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editVendor, setEditVendor] = useState<any>(null);
  const [form, setForm] = useState<VendorForm>(emptyForm());
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: vendors = [], isLoading } = trpc.vendors.list.useQuery({});

  const createMutation = trpc.vendors.create.useMutation({
    onSuccess: () => {
      toast.success("Vendor added");
      utils.vendors.list.invalidate();
      setShowAdd(false);
      setForm(emptyForm());
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.vendors.update.useMutation({
    onSuccess: () => {
      toast.success("Vendor updated");
      utils.vendors.list.invalidate();
      setEditVendor(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.vendors.delete.useMutation({
    onSuccess: () => {
      toast.success("Vendor removed");
      utils.vendors.list.invalidate();
      setDeleteId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = (vendors as any[]).filter((v) =>
    v.companyName?.toLowerCase().includes(search.toLowerCase()) ||
    v.trade?.toLowerCase().includes(search.toLowerCase())
  );

  function openEdit(v: any) {
    setEditVendor(v);
    setForm({
      companyName: v.companyName ?? "",
      companyEmail: v.companyEmail ?? "",
      website: v.website ?? "",
      trade: v.trade ?? "",
      notes: v.notes ?? "",
      contacts: (v.contacts && v.contacts.length > 0) ? v.contacts : [emptyContact()],
    });
  }

  function handleSubmit(isEdit: boolean) {
    const payload = {
      companyName: form.companyName,
      companyEmail: form.companyEmail || undefined,
      website: form.website || undefined,
      trade: form.trade || undefined,
      notes: form.notes || undefined,
      contacts: form.contacts.filter((c) => c.contactName || c.phone || c.email),
    };
    if (isEdit && editVendor) {
      updateMutation.mutate({ id: editVendor.id, ...payload } as any);
    } else {
      createMutation.mutate(payload as any);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-serif" style={{ color: "var(--kp-cream)" }}>Vendors</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--kp-muted)" }}>
            Material &amp; supply vendors — managed via email and purchase orders
          </p>
        </div>
        <Button
          onClick={() => { setForm(emptyForm()); setShowAdd(true); }}
          className="btn-gold gap-2"
        >
          <Plus className="h-4 w-4" /> Add Vendor
        </Button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl mb-6"
        style={{ background: "rgba(191,154,59,0.07)", border: "1px solid rgba(191,154,59,0.2)" }}>
        <ShoppingCart className="h-4 w-4 shrink-0 mt-0.5" style={{ color: GOLD }} />
        <p className="text-sm" style={{ color: "var(--kp-muted)" }}>
          Vendors supply materials and products. Orders are placed via email and tracked through Purchase Orders.
          For labor contractors requiring COI, Workers' Comp, and contracts, use{" "}
          <button
            onClick={() => navigate("/subcontractors")}
            className="underline font-medium"
            style={{ color: GOLD }}
          >
            Subcontractors
          </button>{" "}
          instead.
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--kp-muted)" }} />
        <Input
          placeholder="Search vendors..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
        />
      </div>

      {/* Vendor list */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: GOLD }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-20" style={{ color: "var(--kp-muted)" }} />
          <p className="text-sm" style={{ color: "var(--kp-muted)" }}>
            {search ? "No vendors match your search" : "No vendors yet — add your first one"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((v: any) => (
            <Card
              key={v.id}
              className="cursor-pointer transition-all hover:border-[rgba(191,154,59,0.3)]"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
              onClick={() => navigate(`/vendors/${v.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center font-bold text-sm shrink-0"
                    style={{ background: "rgba(191,154,59,0.15)", color: GOLD }}
                  >
                    {v.companyName?.slice(0, 2).toUpperCase() ?? "V"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm" style={{ color: "var(--kp-cream)" }}>{v.companyName}</p>
                      {v.trade && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(191,154,59,0.1)", color: GOLD }}>
                          {v.trade}
                        </span>
                      )}
                      <VendorTierBadge tier={(v as any).tier} />
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {v.companyEmail && (
                        <span className="flex items-center gap-1 text-xs" style={{ color: "var(--kp-muted)" }}>
                          <Mail className="h-3 w-3" /> {v.companyEmail}
                        </span>
                      )}
                      {v.website && (
                        <span className="flex items-center gap-1 text-xs" style={{ color: "var(--kp-muted)" }}>
                          <Globe className="h-3 w-3" /> {v.website.replace(/^https?:\/\//, "")}
                        </span>
                      )}
                      {v.contacts?.[0]?.phone && (
                        <span className="flex items-center gap-1 text-xs" style={{ color: "var(--kp-muted)" }}>
                          <Phone className="h-3 w-3" /> {v.contacts[0].phone}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(v)} style={{ color: "var(--kp-muted)" }}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(v.id)} style={{ color: "var(--kp-muted)" }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <ChevronRight className="h-4 w-4" style={{ color: "var(--kp-muted)" }} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd || !!editVendor} onOpenChange={(open) => { if (!open) { setShowAdd(false); setEditVendor(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" style={{ background: "var(--kp-charcoal)", border: "1px solid rgba(191,154,59,0.2)" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "var(--kp-cream)" }}>{editVendor ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label style={{ color: "var(--kp-muted)" }}>Company Name *</Label>
              <Input
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                placeholder="e.g. Marble & Stone Supply Co."
                className="mt-1"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label style={{ color: "var(--kp-muted)" }}>Category</Label>
                <Select value={form.trade} onValueChange={(v) => setForm({ ...form, trade: v })}>
                  <SelectTrigger className="mt-1" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label style={{ color: "var(--kp-muted)" }}>Company Email</Label>
                <Input
                  value={form.companyEmail}
                  onChange={(e) => setForm({ ...form, companyEmail: e.target.value })}
                  placeholder="orders@vendor.com"
                  className="mt-1"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
                />
              </div>
            </div>
            <div>
              <Label style={{ color: "var(--kp-muted)" }}>Website</Label>
              <Input
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                placeholder="https://vendor.com"
                className="mt-1"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label style={{ color: "var(--kp-muted)" }}>Contacts</Label>
                <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, contacts: [...form.contacts, emptyContact()] })} style={{ color: GOLD }}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Contact
                </Button>
              </div>
              {form.contacts.map((contact, idx) => (
                <div key={idx} className="p-3 rounded-lg mb-2 space-y-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium" style={{ color: "var(--kp-muted)" }}>Contact {idx + 1}</span>
                    {form.contacts.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setForm({ ...form, contacts: form.contacts.filter((_, i) => i !== idx) })} style={{ color: "var(--kp-muted)" }}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <Input
                    value={contact.contactName}
                    onChange={(e) => { const c = [...form.contacts]; c[idx] = { ...c[idx], contactName: e.target.value }; setForm({ ...form, contacts: c }); }}
                    placeholder="Contact name"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={contact.phone}
                      onChange={(e) => { const c = [...form.contacts]; c[idx] = { ...c[idx], phone: e.target.value }; setForm({ ...form, contacts: c }); }}
                      placeholder="Phone"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
                    />
                    <Input
                      value={contact.email}
                      onChange={(e) => { const c = [...form.contacts]; c[idx] = { ...c[idx], email: e.target.value }; setForm({ ...form, contacts: c }); }}
                      placeholder="Email"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
                    />
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={contact.receivePhoneMessages} onCheckedChange={(v) => { const c = [...form.contacts]; c[idx] = { ...c[idx], receivePhoneMessages: !!v }; setForm({ ...form, contacts: c }); }} />
                      <span className="text-xs" style={{ color: "var(--kp-muted)" }}>SMS</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={contact.receiveEmailMessages} onCheckedChange={(v) => { const c = [...form.contacts]; c[idx] = { ...c[idx], receiveEmailMessages: !!v }; setForm({ ...form, contacts: c }); }} />
                      <span className="text-xs" style={{ color: "var(--kp-muted)" }}>Email</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <Label style={{ color: "var(--kp-muted)" }}>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Lead times, account numbers, preferred contact method..."
                rows={3}
                className="mt-1"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowAdd(false); setEditVendor(null); }} style={{ color: "var(--kp-muted)" }}>Cancel</Button>
            <Button className="btn-gold" disabled={!form.companyName.trim() || isPending} onClick={() => handleSubmit(!!editVendor)}>
              {isPending ? "Saving..." : editVendor ? "Save Changes" : "Add Vendor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent style={{ background: "var(--kp-charcoal)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: "var(--kp-cream)" }}>Remove Vendor?</AlertDialogTitle>
            <AlertDialogDescription style={{ color: "var(--kp-muted)" }}>
              This will permanently remove the vendor and all associated contacts. Purchase orders will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <AlertDialogCancel style={{ color: "var(--kp-muted)" }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate({ vendorId: deleteId })} style={{ background: "#C62828", color: "#fff" }}>
              Remove
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
