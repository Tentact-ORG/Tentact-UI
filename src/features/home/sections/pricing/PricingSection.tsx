"use client";

import { useRef } from "react";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { FitFrame } from "@/components/ui/FitFrame";
import { Reveal } from "@/components/ui/Reveal";
import { buildSalesMailto, SITE } from "@/config/site";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { cx } from "@/lib/cx";
import { formatThousands } from "@/lib/math";
import {
  FESTIVE_SAVING,
  INCLUDED_FEATURES,
  OFFER_CTA,
  PRICING,
  SPARKLES,
  TOTAL_SAVING,
} from "./pricing.data";
import { useOfferPricing } from "./useOfferPricing";
import styles from "./PricingSection.module.css";

const PETAL_ID = "rangoli-petal";
const PETAL_ROTATIONS = [45, 90, 135, 180, 225, 270, 315];

function Rangoli() {
  return (
    <svg className={styles.rangoli} viewBox="0 0 200 200" aria-hidden="true">
      <g fill="none" stroke="#ff4a1c" strokeWidth="1.2">
        <circle cx="100" cy="100" r="30" strokeDasharray="2 5" />
        <circle cx="100" cy="100" r="52" />
        <circle cx="100" cy="100" r="74" strokeDasharray="1 6" />
        <g id={PETAL_ID}>
          <path d="M100 26 C112 46 112 60 100 74 C88 60 88 46 100 26Z" fill="rgba(255,179,71,.25)" />
        </g>
        {PETAL_ROTATIONS.map((angle) => (
          <use key={angle} href={`#${PETAL_ID}`} transform={`rotate(${angle} 100 100)`} />
        ))}
      </g>
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg className={styles.flame} viewBox="0 0 14 18">
      <path d="M7 1C9 5 12 7 12 11a5 5 0 01-10 0c0-3 2-4 3-6 0 2 1 3 2 3 0-2 0-4 0-7z" fill="#fff" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.5" y="6" width="9" height="6.5" rx="1.5" />
      <path d="M4.5 6V4.5a2.5 2.5 0 015 0V6" />
    </svg>
  );
}

function OfferNote({ isRevealed }: { isRevealed: boolean }) {
  if (isRevealed) {
    return (
      <p className={styles.note}>
        You save <b>${formatThousands(TOTAL_SAVING)}</b> in total — ${FESTIVE_SAVING} festive offer, plus your 10%
        insider discount. Offer runs through the Dasara &amp; Diwali season.
      </p>
    );
  }

  return (
    <p className={styles.note}>
      The festive price is already ${FESTIVE_SAVING} off. There&apos;s one more saving sealed above — reveal it before
      you apply. Offer runs through the Dasara &amp; Diwali season.
    </p>
  );
}

function IncludedPanel() {
  return (
    <div className={styles.includedSide}>
      <h3>What&apos;s included</h3>
      <ul>
        {INCLUDED_FEATURES.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <div className={styles.mailCard}>
        <small>Contact us</small>
        <a href={buildSalesMailto()}>
          {SITE.salesEmail} <span>→</span>
        </a>
      </div>
    </div>
  );
}

export function PricingSection() {
  const dealRef = useRef<HTMLDivElement>(null);
  const basePriceRef = useRef<HTMLSpanElement>(null);
  const insiderChipRef = useRef<HTMLSpanElement>(null);

  useScrollReveal(dealRef);
  const { festivePrice, finalPrice, isRevealed, reveal } = useOfferPricing({
    deal: dealRef,
    basePrice: basePriceRef,
    insiderChip: insiderChipRef,
  });
  const cta = isRevealed ? OFFER_CTA.revealed : OFFER_CTA.sealed;

  return (
    <FitFrame id="pricing" className={cx("sec", styles.section)} origin="top">
      <div className={cx("center", styles.header)}>
        <Reveal as="span" className={cx("micro", styles.eyebrow)}>
          ( 006 ) — Pricing
        </Reveal>
        <Reveal as="h2" className={cx("h2", styles.title)}>
          One plan.
          <br />
          <em>Festive price.</em>
        </Reveal>
        <Reveal as="p" className={cx("lead", styles.intro)}>
          420+ million verified, ICP-based data for one price — and this Dasara &amp; Diwali, it&apos;s lower than
          ever.
        </Reveal>
      </div>

      <div ref={dealRef} className={styles.deal} data-rv="">
        <div className={styles.offerSide}>
          <Rangoli />
          <div className={styles.sparkles}>
            {SPARKLES.map((sparkle) => (
              <i key={sparkle.left} style={{ left: sparkle.left, top: sparkle.top, animationDelay: sparkle.delay }} />
            ))}
          </div>
          <span className={styles.badge}>
            <FlameIcon />
            Dasara · Diwali offer
          </span>

          <div className={styles.rows}>
            <div className={styles.row}>
              <span className={styles.rowLabel}>
                <b>Base price</b>The regular price
              </span>
              <span ref={basePriceRef} className={styles.was}>
                ${formatThousands(PRICING.basePrice)}
              </span>
            </div>

            <div className={styles.row}>
              <span className={styles.rowLabel}>
                <b>Festive offer</b>Dasara &amp; Diwali
              </span>
              <span className={styles.now}>
                <sup>$</sup>
                <span>{formatThousands(festivePrice)}</span>
              </span>
            </div>

            <div className={styles.row}>
              <span className={styles.rowLabel}>
                <b>Insider discount</b>
                {isRevealed ? (
                  <span ref={insiderChipRef} className={styles.insiderChip}>
                    −10% insider discount
                  </span>
                ) : (
                  <span className={styles.hint}>One more saving, sealed for you</span>
                )}
              </span>
              <span className={cx(styles.sealed, isRevealed && styles.sealedOpen)}>
                <span className={styles.finalPrice} aria-hidden={!isRevealed}>
                  ${formatThousands(finalPrice)}
                </span>
                <button type="button" className={styles.revealButton} onClick={reveal}>
                  <LockIcon />
                  Reveal my price
                </button>
              </span>
            </div>
          </div>

          <div className={styles.actions}>
            <ButtonLink variant="red" href={cta.href} withArrow>
              {cta.label}
            </ButtonLink>
            <ButtonLink variant="line" href={buildSalesMailto()}>
              Ask a question
            </ButtonLink>
          </div>
          <OfferNote isRevealed={isRevealed} />
        </div>

        <IncludedPanel />
      </div>
    </FitFrame>
  );
}
