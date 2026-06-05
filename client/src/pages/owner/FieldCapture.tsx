import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Camera, ArrowLeft, Search, User, MapPin, Phone, RefreshCw, LogIn } from "lucide-react";
import { getLoginUrl } from "@/const";

export default function FieldCapture() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");

  // Pull-to-refresh state
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartY = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: clients = [], isLoading, isError, error, refetch, isFetching } = trpc.fieldCapture.listClients.useQuery(
    undefined,
    { retry: false }
  );

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? "").includes(search) ||
    (c.address ?? "").toLowerCase().includes(search.toLowerCase())
  );

  // Pull-to-refresh handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const el = scrollRef.current;
    if (el && el.scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const el = scrollRef.current;
    if (!el || el.scrollTop > 0) {
      touchStartY.current = null;
      setPullDistance(0);
      return;
    }
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0) {
      setPullDistance(Math.min(delta * 0.5, 80));
      setIsPulling(delta > 60);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (isPulling) {
      refetch();
    }
    touchStartY.current = null;
    setPullDistance(0);
    setIsPulling(false);
  }, [isPulling, refetch]);

  // Auth error — session expired or not logged in
  const isAuthError = isError && (
    (error as any)?.message?.includes("10001") ||
    (error as any)?.data?.code === "UNAUTHORIZED" ||
    (error as any)?.data?.code === "FORBIDDEN"
  );

  return (
    <div className="min-h-screen bg-[#1A1B16] text-white flex flex-col select-none">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1A1B16] border-b border-[#BF9A3B]/30 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/dashboard")}
          className="p-2 rounded-full hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-[#BF9A3B]" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <Camera className="w-5 h-5 text-[#BF9A3B]" />
          <h1 className="text-lg font-semibold tracking-wide">Field Capture</h1>
        </div>
        <button
          onClick={() => refetch()}
          className="p-2 rounded-full hover:bg-white/10 transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw className={`w-4 h-4 text-[#BF9A3B] ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Pull-to-refresh indicator */}
      {pullDistance > 0 && (
        <div
          className="flex items-center justify-center overflow-hidden transition-all"
          style={{ height: pullDistance }}
        >
          <RefreshCw
            className={`w-5 h-5 text-[#BF9A3B] transition-transform ${isPulling ? "animate-spin" : ""}`}
            style={{ transform: `rotate(${(pullDistance / 80) * 360}deg)` }}
          />
          <span className="ml-2 text-xs text-[#BF9A3B]">
            {isPulling ? "Release to refresh" : "Pull to refresh"}
          </span>
        </div>
      )}

      {/* Auth error state */}
      {isAuthError && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[#BF9A3B]/20 flex items-center justify-center">
            <LogIn className="w-8 h-8 text-[#BF9A3B]" />
          </div>
          <div>
            <p className="text-white font-semibold text-lg">Session Expired</p>
            <p className="text-white/50 text-sm mt-1">Your login session has expired. Please sign in again to continue.</p>
          </div>
          <button
            onClick={() => { window.location.href = getLoginUrl(); }}
            className="mt-2 px-6 py-3 rounded-xl font-semibold text-sm text-[#1A1B16]"
            style={{ background: "var(--kp-gold, #BF9A3B)" }}
          >
            Sign In Again
          </button>
          <button
            onClick={() => refetch()}
            className="text-[#BF9A3B] text-sm underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Normal content */}
      {!isAuthError && (
        <>
          {/* Search */}
          <div className="px-4 py-3 border-b border-white/10">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <Input
                placeholder="Search clients…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-white/5 border-white/20 text-white placeholder:text-white/40 h-11 text-base"
              />
            </div>
          </div>

          {/* Client list — scrollable with pull-to-refresh */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {isLoading && (
              <div className="text-center text-white/40 py-12 text-sm">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#BF9A3B]" />
                Loading clients…
              </div>
            )}

            {!isLoading && isError && !isAuthError && (
              <div className="text-center text-white/40 py-12 text-sm">
                <p className="text-red-400 mb-2">Failed to load clients</p>
                <button onClick={() => refetch()} className="text-[#BF9A3B] underline text-sm">Retry</button>
              </div>
            )}

            {!isLoading && !isError && filtered.length === 0 && (
              <div className="text-center text-white/40 py-12 text-sm">
                {search ? "No clients match your search" : "No clients found"}
              </div>
            )}

            {filtered.map((client) => (
              <button
                key={`${client.source}-${client.id}`}
                onClick={() => navigate(`/field-capture/${client.source === "lead" ? "lead" : ""}${client.id}`)}
                className="w-full text-left bg-white/5 hover:bg-[#BF9A3B]/10 border border-white/10 hover:border-[#BF9A3B]/40 rounded-xl p-4 transition-all active:scale-[0.98]"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#BF9A3B]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="w-5 h-5 text-[#BF9A3B]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white text-base leading-tight">{client.name}</p>
                      {client.source === "lead" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-[#BF9A3B]/40 text-[#BF9A3B]/70 leading-none">Lead</span>
                      )}
                    </div>
                    {client.phone && (
                      <p className="text-white/50 text-sm mt-0.5 flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {client.phone}
                      </p>
                    )}
                    {client.address && (
                      <p className="text-white/40 text-xs mt-1 flex items-start gap-1 leading-tight">
                        <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span className="truncate">{client.address}</span>
                      </p>
                    )}
                  </div>
                  <div className="text-[#BF9A3B] text-xl self-center">›</div>
                </div>
              </button>
            ))}
          </div>

          {/* Bottom hint */}
          <div className="px-4 py-3 border-t border-white/10 text-center">
            <p className="text-white/30 text-xs">
              {clients.length > 0
                ? `${clients.length} contact${clients.length !== 1 ? "s" : ""} · Pull down to refresh`
                : "Select a client to capture photos and notes"}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
