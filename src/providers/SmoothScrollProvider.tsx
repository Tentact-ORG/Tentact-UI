"use client";

import { useEffect, type ReactNode } from "react";
import Lenis from "lenis";
import { startAnimationLoop } from "@/lib/animation-loop";
import { Disposer } from "@/lib/disposer";
import { prefersReducedMotion } from "@/lib/environment";

/** Lower is smoother/slower; matches the original site's feel. */
const LENIS_LERP = 0.085;

function createLenis(disposer: Disposer): Lenis | null {
  if (prefersReducedMotion()) return null;

  const lenis = new Lenis({ lerp: LENIS_LERP });
  disposer.add(startAnimationLoop((time) => lenis.raf(time)));
  disposer.add(() => lenis.destroy());
  return lenis;
}

function findInPageTarget(event: MouseEvent): HTMLElement | null {
  const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
  const hash = anchor?.getAttribute("href");
  if (!hash || hash.length < 2) return null;
  return document.querySelector<HTMLElement>(hash);
}

/**
 * Enables inertial smooth scrolling for the page and routes every in-page
 * anchor link (`href="#section"`) through it.
 */
export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const disposer = new Disposer();
    const lenis = createLenis(disposer);

    disposer.listen(window, "click", (event) => {
      const target = findInPageTarget(event);
      if (!target) return;

      event.preventDefault();
      if (lenis) lenis.scrollTo(target);
      else target.scrollIntoView({ behavior: "smooth" });
    });

    return () => disposer.dispose();
  }, []);

  return children;
}
