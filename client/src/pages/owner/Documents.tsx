import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, FileText, Image, File, Trash2, Download, FolderOpen } from "lucide-react";
import { format } from "date-fns";

const GOLD = "#BF9A3B";
const DOC_TYPES = ["estimate","contract","photo","compliance","invoice","other"];

function FileIcon({ mimeType }: { mimeType?: string | null }) {
  if (!mimeType) return <File className="h-4 w-4" />;
  if (mimeType.startsWith("image/")) return <Image className="h-4 w-4" style={{ color: "#5B9BD5" }} />;
  if (mimeType.includes("pdf")) return <FileText className="h-4 w-4" style={{ color: "#E05252" }} />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

export default function Documents() {
  const [filterType, setFilterType] = useState("all");
  const [filterProject, setFilterProject] = useState("all");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: docs, refetch } = trpc.documents.list.useQuery({});
  const { data: projects } = trpc.projects.list.useQuery({});
  const uploadDoc = trpc.documents.upload.useMutation({ onSuccess: () => { refetch(); toast.success("Document uploaded!"); } });
  const deleteDoc = trpc.documents.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Document deleted"); } });

  const filtered = (docs ?? []).filter(d => {
    const matchType = filterType === "all" || d.docType === filterType;
    const matchProject = filterProject === "all" || String(d.projectId) === filterProject;
    return matchType && matchProject;
  });

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = (ev.target?.result as string).split(",")[1];
        await uploadDoc.mutateAsync({ fileName: file.name, mimeType: file.type, base64, docType: "other" } as any);
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error("Upload failed");
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif" style={{ color: "var(--kp-cream)" }}>Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} files</p>
        </div>
        <Button className="btn-gold text-sm px-4" onClick={() => fileRef.current?.click()} disabled={uploading}>
          <Upload className="h-4 w-4 mr-1.5" /> {uploading ? "Uploading..." : "Upload File"}
        </Button>
        <input ref={fileRef} type="file" className="hidden" onChange={handleFileUpload} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" />
      </div>

      <div className="flex gap-3">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40 bg-card border-border"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {DOC_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterProject} onValueChange={setFilterProject}>
          <SelectTrigger className="w-48 bg-card border-border"><SelectValue placeholder="All Projects" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {(projects ?? []).map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center text-muted-foreground">
            <FolderOpen className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="text-lg font-serif mb-1">No documents yet</p>
            <p className="text-sm">Upload estimates, contracts, photos, and more</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {filtered.map(doc => (
            <Card key={doc.id} className="bg-card border-border hover:border-primary/30 transition-all">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <FileIcon mimeType={doc.mimeType} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{doc.fileName}</p>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      {doc.docType && <span className="capitalize">{doc.docType}</span>}
                      <span>{format(new Date(doc.createdAt), "MMM d, yyyy")}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {doc.fileUrl && (
                      <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-accent/50"><Download className="h-3.5 w-3.5" /></Button>
                      </a>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/20 hover:text-destructive" onClick={() => { if (confirm("Delete document?")) deleteDoc.mutate({ id: doc.id }); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
