import { animate, stagger } from "motion";
import { startAnimationLoop } from "@/lib/animation-loop";
import { setStyleIfChanged } from "@/lib/dom";
import { Disposer } from "@/lib/disposer";
import { MOBILE_BREAKPOINT, onFontsReady, prefersReducedMotion } from "@/lib/environment";
import { clamp, cubicBezierPoint, degreesToRadians, easeInOutQuad, round2, type Point } from "@/lib/math";
import { SPRING, springValue } from "@/lib/motion";
import { trackVisibility, type VisibilityTracker } from "@/lib/observers";
import { createParallaxPointer, type ParallaxPointer } from "@/lib/pointer";
import { HERO_BUYERS, HERO_CLOUDS, ORBIT_RINGS, SATELLITE_COUNT } from "./hero.data";

/* ------------------------------------------------------------------------- */
/* Elements                                                                   */
/* ------------------------------------------------------------------------- */

export interface BuyerLinkElements {
  card: HTMLElement;
  group: SVGGElement;
  thread: SVGPathElement;
  threadReveal: SVGPathElement;
  beaconRing: SVGCircleElement;
  beaconCore: SVGCircleElement;
  packetGlow: SVGCircleElement;
  packetCore: SVGCircleElement;
  anchor: SVGCircleElement;
}

export interface HeroElements {
  section: HTMLElement;
  giant: HTMLElement;
  letters: HTMLElement[];
  copy: HTMLElement;
  introItems: HTMLElement[];
  globeWrap: HTMLElement;
  globeImage: HTMLElement;
  /** Globe image, atmosphere, sheen and orbit layers — they rise in together. */
  globeLayers: HTMLElement[];
  pins: HTMLElement[];
  satelliteLayers: HTMLElement[];
  satellites: HTMLElement[];
  tentacles: SVGSVGElement;
  clouds: HTMLElement[];
  buyerLinks: BuyerLinkElements[];
}

/* ------------------------------------------------------------------------- */
/* Tunables                                                                   */
/* ------------------------------------------------------------------------- */

/** Time for one data packet cycle (travel + rest) in ms. */
const PACKET_CYCLE_MS = 3800;
/** How long a buyer card stays in its "just verified" state. */
const HIT_DURATION_MS = 900;
/** Fraction of the globe's rendered width at which tentacles leave its surface. */
const GLOBE_SURFACE_RADIUS = 0.47;

/* ------------------------------------------------------------------------- */
/* Scene state                                                                */
/* ------------------------------------------------------------------------- */

interface SatelliteState {
  layer: HTMLElement;
  element: HTMLElement;
  angle: number;
  ringIndex: 0 | 1;
  speed: number;
}

interface BuyerLinkState {
  elements: BuyerLinkElements;
  x: number;
  y: number;
  keepOnMobile: boolean;
  phase: number;
  lastCycle: number;
  cardWidth: number;
  isMasked: boolean;
}

interface CloudState {
  element: HTMLElement;
  direction: number;
  parallax: number;
  baseOpacity: number;
}

/** Everything measured once per frame before any style is written. */
interface FrameMeasurements {
  width: number;
  height: number;
  scrollProgress: number;
  isMobile: boolean;
  orbitSize: number;
  globeCenter: Point;
  globeRadius: number;
}

/**
 * The sky hero: the giant wordmark, a floating globe with orbiting satellites,
 * clouds that part on scroll, and tentacles that reach out to buyer cards and
 * send them verified data packets.
 */
export class HeroScene {
  private readonly disposer = new Disposer();
  private readonly reduceMotion = prefersReducedMotion();
  private readonly pointer: ParallaxPointer;
  private readonly visibility: VisibilityTracker;

  private readonly satellites: SatelliteState[];
  private readonly buyerLinks: BuyerLinkState[];
  private readonly clouds: CloudState[];

  /** 0 → 1 as the clouds drift in during the intro. */
  private cloudProgress: number;
  /** 0 → 1 as the tentacles draw out from the globe. */
  private tentacleProgress: number;

  constructor(private readonly elements: HeroElements) {
    this.cloudProgress = this.reduceMotion ? 1 : 0;
    this.tentacleProgress = this.reduceMotion ? 1 : 0;
    this.pointer = createParallaxPointer(this.disposer);
    this.visibility = trackVisibility(elements.section);
    this.disposer.add(this.visibility.disconnect);

    this.satellites = this.createSatellites();
    this.buyerLinks = this.createBuyerLinks();
    this.clouds = this.createClouds();
  }

  start(): void {
    if (!this.reduceMotion) this.playIntro();
    this.watchCardWidths();
    this.disposer.add(startAnimationLoop((time) => this.renderFrame(time)));
  }

