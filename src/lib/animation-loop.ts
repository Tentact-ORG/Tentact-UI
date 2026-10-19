import type { Cleanup } from "./disposer";

/** Longest frame step we simulate, so a backgrounded tab doesn't make things jump on return. */
const MAX_DELTA_SECONDS = 0.05;

export type FrameCallback = (time: number, deltaSeconds: number) => void;

/**
 * Runs `onFrame` on every animation frame until the returned cleanup is called.
 * `deltaSeconds` lets loops animate by time rather than by frame, so motion runs
 * at the same speed on 60 Hz and 120 Hz screens.
 */
export function startAnimationLoop(onFrame: FrameCallback): Cleanup {
  let frameId = 0;
  let lastTime = 0;

  const tick = (time: number) => {
    frameId = requestAnimationFrame(tick);
    const deltaSeconds = Math.min(MAX_DELTA_SECONDS, (time - lastTime) / 1000);
    lastTime = time;
    onFrame(time, deltaSeconds);
  };

  frameId = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frameId);
}
