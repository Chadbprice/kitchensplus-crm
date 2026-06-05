import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus,
  Search,
  HardHat,
  Phone,
  Mail,
  Wrench,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Clock,
  AlertTriangle,
  ChevronRight,
  Filter,
  Star,
} from "lucide-react";

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  elite: { label: "Elite", color: "#BF9A3B", bg: "rgba(191,154,59,0.15)", border: "rgba(191,154,59,0.4)" },
  preferred: { label: "Preferred", color: "#4CAF50", bg: "rgba(76,175,80,0.12)", border: "rgba(76,175,80,0.35)" },
  standard: { label: "Standard", color: "#90A4AE", bg: "rgba(144,164,174,0.12)", border: "rgba(144,164,174,0.3)" },
  do_not_use: { label: "Do Not Use", color: "#EF5350", bg: "rgba(239,83,80,0.12)", border: "rgba(239,83,80,0.35)" },
};

function TierBadge({ tier }: { tier: string | null | undefined }) {
  if (!tier) return null;
  const cfg = TIER_CONFIG[tier] ?? { label: tier, color: "#888", bg: "rgba(100,100,100,0.1)", border: "rgba(100,100,100,0.2)" };
  return (
    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
      <Star className="h-3 w-3" /> {cfg.label}
    </span>
  );
}

// ─── Compliance badge helper ──────────────────────────────────────────────────

function ComplianceBadge({ status }: { status: string | null }) {
  switch (status) {
    case "compliant":
      return (
        <Badge className="gap-1 text-xs" style={{ background: "rgba(46,125,50,0.15)", color: "#2E7D32", border: "1px solid rgba(46,125,50,0.3)" }}>
          <ShieldCheck className="h-3 w-3" /> Compliant
        </Badge>
      );
    case "expiring_soon":
      return (
        <Badge className="gap-1 text-xs" style={{ background: "rgba(230,119,0,0.12)", color: "#E67700", border: "1px solid rgba(230,119,0,0.3)" }}>
          <Clock className="h-3 w-3" /> Expiring Soon
        </Badge>
      );
    case "expired":
      return (
        <Badge className="gap-1 text-xs" style={{ background: "rgba(198,40,40,0.12)", color: "#C62828", border: "1px solid rgba(198,40,40,0.3)" }}>
          <ShieldX className="h-3 w-3" /> Expired
        </Badge>
      );
    case "missing":
      return (
        <Badge className="gap-1 text-xs" style={{ background: "rgba(198,40,40,0.1)", color: "#C62828", border: "1px solid rgba(198,40,40,0.25)" }}>
          <AlertTriangle className="h-3 w-3" /> Missing Docs
        </Badge>
      );
    case "pending":
      return (
        <Badge className="gap-1 text-xs" style={{ background: "rgba(100,100,100,0.12)", color: "#666", border: "1px solid rgba(100,100,100,0.2)" }}>
          <Clock className="h-3 w-3" /> Pending Review
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-xs gap-1">
          <ShieldAlert className="h-3 w-3" /> Unknown
        </Badge>
      );
  }
}

// ─── Add Subcontractor Dialog ─────────────────────────────────────────────────

function AddSubcontractorDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    trade: "",
    licenseNumber: "",
    address: "",
    notes: "",
  });

  const createMutation = trpc.subcontractors.create.useMutation({
    onSuccess: () => {
      toast.success("Subcontractor added");
      onCreated();
      onClose();
      setForm({ companyName: "", contactName: "", email: "", phone: "", trade: "", licenseNumber: "", address: "", notes: "" });
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const TRADES = [
    "Plumbing", "Electrical", "HVAC", "Tile & Stone", "Flooring",
    "Painting", "Drywall", "Carpentry", "Cabinetry", "Countertops",
    "Roofing", "Framing", "Insulation", "Concrete", "Landscaping",
    "General Labor", "Other",
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg" style={{ background: "var(--kp-charcoal)", border: "1px solid rgba(191,154,59,0.2)" }}>
        <DialogHeader>
          <DialogTitle style={{ color: "var(--kp-cream)" }}>Add Subcontractor</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label style={{ color: "var(--kp-muted)" }}>Company Name *</Label>
              <Input
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                placeholder="ABC Plumbing LLC"
                className="mt-1"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
              />
            </div>
            <div>
              <Label style={{ color: "var(--kp-muted)" }}>Contact Name</Label>
              <Input
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                placeholder="John Smith"
                className="mt-1"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
              />
            </div>
            <div>
              <Label style={{ color: "var(--kp-muted)" }}>Trade</Label>
              <Select value={form.trade} onValueChange={(v) => setForm({ ...form, trade: v })}>
                <SelectTrigger className="mt-1" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}>
                  <SelectValue placeholder="Select trade" />
                </SelectTrigger>
                <SelectContent>
                  {TRADES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label style={{ color: "var(--kp-muted)" }}>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="john@abcplumbing.com"
                className="mt-1"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
              />
            </div>
            <div>
              <Label style={{ color: "var(--kp-muted)" }}>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+1 (864) 555-0000"
                className="mt-1"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
              />
            </div>
            <div>
              <Label style={{ color: "var(--kp-muted)" }}>License #</Label>
              <Input
                value={form.licenseNumber}
                onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
                placeholder="SC-12345"
                className="mt-1"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
              />
            </div>
            <div className="col-span-2">
              <Label style={{ color: "var(--kp-muted)" }}>Address</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="123 Main St, Greenville, SC"
                className="mt-1"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
              />
            </div>
            <div className="col-span-2">
              <Label style={{ color: "var(--kp-muted)" }}>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Any additional notes..."
                rows={2}
                className="mt-1 resize-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} style={{ borderColor: "rgba(255,255,255,0.15)", color: "var(--kp-muted)" }}>
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate(form)}
            disabled={!form.companyName || createMutation.isPending}
            className="btn-gold"
          >
            {createMutation.isPending ? "Adding..." : "Add Subcontractor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SubcontractorsPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [filterCompliance, setFilterCompliance] = useState<string>("");
  const [filterTrade, setFilterTrade] = useState<string>("all");
  const [showAdd, setShowAdd] = useState(false);

  const { data: subs = [], refetch } = trpc.subcontractors.list.useQuery({
    search: search || undefined,
    complianceStatus: filterCompliance || undefined,
    trade: filterTrade === "all" ? undefined : filterTrade,
  });

  const { data: trades = [] } = trpc.subcontractors.listTrades.useQuery();

  const complianceCounts = {
    compliant: subs.filter((s) => s.complianceStatus === "compliant").length,
    expiring_soon: subs.filter((s) => s.complianceStatus === "expiring_soon").length,
    expired: subs.filter((s) => s.complianceStatus === "expired").length,
    missing: subs.filter((s) => s.complianceStatus === "missing").length,
    pending: subs.filter((s) => s.complianceStatus === "pending").length,
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--kp-charcoal-dark)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: "rgba(191,154,59,0.15)" }}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(191,154,59,0.15)" }}>
              <HardHat className="h-5 w-5" style={{ color: "var(--kp-gold)" }} />
            </div>
            <div>
              <h1 className="text-xl font-semibold" style={{ color: "var(--kp-cream)" }}>Subcontractors</h1>
              <p className="text-xs" style={{ color: "var(--kp-muted)" }}>{subs.length} registered · Labor trades &amp; specialty contractors</p>
            </div>
          </div>
          <Button onClick={() => setShowAdd(true)} className="btn-gold gap-2">
            <Plus className="h-4 w-4" /> Add Subcontractor
          </Button>
        </div>

        {/* Compliance Summary Strip */}
        <div
          className="flex gap-2 px-4 py-3 overflow-x-auto"
          style={{
            borderBottom: "1px solid rgba(191,154,59,0.1)",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {[
            { key: "", label: "All", count: subs.length, color: "var(--kp-gold)" },
            { key: "compliant", label: "Compliant", count: complianceCounts.compliant, color: "#2E7D32" },
            { key: "expiring_soon", label: "Expiring Soon", count: complianceCounts.expiring_soon, color: "#E67700" },
            { key: "expired", label: "Expired", count: complianceCounts.expired, color: "#C62828" },
            { key: "missing", label: "Missing Docs", count: complianceCounts.missing, color: "#C62828" },
            { key: "pending", label: "Pending Review", count: complianceCounts.pending, color: "#888" },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setFilterCompliance(item.key)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all"
              style={{
                background: filterCompliance === item.key ? `${item.color}20` : "rgba(255,255,255,0.04)",
                border: `1px solid ${filterCompliance === item.key ? `${item.color}50` : "rgba(255,255,255,0.08)"}`,
                color: filterCompliance === item.key ? item.color : "var(--kp-muted)",
              }}
            >
              <span className="font-bold" style={{ color: item.color }}>{item.count}</span>
              {item.label}
            </button>
          ))}
        </div>

        {/* Search + Filter */}
        <div className="flex gap-3 px-6 py-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--kp-muted)" }} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by company, contact, or trade..."
              className="pl-9"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
            />
          </div>
          {trades.length > 0 && (
            <Select value={filterTrade} onValueChange={setFilterTrade}>
              <SelectTrigger className="w-44" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}>
                <Filter className="h-4 w-4 mr-2" style={{ color: "var(--kp-muted)" }} />
                <SelectValue placeholder="All trades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All trades</SelectItem>
                {trades.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {subs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="h-16 w-16 rounded-2xl flex items-center justify-center" style={{ background: "rgba(191,154,59,0.1)" }}>
                <HardHat className="h-8 w-8" style={{ color: "var(--kp-gold)" }} />
              </div>
              <p className="text-lg font-medium" style={{ color: "var(--kp-cream)" }}>No subcontractors yet</p>
              <p className="text-sm text-center max-w-xs" style={{ color: "var(--kp-muted)" }}>
                Add your labor-trade subcontractors to manage compliance, contracts, and communications.
              </p>
              <Button onClick={() => setShowAdd(true)} className="btn-gold gap-2 mt-2">
                <Plus className="h-4 w-4" /> Add First Subcontractor
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 mt-2">
              {subs.map((sub) => (
                <Card
                  key={sub.id}
                  className="cursor-pointer transition-all hover:shadow-md"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                  onClick={() => navigate(`/subcontractors/${sub.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      {/* Avatar */}
                      <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 font-semibold text-sm"
                        style={{ background: "rgba(191,154,59,0.15)", color: "var(--kp-gold)" }}>
                        {sub.companyName.slice(0, 2).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm" style={{ color: "var(--kp-cream)" }}>{sub.companyName}</span>
                          {sub.trade && (
                            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                              style={{ background: "rgba(191,154,59,0.12)", color: "var(--kp-gold)" }}>
                              <Wrench className="h-3 w-3" /> {sub.trade}
                            </span>
                          )}
                          {!sub.isActive && (
                            <Badge variant="outline" className="text-xs" style={{ color: "var(--kp-muted)" }}>Inactive</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {sub.contactName && (
                            <span className="text-xs" style={{ color: "var(--kp-muted)" }}>{sub.contactName}</span>
                          )}
                          {sub.phone && (
                            <span className="flex items-center gap-1 text-xs" style={{ color: "var(--kp-muted)" }}>
                              <Phone className="h-3 w-3" /> {sub.phone}
                            </span>
                          )}
                          {sub.email && (
                            <span className="flex items-center gap-1 text-xs" style={{ color: "var(--kp-muted)" }}>
                              <Mail className="h-3 w-3" /> {sub.email}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Tier + Compliance + Arrow */}
                      <div className="flex items-center gap-2 shrink-0">
                        <TierBadge tier={(sub as any).tier} />
                        <ComplianceBadge status={sub.complianceStatus} />
                        <ChevronRight className="h-4 w-4" style={{ color: "var(--kp-muted)" }} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      <AddSubcontractorDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={() => refetch()}
      />
    </div>
    
  );
}
