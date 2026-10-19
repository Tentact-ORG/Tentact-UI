"use client";

import Image from "next/image";
import { useRef } from "react";
import { FitFrame } from "@/components/ui/FitFrame";
import { Reveal } from "@/components/ui/Reveal";
import { buildSalesMailto, SITE } from "@/config/site";
import { usePointerTilt } from "@/hooks/usePointerTilt";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { cx } from "@/lib/cx";
import styles from "./FinalSection.module.css";

const TILT = { maxRotateX: 12, maxRotateY: 14, hoverScale: 1.02 } as const;

export function FinalSection() {
  const cardRef = useRef<HTMLDivElement>(null);
  const cardInnerRef = useRef<HTMLDivElement>(null);

  useScrollReveal(cardRef);
  usePointerTilt(cardRef, cardInnerRef, TILT);

  return (
    <FitFrame id="start" className="sec">
      <div className={styles.grid}>
        <div>
          <Reveal as="span" className={cx("micro", styles.eyebrow)}>
            ( 007 ) — Your move
          </Reveal>
          <Reveal as="h2" className="h2">
            Stop renting lists.
            <br />
            <em>Take yours.</em>
          </Reveal>
          <Reveal as="p" className="lead">
            Your first verified list in minutes. Questions? Write to{" "}
            <a className={styles.emailLink} href={buildSalesMailto()}>
              {SITE.salesEmail}
            </a>
            .
          </Reveal>
        </div>

        <div ref={cardRef} className={styles.card} data-rv="">
          <div ref={cardInnerRef} className={styles.cardInner}>
            <Image
              className={styles.photo}
              src="/assets/people/takeyours.jpg"
              alt="A man reaching out of a cardboard box printed with TAKE YOURS"
              fill
              sizes="(max-width: 860px) 100vw, 45vw"
            />
          </div>
        </div>
      </div>
    </FitFrame>
  );
}
