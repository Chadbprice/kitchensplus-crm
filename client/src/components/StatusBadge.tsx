/**
 * StatusBadge — shared status badge component for Kitchens Plus CRM.
 *
 * Covers all status values used across leads, projects, proposals/estimates,
 * invoices, purchase orders, and vendor compliance.
 *
 * Usage:
 *   import { StatusBadge } from "@/components/StatusBadge";
 *   <StatusBadge status={lead.status} />
 *   <StatusBadge status="won" size="sm" />
 */

const GOLD = "#BF9A3B";

interface StatusConfig {
  label: string;
  color: string;
}

const STATUS_MAP: Record<string, StatusConfig> = {
  // ── Lead statuses ──────────────────────────────────────────────────────────
  new:                       { label: "New",                    color: "#5B9BD5" },
  consultation_scheduled:    { label: "Consultation Scheduled", color: "#9B59B6" },
  visited:                   { label: "Visited",                color: "#8B5CF6" },
  quoted:                    { label: "Quoted",                 color: "#E8A838" },
  won:                       { label: "Won",                    color: "#4CAF7D" },
  lost:                      { label: "Lost",                   color: "#E05252" },

  // ── Project statuses ───────────────────────────────────────────────────────
  planning:                  { label: "Planning",               color: "#A855F7" },
  active:                    { label: "Active",                 color: "#22C55E" },
  on_hold:                   { label: "On Hold",                color: "#EAB308" },
  completed:                 { label: "Completed",              color: "#10B981" },
  cancelled:                 { label: "Cancelled",              color: "#EF4444" },

  // ── Proposal / estimate statuses ──────────────────────────────────────────
  draft:                     { label: "Draft",                  color: "#6B7280" },
  sent:                      { label: "Sent",                   color: "#3B82F6" },
  approved:                  { label: "Approved",               color: "#10B981" },
  rejected:                  { label: "Rejected",               color: "#EF4444" },
  expired:                   { label: "Expired",                color: "#9CA3AF" },

  // ── Invoice / payment statuses ────────────────────────────────────────────
  pending:                   { label: "Pending",                color: "#F59E0B" },
  paid:                      { label: "Paid",                   color: "#10B981" },
  overdue:                   { label: "Overdue",                color: "#EF4444" },
  partial:                   { label: "Partial",                color: "#F97316" },
  voided:                    { label: "Voided",                 color: "#6B7280" },

  // ── Purchase order statuses ───────────────────────────────────────────────
  submitted:                 { label: "Submitted",              color: "#3B82F6" },
  acknowledged:              { label: "Acknowledged",           color: "#8B5CF6" },
  delivered:                 { label: "Delivered",              color: "#10B981" },

  // ── Vendor / compliance statuses ──────────────────────────────────────────
  active_vendor:             { label: "Active",                 color: "#22C55E" },
  inactive:                  { label: "Inactive",               color: "#6B7280" },
  pending_review:            { label: "Pending Review",         color: "#F59E0B" },
  suspended:                 { label: "Suspended",              color: "#EF4444" },

  // ── RFI statuses ──────────────────────────────────────────────────────────
  open:                      { label: "Open",                   color: "#3B82F6" },
  answered:                  { label: "Answered",               color: "#10B981" },
  closed:                    { label: "Closed",                 color: "#6B7280" },
};

interface StatusBadgeProps {
  status: string | null | undefined;
  /** "sm" = compact (default), "md" = slightly larger */
  size?: "sm" | "md";
  className?: string;
}

export function StatusBadge({ status, size = "sm", className = "" }: StatusBadgeProps) {
  const key = (status ?? "").toLowerCase().replace(/ /g, "_");
  const cfg = STATUS_MAP[key] ?? { label: status ?? "Unknown", color: GOLD };

  const padding = size === "md" ? "px-2.5 py-1" : "px-2 py-0.5";
  const fontSize = size === "md" ? "text-xs" : "text-[11px]";

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${padding} ${fontSize} ${className}`}
      style={{
        background: `${cfg.color}20`,
        color: cfg.color,
        border: `1px solid ${cfg.color}40`,
      }}
    >
      {cfg.label}
    </span>
  );
}

/**
 * Convenience helper — returns the color hex for a given status key.
 * Useful when you need the color without rendering a badge.
 */
export function getStatusColor(status: string | null | undefined): string {
  const key = (status ?? "").toLowerCase().replace(/ /g, "_");
  return STATUS_MAP[key]?.color ?? GOLD;
}

/**
 * Convenience helper — returns the human-readable label for a given status key.
 */
export function getStatusLabel(status: string | null | undefined): string {
  const key = (status ?? "").toLowerCase().replace(/ /g, "_");
  return STATUS_MAP[key]?.label ?? (status ?? "Unknown");
}
