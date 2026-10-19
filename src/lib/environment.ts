/** Breakpoint below which sections switch to their stacked, mobile layout. */
export const MOBILE_BREAKPOINT = 760;

/** Breakpoint below which the "one section = one screen" framing is turned off. */
export const FRAME_BREAKPOINT = 861;

/**
 * Reads the user's reduced-motion preference. Only call this inside effects or
 * event handlers — it touches `window` and is therefore unavailable during SSR.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Runs `callback` once web fonts have loaded, since text metrics change when they swap in. */
export function onFontsReady(callback: () => void): void {
  document.fonts?.ready.then(callback);
}
