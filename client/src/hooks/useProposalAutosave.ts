import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

interface AutosavePayload {
  id: number;
  title: string;
  notes: string;
  depositPercent: string;
  hidePrices: number;
  lineItems: {
    id?: number;             // existing line-item id (undefined = new)
    task?: string;
    description?: string;
    category?: string;
    quantity?: string;
    unit?: string;
    unitCost: string;
    markupPercent?: string;
    showMarkup?: boolean;
    productUrl?: string;
    productSource?: string;
    imageUrl?: string;
    sortOrder?: number;
  }[];
}

const DEBOUNCE_MS = 1500;
const SAVED_DISPLAY_MS = 3000;

/**
 * Debounced autosave hook for the proposal editor.
 *
 * Returns:
 *  - triggerSave(payload) — call on every meaningful edit
 *  - forceSave()          — immediate save (for manual Save Changes button)
 *  - forceSaveAsync()     — immediate save that returns a Promise (for Done Editing)
 *  - status               — "idle" | "saving" | "saved" | "error"
 *  - lastError            — error message if status === "error"
 *  - isDirty              — true if there are unsaved changes
 */
export function useProposalAutosave() {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const utils = trpc.useUtils();
  const saveAll = trpc.estimates.saveAll.useMutation();

  // Refs to avoid stale closures
  const pendingPayloadRef = useRef<AutosavePayload | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightTimestampRef = useRef<number>(0);
  const isSavingRef = useRef(false);
  const isActiveRef = useRef(true);

  // Clean up timers on unmount
  useEffect(() => {
    isActiveRef.current = true;
    return () => {
      isActiveRef.current = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  // beforeunload protection
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "You have unsaved proposal changes.";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const executeSave = useCallback(async (payload: AutosavePayload) => {
    if (isSavingRef.current) {
      // Already saving — the pending payload will be picked up after current save completes
      return;
    }
    isSavingRef.current = true;
    const timestamp = Date.now();
    inflightTimestampRef.current = timestamp;

    if (isActiveRef.current) {
      setStatus("saving");
      setLastError(null);
    }

    try {
      await saveAll.mutateAsync({
        id: payload.id,
        title: payload.title,
        notes: payload.notes,
        depositPercent: payload.depositPercent,
        hidePrices: payload.hidePrices,
        lineItems: payload.lineItems.map((li, i) => ({
          id: li.id,                    // preserve existing line item id
          task: li.task,
          description: li.description,
          category: li.category,
          quantity: li.quantity,
          unit: li.unit,
          unitCost: li.unitCost || "0",
          markupPercent: li.markupPercent,
          showMarkup: li.showMarkup,
          productUrl: li.productUrl,
          productSource: li.productSource,
          imageUrl: li.imageUrl,
          sortOrder: i,
        })),
        _savedAt: timestamp,
      });

      if (!isActiveRef.current) return;

      // Check if a newer payload arrived while we were saving
      if (pendingPayloadRef.current && inflightTimestampRef.current === timestamp) {
        const nextPayload = pendingPayloadRef.current;
        pendingPayloadRef.current = null;
        isSavingRef.current = false;
        // Save the newer version
        executeSave(nextPayload);
        return;
      }

      setIsDirty(false);
      setStatus("saved");
      // Clear "Saved" after a few seconds
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => {
        if (isActiveRef.current) setStatus("idle");
      }, SAVED_DISPLAY_MS);

      // Silently invalidate the query cache so the view mode shows fresh data
      utils.estimates.get.invalidate({ id: payload.id });
      utils.estimates.list.invalidate();
    } catch (err: any) {
      if (!isActiveRef.current) return;
      setStatus("error");
      setLastError(err.message ?? "Save failed");
      // Keep isDirty true so the user knows data wasn't saved
    } finally {
      isSavingRef.current = false;
    }
  }, [saveAll, utils]);

  const triggerSave = useCallback((payload: AutosavePayload) => {
    pendingPayloadRef.current = payload;
    setIsDirty(true);

    // Reset debounce timer
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      const p = pendingPayloadRef.current;
      if (p) {
        pendingPayloadRef.current = null;
        executeSave(p);
      }
    }, DEBOUNCE_MS);
  }, [executeSave]);

  const forceSave = useCallback(() => {
    // Cancel debounce and save immediately
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    const p = pendingPayloadRef.current;
    if (p) {
      pendingPayloadRef.current = null;
      executeSave(p);
    }
  }, [executeSave]);

  /** Immediate save that returns a Promise — use for Done Editing */
  const forceSaveAsync = useCallback(async (): Promise<boolean> => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    const p = pendingPayloadRef.current;
    if (!p) return true; // nothing to save
    pendingPayloadRef.current = null;
    try {
      // Direct mutateAsync call instead of going through executeSave
      // so we can await and return success/failure
      isSavingRef.current = true;
      const timestamp = Date.now();
      inflightTimestampRef.current = timestamp;
      if (isActiveRef.current) {
        setStatus("saving");
        setLastError(null);
      }
      await saveAll.mutateAsync({
        id: p.id,
        title: p.title,
        notes: p.notes,
        depositPercent: p.depositPercent,
        hidePrices: p.hidePrices,
        lineItems: p.lineItems.map((li, i) => ({
          id: li.id,
          task: li.task,
          description: li.description,
          category: li.category,
          quantity: li.quantity,
          unit: li.unit,
          unitCost: li.unitCost || "0",
          markupPercent: li.markupPercent,
          showMarkup: li.showMarkup,
          productUrl: li.productUrl,
          productSource: li.productSource,
          imageUrl: li.imageUrl,
          sortOrder: i,
        })),
        _savedAt: timestamp,
      });
      if (isActiveRef.current) {
        setIsDirty(false);
        setStatus("saved");
        utils.estimates.get.invalidate({ id: p.id });
        utils.estimates.list.invalidate();
      }
      return true;
    } catch (err: any) {
      if (isActiveRef.current) {
        setStatus("error");
        setLastError(err.message ?? "Save failed");
      }
      return false;
    } finally {
      isSavingRef.current = false;
    }
  }, [saveAll, utils]);

  const reset = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    pendingPayloadRef.current = null;
    setIsDirty(false);
    setStatus("idle");
    setLastError(null);
  }, []);

  return { triggerSave, forceSave, forceSaveAsync, reset, status, lastError, isDirty };
}
