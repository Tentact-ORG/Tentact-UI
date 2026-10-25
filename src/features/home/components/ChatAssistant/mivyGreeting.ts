/**
 * Mivy's "Hi!" wave: one timeline for the arm, the body and the eyes, and a
 * renderer that bends the arm like a soft limb. Mivy is sleepy, so the wave
 * is a lazy "heyyy": a look and a slow blink first, the arm drifts up to
 * about head height, a few small flaps that run out of energy, and the arm
 * flops back down under its own weight.
 *
 * The arm is a single image drawn row by row along a curve. Bending is spread
 * over the shoulder, elbow and wrist instead of hinging two rigid pieces, so
 * the arm stays one connected shape, keeps its width, and its root never
 * leaves the body. All coordinates are in the 474×600 artwork space.
 */

export const GREETING_MS = 4300;

/** Where mivy-arm.png sits on the artwork, and the joints along it (artwork y). */
export const ARM = { x: 141, y: 195, w: 63, h: 258, src: "/assets/mivy/mivy-arm.png" };
const JOINTS = [
  { y: 222, spread: 13 }, // shoulder
  { y: 318, spread: 9 }, // elbow
  { y: 405, spread: 7 }, // wrist
];

/** The arm canvas covers this part of the artwork (the raised hand goes above the head). */
export const ARM_CANVAS = { x: -90, y: -120, w: 420, h: 600 };

export interface GreetingPose {
  /** Bend at the shoulder, elbow and wrist in degrees (clockwise; 0 = hanging down). */
  shoulder: number;
  elbow: number;
  wrist: number;
  /** Body lean (deg), lift (% of height, negative = up) and squash. */
  lean: number;
  lift: number;
  squash: number;
  /** Eyes: extra lid closing (0–1) and whether to look at the visitor. */
  lid: number;
  attention: number;
}

export const REST: GreetingPose = { shoulder: 0, elbow: 0, wrist: 0, lean: 0, lift: 0, squash: 0, lid: 0, attention: 0 };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, t: number) => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};
/** Slow in, slow out: the weighted, unhurried ease used for every big move. */
const ease = (a: number, b: number, t: number) => {
  const x = clamp01((t - a) / (b - a));
  return x < 0.5 ? 16 * x ** 5 : 1 - (-2 * x + 2) ** 5 / 2;
};
const bump = (a: number, b: number, t: number) => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI) ** 2);
/** A soft, damped wobble starting at `a`: how a floppy limb or fluffy body settles. */
const wobble = (a: number, t: number, period: number, decay: number) =>
  t <= a ? 0 : Math.sin(((t - a) / period) * 2 * Math.PI) * Math.exp(-(t - a) / decay);

/** Small per-greeting differences so Mivy never waves exactly the same way twice. */
export interface GreetingVariation {
  /** Wave size and speed multipliers, and a delay (ms) before the arm moves. */
  size: number;
  speed: number;
  delay: number;
}

export const STEADY: GreetingVariation = { size: 1, speed: 1, delay: 0 };

export function randomVariation(): GreetingVariation {
  return { size: 0.85 + Math.random() * 0.3, speed: 0.9 + Math.random() * 0.2, delay: Math.random() * 160 };
}

/** The pose `t` ms into the greeting. */
export function greetingPose(t: number, v: GreetingVariation = STEADY): GreetingPose {
  if (t <= 0 || t >= GREETING_MS) return REST;
  const d = v.delay;

  // The arm drifts up slowly with the elbow folding as it goes (so the hand
  // comes up beside the head instead of pointing out), holds a beat, and later
  // flops down with the elbow unfolding a little behind it; ease() gives every
  // move a slow start and a soft stop.
  const up = ease(400 + d, 1400 + d, t);
  const upLate = ease(330 + d, 1300 + d, t);
  const down = ease(3180, 3900, t);
  const downLate = ease(3260, 4000, t);
  const raised = up * (1 - down);
  const raisedLate = upLate * (1 - downLate);

  // Two and a half small flaps from the wrist that lose energy, with the
  // forearm following a little and the hand trailing behind it.
  const waveStart = 1560 + d;
  const flapping = smooth(waveStart - 120, waveStart + 260, t) * (1 - smooth(2780, 3080, t));
  const phase = ((2 * Math.PI * 1.55 * v.speed) / 1000) * (t - waveStart);
  const tired = 1 - 0.45 * clamp01((t - waveStart) / 1400); // each flap a bit lazier
  const flap = Math.sin(phase + 0.25 * Math.sin(phase * 0.5)) * flapping * tired * v.size;
  const flapLate = Math.sin(phase - 1.1 + 0.25 * Math.sin(phase * 0.5)) * flapping * tired * v.size;

  // After it drops, the arm swings a little past rest and wobbles still.
  const flop = wobble(3880, t, 520, 230);

  const shoulder = 80 * raised + 2.5 * flap - 7 * flop;
  const elbow = 80 * raisedLate + 9 * flap - 6 * flop;
  const wrist = -8 * bump(500 + d, 1500 + d, t) + 20 * flapLate + 10 * bump(3180, 3800, t) - 8 * wobble(3960, t, 460, 200);

  // Body: shifts its weight away from the arm as it rises (a touch behind
  // it), sways softly with the flaps, and squashes as the arm drops.
  const lean = 1.7 * ease(480 + d, 1650 + d, t) * (1 - ease(3260, 4060, t)) + 0.5 * flapLate - 0.8 * wobble(3900, t, 640, 260);
  const lift = -0.5 * bump(420 + d, 1500 + d, t) - 0.18 * Math.abs(flap) + 0.6 * bump(3700, 4250, t);
  const squash = 0.008 * bump(300 + d, 760 + d, t) + 0.016 * bump(3700, 4250, t);

  // Eyes: a slow sleepy blink when Mivy notices the visitor, lids a little
  // heavier while waving, and another lazy blink once the arm is down.
  const blink = (a: number, len: number) => (t <= a || t >= a + len ? 0 : Math.sin(((t - a) / len) * Math.PI) ** 1.5);
  const lid = Math.max(blink(120, 420), blink(3980, 380), 0.18 * flapping);

  return { shoulder, elbow, wrist, lean, lift, squash, lid, attention: smooth(0, 450, t) * (1 - smooth(3600, 4300, t)) };
}