  dispose(): void {
    this.disposer.dispose();
  }

  /* ----------------------------- setup ----------------------------------- */

  private createSatellites(): SatelliteState[] {
    return this.elements.satellites.map((element, index) => ({
      layer: this.elements.satelliteLayers[index],
      element,
      angle: (index / SATELLITE_COUNT) * Math.PI * 2,
      ringIndex: (index % 2) as 0 | 1,
      speed: 0.0045 + (index % 3) * 0.0012,
    }));
  }

  private createBuyerLinks(): BuyerLinkState[] {
    return this.elements.buyerLinks.map((elements, index) => ({
      elements,
      x: HERO_BUYERS[index].x,
      y: HERO_BUYERS[index].y,
      keepOnMobile: HERO_BUYERS[index].keepOnMobile,
      phase: index * 0.27,
      lastCycle: 0,
      cardWidth: 0,
      isMasked: true,
    }));
  }

  private createClouds(): CloudState[] {
    return this.elements.clouds.map((element, index) => ({
      element,
      direction: HERO_CLOUDS[index].direction,
      parallax: HERO_CLOUDS[index].parallax,
      baseOpacity: Number(getComputedStyle(element).opacity) || 1,
    }));
  }

  private watchCardWidths(): void {
    const measure = () => {
      this.buyerLinks.forEach((link) => {
        link.cardWidth = link.elements.card.offsetWidth;
      });
    };
    measure();
    this.disposer.listen(window, "resize", measure);
    onFontsReady(measure);
  }

  /* ----------------------------- intro ----------------------------------- */

  private playIntro(): void {
    const { letters, globeLayers, pins, introItems } = this.elements;

    this.hideIntroElements();

    this.disposer.track(
      animate(
        letters,
        { y: ["70%", "0%"], opacity: [0, 1] },
        { ...SPRING, stiffness: 70, damping: 15, delay: stagger(0.06, { startDelay: 0.1 }) },
      ),
    );

    // The globe rises with its glow and orbits; pins only appear once it has landed.
    this.disposer.track(
      animate(
        globeLayers,
        { y: [220, 0], scale: [0.82, 1], opacity: [0, 1] },
        { ...SPRING, stiffness: 36, damping: 12, delay: 0.25 },
      ),
    );
    this.disposer.timeout(() => {
      this.disposer.track(
        animate(
          pins,
          { opacity: [0, 1], scale: [0, 1] },
          { type: "spring", stiffness: 320, damping: 12, delay: stagger(0.14) },
        ),
      );
    }, 1700);

    this.disposer.track(
      springValue(0, 1, (value) => (this.cloudProgress = value), { stiffness: 26, damping: 13, delay: 0.3 }),
    );

    this.disposer.track(
      animate(introItems, { opacity: [0, 1], y: [24, 0] }, { ...SPRING, delay: stagger(0.1, { startDelay: 0.9 }) }),
    );

    this.disposer.timeout(() => {
      this.disposer.track(
        springValue(0, 1, (value) => (this.tentacleProgress = value), { stiffness: 22, damping: 12 }),
      );
    }, 1500);
  }

  private hideIntroElements(): void {
    const { introItems, globeLayers, pins } = this.elements;
    [...introItems, ...globeLayers].forEach((element) => {
      element.style.opacity = "0";
    });
    pins.forEach((pin) => {
      pin.style.opacity = "0";
      // Matches the original page: the standalone CSS `scale` stays at 0 while the intro animates
      // `transform: scale()`, so the two multiply to zero and the pins remain hidden.
      // Set `pin.style.transform = "scale(0)"` instead to have them pop in once the globe lands.
      pin.style.scale = "0";
    });
  }

  /* ----------------------------- frame ----------------------------------- */

  private renderFrame(time: number): void {
    if (!this.visibility.isVisible) return;

    this.pointer.step();
    const frame = this.measureFrame();

    this.renderParallax(frame);
    this.renderClouds(frame);
    this.renderSatellites(frame);
    this.renderBuyerLinks(frame, time);
  }

  /** Reads first (layout is clean at the start of the frame); every render step after this only writes. */
  private measureFrame(): FrameMeasurements {
    const { section, globeImage, globeWrap } = this.elements;
    const height = section.offsetHeight;
    const width = section.clientWidth;
    const globeRect = globeImage.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();

    return {
      width,
      height,
      scrollProgress: clamp(window.scrollY / height, 0, 1),
      isMobile: width < MOBILE_BREAKPOINT,
      orbitSize: globeWrap.clientWidth,
      globeCenter: {
        x: globeRect.left - sectionRect.left + globeRect.width / 2,
        y: globeRect.top - sectionRect.top + globeRect.height / 2,
      },
      globeRadius: globeRect.width * GLOBE_SURFACE_RADIUS,
    };
  }

