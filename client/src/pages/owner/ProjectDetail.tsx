import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, CheckCircle, Clock, AlertCircle, Calendar, DollarSign,
  MapPin, Edit2, Sparkles, Trash2, ExternalLink, CreditCard, ChevronDown,
  ChevronRight, ListTodo, MessageSquare, Mail, Phone, Upload, RefreshCw,
  Send, FileText, Loader2, Circle, FolderOpen, Image, StickyNote, Download,
  Mic, MicOff, Square, GitBranch, ShieldAlert, TrendingUp, TrendingDown, Minus,
  Activity, BarChart3, AlertTriangle, CheckCircle2, Banknote, Receipt, Zap,
  Users2, Star, ShieldCheck, ShieldX, ExternalLink as ExternalLinkIcon, Camera
} from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { useState, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { TradePartnersTab } from "@/components/TradePartnersTab";
import InspirationDrawer from "@/components/InspirationDrawer";
import FieldCaptureDrawer from "@/components/FieldCaptureDrawer";
import { SiteMeetingsTab } from "@/components/SiteMeetingsTab";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RiskSparkline } from "@/components/RiskSparkline";
import { RFICreateDialog } from "@/components/RFICreateDialog";
import { RFISection } from "@/components/RFISection";
import { ChangeOrdersSection } from "@/components/ChangeOrdersSection";

const GOLD = "#BF9A3B";
const STATUS_OPTIONS = ["planning","active","on_hold","completed","cancelled"];
const AI_FREQ = ["daily","every_few_days","weekly","manual"];
const TASK_STATUSES = ["pending","in_progress","completed","blocked"] as const;

function StatusBadge({ status }: { status: string | null | undefined }) {
  const map: Record<string, { label: string; color: string }> = {
    planning: { label: "Planning", color: "#9B59B6" },
    active: { label: "Active", color: "#4CAF7D" },
    on_hold: { label: "On Hold", color: "#E8A838" },
    completed: { label: "Completed", color: "#4CAF7D" },
    cancelled: { label: "Cancelled", color: "#E05252" },
    pending: { label: "Pending", color: "#8A8B82" },
    in_progress: { label: "In Progress", color: "#5B9BD5" },
    delayed: { label: "Delayed", color: "#E05252" },
    blocked: { label: "Blocked", color: "#E05252" },
  };
  const s = map[status ?? ''] ?? { label: status ?? 'Unknown', color: GOLD };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: `${s.color}20`, color: s.color, border: `1px solid ${s.color}40` }}>
      {s.label}
    </span>
  );
}

function TaskStatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle className="h-4 w-4 shrink-0" style={{ color: "#4CAF7D" }} />;
  if (status === "in_progress") return <Clock className="h-4 w-4 shrink-0" style={{ color: "#5B9BD5" }} />;
  if (status === "blocked") return <AlertCircle className="h-4 w-4 shrink-0" style={{ color: "#E05252" }} />;
  return <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />;
}

