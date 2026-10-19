"use client";

import { useRef, type ReactNode } from "react";
import { useFitToViewport } from "@/hooks/useFitToViewport";
import { cx } from "@/lib/cx";

type FitOrigin = "center" | "top" | "bottom";

interface FitFrameProps {
  id: string;
  className?: string;
  /** Where the content is anchored when it has to be scaled down to fit. */
  origin?: FitOrigin;
  children: ReactNode;
}

/** A full-screen section whose content is scaled to fit the viewport on desktop. */
export function FitFrame({ id, className, origin = "center", children }: FitFrameProps) {
  const frameRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useFitToViewport(frameRef, contentRef);

  return (
    <section ref={frameRef} id={id} className={cx("frame", className)} data-fit-origin={origin}>
      <div ref={contentRef} className="fit-in">
        {children}
      </div>
    </section>
  );
}
