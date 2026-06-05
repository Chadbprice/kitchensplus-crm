import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Clock } from "lucide-react";
import { format } from "date-fns";
const GOLD = "#BF9A3B";
export default function VendorSchedule() {
  const { data: events } = trpc.schedule.list.useQuery({});
  const upcoming = (events ?? []).filter(e => new Date(e.startTime) >= new Date()).sort((a,b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  return (
    <div className="min-h-screen" style={{ background: "var(--kp-dark)" }}>
      <div className="border-b border-border/40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: GOLD, color: "#1A1B17" }}>KP</div>
          <span className="font-serif text-lg" style={{ color: "var(--kp-cream)" }}>Kitchens Plus Upstate</span>
        </div>
        <span className="text-xs text-muted-foreground">Schedule</span>
      </div>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-3xl font-serif" style={{ color: "var(--kp-cream)" }}>My Schedule</h1>
        {upcoming.length === 0 ? (
          <Card className="bg-card border-border"><CardContent className="py-12 text-center text-muted-foreground"><Calendar className="h-8 w-8 mx-auto mb-3 opacity-40" /><p className="text-lg font-serif mb-1">No upcoming events</p><p className="text-sm">Your scheduled work will appear here</p></CardContent></Card>
        ) : (
          <div className="space-y-3">
            {upcoming.map(ev => (
              <Card key={ev.id} className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg shrink-0" style={{ background: `${GOLD}20` }}><Calendar className="h-4 w-4" style={{ color: GOLD }} /></div>
                    <div>
                      <p className="font-medium text-sm text-foreground">{ev.title}</p>
                      <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" /><span>{format(new Date(ev.startTime), "EEE, MMM d · h:mm a")}</span>{ev.endTime && <span>– {format(new Date(ev.endTime), "h:mm a")}</span>}</div>
                      {ev.location && <p className="text-xs text-muted-foreground mt-0.5">{ev.location}</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
