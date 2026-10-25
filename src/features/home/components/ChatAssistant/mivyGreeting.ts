/**
 * Mivy's "Hi!" wave: one timeline for the arm, the body and the eyes, and a
 * renderer that bends the arm like a soft limb.
 *
 * The arm is a single image drawn row by row along a curve. Bending is spread
 * over the shoulder, elbow and wrist instead of hinging two rigid pieces, so
 * the arm stays one connected shape, keeps its width, and its root never
 * leaves the body. All coordinates are in the 474×600 artwork space.
 */

export const GREETING_MS = 3200;

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
const easeInOut = (a: number, b: number, t: number) => {
  const x = clamp01((t - a) / (b - a));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
/** Rises with a small overshoot that settles (ease-out-back). */
const rise = (a: number, b: number, t: number) => {
  const x = clamp01((t - a) / (b - a));
  const c = 1.5;
  return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
};
const bump = (a: number, b: number, t: number) => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI) ** 2);

/** The pose `t` ms into the greeting. */
export function greetingPose(t: number): GreetingPose {
  if (t <= 0 || t >= GREETING_MS) return REST;
  const omega = (2 * Math.PI * 2.1) / 1000; // ~2 waves a second, like a person
  const phase = omega * (t - 720);

  const crouch = bump(0, 300, t); // the little dip before the arm goes up
  const lower = easeInOut(2480, 3080, t);
  const lowerLate = easeInOut(2560, 3160, t); // the forearm follows the upper arm down
  const raised = rise(170, 720, t) * (1 - lower);
  const raisedLate = rise(250, 820, t) * (1 - lowerLate); // ...and up
  const waving = smooth(620, 900, t) * (1 - smooth(2200, 2520, t));
  const settle = bump(2950, 3200, t);

  // Overlapping action: the upper arm sways a little, the forearm swings from
  // the elbow, and the hand flaps a beat behind it.
  const shoulder = 128 * raised - 9 * crouch + 4 * Math.sin(phase) * waving - 4 * settle;
  const elbow = 52 * raisedLate + 6 * crouch + 15 * Math.sin(phase - 0.5) * waving;
  const wrist = -10 * bump(170, 650, t) + 26 * Math.sin(phase - 1.5) * waving + 8 * bump(2480, 2950, t);

  return {
    shoulder,
    elbow,
    wrist,
    lean: 2.6 * raised + 1.1 * Math.sin(phase - 0.9) * waving,
    lift: 0.8 * crouch - 1.2 * bump(250, 900, t) - 0.35 * Math.abs(Math.sin(phase)) * waving + 0.4 * settle,
    squash: 0.03 * crouch + 0.012 * settle,
    lid: Math.max(bump(90, 300, t), 0.3 * waving),
    attention: smooth(0, 300, t) * (1 - smooth(2700, 3200, t)),
  };
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
