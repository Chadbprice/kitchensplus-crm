import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Send } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
const GOLD = "#BF9A3B";
export default function VendorMessages() {
  const [body, setBody] = useState("");
  const { data: messages, refetch } = trpc.messages.listAll.useQuery();
  const send = trpc.messages.create.useMutation({ onSuccess: () => { refetch(); setBody(""); toast.success("Message sent!"); } });
  const myMessages = (messages ?? []).filter(m => m.threadType === "vendor");
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--kp-dark)" }}>
      <div className="border-b border-border/40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: GOLD, color: "#1A1B17" }}>KP</div>
          <span className="font-serif text-lg" style={{ color: "var(--kp-cream)" }}>Kitchens Plus Upstate</span>
        </div>
        <span className="text-xs text-muted-foreground">Messages</span>
      </div>
      <div className="max-w-2xl mx-auto px-4 py-6 w-full flex-1 flex flex-col gap-4">
        <h1 className="text-3xl font-serif" style={{ color: "var(--kp-cream)" }}>Messages</h1>
        <div className="flex-1 space-y-3">
          {myMessages.length === 0 ? (
            <Card className="bg-card border-border"><CardContent className="py-12 text-center text-muted-foreground"><MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-40" /><p>No messages yet</p></CardContent></Card>
          ) : (
            myMessages.map(msg => (
              <div key={msg.id} className={`flex gap-3 ${msg.direction === "outbound" ? "flex-row-reverse" : ""}`}>
                <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${msg.direction === "outbound" ? "text-foreground" : "bg-card text-foreground border border-border"}`} style={msg.direction === "outbound" ? { background: `${GOLD}25`, border: `1px solid ${GOLD}40` } : {}}>
                  <p className="text-xs text-muted-foreground mb-1">{msg.direction === "outbound" ? "Kitchens Plus" : "You"} · {format(new Date(msg.createdAt), "MMM d, h:mm a")}</p>
                  <p>{msg.body}</p>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2 mt-auto">
          <Textarea className="bg-card border-border resize-none flex-1" rows={2} placeholder="Type a message..." value={body} onChange={e => setBody(e.target.value)} />
          <Button className="btn-gold self-end" onClick={() => { if (!body.trim()) return; send.mutate({ threadType: "vendor", channel: "portal", body, direction: "inbound" } as any); }} disabled={send.isPending}><Send className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}
