import type { AnimationPlaybackControls } from "motion";
import { startAnimationLoop } from "@/lib/animation-loop";
import { Disposer } from "@/lib/disposer";
import { MOBILE_BREAKPOINT, prefersReducedMotion } from "@/lib/environment";
import { clamp } from "@/lib/math";
import { springValue } from "@/lib/motion";
import { observeOnce, trackVisibility, type VisibilityTracker } from "@/lib/observers";

export interface RingElements {
  section: HTMLElement;
  ring: HTMLElement;
  cards: HTMLElement[];
}

/** Base rotation speed in radians per second. */
const BASE_SPEED = 0.1;
/** How strongly page scrolling nudges the ring, and the cap on that nudge. */
const SCROLL_NUDGE = 0.0035;
const MAX_SCROLL_VELOCITY = 0.9;
/** Fraction of scroll velocity left after one second. */
const VELOCITY_DECAY_PER_SECOND = 0.04;
const HOVER_SCALE = 1.14;

interface RingCardState {
  element: HTMLElement;
  hoverScale: number;
  tilt: number;
}

/**
 * A slowly turning ellipse of photo and data cards around the headline.
 * It springs open when first seen, scrolling gives it a capped nudge, and
 * hovering a card lifts it to the front.
 */
export class RingScene {
  private readonly disposer = new Disposer();
  private readonly reduceMotion = prefersReducedMotion();
  private readonly visibility: VisibilityTracker;
  private readonly cards: RingCardState[];

  private spread: number;
  private rotation = -Math.PI / 2;
  private scrollVelocity = 0;
  private lastScrollY = 0;

  constructor(private readonly elements: RingElements) {
    this.spread = this.reduceMotion ? 1 : 0;
    this.visibility = trackVisibility(elements.ring);
    this.disposer.add(this.visibility.disconnect);
    this.cards = elements.cards.map((element, index) => ({
      element,
      hoverScale: 1,
      tilt: ((index % 3) - 1) * 4,
    }));
  }

  start(): void {
    this.bindHoverSprings();
    this.bindScrollNudge();
    this.disposer.add(
      observeOnce(
        this.elements.section,
        () => this.disposer.track(springValue(0, 1, (value) => (this.spread = value), { stiffness: 38, damping: 11 })),
        0.3,
      ),
    );
    this.disposer.add(startAnimationLoop((_, deltaSeconds) => this.renderFrame(deltaSeconds)));
  }

  dispose(): void {
    this.disposer.dispose();
  }

  /* ----------------------------- input ----------------------------------- */

  private bindHoverSprings(): void {
    this.cards.forEach((card) => {
      let hoverAnimation: AnimationPlaybackControls | undefined;
      const springTo = (target: number, stiffness: number, damping: number) => {
        hoverAnimation?.stop();
        hoverAnimation = springValue(card.hoverScale, target, (value) => (card.hoverScale = value), {
          stiffness,
          damping,
        });
      };

      this.disposer.listen(card.element, "pointerenter", () => springTo(HOVER_SCALE, 260, 16));
      this.disposer.listen(card.element, "pointerleave", () => springTo(1, 200, 18));
      this.disposer.add(() => hoverAnimation?.stop());
    });
  }

  /** Scrolling nudges the ring a little (capped) instead of flinging it. */
  private bindScrollNudge(): void {
    this.lastScrollY = window.scrollY;
    this.disposer.listen(
      window,
      "scroll",
      () => {
        const delta = window.scrollY - this.lastScrollY;
        this.scrollVelocity = clamp(this.scrollVelocity + delta * SCROLL_NUDGE, -MAX_SCROLL_VELOCITY, MAX_SCROLL_VELOCITY);
        this.lastScrollY = window.scrollY;
      },
      { passive: true },
    );
  }

  /* ----------------------------- frame ----------------------------------- */

  private renderFrame(deltaSeconds: number): void {
    if (!this.visibility.isVisible) return;

    const width = this.elements.ring.clientWidth;
    const height = this.elements.ring.clientHeight;
    const isMobile = width < MOBILE_BREAKPOINT;
    const radiusX = isMobile ? width * 0.4 : Math.min(width * 0.41, 640);
    const radiusY = isMobile ? height * 0.37 : Math.min(height * 0.35, 330);

    // Time-based (rad/s) so it turns at the same speed on 60 Hz and 120 Hz screens.
    if (!this.reduceMotion) this.rotation += (BASE_SPEED + this.scrollVelocity) * deltaSeconds;
    this.scrollVelocity *= Math.pow(VELOCITY_DECAY_PER_SECOND, deltaSeconds);

    this.cards.forEach((card, index) => {
      const angle = this.rotation + (index / this.cards.length) * Math.PI * 2;
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      /** 0 at the back of the ring, 1 at the front. */
      const depth = (sin + 1) / 2;

      const x = width / 2 + cos * radiusX * this.spread;
      const y = height / 2 + sin * radiusY * this.spread;
      const rotate = (-cos * 6 + card.tilt) * this.spread;
      const scale = (0.74 + 0.34 * depth) * (isMobile ? 0.5 : 1) * (0.3 + 0.7 * this.spread) * card.hoverScale;

      card.element.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) rotate(${rotate}deg) scale(${scale})`;
      card.element.style.zIndex = card.hoverScale > 1.01 ? "200" : String(Math.round(depth * 100));
      card.element.style.opacity = String(Math.min(1, this.spread * 3));
    });
  }
}
