import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import ProjectFilterBar from "@/components/ProjectFilterBar";
import {
  DollarSign, CheckCircle, Clock, ExternalLink,
  TrendingDown, Download, Loader2
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useState } from "react";

const GOLD = "#C9A84C";
const DARK = "#1A1B17";
const CHARCOAL = "#2E2F2A";
const CREAM = "#F5F0E8";
const MUTED = "#9A9589";
const GREEN = "#4CAF7D";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function InvoiceDownloadButton({ invoiceId }: { invoiceId: number }) {
  const [enabled, setEnabled] = useState(false);
  const { data, isLoading, isError } = trpc.clientPortal.downloadInvoicePdf.useQuery(
    { invoiceId },
    {
      enabled,
      retry: false,
      onSuccess: (d) => {
        if (d?.url) window.open(d.url, "_blank");
      },
      onError: () => {
        toast.error("Could not generate PDF. Please contact us.");
      },
    } as any
  );

  const handleClick = () => {
    if (data?.url) {
      window.open(data.url, "_blank");
    } else {
      setEnabled(true);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className="flex items-center gap-1.5 text-xs transition-colors hover:opacity-80"
      style={{ color: MUTED }}
      title="Download your invoice as a PDF"
    >
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      <span>Download PDF</span>
    </button>
  );
}

export default function ClientPayments() {
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>(undefined);
  const { data: summary, isLoading } = trpc.clientPortal.getPaymentSummary.useQuery(
    selectedProjectId ? { projectId: selectedProjectId } : undefined
  );

  const invoices = summary?.invoices ?? [];
  const unpaid = invoices.filter(i => i.status !== "paid" && i.status !== "cancelled");
  const paid = invoices.filter(i => i.status === "paid");

  const contractTotal = Number(summary?.contractTotal ?? 0);
  const totalPaid = Number(summary?.totalPaid ?? 0);
  const remainingBalance = Number(summary?.remainingBalance ?? 0);
  const pctPaid = contractTotal > 0 ? Math.min(100, (totalPaid / contractTotal) * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: GOLD }}>
          Billing &amp; Payments
        </p>
        <h1 className="text-4xl font-serif leading-tight" style={{ color: CREAM, fontStyle: "italic" }}>
          Your Billing
        </h1>
        <p className="text-sm mt-1" style={{ color: MUTED }}>
          View your invoices, track payments, and see your remaining balance.
        </p>
        <ProjectFilterBar
          selectedProjectId={selectedProjectId}
          onSelect={setSelectedProjectId}
          className="mt-4"
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: CHARCOAL }} />
          ))}
        </div>
      )}

      {!isLoading && (
        <>
          {/* Running balance panel */}
          {contractTotal > 0 && (
            <div
              className="rounded-xl overflow-hidden"
              style={{ background: CHARCOAL, border: `1px solid rgba(201,168,76,0.2)` }}
            >
              <div
                className="px-5 py-4 flex items-center gap-2 border-b"
                style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(201,168,76,0.06)" }}
              >
                <TrendingDown className="h-4 w-4" style={{ color: GOLD }} />
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: GOLD }}>
                  Payment Tracker
                </span>
              </div>
              <div className="px-5 py-4 space-y-4">
                {/* Contract total */}
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: MUTED }}>Project Total</span>
                  <span className="text-sm font-semibold" style={{ color: CREAM }}>{fmt(contractTotal)}</span>
                </div>

                {/* Paid deductions */}
                {paid.map((inv, idx) => (
                  <div key={inv.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs shrink-0" style={{ color: MUTED }}>→</span>
                        <span className="text-xs truncate" style={{ color: MUTED }}>
                          {inv.invoiceType ? inv.invoiceType.replace(/_/g, " ") : `Payment ${idx + 1}`}
                        </span>
                      </div>
                      <span className="text-xs font-medium shrink-0" style={{ color: GREEN }}>
                        −{fmt(Number(inv.amount ?? 0))}
                      </span>
                    </div>
                    {inv.balanceAfter !== null && inv.balanceAfter !== undefined && (
                      <div className="flex items-center justify-between pl-5">
                        <span className="text-xs" style={{ color: "rgba(154,149,137,0.6)" }}>Remaining</span>
                        <span className="text-xs font-semibold" style={{ color: inv.balanceAfter <= 0 ? GREEN : GOLD }}>
                          {fmt(inv.balanceAfter)}
                        </span>
                      </div>
                    )}
                  </div>
                ))}

                {/* Progress bar */}
                <div className="border-t pt-3 space-y-2" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <div className="flex justify-between text-xs" style={{ color: MUTED }}>
                    <span>Paid</span>
                    <span>{Math.round(pctPaid)}%</span>
                  </div>
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${pctPaid}%`,
                        background: pctPaid >= 100
                          ? GREEN
                          : `linear-gradient(90deg, ${GOLD}, #E8C96A)`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span style={{ color: GREEN }}>{fmt(totalPaid)} paid</span>
                    <span style={{ color: GOLD }}>{fmt(Math.max(0, remainingBalance))} remaining</span>
                  </div>
                </div>

                {/* Balance highlight */}
                <div
                  className="rounded-lg px-4 py-3 text-center"
                  style={{
                    background: remainingBalance <= 0
                      ? "rgba(76,175,125,0.1)"
                      : "rgba(201,168,76,0.08)",
                    border: `1px solid ${remainingBalance <= 0 ? GREEN + "40" : GOLD + "30"}`,
                  }}
                >
                  {remainingBalance <= 0 ? (
                    <>
                      <CheckCircle className="h-5 w-5 mx-auto mb-1" style={{ color: GREEN }} />
                      <p className="text-sm font-semibold" style={{ color: GREEN }}>Paid in Full</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs mb-0.5" style={{ color: MUTED }}>Amount Still Owed</p>
                      <p className="text-2xl font-bold font-serif" style={{ color: GOLD }}>{fmt(remainingBalance)}</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Due Now */}
          {unpaid.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>
                Ready to Pay
              </h2>
              {unpaid.map(inv => (
                <div
                  key={inv.id}
                  className="rounded-xl overflow-hidden"
                  style={{ background: CHARCOAL, border: `1.5px solid rgba(201,168,76,0.35)` }}
                >
                  <div style={{ height: 3, background: `linear-gradient(90deg, ${GOLD}, #E8C96A)` }} />
                  <div className="p-5 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                        style={{ background: `${GOLD}20` }}
                      >
                        <Clock className="h-4 w-4" style={{ color: GOLD }} />
                      </div>
                      <div>
                        <p className="font-semibold text-sm" style={{ color: CREAM }}>
                          Invoice #{inv.invoiceNumber ?? inv.id}
                        </p>
                        <p className="text-xs mt-0.5 capitalize" style={{ color: MUTED }}>
                          {(inv.invoiceType ?? "invoice").replace(/_/g, " ")}
                        </p>
                        <p className="text-lg font-bold mt-1" style={{ color: GOLD }}>
                          {fmt(Number(inv.amount ?? 0))}
                        </p>
                        {inv.dueDate && (
                          <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                            Due {format(new Date(inv.dueDate), "MMMM d, yyyy")}
                          </p>
                        )}
                        {/* PDF download link */}
                        <div className="mt-2">
                          <InvoiceDownloadButton invoiceId={inv.id} />
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="h-9 px-4 text-xs font-semibold shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${GOLD}, #E8C96A)`,
                        color: DARK,
                        boxShadow: `0 4px 12px rgba(201,168,76,0.3)`,
                      }}
                      onClick={() => {
                        if (inv.squarePaymentUrl) window.open(inv.squarePaymentUrl, "_blank");
                        else if (inv.squarePaymentId) window.open(inv.squarePaymentId, "_blank");
                        else toast.info("Payment link coming soon. Please contact us at (864) 567-8777.");
                      }}
                    >
                      <ExternalLink className="h-3 w-3 mr-1.5" />
                      Pay Now
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Payment history */}
          {paid.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>
                Payments Made
              </h2>
              {paid.map(inv => (
                <div
                  key={inv.id}
                  className="rounded-xl p-4 flex items-center gap-3"
                  style={{ background: CHARCOAL, border: `1px solid rgba(76,175,125,0.15)` }}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${GREEN}15` }}
                  >
                    <CheckCircle className="h-4 w-4" style={{ color: GREEN }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm" style={{ color: CREAM }}>
                      Invoice #{inv.invoiceNumber ?? inv.id}
                    </p>
                    <p className="text-xs mt-0.5 capitalize" style={{ color: MUTED }}>
                      {(inv.invoiceType ?? "invoice").replace(/_/g, " ")} ·{" "}
                      {fmt(Number(inv.amount ?? 0))} ·{" "}
                      Paid {inv.paidAt ? format(new Date(inv.paidAt), "MMM d, yyyy") : ""}
                    </p>
                    {/* PDF download for paid invoices */}
                    <div className="mt-1.5">
                      <InvoiceDownloadButton invoiceId={inv.id} />
                    </div>
                  </div>
                  {inv.balanceAfter !== null && inv.balanceAfter !== undefined && (
                    <div className="text-right shrink-0">
                      <p className="text-[10px] uppercase tracking-wide" style={{ color: MUTED }}>Remaining after</p>
                      <p className="text-sm font-semibold" style={{ color: inv.balanceAfter <= 0 ? GREEN : GOLD }}>
                        {fmt(inv.balanceAfter)}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {unpaid.length === 0 && paid.length === 0 && (
            <div
              className="rounded-xl p-10 text-center space-y-3"
              style={{ background: CHARCOAL, border: `1px solid rgba(255,255,255,0.06)` }}
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
                style={{ background: `${GOLD}15` }}
              >
                <DollarSign className="h-6 w-6" style={{ color: GOLD }} />
              </div>
              <h2 className="text-xl font-serif" style={{ color: CREAM, fontStyle: "italic" }}>
                No invoices yet
              </h2>
              <p className="text-sm" style={{ color: MUTED }}>
                Your invoices will appear here as your project gets started.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
