import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { useEffect } from "react";
import { useLocation } from "wouter";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663481717136/NJbAuvnBiksaabdpS5d8M3/kitchensplus_logo_0e432498.webp";

export default function Home() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && user) {
      const role = (user as any).role;
      if (role === "client") setLocation("/client/project");
      else if (role === "vendor") setLocation("/vendor/quotes");
      else if (role === "crew") setLocation("/crew/jobs");
      else setLocation("/dashboard");
    }
  }, [user, loading, setLocation]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: "linear-gradient(160deg, #1E1F1B 0%, #2E2F2A 50%, #31361D 100%)" }}
    >
      {/* Background texture */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23BF9A3B' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      {/* Gold accent lines */}
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: "linear-gradient(90deg, transparent, var(--kp-gold), transparent)" }} />
      <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: "linear-gradient(90deg, transparent, var(--kp-gold), transparent)" }} />

      <div className="relative z-10 flex flex-col items-center gap-10 px-6 max-w-lg w-full text-center">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <img src={LOGO_URL} alt="Kitchens Plus Upstate" className="h-20 object-contain" />
          <div className="w-16 h-0.5" style={{ background: "var(--kp-gold)" }} />
        </div>

        {/* Headline */}
        <div className="flex flex-col gap-3">
          <h1
            className="text-4xl md:text-5xl font-serif leading-tight"
            style={{ color: "var(--kp-cream)" }}
          >
            Project Management
            <br />
            <span style={{ color: "var(--kp-gold)" }}>Portal</span>
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: "var(--kp-muted)" }}>
            Streamlined project management for luxury kitchen, bath, and whole-house renovations in Upstate South Carolina.
          </p>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Button
            onClick={() => { window.location.href = "/api/dev/login"; }}
            size="lg"
            className="w-full h-12 text-sm font-semibold tracking-wide"
            style={{ background: "#2563eb" }}
          >
            Owner Login (Testing)
          </Button>
          <Button
            onClick={() => { window.location.href = getLoginUrl(); }}
            size="lg"
            className="w-full btn-gold h-12 text-sm font-semibold tracking-wide"
            disabled={loading}
          >
            {loading ? "Loading..." : "Owner / Crew Sign In"}
          </Button>

          <div className="relative flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <Button
            variant="outline"
            size="lg"
            className="w-full h-12 text-sm border-border/60 hover:border-primary/40"
            onClick={() => setLocation("/auth/magic")}
          >
            Client Portal Access
          </Button>
        </div>

        {/* Contact info */}
        <div className="flex flex-col gap-1 text-xs" style={{ color: "var(--kp-muted)" }}>
          <p>Questions? Text us: <span style={{ color: "var(--kp-gold)" }}>+1 (833) 518-4811</span></p>
          <p>Urgent? Call Chad: <span style={{ color: "var(--kp-cream)" }}>+1 (833) 518-4811</span></p>
        </div>
      </div>
    </div>
  );
}
