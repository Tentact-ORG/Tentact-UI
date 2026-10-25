"use client";

import { useEffect, useRef, useState } from "react";
import { Mascot, type MascotMood } from "./Mascot";
import styles from "./RoamingMascot.module.css";

/**
 * Mivy on the move: walks, runs (kicking up dust), turns around, spins,
 * backflips and leaps along a horizontal track, then rests and plays its idle
 * moves. A small state machine picks the next move; each move is animated
 * frame by frame (position, hop height, lean, facing, squash and stretch).
 *
 * - "stage": roams freely inside its box (the chat's welcome view).
 * - "launcher": rests in the launcher badge at the right end of the track and
 *   now and then hops out to explore along the bottom of the screen, then runs
 *   back home. It stays home while `homeOnly` is set (e.g. the chat is open).
 */

type Mode = "stage" | "launcher";

interface RoamingMascotProps {
  mode: Mode;
  size: number;
  /** Track height; the mascot walks along its bottom. */
  height: number;
  /** Launcher: the resting point, measured from the track's right edge. */
  homeFromRight?: number;
  /** Launcher: lift of the resting point above the track's bottom (centres it in the badge). */
  homeLift?: number;
  /** Launcher: stay (or go back) home. */
  homeOnly?: boolean;
  /** Mood while resting (thinking, listening…). */
  restingMood?: MascotMood;
  followPointer?: boolean;
  /** Called when the mascot leaves or returns to its home (launcher). */
  onAwayChange?: (away: boolean) => void;
}

interface Pose {
  x: number;
  y: number;
  rot: number;
  spin: number;
  face: 1 | -1;
  sx: number;
  sy: number;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timer);
      resolve();
    });
  });

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const smooth = (t: number) => t * t * (3 - 2 * t);
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: readonly [T, number][]): T => {
  const total = items.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [item, weight] of items) {
    roll -= weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1][0];
};

