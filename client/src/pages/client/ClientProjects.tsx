import { trpc } from "@/lib/trpc";
import { CheckCircle, Clock, AlertCircle, PauseCircle, XCircle, ChevronRight, FolderOpen } from "lucide-react";
import { format } from "date-fns";
import { useLocation } from "wouter";

const GOLD = "#C9A84C";
const DARK = "#1A1B17";
const CHARCOAL = "#2E2F2A";
const CREAM = "#F5F0E8";
const MUTED = "#9A9589";
const GREEN = "#4CAF7D";
const AMBER = "#E8A838";
const RED = "#E05252";

type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "cancelled";

const STATUS_CONFIG: Record<ProjectStatus, { label: string; color: string; icon: React.ElementType; bg: string }> = {
  planning: { label: "Planning", color: AMBER, icon: Clock, bg: `${AMBER}15` },
  active: { label: "In Progress", color: GOLD, icon: Clock, bg: `${GOLD}15` },
  on_hold: { label: "On Hold", color: MUTED, icon: PauseCircle, bg: "rgba(154,149,137,0.12)" },
  completed: { label: "Completed", color: GREEN, icon: CheckCircle, bg: `${GREEN}15` },
  cancelled: { label: "Cancelled", color: RED, icon: XCircle, bg: `${RED}15` },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as ProjectStatus] ?? STATUS_CONFIG.planning;
  const Icon = cfg.icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${progress}%`,
          background: progress === 100
            ? GREEN
            : `linear-gradient(90deg, ${GOLD}, #E8C96A)`,
        }}
      />
    </div>
  );
}

export default function ClientProjects() {
  const { data: clientSession } = trpc.clientPortal.me.useQuery();
  const { data: projectsList = [], isLoading } = trpc.clientPortal.getMyProjects.useQuery();
  const [, setLocation] = useLocation();

  const clientName = clientSession?.name ?? "";
  const firstName = clientName.split(" ")[0] || "";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: GOLD }}>
          Your Renovation
        </p>
        <h1 className="text-4xl font-serif leading-tight" style={{ color: CREAM, fontStyle: "italic" }}>
          {firstName ? `Welcome back, ${firstName}.` : "Welcome back."}
        </h1>
        {!isLoading && projectsList.length > 0 && (
          <p className="text-sm mt-1" style={{ color: MUTED }}>
            {projectsList.length === 1
              ? "Here is your project."
              : `You have ${projectsList.length} projects.`}
          </p>
        )}
      </div>

      {/* Loading skeletons */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="h-32 rounded-xl animate-pulse" style={{ background: CHARCOAL }} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && projectsList.length === 0 && (
        <div
          className="rounded-xl p-8 text-center space-y-3"
          style={{ background: CHARCOAL, border: `1px solid rgba(201,168,76,0.15)` }}
        >
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
            style={{ background: `${GOLD}20`, color: GOLD }}
          >
            <FolderOpen className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-serif" style={{ color: CREAM, fontStyle: "italic" }}>
            Your project is being set up
          </h2>
          <p className="text-sm" style={{ color: MUTED }}>
            We'll have everything ready soon. Questions? Call Chad at{" "}
            <a href="tel:8645678777" className="font-semibold" style={{ color: GOLD }}>
              864-567-8777
            </a>
          </p>
        </div>
      )}

      {/* Project cards */}
      {!isLoading && projectsList.length > 0 && (
        <div className="space-y-4">
          {projectsList.map((project) => (
            <button
              key={project.id}
              onClick={() => setLocation(`/client/project/${project.id}`)}
              className="w-full text-left rounded-xl p-5 transition-all duration-200 group"
              style={{
                background: CHARCOAL,
                border: `1px solid rgba(255,255,255,0.06)`,
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.border = `1px solid rgba(201,168,76,0.35)`;
                (e.currentTarget as HTMLElement).style.background = `rgba(201,168,76,0.06)`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.border = `1px solid rgba(255,255,255,0.06)`;
                (e.currentTarget as HTMLElement).style.background = CHARCOAL;
              }}
            >
              {/* Top row: title + status + arrow */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-semibold leading-snug truncate" style={{ color: CREAM }}>
                    {project.name}
                  </h2>
                  {project.projectType && (
                    <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                      {project.projectType}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={project.status ?? "planning"} />
                  <ChevronRight
                    className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: GOLD }}
                  />
                </div>
              </div>

              {/* Description */}
              {project.description && (
                <p className="text-sm leading-relaxed mb-3 line-clamp-2" style={{ color: MUTED }}>
                  {project.description}
                </p>
              )}

              {/* Progress bar */}
              {project.totalMilestones > 0 && (
                <div className="space-y-1.5 mb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: MUTED }}>Project Progress</span>
                    <span className="text-xs font-semibold" style={{ color: project.progress === 100 ? GREEN : GOLD }}>
                      {project.progress}%
                    </span>
                  </div>
                  <ProgressBar progress={project.progress} />
                  <p className="text-xs" style={{ color: MUTED }}>
                    {project.completedMilestones} of {project.totalMilestones} step{project.totalMilestones !== 1 ? "s" : ""} complete
                  </p>
                </div>
              )}

              {/* Dates */}
              <div className="flex items-center gap-4 text-xs" style={{ color: MUTED }}>
                {project.startDate && (
                  <span>Started {format(new Date(project.startDate), "MMM d, yyyy")}</span>
                )}
                {project.estimatedEndDate && project.status !== "completed" && (
                  <span>Est. completion {format(new Date(project.estimatedEndDate), "MMM d, yyyy")}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Bottom contact CTA */}
      <button
        onClick={() => setLocation("/client/messages")}
        className="w-full rounded-xl p-5 flex items-center justify-between transition-all duration-200"
        style={{
          background: `linear-gradient(135deg, rgba(201,168,76,0.12), rgba(201,168,76,0.06))`,
          border: `1px solid rgba(201,168,76,0.25)`,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.background = `linear-gradient(135deg, rgba(201,168,76,0.18), rgba(201,168,76,0.10))`;
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background = `linear-gradient(135deg, rgba(201,168,76,0.12), rgba(201,168,76,0.06))`;
        }}
      >
        <div className="text-left">
          <p className="font-semibold text-sm" style={{ color: CREAM }}>Have a question?</p>
          <p className="text-xs mt-0.5" style={{ color: MUTED }}>Send us a message — we typically respond within a few hours.</p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0" style={{ color: GOLD }} />
      </button>
    </div>
  );
}
