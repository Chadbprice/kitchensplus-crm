/**
 * Schedule.tsx — Professional Gantt Chart
 * Smartsheet/Monday.com quality with:
 *  - Layer 1: Proposal bars (semi-transparent gold)
 *  - Layer 2: Project bars (solid, per-client color)
 *  - Layer 3: Milestone diamonds on project bars
 *  - Day/Week/Month/Quarter views with zoom
 *  - Drag-to-reschedule with snap, tooltip, undo toast
 *  - Collapsible milestone rows in left panel
 *  - Add Event drawer, Export PDF, row virtualization
 */
import {
  useState, useRef, useCallback, useEffect, useMemo, memo,
} from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, ChevronDown,
  ChevronRight as ChevronRightIcon,
  Plus, Download, ZoomIn, ZoomOut, Calendar, Target,
  FileText, FolderOpen, X,
} from "lucide-react";
import {
  format, addDays, addWeeks, addMonths, addQuarters,
  startOfWeek, startOfMonth, startOfQuarter,
  differenceInDays, isWeekend, isSameDay,
  formatISO,
} from "date-fns";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/useMobile";

// ─── Constants ────────────────────────────────────────────────────────────────
const GOLD = "#C9A84C";
const SIDEBAR_W = 300;
const ROW_H = 40;
const HEADER_H = 56;
const MIN_BAR_W = 6;

const MS_COLORS: Record<string, string> = {
  completed: "#4CAF7D",
  in_progress: "#E8A838",
  overdue: "#E05252",
  pending: "#888",
};

type ViewMode = "day" | "week" | "month" | "quarter";

