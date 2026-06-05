import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { Users, FolderOpen, DollarSign, TrendingUp, Plus, ArrowRight, Calendar, MessageSquare, Camera, FileQuestion } from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { FirstContactCalendar } from "@/components/FirstContactCalendar";

const GOLD = "#BF9A3B";
const COLORS = ["#BF9A3B", "#4CAF7D", "#5B9BD5", "#E8A838", "#E05252"];

function StatCard({ icon: Icon, label, value, sub, color = GOLD, onClick }: any) {
  return (
    <Card className="bg-card border-border cursor-pointer hover:border-primary/40 transition-all duration-200 hover:shadow-lg hover:shadow-black/20" onClick={onClick}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
            <p className="text-3xl font-serif" style={{ color }}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className="p-2.5 rounded-xl" style={{ background: `${color}18` }}>
            <Icon className="h-5 w-5" style={{ color }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    new: { label: "New", color: "#5B9BD5" },
    consultation_scheduled: { label: "Consultation", color: "#9B59B6" },
    visited: { label: "Visited", color: "#8B5CF6" },
    quoted: { label: "Quoted", color: "#E8A838" },
    won: { label: "Won", color: "#4CAF7D" },
    lost: { label: "Lost", color: "#E05252" },
    planning: { label: "Planning", color: "#9B59B6" },
    active: { label: "Active", color: "#4CAF7D" },
    on_hold: { label: "On Hold", color: "#E8A838" },
    completed: { label: "Completed", color: "#4CAF7D" },
    cancelled: { label: "Cancelled", color: "#E05252" },
  };
  const s = map[status] ?? { label: status, color: GOLD };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: `${s.color}20`, color: s.color, border: `1px solid ${s.color}40` }}>
      {s.label}
    </span>
  );
}

function getGreeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    const firstName = (user?.name ?? "Chad").split(" ")[0];
    return `${getGreeting(hour)}, ${firstName}`;
  }, [user?.name]);
  const [revenueView, setRevenueView] = useState<"alltime" | "ytd">("alltime");
  const [pendingView, setPendingView] = useState<"alltime" | "ytd">("alltime");
  const [projectsView, setProjectsView] = useState<"alltime" | "ytd">("alltime");
  const [leadsView, setLeadsView] = useState<"alltime" | "ytd" | "month">("alltime");
  const now = new Date();
  const { data: summary, isLoading } = trpc.reports.summary.useQuery();
  const { data: recentProjects } = trpc.reports.recentProjects.useQuery();
  const { data: recentLeads } = trpc.reports.recentLeads.useQuery();
  const { data: revenueStats } = trpc.invoices.revenueStats.useQuery();
  const { data: monthlyChart } = trpc.reports.monthlyChart.useQuery();

  // Compute filtered values for toggleable cards
  const ytdStart = new Date(now.getFullYear(), 0, 1).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const allLeads = recentLeads ?? [];
  const totalLeadsCount = leadsView === "alltime" ? (summary?.totalLeads ?? 0)
    : leadsView === "ytd" ? allLeads.filter(l => new Date(l.createdAt ?? 0).getTime() >= ytdStart).length
    : allLeads.filter(l => new Date(l.createdAt ?? 0).getTime() >= monthStart).length;
  const wonLeadsCount = leadsView === "alltime" ? (summary?.wonLeads ?? 0)
    : allLeads.filter(l => l.status === "won" && new Date(l.createdAt ?? 0).getTime() >= (leadsView === "ytd" ? ytdStart : monthStart)).length;
  const activeProjectsCount = projectsView === "alltime" ? (summary?.activeProjects ?? 0)
    : (recentProjects ?? []).filter(p => p.status === "active" && new Date((p as any).createdAt ?? 0).getTime() >= ytdStart).length;
  const completedProjectsCount = projectsView === "alltime" ? (summary?.completedProjects ?? 0)
    : (recentProjects ?? []).filter(p => p.status === "completed" && new Date((p as any).createdAt ?? 0).getTime() >= ytdStart).length;
  const pendingRevenue = pendingView === "ytd"
    ? (revenueStats?.pendingYtd ?? summary?.revenuePending ?? 0)
    : (summary?.revenuePending ?? 0);

  const leadPipelineData = [
    { name: "New", value: recentLeads?.filter(l => l.status === "new").length ?? 0 },
    { name: "Visited", value: recentLeads?.filter(l => l.status === "visited").length ?? 0 },
    { name: "Quoted", value: recentLeads?.filter(l => l.status === "quoted").length ?? 0 },
    { name: "Won", value: recentLeads?.filter(l => l.status === "won").length ?? 0 },
    { name: "Lost", value: recentLeads?.filter(l => l.status === "lost").length ?? 0 },
  ];

  const projectStatusData = [
    { name: "Planning", value: recentProjects?.filter(p => p.status === "planning").length ?? 0 },
    { name: "Active", value: recentProjects?.filter(p => p.status === "active").length ?? 0 },
    { name: "On Hold", value: recentProjects?.filter(p => p.status === "on_hold").length ?? 0 },
    { name: "Completed", value: recentProjects?.filter(p => p.status === "completed").length ?? 0 },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-serif" style={{ color: "var(--kp-cream)" }}>{greeting}</h1>
          <p className="text-sm text-muted-foreground mt-1">{format(new Date(), "EEEE, MMMM d, yyyy")} · Kitchens Plus Upstate</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" className="border-border/60 text-sm" onClick={() => setLocation("/leads")}>
            <Plus className="h-4 w-4 mr-1.5" /> New Lead
          </Button>
          <Button size="sm" className="btn-gold text-sm px-4" onClick={() => setLocation("/projects")}>
            <Plus className="h-4 w-4 mr-1.5" /> New Project
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Total Leads with All Time / YTD / Month toggle */}
        <Card className="bg-card border-border cursor-pointer hover:border-primary/40 transition-all duration-200 hover:shadow-lg hover:shadow-black/20" onClick={() => setLocation("/leads")}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Total Leads</p>
                <p className="text-3xl font-serif" style={{ color: "#5B9BD5" }}>{isLoading ? "—" : totalLeadsCount}</p>
                <p className="text-xs text-muted-foreground">
                  {wonLeadsCount} won
                  {leadsView === "month" ? ` · this month` : leadsView === "ytd" ? ` · ${now.getFullYear()}` : " · all time"}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="p-2.5 rounded-xl" style={{ background: "#5B9BD518" }}><Users className="h-5 w-5" style={{ color: "#5B9BD5" }} /></div>
                <div className="flex items-center rounded-full overflow-hidden" style={{ background: "rgba(91,155,213,0.14)", border: "1px solid rgba(91,155,213,0.35)" }}>
                  {(["alltime","ytd","month"] as const).map((v, i) => (
                    <button key={v} onClick={e => { e.stopPropagation(); setLeadsView(v); }}
                      className="px-1.5 py-0.5 text-[9px] font-bold select-none transition-colors"
                      style={{ color: "#5B9BD5", opacity: leadsView === v ? 1 : 0.4, borderLeft: i > 0 ? "1px solid rgba(91,155,213,0.3)" : undefined }}>
                      {v === "alltime" ? "All" : v === "ytd" ? "YTD" : "Mo"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        {/* Active Projects with All Time / YTD toggle */}
        <Card className="bg-card border-border cursor-pointer hover:border-primary/40 transition-all duration-200 hover:shadow-lg hover:shadow-black/20" onClick={() => setLocation("/projects")}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Active Projects</p>
                <p className="text-3xl font-serif" style={{ color: "#4CAF7D" }}>{isLoading ? "—" : activeProjectsCount}</p>
                <p className="text-xs text-muted-foreground">
                  {completedProjectsCount} completed{projectsView === "ytd" ? ` · ${now.getFullYear()}` : " · all time"}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="p-2.5 rounded-xl" style={{ background: "#4CAF7D18" }}><FolderOpen className="h-5 w-5" style={{ color: "#4CAF7D" }} /></div>
                <button onClick={e => { e.stopPropagation(); setProjectsView(v => v === "alltime" ? "ytd" : "alltime"); }}
                  className="flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold select-none"
                  style={{ background: "rgba(76,175,125,0.14)", border: "1px solid rgba(76,175,125,0.35)", color: "#4CAF7D" }}>
                  <span style={{ opacity: projectsView === "alltime" ? 1 : 0.4 }}>All Time</span>
                  <span className="mx-1" style={{ opacity: 0.4 }}>|</span>
                  <span style={{ opacity: projectsView === "ytd" ? 1 : 0.4 }}>YTD</span>
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
        {/* Revenue Collected with All Time / YTD toggle */}
        <Card className="bg-card border-border cursor-pointer hover:border-primary/40 transition-all duration-200 hover:shadow-lg hover:shadow-black/20" onClick={() => setLocation("/invoices")}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Revenue Collected</p>
                </div>
                <p className="text-3xl font-serif" style={{ color: GOLD }}>
                  {revenueStats
                    ? `$${(revenueView === "ytd" ? revenueStats.yearToDate : revenueStats.allTime).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                    : (isLoading ? "—" : `$${(summary?.revenueCollected ?? 0).toLocaleString()}`)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {revenueView === "ytd" ? `Year to date · ${new Date().getFullYear()}` : "All time · since first payment"}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="p-2.5 rounded-xl" style={{ background: `${GOLD}18` }}>
                  <DollarSign className="h-5 w-5" style={{ color: GOLD }} />
                </div>
                {/* Toggle */}
                <button
                  onClick={e => { e.stopPropagation(); setRevenueView(v => v === "alltime" ? "ytd" : "alltime"); }}
                  className="flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors select-none"
                  style={{ background: "rgba(191,154,59,0.14)", border: `1px solid rgba(191,154,59,0.35)`, color: GOLD }}>
                  <span style={{ opacity: revenueView === "alltime" ? 1 : 0.4 }}>All Time</span>
                  <span className="mx-1" style={{ opacity: 0.4 }}>|</span>
                  <span style={{ opacity: revenueView === "ytd" ? 1 : 0.4 }}>YTD</span>
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
        {/* Revenue Pending with All Time / YTD toggle */}
        <Card className="bg-card border-border cursor-pointer hover:border-primary/40 transition-all duration-200 hover:shadow-lg hover:shadow-black/20" onClick={() => setLocation("/invoices")}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Revenue Pending</p>
                <p className="text-3xl font-serif" style={{ color: "#E8A838" }}>
                  {isLoading ? "—" : `$${pendingRevenue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {pendingView === "ytd" ? `Outstanding · ${now.getFullYear()}` : "Outstanding invoices · all time"}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="p-2.5 rounded-xl" style={{ background: "#E8A83818" }}><TrendingUp className="h-5 w-5" style={{ color: "#E8A838" }} /></div>
                <button onClick={e => { e.stopPropagation(); setPendingView(v => v === "alltime" ? "ytd" : "alltime"); }}
                  className="flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold select-none"
                  style={{ background: "rgba(232,168,56,0.14)", border: "1px solid rgba(232,168,56,0.35)", color: "#E8A838" }}>
                  <span style={{ opacity: pendingView === "alltime" ? 1 : 0.4 }}>All Time</span>
                  <span className="mx-1" style={{ opacity: 0.4 }}>|</span>
                  <span style={{ opacity: pendingView === "ytd" ? 1 : 0.4 }}>YTD</span>
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
        {/* Open RFIs — unanswered requests across all projects */}
        <Card
          className="bg-card border-border cursor-pointer hover:border-primary/40 transition-all duration-200 hover:shadow-lg hover:shadow-black/20"
          onClick={() => setLocation("/projects")}
          style={(summary?.openRfisCount ?? 0) > 0 ? { borderColor: "rgba(224,82,82,0.5)" } : {}}
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Open RFIs</p>
                <p className="text-3xl font-serif" style={{ color: (summary?.openRfisCount ?? 0) > 0 ? "#E05252" : "#4CAF7D" }}>
                  {isLoading ? "—" : (summary?.openRfisCount ?? 0)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(summary?.openRfisCount ?? 0) === 0
                    ? "All RFIs reviewed"
                    : `${summary?.openRfisCount} awaiting response`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="p-2.5 rounded-xl" style={{ background: (summary?.openRfisCount ?? 0) > 0 ? "rgba(224,82,82,0.12)" : "rgba(76,175,125,0.12)" }}>
                  <FileQuestion className="h-5 w-5" style={{ color: (summary?.openRfisCount ?? 0) > 0 ? "#E05252" : "#4CAF7D" }} />
                </div>
                {(summary?.openRfisCount ?? 0) > 0 && (
                  <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                    style={{ background: "rgba(224,82,82,0.15)", color: "#E05252", border: "1px solid rgba(224,82,82,0.35)" }}>
                    Action Needed
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Revenue chart + First Contact Calendar — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
        {/* Revenue Collected + Jobs Awarded chart */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-serif text-foreground">
                {new Date().getFullYear()} — Revenue Collected &amp; Jobs Awarded by Month
              </CardTitle>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: GOLD }} />Revenue Collected</span>
                <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#4CAF7D" }} />Jobs Awarded Value</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyChart ?? []} margin={{ top: 5, right: 10, left: -10, bottom: 5 }} barCategoryGap="30%" barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="month" tick={{ fill: "var(--kp-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--kp-muted)", fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`} />
                <Tooltip
                  contentStyle={{ background: "var(--kp-charcoal-light)", border: "1px solid var(--kp-charcoal-dark)", borderRadius: 8, color: "var(--kp-cream)" }}
                  cursor={{ fill: "rgba(191,154,59,0.06)" }}
                  formatter={(value: any, name: string) => [
                    `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 0 })}`,
                    name === "revenue" ? "Revenue Collected" : "Jobs Awarded Value"
                  ]}
                />
                <Bar dataKey="revenue" fill={GOLD} radius={[4, 4, 0, 0]} name="revenue" />
                <Bar dataKey="jobsValue" fill="#4CAF7D" radius={[4, 4, 0, 0]} name="jobsValue" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* First Contact Calendar */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-serif text-foreground">First Contact Meetings</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <FirstContactCalendar />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2"><CardTitle className="text-base font-serif text-foreground">Lead Pipeline</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={leadPipelineData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" tick={{ fill: "var(--kp-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--kp-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "var(--kp-charcoal-light)", border: "1px solid var(--kp-charcoal-dark)", borderRadius: 8, color: "var(--kp-cream)" }} cursor={{ fill: "rgba(191,154,59,0.08)" }} />
                <Bar dataKey="value" fill={GOLD} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2"><CardTitle className="text-base font-serif text-foreground">Project Status</CardTitle></CardHeader>
          <CardContent>
            {projectStatusData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">No projects yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={projectStatusData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                    {projectStatusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Legend formatter={(v) => <span style={{ color: "var(--kp-muted)", fontSize: 12 }}>{v}</span>} />
                  <Tooltip contentStyle={{ background: "var(--kp-charcoal-light)", border: "1px solid var(--kp-charcoal-dark)", borderRadius: 8, color: "var(--kp-cream)" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Field Capture quick-access button (owner only) ─────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">Leads / Content</h2>
        </div>
        <Button
          size="sm"
          onClick={() => setLocation("/field-capture")}
          className="bg-[#BF9A3B] hover:bg-[#D4A853] text-black font-semibold rounded-xl px-4 gap-2"
        >
          <Camera className="h-4 w-4" />
          Field Capture
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-serif text-foreground">Recent Leads</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7" onClick={() => setLocation("/leads")}>
              View all <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {!recentLeads || recentLeads.length === 0 ? (
              <div className="px-6 pb-6 text-sm text-muted-foreground">No leads yet. Add your first lead!</div>
            ) : (
              <div className="divide-y divide-border">
                {recentLeads.slice(0, 5).map(lead => (
                  <div key={lead.id} className="flex items-center justify-between px-6 py-3 hover:bg-accent/30 cursor-pointer transition-colors" onClick={() => setLocation("/leads")}>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <p className="text-sm font-medium truncate">{lead.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{lead.projectType ?? "—"} · {lead.phone ?? lead.email ?? "—"}</p>
                    </div>
                    <StatusBadge status={lead.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-serif text-foreground">Recent Projects</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7" onClick={() => setLocation("/projects")}>
              View all <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {!recentProjects || recentProjects.length === 0 ? (
              <div className="px-6 pb-6 text-sm text-muted-foreground">No projects yet.</div>
            ) : (
              <div className="divide-y divide-border">
                {recentProjects.slice(0, 5).map(project => (
                  <div key={project.id} className="flex items-center justify-between px-6 py-3 hover:bg-accent/30 cursor-pointer transition-colors" onClick={() => setLocation(`/projects/${project.id}`)}>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <p className="text-sm font-medium truncate">{project.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{project.projectType ?? "—"} · {project.address ?? "No address"}</p>
                    </div>
                    <StatusBadge status={project.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3"><CardTitle className="text-base font-serif text-foreground">Quick Actions</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: Users, label: "Add Lead", path: "/leads", color: "#5B9BD5" },
              { icon: FolderOpen, label: "New Project", path: "/projects", color: "#4CAF7D" },
              { icon: MessageSquare, label: "Send Message", path: "/messages", color: GOLD },
              { icon: Calendar, label: "Schedule Event", path: "/schedule", color: "#9B59B6" },
            ].map(action => (
              <button key={action.path} onClick={() => setLocation(action.path)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-primary/40 hover:bg-accent/30 transition-all duration-200 text-center">
                <div className="p-2 rounded-lg" style={{ background: `${action.color}18` }}>
                  <action.icon className="h-5 w-5" style={{ color: action.color }} />
                </div>
                <span className="text-xs font-medium text-foreground">{action.label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
