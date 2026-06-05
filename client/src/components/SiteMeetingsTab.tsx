import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  CalendarDays,
  MapPin,
  Clock,
  MoreVertical,
  Plus,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  CalendarX,
} from "lucide-react";

// ─── types ────────────────────────────────────────────────────────────────────

type SiteMeeting = {
  id: number;
  projectId: number;
  clientId: number | null;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date;
  location: string | null;
  status: "scheduled" | "completed" | "canceled" | "rescheduled";
  gcalEventId: string | null;
  gcalHtmlLink: string | null;
  gcalSyncError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(dt: Date) {
  return new Date(dt).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatTime(dt: Date) {
  return new Date(dt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function toLocalDatetimeInput(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDatetimeInput(s: string): number {
  return new Date(s).getTime();
}

function statusBadge(status: SiteMeeting["status"]) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    scheduled: { label: "Scheduled", variant: "default" },
    completed: { label: "Completed", variant: "secondary" },
    canceled: { label: "Canceled", variant: "destructive" },
    rescheduled: { label: "Rescheduled", variant: "outline" },
  };
  const { label, variant } = map[status] ?? { label: status, variant: "outline" };
  return <Badge variant={variant}>{label}</Badge>;
}

// ─── Schedule / Edit form ─────────────────────────────────────────────────────

interface MeetingFormProps {
  open: boolean;
  onClose: () => void;
  projectId: number;
  projectName: string;
  projectAddress?: string | null;
  existing?: SiteMeeting;
  onSuccess: () => void;
}

function MeetingFormDialog({
  open,
  onClose,
  projectId,
  projectName,
  projectAddress,
  existing,
  onSuccess,
}: MeetingFormProps) {
  const isEdit = !!existing;

  const now = Date.now();
  const defaultStart = existing
    ? new Date(existing.startTime).getTime()
    : (() => {
        const d = new Date();
        d.setMinutes(0, 0, 0);
        d.setHours(d.getHours() + 1);
        return d.getTime();
      })();
  const defaultDuration = existing
    ? Math.round((new Date(existing.endTime).getTime() - new Date(existing.startTime).getTime()) / 60_000)
    : 60;

  const [title, setTitle] = useState(existing?.title ?? `Site Meeting — ${projectName}`);
  const [description, setDescription] = useState(existing?.description ?? "");
  const [startInput, setStartInput] = useState(toLocalDatetimeInput(defaultStart));
  const [durationMin, setDurationMin] = useState(String(defaultDuration));
  const [location, setLocation] = useState(existing?.location ?? projectAddress ?? "");

  const createMutation = trpc.siteMeetings.create.useMutation();
  const updateMutation = trpc.siteMeetings.update.useMutation();

  const saving = createMutation.isPending || updateMutation.isPending;

  async function handleSave() {
    const startTime = fromLocalDatetimeInput(startInput);
    const dur = parseInt(durationMin, 10);
    // If 0 min selected, set endTime 1 min after start to satisfy DB/GCal constraints
    const endTime = startTime + (dur > 0 ? dur : 1) * 60_000;
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    try {
      if (isEdit && existing) {
        const res = await updateMutation.mutateAsync({
          id: existing.id,
          title: title.trim(),
          description: description.trim() || undefined,
          startTime,
          endTime,
          location: location.trim() || undefined,
          status: existing.status === "scheduled" ? "rescheduled" : existing.status,
        });
        if (!res.gcalOk) {
          toast.warning("Meeting updated", { description: "Google Calendar sync failed — you can retry from the meeting card." });
        } else {
          toast.success("Meeting updated and synced to Google Calendar");
        }
      } else {
        const res = await createMutation.mutateAsync({
          projectId,
          title: title.trim(),
          description: description.trim() || undefined,
          startTime,
          endTime,
          location: location.trim() || undefined,
        });
        if (!res.gcalOk) {
          toast.warning("Meeting scheduled", { description: "Google Calendar sync failed — you can retry from the meeting card." });
        } else {
          toast.success("Meeting scheduled and added to Google Calendar");
        }
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error("Failed to save meeting", { description: err.message });
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Site Meeting" : "Schedule Site Meeting"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="sm-title">Title</Label>
            <Input
              id="sm-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={`Site Meeting — ${projectName}`}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sm-start">Date & Time</Label>
              <Input
                id="sm-start"
                type="datetime-local"
                value={startInput}
                onChange={e => setStartInput(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Meeting Length</Label>
              <Select value={durationMin} onValueChange={setDurationMin}>
                <SelectTrigger className="bg-background border-border">
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
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sm-location">Location</Label>
            <Input
              id="sm-location"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder={projectAddress ?? "Job site address"}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sm-notes">Notes / Agenda</Label>
            <Textarea
              id="sm-notes"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Meeting agenda, topics to discuss, access instructions…"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Schedule Meeting"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Meeting card ─────────────────────────────────────────────────────────────

interface MeetingCardProps {
  meeting: SiteMeeting;
  projectName: string;
  projectAddress?: string | null;
  projectId: number;
  onRefresh: () => void;
}

function MeetingCard({ meeting, projectName, projectAddress, projectId, onRefresh }: MeetingCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);

  const cancelMutation = trpc.siteMeetings.cancel.useMutation();
  const retrySyncMutation = trpc.siteMeetings.retrySync.useMutation();

  const isCanceled = meeting.status === "canceled";
  const hasSyncError = !!meeting.gcalSyncError;
  const isSynced = !!meeting.gcalEventId && !hasSyncError;

  async function handleCancel() {
    try {
      await cancelMutation.mutateAsync({ id: meeting.id });
      toast.success("Meeting canceled");
      onRefresh();
    } catch (err: any) {
      toast.error("Failed to cancel", { description: err.message });
    }
  }

  async function handleRetrySync() {
    try {
      const res = await retrySyncMutation.mutateAsync({ id: meeting.id });
      if (res.gcalOk) {
        toast.success("Synced to Google Calendar");
      } else {
        toast.error("Sync failed again", { description: res.gcalError });
      }
      onRefresh();
    } catch (err: any) {
      toast.error("Sync error", { description: err.message });
    }
  }

  return (
    <>
      <Card className={`border-border bg-card transition-opacity ${isCanceled ? "opacity-60" : ""}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-medium text-sm text-card-foreground truncate">{meeting.title}</span>
                {statusBadge(meeting.status)}
                {isSynced && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-3 h-3" />
                    Synced
                  </span>
                )}
                {hasSyncError && (
                  <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <AlertCircle className="w-3 h-3" />
                    Sync failed
                  </span>
                )}
              </div>
              <div className="space-y-1 mt-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                  <span>{formatDateTime(meeting.startTime)}</span>
                  <span className="text-muted-foreground/60">→</span>
                  <span>{formatTime(meeting.endTime)}</span>
                </div>
                {meeting.location && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{meeting.location}</span>
                  </div>
                )}
                {meeting.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{meeting.description}</p>
                )}
              </div>
              {/* GCal error + retry */}
              {hasSyncError && !isCanceled && (
                <div className="mt-2 flex items-center gap-2">
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex-1 truncate">
                    {meeting.gcalSyncError}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs px-2 gap-1"
                    onClick={handleRetrySync}
                    disabled={retrySyncMutation.isPending}
                  >
                    <RefreshCw className="w-3 h-3" />
                    Retry sync
                  </Button>
                </div>
              )}
              {/* GCal link */}
              {meeting.gcalHtmlLink && !isCanceled && (
                <a
                  href={meeting.gcalHtmlLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  View in Google Calendar
                </a>
              )}
            </div>
            {/* Actions menu */}
            {!isCanceled && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditOpen(true)}>
                    Edit / Reschedule
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setCancelConfirm(true)}
                  >
                    Cancel Meeting
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      {editOpen && (
        <MeetingFormDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          projectId={projectId}
          projectName={projectName}
          projectAddress={projectAddress}
          existing={meeting}
          onSuccess={onRefresh}
        />
      )}

      {/* Cancel confirm */}
      <AlertDialog open={cancelConfirm} onOpenChange={setCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this meeting?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the meeting as canceled and remove it from Google Calendar. The record
              will remain visible in the CRM for reference.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Meeting</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleCancel}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? "Canceling…" : "Cancel Meeting"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Main tab component ───────────────────────────────────────────────────────

interface SiteMeetingsTabProps {
  projectId: number;
  projectName: string;
  projectAddress?: string | null;
}

export function SiteMeetingsTab({ projectId, projectName, projectAddress }: SiteMeetingsTabProps) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data: meetings = [], isLoading } = trpc.siteMeetings.list.useQuery({ projectId });

  function refresh() {
    utils.siteMeetings.list.invalidate({ projectId });
  }

  const now = Date.now();
  const upcoming = meetings.filter(
    m => m.status !== "canceled" && new Date(m.startTime).getTime() >= now
  );
  const past = meetings.filter(
    m => m.status === "completed" || (m.status !== "canceled" && new Date(m.startTime).getTime() < now)
  );
  const canceled = meetings.filter(m => m.status === "canceled");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Site Meetings</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            On-site meetings with the client — synced to Google Calendar
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setScheduleOpen(true)}>
          <Plus className="w-4 h-4" />
          Schedule Site Meeting
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Upcoming */}
          <section>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Upcoming ({upcoming.length})
            </h4>
            {upcoming.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-border rounded-lg">
                <CalendarDays className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No upcoming site meetings</p>
                <Button
                  variant="link"
                  size="sm"
                  className="mt-1 text-xs"
                  onClick={() => setScheduleOpen(true)}
                >
                  Schedule one now
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {upcoming.map(m => (
                  <MeetingCard
                    key={m.id}
                    meeting={m as SiteMeeting}
                    projectName={projectName}
                    projectAddress={projectAddress}
                    projectId={projectId}
                    onRefresh={refresh}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Past */}
          {past.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Past ({past.length})
              </h4>
              <div className="space-y-3">
                {past.map(m => (
                  <MeetingCard
                    key={m.id}
                    meeting={m as SiteMeeting}
                    projectName={projectName}
                    projectAddress={projectAddress}
                    projectId={projectId}
                    onRefresh={refresh}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Canceled */}
          {canceled.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Canceled ({canceled.length})
              </h4>
              <div className="space-y-3">
                {canceled.map(m => (
                  <MeetingCard
                    key={m.id}
                    meeting={m as SiteMeeting}
                    projectName={projectName}
                    projectAddress={projectAddress}
                    projectId={projectId}
                    onRefresh={refresh}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Schedule dialog */}
      {scheduleOpen && (
        <MeetingFormDialog
          open={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
          projectId={projectId}
          projectName={projectName}
          projectAddress={projectAddress}
          onSuccess={refresh}
        />
      )}
    </div>
  );
}
