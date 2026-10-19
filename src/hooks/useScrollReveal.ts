"use client";

import { useEffect, type RefObject } from "react";
import { animate } from "motion";
import { prefersReducedMotion } from "@/lib/environment";
import { SPRING } from "@/lib/motion";
import { observeOnce } from "@/lib/observers";

const REVEAL_THRESHOLD = 0.2;
const REVEAL_OFFSET_PX = 40;

/** Fades and lifts an element into place the first time it scrolls into view. */
export function useScrollReveal(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current;
    if (!element || prefersReducedMotion()) return;

    element.style.opacity = "0";
    const stopObserving = observeOnce(
      element,
      (target) => animate(target, { opacity: [0, 1], y: [REVEAL_OFFSET_PX, 0] }, SPRING),
      REVEAL_THRESHOLD,
    );
    return stopObserving;
  }, [ref]);
}
