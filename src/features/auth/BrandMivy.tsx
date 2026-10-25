"use client";

import { useEffect, useRef, useState } from "react";
import { MivyCharacter } from "@/features/home/components/ChatAssistant/MivyCharacter";
import { GREETING_MS } from "@/features/home/components/ChatAssistant/mivyGreeting";
import styles from "./BrandPanel.module.css";

const FIRST_WAVE_MS = 1100;

/**
 * Mivy standing in the middle of the sign-in artwork: says hi shortly after
 * the page opens, again when the pointer comes over it, and every so often
 * while the visitor fills in the form.
 */
export function BrandMivy() {
  const boxRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [waveKey, setWaveKey] = useState(0);
  const lastWave = useRef(-Infinity);

  const wave = () => {
    const now = performance.now();
    if (now - lastWave.current < GREETING_MS + 400) return;
    lastWave.current = now;
    setWaveKey((key) => key + 1);
  };

  // Mivy is sized in pixels; follow the panel as it resizes.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(() => setHeight(Math.round(box.clientHeight)));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let timer = window.setTimeout(function next() {
      wave();
      timer = window.setTimeout(next, 14_000 + Math.random() * 10_000);
    }, FIRST_WAVE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div ref={boxRef} className={styles.mivy} onPointerEnter={wave}>
      <span className={styles.ground} aria-hidden="true" />
      {height > 0 && <MivyCharacter height={height} waveKey={waveKey} className={styles.mivyCharacter} />}
    </div>
  );
}
