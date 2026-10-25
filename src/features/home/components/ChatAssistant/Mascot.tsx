"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { cx } from "@/lib/cx";
import styles from "./Mascot.module.css";

export type MascotMood = "idle" | "thinking" | "happy" | "listening";

/** Playful moves played now and then on top of the idle motion, with their durations. */
const ACTIONS = { hop: 900, wiggle: 800, lookLeft: 1600, lookRight: 1600, spin: 1100, stretch: 1300, doubleHop: 1300 } as const;
type MascotAction = keyof typeof ACTIONS;
const ACTION_NAMES = Object.keys(ACTIONS) as MascotAction[];

interface MascotProps {
  size: number;
  mood?: MascotMood;
  /** Tilts toward the pointer in 3D. */
  followPointer?: boolean;
  className?: string;
}

const MAX_TILT_DEG = 14;

/**
 * The Tentact mascot, alive: it breathes, bobs and sways, blinks, its star
 * glints, it leans toward the pointer in 3D, and every few seconds it plays a
 * move (hop, wiggle, a look around, a spin, a stretch).
 * Layers sit on the artwork's own features (eyes and star are measured on
 * /assets/mascot/tentact-mascot.png). Motion stops for prefers-reduced-motion.
 */
export function Mascot({ size, mood = "idle", followPointer = false, className }: MascotProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const gradientId = `mascot-star-${useId().replace(/:/g, "")}`;
  const [action, setAction] = useState<MascotAction | null>(null);

  // Every few seconds (while idle), play a random move so the mascot always feels alive.
  useEffect(() => {
    if (mood !== "idle" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer = 0;
    let last: MascotAction | null = null;
    const schedule = (delay: number) => {
      timer = window.setTimeout(() => {
        const choices = ACTION_NAMES.filter((name) => name !== last && (name !== "spin" || Math.random() < 0.35));
        const next = choices[Math.floor(Math.random() * choices.length)];
        last = next;
        setAction(next);
        timer = window.setTimeout(() => {
          setAction(null);
          schedule(2600 + Math.random() * 3400);
        }, ACTIONS[next]);
      }, delay);
    };
    schedule(1200 + Math.random() * 1800);
    return () => window.clearTimeout(timer);
  }, [mood]);

  useEffect(() => {
    const root = rootRef.current;
    if (!followPointer || !root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    const onMove = (event: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      const dx = (event.clientX - (rect.left + rect.width / 2)) / window.innerWidth;
      const dy = (event.clientY - (rect.top + rect.height / 2)) / window.innerHeight;
      target = { x: Math.max(-1, Math.min(1, dx * 2.2)), y: Math.max(-1, Math.min(1, dy * 2.2)) };
    };
    const tick = () => {
      // Critically damped easing toward the pointer for a smooth, weighty lean.
      current.x += (target.x - current.x) * 0.08;
      current.y += (target.y - current.y) * 0.08;
      root.style.setProperty("--tilt-y", `${(current.x * MAX_TILT_DEG).toFixed(2)}deg`);
      root.style.setProperty("--tilt-x", `${(-current.y * MAX_TILT_DEG).toFixed(2)}deg`);
      root.style.setProperty("--shine-x", `${(50 + current.x * 30).toFixed(1)}%`);
      frame = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    frame = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [followPointer]);

  return (
    <div ref={rootRef} className={cx(styles.root, styles[mood], className)} style={{ "--size": `${size}px` } as CSSProperties} aria-hidden="true">
      <div className={styles.shadow} />
      <div className={styles.tilt}>
        <div className={cx(styles.act, action && styles[action])}>
          <div className={styles.body}>
            <Image className={styles.art} src="/assets/mascot/tentact-mascot.png" alt="" width={512} height={512} draggable={false} priority={false} />
            <span className={cx(styles.lid, styles.lidLeft)} />
            <span className={cx(styles.lid, styles.lidRight)} />
            <svg className={styles.star} viewBox="0 0 100 100">
              <defs>
                <radialGradient id={gradientId} cx="50%" cy="45%" r="60%">
                  <stop offset="0%" stopColor="#fffbe6" />
                  <stop offset="45%" stopColor="#ffd84a" />
                  <stop offset="100%" stopColor="#ff4a1c" />
                </radialGradient>
              </defs>
              <path d="M50 0 C54 34 66 46 100 50 C66 54 54 66 50 100 C46 66 34 54 0 50 C34 46 46 34 50 0Z" fill={`url(#${gradientId})`} />
            </svg>
            <span className={styles.shine} />
          </div>
        </div>
      </div>
      <span className={cx(styles.spark, styles.spark1)} />
      <span className={cx(styles.spark, styles.spark2)} />
      <span className={cx(styles.spark, styles.spark3)} />
    </div>
  );
}
