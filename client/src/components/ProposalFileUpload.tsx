/**
 * ProposalFileUpload
 * ──────────────────
 * Drag-and-drop / click-to-browse file upload for the AI Proposal Builder.
 *
 * Accepts:  PDF, DOC/DOCX, JPG/JPEG/PNG/GIF/WebP
 * Extracts: text from PDFs (pdfjs-dist) and Word docs (mammoth)
 *           image preview thumbnails (no text extraction)
 * Feeds:    extracted text back to the parent so the AI can use it as context
 */

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  FileText, FileImage, File, X, RefreshCw, CheckCircle2,
  AlertCircle, Loader2, Upload, Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB (configurable)
const GOLD = "#BF9A3B";

const ACCEPTED_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
};

// ── Types ─────────────────────────────────────────────────────────────────────
export type UploadedFile = {
  id: string;
  file: File;
  name: string;
  size: number;
  mimeType: string;
  status: "extracting" | "ready" | "error";
  extractedText?: string;    // for PDF / Word
  previewUrl?: string;       // for images
  errorMessage?: string;
};

interface ProposalFileUploadProps {
  /** Called whenever the list of ready files changes */
  onFilesChange: (files: UploadedFile[]) => void;
  /** Whether the upload zone is visible (parent controls collapse) */
  visible?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeLabel(mimeType: string): string {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType === "application/msword") return "DOC";
  if (mimeType.includes("wordprocessingml")) return "DOCX";
  if (mimeType.startsWith("image/")) return mimeType.split("/")[1].toUpperCase();
  return "FILE";
}

function FileIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  if (mimeType.startsWith("image/")) return <FileImage className={className} />;
  if (mimeType === "application/pdf" || mimeType.includes("word")) return <FileText className={className} />;
  return <File className={className} />;
}

// ── PDF extraction (pdfjs-dist) ───────────────────────────────────────────────
async function extractPdfText(file: File): Promise<string> {
  // Dynamic import so pdfjs-dist is only loaded when needed
  const pdfjsLib = await import("pdfjs-dist");
  // Use the locally bundled worker URL (resolved by Vite) — no CDN required
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const textParts: string[] = [];

  for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (pageText) textParts.push(pageText);
  }

  return textParts.join("\n\n").slice(0, 12000); // cap at 12k chars for AI context
}

