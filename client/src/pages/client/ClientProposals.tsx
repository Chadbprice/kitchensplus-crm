import { trpc } from "@/lib/trpc";
import { FileText, ChevronRight, CheckCircle, Clock, Eye, XCircle, ArrowLeft, Download } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { useState } from "react";
import ProjectFilterBar from "@/components/ProjectFilterBar";

const GOLD = "#C9A84C";
const DARK = "#1A1B17";
const CHARCOAL = "#2E2F2A";
const CREAM = "#F5F0E8";
const MUTED = "#9A9589";
const GREEN = "#4CAF7D";
const AMBER = "#E8A838";
const RED = "#E05252";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    draft:    { label: "Draft",    color: MUTED,  icon: <Clock className="h-3 w-3" /> },
    sent:     { label: "Sent",     color: AMBER,  icon: <FileText className="h-3 w-3" /> },
    viewed:   { label: "Viewed",   color: "#4A90D9", icon: <Eye className="h-3 w-3" /> },
    approved: { label: "Approved", color: GREEN,  icon: <CheckCircle className="h-3 w-3" /> },
    rejected: { label: "Declined", color: RED,    icon: <XCircle className="h-3 w-3" /> },
    expired:  { label: "Expired",  color: MUTED,  icon: <Clock className="h-3 w-3" /> },
  };
  const info = map[status] ?? { label: status, color: MUTED, icon: <FileText className="h-3 w-3" /> };
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide"
      style={{ background: `${info.color}20`, color: info.color, border: `1px solid ${info.color}35` }}
    >
      {info.icon}{info.label}
    </span>
  );
}

export default function ClientProposals() {
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>(undefined);
  const { data: proposals, isLoading } = trpc.clientPortal.getMyProposals.useQuery(
    selectedProjectId ? { projectId: selectedProjectId } : undefined
  );

  const sorted = [...(proposals ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <Link href="/client/project">
          <button className="flex items-center gap-1.5 text-xs mb-4 transition-colors hover:opacity-80" style={{ color: MUTED }}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Dashboard
          </button>
        </Link>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: GOLD }}>
          Your Project
        </p>
        <h1 className="text-4xl font-serif leading-tight" style={{ color: CREAM, fontStyle: "italic" }}>
          Proposals
        </h1>
        <p className="text-sm mt-1" style={{ color: MUTED }}>
          All proposals sent to you — tap any to view details or approve.
        </p>
        <ProjectFilterBar
          selectedProjectId={selectedProjectId}
          onSelect={setSelectedProjectId}
          className="mt-4"
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: CHARCOAL }} />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && sorted.length === 0 && (
        <div
          className="rounded-xl p-10 text-center space-y-3"
          style={{ background: CHARCOAL, border: `1px solid rgba(255,255,255,0.06)` }}
        >
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
            style={{ background: `${GOLD}15` }}
          >
            <FileText className="h-6 w-6" style={{ color: GOLD }} />
          </div>
          <h2 className="text-xl font-serif" style={{ color: CREAM, fontStyle: "italic" }}>
            No proposals yet
          </h2>
          <p className="text-sm" style={{ color: MUTED }}>
            When we send you a proposal, it will appear here.
          </p>
        </div>
      )}

      {/* Proposal list */}
      {sorted.map((proposal) => {
        const total = Number(proposal.total ?? 0);
        const sentAt = proposal.sentAt ? new Date(proposal.sentAt) : null;
        const approvedAt = proposal.approvedAt ? new Date(proposal.approvedAt) : null;

        return (
          <Link key={proposal.id} href={`/client/proposal/${proposal.id}`}>
            <div
              className="rounded-xl p-5 cursor-pointer transition-all duration-200 group"
              style={{
                background: CHARCOAL,
                border: `1px solid rgba(255,255,255,0.06)`,
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.border = `1px solid rgba(201,168,76,0.35)`;
                (e.currentTarget as HTMLElement).style.background = `rgba(201,168,76,0.04)`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.border = `1px solid rgba(255,255,255,0.06)`;
                (e.currentTarget as HTMLElement).style.background = CHARCOAL;
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {/* Icon */}
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: `${GOLD}15` }}
                  >
                    <FileText className="h-5 w-5" style={{ color: GOLD }} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-semibold text-sm truncate" style={{ color: CREAM }}>
                        {proposal.title || `Proposal #${proposal.estimateNumber || proposal.id}`}
                      </p>
                      <StatusBadge status={proposal.status} />
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      {total > 0 && (
                        <span className="text-sm font-bold" style={{ color: GOLD }}>
                          {fmt(total)}
                        </span>
                      )}
                      {sentAt && (
                        <span className="text-xs" style={{ color: MUTED }}>
                          Sent {format(sentAt, "MMM d, yyyy")}
                        </span>
                      )}
                      {approvedAt && (
                        <span className="text-xs" style={{ color: GREEN }}>
                          Approved {format(approvedAt, "MMM d, yyyy")}
                        </span>
                      )}
                    </div>

                    {proposal.notes && (
                      <p className="text-xs mt-1.5 line-clamp-2" style={{ color: MUTED }}>
                        {proposal.notes}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {(proposal as any).pdfUrl && (
                    <a
                      href={(proposal as any).pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
                      style={{ background: `${GOLD}15`, color: GOLD }}
                      title="Download PDF"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <ChevronRight
                    className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: GOLD }}
                  />
                </div>
              </div>

              {/* Approved indicator */}
              {proposal.status === "approved" && (
                <div
                  className="mt-3 pt-3 flex items-center gap-2"
                  style={{ borderTop: `1px solid rgba(76,175,125,0.15)` }}
                >
                  <CheckCircle className="h-3.5 w-3.5" style={{ color: GREEN }} />
                  <span className="text-xs font-medium" style={{ color: GREEN }}>
                    You approved this proposal
                    {approvedAt ? ` on ${format(approvedAt, "MMMM d, yyyy")}` : ""}
                  </span>
                </div>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
