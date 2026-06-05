import { useCallback, useRef, useEffect } from "react";

/**
 * useUndoRedo – manages an undo/redo history stack for any serializable state.
 *
 * Design decisions:
 * - History is stored as JSON strings to avoid reference-equality issues with arrays/objects.
 * - Max stack size prevents unbounded memory growth during long editing sessions.
 * - The hook does NOT own the state — it only records snapshots and returns previous ones.
 *   The consumer (Proposals.tsx) calls `record(state)` after every mutation and uses
 *   `undo()`/`redo()` to get the previous/next snapshot, then applies it via `setEditItems`.
 * - Keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z) are bound at the document level and scoped
 *   to an `enabled` flag so they only fire while the proposal editor is in edit mode.
 */

const MAX_HISTORY = 50;

export interface UndoRedoHandle<T> {
  /** Record a new state snapshot (call after every user mutation) */
  record: (state: T) => void;
  /** Undo: returns the previous state, or null if at the beginning */
  undo: () => T | null;
  /** Redo: returns the next state, or null if at the end */
  redo: () => T | null;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Reset history (call when entering/exiting edit mode) */
  reset: (initialState?: T) => void;
}

export function useUndoRedo<T>(opts?: { enabled?: boolean }): UndoRedoHandle<T> {
  const enabled = opts?.enabled ?? true;

  // History stack as JSON strings
  const historyRef = useRef<string[]>([]);
  // Current position in the history stack (-1 means empty)
  const posRef = useRef(-1);
  // Flag to distinguish undo/redo-triggered updates from user edits
  const isUndoRedoRef = useRef(false);

  const record = useCallback((state: T) => {
    // If this update was triggered by an undo/redo, don't record it
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }

    const json = JSON.stringify(state);
    const history = historyRef.current;
    const pos = posRef.current;

    // Don't record if identical to current position
    if (pos >= 0 && history[pos] === json) return;

    // Truncate any redo history beyond current position
    historyRef.current = history.slice(0, pos + 1);
    historyRef.current.push(json);

    // Enforce max size
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current = historyRef.current.slice(-MAX_HISTORY);
    }

    posRef.current = historyRef.current.length - 1;
  }, []);

  const undo = useCallback((): T | null => {
    if (posRef.current <= 0) return null;
    posRef.current -= 1;
    isUndoRedoRef.current = true;
    return JSON.parse(historyRef.current[posRef.current]);
  }, []);

  const redo = useCallback((): T | null => {
    if (posRef.current >= historyRef.current.length - 1) return null;
    posRef.current += 1;
    isUndoRedoRef.current = true;
    return JSON.parse(historyRef.current[posRef.current]);
  }, []);

  const reset = useCallback((initialState?: T) => {
    if (initialState !== undefined) {
      const json = JSON.stringify(initialState);
      historyRef.current = [json];
      posRef.current = 0;
    } else {
      historyRef.current = [];
      posRef.current = -1;
    }
    isUndoRedoRef.current = false;
  }, []);

  // Expose canUndo/canRedo as getters (computed from refs, so they're always fresh)
  const canUndo = posRef.current > 0;
  const canRedo = posRef.current < historyRef.current.length - 1;

  return { record, undo, redo, canUndo, canRedo, reset };
}

/**
 * useUndoRedoKeyboard – binds Ctrl+Z / Ctrl+Shift+Z keyboard shortcuts.
 * Separated from the hook so the consumer can control when shortcuts are active.
 */
export function useUndoRedoKeyboard(opts: {
  enabled: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const { enabled, onUndo, onRedo } = opts;
  const onUndoRef = useRef(onUndo);
  const onRedoRef = useRef(onRedo);
  onUndoRef.current = onUndo;
  onRedoRef.current = onRedo;

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // Don't intercept if user is typing in an input/textarea (unless it's the proposal editor)
      const tag = (e.target as HTMLElement)?.tagName;
      // We allow undo/redo even in inputs since the proposal editor uses inputs for line items

      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        onUndoRef.current();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        onRedoRef.current();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
