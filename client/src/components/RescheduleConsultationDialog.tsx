import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CalendarDays, Clock, RefreshCw, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const GOLD = "#BF9A3B";

interface Props {
  lead: any;
  onClose: () => void;
  onSubmit: (meetingId: number, proposedTime: string, note?: string) => void;
  isPending: boolean;
}

export default function RescheduleConsultationDialog({ lead, onClose, onSubmit, isPending }: Props) {
  const [proposedDate, setProposedDate] = useState("");
  const [proposedTime, setProposedTime] = useState("09:00");
  const [meetingLength, setMeetingLength] = useState("60");
  const [note, setNote] = useState("");

  const meeting = lead.latestMeeting;

  // Build ISO string from date + time inputs
  const proposedISO = proposedDate && proposedTime
    ? new Date(`${proposedDate}T${proposedTime}:00`).toISOString()
    : null;

  const currentTimeStr = meeting?.scheduledAt
    ? new Date(meeting.scheduledAt).toLocaleString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York"
      })
    : null;

  const proposedDisplayStr = proposedISO
    ? new Date(proposedISO).toLocaleString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York"
      })
    : null;

  function handleSubmit() {
    if (!proposedISO || !meeting?.id) return;
    onSubmit(meeting.id, proposedISO, note.trim() || undefined);
  }

  // Get today's date as min for the date picker
  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <RefreshCw className="h-5 w-5" style={{ color: "#9B59B6" }} />
            Reschedule Consultation
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Propose a new consultation time for <strong>{lead.name}</strong>. They'll receive an SMS and email with a confirm/reject link.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Current appointment */}
          {currentTimeStr && (
            <div className="rounded-lg p-3 flex items-start gap-3"
              style={{ background: "#E8A83810", border: "1px solid #E8A83840" }}>
              <CalendarDays className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#E8A838" }} />
              <div>
                <p className="text-xs font-semibold" style={{ color: "#E8A838" }}>Current Appointment</p>
                <p className="text-sm text-foreground mt-0.5">{currentTimeStr}</p>
              </div>
            </div>
          )}

          {/* New proposed date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" /> New Date <span className="text-destructive">*</span>
              </Label>
              <input
                type="date"
                min={todayStr}
                value={proposedDate}
                onChange={e => setProposedDate(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> New Time <span className="text-destructive">*</span>
              </Label>
              <input
                type="time"
                value={proposedTime}
                onChange={e => setProposedTime(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Proposed time preview */}
          {proposedDisplayStr && (
            <div className="rounded-lg p-3 flex items-start gap-3"
              style={{ background: "#9B59B610", border: "1px solid #9B59B640" }}>
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#9B59B6" }} />
              <div>
                <p className="text-xs font-semibold" style={{ color: "#9B59B6" }}>Proposed New Time</p>
                <p className="text-sm text-foreground mt-0.5">{proposedDisplayStr}</p>
              </div>
            </div>
          )}

          {/* Meeting Length */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Meeting Length
            </Label>
            <Select value={meetingLength} onValueChange={setMeetingLength}>
              <SelectTrigger className="bg-background border-border w-48">
                <SelectValue placeholder="Duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">0 min</SelectItem>
                <SelectItem value="15">15 min</SelectItem>
                <SelectItem value="30">30 min</SelectItem>
                <SelectItem value="60">60 min</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Optional note */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Optional Note to Client</Label>
            <Textarea
              className="bg-background border-border resize-none"
              rows={3}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. We had a scheduling conflict on our end — so sorry for the inconvenience!"
            />
          </div>

          {/* Contact info summary */}
          <div className="rounded-lg p-3 bg-accent/20 text-xs text-muted-foreground space-y-0.5">
            <p className="font-medium text-foreground mb-1">Notification will be sent to:</p>
            {lead.email && <p>✉ {lead.email}</p>}
            {lead.email2 && <p>✉ {lead.email2}</p>}
            {lead.email3 && <p>✉ {lead.email3}</p>}
            {lead.phone && <p>📱 {lead.phone}</p>}
            {lead.phone2 && <p>📱 {lead.phone2}</p>}
            {!lead.email && !lead.email2 && !lead.phone && !lead.phone2 && (
              <p className="text-destructive">No contact info on file — proposal will be saved but not sent.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            className="gap-1.5 font-semibold"
            style={{ background: "#9B59B6", color: "#fff" }}
            disabled={!proposedISO || !meeting?.id || isPending}
            onClick={handleSubmit}
          >
            {isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
              : <><RefreshCw className="h-4 w-4" /> Send Reschedule Proposal</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
