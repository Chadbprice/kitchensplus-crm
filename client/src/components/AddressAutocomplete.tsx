/**
 * AddressAutocomplete — Google Maps Places API autocomplete input
 *
 * Uses server-side `trpc.maps.addressPredictions` and `trpc.maps.geocode`
 * procedures so the Manus BUILT_IN_FORGE_API_KEY (server-side) is used for
 * all Google Maps API calls — avoiding the 403 that the frontend proxy returns.
 *
 * No Google Maps JS SDK is loaded by this component.
 *
 * Fix (Apr 2 2026):
 * - Replaced unstable onPlaceSelect in useEffect deps with a stable ref to
 *   prevent React error #185 (hooks count change between renders).
 * - Geocode result is consumed via ref callback to avoid re-render loops.
 */
import { useEffect, useRef, useState, useCallback, useId } from "react";
import { CheckCircle2, MapPin, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface PlaceResult {
  formattedAddress: string;
  placeId: string;
  lat?: number;
  lng?: number;
}

interface Prediction {
  description: string;
  place_id: string;
  main_text: string;
  secondary_text: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect?: (place: PlaceResult) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  label?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Start typing a property address…",
  className,
  disabled,
}: AddressAutocompleteProps) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a stable ref to the latest onPlaceSelect callback — avoids adding it
  // to useEffect dependency arrays and prevents React error #185.
  const onPlaceSelectRef = useRef(onPlaceSelect);
  useEffect(() => { onPlaceSelectRef.current = onPlaceSelect; });

  const [debouncedInput, setDebouncedInput] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isVerified, setIsVerified] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  // Track whether we've already fired onPlaceSelect for the current placeId
  const firedForPlaceIdRef = useRef<string | null>(null);

  // ── Server-side autocomplete query ───────────────────────────────────────
  const { data: predictions = [], isFetching, isError } = trpc.maps.addressPredictions.useQuery(
    { input: debouncedInput },
    {
      enabled: debouncedInput.length >= 3,
      staleTime: 30_000,
      retry: false,
    }
  );

  // ── Server-side geocode query (fires when a place_id is selected) ─────────
  const { data: geocodeResult } = trpc.maps.geocode.useQuery(
    { placeId: selectedPlaceId ?? "" },
    {
      enabled: !!selectedPlaceId,
      staleTime: 60_000,
      retry: false,
    }
  );

  // When geocode result arrives, call onPlaceSelect with lat/lng.
  // Use ref for callback to avoid unstable dependency causing re-render loops.
  useEffect(() => {
    if (
      geocodeResult &&
      selectedPlaceId &&
      firedForPlaceIdRef.current !== selectedPlaceId
    ) {
      firedForPlaceIdRef.current = selectedPlaceId;
      onPlaceSelectRef.current?.({
        formattedAddress: geocodeResult.formattedAddress,
        placeId: selectedPlaceId,
        lat: geocodeResult.lat,
        lng: geocodeResult.lng,
      });
    }
  }, [geocodeResult, selectedPlaceId]);

  // Open dropdown when predictions arrive
  useEffect(() => {
    if (predictions.length > 0 && debouncedInput.length >= 3) {
      setShowDropdown(true);
      setActiveIndex(-1);
    } else if (!isFetching) {
      setShowDropdown(false);
    }
  }, [predictions, isFetching, debouncedInput]);

  // ── Close dropdown on outside click ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Handle text input ─────────────────────────────────────────────────────
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (isVerified) setIsVerified(false);
    onChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length >= 3) {
      debounceRef.current = setTimeout(() => setDebouncedInput(val), 300);
    } else {
      setDebouncedInput("");
      setShowDropdown(false);
    }
  };

  // ── Select a prediction ───────────────────────────────────────────────────
  const selectPrediction = useCallback(
    (pred: Prediction) => {
      onChange(pred.description);
      setShowDropdown(false);
      setActiveIndex(-1);
      setDebouncedInput("");
      setIsVerified(true);
      // Reset the fired tracker so the new placeId will fire onPlaceSelect
      firedForPlaceIdRef.current = null;
      // Trigger geocode query — result will fire onPlaceSelect via useEffect
      setSelectedPlaceId(pred.place_id);
      // Optimistically call with just the description while geocode loads
      onPlaceSelectRef.current?.({
        formattedAddress: pred.description,
        placeId: pred.place_id,
      });
    },
    [onChange]
  );

  // ── Keyboard navigation ───────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || predictions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, predictions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      selectPrediction(predictions[activeIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <MapPin
          className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none z-10"
          style={{ color: isVerified ? "#4CAF7D" : "#BF9A3B" }}
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (predictions.length > 0 && debouncedInput.length >= 3) setShowDropdown(true);
          }}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          data-form-type="other"
          spellCheck={false}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "pl-9 pr-9",
            isVerified && "border-green-600/60",
            className
          )}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
          {isFetching && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
          {isVerified && !isFetching && (
            <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "#4CAF7D" }} />
          )}
          {isError && !isFetching && (
            <AlertCircle className="h-3.5 w-3.5 text-amber-400" title="Maps suggestions unavailable" />
          )}
        </div>
      </div>

      {/* ── Custom dropdown ─────────────────────────────────────────────── */}
      {showDropdown && predictions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Address suggestions"
          className="absolute z-50 w-full mt-1 rounded-lg border border-border bg-card shadow-lg overflow-hidden"
          style={{ maxHeight: "240px", overflowY: "auto" }}
        >
          {predictions.map((pred, idx) => (
            <li
              key={pred.place_id}
              id={`${listboxId}-opt-${idx}`}
              role="option"
              aria-selected={idx === activeIndex}
              className={cn(
                "flex items-start gap-2 px-3 py-2.5 cursor-pointer text-sm transition-colors",
                idx === activeIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50 text-foreground"
              )}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent blur before click
                selectPrediction(pred);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              <MapPin
                className="h-3.5 w-3.5 mt-0.5 shrink-0"
                style={{ color: "#BF9A3B" }}
              />
              <div className="min-w-0">
                <div className="font-medium truncate">{pred.main_text}</div>
                {pred.secondary_text && (
                  <div className="text-xs text-muted-foreground truncate">{pred.secondary_text}</div>
                )}
              </div>
            </li>
          ))}
          <li className="px-3 py-1.5 text-[10px] text-muted-foreground/60 border-t border-border">
            Powered by Google
          </li>
        </ul>
      )}

      {/* ── Status messages ──────────────────────────────────────────────── */}
      {isVerified && (
        <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: "#4CAF7D" }}>
          <CheckCircle2 className="h-3 w-3" /> Address verified via Google Maps
        </p>
      )}
      {isError && (
        <p className="text-[10px] mt-1 text-amber-400/80">
          Maps suggestions unavailable — you can still type the address manually.
        </p>
      )}
    </div>
  );
}

export default AddressAutocomplete;
