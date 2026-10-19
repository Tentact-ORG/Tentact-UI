import type { Point } from "./math";
import type { Disposer } from "./disposer";

/** Pointer smoothing factor per frame — lower is lazier. */
const POINTER_EASING = 0.05;

export interface ParallaxPointer {
  /** Eased pointer position, each axis in the range -0.5 … 0.5 (0 = viewport centre). */
  readonly smoothed: Point;
  /** Moves `smoothed` one step towards the latest raw pointer position. Call once per frame. */
  step(): void;
}

/**
 * Tracks the pointer relative to the viewport centre and exposes an eased copy
 * of it for parallax effects. The listener is registered on `disposer`.
 */
export function createParallaxPointer(disposer: Disposer): ParallaxPointer {
  const raw: Point = { x: 0, y: 0 };
  const smoothed: Point = { x: 0, y: 0 };

  disposer.listen(window, "pointermove", (event) => {
    raw.x = event.clientX / window.innerWidth - 0.5;
    raw.y = event.clientY / window.innerHeight - 0.5;
  });

  return {
    smoothed,
    step() {
      smoothed.x += (raw.x - smoothed.x) * POINTER_EASING;
      smoothed.y += (raw.y - smoothed.y) * POINTER_EASING;
    },
  };
}
