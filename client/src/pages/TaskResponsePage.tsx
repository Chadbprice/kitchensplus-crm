/**
 * TaskResponsePage — Public, no login required.
 * Accessed via /task-response/:token
 * Allows clients, vendors, or crew to answer a question task with one click.
 */
import { useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { CheckCircle2, AlertTriangle, MessageSquare, Clock } from "lucide-react";

const GOLD = "#BF9A3B";

export default function TaskResponsePage() {
  const { token } = useParams<{ token: string }>();
  const [name, setName] = useState("");
  const [reply, setReply] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: task, isLoading, error: fetchError } = trpc.taskResponse.getByToken.useQuery(
    { token: token ?? "" },
    { enabled: !!token, retry: false }
  );

  const submitMutation = trpc.taskResponse.submit.useMutation({
    onSuccess: () => setSubmitted(true),
    onError: (e) => setError(e.message),
  });

  const handleQuickReply = (text: string) => {
    if (!name.trim()) {
      setError("Please enter your name first.");
      return;
    }
    submitMutation.mutate({ token: token ?? "", replierName: name.trim(), replyText: text, channel: "portal" });
  };

  const handleSubmit = () => {
    if (!name.trim()) { setError("Please enter your name."); return; }
    if (!reply.trim()) { setError("Please enter your response."); return; }
    setError(null);
    submitMutation.mutate({ token: token ?? "", replierName: name.trim(), replyText: reply.trim(), channel: "portal" });
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F7F4EF" }}>
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: `${GOLD} transparent transparent transparent` }} />
          <p style={{ color: "#888" }}>Loading your question…</p>
        </div>
      </div>
    );
  }

  // ── Invalid token ─────────────────────────────────────────────────────────────
  if (fetchError || !task) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#F7F4EF" }}>
        <div className="max-w-sm w-full text-center space-y-4 p-6 rounded-2xl bg-white shadow-lg">
          <AlertTriangle className="h-12 w-12 mx-auto" style={{ color: "#E57373" }} />
          <h2 className="text-xl font-semibold" style={{ color: "#2E2F2A" }}>Link Not Found</h2>
          <p style={{ color: "#666" }}>This response link has expired or is invalid. Please contact Kitchens Plus Upstate directly.</p>
          <a href="tel:8645678777" className="block text-center py-3 rounded-xl font-semibold text-white mt-2" style={{ background: GOLD }}>
            Call Chad: 864-567-8777
          </a>
        </div>
      </div>
    );
  }

  // ── Already completed ─────────────────────────────────────────────────────────
  if (task.status === "completed") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#F7F4EF" }}>
        <div className="max-w-sm w-full text-center space-y-4 p-6 rounded-2xl bg-white shadow-lg">
          <CheckCircle2 className="h-12 w-12 mx-auto" style={{ color: "#4CAF7D" }} />
          <h2 className="text-xl font-semibold" style={{ color: "#2E2F2A" }}>Already Answered</h2>
          <p style={{ color: "#666" }}>This question has already been answered. Thank you!</p>
          <p className="text-sm" style={{ color: "#aaa" }}>— Kitchens Plus Upstate</p>
        </div>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#F7F4EF" }}>
        <div className="max-w-sm w-full text-center space-y-5 p-6 rounded-2xl bg-white shadow-lg">
          <CheckCircle2 className="h-14 w-14 mx-auto" style={{ color: "#4CAF7D" }} />
          <h2 className="text-2xl font-bold" style={{ color: "#2E2F2A" }}>Thank You!</h2>
          <p style={{ color: "#555" }}>Your response has been recorded and Chad has been notified. We'll be in touch shortly.</p>
          <div className="pt-2 border-t border-gray-100">
            <p className="text-sm font-semibold" style={{ color: GOLD }}>KITCHENS PLUS UPSTATE</p>
            <p className="text-xs" style={{ color: "#aaa" }}>Renovations &amp; Design</p>
            <a href="tel:8645678777" className="text-sm mt-1 block" style={{ color: GOLD }}>864-567-8777</a>
          </div>
        </div>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen px-4 py-8" style={{ background: "#F7F4EF" }}>
      <div className="max-w-sm mx-auto space-y-5">
        {/* Header */}
        <div className="text-center space-y-1">
          <p className="text-xs font-semibold tracking-widest" style={{ color: GOLD }}>KITCHENS PLUS UPSTATE</p>
          <p className="text-xs" style={{ color: "#aaa" }}>Renovations &amp; Design</p>
        </div>

        {/* Question card */}
        <div className="bg-white rounded-2xl shadow-md overflow-hidden">
          <div className="px-5 py-4" style={{ background: "#2E2F2A" }}>
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare className="h-4 w-4" style={{ color: GOLD }} />
              <span className="text-xs font-semibold tracking-wide" style={{ color: GOLD }}>QUESTION FOR YOU</span>
            </div>
            <h1 className="text-lg font-bold leading-snug" style={{ color: "#fff" }}>{task.title}</h1>
          </div>
          {task.description && (
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-sm leading-relaxed" style={{ color: "#555" }}>{task.description}</p>
            </div>
          )}
          {task.dueDate && (
            <div className="px-5 py-3 flex items-center gap-2 bg-amber-50">
              <Clock className="h-3.5 w-3.5" style={{ color: GOLD }} />
              <p className="text-xs" style={{ color: "#888" }}>
                Response requested by <strong>{new Date(task.dueDate).toLocaleDateString("en-US", { month: "long", day: "numeric" })}</strong>
              </p>
            </div>
          )}
        </div>

        {/* Name field */}
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
          <label className="text-sm font-semibold" style={{ color: "#2E2F2A" }}>Your Name</label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. John Smith"
            className="text-base h-12 rounded-xl border-gray-200"
            style={{ fontSize: "16px" /* prevent iOS zoom */ }}
          />
        </div>

        {/* Quick reply buttons */}
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
          <p className="text-sm font-semibold" style={{ color: "#2E2F2A" }}>Quick Reply</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleQuickReply("Yes, please include that.")}
              disabled={submitMutation.isPending}
              className="h-14 rounded-xl font-semibold text-white text-base transition-opacity active:opacity-70"
              style={{ background: "#4CAF7D" }}
            >
              ✓ Yes
            </button>
            <button
              onClick={() => handleQuickReply("No, please do not include that.")}
              disabled={submitMutation.isPending}
              className="h-14 rounded-xl font-semibold text-white text-base transition-opacity active:opacity-70"
              style={{ background: "#E57373" }}
            >
              ✗ No
            </button>
          </div>
          <button
            onClick={() => handleQuickReply("I need more information before I can answer.")}
            disabled={submitMutation.isPending}
            className="w-full h-12 rounded-xl font-medium text-sm border-2 transition-opacity active:opacity-70"
            style={{ borderColor: GOLD, color: GOLD, background: "transparent" }}
          >
            Need More Info
          </button>
        </div>

        {/* Custom reply */}
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
          <p className="text-sm font-semibold" style={{ color: "#2E2F2A" }}>Or type a custom response:</p>
          <Textarea
            value={reply}
            onChange={e => setReply(e.target.value)}
            placeholder="Type your answer here…"
            rows={4}
            className="rounded-xl border-gray-200 resize-none"
            style={{ fontSize: "16px" }}
          />
          {error && (
            <p className="text-sm flex items-center gap-1.5" style={{ color: "#E57373" }}>
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </p>
          )}
          <button
            onClick={handleSubmit}
            disabled={submitMutation.isPending || !reply.trim()}
            className="w-full h-14 rounded-xl font-bold text-white text-base transition-opacity disabled:opacity-50"
            style={{ background: GOLD }}
          >
            {submitMutation.isPending ? "Sending…" : "Send My Response"}
          </button>
        </div>

        {/* Footer */}
        <div className="text-center space-y-1 pb-6">
          <p className="text-xs" style={{ color: "#aaa" }}>Questions? Call Chad at</p>
          <a href="tel:8645678777" className="text-sm font-semibold" style={{ color: GOLD }}>864-567-8777</a>
          <p className="text-xs" style={{ color: "#ccc" }}>Kitchens Plus Upstate · kitchensplusupstate.com</p>
        </div>
      </div>
    </div>
  );
}
