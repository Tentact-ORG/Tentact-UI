import { startAnimationLoop } from "@/lib/animation-loop";
import { Disposer } from "@/lib/disposer";
import { FRAME_BREAKPOINT, onFontsReady, prefersReducedMotion } from "@/lib/environment";
import { clamp, degreesToRadians, smoothstep } from "@/lib/math";
import { springValue } from "@/lib/motion";
import { observeOnce, trackVisibility, type VisibilityTracker } from "@/lib/observers";

export interface ArcElements {
  section: HTMLElement;
  arc: HTMLElement;
  center: HTMLElement;
  cards: HTMLElement[];
}

/** The arc spans 240° (−120° … +120° from the top). */
const ARC_SPAN_DEGREES = 240;
const ARC_SPEED_DEGREES_PER_SECOND = 6.5;

/**
 * Cards fade out between these angles from the top of the arc: [still fully visible, hidden].
 * The wide range ends early enough that cards are gone before their lower corners reach the copy.
 */
const FADE_DEGREES = { wide: [46, 68], stacked: [58, 86] } as const;

/** Stacked layout: room for the fixed header above the arc … */
const STACKED_TOP_CLEARANCE = 72;
/** … between the lowest visible card and the copy … */
const STACKED_COPY_GAP = 24;
/** … and below the copy. */
const STACKED_BOTTOM_PADDING = 80;

interface ArcLayout {
  radius: number;
  centerY: number;
  /** Card scale, so smaller screens get smaller cards. */
  cardScale: number;
}

/**
 * Cards carrying each data field sweep along a wide arc above the headline,
 * fading out towards its ends. The section is sized around the arc so the
 * cards never sit on top of the copy.
 */
export class ArcScene {
  private readonly disposer = new Disposer();
  private readonly reduceMotion = prefersReducedMotion();
  private readonly visibility: VisibilityTracker;

  private layout: ArcLayout = { radius: 400, centerY: 500, cardScale: 1 };
  /** 0 → 1 as the arc fans out when first seen. */
  private spread: number;
  private offsetDegrees = 0;

  constructor(private readonly elements: ArcElements) {
    this.spread = this.reduceMotion ? 1 : 0;
    this.visibility = trackVisibility(elements.arc);
    this.disposer.add(this.visibility.disconnect);
  }

  start(): void {
    this.bindLayout();
    if (!this.reduceMotion) {
      this.disposer.add(
        observeOnce(
          this.elements.section,
          () => this.disposer.track(springValue(0, 1, (value) => (this.spread = value), { stiffness: 30, damping: 14 })),
          0.25,
        ),
      );
    }
    this.disposer.add(startAnimationLoop((_, deltaSeconds) => this.renderFrame(deltaSeconds)));
  }

  dispose(): void {
    this.disposer.dispose();
  }

  /* ----------------------------- layout ---------------------------------- */

  private bindLayout(): void {
    const relayout = () => this.computeLayout();
    relayout();
    this.disposer.listen(window, "resize", relayout);
    this.disposer.listen(window, "load", relayout);
    onFontsReady(relayout);
  }

  private computeLayout(): void {
    const { section, center } = this.elements;
    const width = section.clientWidth;
    const viewportHeight = window.innerHeight;
    const copyHeight = center.offsetHeight;

    if (width < FRAME_BREAKPOINT) {
      this.computeStackedLayout(width, copyHeight);
      return;
    }

    const bottomMargin = 28;
    const fitRadius = (topMargin: number) =>
      Math.max(220, Math.min(width * 0.4, 600, viewportHeight - bottomMargin - topMargin - copyHeight + 10));

    // First pass sizes the cards; the second recomputes the radius with the room those cards need above.
    const cardScale = Math.max(0.62, Math.min(1, fitRadius(150) / 420));
    const topMargin = 60 + 115 * cardScale;
    const radius = fitRadius(topMargin);
    const centerY = radius + topMargin;

    this.layout = { radius, centerY, cardScale };
    center.style.top = `${centerY - 40 * cardScale}px`;
    section.style.height = `${viewportHeight}px`;
  }

  /**
   * Below the frame breakpoint the arc is stacked above the copy: cards scale
   * with the width, the copy starts just under the lowest card that is still
   * visible, and the section takes its natural height instead of one screen.
   */
  private computeStackedLayout(width: number, copyHeight: number): void {
    const { section, center, cards } = this.elements;
    const cardScale = clamp(width / 1040, 0.54, 0.8);
    const radius = Math.min(width * 0.52, 420);

    // Cards are rotated along the arc, so reserve their half-diagonal rather than half their height.
    const cardWidth = cards[0]?.offsetWidth ?? 0;
    const cardHeight = cards[0]?.offsetHeight ?? 0;
    const cardReach = (Math.hypot(cardWidth, cardHeight) * cardScale) / 2;

    const centerY = STACKED_TOP_CLEARANCE + cardReach + radius;
    const lowestVisibleCardBottom = centerY - Math.cos(degreesToRadians(FADE_DEGREES.stacked[1])) * radius + cardReach;
    const copyTop = lowestVisibleCardBottom + STACKED_COPY_GAP;

    this.layout = { radius, centerY, cardScale };
    center.style.top = `${copyTop}px`;
    section.style.height = `${copyTop + copyHeight + STACKED_BOTTOM_PADDING}px`;
  }

  /* ----------------------------- frame ----------------------------------- */

  private renderFrame(deltaSeconds: number): void {
    if (!this.visibility.isVisible) return;

    const width = this.elements.arc.clientWidth;
    const [fadeStart, fadeEnd] = width < FRAME_BREAKPOINT ? FADE_DEGREES.stacked : FADE_DEGREES.wide;
    const { radius, centerY, cardScale } = this.layout;
    const cards = this.elements.cards;
    const stepDegrees = ARC_SPAN_DEGREES / cards.length;

    if (!this.reduceMotion) {
      this.offsetDegrees = (this.offsetDegrees + deltaSeconds * ARC_SPEED_DEGREES_PER_SECOND) % ARC_SPAN_DEGREES;
    }

    cards.forEach((card, index) => {
      const angle = ((index * stepDegrees + this.offsetDegrees) % ARC_SPAN_DEGREES) - ARC_SPAN_DEGREES / 2;
      const fade = 1 - smoothstep(fadeStart, fadeEnd, Math.abs(angle));
      const r = radius * (0.55 + 0.45 * this.spread);
      const radians = degreesToRadians(angle);

      const x = width / 2 + Math.sin(radians) * r * this.spread;
      const y = centerY - Math.cos(radians) * r * this.spread + (1 - this.spread) * 120;
      const scale = cardScale * (0.6 + 0.4 * this.spread);

      card.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%) rotate(${angle * 0.5 * this.spread}deg) scale(${scale})`;
      card.style.opacity = String(fade * Math.min(1, this.spread * 2));
      card.style.zIndex = String(Math.round(200 + angle));
    });
  }
}