// ─── Types ────────────────────────────────────────────────────────────────────
type GanttProject = {
  id: number; name: string; color: string; status: string;
  startDate?: Date | string | null; estimatedEndDate?: Date | string | null;
  clientName?: string | null; leadId?: number | null; clientId?: number | null;
  percentComplete?: number | null;
};
type GanttProposal = {
  id: number; clientName?: string | null; color: string; status: string;
  createdAt?: Date | string | null; validUntil?: Date | string | null;
  totalAmount?: number | null; estimateNumber?: string | null;
};
type GanttMilestone = {
  id: number; projectId: number; title: string; status: string;
  dueDate?: Date | string | null; percentComplete?: number | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function fmtDate(d: Date | null) {
  if (!d) return "—";
  return format(d, "MMM d, yyyy");
}
function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Timeline column generator ────────────────────────────────────────────────
function getColumns(viewStart: Date, viewMode: ViewMode, zoom: number) {
  const today = new Date();
  const baseWidths: Record<ViewMode, number> = { day: 40, week: 120, month: 80, quarter: 200 };
  const colWidth = Math.round(baseWidths[viewMode] * zoom);
  const count = 60;
  const cols: Array<{
    date: Date; label: string; isWeekend: boolean; isToday: boolean; isCurrentPeriod: boolean;
  }> = [];
  for (let i = 0; i < count; i++) {
    let date: Date;
    let label: string;
    if (viewMode === "day") { date = addDays(viewStart, i); label = format(date, "d"); }
    else if (viewMode === "week") { date = addWeeks(viewStart, i); label = `W${format(date, "w")} ${format(date, "MMM d")}`; }
    else if (viewMode === "month") { date = addMonths(viewStart, i); label = format(date, "MMM yyyy"); }
    else { date = addQuarters(viewStart, i); label = `Q${format(date, "Q")} ${format(date, "yyyy")}`; }
    const weekend = viewMode === "day" ? isWeekend(date) : false;
    const isToday = viewMode === "day" ? isSameDay(date, today) : false;
    let isCurrentPeriod = false;
    if (viewMode === "week") isCurrentPeriod = isSameDay(startOfWeek(today), date);
    if (viewMode === "month") isCurrentPeriod = isSameDay(startOfMonth(today), startOfMonth(date));
    if (viewMode === "quarter") isCurrentPeriod = isSameDay(startOfQuarter(today), startOfQuarter(date));
    cols.push({ date, label, isWeekend: weekend, isToday, isCurrentPeriod });
  }
  return { cols, colWidth };
}

function dateToX(date: Date | null, viewStart: Date, colWidth: number, viewMode: ViewMode): number | null {
  if (!date) return null;
  let diff: number;
  if (viewMode === "day") diff = differenceInDays(date, viewStart);
  else if (viewMode === "week") diff = differenceInDays(date, viewStart) / 7;
  else if (viewMode === "month") diff = differenceInDays(date, viewStart) / 30.44;
  else diff = differenceInDays(date, viewStart) / 91.31;
  return diff * colWidth;
}

function xToDate(x: number, viewStart: Date, colWidth: number, viewMode: ViewMode): Date {
  let days: number;
  if (viewMode === "day") days = Math.round(x / colWidth);
  else if (viewMode === "week") days = Math.round((x / colWidth) * 7);
  else if (viewMode === "month") days = Math.round((x / colWidth) * 30.44);
  else days = Math.round((x / colWidth) * 91.31);
  return addDays(viewStart, days);
}

// ─── Milestone Diamond ────────────────────────────────────────────────────────
const MilestoneDiamond = memo(function MilestoneDiamond({
  ms, x, rowH, onEdit,
}: { ms: GanttMilestone; x: number; rowH: number; onEdit: (ms: GanttMilestone) => void }) {
  const [hover, setHover] = useState(false);
  const color = MS_COLORS[ms.status] ?? MS_COLORS.pending;
  const size = 10;
  return (
    <g
      transform={`translate(${x}, ${rowH / 2})`}
      style={{ cursor: "pointer" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onEdit(ms)}
    >
      <polygon points={`0,${-size} ${size},0 0,${size} ${-size},0`} fill={color} stroke="#fff" strokeWidth={1.5} />
      {hover && (
        <foreignObject x={size + 4} y={-32} width={190} height={70} style={{ overflow: "visible" }}>
          <div style={{
            background: "#1A1B17", border: "1px solid #444", borderRadius: 6,
            padding: "6px 10px", fontSize: 11, color: "#fff", whiteSpace: "nowrap",
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)", position: "relative", zIndex: 100,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>{ms.title}</div>
            <div style={{ color: "#aaa" }}>Due: {fmtDate(toDate(ms.dueDate))}</div>
            <div style={{ color }}>{ms.status.replace("_", " ")}</div>
            {ms.percentComplete != null && <div style={{ color: "#aaa" }}>{ms.percentComplete}% complete</div>}
          </div>
        </foreignObject>
      )}
    </g>
  );
});

// ─── Gantt Bar ────────────────────────────────────────────────────────────────
interface GanttBarProps {
  id: number; type: "project" | "proposal"; label: string; color: string;
  startX: number; endX: number; rowY: number; rowH: number;
  progress?: number; milestones?: GanttMilestone[]; totalWidth: number;
  viewStart: Date; colWidth: number; viewMode: ViewMode;
  onReschedule?: (id: number, newStart: Date, newEnd: Date) => void;
  onClick?: () => void;
  onMilestoneEdit?: (ms: GanttMilestone) => void;
}

const GanttBar = memo(function GanttBar({
  id, type, label, color, startX, endX, rowY, rowH,
  progress = 0, milestones = [], totalWidth,
  viewStart, colWidth, viewMode,
  onReschedule, onClick, onMilestoneEdit,
}: GanttBarProps) {
  const [dragging, setDragging] = useState<null | "move" | "left" | "right">(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [tooltip, setTooltip] = useState<{ start: Date; end: Date } | null>(null);
  const [hovered, setHovered] = useState(false);
  const dragStartX = useRef(0);
  const dragStartBarX = useRef({ start: startX, end: endX });

  const barH = rowH - 10;
  const barY = 5;
  const radius = 6;
  const isProposal = type === "proposal";

  function onMouseDown(e: React.MouseEvent, mode: "move" | "left" | "right") {
    if (!onReschedule) return;
    e.preventDefault(); e.stopPropagation();
    setDragging(mode);
    dragStartX.current = e.clientX;
    dragStartBarX.current = { start: startX, end: endX };
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - dragStartX.current;
      setDragOffset(dx);
      let ns = dragStartBarX.current.start, ne = dragStartBarX.current.end;
      if (mode === "move") { ns += dx; ne += dx; }
      else if (mode === "right") ne = Math.max(ns + MIN_BAR_W, ne + dx);
      else ns = Math.min(ne - MIN_BAR_W, ns + dx);
      setTooltip({ start: xToDate(ns, viewStart, colWidth, viewMode), end: xToDate(ne, viewStart, colWidth, viewMode) });
    };
    const onUp = (ev: MouseEvent) => {
      const dx = ev.clientX - dragStartX.current;
      let ns = dragStartBarX.current.start, ne = dragStartBarX.current.end;
      if (mode === "move") { ns += dx; ne += dx; }
      else if (mode === "right") ne = Math.max(ns + MIN_BAR_W, ne + dx);
      else ns = Math.min(ne - MIN_BAR_W, ns + dx);
      onReschedule(id, xToDate(ns, viewStart, colWidth, viewMode), xToDate(ne, viewStart, colWidth, viewMode));
      setDragging(null); setDragOffset(0); setTooltip(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  let rStartX = startX, rEndX = endX;
  if (dragging === "move") { rStartX += dragOffset; rEndX += dragOffset; }
  else if (dragging === "right") rEndX = Math.max(rStartX + MIN_BAR_W, rEndX + dragOffset);
  else if (dragging === "left") rStartX = Math.min(rEndX - MIN_BAR_W, rStartX + dragOffset);
  const rBarW = Math.max(MIN_BAR_W, rEndX - rStartX);

  return (
    <g transform={`translate(0, ${rowY})`} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {hovered && <rect x={0} y={0} width={totalWidth} height={rowH} fill="rgba(255,255,255,0.04)" />}
      <g
        transform={`translate(${rStartX}, 0)`}
        style={{ cursor: dragging ? "grabbing" : "grab", transition: dragging ? "none" : "transform 0.15s ease" }}
        onClick={!dragging ? onClick : undefined}
      >
        {/* Bar background */}
        <rect
          x={0} y={barY} width={rBarW} height={barH} rx={radius} ry={radius}
          fill={hexToRgba(color, isProposal ? 0.35 : 0.85)}
          stroke={isProposal ? color : "transparent"} strokeWidth={isProposal ? 1.5 : 0}
        />
        {/* Progress fill */}
        {!isProposal && progress > 0 && (
          <rect
            x={0} y={barY} width={Math.max(radius * 2, rBarW * (progress / 100))} height={barH}
            rx={radius} ry={radius} fill={hexToRgba(color, 1)}
          />
        )}
        {/* Left accent */}
        {!isProposal && <rect x={0} y={barY} width={4} height={barH} rx={2} fill={color} />}
        {/* Label */}
        {rBarW > 30 && (
          <text x={8} y={barY + barH / 2 + 1} fontSize={11} fontFamily="Poppins, sans-serif"
            fill={isProposal ? color : "#fff"} dominantBaseline="middle"
            style={{ userSelect: "none", pointerEvents: "none" }}>
            {rBarW > 80 ? label : label.slice(0, Math.floor(rBarW / 8))}
          </text>
        )}
        {/* Drag handles */}
        {onReschedule && (
          <>
            <rect x={0} y={barY} width={8} height={barH} fill="transparent" style={{ cursor: "ew-resize" }} onMouseDown={e => onMouseDown(e, "left")} />
            <rect x={rBarW - 8} y={barY} width={8} height={barH} fill="transparent" style={{ cursor: "ew-resize" }} onMouseDown={e => onMouseDown(e, "right")} />
            <rect x={8} y={barY} width={Math.max(0, rBarW - 16)} height={barH} fill="transparent" style={{ cursor: "grab" }} onMouseDown={e => onMouseDown(e, "move")} />
          </>
        )}
      </g>
      {/* Milestone diamonds */}
      {milestones.map(ms => {
        const msDate = toDate(ms.dueDate);
        if (!msDate) return null;
        const msX = dateToX(msDate, viewStart, colWidth, viewMode);
        if (msX === null) return null;
        return <MilestoneDiamond key={ms.id} ms={ms} x={msX} rowH={rowH} onEdit={onMilestoneEdit ?? (() => {})} />;
      })}
      {/* Drag tooltip */}
      {tooltip && (
        <foreignObject x={rStartX} y={-32} width={220} height={30} style={{ overflow: "visible" }}>
          <div style={{
            background: "#1A1B17", border: "1px solid #444", borderRadius: 4,
            padding: "4px 8px", fontSize: 11, color: "#fff", whiteSpace: "nowrap",
            boxShadow: "0 2px 8px rgba(0,0,0,0.6)",
          }}>
            {fmtDate(tooltip.start)} → {fmtDate(tooltip.end)}
          </div>
        </foreignObject>
      )}
    </g>
  );
});

// ─── Sidebar Row ──────────────────────────────────────────────────────────────
function SidebarRow({ label, color, status, depth = 0, collapsible, collapsed, onToggle, hovered, onHover, type }: {
  label: string; color: string; status: string; depth?: number;
  collapsible?: boolean; collapsed?: boolean; onToggle?: () => void;
  hovered?: boolean; onHover?: (h: boolean) => void;
  type: "project" | "proposal" | "milestone";
}) {
  const statusColors: Record<string, string> = {
    planning: "#7B9BB5", active: "#4CAF7D", completed: "#888", on_hold: "#E8A838", cancelled: "#E05252",
    sent: "#7B9BB5", approved: "#4CAF7D", rejected: "#E05252", draft: "#888",
    pending: "#888", in_progress: "#E8A838", overdue: "#E05252",
  };
  const sc = statusColors[status] ?? "#888";
  return (
    <div
      className="flex items-center gap-1.5 border-b border-border/30 select-none"
      style={{
        height: ROW_H, paddingLeft: 12 + depth * 16,
        background: hovered ? "rgba(255,255,255,0.05)" : "transparent",
        transition: "background 0.1s", cursor: "default",
      }}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
    >
      {collapsible ? (
        <button className="shrink-0 text-muted-foreground hover:text-foreground w-4 h-4 flex items-center justify-center" onClick={onToggle}>
          {collapsed ? <ChevronRightIcon className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      ) : <span className="w-4 h-4 shrink-0" />}
      <span className="shrink-0 rounded-full" style={{ width: 7, height: 7, background: color }} />
      <span className="shrink-0 text-muted-foreground">
        {type === "project" ? <FolderOpen className="h-3 w-3" />
          : type === "proposal" ? <FileText className="h-3 w-3" />
          : <Target className="h-3 w-3" />}
      </span>
      <span className="flex-1 min-w-0 text-xs font-medium text-foreground truncate" title={label}>{label}</span>
      <span className="shrink-0 text-[9px] px-1 py-0.5 rounded mr-2"
        style={{ background: hexToRgba(sc, 0.2), color: sc, fontFamily: "Poppins, sans-serif" }}>
        {status.replace(/_/g, " ")}
      </span>
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-3 border-b border-border/50" style={{ height: ROW_H, background: hexToRgba(GOLD, 0.08) }}>
      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: GOLD }}>{label}</span>
      <Badge variant="secondary" className="text-[9px] h-4 px-1">{count}</Badge>
    </div>
  );
}

// ─── Main Schedule Page ───────────────────────────────────────────────────────
export default function Schedule() {
  const isMobile = useIsMobile();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: ganttData, isLoading } = trpc.schedule.gantt.useQuery();

  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [zoom, setZoom] = useState(1);
  const [viewStart, setViewStart] = useState<Date>(() => startOfMonth(new Date()));
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<number>>(new Set());
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<GanttMilestone | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const timelineRef = useRef<HTMLDivElement>(null);

  const updateProjectDates = trpc.schedule.updateProjectDates.useMutation({
    onSuccess: () => utils.schedule.gantt.invalidate(),
  });
  const updateMilestoneDates = trpc.schedule.updateMilestoneDates.useMutation({
    onSuccess: () => utils.schedule.gantt.invalidate(),
  });

  const { cols, colWidth } = useMemo(() => getColumns(viewStart, viewMode, zoom), [viewStart, viewMode, zoom]);
  const totalWidth = cols.length * colWidth;

  const todayX = useMemo(() => dateToX(new Date(), viewStart, colWidth, viewMode), [viewStart, colWidth, viewMode]);

  function goToToday() {
    if (viewMode === "day") setViewStart(new Date());
    else if (viewMode === "week") setViewStart(startOfWeek(new Date()));
    else if (viewMode === "month") setViewStart(startOfMonth(new Date()));
    else setViewStart(startOfQuarter(new Date()));
  }

  function navigateTime(dir: 1 | -1) {
    setViewStart(v => {
      if (viewMode === "day") return addDays(v, dir * 14);
      if (viewMode === "week") return addWeeks(v, dir * 4);
      if (viewMode === "month") return addMonths(v, dir * 3);
      return addQuarters(v, dir * 2);
    });
  }

  const proposals: GanttProposal[] = ganttData?.proposals ?? [];
  const projects: GanttProject[] = ganttData?.projects ?? [];
  const allMilestones: GanttMilestone[] = (ganttData as any)?.milestones ?? [];

  const milestonesByProject = useMemo(() => {
    const map = new Map<number, GanttMilestone[]>();
    for (const ms of allMilestones) {
      if (!map.has(ms.projectId)) map.set(ms.projectId, []);
      map.get(ms.projectId)!.push(ms);
    }
    return map;
  }, [allMilestones]);

  function getProgress(projectId: number): number {
    const msList = milestonesByProject.get(projectId) ?? [];
    if (msList.length === 0) return 0;
    const done = msList.filter(m => m.status === "completed").length;
    return Math.round((done / msList.length) * 100);
  }

  type RowItem =
    | { kind: "section_header"; label: string; count: number; key: string }
    | { kind: "proposal"; data: GanttProposal; key: string }
    | { kind: "project"; data: GanttProject; key: string }
    | { kind: "milestone"; data: GanttMilestone; projectColor: string; key: string };

  const rows = useMemo<RowItem[]>(() => {
    const result: RowItem[] = [];
    if (proposals.length > 0) {
      result.push({ kind: "section_header", label: "Proposals", count: proposals.length, key: "sh-proposals" });
      for (const p of proposals) result.push({ kind: "proposal", data: p, key: `proposal-${p.id}` });
    }
    if (projects.length > 0) {
      result.push({ kind: "section_header", label: "Projects", count: projects.length, key: "sh-projects" });
      for (const p of projects) {
        result.push({ kind: "project", data: p, key: `project-${p.id}` });
        if (!collapsedProjects.has(p.id)) {
          const msList = milestonesByProject.get(p.id) ?? [];
          for (const ms of msList) result.push({ kind: "milestone", data: ms, projectColor: p.color, key: `ms-${ms.id}` });
        }
      }
    }
    return result;
  }, [proposals, projects, collapsedProjects, milestonesByProject]);

  const containerH = 600;
  const shouldVirtualize = rows.length > 50;
  const visibleStart = shouldVirtualize ? Math.max(0, Math.floor(scrollTop / ROW_H) - 5) : 0;
  const visibleEnd = shouldVirtualize ? Math.min(rows.length, Math.ceil((scrollTop + containerH) / ROW_H) + 5) : rows.length;
  const visibleRows = rows.slice(visibleStart, visibleEnd);
  const topPad = visibleStart * ROW_H;
  const totalRowsH = Math.max(rows.length * ROW_H, 200);

  function handleProjectReschedule(id: number, newStart: Date, newEnd: Date) {
    const proj = projects.find(p => p.id === id);
    if (!proj) return;
    const prevStart = toDate(proj.startDate);
    const prevEnd = toDate(proj.estimatedEndDate);
    updateProjectDates.mutate({
      id,
      startDate: formatISO(newStart, { representation: "date" }),
      estimatedEndDate: formatISO(newEnd, { representation: "date" }),
    });
    toast(`Project "${proj.name}" rescheduled to ${fmtDate(newStart)} – ${fmtDate(newEnd)}`, {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          updateProjectDates.mutate({
            id,
            startDate: prevStart ? formatISO(prevStart, { representation: "date" }) : undefined,
            estimatedEndDate: prevEnd ? formatISO(prevEnd, { representation: "date" }) : undefined,
          });
        },
      },
    });
  }

  function handleExportPDF() { window.print(); }

  // ── Mobile card/list fallback (phones only) ─────────────────────────────────
  if (isMobile) {
    return <ScheduleMobileView ganttData={ganttData} isLoading={isLoading} navigate={navigate} />;
  }

  return (
    <div className="space-y-4" style={{ fontFamily: "Poppins, sans-serif" }}>
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif" style={{ color: "var(--kp-cream, #F5F0E8)" }}>Master Schedule</h1>
          <p className="text-sm text-muted-foreground mt-1">Proposals · Projects · Milestones — drag bars to reschedule</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs border-border/60 gap-1.5" onClick={handleExportPDF}>
            <Download className="h-3.5 w-3.5" /> Export PDF
          </Button>
          <Button className="h-8 text-xs gap-1.5" style={{ background: GOLD, color: "#1A1B17" }} onClick={() => setShowAddDrawer(true)}>
            <Plus className="h-3.5 w-3.5" /> Add Event
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-lg border border-border/60 overflow-hidden">
          {(["day", "week", "month", "quarter"] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setViewMode(v)} className="px-3 py-1.5 text-xs font-medium transition-colors"
              style={{ background: viewMode === v ? GOLD : "transparent", color: viewMode === v ? "#1A1B17" : "var(--muted-foreground)" }}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateTime(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs px-3" onClick={goToToday}><Calendar className="h-3.5 w-3.5 mr-1.5" /> Today</Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateTime(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.max(0.4, +(z - 0.2).toFixed(1)))}><ZoomOut className="h-3.5 w-3.5" /></Button>
          <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.min(3, +(z + 0.2).toFixed(1)))}><ZoomIn className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-3 rounded" style={{ background: hexToRgba(GOLD, 0.35), border: `1px solid ${GOLD}` }} /> Proposals
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-3 rounded" style={{ background: "#6B8E6B" }} /> Projects
        </span>
        <span className="flex items-center gap-1.5">
          <span style={{ display: "inline-block", width: 10, height: 10, background: "#4CAF7D", transform: "rotate(45deg)" }} /> Milestone
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-0.5 h-4 rounded" style={{ background: "#E05252" }} /> Today
        </span>
      </div>

      {/* Gantt container */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <div className="text-center">
            <Calendar className="h-10 w-10 opacity-20 mx-auto mb-3" />
            <p>Loading schedule…</p>
          </div>
        </div>
      ) : (
        <div className="border border-border/60 rounded-xl overflow-hidden" style={{ background: "#111210" }}>
          {/* Header row */}
          <div className="flex" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            {/* Left panel header */}
            <div className="shrink-0 flex items-center px-3"
              style={{ width: SIDEBAR_W, height: HEADER_H, borderRight: "1px solid rgba(255,255,255,0.08)", background: "#0E0F0D" }}>
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: GOLD }}>Name / Status</span>
            </div>
            {/* Timeline header */}
            <div className="flex-1 overflow-hidden">
              <div ref={timelineRef} style={{ overflowX: "auto", scrollbarWidth: "none" as any }}>
                <div style={{ width: totalWidth, height: HEADER_H, position: "relative" }}>
                  {cols.map((col, i) => (
                    <div key={i} style={{
                      position: "absolute", left: i * colWidth, width: colWidth, height: HEADER_H,
                      borderRight: "1px solid rgba(255,255,255,0.05)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: col.isCurrentPeriod ? hexToRgba(GOLD, 0.08) : col.isWeekend ? "rgba(0,0,0,0.2)" : "transparent",
                    }}>
                      <span className="text-[11px] font-medium" style={{
                        color: col.isToday || col.isCurrentPeriod ? GOLD : "rgba(255,255,255,0.5)",
                        fontWeight: col.isToday || col.isCurrentPeriod ? 700 : 400,
                      }}>{col.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="flex" style={{ height: Math.min(totalRowsH + 2, 640) }}>
            {/* Left sidebar */}
            <div className="shrink-0 overflow-y-auto"
              style={{ width: SIDEBAR_W, borderRight: "1px solid rgba(255,255,255,0.08)", background: "#0E0F0D" }}
              onScroll={e => setScrollTop((e.target as HTMLDivElement).scrollTop)}>
              <div style={{ height: totalRowsH }}>
                {topPad > 0 && <div style={{ height: topPad }} />}
                {visibleRows.map(row => {
                  if (row.kind === "section_header") return <SectionHeader key={row.key} label={row.label} count={row.count} />;
                  if (row.kind === "proposal") {
                    const p = row.data;
                    return <SidebarRow key={row.key} label={p.clientName ?? `Proposal #${p.id}`} color={p.color} status={p.status}
                      type="proposal" hovered={hoveredRowId === row.key} onHover={h => setHoveredRowId(h ? row.key : null)} />;
                  }
                  if (row.kind === "project") {
                    const p = row.data;
                    const msList = milestonesByProject.get(p.id) ?? [];
                    return <SidebarRow key={row.key} label={p.name} color={p.color} status={p.status} type="project"
                      collapsible={msList.length > 0} collapsed={collapsedProjects.has(p.id)}
                      onToggle={() => setCollapsedProjects(s => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
                      hovered={hoveredRowId === row.key} onHover={h => setHoveredRowId(h ? row.key : null)} />;
                  }
                  if (row.kind === "milestone") {
                    const ms = row.data;
                    return <SidebarRow key={row.key} label={ms.title} color={MS_COLORS[ms.status] ?? "#888"} status={ms.status}
                      depth={1} type="milestone" hovered={hoveredRowId === row.key} onHover={h => setHoveredRowId(h ? row.key : null)} />;
                  }
                  return null;
                })}
              </div>
            </div>

            {/* Timeline body */}
            <div className="flex-1 overflow-auto" onScroll={e => {
              setScrollTop((e.target as HTMLDivElement).scrollTop);
              if (timelineRef.current) timelineRef.current.scrollLeft = (e.target as HTMLDivElement).scrollLeft;
            }}>
              <svg width={totalWidth} height={totalRowsH} style={{ display: "block" }}>
                {/* Column backgrounds */}
                {cols.map((col, i) => (
                  <rect key={i} x={i * colWidth} y={0} width={colWidth} height={totalRowsH}
                    fill={col.isWeekend ? "rgba(0,0,0,0.15)" : col.isCurrentPeriod ? hexToRgba(GOLD, 0.04) : "transparent"} />
                ))}
                {/* Column grid lines */}
                {cols.map((_, i) => (
                  <line key={`g${i}`} x1={i * colWidth} y1={0} x2={i * colWidth} y2={totalRowsH} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
                ))}
                {/* Row backgrounds */}
                {rows.map((row, i) => (
                  <rect key={`rb${row.key}`} x={0} y={i * ROW_H} width={totalWidth} height={ROW_H}
                    fill={hoveredRowId === row.key ? "rgba(255,255,255,0.04)" : i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent"} />
                ))}
                {/* Row lines */}
                {rows.map((_, i) => (
                  <line key={`rl${i}`} x1={0} y1={i * ROW_H} x2={totalWidth} y2={i * ROW_H} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
                ))}

                {/* Bars */}
                {rows.map((row, i) => {
                  const rowY = i * ROW_H;
                  if (row.kind === "proposal") {
                    const p = row.data;
                    const startDate = toDate(p.createdAt);
                    const endDate = toDate(p.validUntil) ?? (startDate ? addDays(startDate, 30) : null);
                    const sx = dateToX(startDate, viewStart, colWidth, viewMode);
                    const ex = dateToX(endDate, viewStart, colWidth, viewMode);
                    if (sx === null || ex === null) return null;
                    return <GanttBar key={row.key} id={p.id} type="proposal" label={p.clientName ?? `Proposal #${p.id}`}
                      color={p.color} startX={sx} endX={ex} rowY={rowY} rowH={ROW_H}
                      totalWidth={totalWidth} viewStart={viewStart} colWidth={colWidth} viewMode={viewMode}
                      onClick={() => navigate(`/proposals/${p.id}`)} />;
                  }
                  if (row.kind === "project") {
                    const p = row.data;
                    const startDate = toDate(p.startDate);
                    const endDate = toDate(p.estimatedEndDate) ?? (startDate ? addDays(startDate, 30) : null);
                    if (!startDate && !endDate) return null;
                    const sx = dateToX(startDate ?? endDate!, viewStart, colWidth, viewMode);
                    const ex = dateToX(endDate ?? startDate!, viewStart, colWidth, viewMode);
                    if (sx === null || ex === null) return null;
                    const msList = milestonesByProject.get(p.id) ?? [];
                    return <GanttBar key={row.key} id={p.id} type="project" label={p.name}
                      color={p.color} startX={sx} endX={ex} rowY={rowY} rowH={ROW_H}
                      progress={getProgress(p.id)} milestones={msList}
                      totalWidth={totalWidth} viewStart={viewStart} colWidth={colWidth} viewMode={viewMode}
                      onReschedule={handleProjectReschedule}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      onMilestoneEdit={setEditingMilestone} />;
                  }
                  if (row.kind === "milestone") {
                    const ms = row.data;
                    const dueDate = toDate(ms.dueDate);
                    if (!dueDate) return null;
                    const msX = dateToX(dueDate, viewStart, colWidth, viewMode);
                    if (msX === null) return null;
                    return (
                      <g key={row.key} transform={`translate(0, ${rowY})`}>
                        <MilestoneDiamond ms={ms} x={msX} rowH={ROW_H} onEdit={setEditingMilestone} />
                      </g>
                    );
                  }
                  return null;
                })}

                {/* Today line */}
                {todayX !== null && todayX >= 0 && todayX <= totalWidth && (
                  <g>
                    <line x1={todayX} y1={0} x2={todayX} y2={totalRowsH} stroke="#E05252" strokeWidth={2} strokeDasharray="4 3" />
                    <polygon points={`${todayX - 5},0 ${todayX + 5},0 ${todayX},8`} fill="#E05252" />
                  </g>
                )}
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* Add Event Drawer */}
      <AddEventDrawer
        open={showAddDrawer}
        onClose={() => setShowAddDrawer(false)}
        onSuccess={() => { setShowAddDrawer(false); utils.schedule.gantt.invalidate(); }}
      />

      {/* Milestone Edit Dialog */}
      {editingMilestone && (
        <MilestoneEditDialog
          milestone={editingMilestone}
          onClose={() => setEditingMilestone(null)}
          onSave={(id, dueDate) => { updateMilestoneDates.mutate({ id, dueDate }); setEditingMilestone(null); }}
        />
      )}
    </div>
  );
}

// ─── Add Event Drawer ─────────────────────────────────────────────────────────
function AddEventDrawer({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const createEvent = trpc.schedule.create.useMutation({
    onSuccess: () => { toast.success("Event added!"); onSuccess(); },
    onError: (err) => toast.error("Failed: " + err.message),
  });
  const EVENT_TYPES = ["consultation","milestone","inspection","delivery","vendor_visit","crew_assignment","other"] as const;
  type EventType = typeof EVENT_TYPES[number];
  const [form, setForm] = useState({
    type: "consultation" as EventType,
    name: "", leadId: "",
    startDate: format(new Date(), "yyyy-MM-dd"),
    endDate: format(addDays(new Date(), 7), "yyyy-MM-dd"),
    assignee: "Chad Price", notes: "",
  });
  function handleSave() {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    createEvent.mutate({
      title: form.name, eventType: form.type,
      startTime: new Date(form.startDate).toISOString(),
      endTime: new Date(form.endDate).toISOString(),
      notes: form.notes || undefined,
    });
  }
  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent className="bg-card border-border w-[400px]">
        <SheetHeader><SheetTitle className="font-serif text-xl">Add Event</SheetTitle></SheetHeader>
        <div className="space-y-4 mt-6">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Type</Label>
            <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as EventType }))}>
              <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map(t => (
                  <SelectItem key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Name</Label>
            <Input className="bg-background border-border" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Event name…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Start Date</Label>
              <Input type="date" className="bg-background border-border" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">End Date</Label>
              <Input type="date" className="bg-background border-border" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Notes</Label>
            <Textarea className="bg-background border-border resize-none" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes…" />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" style={{ background: GOLD, color: "#1A1B17" }} onClick={handleSave} disabled={createEvent.isPending}>
              {createEvent.isPending ? "Saving…" : "Add Event"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Milestone Edit Dialog ────────────────────────────────────────────────────
function MilestoneEditDialog({ milestone, onClose, onSave }: {
  milestone: GanttMilestone; onClose: () => void; onSave: (id: number, dueDate: string) => void;
}) {
  const [dueDate, setDueDate] = useState(milestone.dueDate ? format(toDate(milestone.dueDate)!, "yyyy-MM-dd") : "");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-6 w-80 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">{milestone.title}</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Due Date</Label>
          <Input type="date" className="bg-background border-border" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" style={{ background: GOLD, color: "#1A1B17" }} onClick={() => { if (dueDate) onSave(milestone.id, dueDate); }}>Save</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Mobile Schedule View ─────────────────────────────────────────────────────
function ScheduleMobileView({
  ganttData,
  isLoading,
  navigate,
}: {
  ganttData: any;
  isLoading: boolean;
  navigate: (path: string) => void;
}) {
  const proposals: GanttProposal[] = ganttData?.proposals ?? [];
  const projects: GanttProject[] = ganttData?.projects ?? [];
  const milestones: GanttMilestone[] = (ganttData as any)?.milestones ?? [];

  function getMilestones(projectId: number) {
    return milestones.filter(m => m.projectId === projectId);
  }
  function getProgress(projectId: number) {
    const ms = getMilestones(projectId);
    if (!ms.length) return 0;
    return Math.round((ms.filter(m => m.status === "completed").length / ms.length) * 100);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center">
          <Calendar className="h-10 w-10 opacity-20 mx-auto mb-3" />
          <p className="text-sm">Loading schedule…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5" style={{ fontFamily: "Poppins, sans-serif" }}>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-serif" style={{ color: "var(--kp-cream, #F5F0E8)" }}>Master Schedule</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Proposals · Projects · Milestones</p>
      </div>

      {/* Active Projects */}
      {projects.length > 0 && (
        <section>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>
            Projects ({projects.length})
          </p>
          <div className="space-y-3">
            {projects.map(proj => {
              const start = toDate(proj.startDate);
              const end = toDate(proj.estimatedEndDate);
              const progress = getProgress(proj.id);
              const ms = getMilestones(proj.id);
              const nextMs = ms.find(m => m.status !== "completed");
              return (
                <div
                  key={proj.id}
                  className="rounded-xl border border-border/60 p-4 space-y-3 cursor-pointer active:opacity-80"
                  style={{ background: "rgba(255,255,255,0.03)" }}
                  onClick={() => navigate(`/projects/${proj.id}`)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: "var(--kp-cream)" }}>{proj.name}</p>
                      {proj.clientName && (
                        <p className="text-xs mt-0.5" style={{ color: "var(--kp-muted)" }}>{proj.clientName}</p>
                      )}
                    </div>
                    <span
                      className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(107,142,107,0.2)", color: "#86efac", border: "1px solid rgba(107,142,107,0.3)" }}
                    >
                      {proj.status.replace(/_/g, " ")}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px]" style={{ color: "var(--kp-muted)" }}>Progress</span>
                      <span className="text-[10px] font-semibold" style={{ color: GOLD }}>{progress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${GOLD}99, ${GOLD})` }}
                      />
                    </div>
                  </div>

                  {/* Dates */}
                  <div className="flex items-center gap-4 text-[11px]" style={{ color: "var(--kp-muted)" }}>
                    <span>Start: <span style={{ color: "var(--kp-cream)" }}>{fmtDate(start)}</span></span>
                    <span>End: <span style={{ color: "var(--kp-cream)" }}>{fmtDate(end)}</span></span>
                  </div>

                  {/* Next milestone */}
                  {nextMs && (
                    <div
                      className="flex items-center gap-2 rounded-lg px-3 py-2"
                      style={{ background: "rgba(201,168,76,0.07)", border: "1px solid rgba(201,168,76,0.15)" }}
                    >
                      <Target className="h-3.5 w-3.5 shrink-0" style={{ color: GOLD }} />
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium truncate" style={{ color: GOLD }}>Next: {nextMs.title}</p>
                        <p className="text-[10px]" style={{ color: "var(--kp-muted)" }}>Due {fmtDate(toDate(nextMs.dueDate))}</p>
                      </div>
                    </div>
                  )}

                  {/* Milestone count */}
                  {ms.length > 0 && (
                    <p className="text-[10px]" style={{ color: "var(--kp-muted)" }}>
                      {ms.filter(m => m.status === "completed").length}/{ms.length} milestones complete
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Active Proposals */}
      {proposals.length > 0 && (
        <section>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>
            Proposals ({proposals.length})
          </p>
          <div className="space-y-2">
            {proposals.map(prop => {
              const created = toDate(prop.createdAt);
              const valid = toDate(prop.validUntil);
              return (
                <div
                  key={prop.id}
                  className="rounded-xl border border-border/60 p-4 cursor-pointer active:opacity-80"
                  style={{ background: "rgba(255,255,255,0.02)" }}
                  onClick={() => navigate(`/proposals`)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate" style={{ color: "var(--kp-cream)" }}>
                        {prop.clientName ?? "Unnamed Client"}
                      </p>
                      {prop.estimateNumber && (
                        <p className="text-[11px] mt-0.5" style={{ color: "var(--kp-muted)" }}>#{prop.estimateNumber}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {prop.totalAmount != null && (
                        <p className="text-sm font-semibold" style={{ color: GOLD }}>
                          ${prop.totalAmount.toLocaleString()}
                        </p>
                      )}
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(201,168,76,0.15)", color: GOLD, border: "1px solid rgba(201,168,76,0.25)" }}
                      >
                        {prop.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] mt-2" style={{ color: "var(--kp-muted)" }}>
                    <span>Created: <span style={{ color: "var(--kp-cream)" }}>{fmtDate(created)}</span></span>
                    {valid && <span>Valid until: <span style={{ color: "var(--kp-cream)" }}>{fmtDate(valid)}</span></span>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {projects.length === 0 && proposals.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Calendar className="h-12 w-12 opacity-20 mb-4" />
          <p className="text-sm text-muted-foreground">No projects or proposals yet.</p>
        </div>
      )}
    </div>
  );
}
