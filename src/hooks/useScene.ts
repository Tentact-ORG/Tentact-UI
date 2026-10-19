"use client";

import { useEffect, type DependencyList } from "react";
import type { Cleanup } from "@/lib/disposer";

/**
 * Mounts an imperative animation scene after the component's DOM exists and
 * tears it down on unmount. The factory returns the scene's cleanup function.
 */
export function useScene(createScene: () => Cleanup | undefined, deps: DependencyList = []): void {
  useEffect(() => {
    const cleanup = createScene();
    return cleanup;
    // The scene factory is intentionally re-run only when `deps` change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
