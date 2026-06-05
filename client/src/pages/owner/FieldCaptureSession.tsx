import { useState, useRef, useCallback } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft, Camera, Mic, MicOff, FileText, Image, Trash2,
  MapPin, CheckCircle, Loader2, X, ImagePlus
} from "lucide-react";

// Resize a base64 image to reduce upload size
async function resizeImage(dataUrl: string, maxDim = 1600): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.src = dataUrl;
  });
}

type CaptureItem = {
  id: string;
  type: "photo" | "note";
  photoDataUrl?: string;
  noteText?: string;
  latitude?: number;
  longitude?: number;
  capturedAt: string;
  status: "pending" | "uploading" | "done" | "error";
};

export default function FieldCaptureSession() {
  const { clientId } = useParams<{ clientId: string }>();
  const search = useSearch();
  const [, navigate] = useLocation();
  // Support both /field-capture/lead{id}?type=lead (from landing page) and /field-capture/{id}?type=lead (from lead card)
  const hasLeadPrefix = (clientId ?? "").startsWith("lead");
  const isLead = hasLeadPrefix || new URLSearchParams(search).get("type") === "lead";
  const idNum = hasLeadPrefix
    ? parseInt((clientId ?? "").replace("lead", ""), 10)
    : parseInt(clientId ?? "0", 10);
  // For backward compat, keep clientIdNum alias
  const clientIdNum = idNum;

  const [items, setItems] = useState<CaptureItem[]>([]);
  const [noteText, setNoteText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [isUploadingLibrary, setIsUploadingLibrary] = useState(false);

  // Get client info
  const { data: clients = [] } = trpc.fieldCapture.listClients.useQuery();
  const client = clients.find((c) => c.id === idNum && (isLead ? c.source === "lead" : c.source === "client"))
    ?? clients.find((c) => c.id === idNum);

  const createCapture = trpc.fieldCapture.create.useMutation();
  const uploadMultiple = trpc.fieldCapture.uploadMultiple.useMutation();
  const deleteCapture = trpc.fieldCapture.delete.useMutation();
  const utils = trpc.useUtils();

  // Get GPS location
  const getLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setIsGettingLocation(false);
        toast.success("Location captured");
      },
      () => {
        setIsGettingLocation(false);
        toast.error("Could not get location");
      },
      { timeout: 8000, maximumAge: 30000 }
    );
  }, []);

  // Handle multi-photo upload from device library
  const handleLibrarySelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    e.target.value = "";
    setIsUploadingLibrary(true);

    // Add placeholder items immediately
    const placeholders: CaptureItem[] = files.map((_, idx) => ({
      id: `lib-${Date.now()}-${idx}`,
      type: "photo",
      capturedAt: new Date().toISOString(),
      status: "uploading",
    }));
    setItems((prev) => [...placeholders, ...prev]);

    try {
      // Resize all photos
      const photos = await Promise.all(
        files.map(async (file) => {
          const dataUrl = await new Promise<string>((res) => {
            const reader = new FileReader();
            reader.onload = (ev) => res(ev.target?.result as string);
            reader.readAsDataURL(file);
          });
          const resized = await resizeImage(dataUrl);
          return { dataUrl: resized, mime: "image/jpeg" };
        })
      );

      // Batch upload
      const result = await uploadMultiple.mutateAsync({
        ...(isLead ? { leadId: idNum } : { clientId: idNum }),
        photos,
      });
      // Mark all as done with their URLs
      setItems((prev) =>
        prev.map((item) => {
          const idx = placeholders.findIndex((p) => p.id === item.id);
          if (idx === -1) return item;
          const r = result.results[idx];
          return { ...item, photoDataUrl: r?.photoUrl, status: r?.success ? "done" : "error" };
        })
      );
      utils.fieldCapture.listByClient.invalidate(isLead ? { leadId: idNum } : { clientId: idNum });;
      toast.success(`${result.uploaded} photo${result.uploaded !== 1 ? "s" : ""} uploaded`);
    } catch {
      setItems((prev) =>
        prev.map((item) =>
          placeholders.find((p) => p.id === item.id) ? { ...item, status: "error" } : item
        )
      );
      toast.error("Upload failed");
    } finally {
      setIsUploadingLibrary(false);
    }
  }, [clientIdNum, uploadMultiple, utils]);

  // Handle photo from camera/library
  const handlePhotoSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const raw = ev.target?.result as string;
      const resized = await resizeImage(raw);
      const item: CaptureItem = {
        id: `photo-${Date.now()}`,
        type: "photo",
        photoDataUrl: resized,
        latitude: currentLocation?.lat,
        longitude: currentLocation?.lng,
        capturedAt: new Date().toISOString(),
        status: "uploading",
      };
      setItems((prev) => [item, ...prev]);

      try {
        await createCapture.mutateAsync({
          ...(isLead ? { leadId: idNum } : { clientId: idNum }),
          type: "photo",
          photoDataUrl: resized,
          photoMime: "image/jpeg",
          latitude: currentLocation?.lat,
          longitude: currentLocation?.lng,
          capturedAt: item.capturedAt,
        });
        setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "done" } : i));
        utils.fieldCapture.listByClient.invalidate(isLead ? { leadId: idNum } : { clientId: idNum });
        toast.success("Photo saved");
      } catch {
        setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "error" } : i));
        toast.error("Failed to upload photo");
      }
    };
    reader.readAsDataURL(file);
    // Reset so same file can be selected again
    e.target.value = "";
  }, [clientIdNum, currentLocation, createCapture, utils]);

  // Save typed note
  const handleSaveNote = useCallback(async () => {
    if (!noteText.trim()) return;
    const item: CaptureItem = {
      id: `note-${Date.now()}`,
      type: "note",
      noteText: noteText.trim(),
      latitude: currentLocation?.lat,
      longitude: currentLocation?.lng,
      capturedAt: new Date().toISOString(),
      status: "uploading",
    };
    setItems((prev) => [item, ...prev]);
    setNoteText("");

    try {
      await createCapture.mutateAsync({
        ...(isLead ? { leadId: idNum } : { clientId: idNum }),
        type: "note",
        noteText: item.noteText,
        latitude: currentLocation?.lat,
        longitude: currentLocation?.lng,
        capturedAt: item.capturedAt,
      });
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "done" } : i));
      utils.fieldCapture.listByClient.invalidate(isLead ? { leadId: idNum } : { clientId: idNum });
      toast.success("Note saved");
    } catch {
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "error" } : i));
      toast.error("Failed to save note");
    }
  }, [noteText, clientIdNum, currentLocation, createCapture, utils]);

  // Voice recording → transcription
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        // Convert to base64 and send to server for transcription
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const base64Audio = (ev.target?.result as string).split(",")[1];
          toast.info("Transcribing voice note…");
          try {
            // Upload audio blob to S3 first, then transcribe
            const audioDataUrl = `data:audio/webm;base64,${base64Audio}`;
            // Save as a note with placeholder, then transcribe
            const item: CaptureItem = {
              id: `voice-${Date.now()}`,
              type: "note",
              noteText: "🎤 Transcribing…",
              capturedAt: new Date().toISOString(),
              status: "uploading",
            };
            setItems((prev) => [item, ...prev]);

            // Use the transcribeVoice mutation
            const result = await transcribeVoice.mutateAsync({
              audioDataUrl,
              ...(isLead ? { leadId: idNum } : { clientId: idNum }),
              latitude: currentLocation?.lat,
              longitude: currentLocation?.lng,
              capturedAt: item.capturedAt,
            });
            setItems((prev) =>
              prev.map((i) =>
                i.id === item.id
                  ? { ...i, noteText: result.text, status: "done" }
                  : i
              )
            );
            utils.fieldCapture.listByClient.invalidate(isLead ? { leadId: idNum } : { clientId: idNum });
            toast.success("Voice note saved");
          } catch {
            toast.error("Transcription failed — try typing instead");
          }
        };
        reader.readAsDataURL(blob);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch {
      toast.error("Microphone access denied");
    }
  }, [clientIdNum, currentLocation]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }, []);

  const transcribeVoice = trpc.fieldCapture.transcribeVoice.useMutation();

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
      " · " + d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  return (
    <div className="min-h-screen bg-[#1A1B16] text-white flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1A1B16] border-b border-[#BF9A3B]/30 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(`/field-gallery/${idNum}${isLead ? "?type=lead" : ""}`)}
          className="p-2 rounded-full hover:bg-white/10 transition-colors"
          title="View gallery"
        >
          <ArrowLeft className="w-5 h-5 text-[#BF9A3B]" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-[#BF9A3B] uppercase tracking-widest">Field Capture</p>
          <h1 className="text-base font-semibold truncate">{client?.name ?? "Client"}</h1>
        </div>
        {/* GPS toggle */}
        <button
          onClick={getLocation}
          disabled={isGettingLocation}
          className={`p-2 rounded-full transition-colors ${
            currentLocation
              ? "bg-green-500/20 text-green-400"
              : "hover:bg-white/10 text-white/40"
          }`}
          title={currentLocation ? "GPS active" : "Enable GPS"}
        >
          {isGettingLocation ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <MapPin className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* GPS status */}
      {currentLocation && (
        <div className="bg-green-500/10 border-b border-green-500/20 px-4 py-1.5 flex items-center gap-2">
          <MapPin className="w-3 h-3 text-green-400" />
          <p className="text-green-400 text-xs">
            GPS: {currentLocation.lat.toFixed(5)}, {currentLocation.lng.toFixed(5)}
          </p>
          <button onClick={() => setCurrentLocation(null)} className="ml-auto text-white/30 hover:text-white/60">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="px-4 pt-4 pb-2 grid grid-cols-3 gap-2">
        {/* Camera button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center gap-2 bg-[#BF9A3B]/10 hover:bg-[#BF9A3B]/20 border border-[#BF9A3B]/40 rounded-2xl py-4 px-2 transition-all active:scale-95"
        >
          <Camera className="w-7 h-7 text-[#BF9A3B]" />
          <span className="text-xs font-medium text-[#BF9A3B] text-center leading-tight">Take Photo</span>
          <span className="text-[10px] text-white/40 text-center">Camera</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePhotoSelect}
        />

        {/* Upload from library button */}
        <button
          onClick={() => libraryInputRef.current?.click()}
          disabled={isUploadingLibrary}
          className="flex flex-col items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/20 rounded-2xl py-4 px-2 transition-all active:scale-95 disabled:opacity-50"
        >
          {isUploadingLibrary ? (
            <Loader2 className="w-7 h-7 text-white/60 animate-spin" />
          ) : (
            <ImagePlus className="w-7 h-7 text-white/60" />
          )}
          <span className="text-xs font-medium text-white/60 text-center leading-tight">
            {isUploadingLibrary ? "Uploading…" : "Upload Photos"}
          </span>
          <span className="text-[10px] text-white/40 text-center">From Library</span>
        </button>
        <input
          ref={libraryInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleLibrarySelect}
        />

        {/* Voice button */}
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`flex flex-col items-center gap-2 border rounded-2xl py-5 px-4 transition-all active:scale-95 ${
            isRecording
              ? "bg-red-500/20 border-red-500/60 animate-pulse"
              : "bg-white/5 hover:bg-white/10 border-white/20"
          }`}
        >
          {isRecording ? (
            <MicOff className="w-8 h-8 text-red-400" />
          ) : (
            <Mic className="w-8 h-8 text-white/70" />
          )}
          <span className={`text-sm font-medium ${isRecording ? "text-red-400" : "text-white/70"}`}>
            {isRecording ? "Stop Recording" : "Voice Note"}
          </span>
          <span className="text-xs text-white/40">{isRecording ? "Tap to stop" : "Dictate a note"}</span>
        </button>
      </div>

      {/* Text note input */}
      <div className="px-4 pb-3">
        <div className="bg-white/5 border border-white/15 rounded-2xl overflow-hidden">
          <Textarea
            placeholder="Type a note about this job site…"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            className="bg-transparent border-0 text-white placeholder:text-white/30 resize-none min-h-[90px] text-base p-4 focus-visible:ring-0"
          />
          <div className="flex items-center justify-between px-4 pb-3">
            <div className="flex items-center gap-1 text-white/30">
              <FileText className="w-3.5 h-3.5" />
              <span className="text-xs">{noteText.length} chars</span>
            </div>
            <Button
              onClick={handleSaveNote}
              disabled={!noteText.trim() || createCapture.isPending}
              size="sm"
              className="bg-[#BF9A3B] hover:bg-[#D4A853] text-black font-semibold rounded-xl px-5"
            >
              {createCapture.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Note"}
            </Button>
          </div>
        </div>
      </div>

      {/* Captured items this session */}
      {items.length > 0 && (
        <div className="px-4 pb-4">
          <p className="text-xs text-white/40 uppercase tracking-widest mb-2">This Session ({items.length})</p>
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="bg-white/5 border border-white/10 rounded-xl overflow-hidden"
              >
                {item.type === "photo" && item.photoDataUrl && (
                  <img
                    src={item.photoDataUrl}
                    alt="Captured"
                    className="w-full max-h-48 object-cover"
                  />
                )}
                <div className="px-3 py-2 flex items-start gap-2">
                  {item.type === "photo" ? (
                    <Image className="w-4 h-4 text-[#BF9A3B] mt-0.5 flex-shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-white/50 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    {item.type === "note" && (
                      <p className="text-sm text-white/80 leading-snug">{item.noteText}</p>
                    )}
                    <p className="text-xs text-white/30 mt-0.5">{formatTime(item.capturedAt)}</p>
                    {item.latitude && (
                      <p className="text-xs text-green-400/60 flex items-center gap-1">
                        <MapPin className="w-2.5 h-2.5" />
                        {item.latitude.toFixed(4)}, {item.longitude?.toFixed(4)}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {item.status === "uploading" && <Loader2 className="w-4 h-4 text-white/40 animate-spin" />}
                    {item.status === "done" && <CheckCircle className="w-4 h-4 text-green-400" />}
                    {item.status === "error" && <X className="w-4 h-4 text-red-400" />}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom padding for mobile */}
      <div className="h-8" />
    </div>
  );
}
