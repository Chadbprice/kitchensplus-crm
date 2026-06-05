import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, ChevronRight, CalendarDays, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Status colours
const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  scheduled:  { bg: "rgba(91,155,213,0.18)",  text: "#5B9BD5", dot: "#5B9BD5" },
  confirmed:  { bg: "rgba(76,175,125,0.18)",  text: "#4CAF7D", dot: "#4CAF7D" },
  completed:  { bg: "rgba(120,120,120,0.14)", text: "#888",    dot: "#888" },
  cancelled:  { bg: "rgba(220,60,60,0.14)",   text: "#e05555", dot: "#e05555" },
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW    = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

export function FirstContactCalendar() {
  const today = useMemo(() => new Date(), []);
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed

  const utils = trpc.useUtils();
  const { data: allMeetings = [], isLoading } = trpc.meetings.listAll.useQuery(undefined, {
    staleTime: 2 * 60_000,
  });

  const markCompleted = trpc.meetings.updateStatus.useMutation({
    onMutate: async ({ id }) => {
      // Optimistic update: flip the meeting to completed in the cache
      await utils.meetings.listAll.cancel();
      const prev = utils.meetings.listAll.getData();
      utils.meetings.listAll.setData(undefined, (old) =>
        (old ?? []).map(m => m.id === id ? { ...m, status: "completed" } : m)
      );
      // Also update the tooltip state so the badge changes immediately
      setTooltip(t => t
        ? { ...t, meetings: t.meetings.map(m => m.id === id ? { ...m, status: "completed" } : m) }
        : null
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.meetings.listAll.setData(undefined, ctx.prev);
      toast.error("Could not mark meeting as completed");
    },
    onSuccess: () => {
      toast.success("Meeting marked as completed");
    },
    onSettled: () => {
      utils.meetings.listAll.invalidate();
    },
  });

  // Meetings indexed by "YYYY-MM-DD" for fast lookup
  const byDay = useMemo(() => {
    const map: Record<string, typeof allMeetings> = {};
    for (const m of allMeetings) {
      if (!m.scheduledAt) continue;
      const d = new Date(m.scheduledAt);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      if (!map[key]) map[key] = [];
      map[key].push(m);
    }
    return map;
  }, [allMeetings]);

  // Calendar grid
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  function prev() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function next() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  // Tooltip state
  const [tooltip, setTooltip] = useState<{ day: number; meetings: typeof allMeetings } | null>(null);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-[#BF9A3B]" />
          <span className="text-sm font-semibold text-foreground">
            {MONTHS[month]} {year}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={prev}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] text-muted-foreground"
            onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}
          >
            Today
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={next}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DOW.map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-0.5">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="grid grid-cols-7 gap-px flex-1">
          {cells.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} className="rounded-md" />;
            }
            const key = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const dayMeetings = byDay[key] ?? [];
            const cellDate = new Date(year, month, day);
            const isPast   = cellDate < today && !isSameDay(cellDate, today);
            const isToday  = isSameDay(cellDate, today);

            return (
              <div
                key={key}
                className={[
                  "relative rounded-md p-0.5 min-h-[44px] flex flex-col transition-colors",
                  isToday ? "ring-1 ring-[#BF9A3B]/60 bg-[#BF9A3B]/08" : "",
                  isPast  ? "opacity-60" : "",
                  dayMeetings.length > 0 ? "cursor-pointer hover:bg-accent/30" : "",
                ].join(" ")}
                onClick={() => dayMeetings.length > 0 && setTooltip(t => t?.day === day ? null : { day, meetings: dayMeetings })}
              >
                {/* Day number */}
                <span className={[
                  "text-[11px] font-medium leading-none px-1 pt-0.5",
                  isToday ? "text-[#BF9A3B]" : "text-muted-foreground",
                ].join(" ")}>
                  {day}
                </span>

                {/* Meeting chips */}
                <div className="flex flex-col gap-0.5 mt-0.5 px-0.5">
                  {dayMeetings.slice(0, 2).map(m => {
                    const col = STATUS_COLORS[m.status] ?? STATUS_COLORS.scheduled;
                    const timeStr = m.scheduledAt
                      ? new Date(m.scheduledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                      : "";
                    return (
                      <div
                        key={m.id}
                        className="rounded px-1 py-0.5 text-[9px] font-medium leading-tight truncate"
                        style={{ background: col.bg, color: col.text }}
                        title={`${m.leadName ?? "Unknown"} · ${timeStr} · ${m.status}`}
                      >
                        {m.leadName?.split(" ")[0] ?? "—"} {timeStr}
                      </div>
                    );
                  })}
                  {dayMeetings.length > 2 && (
                    <div className="text-[9px] text-muted-foreground px-1">+{dayMeetings.length - 2} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tooltip / popover for clicked day */}
      {tooltip && (
        <div className="mt-3 rounded-xl border border-border bg-card p-3 space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">
              {MONTHS[month]} {tooltip.day}
            </span>
            <button onClick={() => setTooltip(null)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
          </div>
          {tooltip.meetings.map(m => {
            const col = STATUS_COLORS[m.status] ?? STATUS_COLORS.scheduled;
            const timeStr = m.scheduledAt
              ? new Date(m.scheduledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
              : "Time TBD";
            const canComplete = m.status === "scheduled" || m.status === "confirmed";
            const isMarkingThis = markCompleted.isPending && (markCompleted.variables as any)?.id === m.id;
            return (
              <div key={m.id} className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full flex-shrink-0" style={{ background: col.dot }} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">{m.leadName ?? "Unknown"}</p>
                  <p className="text-[11px] text-muted-foreground">{timeStr} · {m.assignee ?? "Chad"}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span
                      className="inline-block rounded-full px-1.5 py-px text-[9px] font-semibold capitalize"
                      style={{ background: col.bg, color: col.text }}
                    >
                      {m.status}
                    </span>
                    {canComplete && (
                      <button
                        disabled={isMarkingThis}
                        onClick={(e) => {
                          e.stopPropagation();
                          markCompleted.mutate({ id: m.id, status: "completed" });
                        }}
                        className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[9px] font-semibold transition-colors"
                        style={{
                          background: "rgba(76,175,125,0.15)",
                          color: "#4CAF7D",
                          border: "1px solid rgba(76,175,125,0.35)",
                          cursor: isMarkingThis ? "not-allowed" : "pointer",
                          opacity: isMarkingThis ? 0.6 : 1,
                        }}
                        title="Mark this meeting as completed"
                      >
                        {isMarkingThis
                          ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          : <CheckCircle2 className="h-2.5 w-2.5" />
                        }
                        Mark Done
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mt-3 pt-2 border-t border-border">
        {Object.entries(STATUS_COLORS).map(([status, col]) => (
          <span key={status} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: col.dot }} />
            <span className="capitalize">{status}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