/** The arm image plus its rest centerline (per row), ready to draw. */
export interface ArmRig {
  image: CanvasImageSource;
  center: Float32Array;
}

export function loadArmRig(onReady: (rig: ArmRig) => void): () => void {
  let cancelled = false;
  const image = new Image();
  image.decoding = "async";
  image.onload = () => {
    if (cancelled) return;
    const scratch = document.createElement("canvas");
    scratch.width = ARM.w;
    scratch.height = ARM.h;
    const ctx = scratch.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, ARM.w, ARM.h);
    const center = new Float32Array(ARM.h);
    let last = ARM.w / 2;
    for (let row = 0; row < ARM.h; row++) {
      let sum = 0;
      let weight = 0;
      for (let col = 0; col < ARM.w; col++) {
        const a = data[(row * ARM.w + col) * 4 + 3];
        sum += a * col;
        weight += a;
      }
      last = weight > 400 ? sum / weight : last;
      center[row] = last;
    }
    // Smooth the centerline so the drawn arm doesn't wobble row to row.
    const smoothed = new Float32Array(ARM.h);
    for (let row = 0; row < ARM.h; row++) {
      let sum = 0;
      let count = 0;
      for (let k = -6; k <= 6; k++) {
        const r = row + k;
        if (r >= 0 && r < ARM.h) {
          sum += center[r];
          count++;
        }
      }
      smoothed[row] = sum / count;
    }
    onReady({ image, center: smoothed });
  };
  image.src = ARM.src;
  return () => {
    cancelled = true;
  };
}

const RAD = Math.PI / 180;
const logistic = (y: number, joint: { y: number; spread: number }) => 1 / (1 + Math.exp(-(y - joint.y) / (joint.spread / 2.2)));

/** Draws the arm in `pose` onto a canvas covering ARM_CANVAS, at `scale` device px per artwork px. */
export function drawArm(canvas: HTMLCanvasElement, rig: ArmRig, pose: GreetingPose, scale: number) {
  const width = Math.round(ARM_CANVAS.w * scale);
  const height = Math.round(ARM_CANVAS.h * scale);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.setTransform(scale, 0, 0, scale, -ARM_CANVAS.x * scale, -ARM_CANVAS.y * scale);
  ctx.imageSmoothingQuality = "high";

  const angles = [pose.shoulder, pose.elbow, pose.wrist];
  let x = ARM.x + rig.center[0];
  let y = ARM.y;
  for (let row = 0; row < ARM.h; row++) {
    const artY = ARM.y + row;
    let angle = 0;
    for (let j = 0; j < JOINTS.length; j++) angle += angles[j] * logistic(artY, JOINTS[j]);
    const a = angle * RAD;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    // Each row is drawn a little taller than one pixel so the outside of a bend has no gaps.
    ctx.setTransform(scale * cos, scale * sin, -scale * sin, scale * cos, (x - ARM_CANVAS.x) * scale, (y - ARM_CANVAS.y) * scale);
    ctx.drawImage(rig.image, 0, row, ARM.w, 1, -rig.center[row], -0.6, ARM.w, 2.4);
    if (row + 1 < ARM.h) {
      const dx = rig.center[row + 1] - rig.center[row];
      x += dx * cos - sin;
      y += dx * sin + cos;
    }
  }
}
