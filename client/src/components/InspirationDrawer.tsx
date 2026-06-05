/**
 * InspirationDrawer — reusable side panel for viewing a client's inspiration content.
 * Shows design idea notes (notes, images, links) and inspiration photos from the documents table.
 * Opens as a Sheet (right side drawer) so it doesn't navigate away from the current page.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Image, FileText, ExternalLink, X, Loader2 } from "lucide-react";

const GOLD = "#BF9A3B";

interface InspirationDrawerProps {
  open: boolean;
  onClose: () => void;
  leadId?: number;
  projectId?: number;
  clientName?: string;
}

export default function InspirationDrawer({ open, onClose, leadId, projectId, clientName }: InspirationDrawerProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Design idea notes (notes, images, links) — keyed by leadId
  const { data: designNotes = [], isLoading: notesLoading } = trpc.documents.getDesignNotesByLead.useQuery(
    { leadId: leadId! },
    { enabled: open && !!leadId }
  );

  // Inspiration photos from documents table — keyed by projectId
  const { data: inspirationPhotos = [], isLoading: photosLoading } = trpc.documents.listInspirationPhotos.useQuery(
    { projectId: projectId! },
    { enabled: open && !!projectId }
  );

  const isLoading = notesLoading || photosLoading;

  // Separate design notes by type
  const noteItems = designNotes.filter((n: any) => n.itemType === "note");
  const imageItems = designNotes.filter((n: any) => n.itemType === "image");
  const linkItems = designNotes.filter((n: any) => n.itemType === "link");

  // Combine inspiration photos from documents + design idea images
  const allPhotos = [
    ...imageItems.map((n: any) => ({ id: `note-${n.id}`, url: n.imageUrl, label: n.room, date: n.createdAt })),
    ...inspirationPhotos.map((d: any) => ({ id: `doc-${d.id}`, url: d.fileUrl, label: d.roomTag ?? d.description ?? "Inspiration", date: d.createdAt })),
  ];

  const totalItems = designNotes.length + inspirationPhotos.length;

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent side="right" className="w-[420px] sm:w-[480px] p-0 overflow-hidden" style={{ background: "#1A1B16", borderLeft: `1px solid ${GOLD}30` }}>
          <SheetHeader className="px-5 py-4 border-b" style={{ borderColor: `${GOLD}30` }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Sparkles className="h-4.5 w-4.5" style={{ color: GOLD }} />
                <SheetTitle className="text-base font-semibold text-white">
                  Client Inspiration
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

          <div className="overflow-y-auto" style={{ height: "calc(100vh - 80px)" }}>
            {isLoading && (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: GOLD }} />
              </div>
            )}

            {!isLoading && totalItems === 0 && (
              <div className="text-center py-20 px-6">
                <Sparkles className="h-10 w-10 mx-auto mb-3 text-white/15" />
                <p className="text-white/40 text-sm">No inspiration content yet</p>
                <p className="text-white/25 text-xs mt-1">Client inspiration photos, links, and notes will appear here</p>
              </div>
            )}

            {/* Photos Section */}
            {allPhotos.length > 0 && (
              <div className="px-5 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <Image className="h-4 w-4" style={{ color: GOLD }} />
                  <span className="text-sm font-medium text-white/70">Photos</span>
                  <Badge variant="outline" className="border-white/20 text-white/40 text-xs">{allPhotos.length}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {allPhotos.map((photo) => (
                    <div key={photo.id} className="relative group rounded-lg overflow-hidden bg-white/5 border border-white/10 cursor-pointer"
                      onClick={() => setLightboxUrl(photo.url)}>
                      <img src={photo.url} alt={photo.label ?? "Inspiration"} className="w-full aspect-square object-cover" />
                      {photo.label && (
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1">
                          <p className="text-white/70 text-[10px] truncate">{photo.label}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Links Section */}
            {linkItems.length > 0 && (
              <div className="px-5 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <ExternalLink className="h-4 w-4" style={{ color: GOLD }} />
                  <span className="text-sm font-medium text-white/70">Links & References</span>
                  <Badge variant="outline" className="border-white/20 text-white/40 text-xs">{linkItems.length}</Badge>
                </div>
                <div className="space-y-2">
                  {linkItems.map((link: any) => (
                    <a key={link.id} href={link.linkUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2.5 p-2.5 rounded-lg bg-white/5 border border-white/10 hover:border-[#BF9A3B]/40 transition-colors group">
                      <ExternalLink className="h-3.5 w-3.5 text-white/30 group-hover:text-[#BF9A3B] transition-colors flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white/80 truncate">{link.linkTitle || link.linkUrl}</p>
                        {link.room && link.room !== "General" && (
                          <p className="text-xs text-white/30 mt-0.5">{link.room}</p>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Notes Section */}
            {noteItems.length > 0 && (
              <div className="px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-4 w-4 text-white/50" />
                  <span className="text-sm font-medium text-white/70">Notes</span>
                  <Badge variant="outline" className="border-white/20 text-white/40 text-xs">{noteItems.length}</Badge>
                </div>
                <div className="space-y-2">
                  {noteItems.map((note: any) => (
                    <div key={note.id} className="p-3 rounded-lg bg-white/5 border border-white/10">
                      <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{note.note}</p>
                      {note.room && note.room !== "General" && (
                        <p className="text-xs mt-1.5" style={{ color: `${GOLD}70` }}>{note.room}</p>
                      )}
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
