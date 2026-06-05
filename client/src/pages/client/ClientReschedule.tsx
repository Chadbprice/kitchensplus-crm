import { useState, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Calendar, Clock, Plus, Trash2, CheckCircle2, ArrowLeft } from "lucide-react";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663481717136/NJbAuvnBiksaabdpS5d8M3/kitchensplus_logo_0e432498.webp";
const GOLD = "#BF9A3B";

// Build hour options (12-hour format)
const HOURS = Array.from({ length: 12 }, (_, i) => {
  const h = i + 8; // 8am to 7pm
  const label = h < 12 ? `${h}:00 AM` : h === 12 ? "12:00 PM" : `${h - 12}:00 PM`;
  return { value: h, label };
});

const MINUTES = [
  { value: 0, label: ":00" },
  { value: 15, label: ":15" },
  { value: 30, label: ":30" },
  { value: 45, label: ":45" },
];

function DateTimePicker({
  label,
  value,
  onChange,
  onRemove,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onRemove?: () => void;
  required?: boolean;
}) {
  const [date, setDate] = useState(() => {
    if (value) return value.split("T")[0];
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  });
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);

  const buildISO = (d: string, h: number, m: number) => {
    if (!d) return "";
    const dt = new Date(`${d}T00:00:00`);
    dt.setHours(h, m, 0, 0);
    return dt.toISOString();
  };

  const handleChange = (d: string, h: number, m: number) => {
    setDate(d);
    setHour(h);
    setMinute(m);
    onChange(buildISO(d, h, m));
  };

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4" style={{ color: GOLD }} />
            {label}
          </span>
          {!required && onRemove && (
            <button onClick={onRemove} className="text-muted-foreground hover:text-destructive transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <input
            type="date"
            value={date}
            min={new Date().toISOString().split("T")[0]}
            onChange={(e) => handleChange(e.target.value, hour, minute)}
            className="col-span-3 sm:col-span-1 rounded-md border border-border bg-background text-foreground text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <select
            value={hour}
            onChange={(e) => handleChange(date, Number(e.target.value), minute)}
            className="rounded-md border border-border bg-background text-foreground text-sm px-2 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {HOURS.map((h) => (
              <option key={h.value} value={h.value}>{h.label}</option>
            ))}
          </select>
          <select
            value={minute}
            onChange={(e) => handleChange(date, hour, Number(e.target.value))}
            className="rounded-md border border-border bg-background text-foreground text-sm px-2 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {MINUTES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>
            {date ? new Date(buildISO(date, hour, minute)).toLocaleString("en-US", {
              weekday: "long", month: "long", day: "numeric", year: "numeric",
              hour: "numeric", minute: "2-digit",
            }) : "Pick a date"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ClientReschedule() {
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const meetingId = Number(params.get("meetingId") ?? 0);
  const consultationDate = params.get("date") ?? "your scheduled consultation";
  // Phone is validated server-side via the client session cookie — no need to pass it here
  const phone = ""; // server uses kp_client_session cookie to identify the client
  const [, setLocation] = useLocation();
  const [time1, setTime1] = useState("");
  const [time2, setTime2] = useState("");
  const [time3, setTime3] = useState("");
  const [showTime2, setShowTime2] = useState(false);
  const [showTime3, setShowTime3] = useState(false);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submitReschedule = trpc.clientPortal.submitReschedule.useMutation({
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (e) => {
      toast.error(e.message ?? "Failed to submit. Please call us at (864) 567-8777.");
    },
  });

  const handleSubmit = () => {
    if (!time1) {
      toast.error("Please select at least one preferred time.");
      return;
    }
    submitReschedule.mutate({
      meetingId,
      suggestedTime1: time1,
      suggestedTime2: showTime2 && time2 ? time2 : undefined,
      suggestedTime3: showTime3 && time3 ? time3 : undefined,
      clientMessage: message.trim() || undefined,
    });
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--kp-charcoal-dark)" }}>
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: `${GOLD}20`, border: `2px solid ${GOLD}` }}>
              <CheckCircle2 className="h-8 w-8" style={{ color: GOLD }} />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-serif mb-2" style={{ color: "var(--kp-cream)" }}>Request Sent!</h1>
            <p className="text-sm text-muted-foreground">
              We've received your reschedule request and will be in touch shortly to confirm your new time.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Questions? Call us at{" "}
            <a href="tel:8645678777" style={{ color: GOLD }} className="hover:underline">(864) 567-8777</a>
          </p>
          <Button
            onClick={() => setLocation("/client/project")}
            className="w-full btn-gold font-semibold"
          >
            Back to My Portal
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: "var(--kp-charcoal-dark)" }}>
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col items-center gap-4 text-center">
          <img src={LOGO_URL} alt="Kitchens Plus Upstate" className="h-12 object-contain" />
          <div>
            <h1 className="text-2xl font-serif" style={{ color: "var(--kp-cream)" }}>Request a Reschedule</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your consultation is currently scheduled for{" "}
              <span style={{ color: GOLD }}>{consultationDate}</span>.
              Suggest up to 3 alternative times below.
            </p>
          </div>
        </div>

        {/* Time pickers */}
        <div className="space-y-3">
          <DateTimePicker
            label="Preferred Time"
            value={time1}
            onChange={setTime1}
            required
          />
          {showTime2 && (
            <DateTimePicker
              label="Alternative Time 2"
              value={time2}
              onChange={setTime2}
              onRemove={() => { setShowTime2(false); setTime2(""); }}
            />
          )}
          {showTime3 && (
            <DateTimePicker
              label="Alternative Time 3"
              value={time3}
              onChange={setTime3}
              onRemove={() => { setShowTime3(false); setTime3(""); }}
            />
          )}
          {!showTime2 && (
            <button
              onClick={() => setShowTime2(true)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-4 w-4" style={{ color: GOLD }} />
              Add alternative time
            </button>
          )}
          {showTime2 && !showTime3 && (
            <button
              onClick={() => setShowTime3(true)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-4 w-4" style={{ color: GOLD }} />
              Add another alternative
            </button>
          )}
        </div>

        {/* Optional message */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Message (optional)</label>
          <Textarea
            placeholder="Any notes for the team — e.g., 'Morning works best' or 'Please avoid Fridays'"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="bg-card border-border text-foreground placeholder:text-muted-foreground resize-none"
          />
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Button
            onClick={handleSubmit}
            disabled={!time1 || submitReschedule.isPending}
            className="w-full btn-gold font-semibold"
          >
            {submitReschedule.isPending ? "Submitting…" : "Submit Reschedule Request"}
          </Button>
          <button
            onClick={() => setLocation("/client/project")}
            className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to my portal
          </button>
        </div>
      </div>
    </div>
  );
}
