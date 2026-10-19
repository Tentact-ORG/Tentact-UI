import { animate, stagger } from "motion";
import { startAnimationLoop } from "@/lib/animation-loop";
import { Disposer } from "@/lib/disposer";
import { FRAME_BREAKPOINT, prefersReducedMotion } from "@/lib/environment";
import { clamp } from "@/lib/math";
import { SPRING } from "@/lib/motion";
import { observeOnce, trackVisibility, type VisibilityTracker } from "@/lib/observers";
import { createParallaxPointer, type ParallaxPointer } from "@/lib/pointer";

export interface ParallaxLayer {
  element: HTMLElement;
  depth: number;
}

export interface EditorialElements {
  section: HTMLElement;
  stage: HTMLElement;
  mainFigure: HTMLElement;
  mainImage: HTMLElement;
  focus: HTMLElement;
  focusLabel: HTMLElement;
  lineOne: HTMLElement;
  lineTwo: HTMLElement;
  lineOneChars: HTMLElement[];
  lineTwoChars: HTMLElement[];
  sidePhotos: ParallaxLayer[];
  /** Meta row, copy, CTA and highlights — they fade up together after the photo. */
  supportingItems: HTMLElement[];
}

const INTRO_THRESHOLD = 0.2;
/** How far (px) the side photos rise as the section scrolls past. */
const SIDE_PHOTO_SCROLL_RISE = 80;

/**
 * "Real buyers, not lookalikes": a letter-by-letter headline, a photo that
 * wipes open with a focus reticle, and side photos with pointer/scroll parallax.
 */
export class EditorialScene {
  private readonly disposer = new Disposer();
  private readonly reduceMotion = prefersReducedMotion();
  private readonly pointer: ParallaxPointer;
  private readonly visibility: VisibilityTracker;

  constructor(private readonly elements: EditorialElements) {
    this.pointer = createParallaxPointer(this.disposer);
    this.visibility = trackVisibility(elements.section);
    this.disposer.add(this.visibility.disconnect);
  }

  start(): void {
    if (!this.reduceMotion) {
      this.hideIntroElements();
      this.disposer.add(observeOnce(this.elements.stage, () => this.playIntro(), INTRO_THRESHOLD));
    }
    this.disposer.add(startAnimationLoop(() => this.renderFrame()));
  }

  dispose(): void {
    this.disposer.dispose();
  }

  /* ----------------------------- intro ----------------------------------- */

  private hideIntroElements(): void {
    const { mainFigure, sidePhotos, supportingItems, lineOneChars, lineTwoChars, focus, focusLabel } = this.elements;

    [mainFigure, ...sidePhotos.map((layer) => layer.element), ...supportingItems].forEach((element) => {
      element.style.opacity = "0";
    });
    [...lineOneChars, ...lineTwoChars].forEach((char) => {
      char.style.transform = "translateY(110%)";
    });
    focus.style.opacity = "0";
    focusLabel.style.opacity = "0";
  }

  private playIntro(): void {
    const { lineOneChars, lineTwoChars, mainFigure, mainImage, sidePhotos, supportingItems, focus, focusLabel } =
      this.elements;
    const track = <T extends { stop(): void }>(animation: T) => this.disposer.track(animation);

    track(
      animate(lineOneChars, { y: ["110%", "0%"] }, { ...SPRING, stiffness: 120, damping: 16, delay: stagger(0.035) }),
    );
    track(
      animate(
        lineTwoChars,
        { y: ["110%", "0%"] },
        { ...SPRING, stiffness: 120, damping: 16, delay: stagger(0.02, { startDelay: 0.3 }) },
      ),
    );

    track(
      animate(
        mainFigure,
        { clipPath: ["inset(100% 0% 0% 0%)", "inset(0% 0% 0% 0%)"], opacity: [1, 1] },
        { duration: 1.3, ease: [0.75, 0, 0.2, 1] },
      ),
    );
    track(animate(mainImage, { scale: [1.35, 1] }, { duration: 1.8, ease: [0.2, 0.7, 0.2, 1] }));

    track(
      animate(
        sidePhotos.map((layer) => layer.element),
        { opacity: [0, 1], y: [60, 0] },
        { ...SPRING, delay: stagger(0.12, { startDelay: 0.4 }) },
      ),
    );
    track(
      animate(supportingItems, { opacity: [0, 1], y: [20, 0] }, { ...SPRING, delay: stagger(0.08, { startDelay: 0.6 }) }),
    );

    track(animate(focus, { opacity: [0, 1], scale: [1.8, 1] }, { ...SPRING, stiffness: 140, damping: 14, delay: 1.1 }));
    track(animate(focusLabel, { opacity: [0, 1], y: [10, 0] }, { ...SPRING, delay: 1.35 }));
  }

  /* ----------------------------- frame ----------------------------------- */

  private renderFrame(): void {
    if (!this.visibility.isVisible) return;

    this.pointer.step();
    const sectionTop = this.elements.section.getBoundingClientRect().top;
    const scrollProgress = clamp(-sectionTop / window.innerHeight, 0, 1);

    this.renderSidePhotos(scrollProgress);
    this.renderHeadlineDrift(scrollProgress);
  }

  private renderSidePhotos(scrollProgress: number): void {
    const { x, y } = this.pointer.smoothed;
    this.elements.sidePhotos.forEach(({ element, depth }) => {
      element.style.translate = `${-x * depth}px ${-y * depth - scrollProgress * SIDE_PHOTO_SCROLL_RISE}px`;
    });
  }

  /** On desktop the two headline lines slide apart as the section scrolls away. */
  private renderHeadlineDrift(scrollProgress: number): void {
    if (window.innerWidth < FRAME_BREAKPOINT) return;
    this.elements.lineOne.style.translate = `${-scrollProgress * 18}vw 0`;
    this.elements.lineTwo.style.translate = `${scrollProgress * 14}vw 0`;
  }
}
