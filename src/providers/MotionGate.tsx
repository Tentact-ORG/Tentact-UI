"use client";

import { useEffect, type ReactNode } from "react";

/**
 * Releases the `pre` guard set in the root layout. Because parent effects run
 * after their children's, every section below has already put its elements in
 * their starting (hidden) state by the time the guard is lifted.
 */
export function MotionGate({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.remove("pre");
  }, []);

  return children;
}