export function RoamingMascot({
  mode,
  size,
  height,
  homeFromRight = 38,
  homeLift = 0,
  homeOnly = false,
  restingMood = "idle",
  followPointer = false,
  onAwayChange,
}: RoamingMascotProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const actorRef = useRef<HTMLDivElement>(null);
  const homeOnlyRef = useRef(homeOnly);
  const awayRef = useRef(onAwayChange);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    homeOnlyRef.current = homeOnly;
    awayRef.current = onAwayChange;
  }, [homeOnly, onAwayChange]);

  useEffect(() => {
    const track = trackRef.current;
    const actor = actorRef.current;
    if (!track || !actor) return;
    const controller = new AbortController();
    const { signal } = controller;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const width = () => track.clientWidth;
    const home = () => width() - homeFromRight;
    const minX = size * 0.55;
    const pose: Pose = { x: mode === "launcher" ? home() : width() / 2, y: mode === "launcher" ? homeLift : 0, rot: 0, spin: 0, face: 1, sx: 1, sy: 1 };

    const render = () => {
      actor.style.transform =
        `translate3d(${(pose.x - size / 2).toFixed(1)}px, ${(-pose.y).toFixed(1)}px, 0) ` +
        `rotate(${pose.rot.toFixed(2)}deg) rotateY(${pose.spin.toFixed(1)}deg) scale(${(pose.face * pose.sx).toFixed(3)}, ${pose.sy.toFixed(3)})`;
    };
    render();
    if (reduced) return;

    /** Runs `frame(t, elapsedMs)` every animation frame for `duration` ms. */
    const animate = (duration: number, frame: (t: number, elapsed: number) => void) =>
      new Promise<void>((resolve) => {
        const start = performance.now();
        let id = 0;
        const tick = (now: number) => {
          if (signal.aborted) return resolve();
          const elapsed = Math.min(now - start, duration);
          frame(elapsed / duration, elapsed);
          render();
          if (elapsed >= duration) resolve();
          else id = requestAnimationFrame(tick);
        };
        id = requestAnimationFrame(tick);
        signal.addEventListener("abort", () => cancelAnimationFrame(id));
      });

    const dust = (x: number) => {
      const puff = document.createElement("span");
      puff.className = styles.dust;
      puff.style.left = `${x}px`;
      puff.style.setProperty("--drift", `${-pose.face * rand(6, 16)}px`);
      puff.style.setProperty("--puff", `${size * rand(0.12, 0.2)}px`);
      track.append(puff);
      puff.addEventListener("animationend", () => puff.remove());
    };

    /** About-face with a little hop: the body narrows edge-on, then mirrors. */
    const turn = async () => {
      const from = pose.face;
      const baseY = pose.y;
      await animate(280, (t) => {
        pose.sx = Math.cos(Math.PI * t);
        pose.y = baseY + Math.sin(Math.PI * t) * size * 0.08;
      });
      pose.face = from === 1 ? -1 : 1;
      pose.sx = 1;
      pose.y = baseY;
    };

    const face = async (target: number) => {
      if (Math.sign(target - pose.x) !== pose.face && Math.abs(target - pose.x) > 2) await turn();
    };

    /** Walking or running: constant pace with eased ends, a step bounce, a sway and (running) a forward lean and dust. */
    const travel = async (to: number, gait: "walk" | "run") => {
      await face(to);
      const from = pose.x;
      const distance = Math.abs(to - from);
      if (distance < 4) return;
      const speed = gait === "run" ? size * 3.2 : size * 1.05; // px per second
      const stepsPerSecond = gait === "run" ? 5.5 : 2.6;
      const bounce = gait === "run" ? 0.11 : 0.06;
      const lean = gait === "run" ? 10 : 3;
      let lastDust = 0;
      await animate((distance / speed) * 1000, (t, elapsed) => {
        pose.x = from + (to - from) * (gait === "run" ? easeInOut(t) : smooth(t));
        const phase = (elapsed / 1000) * stepsPerSecond * Math.PI;
        const step = Math.abs(Math.sin(phase));
        pose.y = step * size * bounce;
        pose.rot = pose.face * (lean + Math.sin(phase * 2) * (gait === "run" ? 3 : 4));
        pose.sx = 1 + (1 - step) * 0.05;
        pose.sy = 1 - (1 - step) * 0.06;
        if (gait === "run" && elapsed - lastDust > 140 && step < 0.25) {
          lastDust = elapsed;
          dust(pose.x - pose.face * size * 0.3);
        }
      });
      Object.assign(pose, { y: 0, rot: 0, sx: 1, sy: 1 });
    };

    /** A jump along an arc, optionally with a full backflip, with squash on take-off and landing. */
    const leap = async (to: number, peak: number, flips: number, endLift = 0) => {
      await face(to);
      const from = pose.x;
      const startLift = pose.y;
      await animate(120, (t) => {
        pose.sy = 1 - 0.18 * Math.sin(Math.PI * t);
        pose.sx = 1 + 0.12 * Math.sin(Math.PI * t);
      });
      await animate(flips ? 900 : 640, (t) => {
        pose.x = from + (to - from) * t;
        pose.y = startLift + (endLift - startLift) * t + Math.sin(Math.PI * t) * peak;
        pose.rot = flips ? -pose.face * 360 * flips * easeInOut(t) : pose.face * 12 * Math.sin(Math.PI * t);
        pose.sx = 1 - 0.06 * Math.sin(Math.PI * t);
        pose.sy = 1 + 0.08 * Math.sin(Math.PI * t);
      });
      pose.rot = 0;
      if (endLift === 0) dust(pose.x);
      await animate(160, (t) => {
        pose.sy = 1 - 0.16 * Math.sin(Math.PI * t);
        pose.sx = 1 + 0.12 * Math.sin(Math.PI * t);
      });
      pose.sx = pose.sy = 1;
    };

    /** A 3D pirouette on the spot. */
    const spin = async () => {
      await animate(950, (t) => {
        pose.spin = 360 * easeInOut(t);
        pose.y = Math.sin(Math.PI * t) * size * 0.28;
      });
      pose.spin = 0;
      pose.y = 0;
    };

    /** A roll along the ground: a full forward rotation while travelling. */
    const roll = async (to: number) => {
      await face(to);
      const from = pose.x;
      await animate(Math.max(500, (Math.abs(to - from) / (size * 2.4)) * 1000), (t) => {
        pose.x = from + (to - from) * easeInOut(t);
        pose.rot = pose.face * 360 * easeInOut(t);
        pose.y = Math.abs(Math.sin(Math.PI * t)) * size * 0.12;
      });
      pose.rot = 0;
      pose.y = 0;
    };

    const rest = async (ms: number) => {
      setMoving(false);
      await sleep(ms, signal);
      setMoving(true);
    };

    const randomSpot = (minDistance: number, maxX = width() - size * 0.55) => {
      for (let i = 0; i < 6; i++) {
        const x = rand(minX, maxX);
        if (Math.abs(x - pose.x) >= minDistance) return x;
      }
      return pose.x > (minX + maxX) / 2 ? minX : maxX;
    };

    const stageLoop = async () => {
      setMoving(true);
      while (!signal.aborted) {
        const move = pick([
          ["walk", 30],
          ["run", 18],
          ["rest", 18],
          ["spin", 9],
          ["flip", 9],
          ["roll", 8],
          ["hop", 8],
        ] as const);
        if (move === "walk") await travel(randomSpot(size * 0.8), "walk");
        else if (move === "run") await travel(randomSpot(size * 1.6), "run");
        else if (move === "rest") await rest(rand(1500, 3200));
        else if (move === "spin") await spin();
        else if (move === "flip") await leap(Math.min(width() - minX, Math.max(minX, pose.x + pose.face * size * 0.8)), size * 0.9, 1);
        else if (move === "roll") await roll(randomSpot(size));
        else await leap(Math.min(width() - minX, Math.max(minX, pose.x + pose.face * size * 0.5)), size * 0.5, 0);
      }
    };

    const goHome = async () => {
      await travel(Math.max(minX, home() - size * 1.2), "run");
      await leap(home(), size * 0.8, 0, homeLift);
      if (pose.face !== 1) await turn();
      awayRef.current?.(false);
    };

    const launcherLoop = async () => {
      while (!signal.aborted) {
        await rest(rand(9000, 16000));
        if (signal.aborted || homeOnlyRef.current || width() < size * 4) continue;
        // Out of the badge and off to explore.
        setMoving(true);
        awayRef.current?.(true);
        await turn();
        await leap(home() - size * 1.3, size * 0.9, 0);
        const errands = Math.floor(rand(2, 5));
        for (let i = 0; i < errands && !signal.aborted && !homeOnlyRef.current; i++) {
          const move = pick([
            ["walk", 35],
            ["run", 20],
            ["spin", 15],
            ["flip", 12],
            ["roll", 10],
            ["pause", 8],
          ] as const);
          const maxX = home() - size * 1.4;
          if (move === "walk") await travel(randomSpot(size * 0.8, maxX), "walk");
          else if (move === "run") await travel(randomSpot(size * 1.6, maxX), "run");
          else if (move === "spin") await spin();
          else if (move === "flip") await leap(Math.min(maxX, Math.max(minX, pose.x + pose.face * size)), size, 1);
          else if (move === "roll") await roll(randomSpot(size, maxX));
          else await rest(rand(900, 1800));
        }
        if (!signal.aborted) await goHome();
      }
    };

    void (mode === "stage" ? stageLoop() : launcherLoop());
    return () => controller.abort();
  }, [mode, size, homeFromRight, homeLift]);

  return (
    <div ref={trackRef} className={styles.track} style={{ height }} aria-hidden="true">
      <div ref={actorRef} className={styles.actor} style={{ width: size, height: size }}>
        <Mascot size={size} mood={moving ? "moving" : restingMood} actions={!moving} followPointer={followPointer && !moving} />
      </div>
    </div>
  );
}
