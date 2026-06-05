/**
 * ClientMapPreview
 * ────────────────
 * A small map thumbnail shown on lead/client cards.
 *
 * Strategy:
 *  - Calls trpc.maps.getStaticMapUrl (server-side, BUILT_IN_FORGE_API_KEY) which geocodes
 *    the address AND builds the static map URL using the server key. This avoids the 401
 *    that VITE_FRONTEND_FORGE_API_KEY returns for the /staticmap endpoint.
 *  - Thumbnail: renders the returned static map image URL in an <img> tag.
 *  - Modal: loads the Google Maps JS SDK (via the frontend proxy) for an interactive full map
 *    with Street View + Directions.
 *  - Lazy-loads via IntersectionObserver (no geocode until card scrolls into view).
 *  - Graceful fallback when address is missing or geocode fails.
 *  - Accessible: ARIA labels, keyboard navigation, Escape to close.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { MapPin, Navigation, X, Loader2, Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

// ── Maps proxy (for the interactive modal map only) ───────────────────────────
const FORGE_BASE_URL =
  (import.meta.env.VITE_FRONTEND_FORGE_API_URL as string) ||
  "https://forge.butterfly-effect.dev";
const MAPS_PROXY_URL = `${FORGE_BASE_URL}/v1/maps/proxy`;
const MAPS_API_KEY = import.meta.env.VITE_FRONTEND_FORGE_API_KEY as string;

// Singleton script loader — shared with Map.tsx if it already ran
let mapsScriptLoaded = false;
let mapsScriptLoading: Promise<void> | null = null;

function loadMapsScript(): Promise<void> {
  if (mapsScriptLoaded) return Promise.resolve();
  if (mapsScriptLoading) return mapsScriptLoading;
  mapsScriptLoading = new Promise<void>((resolve, reject) => {
    if (typeof window !== "undefined" && (window as any).google?.maps) {
      mapsScriptLoaded = true;
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = `${MAPS_PROXY_URL}/maps/api/js?key=${MAPS_API_KEY}&v=weekly&libraries=marker,places,geocoding,geometry`;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => { mapsScriptLoaded = true; resolve(); };
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return mapsScriptLoading;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface ClientMapPreviewProps {
  /** Full address string, e.g. "123 Main St, Albany, NY 12205" */
  address: string;
  /** Client name shown in the modal header */
  clientName?: string;
  /** Extra Tailwind classes for the outer wrapper */
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ClientMapPreview({ address, clientName, className }: ClientMapPreviewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const modalMapContainerRef = useRef<HTMLDivElement>(null);
  const modalMapRef = useRef<google.maps.Map | null>(null);
  const modalMarkerRef = useRef<any>(null);
  const streetViewRef = useRef<google.maps.StreetViewPanorama | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [streetViewActive, setStreetViewActive] = useState(false);
  const [inView, setInView] = useState(false);

  // ── Lazy load: only start geocoding once the card enters the viewport ──────
  useEffect(() => {
    if (!address) return;
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect(); } },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [address]);

  // ── Server-side geocode + static map URL via tRPC ─────────────────────────
  // Uses BUILT_IN_FORGE_API_KEY server-side (VITE_FRONTEND_FORGE_API_KEY returns 401 for staticmap)
  const { data: mapData, isLoading: mapLoading, isError: mapError } = trpc.maps.getStaticMapUrl.useQuery(
    { address, width: 400, height: 400, zoom: 17 },
    {
      enabled: inView && !!address && address.length >= 5,
      staleTime: 10 * 60 * 1000, // 10 minutes — addresses don't change often
      retry: 1,
    }
  );

  const coords = mapData ? { lat: mapData.lat, lng: mapData.lng } : null;
  const staticMapUrl = mapData?.staticMapUrl ?? null;
  const geoState = mapLoading
    ? "loading"
    : mapError || (inView && !mapLoading && !mapData)
    ? "error"
    : coords
    ? "ready"
    : "idle";

  // ── Render modal map when modal opens ────────────────────────────────────
  useEffect(() => {
    if (!modalOpen || !coords || !modalMapContainerRef.current) return;
    if (modalMapRef.current) {
      modalMapRef.current.setCenter(coords);
      return;
    }

    loadMapsScript()
      .then(() => {
        if (!modalMapContainerRef.current) return;
        const map = new window.google.maps.Map(modalMapContainerRef.current, {
          center: coords,
          zoom: 16,
          mapTypeControl: true,
          fullscreenControl: false,
          zoomControl: true,
          streetViewControl: false,
          mapId: "DEMO_MAP_ID",
        });
        modalMapRef.current = map;

        modalMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
          map,
          position: coords,
          title: clientName ?? address,
        });

        streetViewRef.current = new window.google.maps.StreetViewPanorama(
          modalMapContainerRef.current,
          {
            position: coords,
            pov: { heading: 0, pitch: 0 },
            zoom: 1,
            visible: false,
            addressControl: true,
            linksControl: true,
            panControl: true,
            zoomControl: true,
          }
        );
        map.setStreetView(streetViewRef.current);
      })
      .catch((err) => {
        console.warn("[ClientMapPreview] Failed to load Maps JS SDK for modal:", err);
      });
  }, [modalOpen, coords, address, clientName]);

  // ── Toggle Street View ────────────────────────────────────────────────────
  const toggleStreetView = useCallback(() => {
    if (!streetViewRef.current) return;
    const next = !streetViewActive;
    streetViewRef.current.setVisible(next);
    setStreetViewActive(next);
  }, [streetViewActive]);

  // ── Open Google Maps Directions ───────────────────────────────────────────
  const openDirections = useCallback(() => {
    const encoded = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, "_blank", "noopener");
  }, [address]);

  // ── No address ────────────────────────────────────────────────────────────
  if (!address) {
    return (
      <div
        ref={wrapperRef}
        className={cn(
          "w-[200px] h-[200px] shrink-0 rounded-xl border border-border bg-card/50 flex flex-col items-center justify-center gap-2 text-muted-foreground",
          className
        )}
        aria-label="No address available"
      >
        <MapIcon className="h-8 w-8 opacity-30" />
        <span className="text-xs text-center px-3 opacity-60">No address available</span>
      </div>
    );
  }

  return (
    <>
      {/* ── Thumbnail ─────────────────────────────────────────────────────── */}
      <div
        ref={wrapperRef}
        className={cn(
          "w-[200px] h-[200px] shrink-0 rounded-xl border border-border overflow-hidden relative cursor-pointer",
          "transition-transform duration-200 hover:scale-[1.03] hover:shadow-lg hover:border-primary/40",
          "group",
          className
        )}
        role="button"
        tabIndex={0}
        aria-label={`View map for ${clientName ?? address}`}
        onClick={() => geoState === "ready" && setModalOpen(true)}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && geoState === "ready") setModalOpen(true); }}
      >
        {/* Static map image thumbnail — URL built server-side with BUILT_IN_FORGE_API_KEY */}
        {staticMapUrl && (
          <img
            src={staticMapUrl}
            alt={`Map of ${address}`}
            className="w-full h-full object-cover"
            loading="lazy"
            draggable={false}
          />
        )}

        {/* Loading state */}
        {(geoState === "idle" || geoState === "loading") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card/80">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Loading map…</span>
          </div>
        )}

        {/* Error state */}
        {geoState === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card/80">
            <MapIcon className="h-8 w-8 opacity-30 text-muted-foreground" />
            <span className="text-xs text-center px-3 text-muted-foreground opacity-70">
              Address not found
            </span>
          </div>
        )}

        {/* Hover overlay — click hint */}
        {geoState === "ready" && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-end justify-center pb-2 pointer-events-none">
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-medium text-white bg-black/60 px-2 py-0.5 rounded-full">
              Click to expand
            </span>
          </div>
        )}
      </div>

      {/* ── Full-screen Modal ─────────────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          className="max-w-4xl w-[95vw] h-[85vh] p-0 overflow-hidden bg-card border-border flex flex-col"
          aria-label={`Full map for ${clientName ?? address}`}
        >
          <DialogTitle className="sr-only">Map for {clientName ?? address}</DialogTitle>
          {/* Modal Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0" style={{ color: "#BF9A3B" }} />
              <div>
                {clientName && <p className="text-sm font-semibold text-foreground leading-tight">{clientName}</p>}
                <p className="text-xs text-muted-foreground leading-tight">{mapData?.formattedAddress ?? address}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className={cn(
                  "h-8 text-xs gap-1.5 border-border",
                  streetViewActive && "bg-accent text-accent-foreground"
                )}
                onClick={toggleStreetView}
                aria-pressed={streetViewActive}
              >
                <MapIcon className="h-3.5 w-3.5" />
                {streetViewActive ? "Exit Street View" : "Street View"}
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5"
                style={{ background: "#BF9A3B", color: "#fff" }}
                onClick={openDirections}
                aria-label="Get directions to this address"
              >
                <Navigation className="h-3.5 w-3.5" />
                Get Directions
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-accent/50"
                onClick={() => setModalOpen(false)}
                aria-label="Close map"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Map fills remaining height */}
          <div ref={modalMapContainerRef} className="flex-1 w-full" />
        </DialogContent>
      </Dialog>
    </>
  );
}
