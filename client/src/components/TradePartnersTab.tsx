/**
 * TradePartnersTab — shown inside Project Detail
 * Displays all vendors and subcontractors associated with a project,
 * with tier badges, compliance doc status, quick-links, and assign/remove actions.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Star, ShieldCheck, ShieldAlert, ShieldX, ExternalLink, Users2,
  Plus, X, Search, Loader2,
} from "lucide-react";

const GOLD = "#BF9A3B";

// ─── Tier Badge ───────────────────────────────────────────────────────────────

const TIER_CONFIG = {
  elite:      { label: "Elite",       color: "#f59e0b", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.3)" },
  preferred:  { label: "Preferred",   color: "#22c55e", bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.3)" },
  standard:   { label: "Standard",    color: "#94a3b8", bg: "rgba(148,163,184,0.1)", border: "rgba(148,163,184,0.3)" },
  do_not_use: { label: "Do Not Use",  color: "#ef4444", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.3)" },
} as const;

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return <Badge variant="outline" className="text-[10px]">Unrated</Badge>;
  const cfg = TIER_CONFIG[tier as keyof typeof TIER_CONFIG] ?? TIER_CONFIG.standard;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}
    >
      <Star className="h-2.5 w-2.5" />
      {cfg.label}
    </span>
  );
}

// ─── Compliance Pill ──────────────────────────────────────────────────────────

function CompliancePill({ docs }: { docs: { approved: number; pending: number; expired: number } }) {
  if (docs.expired > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: "#ef4444" }}>
        <ShieldX className="h-3 w-3" />{docs.expired} expired
      </span>
    );
  }
  if (docs.pending > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: "#f59e0b" }}>
        <ShieldAlert className="h-3 w-3" />{docs.pending} pending
      </span>
    );
  }
  if (docs.approved > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: "#22c55e" }}>
        <ShieldCheck className="h-3 w-3" />{docs.approved} docs OK
      </span>
    );
  }
  return <span className="text-[10px] text-muted-foreground">No docs</span>;
}

// ─── Partner Row ──────────────────────────────────────────────────────────────

const AWARD_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: "Pending Award",  color: "#94a3b8", bg: "rgba(148,163,184,0.1)" },
  awarded:  { label: "Award Sent",     color: "#BF9A3B", bg: "rgba(191,154,59,0.12)" },
  accepted: { label: "Accepted",       color: "#22c55e", bg: "rgba(34,197,94,0.1)" },
  declined: { label: "Declined",       color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  voided:   { label: "Voided",         color: "#64748b", bg: "rgba(100,116,139,0.1)" },
};

function AwardStatusBadge({ status }: { status: string }) {
  const cfg = AWARD_STATUS_CONFIG[status];
  if (!cfg) return null;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

function PartnerRow({
  id,
  companyName,
  trade,
  tier,
  performanceScore,
  docs,
  partnerType,
  complianceStatus,
  awardStatus,
  projectId,
  onRemoved,
}: {
  id: number;
  companyName: string;
  trade: string | null;
  tier: string | null;
  performanceScore: string | null;
  docs: { approved: number; pending: number; expired: number };
  partnerType: "vendor" | "subcontractor";
  complianceStatus?: string | null;
  awardStatus?: { status: string; agreedAmount: string | null } | null;
  projectId: number;
  onRemoved: () => void;
}) {
  const [, navigate] = useLocation();
  const href = partnerType === "vendor" ? `/vendors/${id}` : `/subcontractors/${id}`;
  const utils = trpc.useUtils();

  const removeMutation = trpc.vms.tradePartners.removeAssignment.useMutation({
    onSuccess: () => {
      utils.vms.tradePartners.getByProject.invalidate({ projectId });
      toast.success(`${companyName} removed from project`);
      onRemoved();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div
      className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all hover:brightness-110 group"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(191,154,59,0.1)" }}
    >
      {/* Avatar */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold cursor-pointer"
        style={{ background: "rgba(191,154,59,0.12)", color: "var(--kp-gold)" }}
        onClick={() => navigate(href)}
      >
        {companyName.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(href)}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate" style={{ color: "var(--kp-cream)" }}>{companyName}</span>
          <TierBadge tier={tier} />
          <Badge
            variant="outline"
            className="text-[10px] shrink-0"
            style={{ borderColor: "rgba(191,154,59,0.3)", color: "var(--kp-muted)" }}
          >
            {partnerType === "vendor" ? "Vendor" : "Sub"}
          </Badge>
          {awardStatus && <AwardStatusBadge status={awardStatus.status} />}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {trade && <span className="text-xs" style={{ color: "var(--kp-muted)" }}>{trade}</span>}
          {performanceScore && (
            <span className="text-xs" style={{ color: "var(--kp-muted)" }}>
              Score: {parseFloat(performanceScore).toFixed(1)}/10
            </span>
          )}
          <CompliancePill docs={docs} />
          {awardStatus?.agreedAmount && parseFloat(String(awardStatus.agreedAmount)) > 0 && (
            <span className="text-xs font-semibold" style={{ color: "var(--kp-gold)" }}>
              ${parseFloat(String(awardStatus.agreedAmount)).toLocaleString("en-US", { minimumFractionDigits: 0 })}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <ExternalLink
          className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition-opacity cursor-pointer"
          style={{ color: "var(--kp-gold)" }}
          onClick={() => navigate(href)}
        />
        {partnerType === "vendor" && (
          <button
            onClick={() => removeMutation.mutate({ projectId, assigneeType: "vendor", assigneeId: id })}
            disabled={removeMutation.isPending}
            className="h-6 w-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity text-red-400 hover:text-red-300"
            title="Remove from project"
          >
            {removeMutation.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <X className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Assign Vendor Dialog ─────────────────────────────────────────────────────

function AssignVendorDialog({
  projectId,
  open,
  onClose,
}: {
  projectId: number;
  open: boolean;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const utils = trpc.useUtils();

  const { data: allVendors, isLoading } = trpc.vendors.list.useQuery(undefined, { enabled: open });

  const assignMutation = trpc.vms.tradePartners.assign.useMutation({
    onSuccess: (result, vars) => {
      utils.vms.tradePartners.getByProject.invalidate({ projectId });
      if (result.alreadyAssigned) {
        toast.info("Vendor is already assigned to this project");
      } else {
        toast.success("Vendor assigned to project");
      }
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const filtered = (allVendors ?? []).filter((v: any) =>
    !search || v.companyName.toLowerCase().includes(search.toLowerCase()) ||
    (v.trade ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg flex items-center gap-2">
            <Plus className="h-5 w-5" style={{ color: GOLD }} />
            Assign Vendor to Project
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by company or trade..."
              className="pl-9 bg-background border-border"
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Role / Scope (optional)</Label>
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Tile Installation, Countertops..."
              className="bg-background border-border"
            />
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1 rounded-lg border border-border/40 p-1">
            {isLoading ? (
              <div className="py-8 text-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No vendors found</p>
            ) : (
              filtered.map((vendor: any) => (
                <button
                  key={vendor.id}
                  onClick={() => assignMutation.mutate({
                    projectId,
                    assigneeType: "vendor",
                    assigneeId: vendor.id,
                    role: role || undefined,
                  })}
                  disabled={assignMutation.isPending}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-accent transition-colors"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                    style={{ background: "rgba(191,154,59,0.15)", color: GOLD }}
                  >
                    {vendor.companyName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{vendor.companyName}</p>
                    {vendor.trade && (
                      <p className="text-xs text-muted-foreground">{vendor.trade}</p>
                    )}
                  </div>
                  {vendor.tier && (
                    <TierBadge tier={vendor.tier} />
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-border">
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TradePartnersTab({ projectId }: { projectId: number }) {
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const { data, isLoading } = trpc.vms.tradePartners.getByProject.useQuery({ projectId });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
      </div>
    );
  }

  const vendors = data?.vendors ?? [];
  const subs = data?.subcontractors ?? [];
  const total = vendors.length + subs.length;

  const doNotUseCount = [...vendors, ...subs].filter(p => p.tier === "do_not_use").length;
  const expiredDocCount = [...vendors, ...subs].reduce((sum, p) => sum + p.docs.expired, 0);

  return (
    <div className="space-y-4">
      {/* Header with Assign button */}
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: "var(--kp-muted)" }}>
          {total} Trade Partner{total !== 1 ? "s" : ""}
        </p>
        <Button
          size="sm"
          className="h-8 text-xs gap-1.5"
          style={{ background: GOLD, color: "#1a1a1a" }}
          onClick={() => setAssignDialogOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Assign Vendor
        </Button>
      </div>

      {/* Compliance warning bar */}
      {(doNotUseCount > 0 || expiredDocCount > 0) && (
        <div
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm"
          style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}
        >
          <ShieldX className="h-4 w-4 shrink-0" style={{ color: "#ef4444" }} />
          <span style={{ color: "#ef4444" }}>
            {[
              doNotUseCount > 0 && `${doNotUseCount} do-not-use partner${doNotUseCount > 1 ? "s" : ""}`,
              expiredDocCount > 0 && `${expiredDocCount} expired compliance doc${expiredDocCount > 1 ? "s" : ""}`,
            ].filter(Boolean).join(" · ")}
          </span>
        </div>
      )}

      {total === 0 ? (
        <Card style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(191,154,59,0.1)" }}>
          <CardContent className="py-12 text-center">
            <Users2 className="h-8 w-8 mx-auto mb-3 opacity-30" style={{ color: "var(--kp-gold)" }} />
            <p className="text-sm" style={{ color: "var(--kp-muted)" }}>No trade partners linked to this project yet.</p>
            <p className="text-xs mt-1 mb-4" style={{ color: "var(--kp-muted)" }}>
              Click "Assign Vendor" to add vendors, or they appear automatically via Purchase Orders.
            </p>
            <Button
              size="sm"
              className="gap-1.5"
              style={{ background: GOLD, color: "#1a1a1a" }}
              onClick={() => setAssignDialogOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Assign Vendor
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Vendors */}
          {vendors.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-widest font-semibold mb-2" style={{ color: "var(--kp-muted)" }}>
                Vendors ({vendors.length})
              </h3>
              <div className="space-y-2">
                {vendors.map(v => (
                  <PartnerRow
                    key={`vendor-${v.id}`}
                    id={v.id}
                    companyName={v.companyName}
                    trade={v.trade}
                    tier={v.tier}
                    performanceScore={v.performanceScore}
                    docs={v.docs}
                    partnerType="vendor"
                    projectId={projectId}
                    onRemoved={() => {}}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Subcontractors */}
          {subs.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-widest font-semibold mb-2" style={{ color: "var(--kp-muted)" }}>
                Subcontractors ({subs.length})
              </h3>
              <div className="space-y-2">
                {subs.map((s: any) => (
                  <PartnerRow
                    key={`sub-${s.id}`}
                    id={s.id}
                    companyName={s.companyName}
                    trade={s.trade}
                    tier={s.tier}
                    performanceScore={s.performanceScore}
                    docs={s.docs}
                    partnerType="subcontractor"
                    complianceStatus={s.complianceStatus}
                    awardStatus={s.awardStatus}
                    projectId={projectId}
                    onRemoved={() => {}}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Assign dialog */}
      <AssignVendorDialog
        projectId={projectId}
        open={assignDialogOpen}
        onClose={() => setAssignDialogOpen(false)}
      />
    </div>
  );
}
