import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle, CalendarDays, Clock, Loader2, RefreshCw } from "lucide-react";

const GOLD = "#BF9A3B";
const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663481717136/NJbAuvnBiksaabdpS5d8M3/kitchensplus_logo_0e432498.webp";

function getParams() {
  const p = new URLSearchParams(window.location.search);
  return { token: p.get("token") ?? "", action: p.get("action") ?? "" };
}

export default function RescheduleConfirm() {
  const { token, action: initialAction } = getParams();
  const [action, setAction] = useState<"confirm" | "reject" | null>(
    initialAction === "confirm" ? "confirm" : initialAction === "reject" ? "reject" : null
  );
  const [rejectMessage, setRejectMessage] = useState("");
  const [done, setDone] = useState(false);
  const [doneStatus, setDoneStatus] = useState<"confirmed" | "rejected" | "already_acted" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: proposal, isLoading } = trpc.meetings.getProposalByToken.useQuery(
    { token },
    { enabled: !!token }
  );

  const confirmMutation = trpc.meetings.confirmProposalByToken.useMutation({
    onSuccess: (data: any) => {
      setDone(true);
      setDoneStatus(data.alreadyActed ? "already_acted" : "confirmed");
    },
    onError: (e: any) => setError(e.message),
  });

  const rejectMutation = trpc.meetings.rejectProposalByToken.useMutation({
    onSuccess: (data: any) => {
      setDone(true);
      setDoneStatus(data.alreadyActed ? "already_acted" : "rejected");
    },
    onError: (e: any) => setError(e.message),
  });

  // Auto-trigger if action is in URL
  useEffect(() => {
    if (!token || !proposal || done) return;
    if (proposal.status !== "pending") {
      setDone(true);
      setDoneStatus("already_acted");
      return;
    }
    if (initialAction === "confirm") {
      confirmMutation.mutate({ token });
    }
    // For reject, we show the form first so they can optionally add a message
  }, [proposal]);

  const proposedDate = proposal?.proposedTime
    ? new Date(proposal.proposedTime).toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
        timeZone: "America/New_York"
      })
    : null;
  const proposedTime = proposal?.proposedTime
    ? new Date(proposal.proposedTime).toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York"
      })
    : null;

  const isPending = confirmMutation.isPending || rejectMutation.isPending;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: "#F9F6F0" }}>
      {/* Header */}
      <div className="w-full max-w-md mb-8 text-center">
        <img src={LOGO_URL} alt="Kitchens Plus Upstate" className="h-12 mx-auto mb-4" />
        <h1 className="font-serif text-2xl text-gray-900">Kitchens Plus Upstate</h1>
        <p className="text-sm tracking-widest uppercase mt-1" style={{ color: GOLD }}>Premium Kitchen Renovations</p>
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Loading */}
        {isLoading && (
          <div className="p-10 flex flex-col items-center gap-3 text-gray-500">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
            <p className="text-sm">Loading your appointment details…</p>
          </div>
        )}

        {/* Not found */}
        {!isLoading && !proposal && !error && (
          <div className="p-10 flex flex-col items-center gap-3 text-center">
            <XCircle className="h-10 w-10 text-red-400" />
            <h2 className="font-serif text-xl text-gray-900">Link Not Found</h2>
            <p className="text-sm text-gray-500">This reschedule link is invalid or has expired. Please contact us directly.</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-10 flex flex-col items-center gap-3 text-center">
            <XCircle className="h-10 w-10 text-red-400" />
            <h2 className="font-serif text-xl text-gray-900">Something went wrong</h2>
            <p className="text-sm text-gray-500">{error}</p>
          </div>
        )}

        {/* Already acted */}
        {done && doneStatus === "already_acted" && (
          <div className="p-10 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="h-10 w-10" style={{ color: GOLD }} />
            <h2 className="font-serif text-xl text-gray-900">Already Responded</h2>
            <p className="text-sm text-gray-500">You've already responded to this reschedule request. Please contact us if you need to make any changes.</p>
          </div>
        )}

        {/* Confirmed */}
        {done && doneStatus === "confirmed" && (
          <div className="p-10 flex flex-col items-center gap-4 text-center">
            <div className="h-16 w-16 rounded-full flex items-center justify-center" style={{ background: "#4CAF7D20" }}>
              <CheckCircle2 className="h-8 w-8" style={{ color: "#4CAF7D" }} />
            </div>
            <h2 className="font-serif text-2xl text-gray-900">Appointment Confirmed!</h2>
            {proposedDate && (
              <div className="rounded-xl p-4 w-full text-left space-y-1" style={{ background: "#F9F6F0", border: "1px solid #BF9A3B40" }}>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Your New Appointment</p>
                <p className="text-lg font-semibold text-gray-900">{proposedDate}</p>
                <p className="text-base text-gray-600">{proposedTime}</p>
              </div>
            )}
            <p className="text-sm text-gray-500">We look forward to meeting with you! You'll receive a confirmation email shortly.</p>
          </div>
        )}

        {/* Rejected */}
        {done && doneStatus === "rejected" && (
          <div className="p-10 flex flex-col items-center gap-4 text-center">
            <div className="h-16 w-16 rounded-full flex items-center justify-center" style={{ background: "#E8A83820" }}>
              <RefreshCw className="h-8 w-8" style={{ color: "#E8A838" }} />
            </div>
            <h2 className="font-serif text-2xl text-gray-900">Request Received</h2>
            <p className="text-sm text-gray-500">We've noted that the proposed time doesn't work for you. Our team will reach out shortly to find a time that works better.</p>
          </div>
        )}

        {/* Active proposal — confirm or reject flow */}
        {!isLoading && proposal && proposal.status === "pending" && !done && (
          <div className="p-8 space-y-6">
            <div>
              <h2 className="font-serif text-xl text-gray-900">Consultation Reschedule Request</h2>
              <p className="text-sm text-gray-500 mt-1">Hi {proposal.leadName?.split(" ")[0] ?? "there"}, we'd like to reschedule your consultation to:</p>
            </div>

            {/* Proposed time card */}
            <div className="rounded-xl p-5 space-y-1" style={{ background: "#F9F6F0", border: "1px solid #BF9A3B40" }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Proposed New Time</p>
              <div className="flex items-center gap-2 mt-2">
                <CalendarDays className="h-5 w-5 shrink-0" style={{ color: GOLD }} />
                <p className="text-lg font-semibold text-gray-900">{proposedDate}</p>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 shrink-0 text-gray-400" />
                <p className="text-base text-gray-600">{proposedTime}</p>
              </div>
              {proposal.note && (
                <p className="text-sm text-gray-500 italic mt-2 pt-2 border-t border-gray-100">"{proposal.note}"</p>
              )}
            </div>

            {/* Reject message (shown when user clicks "Request Another Time") */}
            {action === "reject" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Optional: Let us know your availability</label>
                <Textarea
                  className="border-gray-200 resize-none text-sm"
                  rows={3}
                  value={rejectMessage}
                  onChange={e => setRejectMessage(e.target.value)}
                  placeholder="e.g. I'm available Tuesday or Thursday afternoons…"
                />
              </div>
            )}

            {/* Action buttons */}
            {action !== "reject" ? (
              <div className="flex flex-col gap-3">
                <Button
                  className="w-full h-12 text-base font-semibold gap-2"
                  style={{ background: GOLD, color: "#fff" }}
                  disabled={isPending}
                  onClick={() => confirmMutation.mutate({ token })}
                >
                  {isPending && confirmMutation.isPending
                    ? <Loader2 className="h-5 w-5 animate-spin" />
                    : <CheckCircle2 className="h-5 w-5" />
                  }
                  Confirm This Time
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-11 text-sm gap-2 border-gray-200 text-gray-600"
                  disabled={isPending}
                  onClick={() => setAction("reject")}
                >
                  <RefreshCw className="h-4 w-4" />
                  Request Another Time
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <Button
                  className="w-full h-12 text-base font-semibold gap-2"
                  style={{ background: "#E8A838", color: "#fff" }}
                  disabled={isPending}
                  onClick={() => rejectMutation.mutate({ token, message: rejectMessage.trim() || undefined })}
                >
                  {isPending && rejectMutation.isPending
                    ? <Loader2 className="h-5 w-5 animate-spin" />
                    : <RefreshCw className="h-5 w-5" />
                  }
                  Send Request for Another Time
                </Button>
                <Button
                  variant="ghost"
                  className="w-full h-9 text-sm text-gray-400"
                  disabled={isPending}
                  onClick={() => setAction(null)}
                >
                  ← Back
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="mt-8 text-xs text-gray-400 text-center">
        Questions? Contact us directly · Kitchens Plus Upstate
      </p>
    </div>
  );
}
