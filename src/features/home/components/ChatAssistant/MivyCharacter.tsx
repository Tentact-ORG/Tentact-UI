"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/cx";
import styles from "./MivyCharacter.module.css";

interface MivyCharacterProps {
  /** Rendered height in px; the width follows the artwork (474×600). */
  height: number;
  /** Change this value to make Mivy wave (e.g. on arrival or hover). */
  waveKey?: number;
  className?: string;
}

const LAYER_W = 474;
const LAYER_H = 600;
const WAVE_MS = 3200;

/**
 * Mivy, the chat assistant. The character is split into layers (body, the
 * waving arm in two segments, two feet) so it can move like a character:
 * the pupils glance around and follow the pointer, the eyes blink, the feet
 * take little steps with a body bob, it breathes, and it waves when
 * `waveKey` changes. Everything stops for prefers-reduced-motion.
 */
export function MivyCharacter({ height, waveKey, className }: MivyCharacterProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const [waving, setWaving] = useState(false);
  const [stepping, setStepping] = useState(false);
  const wavingRef = useRef(false);
  useEffect(() => {
    wavingRef.current = waving;
  }, [waving]);
  const width = Math.round((height * LAYER_W) / LAYER_H);

  // Wave whenever the caller asks.
  useEffect(() => {
    if (waveKey === undefined || waveKey === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = window.setTimeout(() => setWaving(true), 0);
    const stop = window.setTimeout(() => setWaving(false), WAVE_MS);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(stop);
    };
  }, [waveKey]);

  // A little step on the spot every few seconds.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          // Don't step mid-wave; the bob would jolt the raised arm.
          if (wavingRef.current) return schedule();
          setStepping(true);
          timer = window.setTimeout(() => {
            setStepping(false);
            schedule();
          }, 1000);
        },
        2500 + Math.random() * 3500,
      );
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);

  // Eyes: follow the pointer when it moves, otherwise glance around; blink at irregular intervals.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let look = 0;
    let lookY = 0;
    let target = 0;
    let targetY = 0;
    let lastPointer = -Infinity;
    let nextGlance = 0;
    let nextBlink = performance.now() + 1800;
    let blinkStart = -1;

    const onPointer = (event: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height * 0.27);
      target = Math.max(-1, Math.min(1, dx / 260));
      targetY = Math.max(-1, Math.min(1, dy / 260));
      lastPointer = performance.now();
    };

    const tick = (now: number) => {
      if (now - lastPointer > 2500 && now > nextGlance) {
        const glances = [-1, -0.6, 0, 0, 0.6, 1];
        target = glances[Math.floor(Math.random() * glances.length)];
        targetY = Math.random() < 0.3 ? 0.6 : 0;
        nextGlance = now + 1400 + Math.random() * 2600;
      }
      look += (target - look) * 0.14;
      lookY += (targetY - lookY) * 0.14;
      root.style.setProperty("--look-x", look.toFixed(3));
      root.style.setProperty("--look-y", Math.max(0, lookY).toFixed(3));

      if (blinkStart < 0 && now > nextBlink) blinkStart = now;
      let lid = 0;
      if (blinkStart >= 0) {
        const t = (now - blinkStart) / 170;
        lid = t < 1 ? Math.sin(t * Math.PI) : 0;
        if (t >= 1) {
          blinkStart = -1;
          nextBlink = now + (Math.random() < 0.2 ? 220 : 2200 + Math.random() * 3200);
        }
      }
      root.style.setProperty("--lid", lid.toFixed(3));
      frame = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    frame = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onPointer);
      cancelAnimationFrame(frame);
    };
  }, []);

  const layer = (name: string, className: string) => (
    <Image className={cx(styles.layer, className)} src={`/assets/mivy/mivy-${name}.png`} alt="" width={LAYER_W} height={LAYER_H} sizes={`${width}px`} loading="eager" draggable={false} />
  );

  return (
    <span ref={rootRef} className={cx(styles.root, waving && styles.waving, stepping && styles.stepping, className)} style={{ width, height }} aria-hidden="true">
      {layer("foot-left", styles.footLeft)}
      {layer("foot-right", styles.footRight)}
      <span className={styles.bob}>
        <span className={styles.body}>
          {/* "-v2": renamed when repainted, so cached copies of the old art aren't reused. */}
          {layer("body-v2", "")}
          <span className={cx(styles.eye, styles.eyeLeft)}>
            <span className={styles.pupil} />
          </span>
          <span className={cx(styles.eye, styles.eyeRight)}>
            <span className={styles.pupil} />
          </span>
          <span className={cx(styles.lid, styles.lidLeft)} />
          <span className={cx(styles.lid, styles.lidRight)} />
          <span className={styles.upperArm}>
            {layer("arm-upper", "")}
            <span className={styles.forearm}>{layer("arm-fore", "")}</span>
          </span>
        </span>
      </span>
    </span>
  );
}
