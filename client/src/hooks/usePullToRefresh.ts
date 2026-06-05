/**
 * usePullToRefresh
 *
 * Attaches a touch-based pull-to-refresh gesture to a scrollable container.
 * Only activates on mobile (touch devices) and only when the container is
 * scrolled to the top.
 *
 * Usage:
 *   const { containerRef, isRefreshing } = usePullToRefresh(async () => {
 *     await utils.someQuery.invalidate();
 *   });
 *   return <div ref={containerRef}>…</div>;
 */
import { useRef, useState, useCallback, useEffect } from "react";

const THRESHOLD = 72;   // px of pull needed to trigger refresh
const MAX_PULL  = 100;  // px cap on visual indicator

export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startY       = useRef(0);
  const pulling      = useRef(false);
  const [pullY,        setPullY]        = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const el = containerRef.current;
    if (!el) return;
    // Only activate when scrolled to the very top
    if (el.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
    pulling.current = true;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!pulling.current) return;
    const dy = Math.max(0, e.touches[0].clientY - startY.current);
    // Apply resistance: feels like pulling against a spring
    const visual = Math.min(MAX_PULL, dy * 0.5);
    setPullY(visual);
    if (dy > 0) e.preventDefault(); // prevent browser's native pull-to-refresh
  }, []);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;
    if (pullY >= THRESHOLD * 0.5) {
      setIsRefreshing(true);
      setPullY(0);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    } else {
      setPullY(0);
    }
  }, [pullY, onRefresh]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("touchstart",  handleTouchStart, { passive: true });
    el.addEventListener("touchmove",   handleTouchMove,  { passive: false });
    el.addEventListener("touchend",    handleTouchEnd,   { passive: true });
    el.addEventListener("touchcancel", handleTouchEnd,   { passive: true });
    return () => {
      el.removeEventListener("touchstart",  handleTouchStart);
      el.removeEventListener("touchmove",   handleTouchMove);
      el.removeEventListener("touchend",    handleTouchEnd);
      el.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { containerRef, pullY, isRefreshing };
}