  private renderParallax({ scrollProgress: p }: FrameMeasurements): void {
    const { giant, globeWrap, copy } = this.elements;
    const { x: px, y: py } = this.pointer.smoothed;

    setStyleIfChanged(giant, "translate", `${round2(-px * 6)}px ${round2(-p * 60)}%`);
    setStyleIfChanged(giant, "opacity", round2(1 - p * 1.3));
    setStyleIfChanged(globeWrap, "translate", `${round2(-px * 14)}px ${round2(-py * 8 - p * 22)}%`);
    setStyleIfChanged(globeWrap, "scale", round2(1 + p * 0.22));
    setStyleIfChanged(copy, "translate", `0 ${round2(-p * 90)}px`);
    setStyleIfChanged(copy, "opacity", round2(1 - p * 1.5));
  }

  /** Clouds drift in during the intro and part to the sides as the page scrolls. */
  private renderClouds({ scrollProgress: p }: FrameMeasurements): void {
    const { x: px, y: py } = this.pointer.smoothed;

    this.clouds.forEach((cloud) => {
      const partOffset = cloud.direction * ((1 - this.cloudProgress) * 40 + p * 45);
      const sink = cloud.direction === 0 ? p * 20 : 0;
      const translateX = `calc(${round2(partOffset)}vw + ${round2(-px * cloud.parallax)}px)`;
      const translateY = `${round2(sink - py * cloud.parallax * 0.6)}px`;

      setStyleIfChanged(cloud.element, "translate", `${translateX} ${translateY}`);
      setStyleIfChanged(cloud.element, "opacity", round2(this.cloudProgress * cloud.baseOpacity));
    });
  }

  /** Satellites travel along tilted ellipses, passing in front of and behind the globe. */
  private renderSatellites({ orbitSize }: FrameMeasurements): void {
    this.satellites.forEach((satellite) => {
      if (!this.reduceMotion) satellite.angle += satellite.speed;

      const ring = ORBIT_RINGS[satellite.ringIndex];
      const radiusX = ring.radiusX / 100;
      const radiusY = ring.radiusY / 100;
      const tilt = degreesToRadians(ring.tilt);

      const x = Math.cos(satellite.angle) * radiusX;
      const y = Math.sin(satellite.angle) * radiusY;
      const isInFront = Math.sin(satellite.angle) > 0;

      const left = (x * Math.cos(tilt) - y * Math.sin(tilt) + 0.5) * orbitSize;
      const top = (x * Math.sin(tilt) + y * Math.cos(tilt) + 0.5) * orbitSize;

      satellite.layer.style.zIndex = isInFront ? "5" : "1";
      satellite.element.style.transform = `translate(${left}px,${top}px) scale(${isInFront ? 1 : 0.6})`;
      satellite.element.style.opacity = isInFront ? "1" : "0.5";
    });
  }

  /** Tentacles follow the (moving) globe out to each buyer card. */
  private renderBuyerLinks(frame: FrameMeasurements, time: number): void {
    const viewBox = `0 0 ${frame.width} ${frame.height}`;
    if (this.elements.tentacles.getAttribute("viewBox") !== viewBox) {
      this.elements.tentacles.setAttribute("viewBox", viewBox);
    }

    this.buyerLinks.forEach((link, index) => this.renderBuyerLink(link, index, frame, time));
  }

  private renderBuyerLink(link: BuyerLinkState, index: number, frame: FrameMeasurements, time: number): void {
    const { card, group } = link.elements;
    const { width: W, height: H, isMobile, globeCenter, globeRadius, scrollProgress } = frame;

    group.style.visibility = isMobile ? "hidden" : "";
    if (isMobile && !link.keepOnMobile) {
      card.style.opacity = "0";
      return;
    }

    // Card position (gently floating).
    let cardX = (link.x / 100) * W;
    let cardY = (link.y / 100) * H;
    if (isMobile) {
      const isLeft = link.x < 50;
      cardX = isLeft ? W * 0.3 : W * 0.68;
      cardY = H * (isLeft ? 0.66 : 0.76);
    }
    if (!this.reduceMotion) cardY += Math.sin((time / 1000) * 1.1 + index * 1.7) * 5;

    // The curve runs from the globe's surface to the near edge of the card.
    const end: Point = {
      x: cardX + (cardX < globeCenter.x ? link.cardWidth / 2 - 6 : -link.cardWidth / 2 + 6),
      y: cardY,
    };
    const curve = this.buildTentacleCurve(globeCenter, globeRadius, end, index);
    const pathData = `M${curve.start.x},${curve.start.y} C${curve.control1.x},${curve.control1.y} ${curve.control2.x},${curve.control2.y} ${end.x},${end.y}`;
    link.elements.thread.setAttribute("d", pathData);
    link.elements.threadReveal.setAttribute("d", pathData);

    // Draw-in progress for this link, staggered by index.
    const drawn = clamp(this.tentacleProgress * 1.5 - index * 0.12, 0, 1);
    const cardIn = clamp(drawn * 2 - 1, 0, 1);

    this.renderThread(link, drawn, time);
    this.renderCard(link, cardX, cardY, cardIn, scrollProgress);
    this.renderEndpoints(link, curve.start, end, drawn, cardIn);
    this.renderPacket(link, curve, end, drawn, time);
  }

