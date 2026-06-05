import { useState, useRef, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  ImagePlus, Upload, Trash2, Loader2, Eye, EyeOff,
  ChevronDown, ChevronUp, Images
} from "lucide-react";

const GOLD = "#BF9A3B";

// Resize a base64 image before upload
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

interface ProposalMediaPanelProps {
  estimateId: number;
  /** clientId or leadId to look up field capture photos */
  clientId?: number;
  leadId?: number;
}

export default function ProposalMediaPanel({ estimateId, clientId, leadId }: ProposalMediaPanelProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const computerInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  // ── Proposal attachments ──────────────────────────────────────────────────
  const { data: attachments = [], isLoading: loadingAttachments } =
    trpc.proposalAttachments.listByEstimate.useQuery({ estimateId });

  const attachFC = trpc.proposalAttachments.attachFieldCapture.useMutation({
    onSuccess: () => {
      utils.proposalAttachments.listByEstimate.invalidate({ estimateId });
      toast.success("Photo attached to proposal");
    },
    onError: (e) => toast.error(e.message),
  });

  const uploadDirect = trpc.proposalAttachments.uploadDirect.useMutation({
    onSuccess: () => {
      utils.proposalAttachments.listByEstimate.invalidate({ estimateId });
      toast.success("Photo uploaded");
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleVisible = trpc.proposalAttachments.toggleClientVisible.useMutation({
    onMutate: async ({ id, clientVisible }) => {
      await utils.proposalAttachments.listByEstimate.cancel({ estimateId });
      const prev = utils.proposalAttachments.listByEstimate.getData({ estimateId });
      utils.proposalAttachments.listByEstimate.setData({ estimateId }, (old) =>
        old?.map((a) => a.id === id ? { ...a, clientVisible: clientVisible ? 1 : 0 } : a)
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) utils.proposalAttachments.listByEstimate.setData({ estimateId }, ctx.prev);
    },
    onSettled: () => utils.proposalAttachments.listByEstimate.invalidate({ estimateId }),
  });

  const removeAttachment = trpc.proposalAttachments.remove.useMutation({
    onSuccess: () => {
      utils.proposalAttachments.listByEstimate.invalidate({ estimateId });
      toast.success("Attachment removed");
    },
  });

  // ── Field capture photos for this client/lead ─────────────────────────────
  // Stabilize input to avoid undefined values that can throw in production superjson serialization
  const fcQueryInput = useMemo(
    () => ({ clientId: clientId ?? undefined, leadId: leadId ?? undefined }),
    [clientId, leadId]
  );
  const { data: fieldCaptures = [], isLoading: loadingFC } =
    trpc.fieldCapture.listByClient.useQuery(
      fcQueryInput,
      { enabled: showPicker && (!!clientId || !!leadId) }
    );

  const fcPhotos = fieldCaptures.filter((fc) => fc.type === "photo" && fc.photoUrl);
  const attachedFcIds = new Set(attachments.map((a) => a.fieldCaptureId).filter(Boolean));

  // ── Upload from computer ──────────────────────────────────────────────────
  const handleComputerUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    e.target.value = "";
    setIsUploading(true);
    try {
      for (const file of files) {
        const dataUrl = await new Promise<string>((res) => {
          const reader = new FileReader();
          reader.onload = (ev) => res(ev.target?.result as string);
          reader.readAsDataURL(file);
        });
        const resized = await resizeImage(dataUrl);
        await uploadDirect.mutateAsync({
          estimateId,
          dataUrl: resized,
          mime: "image/jpeg",
          fileName: file.name,
          clientVisible: true,
        });
      }
    } finally {
      setIsUploading(false);
    }
  }, [estimateId, uploadDirect]);

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Images className="h-4 w-4" style={{ color: GOLD }} />
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
            Proposal Photos
          </p>
          {attachments.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
              style={{ background: `${GOLD}25`, color: GOLD }}>
              {attachments.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Upload from computer */}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-border/60 gap-1.5"
            disabled={isUploading}
            onClick={() => computerInputRef.current?.click()}
          >
            {isUploading
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Upload className="h-3 w-3" />}
            Upload
          </Button>
          <input
            ref={computerInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleComputerUpload}
          />
          {/* Pick from field capture */}
          {(clientId || leadId) && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-border/60 gap-1.5"
              onClick={() => setShowPicker((v) => !v)}
            >
              <ImagePlus className="h-3 w-3" />
              From Field
              {showPicker ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          )}
        </div>
      </div>

      {/* Field capture photo picker */}
      {showPicker && (
        <div className="rounded-lg border border-border/60 p-3 space-y-2"
          style={{ background: "var(--kp-charcoal-light, #2A2B24)" }}>
          <p className="text-xs text-muted-foreground">
            Select field capture photos to attach to this proposal:
          </p>
          {loadingFC ? (
            <div className="flex items-center gap-2 text-muted-foreground text-xs py-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading field photos…
            </div>
          ) : fcPhotos.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              No field capture photos found for this client yet.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {fcPhotos.map((fc) => {
                const isAttached = attachedFcIds.has(fc.id);
                return (
                  <button
                    key={fc.id}
                    disabled={isAttached || attachFC.isPending}
                    onClick={() => attachFC.mutate({ estimateId, fieldCaptureId: fc.id, clientVisible: true })}
                    className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                      isAttached
                        ? "border-green-500/60 opacity-60 cursor-default"
                        : "border-transparent hover:border-[#BF9A3B]/60 cursor-pointer active:scale-95"
                    }`}
                    title={isAttached ? "Already attached" : "Click to attach"}
                  >
                    <img
                      src={fc.photoUrl!}
                      alt="Field capture"
                      className="w-full aspect-square object-cover"
                    />
                    {isAttached && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <span className="text-green-400 text-lg">✓</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Attached photos grid */}
      {loadingAttachments ? (
        <div className="flex items-center gap-2 text-muted-foreground text-xs py-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading attachments…
        </div>
      ) : attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">
          No photos attached yet. Use "From Field" to pick from field captures, or "Upload" to add from your computer.
        </p>
      ) : (
        <div className="space-y-2">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-3 rounded-lg border border-border/40 p-2"
              style={{ background: "var(--kp-charcoal-light, #2A2B24)" }}
            >
              {/* Thumbnail */}
              <img
                src={att.fileUrl}
                alt={att.fileName ?? "Attachment"}
                className="w-14 h-14 object-cover rounded-md flex-shrink-0"
              />
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {att.fileName ?? `Photo ${att.id}`}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {att.fieldCaptureId ? "From field capture" : "Direct upload"}
                </p>
              </div>
              {/* Client visibility toggle */}
              <div className="flex flex-col items-center gap-1 flex-shrink-0">
                <Switch
                  checked={att.clientVisible === 1}
                  onCheckedChange={(checked) =>
                    toggleVisible.mutate({ id: att.id, clientVisible: checked })
                  }
                  className="scale-75"
                />
                <span className="text-[9px] text-muted-foreground leading-none">
                  {att.clientVisible === 1 ? (
                    <span className="flex items-center gap-0.5 text-green-400">
                      <Eye className="h-2.5 w-2.5" /> Client
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5 text-muted-foreground">
                      <EyeOff className="h-2.5 w-2.5" /> Hidden
                    </span>
                  )}
                </span>
              </div>
              {/* Remove */}
              <button
                onClick={() => removeAttachment.mutate({ id: att.id })}
                disabled={removeAttachment.isPending}
                className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
