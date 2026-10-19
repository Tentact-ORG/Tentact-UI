import { animate, type AnimationPlaybackControls } from "motion";

/** The house spring used by every entrance animation on the landing page. */
export const SPRING = { type: "spring", stiffness: 90, damping: 18, mass: 1 } as const;

/** Custom ease shared by counters and image reveals. */
export const EASE_OUT: [number, number, number, number] = [0.2, 0.7, 0.2, 1];

interface SpringOverrides {
  stiffness?: number;
  damping?: number;
  mass?: number;
  delay?: number;
}

/**
 * Springs a plain number from `from` to `to`, reporting each frame through `onUpdate`.
 * Used to drive progress values (0 → 1) that render loops read on every frame.
 */
export function springValue(
  from: number,
  to: number,
  onUpdate: (value: number) => void,
  overrides: SpringOverrides = {},
): AnimationPlaybackControls {
  return animate(from, to, { ...SPRING, ...overrides, onUpdate });
}

/** Tweens a plain number with a duration-based ease (used for price and buyer counters). */
export function tweenValue(
  from: number,
  to: number,
  onUpdate: (value: number) => void,
  options: { duration: number; delay?: number },
): AnimationPlaybackControls {
  return animate(from, to, { ease: EASE_OUT, ...options, onUpdate });
}