  private buildTentacleCurve(globeCenter: Point, globeRadius: number, end: Point, index: number) {
    const angle = Math.atan2(end.y - globeCenter.y, end.x - globeCenter.x);
    const start: Point = {
      x: globeCenter.x + Math.cos(angle) * globeRadius,
      y: globeCenter.y + Math.sin(angle) * globeRadius,
    };

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const normalX = -dy / length;
    const normalY = dx / length;
    const wobble = (index % 2 ? 1 : -1) * length * 0.22;

    return {
      start,
      control1: { x: start.x + dx * 0.35 + normalX * wobble, y: start.y + dy * 0.35 + normalY * wobble },
      control2: { x: start.x + dx * 0.65 - normalX * wobble, y: start.y + dy * 0.65 - normalY * wobble },
    };
  }

  /** The thread draws out from the globe, then its dots keep flowing towards the buyer. */
  private renderThread(link: BuyerLinkState, drawn: number, time: number): void {
    const { thread, threadReveal } = link.elements;

    if (link.isMasked) {
      threadReveal.style.strokeDashoffset = String(100 * (1 - drawn));
      if (drawn >= 1) {
        // Fully drawn: drop the mask so the browser stops compositing it every frame.
        thread.removeAttribute("mask");
        link.isMasked = false;
      }
    }
    thread.style.strokeDashoffset = this.reduceMotion ? "0" : String(-(((time / 1000) * 2.4) % 100));
  }

  private renderCard(link: BuyerLinkState, x: number, y: number, cardIn: number, scrollProgress: number): void {
    const { card } = link.elements;
    card.style.opacity = String(cardIn * (1 - scrollProgress * 1.4));
    card.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${(0.85 + 0.15 * cardIn).toFixed(3)})`;
  }

  private renderEndpoints(link: BuyerLinkState, start: Point, end: Point, drawn: number, cardIn: number): void {
    const { anchor, beaconRing, beaconCore } = link.elements;

    anchor.setAttribute("cx", String(end.x));
    anchor.setAttribute("cy", String(end.y));
    anchor.style.opacity = String(cardIn);

    [beaconRing, beaconCore].forEach((circle) => {
      circle.setAttribute("cx", String(start.x));
      circle.setAttribute("cy", String(start.y));
      circle.style.opacity = String(Math.min(1, drawn * 4));
    });
  }

  /**
   * A data packet travels globe → buyer during the first half of each cycle;
   * when it lands, the buyer card flashes "verified".
   */
  private renderPacket(
    link: BuyerLinkState,
    curve: { start: Point; control1: Point; control2: Point },
    end: Point,
    drawn: number,
    time: number,
  ): void {
    const { packetCore, packetGlow, card } = link.elements;
    let packetOpacity = 0;

    if (drawn >= 1 && !this.reduceMotion) {
      const cycle = (time / PACKET_CYCLE_MS + link.phase) % 1;
      const travel = cycle / 0.5;

      if (travel < 1) {
        // Point on the cubic curve itself — no SVG length queries, so no forced layout.
        const point = cubicBezierPoint(curve.start, curve.control1, curve.control2, end, easeInOutQuad(travel));
        [packetGlow, packetCore].forEach((circle) => {
          circle.setAttribute("cx", point.x.toFixed(1));
          circle.setAttribute("cy", point.y.toFixed(1));
        });
        packetOpacity = Math.sin(travel * Math.PI) ** 0.5;
      }

      if (link.lastCycle < 0.5 && cycle >= 0.5) this.flashVerified(card);
      link.lastCycle = cycle;
    }

    packetCore.setAttribute("opacity", String(packetOpacity));
    packetGlow.setAttribute("opacity", String(packetOpacity * 0.6));
  }

  private flashVerified(card: HTMLElement): void {
    card.dataset.hit = "";
    // Fires every few seconds, so it is not tracked by the disposer (that list would grow forever);
    // clearing a data attribute on an unmounted node is harmless.
    window.setTimeout(() => delete card.dataset.hit, HIT_DURATION_MS);
  }
}
