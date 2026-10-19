"use client";

import { useRef, type ElementType, type HTMLAttributes } from "react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

type RevealTag = "div" | "p" | "span" | "h2";

interface RevealProps extends HTMLAttributes<HTMLElement> {
  /** The element to render. Defaults to `div`. */
  as?: RevealTag;
}

/**
 * Renders an element that fades up into view the first time it is scrolled to.
 * `data-rv` keeps it hidden from first paint until the reveal script takes over.
 */
export function Reveal({ as = "div", ...rest }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  useScrollReveal(ref);

  const Tag = as as ElementType;
  return <Tag ref={ref} data-rv="" {...rest} />;
}
