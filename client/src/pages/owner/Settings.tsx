import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings as SettingsIcon, CreditCard, BookOpen, Bell, Zap, Users, Download, Archive, RotateCcw, User, Briefcase } from "lucide-react";
import { toast } from "sonner";
const GOLD = "#BF9A3B";

// ─── Archive Tab Component ───────────────────────────────────────────────────
function ArchiveTab() {
  const { data: archivedLeads, refetch: refetchLeads } = trpc.leads.listArchived.useQuery();
  const { data: archivedClients, refetch: refetchClients } = trpc.clients.listArchived.useQuery();
  const { data: archivedProjects, refetch: refetchProjects } = trpc.projects.listArchived.useQuery();

  // Two-step restore confirmation state for projects, leads, and clients
  const [confirmRestoreId, setConfirmRestoreId] = useState<number | null>(null);
  const [confirmRestoreLeadId, setConfirmRestoreLeadId] = useState<number | null>(null);
  const [confirmRestoreClientId, setConfirmRestoreClientId] = useState<number | null>(null);

  const unarchiveLead = trpc.leads.unarchive.useMutation({
    onSuccess: () => { refetchLeads(); toast.success("Lead restored"); },
    onError: (e: any) => toast.error(e.message),
  });
  const unarchiveClient = trpc.clients.unarchive.useMutation({
    onSuccess: () => { refetchClients(); toast.success("Client restored"); },
    onError: (e: any) => toast.error(e.message),
  });
  const restoreProject = trpc.projects.restore.useMutation({
    onSuccess: () => { refetchProjects(); toast.success("Project restored"); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteLeadWithData = trpc.leads.deleteWithData.useMutation({
    onSuccess: () => { refetchLeads(); toast.success("Lead permanently deleted"); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteClientWithData = trpc.clients.deleteWithData.useMutation({
    onSuccess: () => { refetchClients(); toast.success("Client permanently deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const totalArchived = (archivedLeads?.length ?? 0) + (archivedClients?.length ?? 0) + (archivedProjects?.length ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
        <Archive className="h-5 w-5 text-amber-500 shrink-0" />
        <div>
          <p className="text-sm font-medium text-foreground">Archived Records</p>
          <p className="text-xs text-muted-foreground">
            {totalArchived === 0 ? "No archived records." : `${totalArchived} archived record${totalArchived !== 1 ? "s" : ""}.`} Archived items are hidden from all lists but their data is preserved. You can restore or permanently delete them here.
          </p>
        </div>
      </div>

      {/* Archived Leads */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium text-foreground flex items-center gap-2">
            <User className="h-4 w-4" style={{ color: GOLD }} />
            Archived Leads
            {(archivedLeads?.length ?? 0) > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-400">{archivedLeads!.length}</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!archivedLeads || archivedLeads.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No archived leads.</p>
          ) : (
            <div className="space-y-2">
              {archivedLeads.map(lead => (
                <div key={lead.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-background/40">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{lead.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {lead.email ?? lead.phone ?? "No contact"}
                      {lead.archivedAt && ` · Archived ${new Date(lead.archivedAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0 ml-3">
                    {confirmRestoreLeadId === lead.id ? (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmRestoreLeadId(null)}>Cancel</Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1"
                          style={{ background: GOLD, color: "#1A1A1A" }}
                          disabled={unarchiveLead.isPending}
                          onClick={() => { unarchiveLead.mutate({ id: lead.id }); setConfirmRestoreLeadId(null); }}
                        >
                          <RotateCcw className="h-3 w-3" />
                          Confirm Restore
                        </Button>
                      </>
                    ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 border-amber-500/40 hover:bg-amber-500/10"
                      onClick={() => setConfirmRestoreLeadId(lead.id)}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Restore
                    </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-destructive hover:bg-destructive/10"
                      disabled={deleteLeadWithData.isPending}
                      onClick={() => { if (confirm(`Permanently delete "${lead.name}" and all data?`)) deleteLeadWithData.mutate({ id: lead.id }); }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Archived Clients */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium text-foreground flex items-center gap-2">
            <Briefcase className="h-4 w-4" style={{ color: GOLD }} />
            Archived Clients
            {(archivedClients?.length ?? 0) > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-400">{archivedClients!.length}</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!archivedClients || archivedClients.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No archived clients.</p>
          ) : (
            <div className="space-y-2">
              {archivedClients.map(client => (
                <div key={client.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-background/40">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{client.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {client.email ?? client.phone ?? "No contact"}
                      {client.archivedAt && ` · Archived ${new Date(client.archivedAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0 ml-3">
                    {confirmRestoreClientId === client.id ? (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmRestoreClientId(null)}>Cancel</Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1"
                          style={{ background: GOLD, color: "#1A1A1A" }}
                          disabled={unarchiveClient.isPending}
                          onClick={() => { unarchiveClient.mutate({ id: client.id }); setConfirmRestoreClientId(null); }}
                        >
                          <RotateCcw className="h-3 w-3" />
                          Confirm Restore
                        </Button>
                      </>
                    ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 border-amber-500/40 hover:bg-amber-500/10"
                      onClick={() => setConfirmRestoreClientId(client.id)}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Restore
                    </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-destructive hover:bg-destructive/10"
                      disabled={deleteClientWithData.isPending}
                      onClick={() => { if (confirm(`Permanently delete "${client.name}" and all data?`)) deleteClientWithData.mutate({ id: client.id }); }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Archived Projects */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium text-foreground flex items-center gap-2">
            <Archive className="h-4 w-4" style={{ color: GOLD }} />
            Archived Projects
            {(archivedProjects?.length ?? 0) > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-400">{archivedProjects!.length}</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!archivedProjects || archivedProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No archived projects.</p>
          ) : (
            <div className="space-y-2">
              {archivedProjects.map(project => (
                <div key={project.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-background/40">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{project.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {project.projectType ?? project.status ?? ""}
                      {project.address ? ` · ${project.address}` : ""}
                      {project.archivedAt && ` · Archived ${new Date(project.archivedAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0 ml-3">
                    {confirmRestoreId === project.id ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-border hover:bg-muted"
                          onClick={() => setConfirmRestoreId(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1 bg-amber-600 hover:bg-amber-700 text-white"
                          disabled={restoreProject.isPending}
                          onClick={() => {
                            restoreProject.mutate({ id: project.id });
                            setConfirmRestoreId(null);
                          }}
                        >
                          <RotateCcw className="h-3 w-3" />
                          Confirm Restore
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1 border-amber-500/40 hover:bg-amber-500/10"
                        onClick={() => setConfirmRestoreId(project.id)}
                      >
                        <RotateCcw className="h-3 w-3" />
                        Restore
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Settings() {
  const { data: bkSettings, refetch: refetchBk } = trpc.bookkeeping.getSettings.useQuery();
  const updateBk = trpc.bookkeeping.updateSettings.useMutation({ onSuccess: () => { refetchBk(); toast.success("Bookkeeping settings saved"); } });
  const updateSetting = trpc.settings.set.useMutation({ onSuccess: () => toast.success("Setting saved") });
  const runCheckins = trpc.automation.runCheckins.useMutation({ onSuccess: (d) => toast.success(`Automation ran: ${d.processed} actions taken`) });
  const { data: exportData } = trpc.bookkeeping.exportData.useQuery({});
  const { data: systemConfig } = trpc.settings.getSystemConfig.useQuery();
  const squareConfigured = systemConfig?.squareConfigured ?? true; // default true to avoid false alarm before load

  const [bookkeeperEmail, setBookkeeperEmail] = useState("");
  const [exportDay, setExportDay] = useState("1");

  const quickbooksEnabled = bkSettings?.quickbooks_enabled === "true";
  const exporterEmail = bkSettings?.bookkeeper_email ?? "";

  const downloadExport = () => {
    if (!exportData) return;
    const csv = [
      "Invoice #,Amount,Type,Paid At,Project ID",
      ...(exportData.invoices ?? []).map(i =>
        `${i.invoiceNumber ?? i.id},${i.amount},${i.type},${i.paidAt ? new Date(i.paidAt).toLocaleDateString() : ""},${i.projectId}`
      )
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kitchensplus-${exportData.period}-export.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export downloaded");
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl" style={{ background: `${GOLD}20` }}>
          <SettingsIcon className="h-5 w-5" style={{ color: GOLD }} />
        </div>
        <div>
          <h1 className="text-3xl font-serif text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">Configure your CRM, integrations, and automation</p>
        </div>
      </div>

      <Tabs defaultValue="bookkeeping" className="space-y-4">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="bookkeeping"><BookOpen className="h-3.5 w-3.5 mr-1.5" />Bookkeeping</TabsTrigger>
          <TabsTrigger value="payments"><CreditCard className="h-3.5 w-3.5 mr-1.5" />Payments</TabsTrigger>
          <TabsTrigger value="automation"><Zap className="h-3.5 w-3.5 mr-1.5" />Automation</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="h-3.5 w-3.5 mr-1.5" />Notifications</TabsTrigger>
          <TabsTrigger value="team"><Users className="h-3.5 w-3.5 mr-1.5" />Team</TabsTrigger>
          <TabsTrigger value="archive"><Archive className="h-3.5 w-3.5 mr-1.5" />Archive</TabsTrigger>
        </TabsList>

        <TabsContent value="bookkeeping" className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-base font-medium text-foreground">Bookkeeping Integration</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between py-3 border-b border-border/50">
                <div>
                  <p className="text-sm font-medium text-foreground">QuickBooks Online Integration</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Sync invoices and payments directly to QuickBooks Online</p>
                </div>
                <Switch checked={quickbooksEnabled} onCheckedChange={(v) => updateBk.mutate({ quickbooksEnabled: v })} />
              </div>
              {quickbooksEnabled && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-400">
                  QuickBooks Online OAuth — click "Connect QuickBooks" in the Invoices page to authorize.
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Monthly Export — Bookkeeper Email</Label>
                <p className="text-xs text-muted-foreground">If QuickBooks is off, a monthly CSV export will be emailed to this address.</p>
                <div className="flex gap-2">
                  <Input className="bg-background border-border flex-1" placeholder={exporterEmail || "bookkeeper@example.com"} value={bookkeeperEmail} onChange={e => setBookkeeperEmail(e.target.value)} />
                  <Button className="btn-gold shrink-0" onClick={() => { if (bookkeeperEmail) updateBk.mutate({ bookkeeperEmail }); }}>Save</Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Monthly Export Day (1–28)</Label>
                <div className="flex gap-2">
                  <Input className="bg-background border-border w-24" type="number" min={1} max={28} value={exportDay} onChange={e => setExportDay(e.target.value)} />
                  <Button className="btn-gold" onClick={() => updateBk.mutate({ exportDay: parseInt(exportDay) })}>Save</Button>
                </div>
              </div>
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs text-muted-foreground mb-2">Current month: <strong className="text-foreground">{exportData?.period}</strong> · {exportData?.paidInvoiceCount ?? 0} paid invoices · ${(exportData?.totalRevenue ?? 0).toLocaleString()} revenue</p>
                <Button variant="outline" className="border-border/60 text-sm" onClick={downloadExport}>
                  <Download className="h-4 w-4 mr-2" />Download CSV Export
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-base font-medium text-foreground">Square Payments</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {squareConfigured ? (
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-xs text-green-400">
                  ✅ Square is configured. Payment links are generated automatically for every invoice sent.
                </div>
              ) : (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 space-y-2">
                  <p className="text-sm font-semibold text-amber-400">⚠️ Square Not Connected</p>
                  <p className="text-xs text-muted-foreground">To enable online payment links on invoices, add your Square credentials as environment secrets:</p>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                    <li><code className="bg-muted px-1 rounded">SQUARE_ACCESS_TOKEN</code> — from Square Developer Dashboard</li>
                    <li><code className="bg-muted px-1 rounded">SQUARE_LOCATION_ID</code> — your Square location ID</li>
                    <li><code className="bg-muted px-1 rounded">SQUARE_WEBHOOK_SIGNATURE_KEY</code> — for payment webhooks</li>
                  </ul>
                  <p className="text-xs text-muted-foreground">Once set, invoices will automatically include a "Pay Now" button linked to a secure Square checkout page.</p>
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Default Deposit Percentage</Label>
                <div className="flex gap-2 items-center">
                  <Input className="bg-background border-border w-24" type="number" min={0} max={100} defaultValue={50} onChange={e => updateSetting.mutate({ key: 'deposit_percent', value: e.target.value })} />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Billing Type Default</Label>
                <Select defaultValue="deposit_then_final" onValueChange={v => updateSetting.mutate({ key: 'billing_type_default', value: v })}>
                  <SelectTrigger className="bg-background border-border w-64"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deposit_then_final">50% Deposit → Final Balance</SelectItem>
                    <SelectItem value="progressive">Progressive Billing (milestone-based)</SelectItem>
                    <SelectItem value="full_upfront">Full Amount Upfront</SelectItem>
                    <SelectItem value="net30">Net 30 Invoice</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automation" className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-base font-medium text-foreground">Automated SMS Triggers</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between py-3 border-b border-border/50">
                  <div>
                    <p className="text-sm font-medium text-foreground">Day 2 Check-In SMS</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Sends a friendly check-in to the client 2 days after project is completed</p>
                    <p className="text-xs text-muted-foreground mt-1 italic">From: +1 (833) 518-4811</p>
                  </div>
                  <Switch defaultChecked onCheckedChange={v => updateSetting.mutate({ key: 'auto_day2_checkin', value: String(v) })} />
                </div>
                <div className="flex items-start justify-between py-3 border-b border-border/50">
                  <div>
                    <p className="text-sm font-medium text-foreground">Day 5 Review Request SMS</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Sends a Google review request link 5 days after project is completed</p>
                    <p className="text-xs text-muted-foreground mt-1 italic">Links to: g.page/r/CUZLLVEKNub9EBM/review</p>
                  </div>
                  <Switch defaultChecked onCheckedChange={v => updateSetting.mutate({ key: 'auto_day5_review', value: String(v) })} />
                </div>
                <div className="flex items-start justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">AI Update Drafts</p>
                    <p className="text-xs text-muted-foreground mt-0.5">AI generates friendly, bullet-point project updates for your approval before sending</p>
                  </div>
                  <Switch defaultChecked onCheckedChange={v => updateSetting.mutate({ key: 'auto_ai_drafts', value: String(v) })} />
                </div>
              </div>
              <div className="pt-2 border-t border-border/50">
                <Button className="btn-gold text-sm" onClick={() => runCheckins.mutate()} disabled={runCheckins.isPending}>
                  <Zap className="h-4 w-4 mr-2" />{runCheckins.isPending ? "Running..." : "Run Automation Now"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-base font-medium text-foreground">Notification Preferences</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {[
                { key: "notify_new_lead", label: "New Lead Submitted", desc: "Get notified when a new lead comes in" },
                { key: "notify_estimate_approved", label: "Estimate Approved by Client", desc: "When a client approves an estimate" },
                { key: "notify_invoice_paid", label: "Invoice Paid", desc: "When a Square payment is received" },
                { key: "notify_vendor_quote", label: "Vendor Quote Submitted", desc: "When a vendor submits a new quote" },
                { key: "notify_message_received", label: "New Message Received", desc: "When a client or vendor sends a message" },
              ].map(n => (
                <div key={n.key} className="flex items-start justify-between py-2.5 border-b border-border/30 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{n.label}</p>
                    <p className="text-xs text-muted-foreground">{n.desc}</p>
                  </div>
                  <Switch defaultChecked onCheckedChange={v => updateSetting.mutate({ key: n.key, value: String(v) })} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="archive" className="space-y-4">
          <ArchiveTab />
        </TabsContent>

        <TabsContent value="team" className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-base font-medium text-foreground">Team Members</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">Manage crew members and their access. Go to the <strong className="text-foreground">Crew</strong> page to add, edit, or deactivate team members.</p>
              <div className="bg-card border border-border rounded-lg p-4">
                <p className="text-sm font-medium text-foreground">Owner / Admin</p>
                <p className="text-xs text-muted-foreground mt-0.5">chad@cpenterprisessc.com · Full access</p>
              </div>
              <p className="text-xs text-muted-foreground mt-3">Additional crew members can be added from the Crew page. Each member gets a login link via email.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
