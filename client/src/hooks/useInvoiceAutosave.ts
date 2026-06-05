import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";

export type InvoiceAutosaveStatus = "idle" | "saving" | "saved" | "error";

export interface InvoiceAutosavePayload {
  id?: number;                // undefined = create new, number = update existing
  amount?: string;
  invoiceType?: "deposit" | "progress" | "final" | "change_order" | "other";
  dueDate?: string;
  notes?: string;
  // Only used when creating a new invoice:
  projectId?: number;
  clientId?: number;
  leadId?: number;
}

const DEBOUNCE_MS = 1500;
const SAVED_DISPLAY_MS = 3000;

/**
 * Debounced autosave hook for the invoice editor (create + edit).
 *
 * Returns:
 *  - triggerSave(payload) — call on every meaningful edit
 *  - forceSave()          — immediate save (for manual Save Changes button)
 *  - status               — "idle" | "saving" | "saved" | "error"
 *  - lastError            — error message if status === "error"
 *  - isDirty              — true if there are unsaved changes
 *  - createdId            — the ID assigned after first autosave of a new invoice
 *  - reset()              — clear all state (call when closing the form)
 */
export function useInvoiceAutosave() {
  const [status, setStatus] = useState<InvoiceAutosaveStatus>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [createdId, setCreatedId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const saveDraft = trpc.invoices.saveDraft.useMutation();

  // Refs to avoid stale closures
  const pendingPayloadRef = useRef<InvoiceAutosavePayload | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightTimestampRef = useRef<number>(0);
  const isSavingRef = useRef(false);
  const isActiveRef = useRef(true);
  const createdIdRef = useRef<number | null>(null);

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
        e.returnValue = "You have unsaved invoice changes.";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const executeSave = useCallback(async (payload: InvoiceAutosavePayload) => {
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
      // If we already created the invoice in a previous autosave, use that ID
      const effectiveId = payload.id ?? createdIdRef.current ?? undefined;

      const result = await saveDraft.mutateAsync({
        ...payload,
        id: effectiveId,
        _savedAt: timestamp,
      });

      if (!isActiveRef.current) return;

      // If this was a create, store the new ID for subsequent saves
      if (result.created && result.id) {
        createdIdRef.current = result.id;
        setCreatedId(result.id);
      }

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

      // Silently invalidate the query cache so the list shows fresh data
      utils.invoices.list.invalidate();
    } catch (err: any) {
      if (!isActiveRef.current) return;
      setStatus("error");
      setLastError(err.message ?? "Save failed");
      // Keep isDirty true so the user knows data wasn't saved
    } finally {
      isSavingRef.current = false;
    }
  }, [saveDraft, utils]);

  const triggerSave = useCallback((payload: InvoiceAutosavePayload) => {
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

  const reset = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    pendingPayloadRef.current = null;
    createdIdRef.current = null;
    setCreatedId(null);
    setIsDirty(false);
    setStatus("idle");
    setLastError(null);
  }, []);

  return { triggerSave, forceSave, reset, status, lastError, isDirty, createdId };
}
