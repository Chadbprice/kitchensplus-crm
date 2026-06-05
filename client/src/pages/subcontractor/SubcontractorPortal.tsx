import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  HardHat,
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  ShieldX,
  ExternalLink,
  LogOut,
  Phone,
  Mail,
  Wrench,
  Trophy,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663481717136/NJbAuvnBiksaabdpS5d8M3/kitchensplus_logo_0e432498.webp";

// ─── Portal Login ─────────────────────────────────────────────────────────────

function PortalLogin({ token, onSuccess }: { token: string; onSuccess: (data: any) => void }) {
  
  const verifyMutation = trpc.subcontractors.verifyPortalToken.useMutation({
    onSuccess: (data) => {
      if (data.valid) {
        onSuccess(data.subcontractor);
      } else {
        toast({ title: "Invalid or expired link", description: "Please request a new portal link.", variant: "destructive" });
      }
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (token) {
      verifyMutation.mutate({ token });
    }
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--kp-charcoal-dark)" }}>
      <div className="flex flex-col items-center gap-6 p-8 max-w-sm w-full text-center">
        <img src={LOGO_URL} alt="Kitchens Plus Upstate" className="h-14 object-contain" />
        <div>
          <h1 className="text-2xl font-serif mb-2" style={{ color: "var(--kp-cream)" }}>Subcontractor Portal</h1>
          <p className="text-sm" style={{ color: "var(--kp-muted)" }}>
            {verifyMutation.isPending ? "Verifying your access link..." : "Authenticating..."}
          </p>
        </div>
        {verifyMutation.isPending && (
          <div className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--kp-gold)" }} />
        )}
        {!verifyMutation.isPending && !verifyMutation.isSuccess && (
          <p className="text-sm" style={{ color: "#C62828" }}>
            This link may have expired. Please contact Kitchens Plus Upstate for a new access link.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Portal Dashboard ─────────────────────────────────────────────────────────

function PortalDashboard({ token, sub }: { token: string; sub: any }) {
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadDocType, setUploadDocType] = useState<"coi" | "workers_comp" | "license" | "w9" | "other">("coi");
  const [uploadExpiryDate, setUploadExpiryDate] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { data, refetch } = trpc.subcontractors.getPortalData.useQuery({ token });

  const uploadMutation = trpc.subcontractors.portalUploadDoc.useMutation({
    onSuccess: () => {
      toast({ title: "Document uploaded", description: "Your document has been submitted for review." });
      setUploadFile(null);
      setUploadExpiryDate("");
      refetch();
    },
    onError: (err) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  const handleUpload = useCallback(async () => {
    if (!uploadFile) return;
    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = (e.target?.result as string).split(",")[1];
        uploadMutation.mutate({
          token,
          docType: uploadDocType,
          fileName: uploadFile.name,
          fileDataBase64: base64,
          mimeType: uploadFile.type || "application/pdf",
          expiryDate: uploadExpiryDate || undefined,
        });
      };
      reader.readAsDataURL(uploadFile);
    } finally {
      setIsUploading(false);
    }
  }, [uploadFile, uploadDocType, uploadExpiryDate, token, uploadMutation]);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--kp-gold)" }} />
      </div>
    );
  }

  const { subcontractor, docs = [], contracts = [], comms = [], awardCandidates = [] } = data;
  const pendingAwards = awardCandidates.filter((a: any) => a.status === "awarded");

  const DOC_TYPE_LABELS: Record<string, string> = {
    coi: "Certificate of Insurance (COI)",
    workers_comp: "Workers' Compensation",
    license: "Contractor License",
    w9: "W-9 Form",
    other: "Other",
  };

  const DOC_TYPES = [
    { value: "coi", label: "Certificate of Insurance (COI)" },
    { value: "workers_comp", label: "Workers' Compensation" },
    { value: "license", label: "Contractor License" },
    { value: "w9", label: "W-9 Form" },
    { value: "other", label: "Other Document" },
  ];

  const complianceStatus = subcontractor.complianceStatus;
  const coiApproved = docs.some((d: any) => d.docType === "coi" && d.status === "approved");
  const wcApproved = docs.some((d: any) => d.docType === "workers_comp" && d.status === "approved");

  return (
    <div className="min-h-screen" style={{ background: "var(--kp-charcoal-dark)" }}>
      {/* Header */}
      <header className="border-b px-6 py-4 flex items-center justify-between" style={{ borderColor: "rgba(191,154,59,0.15)", background: "var(--kp-charcoal)" }}>
        <div className="flex items-center gap-4">
          <img src={LOGO_URL} alt="Kitchens Plus Upstate" className="h-9 object-contain" />
          <div className="h-6 w-px" style={{ background: "rgba(255,255,255,0.1)" }} />
          <div>
            <p className="text-xs" style={{ color: "var(--kp-muted)" }}>Subcontractor Portal</p>
            <p className="text-sm font-semibold" style={{ color: "var(--kp-cream)" }}>{subcontractor.companyName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Compliance status pill */}
          {complianceStatus === "compliant" ? (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium" style={{ background: "rgba(46,125,50,0.15)", color: "#2E7D32", border: "1px solid rgba(46,125,50,0.3)" }}>
              <ShieldCheck className="h-3.5 w-3.5" /> Compliant
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium" style={{ background: "rgba(198,40,40,0.12)", color: "#C62828", border: "1px solid rgba(198,40,40,0.3)" }}>
              <AlertTriangle className="h-3.5 w-3.5" /> Action Required
            </span>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Welcome card */}
        <Card className="mb-6" style={{ background: "rgba(191,154,59,0.08)", border: "1px solid rgba(191,154,59,0.2)" }}>
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl flex items-center justify-center font-bold text-lg shrink-0"
                style={{ background: "rgba(191,154,59,0.2)", color: "var(--kp-gold)" }}>
                {subcontractor.companyName.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: "var(--kp-cream)" }}>
                  Welcome, {subcontractor.contactName || subcontractor.companyName}
                </h2>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {subcontractor.trade && (
                    <span className="flex items-center gap-1 text-xs" style={{ color: "var(--kp-muted)" }}>
                      <Wrench className="h-3 w-3" /> {subcontractor.trade}
                    </span>
                  )}
                  {subcontractor.phone && (
                    <span className="flex items-center gap-1 text-xs" style={{ color: "var(--kp-muted)" }}>
                      <Phone className="h-3 w-3" /> {subcontractor.phone}
                    </span>
                  )}
                  {subcontractor.email && (
                    <span className="flex items-center gap-1 text-xs" style={{ color: "var(--kp-muted)" }}>
                      <Mail className="h-3 w-3" /> {subcontractor.email}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Required compliance alert */}
        {(!coiApproved || !wcApproved) && (
          <div className="flex items-start gap-3 p-4 rounded-xl mb-6" style={{ background: "rgba(198,40,40,0.1)", border: "1px solid rgba(198,40,40,0.25)" }}>
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "#C62828" }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: "#C62828" }}>Compliance Documents Required</p>
              <p className="text-xs mt-1" style={{ color: "rgba(198,40,40,0.8)" }}>
                Please upload the following before work can begin:{" "}
                {[!coiApproved && "Certificate of Insurance (COI)", !wcApproved && "Workers' Compensation"].filter(Boolean).join(" and ")}.
              </p>
            </div>
          </div>
        )}

        {/* Pending awards banner */}
        {pendingAwards.length > 0 && (
          <div className="flex items-start gap-3 p-4 rounded-xl mb-6" style={{ background: "rgba(191,154,59,0.12)", border: "1px solid rgba(191,154,59,0.3)" }}>
            <Trophy className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "var(--kp-gold)" }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--kp-gold)" }}>You have {pendingAwards.length} pending award{pendingAwards.length > 1 ? "s" : ""} to review</p>
              <p className="text-xs mt-1" style={{ color: "var(--kp-muted)" }}>Please review and accept or decline each award in the Awards tab.</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue={pendingAwards.length > 0 ? "awards" : "compliance"}>
          <TabsList style={{ background: "rgba(255,255,255,0.05)" }}>
            <TabsTrigger value="compliance">Compliance Docs</TabsTrigger>
            {awardCandidates.length > 0 && (
              <TabsTrigger value="awards">
                Awards ({awardCandidates.length})
                {pendingAwards.length > 0 && (
                  <span className="ml-1.5 h-4 w-4 rounded-full text-xs flex items-center justify-center font-bold" style={{ background: "var(--kp-gold)", color: "#1a1a1a" }}>{pendingAwards.length}</span>
                )}
              </TabsTrigger>
            )}
            <TabsTrigger value="contracts">Contracts ({contracts.length})</TabsTrigger>
            <TabsTrigger value="messages">Messages ({comms.length})</TabsTrigger>
          </TabsList>

          {/* ── Compliance Tab ──────────────────────────────────────────── */}
          <TabsContent value="compliance" className="mt-4 space-y-4">
            {/* Required status cards */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: "coi", label: "Certificate of Insurance", approved: coiApproved },
                { key: "workers_comp", label: "Workers' Compensation", approved: wcApproved },
              ].map(({ key, label, approved }) => (
                <Card key={key} style={{
                  background: approved ? "rgba(46,125,50,0.08)" : "rgba(198,40,40,0.08)",
                  border: `1px solid ${approved ? "rgba(46,125,50,0.25)" : "rgba(198,40,40,0.25)"}`,
                }}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium" style={{ color: "var(--kp-cream)" }}>{label}</p>
                        <p className="text-xs mt-0.5" style={{ color: approved ? "#2E7D32" : "#C62828" }}>
                          {approved ? "✓ On file & approved" : "✗ Required — not on file"}
                        </p>
                      </div>
                      {approved ? (
                        <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: "#2E7D32" }} />
                      ) : (
                        <AlertTriangle className="h-5 w-5 shrink-0" style={{ color: "#C62828" }} />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Upload new doc */}
            <Card style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2" style={{ color: "var(--kp-cream)" }}>
                  <Upload className="h-4 w-4" style={{ color: "var(--kp-gold)" }} />
                  Upload Document
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs" style={{ color: "var(--kp-muted)" }}>Document Type</Label>
                  <Select value={uploadDocType} onValueChange={(v: any) => setUploadDocType(v)}>
                    <SelectTrigger className="mt-1" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOC_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs" style={{ color: "var(--kp-muted)" }}>Expiry Date (if applicable)</Label>
                  <input
                    type="date"
                    value={uploadExpiryDate}
                    onChange={(e) => setUploadExpiryDate(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-md text-sm"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
                  />
                </div>
                <div>
                  <Label className="text-xs" style={{ color: "var(--kp-muted)" }}>File (PDF or image)</Label>
                  <div
                    className="mt-1 border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors"
                    style={{ borderColor: uploadFile ? "rgba(191,154,59,0.5)" : "rgba(255,255,255,0.1)" }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-5 w-5 mx-auto mb-2" style={{ color: "var(--kp-muted)" }} />
                    {uploadFile ? (
                      <p className="text-sm" style={{ color: "var(--kp-gold)" }}>{uploadFile.name}</p>
                    ) : (
                      <p className="text-sm" style={{ color: "var(--kp-muted)" }}>Tap to select file</p>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="hidden"
                      onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                </div>
                <Button
                  onClick={handleUpload}
                  disabled={!uploadFile || uploadMutation.isPending}
                  className="w-full btn-gold"
                >
                  {uploadMutation.isPending ? "Uploading..." : "Submit Document"}
                </Button>
              </CardContent>
            </Card>

            {/* Existing docs */}
            {docs.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: "var(--kp-muted)" }}>SUBMITTED DOCUMENTS</p>
                <div className="space-y-2">
                  {docs.map((doc: any) => (
                    <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <FileText className="h-4 w-4 shrink-0" style={{ color: "var(--kp-gold)" }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm" style={{ color: "var(--kp-cream)" }}>{DOC_TYPE_LABELS[doc.docType] ?? doc.docType}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {doc.expiryDate && (
                            <span className="text-xs" style={{ color: "var(--kp-muted)" }}>
                              Exp: {new Date(doc.expiryDate).toLocaleDateString()}
                            </span>
                          )}
                          <span className="text-xs px-2 py-0.5 rounded-full"
                            style={{
                              background: doc.status === "approved" ? "rgba(46,125,50,0.15)" : doc.status === "rejected" ? "rgba(198,40,40,0.15)" : "rgba(100,100,100,0.15)",
                              color: doc.status === "approved" ? "#2E7D32" : doc.status === "rejected" ? "#C62828" : "#888",
                            }}>
                            {doc.status}
                          </span>
                        </div>
                      </div>
                      {doc.fileUrl && (
                        <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon" style={{ color: "var(--kp-muted)" }}>
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── Awards Tab ─────────────────────────────────────────────── */}
          <TabsContent value="awards" className="mt-4 space-y-4">
            {awardCandidates.length === 0 ? (
              <div className="text-center py-10">
                <Trophy className="h-10 w-10 mx-auto mb-3" style={{ color: "var(--kp-muted)", opacity: 0.4 }} />
                <p className="text-sm" style={{ color: "var(--kp-muted)" }}>No awards yet</p>
              </div>
            ) : (
              awardCandidates.map((award: any) => (
                <AwardCard key={award.id} award={award} token={token} refetch={refetch} />
              ))
            )}
          </TabsContent>

          {/* ── Contracts Tab ───────────────────────────────────────────── */}
          <TabsContent value="contracts" className="mt-4 space-y-3">
            {contracts.length === 0 ? (
              <div className="text-center py-10">
                <FileText className="h-10 w-10 mx-auto mb-3" style={{ color: "var(--kp-muted)", opacity: 0.4 }} />
                <p className="text-sm" style={{ color: "var(--kp-muted)" }}>No contracts yet</p>
              </div>
            ) : (
              contracts.map((contract: any) => (
                <Card key={contract.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-sm" style={{ color: "var(--kp-cream)" }}>{contract.title}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs" style={{ color: "var(--kp-muted)" }}>#{contract.contractNumber}</span>
                          {contract.contractAmount && (
                            <span className="text-xs" style={{ color: "var(--kp-muted)" }}>
                              ${parseFloat(String(contract.contractAmount)).toLocaleString()}
                            </span>
                          )}
                        </div>
                        {contract.scopeOfWork && (
                          <p className="text-xs mt-2 line-clamp-2" style={{ color: "var(--kp-muted)" }}>{contract.scopeOfWork}</p>
                        )}
                        {contract.signedAt && (
                          <p className="text-xs mt-1" style={{ color: "#2E7D32" }}>
                            ✓ Signed on {new Date(contract.signedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 items-end shrink-0">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{
                            background: contract.status === "signed" ? "rgba(46,125,50,0.15)" : contract.status === "sent" ? "rgba(230,119,0,0.12)" : "rgba(100,100,100,0.12)",
                            color: contract.status === "signed" ? "#2E7D32" : contract.status === "sent" ? "#E67700" : "#888",
                          }}>
                          {contract.status}
                        </span>
                        {contract.status === "sent" && contract.signingToken && (
                          <a href={`/subcontractor/sign/${contract.signingToken}`}>
                            <Button size="sm" className="btn-gold gap-1">
                              <FileText className="h-3.5 w-3.5" /> Sign Contract
                            </Button>
                          </a>
                        )}
                        {contract.signedPdfUrl && (
                          <a href={contract.signedPdfUrl} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm" style={{ color: "var(--kp-gold)" }}>
                              <ExternalLink className="h-3.5 w-3.5 mr-1" /> View Signed
                            </Button>
                          </a>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* ── Messages Tab ────────────────────────────────────────────── */}
          <TabsContent value="messages" className="mt-4 space-y-3">
            {comms.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm" style={{ color: "var(--kp-muted)" }}>No messages yet</p>
              </div>
            ) : (
              comms.map((comm: any) => (
                <div
                  key={comm.id}
                  className="flex gap-3 p-3 rounded-lg"
                  style={{
                    background: comm.direction === "outbound" ? "rgba(191,154,59,0.06)" : "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <div className="shrink-0 mt-0.5">
                    {comm.channel === "sms" ? (
                      <Phone className="h-4 w-4" style={{ color: comm.direction === "inbound" ? "var(--kp-gold)" : "var(--kp-muted)" }} />
                    ) : (
                      <Mail className="h-4 w-4" style={{ color: comm.direction === "inbound" ? "var(--kp-gold)" : "var(--kp-muted)" }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium" style={{ color: comm.direction === "inbound" ? "var(--kp-gold)" : "var(--kp-cream)" }}>
                        {comm.direction === "inbound" ? "From Kitchens Plus" : "Your message"} · {comm.channel.toUpperCase()}
                      </span>
                      <span className="text-xs ml-auto" style={{ color: "var(--kp-muted)" }}>
                        {new Date(comm.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {comm.subject && (
                      <p className="text-xs font-medium mt-0.5" style={{ color: "var(--kp-muted)" }}>{comm.subject}</p>
                    )}
                    <p className="text-sm mt-1" style={{ color: "var(--kp-cream)", opacity: 0.85 }}>{comm.body}</p>
                  </div>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs" style={{ color: "var(--kp-muted)" }}>
            Questions? Contact Kitchens Plus Upstate at{" "}
            <a href="tel:+18645678777" style={{ color: "var(--kp-gold)" }}>864-567-8777</a>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Award Card Component ────────────────────────────────────────────────────

function AwardCard({ award, token, refetch }: { award: any; token: string; refetch: () => void }) {
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  const respondMutation = trpc.subcontractors.portalRespondAward.useMutation({
    onSuccess: (res) => {
      toast(res.status === "accepted" ? "Award accepted! Your contract will be sent shortly." : "Award declined.");
      setShowDeclineForm(false);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const statusColor = {
    pending: "rgba(100,100,100,0.15)",
    awarded: "rgba(191,154,59,0.15)",
    accepted: "rgba(46,125,50,0.15)",
    declined: "rgba(198,40,40,0.12)",
    voided: "rgba(100,100,100,0.12)",
  }[award.status] ?? "rgba(100,100,100,0.12)";

  const statusText = {
    pending: "Pending",
    awarded: "Action Required",
    accepted: "Accepted",
    declined: "Declined",
    voided: "Voided",
  }[award.status] ?? award.status;

  return (
    <Card style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${award.status === "awarded" ? "rgba(191,154,59,0.3)" : "rgba(255,255,255,0.08)"}` }}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Trophy className="h-4 w-4 shrink-0" style={{ color: "var(--kp-gold)" }} />
              <p className="font-semibold text-sm" style={{ color: "var(--kp-cream)" }}>
                {award.lineItemTask ?? award.scopeDescription ?? `Award #${award.id}`}
              </p>
            </div>
            {award.estimateTitle && (
              <p className="text-xs mt-1" style={{ color: "var(--kp-muted)" }}>Proposal: {award.estimateTitle}</p>
            )}
            {award.agreedAmount && parseFloat(String(award.agreedAmount)) > 0 && (
              <p className="text-sm font-semibold mt-1" style={{ color: "var(--kp-gold)" }}>
                ${parseFloat(String(award.agreedAmount)).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
            )}
            {award.scopeDescription && award.lineItemTask !== award.scopeDescription && (
              <p className="text-xs mt-1.5 line-clamp-2" style={{ color: "var(--kp-muted)" }}>{award.scopeDescription}</p>
            )}
            {award.awardedAt && (
              <p className="text-xs mt-1" style={{ color: "var(--kp-muted)" }}>Awarded: {new Date(award.awardedAt).toLocaleDateString()}</p>
            )}
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0" style={{ background: statusColor, color: award.status === "awarded" ? "var(--kp-gold)" : award.status === "accepted" ? "#2E7D32" : award.status === "declined" ? "#C62828" : "var(--kp-muted)" }}>
            {statusText}
          </span>
        </div>

        {award.status === "awarded" && !showDeclineForm && (
          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              className="btn-gold gap-1.5 flex-1"
              disabled={respondMutation.isPending}
              onClick={() => respondMutation.mutate({ token, awardCandidateId: award.id, response: "accepted" })}
            >
              <ThumbsUp className="h-3.5 w-3.5" /> Accept Award
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              style={{ borderColor: "rgba(198,40,40,0.4)", color: "#C62828" }}
              onClick={() => setShowDeclineForm(true)}
            >
              <ThumbsDown className="h-3.5 w-3.5" /> Decline
            </Button>
          </div>
        )}

        {award.status === "awarded" && showDeclineForm && (
          <div className="mt-3 space-y-3">
            <div>
              <Label className="text-xs" style={{ color: "var(--kp-muted)" }}>Reason for declining (optional)</Label>
              <Textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Let us know why you're unable to accept this award..."
                className="mt-1 text-sm"
                rows={2}
                style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                style={{ borderColor: "rgba(198,40,40,0.4)", color: "#C62828" }}
                disabled={respondMutation.isPending}
                onClick={() => respondMutation.mutate({ token, awardCandidateId: award.id, response: "declined", declineReason })}
              >
                <ThumbsDown className="h-3.5 w-3.5" /> Confirm Decline
              </Button>
              <Button size="sm" variant="ghost" style={{ color: "var(--kp-muted)" }} onClick={() => setShowDeclineForm(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {award.status === "accepted" && award.contract && (
          <div className="mt-3 p-3 rounded-lg" style={{ background: "rgba(46,125,50,0.08)", border: "1px solid rgba(46,125,50,0.2)" }}>
            <p className="text-xs font-medium" style={{ color: "#2E7D32" }}>Contract #{award.contract.contractNumber}</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--kp-muted)" }}>Status: {award.contract.status}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Contract Signing Page ────────────────────────────────────────────────────

function ContractSignPage({ signingToken }: { signingToken: string }) {
  
  const [signerName, setSignerName] = useState("");
  const [agreed, setAgreed] = useState(false);

  const { data, isLoading } = trpc.subcontractors.getContractForSigning.useQuery({ token: signingToken });

  const signMutation = trpc.subcontractors.signContract.useMutation({
    onSuccess: (res) => {
      toast({ title: "Contract signed!", description: "A copy has been sent to your email." });
      window.location.href = res.signedPdfUrl ?? "/subcontractor/portal";
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--kp-charcoal-dark)" }}>
        <div className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--kp-gold)" }} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--kp-charcoal-dark)" }}>
        <div className="text-center p-8">
          <p className="text-lg" style={{ color: "var(--kp-cream)" }}>Contract not found or link has expired.</p>
          <p className="text-sm mt-2" style={{ color: "var(--kp-muted)" }}>Please contact Kitchens Plus Upstate for assistance.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--kp-charcoal-dark)" }}>
      <header className="border-b px-6 py-4" style={{ borderColor: "rgba(191,154,59,0.15)", background: "var(--kp-charcoal)" }}>
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <img src={LOGO_URL} alt="Kitchens Plus Upstate" className="h-9 object-contain" />
          <div className="h-6 w-px" style={{ background: "rgba(255,255,255,0.1)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--kp-cream)" }}>Contract Signature</p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <Card style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <CardHeader>
            <CardTitle style={{ color: "var(--kp-cream)" }}>{data.title}</CardTitle>
            <p className="text-sm" style={{ color: "var(--kp-muted)" }}>Contract #{data.contractNumber}</p>
          </CardHeader>
          <CardContent className="space-y-5">
            {data.contractAmount && (
              <div className="flex justify-between">
                <span className="text-sm" style={{ color: "var(--kp-muted)" }}>Contract Amount</span>
                <span className="text-sm font-semibold" style={{ color: "var(--kp-cream)" }}>
                  ${parseFloat(String(data.contractAmount)).toLocaleString()}
                </span>
              </div>
            )}
            {data.scopeOfWork && (
              <div>
                <p className="text-sm font-medium mb-1" style={{ color: "var(--kp-muted)" }}>Scope of Work</p>
                <p className="text-sm p-3 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", color: "var(--kp-cream)" }}>
                  {data.scopeOfWork}
                </p>
              </div>
            )}
            {data.pdfUrl && (
              <a href={data.pdfUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm" style={{ color: "var(--kp-gold)" }}>
                <ExternalLink className="h-4 w-4" /> View Full Contract PDF
              </a>
            )}

            <div className="border-t pt-4" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
              <p className="text-sm font-medium mb-3" style={{ color: "var(--kp-cream)" }}>Your Signature</p>
              <div>
                <Label className="text-xs" style={{ color: "var(--kp-muted)" }}>Full Legal Name *</Label>
                <input
                  type="text"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Type your full name to sign"
                  className="mt-1 w-full px-3 py-2 rounded-md text-sm"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--kp-cream)" }}
                />
              </div>
              <div className="flex items-start gap-3 mt-3">
                <input
                  type="checkbox"
                  id="agree"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5"
                />
                <label htmlFor="agree" className="text-sm cursor-pointer" style={{ color: "var(--kp-muted)" }}>
                  I have read and agree to the terms of this contract. By typing my name above and clicking "Sign Contract", I am providing my electronic signature.
                </label>
              </div>
            </div>

            <Button
              className="w-full btn-gold"
              disabled={!signerName.trim() || !agreed || signMutation.isPending}
              onClick={() => signMutation.mutate({ token: signingToken, signerName: signerName.trim() })}
            >
              {signMutation.isPending ? "Signing..." : "Sign Contract"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Root Portal Router ───────────────────────────────────────────────────────

export default function SubcontractorPortal() {
  const [location] = useLocation();
  const [portalSub, setPortalSub] = useState<any>(null);

  // Extract token from URL
  // Routes: /subcontractor/portal?token=xxx  or  /subcontractor/sign/:token
  const urlParams = new URLSearchParams(window.location.search);
  const portalToken = urlParams.get("token") ?? "";

  // Check if this is a signing route
  const signMatch = location.match(/\/subcontractor\/sign\/([^/?]+)/);
  const signingToken = signMatch?.[1] ?? "";

  if (signingToken) {
    return <ContractSignPage signingToken={signingToken} />;
  }

  if (!portalSub && portalToken) {
    return <PortalLogin token={portalToken} onSuccess={(sub) => setPortalSub(sub)} />;
  }

  if (portalSub) {
    return <PortalDashboard token={portalToken} sub={portalSub} />;
  }

  // No token — show a generic landing
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--kp-charcoal-dark)" }}>
      <div className="text-center p-8 max-w-sm">
        <img src={LOGO_URL} alt="Kitchens Plus Upstate" className="h-14 object-contain mx-auto mb-6" />
        <h1 className="text-2xl font-serif mb-2" style={{ color: "var(--kp-cream)" }}>Subcontractor Portal</h1>
        <p className="text-sm" style={{ color: "var(--kp-muted)" }}>
          Please use the link sent to you by Kitchens Plus Upstate to access your portal.
        </p>
        <p className="text-sm mt-4" style={{ color: "var(--kp-muted)" }}>
          Need help? Call <a href="tel:+18645678777" style={{ color: "var(--kp-gold)" }}>864-567-8777</a>
        </p>
      </div>
    </div>
  );
}