function ChannelIcon({ channel }: { channel: string }) {
  if (channel === "sms") return <Phone className="h-3.5 w-3.5" />;
  if (channel === "email") return <Mail className="h-3.5 w-3.5" />;
  if (channel === "portal") return <Upload className="h-3.5 w-3.5" />;
  return <MessageSquare className="h-3.5 w-3.5" />;
}

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id ?? "0");
  const [, setLocation] = useLocation();
  const [showEditStatus, setShowEditStatus] = useState(false);
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [editStatus, setEditStatus] = useState("");
  const [editFreq, setEditFreq] = useState("");
  const [editName, setEditName] = useState("");
  const [milestoneForm, setMilestoneForm] = useState({ title: "", description: "", dueDate: "", billingAmount: "" });

  const { data: project, refetch } = trpc.projects.get.useQuery({ id });
  const { data: milestones, refetch: refetchMilestones } = trpc.projects.getMilestones.useQuery({ projectId: id });
  const { data: inspirationPhotos, refetch: refetchPhotos } = trpc.documents.listInspirationPhotos.useQuery({ projectId: id }, { enabled: !!id });
  const deleteInspirationPhoto = trpc.documents.deleteInspirationPhoto.useMutation({ onSuccess: () => { refetchPhotos(); toast.success("Photo removed"); } });
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const updateProject = trpc.projects.update.useMutation({ onSuccess: () => { refetch(); setShowEditStatus(false); toast.success("Project updated!"); } });
  const createMilestone = trpc.projects.createMilestone.useMutation({ onSuccess: () => { refetchMilestones(); setShowAddMilestone(false); setMilestoneForm({ title: "", description: "", dueDate: "", billingAmount: "" }); toast.success("Milestone added!"); } });
  const updateMilestone = trpc.projects.updateMilestone.useMutation({ onSuccess: () => { refetchMilestones(); toast.success("Milestone updated!"); } });

  // ── Proposal (for budget fallback) ──────────────────────────────────────────
  const { data: linkedProposal } = trpc.estimates.get.useQuery(
    { id: (project as any)?.estimateId ?? 0 },
    { enabled: !!((project as any)?.estimateId) }
  );

  // ── Payments tab ─────────────────────────────────────────────────────────────
  // Pass both projectId AND leadId so invoices linked by either are shown
  const { data: projectInvoices, refetch: refetchInvoices } = trpc.invoices.list.useQuery(
    { projectId: id, leadId: project?.leadId ?? undefined },
    { enabled: !!id }
  );
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<number | null>(null);
  const [showRecordPayment, setShowRecordPayment] = useState<number | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "check" as "square"|"check"|"cash"|"ach"|"other", note: "", checkNumber: "", paidDate: new Date().toISOString().slice(0, 10), sendReceipt: false, ccOperator: false });
  const { data: expandedPayments } = trpc.invoices.listPayments.useQuery(
    { invoiceId: expandedInvoiceId ?? 0 },
    { enabled: !!expandedInvoiceId }
  );
  const utils = trpc.useUtils();
  const { data: projectPOs } = trpc.purchaseOrders.list.useQuery({ projectId: id }, { enabled: !!id });
  const { data: coSummary } = trpc.changeOrders.sumApproved.useQuery({ projectId: id }, { enabled: !!id });
  const recordPaymentMutation = trpc.invoices.recordPayment.useMutation({
    onSuccess: (data) => {
      toast.success(data.fullyPaid ? "Invoice marked as paid!" : `Payment recorded. Balance: $${data.balance.toLocaleString()}`);
      setShowRecordPayment(null);
      setPaymentForm({ amount: "", method: "check", note: "" });
      refetchInvoices();
      if (expandedInvoiceId) utils.invoices.listPayments.invalidate({ invoiceId: expandedInvoiceId });
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Tasks tab ─────────────────────────────────────────────────────────────────
  const { data: projectTasks, refetch: refetchTasks } = trpc.projects.listTasks.useQuery({ projectId: id }, { enabled: !!id });
  const updateTask = trpc.projects.updateTask.useMutation({ onSuccess: () => { refetchTasks(); } });
  const completeTask = trpc.projects.completeTask.useMutation({
    onSuccess: (data) => {
      refetchTasks();
      const sent = data.notifyResults?.length ?? 0;
      toast.success(sent > 0 ? `Task completed! ${sent} notification${sent !== 1 ? 's' : ''} sent.` : "Task marked complete!");
    },
    onError: (e) => toast.error(e.message),
  });
  const addTask = trpc.projects.addTask.useMutation({
    onSuccess: (data) => {
      refetchTasks();
      setShowAddTask(false);
      resetTaskForm();
      const sent = data.notifyResults?.length ?? 0;
      toast.success(sent > 0 ? `Task added! ${sent} notification${sent !== 1 ? 's' : ''} sent.` : "Task added!");
    },
    onError: (e) => toast.error(e.message),
  });
  const addCategory = trpc.projects.addCategory.useMutation({
    onSuccess: () => { refetchCategories(); },
  });
  const { data: taskCategories, refetch: refetchCategories } = trpc.projects.getCategories.useQuery({ projectId: id }, { enabled: !!id });
  const { data: vendorList } = trpc.vendors.list.useQuery();
  const { data: crewList } = trpc.crew.list.useQuery();
  const { data: projectClient } = trpc.clients.get.useQuery({ id: project?.clientId ?? 0 }, { enabled: !!project?.clientId });
  const [showAddTask, setShowAddTask] = useState(false);
  type TaskAssignee = { assigneeType: "lead"|"vendor"|"crew"|"custom"; assigneeId?: number; name: string; email?: string; phone?: string; };
  const [taskForm, setTaskForm] = useState({ title: "", description: "", category: "", dueDate: "", assignees: [] as TaskAssignee[], attachmentUrl: "", attachmentName: "" });
  const [taskAttachUploading, setTaskAttachUploading] = useState(false);
  const taskAttachInputRef = useRef<HTMLInputElement>(null);
  const uploadTaskAttachment = trpc.projects.uploadTaskAttachment.useMutation({
    onSuccess: (data) => {
      setTaskForm(f => ({ ...f, attachmentUrl: data.url, attachmentName: data.name }));
      setTaskAttachUploading(false);
    },
    onError: (e) => { toast.error("Upload failed: " + e.message); setTaskAttachUploading(false); },
  });
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [customAssigneeForm, setCustomAssigneeForm] = useState({ show: false, name: "", email: "", phone: "" });

  // ── Edit Task dialog ─────────────────────────────────────────────────────────
  const [editTaskId, setEditTaskId] = useState<number | null>(null);
  const [editTaskForm, setEditTaskForm] = useState({ title: "", description: "", category: "", dueDate: "", attachmentUrl: "", attachmentName: "" });
  const [editTaskAttachUploading, setEditTaskAttachUploading] = useState(false);
  const editTaskAttachInputRef = useRef<HTMLInputElement>(null);
  const uploadEditTaskAttachment = trpc.projects.uploadTaskAttachment.useMutation({
    onSuccess: (data) => {
      setEditTaskForm(f => ({ ...f, attachmentUrl: data.url, attachmentName: data.name }));
      setEditTaskAttachUploading(false);
    },
    onError: (e) => { toast.error("Upload failed: " + e.message); setEditTaskAttachUploading(false); },
  });
  const saveEditTask = trpc.projects.updateTask.useMutation({
    onSuccess: () => { refetchTasks(); setEditTaskId(null); toast.success("Task updated!"); },
    onError: (e) => toast.error(e.message),
  });

  function openEditTask(task: any) {
    setEditTaskForm({
      title: task.title ?? "",
      description: task.description ?? "",
      category: task.category ?? "",
      dueDate: task.dueDate ? task.dueDate.split("T")[0] : "",
      attachmentUrl: (task as any).attachmentUrl ?? "",
      attachmentName: (task as any).attachmentName ?? "",
    });
    setEditTaskId(task.id);
  }

  function handleEditTaskAttachFile(file: File) {
    if (file.size > 20 * 1024 * 1024) { toast.error("File must be under 20 MB"); return; }
    const allowed = ["image/jpeg","image/png","image/gif","image/webp","image/heic","application/pdf"];
    if (!allowed.includes(file.type)) { toast.error("Only images and PDFs are allowed"); return; }
    setEditTaskAttachUploading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string) ?? "";
      uploadEditTaskAttachment.mutate({ fileName: file.name, fileDataBase64: base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  }
  const [taskFilter, setTaskFilter] = useState<"all"|"pending"|"in_progress"|"completed"|"blocked">("all");
  const [taskCategoryFilter, setTaskCategoryFilter] = useState<string>("all");
  const [taskAssigneeFilter, setTaskAssigneeFilter] = useState<string>("all");
  // Per-project custom assignee roster
  const { data: customAssigneeRoster, refetch: refetchCustomAssignees } = trpc.projects.getCustomAssignees.useQuery({ projectId: id }, { enabled: !!id });
  const { user: ownerUser } = useAuth();
  // Task reply state
  const [expandedReplyTaskId, setExpandedReplyTaskId] = useState<number | null>(null);
  const [logReplyForm, setLogReplyForm] = useState({ show: false, taskId: 0, taskTitle: "", repliedBy: "", replyText: "" });
  const { data: taskReplies, refetch: refetchReplies } = trpc.projects.getTaskReplies.useQuery(
    { taskId: expandedReplyTaskId ?? 0 },
    { enabled: !!expandedReplyTaskId }
  );
  const addTaskReply = trpc.projects.addTaskReply.useMutation({
    onSuccess: () => {
      refetchReplies();
      setLogReplyForm({ show: false, taskId: 0, taskTitle: "", repliedBy: "", replyText: "" });
      toast.success("Reply recorded!");
    },
    onError: (e) => toast.error(e.message),
  });
  // AI project summary
  const { data: projectSummary, refetch: refetchSummary } = trpc.projects.getProjectSummary.useQuery({ projectId: id }, { enabled: !!id });
  const generateSummary = trpc.projects.generateProjectSummary.useMutation({
    onSuccess: () => { refetchSummary(); toast.success("AI summary generated!"); },
    onError: (e) => toast.error("Summary failed: " + e.message),
  });
  // Milestone → invoice generation
  const [milestoneInvoiceDialog, setMilestoneInvoiceDialog] = useState<{ open: boolean; milestoneId: number; milestoneTitle: string; billingAmount: string; milestoneStatus: string; bypassGate: boolean; } | null>(null);
  const createMilestoneInvoice = trpc.invoices.create.useMutation({
    onSuccess: (d) => {
      toast.success(`Draft invoice ${d.invoiceNumber} created — go to Invoices to review and send.`);
      setMilestoneInvoiceDialog(null);
    },
    onError: (e) => toast.error("Invoice creation failed: " + e.message),
  });

  function resetTaskForm() {
    setTaskForm({ title: "", description: "", category: "", dueDate: "", assignees: [], attachmentUrl: "", attachmentName: "" });
    setCustomAssigneeForm({ show: false, name: "", email: "", phone: "" });
    setNewCategoryInput("");
  }

  function handleTaskAttachFile(file: File) {
    if (file.size > 20 * 1024 * 1024) { toast.error("File must be under 20 MB"); return; }
    const allowed = ["image/jpeg","image/png","image/gif","image/webp","image/heic","application/pdf"];
    if (!allowed.includes(file.type)) { toast.error("Only images and PDFs are allowed"); return; }
    setTaskAttachUploading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string) ?? "";
      uploadTaskAttachment.mutate({ fileName: file.name, fileDataBase64: base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  }

  function removeAssignee(idx: number) {
    setTaskForm(f => ({ ...f, assignees: f.assignees.filter((_, i) => i !== idx) }));
  }

  function addAssigneeFromList(a: TaskAssignee) {
    if (taskForm.assignees.some(x => x.assigneeType === a.assigneeType && x.assigneeId === a.assigneeId && x.name === a.name)) return;
    setTaskForm(f => ({ ...f, assignees: [...f.assignees, a] }));
  }

  // ── AI: Risk Score & Financial Snapshot ────────────────────────────────────
  const { data: riskScores, refetch: refetchRisk } = trpc.agents.riskScores.forProject.useQuery(
    { projectId: id, limit: 1 },
    { enabled: !!id }
  );
  const latestRisk = riskScores?.[0] ?? null;
  const { data: riskHistory } = trpc.agents.riskScores.history.useQuery(
    { projectId: id, limit: 14 },
    { enabled: !!id }
  );
  const [riskScanRunning, setRiskScanRunning] = useState(false);
  const runRiskScan = trpc.agents.runProjectRisk.useMutation({
    onSuccess: () => {
      toast.success("Risk scan started — results will update shortly.");
      // Poll for updated score after a short delay
      setTimeout(() => { refetchRisk(); setRiskScanRunning(false); }, 4000);
    },
    onError: (e) => { toast.error("Risk scan failed: " + e.message); setRiskScanRunning(false); },
  });
  const { data: financialSnaps } = trpc.agents.financialSnapshots.forProject.useQuery(
    { projectId: id, limit: 1 },
    { enabled: !!id }
  );
   const latestFinancial = financialSnaps?.[0] ?? null;
  // -- Next Action Engine
  const { data: nextAction, refetch: refetchNextAction } = trpc.agents.nextActions.get.useQuery(
    { projectId: id },
    { enabled: !!id }
  );
  const [nextActionComputing, setNextActionComputing] = useState(false);
  const computeNextActionMut = trpc.agents.nextActions.compute.useMutation({
    onSuccess: () => {
      toast.success("Next action computed.");
      setTimeout(() => { refetchNextAction(); setNextActionComputing(false); }, 1000);
    },
    onError: (e) => { toast.error("Compute failed: " + e.message); setNextActionComputing(false); },
  });
  // ── Documents & Media tab ───────────────────────────────────────────────────
  const { data: projectDocs, refetch: refetchDocs } = trpc.documents.list.useQuery({ projectId: id }, { enabled: !!id });
  const { data: designNotes, refetch: refetchDesignNotes } = trpc.documents.getDesignNotesByLead.useQuery(
    { leadId: project?.leadId ?? 0 },
    { enabled: !!(project?.leadId) }
  );
  const deletDocMutation = trpc.documents.delete.useMutation({ onSuccess: () => { refetchDocs(); toast.success("Document removed"); } });
  const [showUploadDoc, setShowUploadDoc] = useState(false);
  const [uploadDocForm, setUploadDocForm] = useState({ fileName: "", fileDataBase64: "", mimeType: "", docType: "photo" as any, description: "" });
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const uploadDocFileRef = useRef<HTMLInputElement | null>(null);
  const uploadDocMutation = trpc.documents.uploadFile.useMutation({
    onSuccess: () => { refetchDocs(); setShowUploadDoc(false); setUploadDocForm({ fileName: "", fileDataBase64: "", mimeType: "", docType: "photo", description: "" }); toast.success("Document uploaded!"); },
    onError: (e) => toast.error("Upload failed: " + e.message),
  });

  // ── Messages tab ──────────────────────────────────────────────────────────────
  const { data: messagesData, refetch: refetchMessages } = trpc.messages.listByProject.useQuery({ projectId: id }, { enabled: !!id });
  const pollGmail = trpc.messages.pollGmail.useMutation({
    onSuccess: (d) => {
      refetchMessages();
      toast.success(d.newMessages > 0 ? `${d.newMessages} new email(s) synced` : "No new emails found");
    },
    onError: () => toast.error("Gmail sync failed — check credentials"),
  });
  const [msgBody, setMsgBody] = useState("");
  const [msgChannel, setMsgChannel] = useState<"sms"|"email">("sms");
  const [msgTo, setMsgTo] = useState("");
  const [msgSubject, setMsgSubject] = useState("");
  const sendMessage = trpc.messages.create.useMutation({
    onSuccess: () => { refetchMessages(); setMsgBody(""); setMsgSubject(""); toast.success("Message sent!"); },
    onError: (e) => toast.error(e.message),
  });
  // Quick send to project client
  const [quickMsgBody, setQuickMsgBody] = useState("");
  const [quickMsgSubject, setQuickMsgSubject] = useState("");
  const [quickMsgChannels, setQuickMsgChannels] = useState<"both"|"sms"|"email">("both");
  const [quickMsgRecording, setQuickMsgRecording] = useState(false);
  const [inspirationDrawerOpen, setInspirationDrawerOpen] = useState(false);
  const [fieldCaptureDrawerOpen, setFieldCaptureDrawerOpen] = useState(false);
  const quickMsgMediaRef = useRef<MediaRecorder | null>(null);
  const quickMsgChunksRef = useRef<Blob[]>([]);
  const sendProjectMessage = trpc.messages.sendProjectMessage.useMutation({
    onSuccess: (d) => {
      refetchMessages();
      setQuickMsgBody("");
      setQuickMsgSubject("");
      toast.success(`Message sent to ${d.sent} contact${d.sent !== 1 ? "s" : ""}!`);
    },
    onError: (e) => toast.error(e.message),
  });
  const transcribeVoice = trpc.messages.transcribeVoice.useMutation({
    onSuccess: (d) => {
      if (d.text) setQuickMsgBody(prev => prev ? prev + " " + d.text : d.text);
      else toast.error("Could not transcribe audio");
    },
    onError: () => toast.error("Transcription failed"),
  });
  async function startVoiceRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType });
      quickMsgChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) quickMsgChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(quickMsgChunksRef.current, { type: mimeType });
        const arrayBuffer = await blob.arrayBuffer();
        const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        transcribeVoice.mutate({ base64Audio, mimeType });
      };
      mr.start();
      quickMsgMediaRef.current = mr;
      setQuickMsgRecording(true);
    } catch { toast.error("Microphone access denied"); }
  }
  function stopVoiceRecording() {
    quickMsgMediaRef.current?.stop();
    setQuickMsgRecording(false);
  }

  if (!project) return <div className="p-6 text-muted-foreground">Loading project...</div>;

  // ── Task helpers ──────────────────────────────────────────────────────────────
  const allTasks = projectTasks ?? [];
  const filteredTasks = allTasks.filter(t => {
    if (taskFilter !== "all" && t.status !== taskFilter) return false;
    if (taskCategoryFilter !== "all" && (t.category ?? "") !== taskCategoryFilter) return false;
    if (taskAssigneeFilter !== "all") {
      const assignees = (t as any).assignees ?? [];
      if (!assignees.some((a: any) => a.name === taskAssigneeFilter)) return false;
    }
    return true;
  });
  // Unique assignees across all tasks for filter dropdown
  const allTaskAssigneeNames = Array.from(new Set(
    allTasks.flatMap(t => ((t as any).assignees ?? []).map((a: any) => a.name))
  )).sort();
  const allTaskCategories = Array.from(new Set(allTasks.map(t => t.category ?? "").filter(Boolean))).sort();
  const taskCounts = {
    pending: allTasks.filter(t => t.status === "pending").length,
    in_progress: allTasks.filter(t => t.status === "in_progress").length,
    completed: allTasks.filter(t => t.status === "completed").length,
    blocked: allTasks.filter(t => t.status === "blocked").length,
  };

  // ── Message helpers ───────────────────────────────────────────────────────────
  const allMessages = (messagesData as any)?.messages ?? [];
  const allDocs = (messagesData as any)?.documents ?? [];
  // Merge and sort chronologically
  type FeedItem = { id: number; type: "message"|"document"; ts: Date; data: any };
  const feed: FeedItem[] = [
    ...allMessages.map((m: any) => ({ id: m.id, type: "message" as const, ts: new Date(m.createdAt), data: m })),
    ...allDocs.filter((d: any) => d.docType === "inspiration" || d.docType === "photo" || d.docType === "other").map((d: any) => ({
      id: d.id, type: "document" as const, ts: new Date(d.createdAt), data: d
    })),
  ].sort((a, b) => b.ts.getTime() - a.ts.getTime()); // newest first

  function cycleTaskStatus(current: string) {
    const cycle: Record<string, typeof TASK_STATUSES[number]> = {
      pending: "in_progress",
      in_progress: "completed",
      completed: "pending",
      blocked: "pending",
    };
    return cycle[current] ?? "pending";
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setLocation("/projects")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-serif truncate" style={{ color: "var(--kp-cream)" }}>{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            {project.address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{project.address}</span>}
            {project.projectType && <span>{project.projectType}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(project as any).estimateId && (
            <Button variant="outline" size="sm" className="border-border/60" onClick={() => setLocation("/proposals?highlight=" + (project as any).estimateId)}>
              <FileText className="h-3.5 w-3.5 mr-1.5" /> View Proposal
            </Button>
          )}
          <Button variant="outline" size="sm" className="border-border/60" onClick={() => { setEditStatus(project.status); setEditFreq(project.aiUpdateFrequency ?? "weekly"); setEditName(project.name ?? ""); setShowEditStatus(true); }}>
            <Edit2 className="h-3.5 w-3.5 mr-1.5" /> Edit
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Budget", value: (() => {
            const budget = project.budgetEstimated ? Number(project.budgetEstimated) : (linkedProposal?.total ? Number(linkedProposal.total) : null);
            return budget ? `$${budget.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—";
          })(), color: GOLD, icon: DollarSign, tooltip: !project.budgetEstimated && linkedProposal?.total ? "From linked proposal" : undefined },
          { label: "Deposit %", value: `${project.depositPercent ?? 50}%`, color: "#5B9BD5", icon: DollarSign },
          { label: "Start Date", value: project.startDate ? format(new Date(project.startDate), "MMM d, yyyy") : "—", color: "#4CAF7D", icon: Calendar },
          { label: "Est. End", value: project.estimatedEndDate ? format(new Date(project.estimatedEndDate), "MMM d, yyyy") : "—", color: "#E8A838", icon: Calendar },
        ].map(card => (
          <Card key={card.label} className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest">{card.label}</p>
                  <p className="text-lg font-semibold mt-1" style={{ color: card.color }}>{card.value}</p>
                  {(card as any).tooltip && <p className="text-xs text-muted-foreground mt-0.5">{(card as any).tooltip}</p>}
                </div>
                <card.icon className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── AI Intelligence Row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

        {/* Risk Score Card */}
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground uppercase tracking-widest">Project Risk</p>
                </div>
                {latestRisk ? (() => {
                  const score = latestRisk.score ?? 0;
                  const level = latestRisk.riskLevel ?? "low";
                  const levelColor = level === "critical" ? "#EF4444" : level === "high" ? "#F97316" : level === "medium" ? "#EAB308" : "#4CAF7D";
                  const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);
                  const flags: string[] = (() => { try { return JSON.parse(latestRisk.flags ?? "[]"); } catch { return []; } })();
                  return (
                    <div>
                      <div className="flex items-end gap-2">
                        <span className="text-3xl font-bold tabular-nums" style={{ color: levelColor }}>{score}</span>
                        <span className="text-sm text-muted-foreground mb-1">/100</span>
                        <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: levelColor + "22", color: levelColor }}>{levelLabel}</span>
                      </div>
                      {flags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {flags.slice(0, 3).map((f, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground truncate max-w-[160px]">{f}</span>
                          ))}
                          {flags.length > 3 && <span className="text-[10px] text-muted-foreground">+{flags.length - 3} more</span>}
                        </div>
                      )}
                      {riskHistory && riskHistory.length >= 2 && (
                        <div className="mt-2">
                          <RiskSparkline data={riskHistory} width={120} height={28} />
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-2">
                        Last scan: {format(new Date(latestRisk.scoredAt), "MMM d, h:mm a")}
                      </p>
                    </div>
                  );
                })() : (
                  <div>
                    <p className="text-sm text-muted-foreground">No risk scan yet</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Run a scan to assess this project</p>
                  </div>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-border/60 shrink-0"
                disabled={riskScanRunning || runRiskScan.isPending}
                onClick={() => {
                  setRiskScanRunning(true);
                  runRiskScan.mutate({ projectId: id });
                }}
              >
                {(riskScanRunning || runRiskScan.isPending) ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Scanning...</>
                ) : (
                  <><Activity className="h-3.5 w-3.5 mr-1.5" />Run Scan</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Financial Health Card */}
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground uppercase tracking-widest">Financial Health</p>
            </div>
            {latestFinancial ? (() => {
              const snap = latestFinancial as any;
              const estimated = Number(snap.budgetEstimated ?? 0);
              const actual = Number(snap.budgetActual ?? 0);
              const pct = estimated > 0 ? Math.min(100, Math.round((actual / estimated) * 100)) : 0;
              const overrun = actual > estimated && estimated > 0;
              const barColor = overrun ? "#EF4444" : pct > 80 ? "#EAB308" : "#4CAF7D";
              const overdueCount = Number(snap.overdueInvoiceCount ?? 0);
              const depositOk = snap.depositCollected === 1 || snap.depositCollected === true;
              const flags: string[] = (() => { try { return JSON.parse(snap.flags ?? "[]"); } catch { return []; } })();
              return (
                <div className="space-y-2.5">
                  {/* Budget vs Actual bar */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Budget vs Actual</span>
                      <span className="font-medium" style={{ color: barColor }}>
                        ${actual.toLocaleString(undefined, { maximumFractionDigits: 0 })} / ${estimated.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{pct}% of budget used{overrun ? " — OVER BUDGET" : ""}</p>
                  </div>
                  {/* Status row */}
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                      {overdueCount > 0
                        ? <AlertTriangle className="h-3.5 w-3.5" style={{ color: "#EF4444" }} />
                        : <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "#4CAF7D" }} />}
                      <span className={overdueCount > 0 ? "text-red-400" : "text-muted-foreground"}>
                        {overdueCount > 0 ? `${overdueCount} overdue invoice${overdueCount !== 1 ? "s" : ""}` : "No overdue invoices"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {depositOk
                        ? <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "#4CAF7D" }} />
                        : <AlertTriangle className="h-3.5 w-3.5" style={{ color: "#EAB308" }} />}
                      <span className={depositOk ? "text-muted-foreground" : "text-yellow-400"}>
                        {depositOk ? "Deposit collected" : "Deposit pending"}
                      </span>
                    </div>
                  </div>
                  {/* Flags */}
                  {flags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {flags.slice(0, 2).map((f, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 truncate max-w-[200px]">{f}</span>
                      ))}
                      {flags.length > 2 && <span className="text-[10px] text-muted-foreground">+{flags.length - 2} flags</span>}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    Last review: {format(new Date(snap.snapshotAt), "MMM d, h:mm a")}
                  </p>
                </div>
              );
            })() : (
              <div className="text-sm text-muted-foreground">
                <p>No financial snapshot yet</p>
                <p className="text-[10px] mt-0.5">Financial review runs automatically every 24 hours</p>
              </div>
            )}
           </CardContent>
        </Card>
      </div>

      {/* ── Next Action Engine Card ──────────────────────────────────────────── */}
      <Card className="bg-card border-border overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4" style={{ color: GOLD }} />
                <p className="text-xs text-muted-foreground uppercase tracking-widest">Next Best Action</p>
                {nextAction?.isStale && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Stale</span>
                )}
              </div>
              {nextAction ? (() => {
                const urgencyColor = nextAction.urgency === "critical" ? "#EF4444" : nextAction.urgency === "high" ? "#F97316" : nextAction.urgency === "medium" ? "#EAB308" : "#4CAF7D";
                const urgencyLabel = nextAction.urgency.charAt(0).toUpperCase() + nextAction.urgency.slice(1);
                const supporting: string[] = (() => { try { return JSON.parse(nextAction.supportingActions ?? "[]"); } catch { return []; } })();
                return (
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-foreground text-sm">{nextAction.primaryAction}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: urgencyColor + "22", color: urgencyColor, border: `1px solid ${urgencyColor}40` }}>{urgencyLabel}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{nextAction.reason}</p>
                    {supporting.length > 0 && (
                      <div className="space-y-1">
                        {supporting.slice(0, 3).map((s, i) => (
                          <div key={i} className="flex items-start gap-1.5">
                            <span className="text-muted-foreground/40 text-xs mt-0.5">→</span>
                            <span className="text-xs text-muted-foreground">{s}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-2">
                      Computed: {format(new Date(nextAction.computedAt), "MMM d, h:mm a")} · Confidence: {nextAction.confidence}
                    </p>
                  </div>
                );
              })() : (
                <div>
                  <p className="text-sm text-muted-foreground">No action computed yet</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Click Compute to generate the next best action for this project</p>
                </div>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-border/60 shrink-0"
              disabled={nextActionComputing || computeNextActionMut.isPending}
              onClick={() => {
                setNextActionComputing(true);
                computeNextActionMut.mutate({ projectId: id });
              }}
            >
              {(nextActionComputing || computeNextActionMut.isPending) ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Computing...</>
              ) : (
                <><Zap className="h-3.5 w-3.5 mr-1.5" />Compute</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick-view panels: Inspiration + Field Captures */}
      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1.5 font-medium"
          style={{ borderColor: `${GOLD}60`, color: GOLD }}
          onClick={() => setInspirationDrawerOpen(true)}
        >
          <Sparkles className="h-3.5 w-3.5" />
          View Inspiration
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1.5 font-medium"
          style={{ borderColor: `${GOLD}60`, color: GOLD }}
          onClick={() => setFieldCaptureDrawerOpen(true)}
        >
          <Camera className="h-3.5 w-3.5" />
          View Field Captures
        </Button>
      </div>

      <Tabs defaultValue="milestones">
        <TabsList className="bg-card border border-border flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="milestones">Milestones</TabsTrigger>
          <TabsTrigger value="tasks" className="flex items-center gap-1.5">
            <ListTodo className="h-3.5 w-3.5" />Tasks
            {(() => {
              const openCount = allTasks.filter(t => t.status !== "completed").length;
              const totalCount = allTasks.length;
              if (totalCount === 0) return null;
              return (
                <span
                  className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold"
                  style={openCount > 0
                    ? { background: GOLD, color: "#1A1B17" }
                    : { background: `${GOLD}25`, color: GOLD }
                  }
                  title={openCount > 0
                    ? `${openCount} open task${openCount !== 1 ? "s" : ""} · ${totalCount} total`
                    : `All ${totalCount} task${totalCount !== 1 ? "s" : ""} complete`
                  }
                >
                  {openCount > 0 ? openCount : `✓${totalCount}`}
                </span>
              );
            })()}
          </TabsTrigger>
          <TabsTrigger value="messages" className="flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />Messages
            {feed.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-medium" style={{ background: "#5B9BD530", color: "#5B9BD5" }}>{feed.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="inspiration" className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />Inspiration
            {(inspirationPhotos ?? []).length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-medium" style={{ background: `${GOLD}30`, color: GOLD }}>{inspirationPhotos?.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="docs" className="flex items-center gap-1.5">
            <FolderOpen className="h-3.5 w-3.5" />Docs & Media
            {(projectDocs ?? []).length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-medium" style={{ background: `${GOLD}30`, color: GOLD }}>{(projectDocs ?? []).length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="rfi" className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            RFI
          </TabsTrigger>
          <TabsTrigger value="change-orders" className="flex items-center gap-1.5">
            <GitBranch className="h-3.5 w-3.5" />
            Change Orders
          </TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5" />Payments
            {(projectInvoices ?? []).length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-medium" style={{ background: `${GOLD}30`, color: GOLD }}>{projectInvoices?.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="trade-partners" className="flex items-center gap-1.5">
            <Users2 className="h-3.5 w-3.5" />Trade Partners
          </TabsTrigger>
          <TabsTrigger value="site-meetings" className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />Site Meetings
          </TabsTrigger>
        </TabsList>

        {/* ── MILESTONES TAB ─────────────────────────────────────────────────────── */}
        <TabsContent value="milestones" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" className="btn-gold text-xs" onClick={() => setShowAddMilestone(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Milestone
            </Button>
          </div>
          {(!milestones || milestones.length === 0) ? (
            <Card className="bg-card border-border">
              <CardContent className="py-8 text-center text-muted-foreground text-sm">No milestones yet. Add one to track progress.</CardContent>
            </Card>
          ) : (
            milestones.map(m => (
              <Card key={m.id} className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <button
                        className="mt-0.5 shrink-0"
                        onClick={() => updateMilestone.mutate({ id: m.id, status: m.status === "completed" ? "pending" : "completed", completedAt: m.status !== "completed" ? new Date().toISOString() : undefined })}
                      >
                        {m.status === "completed" ? (
                          <CheckCircle className="h-5 w-5" style={{ color: "#4CAF7D" }} />
                        ) : m.status === "delayed" ? (
                          <AlertCircle className="h-5 w-5" style={{ color: "#E05252" }} />
                        ) : (
                          <Clock className="h-5 w-5 text-muted-foreground" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium text-sm ${m.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}>{m.title}</p>
                        {m.description && <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>}
                        <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                          {m.dueDate && <span>Due: {format(new Date(m.dueDate), "MMM d, yyyy")}</span>}
                          {m.billingAmount && <span style={{ color: GOLD }}>${Number(m.billingAmount).toLocaleString()}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <StatusBadge status={m.status} />
                      {m.billingAmount && Number(m.billingAmount) > 0 && m.status !== "completed" && (
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1 px-2"
                          style={{ background: `${GOLD}20`, color: GOLD, border: `1px solid ${GOLD}40` }}
                          onClick={() => setMilestoneInvoiceDialog({ open: true, milestoneId: m.id, milestoneTitle: m.title, billingAmount: m.billingAmount ?? "0", milestoneStatus: m.status, bypassGate: false })}
                        >
                          <DollarSign className="h-3 w-3" />
                          Ready to Bill
                        </Button>
                      )}
                      {m.status === "completed" && m.billingAmount && Number(m.billingAmount) > 0 && (
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1 px-2"
                          style={{ background: `${GOLD}20`, color: GOLD, border: `1px solid ${GOLD}40` }}
                          onClick={() => setMilestoneInvoiceDialog({ open: true, milestoneId: m.id, milestoneTitle: m.title, billingAmount: m.billingAmount ?? "0", milestoneStatus: m.status, bypassGate: false })}
                        >
                          <DollarSign className="h-3 w-3" />
                          Generate Invoice
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── TASKS TAB ──────────────────────────────────────────────────────────── */}
        <TabsContent value="tasks" className="mt-4 space-y-3">
          {/* Stats row */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              {(["all","pending","in_progress","completed","blocked"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setTaskFilter(f)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${taskFilter === f ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  style={taskFilter === f ? { background: `${GOLD}30`, color: GOLD, border: `1px solid ${GOLD}50` } : { background: "transparent", border: "1px solid transparent" }}
                >
                  {f === "all" ? `All (${allTasks.length})` :
                   f === "pending" ? `Pending (${taskCounts.pending})` :
                   f === "in_progress" ? `In Progress (${taskCounts.in_progress})` :
                   f === "completed" ? `Done (${taskCounts.completed})` :
                   `Blocked (${taskCounts.blocked})`}
                </button>
              ))}
            </div>
            <Button size="sm" className="btn-gold text-xs" onClick={() => {
              resetTaskForm();
              // Auto-populate the project client as the first assignee
              if (project?.clientId && projectClient?.name) {
                setTaskForm(f => ({
                  ...f,
                  assignees: [{
                    assigneeType: "lead",
                    assigneeId: project.clientId ?? undefined,
                    name: projectClient.name ?? "Client",
                    email: projectClient.email ?? undefined,
                    phone: projectClient.phone ?? undefined,
                  }],
                }));
              }
              setShowAddTask(true);
            }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Task
            </Button>
          </div>
          {/* Secondary filter row: category + assignee */}
          {(allTaskCategories.length > 0 || allTaskAssigneeNames.length > 0) && (
            <div className="flex items-center gap-2 flex-wrap">
              {allTaskCategories.length > 0 && (
                <Select value={taskCategoryFilter} onValueChange={setTaskCategoryFilter}>
                  <SelectTrigger className="h-7 text-xs w-[160px] bg-background border-border/60">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {allTaskCategories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {allTaskAssigneeNames.length > 0 && (
                <Select value={taskAssigneeFilter} onValueChange={setTaskAssigneeFilter}>
                  <SelectTrigger className="h-7 text-xs w-[160px] bg-background border-border/60">
                    <SelectValue placeholder="All Assignees" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Assignees</SelectItem>
                    {allTaskAssigneeNames.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {(taskCategoryFilter !== "all" || taskAssigneeFilter !== "all") && (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                  onClick={() => { setTaskCategoryFilter("all"); setTaskAssigneeFilter("all"); }}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {filteredTasks.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="py-10 text-center">
                <ListTodo className="h-8 w-8 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-sm font-medium text-muted-foreground">
                  {allTasks.length === 0 ? "No tasks yet" : "No tasks match this filter"}
                </p>
                {allTasks.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">Tasks are auto-created from proposal line items when a proposal is sent, or add them manually.</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredTasks.map(task => {
                const isOpenQuestion = (task.category ?? "").toLowerCase().includes("question") && task.status !== "completed";
                return (
                <Card key={task.id} className={`border transition-colors ${task.status === "completed" ? "opacity-70" : ""}`}
                  style={isOpenQuestion ? { background: "rgba(191,154,59,0.07)", borderColor: "rgba(191,154,59,0.45)", boxShadow: "0 0 0 1px rgba(191,154,59,0.2)" } : { background: "var(--card)", borderColor: "var(--border)" }}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      {/* Status icon / cycle button */}
                      <button
                        className="mt-0.5 shrink-0"
                        title="Click to cycle status"
                        onClick={() => updateTask.mutate({ id: task.id, status: cycleTaskStatus(task.status ?? "pending") })}
                      >
                        <TaskStatusIcon status={task.status ?? "pending"} />
                      </button>

                      {/* Main content */}
                      <div className="flex-1 min-w-0">
                        {/* Title row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`text-sm font-medium ${task.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                            {task.title}
                          </p>
                          {task.category && (
                            <span className="px-1.5 py-0.5 rounded text-xs" style={{ background: `${GOLD}20`, color: GOLD }}>{task.category}</span>
                          )}
                          {isOpenQuestion && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: "rgba(191,154,59,0.18)", color: "#BF9A3B", border: "1px solid rgba(191,154,59,0.4)" }}>
                              <AlertCircle className="h-3 w-3" /> Awaiting Reply
                            </span>
                          )}
                          {task.status === "completed" && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs" style={{ background: "#4CAF7D20", color: "#4CAF7D" }}>
                              <CheckCircle className="h-3 w-3" /> Done
                            </span>
                          )}
                        </div>

                        {/* Description */}
                        {task.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
                        )}

                        {/* Attachment badge */}
                        {(task as any).attachmentUrl && (
                          <a
                            href={(task as any).attachmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 mt-1.5 text-xs px-2 py-0.5 rounded"
                            style={{ background: "rgba(191,154,59,0.12)", color: GOLD, border: "1px solid rgba(191,154,59,0.3)" }}
                          >
                            {((task as any).attachmentName ?? "").match(/\.(jpg|jpeg|png|gif|webp|heic)$/i)
                              ? <Image className="h-3 w-3" />
                              : <FileText className="h-3 w-3" />}
                            {(task as any).attachmentName ?? "Attachment"}
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}

                        {/* Meta row: due date, completed date, notes */}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                          {task.dueDate && task.status !== "completed" && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Due {format(new Date(task.dueDate), "MMM d, yyyy")}
                            </span>
                          )}
                          {task.completedAt && (
                            <span className="flex items-center gap-1" style={{ color: "#4CAF7D" }}>
                              <CheckCircle className="h-3 w-3" />
                              Completed {format(new Date(task.completedAt), "MMM d")}
                            </span>
                          )}
                          {task.notes && <span className="truncate max-w-[200px]">{task.notes}</span>}
                        </div>

                        {/* Assignees chips */}
                        {(task as any).assignees && (task as any).assignees.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {(task as any).assignees.map((a: any, i: number) => (
                              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted/60 text-muted-foreground border border-border/40">
                                <span>{a.name}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Right controls */}
                      <div className="shrink-0 flex flex-col items-end gap-2">
                        {/* Status select */}
                        <Select
                          value={task.status ?? "pending"}
                          onValueChange={(v) => updateTask.mutate({ id: task.id, status: v as any })}
                        >
                          <SelectTrigger className="h-7 text-xs w-[110px] bg-background border-border">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="blocked">Blocked</SelectItem>
                          </SelectContent>
                        </Select>

                        {/* Complete + Notify button (only for non-completed tasks with assignees) */}
                        {task.status !== "completed" && (
                          <Button
                            size="sm"
                            className="h-7 text-xs gap-1 px-2"
                            style={{ background: "#4CAF7D20", color: "#4CAF7D", border: "1px solid #4CAF7D40" }}
                            disabled={completeTask.isPending}
                            onClick={() => completeTask.mutate({ id: task.id })}
                            title="Mark complete and notify all assignees"
                          >
                            {completeTask.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <CheckCircle className="h-3 w-3" />
                            )}
                            Complete
                          </Button>
                        )}
                        {/* Log Reply button for question tasks */}
                        {isOpenQuestion && (
                          <Button
                            size="sm"
                            className="h-7 text-xs gap-1 px-2"
                            style={{ background: "rgba(191,154,59,0.15)", color: "#BF9A3B", border: "1px solid rgba(191,154,59,0.35)" }}
                            onClick={() => {
                              setExpandedReplyTaskId(task.id);
                              setLogReplyForm({ show: true, taskId: task.id, taskTitle: task.title, repliedBy: "", replyText: "" });
                            }}
                          >
                            <MessageSquare className="h-3 w-3" /> Log Reply
                          </Button>
                        )}
                        {/* Edit task button */}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs gap-1 px-2 text-muted-foreground hover:text-foreground"
                          onClick={() => openEditTask(task)}
                          title="Edit task"
                        >
                          <Edit2 className="h-3 w-3" />
                          Edit
                        </Button>
                        {/* View history toggle — available for ALL tasks */}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs gap-1 px-2 text-muted-foreground"
                          onClick={() => setExpandedReplyTaskId(expandedReplyTaskId === task.id ? null : task.id)}
                        >
                          <ChevronDown className={`h-3 w-3 transition-transform ${expandedReplyTaskId === task.id ? "rotate-180" : ""}`} />
                          History
                        </Button>
                      </div>
                    </div>

                    {/* ── Expandable Reply Panel ─────────────────────────────── */}
                    {expandedReplyTaskId === task.id && (
                      <div className="mt-3 pt-3 border-t" style={{ borderColor: "rgba(191,154,59,0.25)" }}>
                        {/* Reply list */}
                        {taskReplies && taskReplies.length > 0 ? (
                          <div className="space-y-2 mb-3">
                            {taskReplies.map((reply: any) => (
                              <div key={reply.id} className="flex gap-2.5 items-start">
                                <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
                                  style={{ background: "rgba(191,154,59,0.2)", color: "#BF9A3B" }}>
                                  {(reply.repliedBy ?? "?")[0].toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-semibold text-foreground">{reply.repliedBy ?? "Unknown"}</span>
                                    {reply.replyChannel && (
                                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(91,155,213,0.15)", color: "#5B9BD5" }}>
                                        {reply.replyChannel}
                                      </span>
                                    )}
                                    <span className="text-xs text-muted-foreground ml-auto">
                                      {reply.createdAt ? format(new Date(reply.createdAt), "MMM d, h:mm a") : ""}
                                    </span>
                                  </div>
                                  <p className="text-xs text-foreground/80 mt-0.5 whitespace-pre-wrap">{reply.replyText}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground mb-3 italic">No replies logged yet.</p>
                        )}

                        {/* Log Reply inline form */}
                        {logReplyForm.show && logReplyForm.taskId === task.id ? (
                          <div className="p-3 rounded-lg space-y-2" style={{ background: "rgba(191,154,59,0.06)", border: "1px solid rgba(191,154,59,0.2)" }}>
                            <p className="text-xs font-medium" style={{ color: "#BF9A3B" }}>Log a Reply</p>
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                className="bg-background border-border text-xs h-8"
                                placeholder="Replied by (name)"
                                value={logReplyForm.repliedBy}
                                onChange={e => setLogReplyForm(f => ({ ...f, repliedBy: e.target.value }))}
                              />
                              <Select
                                value={(logReplyForm as any).channel ?? ""}
                                onValueChange={v => setLogReplyForm(f => ({ ...f, channel: v } as any))}
                              >
                                <SelectTrigger className="h-8 text-xs bg-background border-border">
                                  <SelectValue placeholder="Channel" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="email">Email</SelectItem>
                                  <SelectItem value="sms">SMS</SelectItem>
                                  <SelectItem value="phone">Phone call</SelectItem>
                                  <SelectItem value="in_person">In person</SelectItem>
                                  <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <Textarea
                              className="bg-background border-border resize-none text-xs"
                              rows={3}
                              placeholder="What did they say?"
                              value={logReplyForm.replyText}
                              onChange={e => setLogReplyForm(f => ({ ...f, replyText: e.target.value }))}
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="btn-gold text-xs h-7"
                                disabled={addTaskReply.isPending || !logReplyForm.replyText.trim()}
                                onClick={() => addTaskReply.mutate({
                                  taskId: task.id,
                                  projectId: id,
                                  repliedBy: logReplyForm.repliedBy || "Unknown",
                                  replyChannel: (logReplyForm as any).channel ?? "other",
                                  replyText: logReplyForm.replyText.trim(),
                                })}
                              >
                                {addTaskReply.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                                Save Reply
                              </Button>
                              <Button
                                variant="ghost" size="sm" className="text-xs h-7"
                                onClick={() => setLogReplyForm({ show: false, taskId: 0, taskTitle: "", repliedBy: "", replyText: "" })}
                              >Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            className="h-7 text-xs gap-1 px-2"
                            style={{ background: "rgba(191,154,59,0.12)", color: "#BF9A3B", border: "1px solid rgba(191,154,59,0.3)" }}
                            onClick={() => setLogReplyForm({ show: true, taskId: task.id, taskTitle: task.title, repliedBy: "", replyText: "" })}
                          >
                            <MessageSquare className="h-3 w-3" /> Log a Reply
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── AI PROJECT SUMMARY ─────────────────────────────────────────────────── */}
        <div className="mt-6">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">AI Project Summary</span>
                  {projectSummary?.updatedAt && (
                    <span className="text-xs text-muted-foreground">
                      · updated {format(new Date(projectSummary.updatedAt), "MMM d, h:mm a")}
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  className="btn-gold text-xs gap-1.5"
                  disabled={generateSummary.isPending}
                  onClick={() => generateSummary.mutate({ projectId: id })}
                >
                  {generateSummary.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <span>✦</span>
                  )}
                  {generateSummary.isPending ? "Generating…" : "Generate Summary"}
                </Button>
              </div>
              {projectSummary?.summary ? (
                <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {projectSummary.summary}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/60 italic">
                  No summary yet — click Generate Summary to have AI analyse the project tasks, milestones, and timeline.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── MESSAGES TAB ───────────────────────────────────────────────────────── */}
        <TabsContent value="messages" className="mt-4 space-y-3">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">{feed.length} communication{feed.length !== 1 ? "s" : ""} · all channels</p>
            <Button
              variant="outline"
              size="sm"
              className="text-xs border-border/60 gap-1.5"
              disabled={pollGmail.isPending}
              onClick={() => pollGmail.mutate({ projectId: id })}
            >
              {pollGmail.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Sync Gmail
            </Button>
          </div>

          {/* Message feed */}
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              {feed.length === 0 ? (
                <div className="py-12 text-center">
                  <MessageSquare className="h-8 w-8 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-sm font-medium text-muted-foreground">No messages yet</p>
                  <p className="text-xs text-muted-foreground mt-1">SMS, emails, portal uploads, and Gmail will appear here.</p>
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {feed.map(item => {
                    if (item.type === "document") {
                      const doc = item.data;
                      return (
                        <div key={`doc-${item.id}`} className="px-4 py-3 flex items-start gap-3">
                          <div className="mt-0.5 p-1.5 rounded-lg shrink-0" style={{ background: `${GOLD}20` }}>
                            <Upload className="h-3.5 w-3.5" style={{ color: GOLD }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium text-foreground">Client Upload</span>
                              <span className="px-1.5 py-0.5 rounded text-xs" style={{ background: `${GOLD}20`, color: GOLD }}>portal</span>
                              {doc.roomTag && <span className="text-xs text-muted-foreground">{doc.roomTag}</span>}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{doc.fileName}</p>
                            {doc.description && <p className="text-xs text-muted-foreground/70 mt-0.5">{doc.description}</p>}
                            {doc.fileUrl && (
                              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs mt-1 hover:underline" style={{ color: GOLD }}>
                                <ExternalLink className="h-3 w-3" />View file
                              </a>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground/60 shrink-0">{format(item.ts, "MMM d, h:mm a")}</span>
                        </div>
                      );
                    }

                    const msg = item.data;
                    const isOutbound = msg.direction === "outbound";
                    const channelColors: Record<string, string> = {
                      sms: "#4CAF7D",
                      email: "#5B9BD5",
                      portal: GOLD,
                      internal: "#9B59B6",
                    };
                    const chColor = channelColors[msg.channel] ?? GOLD;

                    return (
                      <div key={`msg-${item.id}`} className={`px-4 py-3 flex items-start gap-3 ${isOutbound ? "flex-row-reverse" : ""}`}>
                        <div className="mt-0.5 p-1.5 rounded-lg shrink-0" style={{ background: `${chColor}20` }}>
                          <ChannelIcon channel={msg.channel} />
                        </div>
                        <div className={`flex-1 min-w-0 ${isOutbound ? "items-end" : "items-start"} flex flex-col`}>
                          <div className={`flex items-center gap-2 flex-wrap ${isOutbound ? "flex-row-reverse" : ""}`}>
                            <span className="text-xs font-medium text-foreground">
                              {isOutbound ? "Kitchens Plus" : (msg.fromName || "Client")}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={{ background: `${chColor}20`, color: chColor }}>
                              {msg.channel}
                            </span>
                            {msg.subject && <span className="text-xs text-muted-foreground truncate max-w-[200px]">{msg.subject}</span>}
                          </div>
                          <div className={`mt-1 px-3 py-2 rounded-xl text-sm max-w-[85%] ${isOutbound ? "rounded-tr-sm" : "rounded-tl-sm"}`}
                            style={{ background: isOutbound ? `${chColor}15` : "hsl(var(--accent)/0.3)" }}>
                            <p className="text-foreground whitespace-pre-wrap break-words">{msg.body}</p>
                            {msg.attachmentUrl && (
                              <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs mt-1.5 hover:underline" style={{ color: chColor }}>
                                <FileText className="h-3 w-3" />{msg.attachmentName || "Attachment"}
                              </a>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground/60 mt-1">{format(item.ts, "MMM d, h:mm a")}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Send to Client panel */}
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Send Message to Client</p>
                <Select value={quickMsgChannels} onValueChange={v => setQuickMsgChannels(v as "both"|"sms"|"email")}>
                  <SelectTrigger className="w-[130px] bg-background border-border text-xs h-7">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Email + SMS</SelectItem>
                    <SelectItem value="sms">SMS only</SelectItem>
                    <SelectItem value="email">Email only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {quickMsgChannels !== "sms" && (
                <Input
                  className="bg-background border-border text-xs h-8"
                  placeholder="Subject (optional — defaults to project name)"
                  value={quickMsgSubject}
                  onChange={e => setQuickMsgSubject(e.target.value)}
                />
              )}
              <div className="relative">
                <Textarea
                  className="bg-background border-border text-sm resize-none pr-12"
                  rows={3}
                  placeholder="Type your message or click the mic to dictate..."
                  value={quickMsgBody}
                  onChange={e => setQuickMsgBody(e.target.value)}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className={`absolute bottom-2 right-2 h-8 w-8 rounded-full transition-colors ${quickMsgRecording ? "bg-red-500/20 text-red-500 hover:bg-red-500/30" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => quickMsgRecording ? stopVoiceRecording() : startVoiceRecording()}
                  title={quickMsgRecording ? "Stop recording" : "Dictate message"}
                >
                  {quickMsgRecording ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-3.5 w-3.5" />}
                </Button>
              </div>
              {quickMsgRecording && (
                <p className="text-xs text-red-500 flex items-center gap-1.5 animate-pulse">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                  Recording… click the stop button when done
                </p>
              )}
              {transcribeVoice.isPending && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Transcribing audio…
                </p>
              )}
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground/60">Sends to all phone numbers and emails on file for this project's client.</p>
                <Button
                  size="sm"
                  className="btn-gold text-xs gap-1.5"
                  disabled={sendProjectMessage.isPending || !quickMsgBody.trim()}
                  onClick={() => {
                    sendProjectMessage.mutate({
                      projectId: id,
                      body: quickMsgBody.trim(),
                      subject: quickMsgSubject.trim() || undefined,
                      channels: quickMsgChannels,
                    });
                  }}
                >
                  {sendProjectMessage.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Send
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── INSPIRATION TAB ────────────────────────────────────────────────────── */}
        <TabsContent value="inspiration" className="mt-4">
          {(inspirationPhotos ?? []).length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="py-12 text-center">
                <Sparkles className="h-8 w-8 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-sm font-medium text-muted-foreground">No inspiration photos yet</p>
                <p className="text-xs text-muted-foreground mt-1">Client can upload photos from their portal under the Inspiration tab</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{inspirationPhotos?.length} photo{(inspirationPhotos?.length ?? 0) !== 1 ? "s" : ""} shared by client</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {(inspirationPhotos ?? []).map(photo => (
                  <div key={photo.id} className="relative group rounded-xl overflow-hidden border border-border/40 bg-card">
                    <img
                      src={photo.fileUrl}
                      alt={photo.fileName}
                      className="w-full h-40 object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                      onClick={() => setLightboxPhoto(photo.fileUrl)}
                    />
                    {photo.roomTag && (
                      <div className="absolute top-2 left-2">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: `${GOLD}CC`, color: "#1A1B17" }}>{photo.roomTag}</span>
                      </div>
                    )}
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a href={photo.fileUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-full bg-black/70 hover:bg-black/90">
                        <ExternalLink className="h-3.5 w-3.5 text-white" />
                      </a>
                      <button
                        className="p-1.5 rounded-full bg-black/70 hover:bg-red-900/80"
                        onClick={() => deleteInspirationPhoto.mutate({ id: photo.id })}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-white" />
                      </button>
                    </div>
                    <div className="px-2.5 py-2">
                      <p className="text-xs text-muted-foreground truncate">{photo.description || photo.fileName}</p>
                      {photo.createdAt && <p className="text-xs text-muted-foreground/60 mt-0.5">Uploaded {format(new Date(photo.createdAt), "MMM d")}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {lightboxPhoto && (
            <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setLightboxPhoto(null)}>
              <img src={lightboxPhoto} alt="Inspiration" className="max-w-full max-h-full object-contain rounded-lg" />
            </div>
          )}
        </TabsContent>

        {/* ── PAYMENTS TAB ───────────────────────────────────────────────────────── */}
        <TabsContent value="payments" className="mt-4 space-y-3">
          {(!projectInvoices || projectInvoices.length === 0) ? (
            <Card className="bg-card border-border">
              <CardContent className="py-8 text-center text-muted-foreground text-sm">No invoices for this project yet.</CardContent>
            </Card>
          ) : (
            projectInvoices.map(inv => {
              const balance = Math.max(0, Number(inv.amount) - Number(inv.amountPaid ?? 0));
              const isExpanded = expandedInvoiceId === inv.id;
              const isPaid = inv.status === "paid";
              const statusColor = isPaid ? "#4CAF7D" : inv.status === "overdue" ? "#E05252" : GOLD;
              return (
                <Card key={inv.id} className="bg-card border-border">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-foreground">{inv.invoiceNumber}</span>
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: `${statusColor}20`, color: statusColor, border: `1px solid ${statusColor}40` }}>
                            {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                          </span>
                          <span className="text-xs text-muted-foreground capitalize">{inv.invoiceType.replace(/_/g, " ")}</span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                          <span style={{ color: GOLD }}>Total: ${Number(inv.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                          <span style={{ color: "#4CAF7D" }}>Paid: ${Number(inv.amountPaid ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                          {!isPaid && <span style={{ color: "#E8A838" }}>Balance: ${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>}
                          {inv.sentAt && <span>Sent: {format(new Date(inv.sentAt), "MMM d, yyyy")}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!isPaid && (
                          <Button size="sm" className="btn-gold text-xs h-7 px-3"
                            onClick={() => { setShowRecordPayment(inv.id); setPaymentForm({ amount: String(balance), method: "check", note: "" }); }}>
                            Record Payment
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => setExpandedInvoiceId(isExpanded ? null : inv.id)}>
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-border/40">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Payment History</p>
                        {!expandedPayments || expandedPayments.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No payments recorded yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {expandedPayments.map((pmt: any) => (
                              <div key={pmt.id} className="flex items-center justify-between text-xs bg-background/50 rounded-lg px-3 py-2">
                                <div className="flex items-center gap-3">
                                  <span className="font-medium" style={{ color: "#4CAF7D" }}>${Number(pmt.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                                  <span className="capitalize text-muted-foreground">{pmt.method}</span>
                                  {pmt.note && <span className="text-muted-foreground truncate max-w-[160px]">{pmt.note}</span>}
                                </div>
                                <span className="text-muted-foreground">{format(new Date(pmt.paidAt), "MMM d, yyyy")}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}

          {/* PO section */}
          {(projectPOs ?? []).length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Purchase Orders</h3>
              <div className="space-y-2">
                {(projectPOs ?? []).map((po: any) => (
                  <Card key={po.id} className="bg-card border-border">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">{po.poNumber} — {po.title}</p>
                          <p className="text-xs text-muted-foreground capitalize mt-0.5">{(po.status ?? "").replace(/_/g, " ")} · {po.vendorName ?? "No vendor"}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold" style={{ color: GOLD }}>${Number(po.totalAmount ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
                          <p className="text-xs text-muted-foreground">committed</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Financial summary */}
          {((projectInvoices ?? []).length > 0 || (projectPOs ?? []).length > 0 || (coSummary?.count ?? 0) > 0) && (() => {
            const totalInvoiced = (projectInvoices ?? []).reduce((s, i) => s + Number(i.amount), 0);
            const totalPaid = (projectInvoices ?? []).reduce((s, i) => s + Number(i.amountPaid ?? 0), 0);
            const totalBalance = Math.max(0, totalInvoiced - totalPaid);
            const totalCommitted = (projectPOs ?? []).reduce((s: number, po: any) => s + Number(po.totalAmount ?? 0), 0);
            const approvedCOTotal = coSummary?.total ?? 0;
            const revisedTotal = totalInvoiced + approvedCOTotal;
            const netMargin = totalPaid - totalCommitted;
            return (
              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Financial Summary</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total Invoiced</span>
                    <span style={{ color: GOLD }} className="font-semibold">${totalInvoiced.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-2">
                    <span className="text-muted-foreground">Total Collected</span>
                    <span style={{ color: "#4CAF7D" }} className="font-semibold">${totalPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-2">
                    <span className="text-muted-foreground">Outstanding Balance</span>
                    <span style={{ color: totalBalance > 0 ? "#E8A838" : "#4CAF7D" }} className="font-semibold">${totalBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  </div>
                  {approvedCOTotal !== 0 && (
                    <>
                      <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-border/40">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <GitBranch className="h-3.5 w-3.5" />
                          Approved Change Orders ({coSummary?.count ?? 0})
                        </span>
                        <span style={{ color: approvedCOTotal >= 0 ? GOLD : "#4CAF7D" }} className="font-semibold">
                          {approvedCOTotal >= 0 ? "+" : "-"}${Math.abs(approvedCOTotal).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t-2 border-border/60">
                        <span className="font-semibold" style={{ color: "var(--kp-cream, #F5EDE7)" }}>Revised Contract Total</span>
                        <span style={{ color: GOLD }} className="font-bold text-base">${revisedTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                      </div>
                    </>
                  )}
                  {totalCommitted > 0 && (
                    <>
                      <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-border/40">
                        <span className="text-muted-foreground">Committed (POs)</span>
                        <span style={{ color: "#E05252" }} className="font-semibold">${totalCommitted.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-border/40">
                        <span className="text-muted-foreground font-medium">Net Margin (Collected − POs)</span>
                        <span style={{ color: netMargin >= 0 ? "#4CAF7D" : "#E05252" }} className="font-bold">${netMargin.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })()}
        </TabsContent>

        {/* ── DOCS & MEDIA TAB ───────────────────────────────────────────────────────────── */}
        <TabsContent value="docs" className="mt-4 space-y-5">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {(projectDocs ?? []).length} document{(projectDocs ?? []).length !== 1 ? "s" : ""}
              {(inspirationPhotos ?? []).length > 0 && ` · ${inspirationPhotos?.length} inspiration photo${(inspirationPhotos?.length ?? 0) !== 1 ? "s" : ""}`}
              {(designNotes ?? []).length > 0 && ` · ${designNotes?.length} design note${(designNotes?.length ?? 0) !== 1 ? "s" : ""}`}
            </p>
            <Button size="sm" className="btn-gold text-xs" onClick={() => setShowUploadDoc(true)}>
              <Upload className="h-3.5 w-3.5 mr-1" /> Upload Document
            </Button>
          </div>

          {/* Project Documents */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />Project Documents
            </h3>
            {(projectDocs ?? []).length === 0 ? (
              <Card className="bg-card border-border">
                <CardContent className="py-8 text-center">
                  <FolderOpen className="h-7 w-7 mx-auto mb-2 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No documents uploaded yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Upload contracts, permits, drawings, photos, and more</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {(projectDocs ?? []).filter((d: any) => d.docType !== "inspiration").map((doc: any) => {
                  const isImg = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(doc.fileName ?? "") || (doc.mimeType ?? "").startsWith("image/");
                  const docTypeColors: Record<string, string> = {
                    contract: "#4CAF7D", permit: "#5B9BD5", photo: GOLD, drawing: "#9B59B6",
                    estimate: "#E8A838", invoice: "#E05252", warranty: "#4CAF7D", other: "#8A8B82",
                  };
                  const dtColor = docTypeColors[doc.docType] ?? GOLD;
                  return (
                    <Card key={doc.id} className="bg-card border-border hover:border-border/70 transition-colors">
                      <CardContent className="p-3">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg shrink-0" style={{ background: `${dtColor}18` }}>
                            {isImg ? <Image className="h-4 w-4" style={{ color: dtColor }} /> : <FileText className="h-4 w-4" style={{ color: dtColor }} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium text-foreground truncate max-w-[200px]">{doc.fileName}</p>
                              <span className="px-1.5 py-0.5 rounded text-xs capitalize" style={{ background: `${dtColor}20`, color: dtColor }}>{doc.docType}</span>
                              {doc.uploadedByClient && <span className="text-xs text-muted-foreground">(client upload)</span>}
                            </div>
                            {doc.description && <p className="text-xs text-muted-foreground mt-0.5">{doc.description}</p>}
                            <p className="text-xs text-muted-foreground/60 mt-0.5">{format(new Date(doc.createdAt), "MMM d, yyyy")}</p>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                              className="p-1.5 rounded hover:bg-accent/40 transition-colors" title="Open file">
                              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                            </a>
                            <button
                              className="p-1.5 rounded hover:bg-red-900/30 transition-colors"
                              onClick={() => deletDocMutation.mutate({ id: doc.id })}
                              title="Delete document"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-400" />
                            </button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Inspiration Photos (client-uploaded) */}
          {(inspirationPhotos ?? []).length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />Client Inspiration Photos
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(inspirationPhotos ?? []).map(photo => (
                  <div key={photo.id} className="relative group rounded-xl overflow-hidden border border-border/40 bg-card">
                    <img
                      src={photo.fileUrl}
                      alt={photo.fileName}
                      className="w-full h-32 object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                      onClick={() => setLightboxPhoto(photo.fileUrl)}
                    />
                    {photo.roomTag && (
                      <div className="absolute top-1.5 left-1.5">
                        <span className="px-1.5 py-0.5 rounded-full text-xs font-medium" style={{ background: `${GOLD}CC`, color: "#1A1B17" }}>{photo.roomTag}</span>
                      </div>
                    )}
                    <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a href={photo.fileUrl} target="_blank" rel="noopener noreferrer" className="p-1 rounded-full bg-black/70 hover:bg-black/90">
                        <ExternalLink className="h-3 w-3 text-white" />
                      </a>
                      <button className="p-1 rounded-full bg-black/70 hover:bg-red-900/80" onClick={() => deleteInspirationPhoto.mutate({ id: photo.id })}>
                        <Trash2 className="h-3 w-3 text-white" />
                      </button>
                    </div>
                    <div className="px-2 py-1.5">
                      <p className="text-xs text-muted-foreground truncate">{photo.description || photo.fileName}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Design Idea Notes (client-written) */}
          {(designNotes ?? []).length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                <StickyNote className="h-3.5 w-3.5" />Client Design Notes
              </h3>
              <div className="space-y-2">
                {(designNotes ?? []).map((note: any) => (
                  <Card key={note.id} className="bg-card border-border">
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <div className="p-1.5 rounded-lg shrink-0" style={{ background: `${GOLD}18` }}>
                          <StickyNote className="h-3.5 w-3.5" style={{ color: GOLD }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-1.5 py-0.5 rounded-full text-xs font-medium" style={{ background: `${GOLD}25`, color: GOLD }}>{note.room}</span>
                            <span className="text-xs text-muted-foreground/60">{format(new Date(note.updatedAt), "MMM d, yyyy")}</span>
                          </div>
                          <p className="text-sm text-foreground whitespace-pre-wrap">{note.note}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Empty state when nothing at all */}
          {(projectDocs ?? []).length === 0 && (inspirationPhotos ?? []).length === 0 && (designNotes ?? []).length === 0 && (
            <Card className="bg-card border-border">
              <CardContent className="py-12 text-center">
                <FolderOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground/20" />
                <p className="text-sm font-medium text-muted-foreground">No documents or media yet</p>
                <p className="text-xs text-muted-foreground mt-1">Upload contracts, permits, photos, and drawings. Client inspiration photos and design notes will also appear here.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── DETAILS TAB ──────────────────────────────────────────────────────────────────── */}
        <TabsContent value="rfi" className="mt-4">
          <RFISection
            projectId={id}
            projectName={project?.name ?? ""}
            clientName={projectClient?.name ?? undefined}
            clientEmail={projectClient?.email ?? undefined}
            clientPhone={projectClient?.phone ?? undefined}
          />
        </TabsContent>

        <TabsContent value="change-orders" className="mt-4">
          <ChangeOrdersSection projectId={id} />
        </TabsContent>

        <TabsContent value="details" className="mt-4">    <Card className="bg-card border-border">
            <CardContent className="p-5 space-y-4">
              {project.description && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Description</p>
                  <p className="text-sm text-foreground">{project.description}</p>
                </div>
              )}
              {project.scopeOfWork && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Scope of Work</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{project.scopeOfWork}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">AI Update Frequency</p>
                <p className="text-sm text-foreground">{(project.aiUpdateFrequency ?? "weekly").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TRADE PARTNERS TAB ───────────────────────────────────────────────── */}
        <TabsContent value="trade-partners" className="mt-4">
          <TradePartnersTab projectId={project.id} />
        </TabsContent>

        {/* ── SITE MEETINGS TAB ──────────────────────────────────────────────────── */}
        <TabsContent value="site-meetings" className="mt-4">
          <SiteMeetingsTab
            projectId={project.id}
            projectName={project.name}
            projectAddress={project.address}
          />
        </TabsContent>

      </Tabs>

      {/* ── DIALOGS ──────────────────────────────────────────────────────────────── */}

      {/* Record Payment Dialog */}
      <Dialog open={!!showRecordPayment} onOpenChange={open => { if (!open) { setShowRecordPayment(null); setPaymentForm({ amount: "", method: "check", note: "", checkNumber: "", paidDate: new Date().toISOString().slice(0, 10), sendReceipt: false, ccOperator: false }); } }}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader><DialogTitle className="font-serif">Record Payment</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Amount ($) *</Label>
              <Input className="bg-background border-border" type="number" step="0.01" min="0"
                value={paymentForm.amount} onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Payment Method</Label>
                <Select value={paymentForm.method} onValueChange={v => setPaymentForm(f => ({ ...f, method: v as any }))}>
                  <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="check">Check</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="square">Square / Card</SelectItem>
                    <SelectItem value="ach">ACH / Bank Transfer</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Date Received</Label>
                <Input className="bg-background border-border" type="date" value={paymentForm.paidDate}
                  onChange={e => setPaymentForm(f => ({ ...f, paidDate: e.target.value }))} />
              </div>
            </div>
            {paymentForm.method === "check" && (
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Check Number</Label>
                <Input className="bg-background border-border" value={paymentForm.checkNumber}
                  onChange={e => setPaymentForm(f => ({ ...f, checkNumber: e.target.value }))} placeholder="e.g. 1042" />
              </div>
            )}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Note (optional)</Label>
              <Input className="bg-background border-border" value={paymentForm.note}
                onChange={e => setPaymentForm(f => ({ ...f, note: e.target.value }))} placeholder="Internal note…" />
            </div>
            <div className="border border-border/50 rounded-lg p-3 space-y-2 bg-background/40">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium cursor-pointer" htmlFor="sendReceiptPD">Send receipt email to client</Label>
                <input id="sendReceiptPD" type="checkbox" className="h-4 w-4 accent-[#BF9A3B] cursor-pointer"
                  checked={paymentForm.sendReceipt} onChange={e => setPaymentForm(f => ({ ...f, sendReceipt: e.target.checked, ccOperator: e.target.checked ? f.ccOperator : false }))} />
              </div>
              {paymentForm.sendReceipt && (
                <div className="flex items-center justify-between pl-2 border-l-2 border-[#BF9A3B]/30">
                  <Label className="text-xs text-muted-foreground cursor-pointer" htmlFor="ccOperatorPD">CC me (chad@kitchensplusupstate.com)</Label>
                  <input id="ccOperatorPD" type="checkbox" className="h-4 w-4 accent-[#BF9A3B] cursor-pointer"
                    checked={paymentForm.ccOperator} onChange={e => setPaymentForm(f => ({ ...f, ccOperator: e.target.checked }))} />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRecordPayment(null)}>Cancel</Button>
            <Button className="btn-gold" disabled={recordPaymentMutation.isPending || !paymentForm.amount}
              onClick={() => {
                if (!showRecordPayment || !paymentForm.amount) return;
                recordPaymentMutation.mutate({
                  invoiceId: showRecordPayment,
                  amount: parseFloat(paymentForm.amount),
                  method: paymentForm.method,
                  note: paymentForm.note || undefined,
                  checkNumber: paymentForm.checkNumber || undefined,
                  paidDate: paymentForm.paidDate || undefined,
                  sendReceipt: paymentForm.sendReceipt,
                  ccOperator: paymentForm.ccOperator,
                });
              }}>
              {recordPaymentMutation.isPending ? "Saving..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Task Dialog */}
      <Dialog open={showAddTask} onOpenChange={(open) => {
        if (!open) { setShowAddTask(false); resetTaskForm(); }
        else {
          resetTaskForm();
          if (project?.clientId && projectClient?.name) {
            setTaskForm(f => ({
              ...f,
              assignees: [{
                assigneeType: "lead",
                assigneeId: project.clientId ?? undefined,
                name: projectClient.name ?? "Client",
                email: projectClient.email ?? undefined,
                phone: projectClient.phone ?? undefined,
              }],
            }));
          }
          setShowAddTask(true);
        }
      }}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg">Add Task</DialogTitle>
            <p className="text-xs text-muted-foreground">Tasks can be anything — questions, deliveries, subcontractor visits, in-house work. Assignees are notified by email and SMS.</p>
          </DialogHeader>
          <div className="space-y-4 py-2">

            {/* Title */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Task Title *</Label>
              <Input
                className="bg-background border-border h-10 text-sm"
                value={taskForm.title}
                onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Confirm cabinet color with client, Tile delivery from vendor, Install upper cabinets..."
              />
            </div>

            {/* Description */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Description / Details</Label>
              <Textarea
                className="bg-background border-border resize-none text-sm"
                rows={3}
                value={taskForm.description}
                onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Add any details, questions to ask, or instructions for the assignee..."
              />
            </div>

            {/* Assignees */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Assign To</Label>
              {/* Assignee chips */}
              {taskForm.assignees.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {taskForm.assignees.map((a, i) => (
                    <Badge key={i} variant="secondary" className="gap-1.5 pl-2 pr-1 py-1 text-xs">
                      <span>{a.name}</span>
                      <span className="text-muted-foreground capitalize">({a.assigneeType})</span>
                      <button onClick={() => removeAssignee(i)} className="ml-0.5 rounded-full hover:bg-destructive/20 p-0.5">
                        <span className="text-muted-foreground hover:text-destructive text-xs leading-none">✕</span>
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <Popover open={assigneePickerOpen} onOpenChange={setAssigneePickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="border-border/60 text-xs gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Add Assignee
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search owner, client, vendors, crew..." className="text-xs" />
                    <CommandList>
                      <CommandEmpty className="text-xs text-muted-foreground py-3 text-center">No matches. Use Custom below.</CommandEmpty>
                      {/* Owner (Me) */}
                      {ownerUser && (
                        <CommandGroup heading="Owner">
                          <CommandItem
                            value={`owner-${ownerUser.id}`}
                            onSelect={() => {
                              addAssigneeFromList({ assigneeType: "crew", assigneeId: ownerUser.id, name: ownerUser.name ?? "Chad Price", email: ownerUser.email ?? undefined, phone: (ownerUser as any).phone ?? undefined });
                              setAssigneePickerOpen(false);
                            }}
                          >
                            <span className="text-xs font-medium">{ownerUser.name ?? "Chad Price"}</span>
                            <span className="ml-auto text-xs text-muted-foreground">Owner</span>
                          </CommandItem>
                        </CommandGroup>
                      )}
                      {/* Client */}
                      {project?.clientId && projectClient && (
                        <CommandGroup heading="Client">
                          <CommandItem
                            value={`client-${project.clientId}`}
                            onSelect={() => {
                              addAssigneeFromList({ assigneeType: "lead", assigneeId: project.clientId ?? undefined, name: projectClient.name ?? "Client", email: projectClient.email ?? undefined, phone: projectClient.phone ?? undefined });
                              setAssigneePickerOpen(false);
                            }}
                          >
                            <span className="text-xs">{projectClient.name ?? "Client"}</span>
                            {projectClient.phone && <span className="ml-auto text-xs text-muted-foreground">{projectClient.phone}</span>}
                          </CommandItem>
                        </CommandGroup>
                      )}
                      {/* Vendors */}
                      {(vendorList ?? []).length > 0 && (
                        <CommandGroup heading="Vendors">
                          {(vendorList ?? []).map((v: any) => (
                            <CommandItem
                              key={v.id}
                              value={`vendor-${v.id}-${v.companyName}`}
                              onSelect={() => {
                                addAssigneeFromList({ assigneeType: "vendor", assigneeId: v.id, name: v.companyName, email: v.email ?? undefined, phone: v.phone ?? undefined });
                                setAssigneePickerOpen(false);
                              }}
                            >
                              <span className="text-xs">{v.companyName}</span>
                              {v.trade && <span className="ml-auto text-xs text-muted-foreground">{v.trade}</span>}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                      {/* Crew */}
                      {(crewList ?? []).length > 0 && (
                        <CommandGroup heading="Crew">
                          {(crewList ?? []).map((c: any) => (
                            <CommandItem
                              key={c.id}
                              value={`crew-${c.id}-${c.name}`}
                              onSelect={() => {
                                addAssigneeFromList({ assigneeType: "crew", assigneeId: c.id, name: c.name, email: c.email ?? undefined, phone: c.phone ?? undefined });
                                setAssigneePickerOpen(false);
                              }}
                            >
                              <span className="text-xs">{c.name}</span>
                              {c.role && <span className="ml-auto text-xs text-muted-foreground">{c.role}</span>}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                      {/* Previously used custom assignees for this project */}
                      {(customAssigneeRoster ?? []).length > 0 && (
                        <CommandGroup heading="Previously Used (This Project)">
                          {(customAssigneeRoster ?? []).map((ca: any) => (
                            <CommandItem
                              key={ca.id}
                              value={`custom-roster-${ca.id}-${ca.name}`}
                              onSelect={() => {
                                addAssigneeFromList({ assigneeType: "custom", name: ca.name, email: ca.email ?? undefined, phone: ca.phone ?? undefined });
                                setAssigneePickerOpen(false);
                              }}
                            >
                              <span className="text-xs font-medium">{ca.name}</span>
                              {ca.phone && <span className="ml-auto text-xs text-muted-foreground">{ca.phone}</span>}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                      {/* Custom */}
                      <CommandGroup heading="Other">
                        <CommandItem
                          value="custom-new-person"
                          onSelect={() => { setCustomAssigneeForm(f => ({ ...f, show: true })); setAssigneePickerOpen(false); }}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1.5" />
                          <span className="text-xs">Add someone not in the system...</span>
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Custom assignee inline form */}
              {customAssigneeForm.show && (
                <div className="mt-3 p-3 rounded-lg border border-border/60 bg-background/50 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Add custom assignee</p>
                  <Input className="bg-background border-border text-xs h-8" placeholder="Full name *" value={customAssigneeForm.name} onChange={e => setCustomAssigneeForm(f => ({ ...f, name: e.target.value }))} />
                  <Input className="bg-background border-border text-xs h-8" placeholder="Email (optional)" value={customAssigneeForm.email} onChange={e => setCustomAssigneeForm(f => ({ ...f, email: e.target.value }))} />
                  <Input className="bg-background border-border text-xs h-8" placeholder="Phone (optional, e.g. +18645551234)" value={customAssigneeForm.phone} onChange={e => setCustomAssigneeForm(f => ({ ...f, phone: e.target.value }))} />
                  <div className="flex gap-2">
                    <Button size="sm" className="btn-gold text-xs h-7" onClick={() => {
                      if (!customAssigneeForm.name.trim()) { toast.error("Name required"); return; }
                      addAssigneeFromList({ assigneeType: "custom", name: customAssigneeForm.name.trim(), email: customAssigneeForm.email || undefined, phone: customAssigneeForm.phone || undefined });
                      setCustomAssigneeForm({ show: false, name: "", email: "", phone: "" });
                    }}>Add</Button>
                    <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setCustomAssigneeForm({ show: false, name: "", email: "", phone: "" })}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>

            {/* Category */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Category</Label>
              <Popover open={categoryPickerOpen} onOpenChange={setCategoryPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between border-border/60 text-sm h-10 font-normal">
                    {taskForm.category || <span className="text-muted-foreground">Select a category...</span>}
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search or type new category..." value={newCategoryInput} onValueChange={setNewCategoryInput} className="text-xs" />
                    <CommandList>
                      <CommandEmpty className="text-xs text-muted-foreground py-2 text-center">No category found.</CommandEmpty>
                      <CommandGroup>
                        {(taskCategories ?? []).map((cat: any) => (
                          <CommandItem
                            key={cat.id}
                            value={cat.name}
                            onSelect={() => { setTaskForm(f => ({ ...f, category: cat.name })); setCategoryPickerOpen(false); setNewCategoryInput(""); }}
                          >
                            <Checkbox checked={taskForm.category === cat.name} className="mr-2 h-3.5 w-3.5" />
                            <span className="text-xs">{cat.name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      {newCategoryInput.trim() && !(taskCategories ?? []).some((c: any) => c.name.toLowerCase() === newCategoryInput.trim().toLowerCase()) && (
                        <CommandGroup heading="Create new">
                          <CommandItem
                            value={`create-${newCategoryInput}`}
                            onSelect={() => {
                              const name = newCategoryInput.trim();
                              addCategory.mutate({ name, projectId: id });
                              setTaskForm(f => ({ ...f, category: name }));
                              setCategoryPickerOpen(false);
                              setNewCategoryInput("");
                            }}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1.5" />
                            <span className="text-xs">Create "{newCategoryInput.trim()}"</span>
                          </CommandItem>
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Due Date */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Due Date (optional)</Label>
              <Input
                className="bg-background border-border h-10 text-sm"
                type="date"
                value={taskForm.dueDate}
                onChange={e => setTaskForm(f => ({ ...f, dueDate: e.target.value }))}
              />
            </div>

            {/* Attachment */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Attachment (photo or PDF, optional)</Label>
              <input
                ref={taskAttachInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleTaskAttachFile(f); e.target.value = ""; }}
              />
              {taskForm.attachmentUrl ? (
                <div className="flex items-center gap-2 p-2 rounded-lg border" style={{ borderColor: "rgba(191,154,59,0.3)", background: "rgba(191,154,59,0.06)" }}>
                  {taskForm.attachmentName.match(/\.(jpg|jpeg|png|gif|webp|heic)$/i) ? (
                    <Image className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
                  )}
                  <span className="text-xs flex-1 truncate text-foreground">{taskForm.attachmentName}</span>
                  <a href={taskForm.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-xs" style={{ color: GOLD }}>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button onClick={() => setTaskForm(f => ({ ...f, attachmentUrl: "", attachmentName: "" }))} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-border/60 text-xs gap-1.5"
                  disabled={taskAttachUploading}
                  onClick={() => taskAttachInputRef.current?.click()}
                >
                  {taskAttachUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {taskAttachUploading ? "Uploading..." : "Upload File"}
                </Button>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowAddTask(false); resetTaskForm(); }}>Cancel</Button>
            <Button
              className="btn-gold"
              disabled={addTask.isPending || !taskForm.title.trim() || taskAttachUploading}
              onClick={() => {
                if (!taskForm.title.trim()) { toast.error("Title required"); return; }
                addTask.mutate({
                  projectId: id,
                  title: taskForm.title.trim(),
                  description: taskForm.description || undefined,
                  category: taskForm.category || undefined,
                  dueDate: taskForm.dueDate || undefined,
                  attachmentUrl: taskForm.attachmentUrl || undefined,
                  attachmentName: taskForm.attachmentName || undefined,
                  assignees: taskForm.assignees.length > 0 ? taskForm.assignees : undefined,
                  origin: window.location.origin,
                });
              }}
            >
              {addTask.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Adding...</> : <><Plus className="h-3.5 w-3.5 mr-1" />Add Task</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Task Dialog */}
      <Dialog open={!!editTaskId} onOpenChange={(open) => { if (!open) setEditTaskId(null); }}>
        <DialogContent className="bg-card border-border max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg">Edit Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Title */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Task Title *</Label>
              <Input
                className="bg-background border-border h-10 text-sm"
                value={editTaskForm.title}
                onChange={e => setEditTaskForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Task title..."
              />
            </div>
            {/* Description */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Description / Details</Label>
              <Textarea
                className="bg-background border-border resize-none text-sm"
                rows={3}
                value={editTaskForm.description}
                onChange={e => setEditTaskForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Add any details or instructions..."
              />
            </div>
            {/* Category */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Category</Label>
              <Input
                className="bg-background border-border h-10 text-sm"
                value={editTaskForm.category}
                onChange={e => setEditTaskForm(f => ({ ...f, category: e.target.value }))}
                placeholder="e.g. Delivery, Question, Installation..."
              />
            </div>
            {/* Due Date */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Due Date (optional)</Label>
              <Input
                className="bg-background border-border h-10 text-sm"
                type="date"
                value={editTaskForm.dueDate}
                onChange={e => setEditTaskForm(f => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
            {/* Attachment */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Attachment (photo or PDF, optional)</Label>
              <input
                ref={editTaskAttachInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleEditTaskAttachFile(f); e.target.value = ""; }}
              />
              {editTaskForm.attachmentUrl ? (
                <div className="flex items-center gap-2 p-2 rounded-lg border" style={{ borderColor: "rgba(191,154,59,0.3)", background: "rgba(191,154,59,0.06)" }}>
                  {editTaskForm.attachmentName.match(/\.(jpg|jpeg|png|gif|webp|heic)$/i) ? (
                    <Image className="h-4 w-4 shrink-0" style={{ color: "#BF9A3B" }} />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0" style={{ color: "#BF9A3B" }} />
                  )}
                  <span className="text-xs flex-1 truncate text-foreground">{editTaskForm.attachmentName}</span>
                  <a href={editTaskForm.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-xs" style={{ color: "#BF9A3B" }}>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button
                    onClick={() => setEditTaskForm(f => ({ ...f, attachmentUrl: "", attachmentName: "" }))}
                    className="text-muted-foreground hover:text-destructive"
                    title="Remove attachment"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => editTaskAttachInputRef.current?.click()}
                    className="text-muted-foreground hover:text-foreground ml-1"
                    title="Replace attachment"
                    disabled={editTaskAttachUploading}
                  >
                    {editTaskAttachUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-border/60 text-xs gap-1.5"
                  disabled={editTaskAttachUploading}
                  onClick={() => editTaskAttachInputRef.current?.click()}
                >
                  {editTaskAttachUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {editTaskAttachUploading ? "Uploading..." : "Upload File"}
                </Button>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditTaskId(null)}>Cancel</Button>
            <Button
              className="btn-gold"
              disabled={saveEditTask.isPending || !editTaskForm.title.trim() || editTaskAttachUploading}
              onClick={() => {
                if (!editTaskId || !editTaskForm.title.trim()) return;
                saveEditTask.mutate({
                  id: editTaskId,
                  title: editTaskForm.title.trim(),
                  description: editTaskForm.description || undefined,
                  category: editTaskForm.category || undefined,
                  dueDate: editTaskForm.dueDate || undefined,
                  attachmentUrl: editTaskForm.attachmentUrl || undefined,
                  attachmentName: editTaskForm.attachmentName || undefined,
                });
              }}
            >
              {saveEditTask.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Saving...</> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Status Dialog */}
      <Dialog open={showEditStatus} onOpenChange={setShowEditStatus}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader><DialogTitle className="font-serif">Edit Project</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Project Name</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} className="bg-background border-border" placeholder="Project name" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">AI Update Frequency</Label>
              <Select value={editFreq} onValueChange={setEditFreq}>
                <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AI_FREQ.map(f => <SelectItem key={f} value={f}>{f.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditStatus(false)}>Cancel</Button>
            <Button className="btn-gold" onClick={() => updateProject.mutate({ id, name: editName || undefined, status: editStatus as any, aiUpdateFrequency: editFreq as any })}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Document Dialog */}
      <Dialog open={showUploadDoc} onOpenChange={open => { if (!open) setShowUploadDoc(false); }}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader><DialogTitle className="font-serif">Upload Document</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Document Type *</Label>
              <Select value={uploadDocForm.docType} onValueChange={v => setUploadDocForm(f => ({ ...f, docType: v as any }))}>
                <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="permit">Permit</SelectItem>
                  <SelectItem value="photo">Photo</SelectItem>
                  <SelectItem value="drawing">Drawing / Blueprint</SelectItem>
                  <SelectItem value="estimate">Estimate</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="warranty">Warranty</SelectItem>
                  <SelectItem value="compliance">Compliance</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">File *</Label>
              <input
                type="file"
                ref={uploadDocFileRef}
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = ev => {
                    setUploadDocForm(f => ({
                      ...f,
                      fileName: file.name,
                      fileDataBase64: ev.target?.result as string,
                      mimeType: file.type,
                    }));
                  };
                  reader.readAsDataURL(file);
                }}
              />
              <Button
                variant="outline"
                className="w-full border-dashed border-border/60 text-muted-foreground hover:text-foreground"
                onClick={() => uploadDocFileRef.current?.click()}
              >
                {uploadDocForm.fileName ? (
                  <span className="truncate max-w-[280px] text-foreground">{uploadDocForm.fileName}</span>
                ) : (
                  <span className="flex items-center gap-2"><Upload className="h-4 w-4" /> Choose file...</span>
                )}
              </Button>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Description (optional)</Label>
              <Input
                className="bg-background border-border"
                value={uploadDocForm.description}
                onChange={e => setUploadDocForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief description of this document"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowUploadDoc(false); setUploadDocForm({ fileName: "", fileDataBase64: "", mimeType: "", docType: "photo", description: "" }); }}>Cancel</Button>
            <Button
              className="btn-gold"
              disabled={uploadDocMutation.isPending || !uploadDocForm.fileName || !uploadDocForm.fileDataBase64}
              onClick={() => {
                if (!uploadDocForm.fileName || !uploadDocForm.fileDataBase64) { toast.error("Please select a file"); return; }
                uploadDocMutation.mutate({
                  projectId: id,
                  leadId: project?.leadId ?? undefined,
                  fileName: uploadDocForm.fileName,
                  fileDataBase64: uploadDocForm.fileDataBase64,
                  mimeType: uploadDocForm.mimeType,
                  docType: uploadDocForm.docType,
                  description: uploadDocForm.description || undefined,
                });
              }}
            >
              {uploadDocMutation.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Uploading...</> : <><Upload className="h-3.5 w-3.5 mr-1" />Upload</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Milestone Dialog */}
      <Dialog open={showAddMilestone} onOpenChange={setShowAddMilestone}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader><DialogTitle className="font-serif">Add Milestone</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Title *</Label>
              <Input className="bg-background border-border" value={milestoneForm.title} onChange={e => setMilestoneForm(f => ({ ...f, title: e.target.value }))} placeholder="Demo & Prep" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Description</Label>
              <Textarea className="bg-background border-border resize-none" rows={2} value={milestoneForm.description} onChange={e => setMilestoneForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Due Date</Label>
              <Input className="bg-background border-border" type="date" value={milestoneForm.dueDate} onChange={e => setMilestoneForm(f => ({ ...f, dueDate: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Billing Amount ($)</Label>
              <Input className="bg-background border-border" type="number" value={milestoneForm.billingAmount} onChange={e => setMilestoneForm(f => ({ ...f, billingAmount: e.target.value }))} placeholder="For progressive billing" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMilestone(false)}>Cancel</Button>
            <Button className="btn-gold" onClick={() => { if (!milestoneForm.title.trim()) { toast.error("Title required"); return; } createMilestone.mutate({ projectId: id, ...milestoneForm }); }} disabled={createMilestone.isPending}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Milestone → Invoice Dialog */}
      <Dialog
        open={!!milestoneInvoiceDialog?.open}
        onOpenChange={open => { if (!open) setMilestoneInvoiceDialog(null); }}
      >
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">Generate Invoice from Milestone</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              A draft invoice will be created for milestone <strong className="text-foreground">{milestoneInvoiceDialog?.milestoneTitle}</strong>.
              You can review and edit it before sending to the client.
            </p>
            {milestoneInvoiceDialog?.milestoneStatus !== "completed" && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                <p className="text-xs text-amber-400 font-medium flex items-center gap-1.5">
                  <span>⚠</span> Milestone not yet complete
                </p>
                <p className="text-xs text-muted-foreground">
                  This milestone is currently <strong className="text-foreground capitalize">{milestoneInvoiceDialog?.milestoneStatus?.replace(/_/g, " ")}</strong>. 
                  Progress and final invoices should only be sent after the milestone is marked complete.
                </p>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-border"
                    checked={milestoneInvoiceDialog?.bypassGate ?? false}
                    onChange={e => setMilestoneInvoiceDialog(d => d ? { ...d, bypassGate: e.target.checked } : null)}
                  />
                  Override — create invoice anyway
                </label>
              </div>
            )}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Invoice Amount ($)</Label>
              <Input
                className="bg-background border-border"
                type="number"
                step="0.01"
                value={milestoneInvoiceDialog?.billingAmount ?? ""}
                onChange={e => setMilestoneInvoiceDialog(d => d ? { ...d, billingAmount: e.target.value } : null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMilestoneInvoiceDialog(null)}>Cancel</Button>
            <Button
              className="btn-gold"
              disabled={createMilestoneInvoice.isPending || (milestoneInvoiceDialog?.milestoneStatus !== "completed" && !milestoneInvoiceDialog?.bypassGate)}
              onClick={() => {
                if (!milestoneInvoiceDialog || !project) return;
                const amount = parseFloat(milestoneInvoiceDialog.billingAmount);
                if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }
                createMilestoneInvoice.mutate({
                  leadId: project.leadId ?? project.clientId ?? 0,
                  projectId: id,
                  milestoneId: milestoneInvoiceDialog.milestoneId,
                  description: `Milestone: ${milestoneInvoiceDialog.milestoneTitle}`,
                  amount,
                  invoiceType: "progress",
                  bypassMilestoneGate: milestoneInvoiceDialog.bypassGate,
                });
              }}
            >
              {createMilestoneInvoice.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Creating...</> : "Create Draft Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inspiration Drawer — side panel for design ideas */}
      <InspirationDrawer
        open={inspirationDrawerOpen}
        onClose={() => setInspirationDrawerOpen(false)}
        leadId={project?.leadId ?? undefined}
        projectId={id}
        clientName={projectClient?.name}
      />

      {/* Field Capture Drawer — side panel for field photos/notes */}
      <FieldCaptureDrawer
        open={fieldCaptureDrawerOpen}
        onClose={() => setFieldCaptureDrawerOpen(false)}
        leadId={project?.leadId ?? undefined}
        clientName={projectClient?.name}
      />
    </div>
  );
}
