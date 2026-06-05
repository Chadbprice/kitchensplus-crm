import { trpc } from "@/lib/trpc";

interface ProjectFilterBarProps {
  selectedProjectId: number | undefined;
  onSelect: (id: number | undefined) => void;
  className?: string;
}

/**
 * A horizontal chip row that lets clients filter sub-page content by project.
 * Only renders when the client has 2+ projects (single-project clients don't need it).
 */
export default function ProjectFilterBar({ selectedProjectId, onSelect, className = "" }: ProjectFilterBarProps) {
  const { data: projects } = trpc.clientPortal.getMyProjects.useQuery();

  // Don't render if 0 or 1 project — no need to filter
  if (!projects || projects.length < 2) return null;

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider shrink-0">Filter:</span>
      <button
        onClick={() => onSelect(undefined)}
        className={`px-3 py-1 rounded-full text-xs font-medium transition-all border ${
          selectedProjectId === undefined
            ? "border-[#C9A84C] bg-[#C9A84C]/15 text-[#C9A84C]"
            : "border-border text-muted-foreground hover:border-[#C9A84C]/50 hover:text-foreground"
        }`}
      >
        All Projects
      </button>
      {projects.map((proj) => (
        <button
          key={proj.id}
          onClick={() => onSelect(proj.id)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all border truncate max-w-[160px] ${
            selectedProjectId === proj.id
              ? "border-[#C9A84C] bg-[#C9A84C]/15 text-[#C9A84C]"
              : "border-border text-muted-foreground hover:border-[#C9A84C]/50 hover:text-foreground"
          }`}
          title={proj.name}
        >
          {proj.name}
        </button>
      ))}
    </div>
  );
}
