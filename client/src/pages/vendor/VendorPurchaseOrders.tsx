import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useVendorPortal } from "@/components/VendorPortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { ShoppingCart, Loader2 } from "lucide-react";
import { format } from "date-fns";

const GOLD = "#BF9A3B";
const CREAM = "#F5F0E8";
const MUTED = "#9B9B8B";
const CHARCOAL_DARK = "#1E1F1A";

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  draft:     { color: MUTED, bg: "rgba(155,155,139,0.12)" },
  sent:      { color: "#4CAF50", bg: "rgba(76,175,80,0.12)" },
  received:  { color: GOLD, bg: "rgba(191,154,59,0.12)" },
  cancelled: { color: "#EF5350", bg: "rgba(239,83,80,0.12)" },
};

export default function VendorPurchaseOrders() {
  const { token } = useVendorPortal();
  const tokenInput = useMemo(() => ({ token }), [token]);
  const { data: pos = [], isLoading } = trpc.vms.vendorPortal.listMyPOs.useQuery(tokenInput);

  return (
    <div className="flex flex-col h-full" style={{ background: CHARCOAL_DARK }}>
      {/* Header */}
      <div className="px-6 py-5 border-b" style={{ borderColor: "rgba(191,154,59,0.15)" }}>
        <h1 className="text-xl font-semibold" style={{ color: CREAM }}>Purchase Orders</h1>
        <p className="text-sm mt-0.5" style={{ color: MUTED }}>POs issued to your company</p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
          </div>
        ) : pos.length === 0 ? (
          <div className="text-center py-20">
            <ShoppingCart className="h-12 w-12 mx-auto mb-4" style={{ color: MUTED, opacity: 0.4 }} />
            <p className="text-base font-medium" style={{ color: CREAM }}>No purchase orders yet</p>
            <p className="text-sm mt-1" style={{ color: MUTED }}>POs will appear here when issued to you</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {pos.map((po) => {
              const cfg = STATUS_COLORS[po.status ?? "draft"] ?? STATUS_COLORS.draft;
              return (
                <Card key={po.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm" style={{ color: CREAM }}>
                            {po.poNumber ?? `PO #${po.id}`}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                            style={{ background: cfg.bg, color: cfg.color }}>
                            {po.status ?? "draft"}
                          </span>
                        </div>
                        <p className="text-sm font-medium mb-1" style={{ color: CREAM }}>{po.title}</p>
                        {po.notes && (
                          <p className="text-xs line-clamp-2" style={{ color: MUTED }}>{po.notes}</p>
                        )}
                        {po.expectedDelivery && (
                          <p className="text-xs mt-1.5" style={{ color: MUTED }}>
                            Expected delivery: {format(new Date(po.expectedDelivery), "MMM d, yyyy")}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold" style={{ color: GOLD }}>
                          ${Number(po.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                          {po.createdAt ? format(new Date(po.createdAt), "MMM d, yyyy") : ""}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