// ── Word extraction (mammoth) ─────────────────────────────────────────────────
async function extractWordText(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value.replace(/\s+/g, " ").trim().slice(0, 12000);
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ProposalFileUpload({
  onFilesChange,
  visible = true,
}: ProposalFileUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);

  // Notify parent whenever files list changes
  function updateFiles(updater: (prev: UploadedFile[]) => UploadedFile[]) {
    setFiles(prev => {
      const next = updater(prev);
      onFilesChange(next.filter(f => f.status === "ready"));
      return next;
    });
  }

  // ── Process a single file ──────────────────────────────────────────────────
  async function processFile(file: File): Promise<void> {
    const id = `${file.name}-${file.size}-${Date.now()}`;

    // Add as "extracting"
    const entry: UploadedFile = {
      id,
      file,
      name: file.name,
      size: file.size,
      mimeType: file.type,
      status: "extracting",
    };
    updateFiles(prev => [...prev, entry]);

    try {
      let extractedText: string | undefined;
      let previewUrl: string | undefined;

      if (file.type === "application/pdf") {
        extractedText = await extractPdfText(file);
      } else if (
        file.type === "application/msword" ||
        file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        extractedText = await extractWordText(file);
      } else if (file.type.startsWith("image/")) {
        previewUrl = URL.createObjectURL(file);
      }

      updateFiles(prev =>
        prev.map(f =>
          f.id === id
            ? { ...f, status: "ready", extractedText, previewUrl }
            : f
        )
      );
    } catch (err: any) {
      updateFiles(prev =>
        prev.map(f =>
          f.id === id
            ? { ...f, status: "error", errorMessage: err?.message ?? "Extraction failed" }
            : f
        )
      );
    }
  }

  // ── Retry failed extraction ────────────────────────────────────────────────
  async function retryFile(id: string) {
    const entry = files.find(f => f.id === id);
    if (!entry) return;
    updateFiles(prev => prev.map(f => f.id === id ? { ...f, status: "extracting", errorMessage: undefined } : f));
    try {
      let extractedText: string | undefined;
      let previewUrl: string | undefined;
      if (entry.mimeType === "application/pdf") {
        extractedText = await extractPdfText(entry.file);
      } else if (entry.mimeType.includes("word")) {
        extractedText = await extractWordText(entry.file);
      } else if (entry.mimeType.startsWith("image/")) {
        previewUrl = URL.createObjectURL(entry.file);
      }
      updateFiles(prev => prev.map(f => f.id === id ? { ...f, status: "ready", extractedText, previewUrl } : f));
    } catch (err: any) {
      updateFiles(prev => prev.map(f => f.id === id ? { ...f, status: "error", errorMessage: err?.message ?? "Extraction failed" } : f));
    }
  }

  // ── Remove a file ──────────────────────────────────────────────────────────
  function removeFile(id: string) {
    updateFiles(prev => {
      const entry = prev.find(f => f.id === id);
      if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      return prev.filter(f => f.id !== id);
    });
  }

  // ── Dropzone ───────────────────────────────────────────────────────────────
  const onDrop = useCallback(
    (accepted: File[], rejected: any[]) => {
      // Handle rejections
      for (const r of rejected) {
        const file = r.file as File;
        const errors: string[] = r.errors.map((e: any) => e.message);
        if (errors.some((e: string) => e.includes("size"))) {
          toast.error(`"${file.name}" exceeds the 20 MB limit.`);
        } else {
          toast.error(`"${file.name}" is not a supported file type. Use PDF, DOC/DOCX, or an image.`);
        }
      }

      // Deduplicate against already-loaded files
      const newFiles = accepted.filter(f => {
        const isDup = files.some(existing => existing.name === f.name && existing.size === f.size);
        if (isDup) toast.warning(`"${f.name}" is already added.`);
        return !isDup;
      });

      for (const file of newFiles) {
        processFile(file);
      }
    },
    [files]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_FILE_SIZE,
    multiple: true,
  });

  if (!visible) return null;

  const hasFiles = files.length > 0;
  const readyCount = files.filter(f => f.status === "ready").length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-2" role="region" aria-label="File upload for AI proposal context">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        role="button"
        tabIndex={0}
        aria-label="Drag and drop files here or click to browse. Accepts PDF, Word documents, and images up to 20 MB."
        className={[
          "relative rounded-lg border-2 border-dashed transition-all duration-150 cursor-pointer outline-none",
          "focus-visible:ring-2 focus-visible:ring-offset-1",
          isDragReject
            ? "border-destructive bg-destructive/5"
            : isDragActive
            ? "border-[#BF9A3B] bg-[#BF9A3B]/8 scale-[1.01]"
            : "border-border/50 hover:border-[#BF9A3B]/60 hover:bg-[#BF9A3B]/4",
        ].join(" ")}
        style={isDragActive ? { boxShadow: `0 0 0 3px ${GOLD}30` } : undefined}
      >
        <input {...getInputProps()} aria-hidden="true" />

        <div className="flex flex-col items-center justify-center gap-2 py-5 px-4 text-center select-none">
          {isDragReject ? (
            <>
              <AlertCircle className="h-7 w-7 text-destructive" />
              <p className="text-sm font-medium text-destructive">Unsupported file type</p>
              <p className="text-xs text-muted-foreground">Only PDF, DOC/DOCX, and images are allowed</p>
            </>
          ) : isDragActive ? (
            <>
              <Upload className="h-7 w-7 animate-bounce" style={{ color: GOLD }} />
              <p className="text-sm font-semibold" style={{ color: GOLD }}>Drop files here…</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Paperclip className="h-5 w-5 text-muted-foreground/60" />
                <span className="text-sm text-muted-foreground font-medium">
                  Drag &amp; drop PDFs, Word docs, or images here
                </span>
              </div>
              <p className="text-xs text-muted-foreground/60">
                or{" "}
                <span className="underline underline-offset-2" style={{ color: GOLD }}>
                  click to browse
                </span>
                {" "}— up to 20 MB per file
              </p>
              <div className="flex gap-1.5 mt-1 flex-wrap justify-center">
                {["PDF", "DOC", "DOCX", "JPG", "PNG"].map(ext => (
                  <span
                    key={ext}
                    className="text-[10px] px-1.5 py-0.5 rounded border font-mono"
                    style={{ borderColor: `${GOLD}30`, color: GOLD, background: `${GOLD}10` }}
                  >
                    .{ext.toLowerCase()}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* File list */}
      {hasFiles && (
        <div className="space-y-1.5" role="list" aria-label="Uploaded files">
          {readyCount > 0 && (
            <p className="text-[10px] text-muted-foreground px-0.5 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" style={{ color: GOLD }} />
              {readyCount} file{readyCount !== 1 ? "s" : ""} ready — the AI will use{" "}
              {readyCount === 1 ? "its" : "their"} content as context
            </p>
          )}
          {files.map(f => (
            <div
              key={f.id}
              role="listitem"
              className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-background/70 px-3 py-2"
              aria-label={`${f.name}, ${formatBytes(f.size)}, status: ${f.status}`}
            >
              {/* Thumbnail or icon */}
              {f.previewUrl ? (
                <img
                  src={f.previewUrl}
                  alt={`Preview of ${f.name}`}
                  className="h-9 w-9 rounded object-cover shrink-0 border border-border/40"
                />
              ) : (
                <div
                  className="h-9 w-9 rounded flex items-center justify-center shrink-0"
                  style={{ background: `${GOLD}12` }}
                  aria-hidden="true"
                >
                  <FileIcon mimeType={f.mimeType} className="h-4 w-4" style={{ color: GOLD } as any} />
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate" title={f.name}>
                  {f.name}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-[10px] text-muted-foreground">{formatBytes(f.size)}</span>
                  <span
                    className="text-[10px] px-1 py-0.5 rounded font-mono font-medium"
                    style={{ background: `${GOLD}15`, color: GOLD }}
                  >
                    {fileTypeLabel(f.mimeType)}
                  </span>

                  {/* Status badge */}
                  {f.status === "extracting" && (
                    <Badge variant="secondary" className="text-[10px] h-4 gap-1 px-1.5">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      Extracting…
                    </Badge>
                  )}
                  {f.status === "ready" && f.extractedText && (
                    <Badge
                      variant="outline"
                      className="text-[10px] h-4 gap-1 px-1.5"
                      style={{ borderColor: "#4CAF7D50", color: "#4CAF7D" }}
                    >
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      Text extracted
                    </Badge>
                  )}
                  {f.status === "ready" && f.previewUrl && (
                    <Badge
                      variant="outline"
                      className="text-[10px] h-4 gap-1 px-1.5"
                      style={{ borderColor: "#5B9BD550", color: "#5B9BD5" }}
                    >
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      Image ready
                    </Badge>
                  )}
                  {f.status === "error" && (
                    <Badge
                      variant="outline"
                      className="text-[10px] h-4 gap-1 px-1.5"
                      style={{ borderColor: "#ef444450", color: "#ef4444" }}
                    >
                      <AlertCircle className="h-2.5 w-2.5" />
                      {f.errorMessage ?? "Error"}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {f.status === "error" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    type="button"
                    onClick={() => retryFile(f.id)}
                    title="Retry extraction"
                    aria-label={`Retry extraction for ${f.name}`}
                  >
                    <RefreshCw className="h-3 w-3 text-muted-foreground" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 hover:text-destructive"
                  type="button"
                  onClick={() => removeFile(f.id)}
                  title="Remove file"
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
