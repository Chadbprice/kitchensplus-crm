import * as React from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * Returns true when the viewport is narrower than 768px.
 * Initialises synchronously from window.innerWidth to avoid a
 * desktop→mobile flash on first render in SSR-free environments.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(
    () => typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    // Sync once in case the window resized between render and effect
    setIsMobile(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
