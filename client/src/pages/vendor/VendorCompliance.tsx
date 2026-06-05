import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useVendorPortal } from "@/components/VendorPortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, CheckCircle, AlertCircle, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

const GOLD = "#BF9A3B";
const CREAM = "#F5F0E8";
const MUTED = "#9B9B8B";
const CHARCOAL_DARK = "#1E1F1A";

const DOC_TYPES = [
  { key: "insurance",    label: "General Liability Insurance" },
  { key: "workers_comp", label: "Workers' Compensation" },
  { key: "license",      label: "Contractor License" },
  { key: "w9",           label: "W-9 Tax Form" },
  { key: "coi",          label: "Certificate of Insurance (COI)" },
];

export default function VendorCompliance() {
  const { vendor } = useVendorPortal();
  const vendorIdInput = useMemo(() => ({ vendorId: vendor.id }), [vendor.id]);
  const { data: docs = [], refetch, isLoading } = trpc.documents.list.useQuery(vendorIdInput);
  const upload = trpc.documents.upload.useMutation({
    onSuccess: () => { refetch(); toast.success("Document uploaded!"); },
    onError: (err) => toast.error(err.message),
  });

  const complianceDocs = docs.filter((d: any) => d.docType === "compliance");
  const hasDoc = (key: string) => complianceDocs.some((d: any) => d.description?.includes(key));

  const handleUpload = (key: string, label: string) => {
    const url = prompt("Paste document URL (from cloud storage, Google Drive, Dropbox, etc.):");
    if (url) {
      upload.mutate({
        vendorId: vendor.id,
        docType: "compliance",
        fileName: label,
        fileUrl: url,
        fileKey: `vendor-${vendor.id}-${key}`,
        description: key,
      });
    }
  };

  const completeCount = DOC_TYPES.filter(dt => hasDoc(dt.key)).length;

  return (
    <div className="flex flex-col h-full" style={{ background: CHARCOAL_DARK }}>
      {/* Header */}
      <div className="px-6 py-5 border-b" style={{ borderColor: "rgba(191,154,59,0.15)" }}>
        <div className="flex items-center gap-3 mb-1">
          <Shield className="h-5 w-5" style={{ color: GOLD }} />
          <h1 className="text-xl font-semibold" style={{ color: CREAM }}>Compliance Documents</h1>
        </div>
        <p className="text-sm" style={{ color: MUTED }}>
          Upload required documents to maintain active vendor status
        </p>
        {!isLoading && (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="h-full rounded-full transition-all"
                style={{ width: `${(completeCount / DOC_TYPES.length) * 100}%`, background: "linear-gradient(90deg, #BF9A3B, #D4AF5A)" }} />
            </div>
            <span className="text-xs font-medium shrink-0" style={{ color: MUTED }}>
              {completeCount}/{DOC_TYPES.length} complete
            </span>
          </div>
        )}
      </div>

      {/* Doc list */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
          </div>
        ) : (
          <div className="grid gap-3">
            {DOC_TYPES.map(dt => {
              const uploaded = hasDoc(dt.key);
              return (
                <Card key={dt.key} style={{
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid ${uploaded ? "rgba(76,175,80,0.25)" : "rgba(255,255,255,0.08)"}`,
                }}>
                  <CardContent className="p-4 flex items-center gap-3">
                    {uploaded
                      ? <CheckCircle className="h-5 w-5 shrink-0" style={{ color: "#4CAF50" }} />
                      : <AlertCircle className="h-5 w-5 shrink-0" style={{ color: "#E8A838" }} />
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: CREAM }}>{dt.label}</p>
                      <p className="text-xs mt-0.5" style={{ color: uploaded ? "#4CAF50" : MUTED }}>
                        {uploaded ? "On file — verified" : "Required — not yet uploaded"}
                      </p>
                    </div>
                    {!uploaded && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-8 shrink-0 gap-1"
                        style={{ borderColor: "rgba(191,154,59,0.4)", color: GOLD }}
                        onClick={() => handleUpload(dt.key, dt.label)}
                        disabled={upload.isPending}
                      >
                        <Upload className="h-3 w-3" /> Upload
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <p className="text-xs text-center mt-6" style={{ color: MUTED }}>
          Questions? Call +1 (833) 518-4811 or email chad@cpenterprisessc.com
        </p>
      </div>
    </div>
  );
}
