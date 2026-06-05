import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  DollarSign,
  User,
  Loader2,
  Lock,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";

const GOLD = "#C9A84C";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function pct(n: number) {
  return `${n.toFixed(1)}%`;
}

interface Props {
  estimateId: number;
  lineItems: any[];
  totalSellPrice: number;
  onRefresh: () => void;
}

export default function InternalCostingPanel({ estimateId, lineItems, totalSellPrice, onRefresh }: Props) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftCost, setDraftCost] = useState<string>("");
  const [draftSubId, setDraftSubId] = useState<string>("");
  const [draftSelfPerformed, setDraftSelfPerformed] = useState<boolean>(false);

  const { data: subcontractors } = trpc.subcontractors.list.useQuery({});
  const updateCost = trpc.estimates.updateLineItemCost.useMutation({
    onSuccess: () => {
      toast.success("Cost updated");
      setEditingId(null);
      onRefresh();
    },
    onError: (err) => toast.error(err.message),
  });

  // Compute margin summary
  const totalInternalCost = lineItems.reduce((sum, li) => {
    const cost = parseFloat(String(li.internalCost ?? "0"));
    return sum + cost;
  }, 0);
  const grossProfit = totalSellPrice - totalInternalCost;
  const marginPct = totalSellPrice > 0 ? (grossProfit / totalSellPrice) * 100 : 0;
  const costCoverage = lineItems.filter((li) => parseFloat(String(li.internalCost ?? "0")) > 0).length;

  function startEdit(li: any) {
    setEditingId(li.id);
    setDraftCost(String(parseFloat(String(li.internalCost ?? "0")) || ""));
    setDraftSubId(li.subcontractorId ? String(li.subcontractorId) : "none");
    setDraftSelfPerformed(li.selfPerformed ?? false);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraftCost("");
    setDraftSubId("");
    setDraftSelfPerformed(false);
  }

  function saveEdit(lineItemId: number) {
    updateCost.mutate({
      id: lineItemId,
      internalCost: String(parseFloat(draftCost) || 0),
      subcontractorId: draftSubId && draftSubId !== "none" ? parseInt(draftSubId) : null,
      selfPerformed: draftSelfPerformed,
    });
  }

  const subList = (subcontractors as any[]) ?? [];

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border/60 text-left transition-colors hover:bg-muted/30"
          style={{ background: "var(--kp-charcoal-light)" }}
        >
          <div className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Internal Costing
            </span>
            <Badge
              variant="outline"
              className="text-[10px] h-4 px-1.5 border-border/50 text-muted-foreground"
            >
              Owner Only
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            {totalInternalCost > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Margin:</span>
                <span
                  className="font-semibold"
                  style={{ color: marginPct >= 30 ? "#4CAF7D" : marginPct >= 15 ? GOLD : "#ef4444" }}
                >
                  {pct(marginPct)}
                </span>
                <span className="text-muted-foreground">({fmt(grossProfit)} GP)</span>
              </div>
            )}
            {open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div
          className="mt-1 rounded-xl border border-border/60 p-4 space-y-4"
          style={{ background: "var(--kp-charcoal-light)" }}
        >
          {/* Margin Summary Bar */}
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-lg p-3 text-center" style={{ background: "var(--background)" }}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Sell Price</p>
              <p className="text-sm font-semibold" style={{ color: GOLD }}>{fmt(totalSellPrice)}</p>
            </div>
            <div className="rounded-lg p-3 text-center" style={{ background: "var(--background)" }}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Internal Cost</p>
              <p className="text-sm font-semibold text-foreground">{fmt(totalInternalCost)}</p>
            </div>
            <div className="rounded-lg p-3 text-center" style={{ background: "var(--background)" }}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Gross Profit</p>
              <p
                className="text-sm font-semibold"
                style={{ color: grossProfit >= 0 ? "#4CAF7D" : "#ef4444" }}
              >
                {fmt(grossProfit)}
              </p>
            </div>
            <div className="rounded-lg p-3 text-center" style={{ background: "var(--background)" }}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Margin</p>
              <div className="flex items-center justify-center gap-1">
                {marginPct >= 30 ? (
                  <TrendingUp className="h-3.5 w-3.5" style={{ color: "#4CAF7D" }} />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" style={{ color: marginPct >= 15 ? GOLD : "#ef4444" }} />
                )}
                <p
                  className="text-sm font-semibold"
                  style={{ color: marginPct >= 30 ? "#4CAF7D" : marginPct >= 15 ? GOLD : "#ef4444" }}
                >
                  {pct(marginPct)}
                </p>
              </div>
            </div>
          </div>

          {/* Coverage note */}
          {costCoverage < lineItems.length && (
            <p className="text-xs text-amber-500/80">
              ⚠ {lineItems.length - costCoverage} of {lineItems.length} line items have no internal cost entered yet.
            </p>
          )}

          {/* Per-line-item cost entry */}
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Line Item Costs</p>
            {lineItems.map((li) => {
              const sellPrice =
                parseFloat(String(li.unitCost ?? "0")) * parseFloat(String(li.quantity ?? "1")) *
                (1 + (li.showMarkup ? parseFloat(String(li.markupPercent ?? "0")) / 100 : 0));
              const internalCost = parseFloat(String(li.internalCost ?? "0"));
              const liMargin = sellPrice > 0 ? ((sellPrice - internalCost) / sellPrice) * 100 : null;
              const isEditing = editingId === li.id;
              const assignedSub = subList.find((s: any) => s.id === li.subcontractorId);

              return (
                <div
                  key={li.id}
                  className="rounded-lg border border-border/40 p-3"
                  style={{ background: "var(--background)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{li.task || "—"}</p>
                      <p className="text-xs text-muted-foreground truncate">{li.description || ""}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!isEditing && (
                        <>
                          {internalCost > 0 && (
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">{fmt(internalCost)}</p>
                              {liMargin !== null && (
                                <p
                                  className="text-[10px] font-semibold"
                                  style={{
                                    color: liMargin >= 30 ? "#4CAF7D" : liMargin >= 15 ? GOLD : "#ef4444",
                                  }}
                                >
                                  {pct(liMargin)} margin
                                </p>
                              )}
                            </div>
                          )}
                          {assignedSub && (
                            <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-border/50">
                              <User className="h-2.5 w-2.5 mr-1" />
                              {assignedSub.companyName}
                            </Badge>
                          )}
                          {li.selfPerformed && (
                            <Badge
                              variant="outline"
                              className="text-[10px] h-5 px-1.5"
                              style={{ borderColor: GOLD, color: GOLD }}
                            >
                              Self
                            </Badge>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                            onClick={() => startEdit(li)}
                          >
                            {internalCost > 0 ? "Edit" : "Add Cost"}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {isEditing && (
                    <div className="mt-3 space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-1">Internal Cost ($)</p>
                          <Input
                            type="number"
                            step="0.01"
                            value={draftCost}
                            onChange={(e) => setDraftCost(e.target.value)}
                            placeholder="0.00"
                            className="h-7 text-xs bg-background border-border"
                          />
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-1">Assign Subcontractor</p>
                          <Select value={draftSubId} onValueChange={setDraftSubId}>
                            <SelectTrigger className="h-7 text-xs bg-background border-border">
                              <SelectValue placeholder="None" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {subList.map((s: any) => (
                                <SelectItem key={s.id} value={String(s.id)}>
                                  {s.companyName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-1">Performed By</p>
                          <Select
                            value={draftSelfPerformed ? "self" : "sub"}
                            onValueChange={(v) => setDraftSelfPerformed(v === "self")}
                          >
                            <SelectTrigger className="h-7 text-xs bg-background border-border">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sub">Subcontractor</SelectItem>
                              <SelectItem value="self">Self-Performed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {/* Live margin preview */}
                      {draftCost && parseFloat(draftCost) > 0 && (
                        <div className="text-xs text-muted-foreground">
                          Sell: {fmt(sellPrice)} → Cost: {fmt(parseFloat(draftCost))} →{" "}
                          <span
                            style={{
                              color:
                                ((sellPrice - parseFloat(draftCost)) / sellPrice) * 100 >= 30
                                  ? "#4CAF7D"
                                  : ((sellPrice - parseFloat(draftCost)) / sellPrice) * 100 >= 15
                                  ? GOLD
                                  : "#ef4444",
                            }}
                          >
                            {pct(((sellPrice - parseFloat(draftCost)) / sellPrice) * 100)} margin
                          </span>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-6 text-[10px] px-3"
                          style={{ background: GOLD, color: "#1a1a1a" }}
                          disabled={updateCost.isPending}
                          onClick={() => saveEdit(li.id)}
                        >
                          {updateCost.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Save"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[10px] px-3 text-muted-foreground"
                          onClick={cancelEdit}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
