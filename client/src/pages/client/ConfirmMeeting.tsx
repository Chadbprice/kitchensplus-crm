import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const LOGO_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663481717136/NJbAuvnBiksaabdpS5d8M3/kitchensplus_logo_0e432498.webp";
const GOLD = "#BF9A3B";

export default function ConfirmMeeting() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const meetingId = parseInt(params.get("meetingId") ?? "0", 10);
  const leadId = parseInt(params.get("leadId") ?? "0", 10);

  const [status, setStatus] = useState<"pending" | "success" | "error">("pending");
  const [scheduledAt, setScheduledAt] = useState("");
  const [clientName, setClientName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const confirmMutation = trpc.clientPortal.confirmMeeting.useMutation({
    onSuccess: (data) => {
      setScheduledAt(data.scheduledAt);
      setClientName(data.clientName);
      setStatus("success");
    },
    onError: (err) => {
      setErrorMsg(err.message);
      setStatus("error");
    },
  });

  useEffect(() => {
    if (meetingId && leadId) {
      confirmMutation.mutate({ meetingId, leadId });
    } else {
      setErrorMsg("Invalid confirmation link. Please contact us at (864) 567-8777.");
      setStatus("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "linear-gradient(160deg, #1E1F1B 0%, #2E2F2A 50%, #31361D 100%)" }}
    >
      {/* Gold accent top bar */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5"
        style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }}
      />

      <div className="w-full max-w-md text-center space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <img src={LOGO_URL} alt="Kitchens Plus Upstate" className="h-16 object-contain" />
          <div className="w-12 h-0.5" style={{ background: GOLD }} />
        </div>

        {/* State: pending */}
        {status === "pending" && (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin" style={{ color: GOLD }} />
            <p className="text-lg font-serif" style={{ color: "#F5EDE7" }}>
              Confirming your appointment…
            </p>
          </div>
        )}

        {/* State: success */}
        {status === "success" && (
          <div className="flex flex-col items-center gap-6">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: "#4CAF7D20", border: "2px solid #4CAF7D" }}
            >
              <CheckCircle className="h-10 w-10" style={{ color: "#4CAF7D" }} />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-serif" style={{ color: "#F5EDE7" }}>
                You're Confirmed!
              </h1>
              {clientName && (
                <p className="text-base" style={{ color: "#BF9A3B" }}>
                  Thank you, {clientName.split(" ")[0]}
                </p>
              )}
              {scheduledAt && (
                <p className="text-sm leading-relaxed" style={{ color: "#C8C0A8" }}>
                  We'll see you on{" "}
                  <strong style={{ color: "#F5EDE7" }}>{scheduledAt}</strong>.
                </p>
              )}
            </div>
            <div
              className="w-full rounded-xl p-5 text-left space-y-2"
              style={{ background: "#2E2F2A", border: "1px solid #BF9A3B40" }}
            >
              <p className="text-xs uppercase tracking-widest" style={{ color: "#888" }}>
                What to expect
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "#C8C0A8" }}>
                We'll walk through your space, discuss your vision, and answer any questions. There's no obligation — just a friendly conversation about how we can help.
              </p>
            </div>
            <div className="space-y-1 text-sm" style={{ color: "#888" }}>
              <p>
                Questions? Text us:{" "}
                <a href="tel:8645678777" style={{ color: GOLD }}>
                  (864) 567-8777
                </a>
              </p>
              <p>
                Urgent? Call Chad:{" "}
                <a href="tel:8645678777" style={{ color: "#F5EDE7" }}>
                  (864) 567-8777
                </a>
              </p>
            </div>
          </div>
        )}

        {/* State: error */}
        {status === "error" && (
          <div className="flex flex-col items-center gap-6">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: "#E0525220", border: "2px solid #E05252" }}
            >
              <XCircle className="h-10 w-10" style={{ color: "#E05252" }} />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-serif" style={{ color: "#F5EDE7" }}>
                Something went wrong
              </h1>
              <p className="text-sm" style={{ color: "#C8C0A8" }}>
                {errorMsg || "We couldn't confirm your appointment."}
              </p>
            </div>
            <div className="space-y-1 text-sm" style={{ color: "#888" }}>
              <p>
                Please contact us directly:{" "}
                <a href="tel:8645678777" style={{ color: GOLD }}>
                  (864) 567-8777
                </a>
              </p>
            </div>
            <Button
              variant="outline"
              className="border-border/60"
              onClick={() => window.location.reload()}
            >
              Try Again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
