import { trpc } from "@/lib/trpc";
import { CheckCircle, Clock, AlertCircle, DollarSign, MessageSquare, FileText, ClipboardList, Phone, Mail, ChevronRight, Camera, Image } from "lucide-react";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import { Link, useRoute } from "wouter";

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

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle className="h-5 w-5 shrink-0" style={{ color: GREEN }} />;
  if (status === "delayed") return <AlertCircle className="h-5 w-5 shrink-0" style={{ color: RED }} />;
  if (status === "in_progress") return <Clock className="h-5 w-5 shrink-0" style={{ color: GOLD }} />;
  return <Clock className="h-5 w-5 shrink-0" style={{ color: MUTED }} />;
}

export default function ClientProject() {
  const [matchById, paramsById] = useRoute("/client/project/:id");
  const projectId = matchById && paramsById?.id ? parseInt(paramsById.id, 10) : null;
  const { data: clientSession } = trpc.clientPortal.me.useQuery();
  // Use per-project query when a projectId is in the URL, otherwise fall back to first project
  const { data: projectById, isLoading: isLoadingById } = trpc.clientPortal.getMyProjectById.useQuery(
    { projectId: projectId ?? 0 },
    { enabled: projectId !== null && !isNaN(projectId ?? NaN) }
  );
  const { data: projectFirst, isLoading: isLoadingFirst } = trpc.clientPortal.getMyProject.useQuery(
    undefined,
    { enabled: projectId === null }
  );
  const project = projectId !== null ? projectById : projectFirst;
  const isLoading = projectId !== null ? isLoadingById : isLoadingFirst;

  const clientName = clientSession?.name ?? "";
  const firstName = clientName.split(" ")[0] || "";

  const { data: financialHealth } = trpc.clientPortal.getMyFinancialHealth.useQuery();

  const milestones = project?.milestones ?? [];
  const completed = milestones.filter(m => m.status === "completed").length;
  const total = milestones.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  const contractTotal = Number(project?.contractTotal ?? 0);
  const totalPaid = Number(project?.totalPaid ?? 0);
  const totalDue = Number(project?.totalDue ?? 0);
  const balance = contractTotal - totalPaid;
  const paidPct = contractTotal > 0 ? Math.round((totalPaid / contractTotal) * 100) : 0;

  const { data: recentActivity } = trpc.clientPortal.getRecentActivity.useQuery();
  const { data: recentPhotos } = trpc.clientPortal.getRecentPhotos.useQuery();

  // Quiet period: days since last activity
  const lastActivityAt = project?.lastActivityAt ? new Date(project.lastActivityAt as any) : null;
  const daysSinceActivity = lastActivityAt ? differenceInDays(new Date(), lastActivityAt) : null;
  const showQuietBanner = daysSinceActivity !== null && daysSinceActivity >= 5;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* Back to All Projects */}
      <Link href="/client/projects">
        <span
          className="inline-flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-80"
          style={{ color: MUTED }}
        >
          <ChevronRight className="h-3 w-3 rotate-180" />
          All Projects
        </span>
      </Link>

      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: GOLD }}>
          Your Renovation
        </p>
        <h1 className="text-4xl font-serif leading-tight" style={{ color: CREAM, fontStyle: "italic" }}>
          {project ? project.name : (firstName ? `Welcome back, ${firstName}.` : "Welcome back.")}
        </h1>
        {project && (
          <p className="text-sm mt-1" style={{ color: MUTED }}>
            {(project.status ?? "active").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
          </p>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: CHARCOAL }} />
          ))}
        </div>
      )}

      {/* No project yet */}
      {!isLoading && !project && (
        <div
          className="rounded-xl p-8 text-center space-y-3"
          style={{ background: CHARCOAL, border: `1px solid rgba(201,168,76,0.15)` }}
        >
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto text-2xl font-serif"
            style={{ background: `${GOLD}20`, color: GOLD }}
          >
            ✦
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

      {project && (
        <>
          {/* Progress bar card */}
          <div
            className="rounded-xl p-5 space-y-3"
            style={{ background: CHARCOAL, border: `1px solid rgba(201,168,76,0.15)` }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>
                Project Progress
              </span>
              <span className="text-sm font-bold" style={{ color: GOLD }}>{progress}%</span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${GOLD}, #E8C96A)` }}
              />
            </div>
            <p className="text-xs" style={{ color: MUTED }}>
              {completed} of {total} step{total !== 1 ? "s" : ""} complete
              {project.startDate && (
                <> · Started {format(new Date(project.startDate), "MMMM d, yyyy")}</>
              )}
              {project.estimatedEndDate && (
                <> · Est. completion {format(new Date(project.estimatedEndDate), "MMMM d, yyyy")}</>
              )}
            </p>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                label: "Project Total",
                value: contractTotal > 0 ? fmt(contractTotal) : "—",
                icon: DollarSign,
                color: GOLD,
              },
              {
                label: "Paid to Date",
                value: totalPaid > 0 ? fmt(totalPaid) : "$0",
                sub: contractTotal > 0 ? `${paidPct}% of total` : undefined,
                icon: CheckCircle,
                color: GREEN,
              },
              {
                label: "Amount Remaining",
                value: balance > 0 ? fmt(balance) : "$0",
                icon: Clock,
                color: balance > 0 ? AMBER : MUTED,
              },
              {
                label: "Coming Up Next",
                value: project.nextMilestone?.title ?? "All done!",
                sub: project.nextMilestone?.dueDate
                  ? format(new Date(project.nextMilestone.dueDate), "MMM d")
                  : undefined,
                icon: ClipboardList,
                color: GOLD,
                small: true,
              },
            ].map(card => (
              <div
                key={card.label}
                className="rounded-xl p-4 space-y-1"
                style={{ background: CHARCOAL, border: `1px solid rgba(255,255,255,0.06)` }}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <card.icon className="h-3.5 w-3.5" style={{ color: card.color }} />
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: MUTED }}>
                    {card.label}
                  </span>
                </div>
                <p
                  className={`font-bold leading-tight ${card.small ? "text-sm" : "text-xl"}`}
                  style={{ color: CREAM }}
                >
                  {card.value}
                </p>
                {card.sub && (
                  <p className="text-[11px]" style={{ color: MUTED }}>{card.sub}</p>
                )}
              </div>
            ))}
          </div>

          {/* Financial Health Card */}
          {financialHealth && financialHealth.contractTotal > 0 && (
            <div
              className="rounded-xl p-5 space-y-4"
              style={{ background: CHARCOAL, border: `1px solid rgba(201,168,76,0.15)` }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>Billing Overview</span>
                {financialHealth.depositCollected && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: `${GREEN}22`, color: GREEN }}>
                    Deposit Received
                  </span>
                )}
              </div>

              {/* Budget vs Paid bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs" style={{ color: MUTED }}>
                  <span>Amount Paid</span>
                  <span style={{ color: CREAM }}>
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(financialHealth.totalPaid)}
                    {" "}<span style={{ color: MUTED }}>of {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(financialHealth.contractTotal)}</span>
                  </span>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${financialHealth.paidPct}%`, background: `linear-gradient(90deg, ${GREEN}, #6EE7A0)` }}
                  />
                </div>
                <p className="text-[10px]" style={{ color: MUTED }}>{financialHealth.paidPct}% of project total paid</p>
              </div>

              {/* Remaining balance */}
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: MUTED }}>Amount Still Owed</span>
                <span className="text-lg font-bold" style={{ color: financialHealth.remaining > 0 ? AMBER : GREEN }}>
                  {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(financialHealth.remaining)}
                </span>
              </div>

              {/* Pending invoices notice */}
              {financialHealth.pendingInvoiceCount > 0 && (
                <div
                  className="rounded-lg px-3 py-2 flex items-center gap-2"
                  style={{ background: `${AMBER}15`, border: `1px solid ${AMBER}30` }}
                >
                  <span className="text-sm" style={{ color: AMBER }}>●</span>
                  <span className="text-xs" style={{ color: AMBER }}>
                    {financialHealth.pendingInvoiceCount === 1
                      ? "You have 1 payment ready to review"
                      : `You have ${financialHealth.pendingInvoiceCount} payments ready to review`}
                  </span>
                </div>
              )}

              {/* Next milestone payment */}
              {financialHealth.nextMilestone && (
                <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: MUTED }}>Next Payment Due</p>
                    <p className="text-sm mt-0.5" style={{ color: CREAM }}>{financialHealth.nextMilestone.title}</p>
                    {financialHealth.nextMilestone.dueDate && (
                      <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
                        Due {format(new Date(financialHealth.nextMilestone.dueDate), "MMMM d, yyyy")}
                      </p>
                    )}
                  </div>
                  {financialHealth.nextMilestone.amount > 0 && (
                    <span className="text-base font-bold" style={{ color: GOLD }}>
                      {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(financialHealth.nextMilestone.amount)}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Quiet Period Reassurance Banner */}
          {showQuietBanner && (
            <div
              className="rounded-xl p-4 flex items-start gap-3"
              style={{ background: `rgba(201,168,76,0.07)`, border: `1px solid rgba(201,168,76,0.2)` }}
            >
              <span className="text-lg mt-0.5" style={{ color: GOLD }}>✦</span>
              <div>
                <p className="text-sm font-medium" style={{ color: CREAM }}>
                  Work is underway — we'll keep you updated every step of the way.
                </p>
                <p className="text-xs mt-1" style={{ color: MUTED }}>
                  Have questions? <Link href="/portal/messages" className="underline" style={{ color: GOLD }}>Message us anytime.</Link>
                </p>
              </div>
            </div>
          )}

          {/* Recent Photos Strip */}
          {recentPhotos && recentPhotos.length > 0 && (
            <div
              className="rounded-xl p-5 space-y-3"
              style={{ background: CHARCOAL, border: `1px solid rgba(201,168,76,0.12)` }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>Recent Photos</span>
                <Link href="/portal/documents" className="text-xs flex items-center gap-1 hover:opacity-80 transition-opacity" style={{ color: GOLD }}>
                  View all <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {recentPhotos.map((photo) => (
                  <a key={photo.id} href={photo.fileUrl ?? "#"} target="_blank" rel="noopener noreferrer"
                    className="block aspect-square rounded-lg overflow-hidden relative group"
                    style={{ background: "rgba(255,255,255,0.04)" }}
                  >
                    {photo.fileUrl ? (
                      <img
                        src={photo.fileUrl}
                        alt={photo.fileName ?? "Project photo"}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Camera className="h-5 w-5" style={{ color: MUTED }} />
                      </div>
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Recent Activity Feed */}
          {recentActivity && recentActivity.length > 0 && (
            <div
              className="rounded-xl p-5 space-y-4"
              style={{ background: CHARCOAL, border: `1px solid rgba(201,168,76,0.12)` }}
            >
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>Latest Updates</span>
              <div className="space-y-3">
                {recentActivity.map((item, idx) => {
                  const IconMap: Record<string, React.ElementType> = {
                    MessageSquare, Camera, FileText, CheckCircle, Clock,
                  };
                  const Icon = IconMap[item.icon] ?? Clock;
                  return (
                    <div key={idx} className="flex items-start gap-3">
                      <div
                        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
                        style={{ background: `rgba(201,168,76,0.12)` }}
                      >
                        <Icon className="h-3.5 w-3.5" style={{ color: GOLD }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-snug" style={{ color: CREAM }}>{item.description}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
                          {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Milestones timeline */}
          {milestones.length > 0 && (
            <div
              className="rounded-xl overflow-hidden"
              style={{ background: CHARCOAL, border: `1px solid rgba(255,255,255,0.06)` }}
            >
              <div className="px-5 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>
                  Project Steps
                </h2>
              </div>
              <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                {milestones.map((m, idx) => (
                  <div key={m.id} className="flex items-center gap-3 px-5 py-3.5">
                    <StatusIcon status={m.status} />
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-medium ${m.status === "completed" ? "line-through" : ""}`}
                        style={{ color: m.status === "completed" ? MUTED : CREAM }}
                      >
                        {m.title}
                      </p>
                      {m.dueDate && (
                        <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                          {m.status === "completed" ? "Completed" : "Due"}{" "}
                          {format(new Date(m.dueDate), "MMMM d, yyyy")}
                        </p>
                      )}
                    </div>
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
                      style={{
                        background: m.status === "completed"
                          ? `${GREEN}20`
                          : m.status === "delayed"
                          ? `${RED}20`
                          : m.status === "in_progress"
                          ? `${GOLD}20`
                          : "rgba(255,255,255,0.06)",
                        color: m.status === "completed"
                          ? GREEN
                          : m.status === "delayed"
                          ? RED
                          : m.status === "in_progress"
                          ? GOLD
                          : MUTED,
                      }}
                    >
                      {m.status === "in_progress" ? "In Progress" : m.status === "completed" ? "Done" : m.status === "delayed" ? "Delayed" : "Upcoming"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Your Team */}
          <div
            className="rounded-xl p-5 space-y-4"
            style={{ background: CHARCOAL, border: `1px solid rgba(201,168,76,0.15)` }}
          >
            <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>
              Your Team
            </h2>
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
                style={{ background: `${GOLD}25`, color: GOLD, border: `2px solid ${GOLD}40` }}
              >
                CP
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm" style={{ color: CREAM }}>Chad Price</p>
                <p className="text-xs" style={{ color: MUTED }}>Project Manager · Kitchens Plus Upstate</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <a
                    href="tel:8645678777"
                    className="flex items-center gap-1 text-xs transition-colors hover:underline"
                    style={{ color: GOLD }}
                  >
                    <Phone className="h-3 w-3" />
                    864-567-8777
                  </a>
                  <a
                    href="mailto:chad@kitchensplusupstate.com"
                    className="flex items-center gap-1 text-xs transition-colors hover:underline"
                    style={{ color: GOLD }}
                  >
                    <Mail className="h-3 w-3" />
                    Email Chad
                  </a>
                </div>
              </div>
            </div>
          </div>
        </>
      )}


    </div>
  );
}
