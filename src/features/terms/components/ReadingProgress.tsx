"use client";

import { useRef } from "react";
import { useWindowScroll } from "@/hooks/useWindowScroll";
import styles from "../TermsPage.module.css";

/** A thin bar across the top of the page that fills as the reader scrolls. */
export function ReadingProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useWindowScroll(() => {
    const bar = barRef.current;
    if (!bar) return;

    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollable > 0 ? window.scrollY / scrollable : 0;
    bar.style.transform = `scaleX(${progress})`;
  });

  return <div ref={barRef} className={styles.progress} />;
}
