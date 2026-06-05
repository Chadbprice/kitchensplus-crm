/**
 * FieldCaptureDrawer — reusable side panel for viewing a client's field captures.
 * Shows photos and notes captured on-site during field visits.
 * Opens as a Sheet (right side drawer) so it doesn't navigate away from the current page.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Camera, Image, FileText, MapPin, Calendar, X, Loader2 } from "lucide-react";

const GOLD = "#BF9A3B";

interface FieldCaptureDrawerProps {
  open: boolean;
  onClose: () => void;
  leadId?: number;
  clientId?: number;
  clientName?: string;
}

export default function FieldCaptureDrawer({ open, onClose, leadId, clientId, clientName }: FieldCaptureDrawerProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "photo" | "note">("all");

  const queryInput = leadId ? { leadId } : clientId ? { clientId } : undefined;

  const { data: captures = [], isLoading } = trpc.fieldCapture.listByClient.useQuery(
    queryInput!,
    { enabled: open && !!queryInput }
  );

  const filtered = captures.filter((c: any) => filter === "all" || c.type === filter);
  const photos = filtered.filter((c: any) => c.type === "photo");
  const notes = filtered.filter((c: any) => c.type === "note");

  const formatDateTime = (d: Date | string) => {
    const date = new Date(d);
    return date.toLocaleString([], {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent side="right" className="w-[420px] sm:w-[480px] p-0 overflow-hidden" style={{ background: "#1A1B16", borderLeft: `1px solid ${GOLD}30` }}>
          <SheetHeader className="px-5 py-4 border-b" style={{ borderColor: `${GOLD}30` }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Camera className="h-4.5 w-4.5" style={{ color: GOLD }} />
                <SheetTitle className="text-base font-semibold text-white">
                  Field Captures
                </SheetTitle>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                <X className="h-4 w-4 text-white/50" />
              </button>
            </div>
            {clientName && (
              <p className="text-xs mt-1" style={{ color: `${GOLD}90` }}>{clientName}</p>
            )}
          </SheetHeader>

          {/* Filter tabs */}
          <div className="flex gap-2 px-5 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
            {(["all", "photo", "note"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filter === f
                    ? "text-black"
                    : "bg-white/5 text-white/60 hover:bg-white/10"
                }`}
                style={filter === f ? { background: GOLD } : undefined}
              >
                {f === "all" ? `All (${captures.length})` : f === "photo" ? `Photos (${captures.filter((c: any) => c.type === "photo").length})` : `Notes (${captures.filter((c: any) => c.type === "note").length})`}
              </button>
            ))}
          </div>

          <div className="overflow-y-auto" style={{ height: "calc(100vh - 140px)" }}>
            {isLoading && (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: GOLD }} />
              </div>
            )}

            {!isLoading && filtered.length === 0 && (
              <div className="text-center py-20 px-6">
                <Camera className="h-10 w-10 mx-auto mb-3 text-white/15" />
                <p className="text-white/40 text-sm">No field captures yet</p>
                <p className="text-white/25 text-xs mt-1">Photos and notes from field visits will appear here</p>
              </div>
            )}

            {/* Photos */}
            {photos.length > 0 && (
              <div className="px-5 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                {filter === "all" && (
                  <div className="flex items-center gap-2 mb-3">
                    <Image className="h-4 w-4" style={{ color: GOLD }} />
                    <span className="text-sm font-medium text-white/70">Photos</span>
                    <Badge variant="outline" className="border-white/20 text-white/40 text-xs">{photos.length}</Badge>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((cap: any) => (
                    <div key={cap.id} className="relative group rounded-lg overflow-hidden bg-white/5 border border-white/10 cursor-pointer"
                      onClick={() => cap.photoUrl && setLightboxUrl(cap.photoUrl)}>
                      {cap.photoUrl ? (
                        <img src={cap.photoUrl} alt="Field capture" className="w-full aspect-square object-cover" />
                      ) : (
                        <div className="w-full aspect-square flex items-center justify-center bg-white/5">
                          <Image className="w-6 h-6 text-white/20" />
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1">
                        <p className="text-white/70 text-[10px] flex items-center gap-0.5">
                          <Calendar className="w-2 h-2" />
                          {formatDateTime(cap.capturedAt)}
                        </p>
                        {cap.latitude && (
                          <p className="text-green-400/70 text-[10px] flex items-center gap-0.5">
                            <MapPin className="w-2 h-2" /> GPS
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {notes.length > 0 && (
              <div className="px-5 py-4">
                {filter === "all" && (
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="h-4 w-4 text-white/50" />
                    <span className="text-sm font-medium text-white/70">Notes</span>
                    <Badge variant="outline" className="border-white/20 text-white/40 text-xs">{notes.length}</Badge>
                  </div>
                )}
                <div className="space-y-2">
                  {notes.map((cap: any) => (
                    <div key={cap.id} className="p-3 rounded-lg bg-white/5 border border-white/10">
                      <div className="flex items-start gap-2">
                        <FileText className="w-3.5 h-3.5 text-white/30 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{cap.noteText}</p>
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
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="Full size" className="max-w-full max-h-full object-contain rounded-lg" />
          <button className="absolute top-4 right-4 p-2 bg-white/10 rounded-full hover:bg-white/20" onClick={() => setLightboxUrl(null)}>
            <X className="h-5 w-5 text-white" />
          </button>
        </div>
      )}
    </>
  );
}
