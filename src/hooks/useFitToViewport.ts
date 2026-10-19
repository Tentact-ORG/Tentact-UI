"use client";

import { useEffect, type RefObject } from "react";
import { Disposer } from "@/lib/disposer";
import { FRAME_BREAKPOINT, onFontsReady } from "@/lib/environment";

/**
 * Scales a frame's content down (never up) so the whole section fits on one
 * screen on desktop. Re-fits on resize and whenever the content changes size —
 * e.g. the map draws late, images load or fonts swap in.
 */
export function useFitToViewport(
  frameRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const frame = frameRef.current;
    const content = contentRef.current;
    if (!frame || !content) return;

    const disposer = new Disposer();

    const fit = () => {
      content.style.transform = "none";
      if (window.innerWidth < FRAME_BREAKPOINT) return;

      const frameStyle = getComputedStyle(frame);
      const availableHeight =
        frame.clientHeight - parseFloat(frameStyle.paddingTop) - parseFloat(frameStyle.paddingBottom);
      const scale = Math.min(1, availableHeight / content.offsetHeight);
      if (scale < 1) content.style.transform = `scale(${scale})`;
    };

    let fitQueued = false;
    const queueFit = () => {
      if (fitQueued) return;
      fitQueued = true;
      requestAnimationFrame(() => {
        fitQueued = false;
        fit();
      });
    };

    const resizeObserver = new ResizeObserver(queueFit);
    resizeObserver.observe(content);
    disposer.add(() => resizeObserver.disconnect());
    disposer.listen(window, "resize", fit);
    disposer.listen(window, "load", fit);
    onFontsReady(fit);
    fit();

    return () => disposer.dispose();
  }, [frameRef, contentRef]);
}
