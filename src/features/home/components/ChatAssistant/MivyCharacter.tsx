"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/cx";
import styles from "./MivyCharacter.module.css";
import { drawArm, GREETING_MS, greetingPose, loadArmRig, randomVariation, REST, STEADY, type ArmRig } from "./mivyGreeting";

interface MivyCharacterProps {
  /** Rendered height in px; the width follows the artwork (474×600). */
  height: number;
  /** Change this value to make Mivy wave (e.g. on arrival or hover). */
  waveKey?: number;
  className?: string;
}

const LAYER_W = 474;
const LAYER_H = 600;

/**
 * Mivy, the chat assistant. The character is split into layers (body, arm,
 * two feet) so it can move like a character: the pupils glance around and
 * follow the pointer, the eyes blink, the feet take little steps with a body
 * bob, it breathes, and it waves hello when `waveKey` changes (see
 * mivyGreeting.ts). Everything stops for prefers-reduced-motion.
 */
export function MivyCharacter({ height, waveKey, className }: MivyCharacterProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const armRef = useRef<HTMLCanvasElement>(null);
  const rigRef = useRef<ArmRig | null>(null);
  const greetingStart = useRef(-Infinity);
  const greetingVariation = useRef(STEADY);
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
    greetingStart.current = performance.now();
    greetingVariation.current = randomVariation();
    const start = window.setTimeout(() => setWaving(true), 0);
    const stop = window.setTimeout(() => setWaving(false), GREETING_MS);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(stop);
    };
  }, [waveKey]);

  // Draw the arm at rest once it loads, and again whenever Mivy's size changes.
  useEffect(() => {
    const canvas = armRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    const draw = () => rigRef.current && drawArm(canvas, rigRef.current, REST, armScale(root));
    const stopLoading = loadArmRig((rig) => {
      rigRef.current = rig;
      draw();
    });
    const resize = new ResizeObserver(draw);
    resize.observe(root);
    return () => {
      stopLoading();
      resize.disconnect();
    };
  }, []);

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

  // Eyes: follow the pointer when it moves, otherwise glance around; blink at
  // irregular intervals. During the greeting this loop also poses the arm and
  // body, and the eyes turn to the visitor.
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
    let blinkLength = 320;
    let armPosed = false;

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
      const pose = greetingPose(now - greetingStart.current, greetingVariation.current);
      const greeting = pose !== REST;
      if (greeting || armPosed) {
        const canvas = armRef.current;
        if (canvas && rigRef.current) drawArm(canvas, rigRef.current, pose, armScale(root));
        armPosed = greeting;
        root.style.setProperty("--lean", pose.lean.toFixed(3));
        root.style.setProperty("--lift", pose.lift.toFixed(3));
        root.style.setProperty("--squash", pose.squash.toFixed(4));
      }
      const focus = pose.attention;
      look += (target * (1 - focus) - look) * 0.14;
      lookY += (targetY * (1 - focus) - lookY) * 0.14;
      root.style.setProperty("--look-x", look.toFixed(3));
      root.style.setProperty("--look-y", Math.max(0, lookY).toFixed(3));

      // Sleepy blinks: the lids close quickly and open slowly, each a little different.
      if (blinkStart < 0 && now > nextBlink) {
        blinkStart = now;
        blinkLength = 280 + Math.random() * 180;
      }
      let lid = 0;
      if (blinkStart >= 0) {
        const t = (now - blinkStart) / blinkLength;
        const close = 0.3;
        lid = t < close ? Math.sin((t / close) * (Math.PI / 2)) : t < 1 ? Math.cos(((t - close) / (1 - close)) * (Math.PI / 2)) ** 2 : 0;
        if (t >= 1) {
          blinkStart = -1;
          nextBlink = now + (Math.random() < 0.15 ? 380 : 2800 + Math.random() * 3800);
        }
      }
      // The lids also drift heavier now and then, as if Mivy is dozing off.
      const droop = 0.13 * ((0.5 + 0.5 * Math.sin(now / 2300)) * (0.5 + 0.5 * Math.sin(now / 3700 + 1))) ** 2;
      root.style.setProperty("--lid", Math.max(lid, droop, pose.lid).toFixed(3));
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
          <canvas ref={armRef} className={styles.arm} />
        </span>
      </span>
    </span>
  );
}

/** Device pixels per artwork pixel for the arm canvas (offsetWidth ignores the body's transforms). */
function armScale(root: HTMLElement) {
  return (root.offsetWidth / LAYER_W) * Math.min(window.devicePixelRatio || 1, 3);
}
