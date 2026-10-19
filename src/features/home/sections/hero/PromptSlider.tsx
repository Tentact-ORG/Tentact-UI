"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@/lib/cx";
import styles from "./PromptSlider.module.css";

const FADE_MS = 300;
const AUTO_ADVANCE_MS = 4500;

interface PromptSliderProps {
  queries: readonly string[];
}

function formatPosition(index: number, total: number): string {
  return `0${index + 1} / 0${total}`;
}

/** Cycles through example searches, automatically and via the ‹ › buttons. */
export function PromptSlider({ queries }: PromptSliderProps) {
  const [index, setIndex] = useState(0);
  const [isFading, setFading] = useState(false);
  const pendingSwap = useRef<number | undefined>(undefined);

  const step = useCallback(
    (delta: number) => {
      setFading(true);
      window.clearTimeout(pendingSwap.current);
      pendingSwap.current = window.setTimeout(() => {
        setIndex((current) => (current + delta + queries.length) % queries.length);
        setFading(false);
      }, FADE_MS);
    },
    [queries.length],
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => step(1), AUTO_ADVANCE_MS);
    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(pendingSwap.current);
    };
  }, [step]);

  return (
    <div className={styles.slider}>
      <div className={styles.arrows}>
        <button type="button" aria-label="Previous example" onClick={() => step(-1)}>
          ‹
        </button>
        <button type="button" aria-label="Next example" onClick={() => step(1)}>
          ›
        </button>
      </div>
      <span className={styles.index}>{formatPosition(index, queries.length)}</span>
      <span className={cx(styles.query, isFading && styles.fading)}>“{queries[index]}”</span>
    </div>
  );
}
