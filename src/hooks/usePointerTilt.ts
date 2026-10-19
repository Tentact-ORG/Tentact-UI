"use client";

import { useEffect, type RefObject } from "react";
import { animate } from "motion";
import { Disposer } from "@/lib/disposer";

interface TiltOptions {
  /** Maximum rotation (degrees) around each axis at the container's edges. */
  maxRotateX: number;
  maxRotateY: number;
  hoverScale: number;
}

/** Tilts `target` in 3D towards the pointer while it moves over `container`. */
export function usePointerTilt(
  containerRef: RefObject<HTMLElement | null>,
  targetRef: RefObject<HTMLElement | null>,
  { maxRotateX, maxRotateY, hoverScale }: TiltOptions,
): void {
  useEffect(() => {
    const container = containerRef.current;
    const target = targetRef.current;
    if (!container || !target) return;

    const disposer = new Disposer();

    disposer.listen(container, "pointermove", (event) => {
      const rect = container.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      animate(
        target,
        { rotateY: x * maxRotateY, rotateX: -y * maxRotateX, scale: hoverScale },
        { type: "spring", stiffness: 180, damping: 18 },
      );
    });

    disposer.listen(container, "pointerleave", () => {
      animate(target, { rotateY: 0, rotateX: 0, scale: 1 }, { type: "spring", stiffness: 120, damping: 14 });
    });

    return () => disposer.dispose();
  }, [containerRef, targetRef, maxRotateX, maxRotateY, hoverScale]);
}
