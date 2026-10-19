"use client";

import { useEffect, useRef, useState, type CSSProperties, type ElementType, type HTMLAttributes } from "react";
import { cx } from "@/lib/cx";
import { observeOnce } from "@/lib/observers";
import styles from "../TermsPage.module.css";

const REVEAL_THRESHOLD = 0.15;

interface RevealOnScrollProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "section";
  /** Transition delay, used to stagger neighbouring cards. */
  delayMs?: number;
}

/** Fades and lifts its content in (via CSS transition) the first time it scrolls into view. */
export function RevealOnScroll({ as = "div", delayMs = 0, className, style, ...rest }: RevealOnScrollProps) {
  const ref = useRef<HTMLElement>(null);
  const [isRevealed, setRevealed] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return observeOnce(element, () => setRevealed(true), REVEAL_THRESHOLD);
  }, []);

  const Tag = as as ElementType;
  const combinedStyle: CSSProperties = { ...style, transitionDelay: `${delayMs}ms` };

  return (
    <Tag
      ref={ref}
      className={cx(styles.reveal, isRevealed && styles.revealed, className)}
      style={combinedStyle}
      {...rest}
    />
  );
}
