'use client';

import { useEffect, useState } from 'react';

/**
 * Single source of truth for media queries that both animation systems read.
 * GSAP timelines and Framer Motion transitions must agree on reduced motion,
 * so neither is allowed its own copy of this check.
 */
export function useMediaQuery(query: string): boolean {
  // Starts false so the server render and the first client render agree.
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const list = window.matchMedia(query);
    setMatches(list.matches);

    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** True when the visitor has asked the operating system for less motion. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/**
 * True below the large breakpoint, where the split screen becomes a stacked
 * layout and the pin popover becomes a sheet rather than a floating card.
 */
export function useIsCompact(): boolean {
  return useMediaQuery('(max-width: 1023px)');
}
