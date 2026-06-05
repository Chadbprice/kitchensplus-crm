import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { DollarSign, TrendingUp, Users, Briefcase, Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

const GOLD = "#BF9A3B";
const COLORS = [GOLD, "#5B9BD5", "#4CAF7D", "#E8A838", "#E05252", "#9C6FDE"];

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => currentYear - i);

export default function Reports() {
  const { data: stats } = trpc.reports.totalStats.useQuery();
  const { data: revenueData } = trpc.reports.revenueByMonth.useQuery();
  const { data: projectsByType } = trpc.reports.projectsByType.useQuery();

  // CSV export state
  const [exportYear, setExportYear] = useState(currentYear);
  const [exportMonth, setExportMonth] = useState(new Date().getMonth() + 1); // 1-based
  const [isExporting, setIsExporting] = useState(false);

  const exportQuery = trpc.reports.exportPaymentsCsv.useQuery(
    { year: exportYear, month: exportMonth },
    { enabled: false }
  );

  async function handleExport() {
    setIsExporting(true);
    try {
      const result = await exportQuery.refetch();
      const data = result.data;
      if (!data || !data.csv) {
        toast.info("No payments found for that month.");
        return;
      }
      // Trigger browser download
      const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = data.filename ?? `payments_${exportYear}_${String(exportMonth).padStart(2, "0")}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data.rowCount} payment${data.rowCount === 1 ? "" : "s"} — $${Number(data.totalAmount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total`);
    } catch (err: any) {
      toast.error(err?.message ?? "Export failed");
    } finally {
      setIsExporting(false);
    }
  }

  const kpis = [
    { label: "Total Revenue", value: `$${Number(stats?.totalRevenue ?? 0).toLocaleString()}`, icon: DollarSign, color: GOLD },
    { label: "Active Projects", value: stats?.activeProjects ?? 0, icon: Briefcase, color: "#5B9BD5" },
    { label: "Total Clients", value: stats?.totalClients ?? 0, icon: Users, color: "#4CAF7D" },
    { label: "Avg Project Value", value: `$${Number(stats?.avgProjectValue ?? 0).toLocaleString()}`, icon: TrendingUp, color: "#9C6FDE" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif" style={{ color: "var(--kp-cream)" }}>Reports & Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Business performance overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(kpi => (
          <Card key={kpi.label} className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground uppercase tracking-widest">{kpi.label}</p>
                <kpi.icon className="h-4 w-4" style={{ color: kpi.color }} />
              </div>
              <p className="text-2xl font-serif" style={{ color: kpi.color }}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Revenue by Month</CardTitle>
          </CardHeader>
          <CardContent>
            {revenueData && revenueData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={revenueData}>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#8A8B82" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#8A8B82" }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString()}`, "Revenue"]} contentStyle={{ background: "#1A1B17", border: "1px solid #3A3B35", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="revenue" fill={GOLD} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No revenue data yet</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Projects by Type</CardTitle>
          </CardHeader>
          <CardContent>
            {projectsByType && projectsByType.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={projectsByType} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={80}
                    label={({ type, percent }: any) => `${type} ${(percent * 100).toFixed(0)}%`}>
                    {projectsByType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1A1B17", border: "1px solid #3A3B35", borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No project data yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Monthly Payments CSV Export ─────────────────────────────────────── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" style={{ color: GOLD }} />
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-widest">
              Export Monthly Payments
            </CardTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Download a CSV of all recorded payments for any month — includes client name, project, invoice number, amount, method, and Square ID. Ready to hand to your accountant.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            {/* Month selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Month</label>
              <Select value={String(exportMonth)} onValueChange={v => setExportMonth(Number(v))}>
                <SelectTrigger className="bg-background border-border w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((name, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Year selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Year</label>
              <Select value={String(exportYear)} onValueChange={v => setExportYear(Number(v))}>
                <SelectTrigger className="bg-background border-border w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEAR_OPTIONS.map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Export button */}
            <Button
              className="btn-gold flex items-center gap-2"
              onClick={handleExport}
              disabled={isExporting}
            >
              {isExporting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Exporting…</>
              ) : (
                <><Download className="h-4 w-4" /> Export {MONTH_NAMES[exportMonth - 1]} {exportYear}</>
              )}
            </Button>
          </div>

          {/* Column legend */}
          <div className="mt-4 flex flex-wrap gap-2">
            {["Date","Invoice #","Invoice Type","Client","Project","Invoice Total","Payment Amount","Method","Note","Square ID"].map(col => (
              <span key={col} className="text-[10px] px-2 py-0.5 rounded-full bg-background border border-border/60 text-muted-foreground">
                {col}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
