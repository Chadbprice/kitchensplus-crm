import { trpc } from "@/lib/trpc";
import { FileText, Image, Download, FolderOpen, ExternalLink, FileArchive, FileCode } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import ProjectFilterBar from "@/components/ProjectFilterBar";

const GOLD = "#C9A84C";
const CHARCOAL = "#2E2F2A";
const CREAM = "#F5F0E8";
const MUTED = "#9A9589";

const DOC_TYPE_LABELS: Record<string, string> = {
  estimate: "Estimate",
  contract: "Contract",
  permit: "Permit",
  photo: "Photo",
  drawing: "Drawing",
  invoice: "Invoice",
  warranty: "Warranty",
  compliance: "Compliance",
  inspiration: "Design Idea",
  other: "Document",
};

function DocIcon({ mimeType, docType }: { mimeType?: string | null; docType?: string | null }) {
  if (mimeType?.startsWith("image/")) return <Image className="h-5 w-5" style={{ color: GOLD }} />;
  if (mimeType === "application/pdf") return <FileText className="h-5 w-5" style={{ color: "#E05252" }} />;
  if (mimeType?.includes("zip") || mimeType?.includes("archive")) return <FileArchive className="h-5 w-5" style={{ color: MUTED }} />;
  return <FileCode className="h-5 w-5" style={{ color: MUTED }} />;
}

export default function ClientDocuments() {
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>(undefined);
  const { data: docs, isLoading } = trpc.clientPortal.getMyDocuments.useQuery(
    selectedProjectId ? { projectId: selectedProjectId } : undefined
  );

  const clientDocs = (docs ?? []).filter(d => d.docType !== "compliance");
  const photos = clientDocs.filter(d => d.docType === "photo" || (d.mimeType?.startsWith("image/") && d.docType !== "inspiration"));
  const others = clientDocs.filter(d => d.docType !== "photo" && !d.mimeType?.startsWith("image/"));

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: GOLD }}>
          Your Files
        </p>
        <h1 className="text-4xl font-serif leading-tight" style={{ color: CREAM, fontStyle: "italic" }}>
          Documents &amp; Photos
        </h1>
        <p className="text-sm mt-1" style={{ color: MUTED }}>
          Everything we've shared with you — plans, contracts, photos, and more.
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
            <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: CHARCOAL }} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && clientDocs.length === 0 && (
        <div
          className="rounded-xl p-10 text-center space-y-3"
          style={{ background: CHARCOAL, border: `1px solid rgba(255,255,255,0.06)` }}
        >
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
            style={{ background: `${GOLD}15` }}
          >
            <FolderOpen className="h-6 w-6" style={{ color: GOLD }} />
          </div>
          <h2 className="text-xl font-serif" style={{ color: CREAM, fontStyle: "italic" }}>
            Nothing here yet
          </h2>
          <p className="text-sm" style={{ color: MUTED }}>
            Your plans, photos, and documents will appear here as your project moves forward.
          </p>
        </div>
      )}

      {/* Photos grid */}
      {photos.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: MUTED }}>
            Progress Photos
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {photos.map(doc => (
              <a
                key={doc.id}
                href={doc.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative aspect-square rounded-xl overflow-hidden"
                style={{ border: `1px solid rgba(255,255,255,0.08)` }}
              >
                <img
                  src={doc.fileUrl}
                  alt={doc.fileName}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2.5"
                  style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)" }}
                >
                  <p className="text-white text-xs truncate font-medium">{doc.fileName}</p>
                </div>
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
                    <ExternalLink className="h-3 w-3 text-white" />
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Other documents */}
      {others.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: MUTED }}>
            Files &amp; Contracts
          </h2>
          <div className="space-y-2">
            {others.map(doc => (
              <div
                key={doc.id}
                className="rounded-xl p-4 flex items-center gap-3 transition-all"
                style={{ background: CHARCOAL, border: `1px solid rgba(255,255,255,0.06)` }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.border = `1px solid rgba(201,168,76,0.3)`;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.border = `1px solid rgba(255,255,255,0.06)`;
                }}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  <DocIcon mimeType={doc.mimeType} docType={doc.docType} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: CREAM }}>
                    {doc.fileName}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                    {DOC_TYPE_LABELS[doc.docType ?? "other"] ?? doc.docType}
                    {doc.roomTag ? ` · ${doc.roomTag}` : ""}
                    {" · "}
                    {format(new Date(doc.createdAt), "MMM d, yyyy")}
                  </p>
                  {doc.description && (
                    <p className="text-xs mt-0.5 truncate" style={{ color: MUTED }}>
                      {doc.description}
                    </p>
                  )}
                </div>
                {doc.fileUrl && (
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                    style={{ background: "rgba(255,255,255,0.04)" }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background = `rgba(201,168,76,0.15)`;
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
                    }}
                  >
                    <Download className="h-3.5 w-3.5" style={{ color: MUTED }} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
