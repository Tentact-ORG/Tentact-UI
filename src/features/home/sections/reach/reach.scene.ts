import { animate } from "motion";
import { startAnimationLoop } from "@/lib/animation-loop";
import { Disposer } from "@/lib/disposer";
import { prefersReducedMotion } from "@/lib/environment";
import { formatThousands } from "@/lib/math";
import { springValue, tweenValue } from "@/lib/motion";
import { observeOnce, trackVisibility, type VisibilityTracker } from "@/lib/observers";

export interface RouteElements {
  path: SVGPathElement;
  cover: SVGPathElement;
  drawDot: SVGCircleElement;
  cometGlow: SVGCircleElement;
  cometDot: SVGCircleElement;
}

export interface PinElements {
  pin: HTMLElement;
  counter: HTMLElement;
}

export interface ReachElements {
  map: HTMLElement;
  routes: RouteElements[];
  pins: PinElements[];
  buyerCounts: number[];
}

const ENTRANCE_THRESHOLD = 0.25;
const ROUTE_START_DELAY_MS = 500;
const ROUTE_STAGGER_MS = 650;
const HIGHLIGHT_START_MS = 2400;
const HIGHLIGHT_INTERVAL_MS = 1600;
const COMET_CYCLE_MS = 3400;

interface RouteState {
  elements: RouteElements;
  length: number;
  isDrawn: boolean;
  phase: number;
}

/**
 * The reach map: pins drop in with counting buyer totals, the route draws
 * itself leg by leg, then comets keep travelling the drawn legs while one city
 * at a time is highlighted.
 */
export class ReachScene {
  private readonly disposer = new Disposer();
  private readonly reduceMotion = prefersReducedMotion();
  private readonly visibility: VisibilityTracker;
  private readonly routes: RouteState[];
  private highlightIndex = 0;

  constructor(private readonly elements: ReachElements) {
    this.visibility = trackVisibility(elements.map);
    this.disposer.add(this.visibility.disconnect);
    this.routes = elements.routes.map((route, index) => ({
      elements: route,
      length: route.path.getTotalLength(),
      isDrawn: false,
      phase: index * 0.37,
    }));
  }

  start(): void {
    this.hideUndrawnRoutes();
    if (this.reduceMotion) this.showPinsImmediately();

    this.disposer.add(observeOnce(this.elements.map, () => this.playEntrance(), ENTRANCE_THRESHOLD));
    if (!this.reduceMotion) {
      this.disposer.add(startAnimationLoop((time) => this.renderComets(time)));
    }
  }

  dispose(): void {
    this.disposer.dispose();
  }

  /* ----------------------------- setup ----------------------------------- */

  /** Each route is revealed by a mask whose stroke is dashed to exactly the route's length. */
  private hideUndrawnRoutes(): void {
    this.routes.forEach(({ elements, length }) => {
      elements.cover.setAttribute("stroke-dasharray", `${length} ${length}`);
      elements.cover.setAttribute("stroke-dashoffset", String(length));
    });
  }

  private showPinsImmediately(): void {
    this.elements.pins.forEach(({ pin, counter }, index) => {
      pin.style.opacity = "1";
      counter.textContent = formatThousands(this.elements.buyerCounts[index]);
    });
  }

  /* ----------------------------- entrance -------------------------------- */

  private playEntrance(): void {
    if (!this.reduceMotion) {
      this.dropPins();
      this.disposer.timeout(() => this.disposer.interval(() => this.highlightNextPin(), HIGHLIGHT_INTERVAL_MS), HIGHLIGHT_START_MS);
    }
    this.routes.forEach((route, index) =>
      this.disposer.timeout(() => this.drawRoute(route), ROUTE_START_DELAY_MS + index * ROUTE_STAGGER_MS),
    );
  }

  private dropPins(): void {
    this.elements.pins.forEach(({ pin, counter }, index) => {
      this.disposer.track(
        animate(pin, { opacity: [0, 1], y: [-36, 0] }, { type: "spring", stiffness: 320, damping: 11, delay: 0.2 + index * 0.15 }),
      );
      this.disposer.track(
        tweenValue(0, this.elements.buyerCounts[index], (value) => (counter.textContent = formatThousands(value)), {
          duration: 1.4,
          delay: 0.35 + index * 0.15,
        }),
      );
    });
  }

  private highlightNextPin(): void {
    if (!this.visibility.isVisible) return;

    this.elements.pins.forEach(({ pin }, index) => {
      if (index === this.highlightIndex) pin.dataset.hot = "";
      else delete pin.dataset.hot;
    });
    this.highlightIndex = (this.highlightIndex + 1) % this.elements.pins.length;
  }

  /** A dot leads the line as the route's mask is wiped open, then fades away. */
  private drawRoute(route: RouteState): void {
    const { cover, path, drawDot } = route.elements;
    drawDot.setAttribute("opacity", "1");

    this.disposer.track(
      springValue(
        0,
        1,
        (progress) => {
          cover.setAttribute("stroke-dashoffset", String(route.length * (1 - progress)));
          const point = path.getPointAtLength(route.length * Math.min(1, progress));
          drawDot.setAttribute("cx", String(point.x));
          drawDot.setAttribute("cy", String(point.y));

          if (progress > 0.99 && !route.isDrawn) {
            route.isDrawn = true;
            this.disposer.track(animate(drawDot, { opacity: 0 }, { duration: 0.4 }));
          }
        },
        { stiffness: 40, damping: 14 },
      ),
    );
  }

  /* ----------------------------- frame ----------------------------------- */

  /** Once a route is drawn, a soft glowing dot keeps travelling along it. */
  private renderComets(time: number): void {
    if (!this.visibility.isVisible) return;

    this.routes.forEach((route) => {
      if (!route.isDrawn) return;

      const { path, cometDot, cometGlow } = route.elements;
      const progress = (time / COMET_CYCLE_MS + route.phase) % 1;
      const point = path.getPointAtLength(route.length * progress);
      const opacity = Math.sin(progress * Math.PI);

      cometDot.setAttribute("cx", String(point.x));
      cometDot.setAttribute("cy", String(point.y));
      cometDot.setAttribute("opacity", String(opacity));
      cometGlow.setAttribute("cx", String(point.x));
      cometGlow.setAttribute("cy", String(point.y));
      cometGlow.setAttribute("opacity", String(opacity * 0.22));
    });
  }
}
