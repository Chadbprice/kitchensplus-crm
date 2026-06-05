import { useState, useMemo } from "react";
import { useParams, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Loader2,
  Send,
  AlertTriangle,
} from "lucide-react";

const GOLD = "#BF9A3B";
const DARK = "#1A1B17";
const CREAM = "#F5F0E8";
const MUTED = "#9B9B8B";
const CHARCOAL = "#2A2B26";

export default function VendorRFQResponsePage() {
  const params = useParams<{ id: string }>();
  const search = useSearch();
  const rfqId = parseInt(params.id ?? "0");
  const vendorId = parseInt(new URLSearchParams(search).get("vendor") ?? "0");

  const queryInput = useMemo(() => ({ rfqId, vendorId }), [rfqId, vendorId]);
  const { data, isLoading, error } = trpc.vms.rfq.getPublicRFQ.useQuery(queryInput, {
    enabled: rfqId > 0 && vendorId > 0,
  });

  const [amount, setAmount] = useState("");
  const [leadTime, setLeadTime] = useState("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = trpc.vms.rfq.submitBid.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      toast({ title: "Quote submitted successfully!" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast({ title: "Please enter a valid quote amount", variant: "destructive" });
      return;
    }
    submitMutation.mutate({
      rfqId,
      vendorId,
      quotedAmount: parseFloat(amount),
      quotedLeadTimeDays: leadTime ? parseInt(leadTime) : undefined,
      vendorNotes: notes || undefined,
    });
  };

  // Invalid params
  if (!rfqId || !vendorId) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: DARK }}>
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4" style={{ color: "#EF5350" }} />
          <p className="text-lg" style={{ color: CREAM }}>Invalid RFQ link</p>
          <p className="text-sm mt-2" style={{ color: MUTED }}>This link appears to be missing required parameters.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: DARK }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: DARK }}>
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4" style={{ color: "#EF5350" }} />
          <p className="text-lg" style={{ color: CREAM }}>RFQ not found</p>
          <p className="text-sm mt-2" style={{ color: MUTED }}>This RFQ may have been closed or the link is invalid.</p>
        </div>
      </div>
    );
  }

  const { rfq, invitation, vendor } = data;
  const alreadyQuoted = invitation?.status === "quoted" || invitation?.status === "awarded";
  const isClosed = rfq.status === "awarded" || rfq.status === "cancelled";

  // Success state
  if (submitted || alreadyQuoted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: DARK }}>
        <div className="max-w-md w-full text-center">
          <div className="h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ background: "rgba(191,154,59,0.15)", border: "1px solid rgba(191,154,59,0.3)" }}>
            <CheckCircle2 className="h-10 w-10" style={{ color: GOLD }} />
          </div>
          <h2 className="text-2xl font-semibold mb-3" style={{ color: CREAM }}>
            {submitted ? "Quote Submitted!" : "Quote Already Received"}
          </h2>
          <p className="text-base mb-6" style={{ color: MUTED }}>
            {submitted
              ? "Thank you for your quote. Our team will review all submissions and be in touch shortly."
              : `We already have your quote on file${invitation?.quotedAmount ? ` for $${parseFloat(String(invitation.quotedAmount)).toLocaleString()}` : ""}. Thank you!`}
          </p>
          {invitation?.quotedAmount && !submitted && (
            <Card style={{ background: CHARCOAL, border: "1px solid rgba(191,154,59,0.2)" }}>
              <CardContent className="p-4 grid gap-2 text-left">
                <div className="flex justify-between">
                  <span style={{ color: MUTED }}>Your Quote</span>
                  <span className="font-semibold" style={{ color: GOLD }}>${parseFloat(String(invitation.quotedAmount)).toLocaleString()}</span>
                </div>
                {invitation.quotedLeadTimeDays && (
                  <div className="flex justify-between">
                    <span style={{ color: MUTED }}>Lead Time</span>
                    <span style={{ color: CREAM }}>{invitation.quotedLeadTimeDays} days</span>
                  </div>
                )}
                {invitation.vendorNotes && (
                  <div>
                    <span style={{ color: MUTED }}>Your Notes</span>
                    <p className="mt-1 text-sm" style={{ color: CREAM }}>{invitation.vendorNotes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          <p className="text-xs mt-8" style={{ color: MUTED }}>Kitchens Plus Upstate · +1 (833) 518-4811</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: DARK }}>
      {/* Header */}
      <div className="border-b px-6 py-4" style={{ borderColor: "rgba(191,154,59,0.15)" }}>
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="h-8 w-8 rounded flex items-center justify-center"
            style={{ background: "rgba(191,154,59,0.15)" }}>
            <span className="text-sm font-bold" style={{ color: GOLD }}>KP</span>
          </div>
          <span className="font-semibold" style={{ color: CREAM }}>Kitchens Plus Upstate</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Greeting */}
        <div className="mb-8">
          {vendor?.companyName && (
            <p className="text-sm mb-2" style={{ color: MUTED }}>Hello, {vendor.companyName}</p>
          )}
          <h1 className="text-2xl font-semibold mb-2" style={{ color: CREAM }}>
            Request for Quote
          </h1>
          <p className="text-base" style={{ color: MUTED }}>
            Please review the scope below and submit your quote. We'll be in touch after reviewing all submissions.
          </p>
        </div>

        {/* RFQ Details */}
        <Card className="mb-8" style={{ background: CHARCOAL, border: "1px solid rgba(191,154,59,0.2)" }}>
          <CardContent className="p-6 grid gap-4">
            <div>
              <h2 className="text-lg font-semibold mb-1" style={{ color: CREAM }}>{rfq.title}</h2>
              {rfq.scopeOfWork && (
                <p className="text-sm leading-relaxed" style={{ color: MUTED }}>{rfq.scopeOfWork}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
              {rfq.dueDate && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
                  <div>
                    <p className="text-xs" style={{ color: MUTED }}>Quote Due</p>
                    <p className="text-sm font-medium" style={{ color: CREAM }}>
                      {new Date(rfq.dueDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}
              {rfq.budget && (
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
                  <div>
                    <p className="text-xs" style={{ color: MUTED }}>Budget Range</p>
                    <p className="text-sm font-medium" style={{ color: CREAM }}>
                      ${parseFloat(String(rfq.budget)).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {rfq.notes && (
              <div className="pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 mt-0.5 shrink-0" style={{ color: GOLD }} />
                  <div>
                    <p className="text-xs mb-1" style={{ color: MUTED }}>Additional Notes</p>
                    <p className="text-sm" style={{ color: CREAM }}>{rfq.notes}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Closed state */}
        {isClosed ? (
          <Card style={{ background: "rgba(100,100,100,0.1)", border: "1px solid rgba(100,100,100,0.2)" }}>
            <CardContent className="p-6 text-center">
              <AlertTriangle className="h-8 w-8 mx-auto mb-3" style={{ color: MUTED }} />
              <p className="font-medium" style={{ color: CREAM }}>This RFQ is no longer accepting quotes</p>
              <p className="text-sm mt-1" style={{ color: MUTED }}>The bidding period has closed.</p>
            </CardContent>
          </Card>
        ) : (
          /* Quote Form */
          <Card style={{ background: CHARCOAL, border: "1px solid rgba(191,154,59,0.2)" }}>
            <CardContent className="p-6 grid gap-5">
              <h3 className="font-semibold" style={{ color: CREAM }}>Submit Your Quote</h3>

              <div>
                <Label className="mb-1.5 block" style={{ color: MUTED }}>
                  Quote Amount <span style={{ color: "#EF5350" }}>*</span>
                </Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: MUTED }} />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pl-9"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      color: CREAM,
                    }}
                  />
                </div>
              </div>

              <div>
                <Label className="mb-1.5 block" style={{ color: MUTED }}>Lead Time (days)</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="e.g. 14"
                  value={leadTime}
                  onChange={(e) => setLeadTime(e.target.value)}
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: CREAM,
                  }}
                />
              </div>

              <div>
                <Label className="mb-1.5 block" style={{ color: MUTED }}>Notes / Comments</Label>
                <Textarea
                  placeholder="Any questions, clarifications, or additional details about your quote..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="resize-none"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: CREAM,
                  }}
                />
              </div>

              <Button
                onClick={handleSubmit}
                disabled={!amount || submitMutation.isPending}
                className="w-full gap-2 py-6 text-base font-semibold"
                style={{
                  background: "linear-gradient(135deg, #BF9A3B 0%, #D4AF5A 100%)",
                  color: DARK,
                }}
              >
                {submitMutation.isPending ? (
                  <><Loader2 className="h-5 w-5 animate-spin" /> Submitting...</>
                ) : (
                  <><Send className="h-5 w-5" /> Submit Quote</>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-center mt-8" style={{ color: MUTED }}>
          Questions? Contact us at +1 (833) 518-4811
        </p>
      </div>
    </div>
  );
}
