import { useState } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft, Camera, FileText, MapPin, Trash2, Image, Loader2,
  Calendar, Filter
} from "lucide-react";

export default function FieldCaptureGallery() {
  const { clientId } = useParams<{ clientId: string }>();
  const search = useSearch();
  const [, navigate] = useLocation();

  // Support /field-gallery/:id?type=lead, /field-gallery/lead{id}, and /field-gallery/:id (clientId)
  const hasLeadPrefix = (clientId ?? "").startsWith("lead");
  const searchParams = new URLSearchParams(search);
  const isLead = hasLeadPrefix || searchParams.get("type") === "lead";
  const idNum = hasLeadPrefix
    ? parseInt((clientId ?? "").replace("lead", ""), 10)
    : parseInt(clientId ?? "0", 10);

  const [filter, setFilter] = useState<"all" | "photo" | "note">("all");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const queryInput = isLead
    ? { leadId: idNum }
    : { clientId: idNum };

  const { data: captures = [], isLoading, refetch } = trpc.fieldCapture.listByClient.useQuery(
    queryInput,
    { enabled: !!idNum }
  );
  const { data: allClients = [] } = trpc.fieldCapture.listClients.useQuery();
  const client = allClients.find((c) => c.id === idNum && (isLead ? c.source === "lead" : c.source === "client"))
    ?? allClients.find((c) => c.id === idNum);

  const deleteCapture = trpc.fieldCapture.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Deleted"); },
    onError: () => toast.error("Delete failed"),
  });

  const filtered = captures.filter((c) => filter === "all" || c.type === filter);

  const formatDateTime = (d: Date | string) => {
    const date = new Date(d);
    return date.toLocaleString([], {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const photos = filtered.filter((c) => c.type === "photo");
  const notes = filtered.filter((c) => c.type === "note");

  // Build the capture session URL (same id/type)
  const captureUrl = isLead
    ? `/field-capture/${idNum}?type=lead`
    : `/field-capture/${idNum}`;

  return (
    <div className="min-h-screen bg-[#1A1B16] text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1A1B16] border-b border-[#BF9A3B]/30 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1 as any)}
          className="p-2 rounded-full hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-[#BF9A3B]" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-[#BF9A3B] uppercase tracking-widest">Field Captures</p>
          <h1 className="text-base font-semibold truncate">{client?.name ?? "Client"}</h1>
        </div>
        <Button
          size="sm"
          onClick={() => navigate(captureUrl)}
          className="bg-[#BF9A3B] hover:bg-[#D4A853] text-black font-semibold rounded-xl text-xs px-3"
        >
          <Camera className="w-3.5 h-3.5 mr-1" />
          Capture
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 px-4 py-3 border-b border-white/10">
        {(["all", "photo", "note"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f
                ? "bg-[#BF9A3B] text-black"
                : "bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            {f === "all" ? `All (${captures.length})` : f === "photo" ? `Photos (${captures.filter(c=>c.type==="photo").length})` : `Notes (${captures.filter(c=>c.type==="note").length})`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-4 py-4">
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#BF9A3B] animate-spin" />
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16">
            <Camera className="w-12 h-12 text-white/20 mx-auto mb-3" />
            <p className="text-white/40 text-sm">No field captures yet</p>
            <p className="text-white/25 text-xs mt-1">Use the Capture button to add photos and notes</p>
          </div>
        )}

        {/* Photo grid */}
        {(filter === "all" || filter === "photo") && photos.length > 0 && (
          <div className="mb-6">
            {filter === "all" && (
              <div className="flex items-center gap-2 mb-3">
                <Image className="w-4 h-4 text-[#BF9A3B]" />
                <span className="text-sm font-medium text-white/70">Photos</span>
                <Badge variant="outline" className="border-white/20 text-white/40 text-xs">{photos.length}</Badge>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {photos.map((cap) => (
                <div key={cap.id} className="relative group rounded-xl overflow-hidden bg-white/5 border border-white/10">
                  {cap.photoUrl ? (
                    <img
                      src={cap.photoUrl}
                      alt="Field capture"
                      className="w-full aspect-square object-cover cursor-pointer"
                      onClick={() => setLightboxUrl(cap.photoUrl!)}
                    />
                  ) : (
                    <div className="w-full aspect-square flex items-center justify-center bg-white/5">
                      <Image className="w-8 h-8 text-white/20" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-2">
                    <p className="text-white/70 text-xs flex items-center gap-1">
                      <Calendar className="w-2.5 h-2.5" />
                      {formatDateTime(cap.capturedAt)}
                    </p>
                    {cap.latitude && (
                      <p className="text-green-400/70 text-xs flex items-center gap-1">
                        <MapPin className="w-2.5 h-2.5" />
                        GPS
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => deleteCapture.mutate({ id: cap.id })}
                    className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80"
                  >
                    <Trash2 className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes list */}
        {(filter === "all" || filter === "note") && notes.length > 0 && (
          <div>
            {filter === "all" && (
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-white/60" />
                <span className="text-sm font-medium text-white/70">Notes</span>
                <Badge variant="outline" className="border-white/20 text-white/40 text-xs">{notes.length}</Badge>
              </div>
            )}
            <div className="space-y-2">
              {notes.map((cap) => (
                <div key={cap.id} className="bg-white/5 border border-white/10 rounded-xl p-3 group">
                  <div className="flex items-start gap-2">
                    <FileText className="w-4 h-4 text-white/40 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white/85 text-sm leading-relaxed whitespace-pre-wrap">{cap.noteText}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <p className="text-white/30 text-xs flex items-center gap-1">
                          <Calendar className="w-2.5 h-2.5" />
                          {formatDateTime(cap.capturedAt)}
                        </p>
                        {cap.latitude && (
                          <p className="text-green-400/60 text-xs flex items-center gap-1">
                            <MapPin className="w-2.5 h-2.5" />
                            {Number(cap.latitude).toFixed(4)}, {Number(cap.longitude).toFixed(4)}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteCapture.mutate({ id: cap.id })}
                      className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20 text-white/30 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <img src={lightboxUrl} alt="Full size" className="max-w-full max-h-full object-contain rounded-lg" />
          <button
            className="absolute top-4 right-4 p-2 bg-white/10 rounded-full hover:bg-white/20"
            onClick={() => setLightboxUrl(null)}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
