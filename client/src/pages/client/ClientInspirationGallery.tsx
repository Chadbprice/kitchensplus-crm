import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, Trash2, X, Loader2, Sparkles, StickyNote, Link2, ExternalLink, ChevronLeft, Camera } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

const GOLD = "#C9A84C";
const CHARCOAL = "#2E2F2A";
const CREAM = "#F5F0E8";
const MUTED = "#9A9589";
const GREEN = "#4CAF7D";
const RED = "#E05252";
const DARK = "#1A1B17";

const ROOM_TAGS = ["General","Kitchen","Master Bath","Guest Bath","Living Room","Dining Room","Bedroom","Laundry","Exterior","Other"];
const MAX_FILE_SIZE_MB = 10;

interface QueueItem {
  id: string;
  name: string;
  preview: string;
  roomTag: string;
  description: string;
  status: "pending" | "uploading" | "done" | "error";
}

export default function ClientInspirationGallery() {
  const { data: clientSession } = trpc.clientPortal.me.useQuery();
  const { data: items = [], refetch } = trpc.clientPortal.listMyInspirationItems.useQuery(
    {},
    { enabled: !!clientSession?.leadId }
  );
  const addItemMutation = trpc.clientPortal.addInspirationItem.useMutation({ onSuccess: () => refetch() });
  const deleteItemMutation = trpc.clientPortal.deleteInspirationItem.useMutation({
    onSuccess: () => { refetch(); toast.success("Item removed"); },
    onError: () => toast.error("Failed to remove item"),
  });

  const [uploadQueue, setUploadQueue] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [defaultRoomTag, setDefaultRoomTag] = useState("Kitchen");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [newNote, setNewNote] = useState({ room: "General", note: "" });
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [newLink, setNewLink] = useState({ url: "", title: "", room: "General" });
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const valid = Array.from(files).filter(f => {
      if (!f.type.startsWith("image/")) { toast.error(`${f.name} is not an image`); return false; }
      if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) { toast.error(`${f.name} exceeds ${MAX_FILE_SIZE_MB} MB`); return false; }
      return true;
    });
    if (!valid.length) return;
    const newItems: QueueItem[] = await Promise.all(valid.map(async f => ({
      id: `${Date.now()}-${Math.random()}`,
      name: f.name,
      preview: await readFileAsBase64(f),
      roomTag: defaultRoomTag,
      description: "",
      status: "pending" as const,
    })));
    setUploadQueue(prev => [...prev, ...newItems]);
  }, [defaultRoomTag]);

  const updateQueueItem = (id: string, updates: Partial<QueueItem>) =>
    setUploadQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  const removeFromQueue = (id: string) =>
    setUploadQueue(prev => prev.filter(item => item.id !== id));

  const uploadAll = async () => {
    if (!clientSession?.leadId) { toast.error("Please sign in to upload"); return; }
    const pending = uploadQueue.filter(f => f.status === "pending");
    if (!pending.length) { toast.info("No photos to upload"); return; }
    for (const item of pending) {
      updateQueueItem(item.id, { status: "uploading" });
      try {
        const base64 = item.preview.replace(/^data:[^;]+;base64,/, "");
        await addItemMutation.mutateAsync({
          itemType: "image",
          room: item.roomTag,
          note: item.description || undefined,
          imageBase64: base64,
          imageName: item.name,
          imageMime: item.preview.split(";")[0].replace("data:", ""),
        });
        updateQueueItem(item.id, { status: "done" });
      } catch {
        updateQueueItem(item.id, { status: "error" });
        toast.error(`Failed to upload ${item.name}`);
      }
    }
    const doneCount = uploadQueue.filter(f => f.status === "done").length + pending.filter(f => f.status !== "error").length;
    if (doneCount > 0) toast.success(`${pending.length} photo${pending.length !== 1 ? "s" : ""} uploaded!`);
    setTimeout(() => setUploadQueue(prev => prev.filter(f => f.status !== "done")), 1500);
  };

  const saveNote = () => {
    if (!newNote.note.trim()) { toast.error("Please enter a note"); return; }
    addItemMutation.mutate(
      { itemType: "note", room: newNote.room, note: newNote.note.trim() },
      {
        onSuccess: () => { toast.success("Note saved"); setNewNote({ room: "General", note: "" }); setShowNoteForm(false); },
        onError: () => toast.error("Failed to save note"),
      }
    );
  };

  const saveLink = () => {
    if (!newLink.url.trim()) { toast.error("Please enter a URL"); return; }
    let url = newLink.url.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url;
    addItemMutation.mutate(
      { itemType: "link", linkUrl: url, linkTitle: newLink.title.trim() || undefined, room: newLink.room },
      {
        onSuccess: () => { toast.success("Link saved!"); setNewLink({ url: "", title: "", room: "General" }); setShowLinkForm(false); },
        onError: () => toast.error("Failed to save link"),
      }
    );
  };

  const pendingCount = uploadQueue.filter(f => f.status === "pending").length;
  const imageItems = (items as any[]).filter(i => i.itemType === "image");
  const noteItems = (items as any[]).filter(i => i.itemType === "note");
  const linkItems = (items as any[]).filter(i => i.itemType === "link");

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <Link href="/client/projects">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-80" style={{ color: MUTED }}>
          <ChevronLeft className="h-3 w-3" />All Projects
        </span>
      </Link>

      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: GOLD }}>Design Ideas</p>
        <h1 className="text-4xl font-serif leading-tight" style={{ color: CREAM, fontStyle: "italic" }}>Your Inspiration Board</h1>
        <p className="text-sm mt-1" style={{ color: MUTED }}>
          Share photos, notes, and links that inspire your vision — styles, finishes, layouts, and colors. Our team will use these to guide your project.
        </p>
      </div>

      {/* Upload area */}
      <div className="rounded-xl p-5 space-y-4" style={{ background: CHARCOAL, border: "1px solid rgba(201,168,76,0.15)" }}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>Upload Photos</span>
          <Select value={defaultRoomTag} onValueChange={setDefaultRoomTag}>
            <SelectTrigger className="h-7 w-36 text-xs border-0" style={{ background: "rgba(255,255,255,0.06)", color: CREAM }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROOM_TAGS.map(r => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div
          className="rounded-lg border-2 border-dashed flex flex-col items-center justify-center py-8 gap-3 cursor-pointer transition-colors"
          style={{ borderColor: isDragging ? GOLD : "rgba(255,255,255,0.12)", background: isDragging ? "rgba(201,168,76,0.06)" : "transparent" }}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={e => { e.preventDefault(); setIsDragging(false); processFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${GOLD}20` }}>
            <Upload className="h-5 w-5" style={{ color: GOLD }} />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium" style={{ color: CREAM }}>Drop photos here or click to browse</p>
            <p className="text-xs mt-0.5" style={{ color: MUTED }}>JPG, PNG, WEBP — up to {MAX_FILE_SIZE_MB} MB each</p>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => e.target.files && processFiles(e.target.files)} />
        </div>

        {/* Take Photo button — shows on mobile for direct camera access */}
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg transition-colors md:hidden"
          style={{
            background: `${GOLD}15`,
            color: GOLD,
            border: `1px solid ${GOLD}30`,
          }}
        >
          <Camera className="h-4 w-4" />
          <span className="text-sm font-medium">Take Photo</span>
        </button>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={e => e.target.files && processFiles(e.target.files)}
        />

        {uploadQueue.length > 0 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {uploadQueue.map(item => (
                <div key={item.id} className="relative rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                  <img src={item.preview} alt={item.name} className="w-full h-28 object-cover" />
                  {item.status === "uploading" && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin" style={{ color: GOLD }} />
                    </div>
                  )}
                  {item.status === "done" && (
                    <div className="absolute inset-0 flex items-center justify-center" style={{ background: `${GREEN}80` }}>
                      <span className="text-white text-xs font-semibold">Uploaded!</span>
                    </div>
                  )}
                  {item.status === "error" && (
                    <div className="absolute inset-0 flex items-center justify-center" style={{ background: `${RED}80` }}>
                      <span className="text-white text-xs font-semibold">Failed</span>
                    </div>
                  )}
                  {item.status !== "uploading" && (
                    <button className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60" onClick={() => removeFromQueue(item.id)}>
                      <X className="h-3 w-3 text-white" />
                    </button>
                  )}
                  <div className="p-2 space-y-1.5" style={{ background: CHARCOAL }}>
                    <Select value={item.roomTag} onValueChange={v => updateQueueItem(item.id, { roomTag: v })} disabled={item.status !== "pending"}>
                      <SelectTrigger className="h-6 text-xs border-0" style={{ background: "rgba(255,255,255,0.06)", color: CREAM }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROOM_TAGS.map(r => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      className="h-6 text-xs border-0"
                      style={{ background: "rgba(255,255,255,0.06)", color: CREAM }}
                      placeholder="Caption (optional)"
                      value={item.description}
                      onChange={e => updateQueueItem(item.id, { description: e.target.value })}
                      disabled={item.status !== "pending"}
                    />
                  </div>
                </div>
              ))}
            </div>
            {pendingCount > 0 && (
              <Button className="w-full font-semibold" style={{ background: GOLD, color: DARK }} onClick={uploadAll} disabled={addItemMutation.isPending}>
                {addItemMutation.isPending
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading&hellip;</>
                  : `Upload ${pendingCount} Photo${pendingCount !== 1 ? "s" : ""}`}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Quick add buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => setShowNoteForm(true)}
          className="flex-1 flex items-center gap-2 rounded-xl p-4 transition-all text-left"
          style={{ background: CHARCOAL, border: "1px solid rgba(255,255,255,0.06)" }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = "rgba(201,168,76,0.3)"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.06)"}
        >
          <StickyNote className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
          <span className="text-sm font-medium" style={{ color: CREAM }}>Add a Note</span>
        </button>
        <button
          onClick={() => setShowLinkForm(true)}
          className="flex-1 flex items-center gap-2 rounded-xl p-4 transition-all text-left"
          style={{ background: CHARCOAL, border: "1px solid rgba(255,255,255,0.06)" }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = "rgba(201,168,76,0.3)"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.06)"}
        >
          <Link2 className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
          <span className="text-sm font-medium" style={{ color: CREAM }}>Save a Link</span>
        </button>
      </div>

      {/* Photo gallery */}
      {imageItems.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: MUTED }}>
            Your Photos <span className="font-normal">({imageItems.length})</span>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {imageItems.map((photo: any) => (
              <div key={photo.id} className="relative group rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                <img
                  src={photo.imageUrl ?? ""}
                  alt={photo.note ?? "Inspiration"}
                  className="w-full h-40 object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                  onClick={() => setLightboxUrl(photo.imageUrl ?? null)}
                />
                {photo.room && photo.room !== "General" && (
                  <div className="absolute top-2 left-2">
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: `${GOLD}CC`, color: DARK }}>{photo.room}</span>
                  </div>
                )}
                <button
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => deleteItemMutation.mutate({ id: photo.id })}
                  title="Remove photo"
                >
                  <Trash2 className="h-3.5 w-3.5 text-white" />
                </button>
                {photo.note && (
                  <div className="px-2.5 py-1.5" style={{ background: CHARCOAL }}>
                    <p className="text-xs truncate" style={{ color: MUTED }}>{photo.note}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {noteItems.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: MUTED }}>
            Your Notes <span className="font-normal">({noteItems.length})</span>
          </p>
          <div className="space-y-3">
            {noteItems.map((note: any) => (
              <div key={note.id} className="rounded-xl p-4 flex items-start justify-between gap-3" style={{ background: CHARCOAL, border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex-1 min-w-0">
                  {note.room && note.room !== "General" && (
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold mb-1.5" style={{ background: `${GOLD}20`, color: GOLD }}>{note.room}</span>
                  )}
                  <p className="text-sm leading-relaxed" style={{ color: CREAM }}>{note.note}</p>
                </div>
                <button
                  className="shrink-0 p-1.5 rounded-lg transition-colors"
                  style={{ color: MUTED }}
                  onClick={() => deleteItemMutation.mutate({ id: note.id })}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = RED}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = MUTED}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Links */}
      {linkItems.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: MUTED }}>
            Saved Links <span className="font-normal">({linkItems.length})</span>
          </p>
          <div className="space-y-3">
            {linkItems.map((link: any) => (
              <div key={link.id} className="rounded-xl p-4 flex items-center justify-between gap-3" style={{ background: CHARCOAL, border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Link2 className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: CREAM }}>{link.linkTitle || link.linkUrl}</p>
                    {link.linkTitle && <p className="text-xs truncate" style={{ color: MUTED }}>{link.linkUrl}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={link.linkUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: MUTED }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = GOLD}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = MUTED}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: MUTED }}
                    onClick={() => deleteItemMutation.mutate({ id: link.id })}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = RED}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = MUTED}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {(items as any[]).length === 0 && uploadQueue.length === 0 && (
        <div className="rounded-xl p-10 text-center space-y-3" style={{ background: CHARCOAL, border: "1px solid rgba(201,168,76,0.12)" }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ background: `${GOLD}20`, color: GOLD }}>
            <Sparkles className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-serif" style={{ color: CREAM, fontStyle: "italic" }}>Your board is empty</h2>
          <p className="text-sm" style={{ color: MUTED }}>Upload photos, add notes, or save links to share your vision with our team.</p>
        </div>
      )}

      {/* Add Note Dialog */}
      <Dialog open={showNoteForm} onOpenChange={setShowNoteForm}>
        <DialogContent style={{ background: CHARCOAL, border: "1px solid rgba(201,168,76,0.2)" }}>
          <DialogHeader>
            <DialogTitle style={{ color: CREAM }}>Add a Design Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-widest block mb-1.5" style={{ color: MUTED }}>Room / Area</label>
              <Select value={newNote.room} onValueChange={v => setNewNote(n => ({ ...n, room: v }))}>
                <SelectTrigger style={{ background: "rgba(255,255,255,0.06)", color: CREAM, border: "1px solid rgba(255,255,255,0.1)" }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROOM_TAGS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-widest block mb-1.5" style={{ color: MUTED }}>Your Note</label>
              <Textarea
                rows={4}
                placeholder="Describe your idea, style preference, or specific request…"
                value={newNote.note}
                onChange={e => setNewNote(n => ({ ...n, note: e.target.value }))}
                style={{ background: "rgba(255,255,255,0.06)", color: CREAM, border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowNoteForm(false)} style={{ color: MUTED, borderColor: "rgba(255,255,255,0.12)" }}>Cancel</Button>
              <Button className="flex-1 font-semibold" style={{ background: GOLD, color: DARK }} onClick={saveNote} disabled={addItemMutation.isPending}>
                {addItemMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Note"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Link Dialog */}
      <Dialog open={showLinkForm} onOpenChange={setShowLinkForm}>
        <DialogContent style={{ background: CHARCOAL, border: "1px solid rgba(201,168,76,0.2)" }}>
          <DialogHeader>
            <DialogTitle style={{ color: CREAM }}>Save an Inspiration Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-widest block mb-1.5" style={{ color: MUTED }}>URL</label>
              <Input
                placeholder="https://www.houzz.com/photos/..."
                value={newLink.url}
                onChange={e => setNewLink(l => ({ ...l, url: e.target.value }))}
                style={{ background: "rgba(255,255,255,0.06)", color: CREAM, border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-widest block mb-1.5" style={{ color: MUTED }}>Title (optional)</label>
              <Input
                placeholder="e.g. White marble waterfall island"
                value={newLink.title}
                onChange={e => setNewLink(l => ({ ...l, title: e.target.value }))}
                style={{ background: "rgba(255,255,255,0.06)", color: CREAM, border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-widest block mb-1.5" style={{ color: MUTED }}>Room / Area</label>
              <Select value={newLink.room} onValueChange={v => setNewLink(l => ({ ...l, room: v }))}>
                <SelectTrigger style={{ background: "rgba(255,255,255,0.06)", color: CREAM, border: "1px solid rgba(255,255,255,0.1)" }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROOM_TAGS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowLinkForm(false)} style={{ color: MUTED, borderColor: "rgba(255,255,255,0.12)" }}>Cancel</Button>
              <Button className="flex-1 font-semibold" style={{ background: GOLD, color: DARK }} onClick={saveLink} disabled={addItemMutation.isPending}>
                {addItemMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Link"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      <Dialog open={!!lightboxUrl} onOpenChange={() => setLightboxUrl(null)}>
        <DialogContent className="max-w-3xl p-2" style={{ background: "rgba(0,0,0,0.95)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <DialogHeader className="sr-only"><DialogTitle>Photo</DialogTitle></DialogHeader>
          {lightboxUrl && <img src={lightboxUrl} alt="Inspiration" className="w-full max-h-[80vh] object-contain rounded-lg" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
