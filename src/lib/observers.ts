import type { Cleanup } from "./disposer";

export interface VisibilityTracker {
  /** True while any part of the element is inside the viewport. */
  readonly isVisible: boolean;
  disconnect: Cleanup;
}

/**
 * Tracks whether an element is on screen. Render loops check this every frame
 * and skip their work while their section is scrolled out of view.
 */
export function trackVisibility(element: Element): VisibilityTracker {
  let isVisible = false;
  const observer = new IntersectionObserver(([entry]) => {
    isVisible = entry.isIntersecting;
  });
  observer.observe(element);

  return {
    get isVisible() {
      return isVisible;
    },
    disconnect: () => observer.disconnect(),
  };
}

/**
 * Calls `onEnter` the first time each target crosses `threshold` (fraction of
 * the element visible), then stops watching that target.
 */
export function observeOnce<T extends Element>(
  targets: T | readonly T[],
  onEnter: (target: T) => void,
  threshold = 0.25,
): Cleanup {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        onEnter(entry.target as T);
      }
    },
    { threshold },
  );

  const list: readonly T[] = Array.isArray(targets) ? targets : [targets as T];
  list.forEach((target) => observer.observe(target));
  return () => observer.disconnect();
}
