import { startAnimationLoop } from "@/lib/animation-loop";
import { Disposer } from "@/lib/disposer";
import { prefersReducedMotion } from "@/lib/environment";
import { smoothstep } from "@/lib/math";
import { springValue } from "@/lib/motion";
import { observeOnce, trackVisibility, type VisibilityTracker } from "@/lib/observers";

export interface TunnelElements {
  tunnel: HTMLElement;
  cards: HTMLElement[];
}

/** Loop progress per second while idle (1 = every card has passed once). */
const AUTO_SPEED = 0.021;
/** How much a full scroll through the section advances the loop. */
const SCROLL_INFLUENCE = 0.35;
/** Scroll smoothing rate per second, so wheel steps don't make cards jump. */
const SCROLL_SMOOTHING = 6;

/**
 * Audience cards stream outward from the centre of a perspective tunnel,
 * growing and turning as they approach the edges, driven by time and scroll.
 */
export class TunnelScene {
  private readonly disposer = new Disposer();
  private readonly reduceMotion = prefersReducedMotion();
  private readonly visibility: VisibilityTracker;

  private spread: number;
  private autoOffset = 0;
  private smoothedScroll: number | null = null;

  constructor(private readonly elements: TunnelElements) {
    this.spread = this.reduceMotion ? 1 : 0;
    this.visibility = trackVisibility(elements.tunnel);
    this.disposer.add(this.visibility.disconnect);
  }

  start(): void {
    this.disposer.add(
      observeOnce(
        this.elements.tunnel,
        () => this.disposer.track(springValue(0, 1, (value) => (this.spread = value), { stiffness: 34, damping: 10 })),
        0.2,
      ),
    );
    this.disposer.add(startAnimationLoop((_, deltaSeconds) => this.renderFrame(deltaSeconds)));
  }

  dispose(): void {
    this.disposer.dispose();
  }

  private renderFrame(deltaSeconds: number): void {
    if (!this.visibility.isVisible) return;

    const { tunnel, cards } = this.elements;
    const width = tunnel.clientWidth;
    const rect = tunnel.getBoundingClientRect();

    const scrollTarget = (window.innerHeight - rect.top) / (window.innerHeight + rect.height);
    this.smoothedScroll =
      this.smoothedScroll === null
        ? scrollTarget
        : this.smoothedScroll + (scrollTarget - this.smoothedScroll) * Math.min(1, deltaSeconds * SCROLL_SMOOTHING);

    // Time-based so speed is the same on 60 Hz and 120 Hz screens.
    if (!this.reduceMotion) this.autoOffset += deltaSeconds * AUTO_SPEED;
    const offset = this.autoOffset + this.smoothedScroll * SCROLL_INFLUENCE;

    cards.forEach((card, index) => {
      /** -1 (far left) … 0 (centre) … 1 (far right). */
      const position = ((((index / cards.length + offset) % 1) + 1) % 1 - 0.5) * 2;
      const distance = Math.abs(position);

      const x = Math.sign(position) * Math.pow(distance, 0.95) * width * 0.54 * (0.35 + 0.65 * this.spread);
      const scale = 0.8 + 1.05 * Math.pow(distance, 2.2);
      const rotateY = -Math.sign(position) * Math.min(58, distance * 70) * this.spread;

      card.style.transform = `translate(-50%,-50%) translateX(${x}px) rotateY(${rotateY}deg) scale(${scale})`;
      card.style.zIndex = String(Math.round(distance * 100));
      // Fade cards out gradually as they reach the edges (and in as they wrap back) instead of popping.
      card.style.opacity = String((1 - smoothstep(0.74, 0.95, distance)) * Math.min(1, this.spread * 2));
    });
  }
}
