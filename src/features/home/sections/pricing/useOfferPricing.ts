"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { animate } from "motion";
import { Disposer } from "@/lib/disposer";
import { prefersReducedMotion } from "@/lib/environment";
import { springValue, tweenValue } from "@/lib/motion";
import { observeOnce } from "@/lib/observers";
import { INSIDER_PRICE, PRICING } from "./pricing.data";

const DEAL_THRESHOLD = 0.35;
const COUNTDOWN_DELAY_MS = 400;

interface OfferPricingRefs {
  deal: RefObject<HTMLElement | null>;
  /** The struck-through base price; its strike length is driven by the `--strike` custom property. */
  basePrice: RefObject<HTMLElement | null>;
  insiderChip: RefObject<HTMLElement | null>;
}

export interface OfferPricing {
  festivePrice: number;
  finalPrice: number;
  isRevealed: boolean;
  reveal: () => void;
}

/**
 * Drives the festive offer card: when it scrolls into view the base price is
 * struck through and the price counts down to the festive price; revealing the
 * sealed insider discount counts down once more to the final price.
 */
export function useOfferPricing(refs: OfferPricingRefs): OfferPricing {
  const [festivePrice, setFestivePrice] = useState<number>(PRICING.basePrice);
  const [finalPrice, setFinalPrice] = useState<number>(PRICING.festivePrice);
  const [isRevealed, setRevealed] = useState(false);
  const { deal: dealRef, basePrice: basePriceRef, insiderChip: insiderChipRef } = refs;

  useEffect(() => {
    const deal = dealRef.current;
    const basePrice = basePriceRef.current;
    if (!deal || !basePrice) return;

    const setStrike = (value: number) => basePrice.style.setProperty("--strike", String(value));
    const disposer = new Disposer();

    const playCountdown = () => {
      disposer.track(tweenValue(PRICING.basePrice, PRICING.festivePrice, setFestivePrice, { duration: 1.6 }));
      disposer.track(springValue(0, 1, setStrike, { stiffness: 60, damping: 16 }));
    };

    if (prefersReducedMotion()) {
      disposer.track(tweenValue(PRICING.basePrice, PRICING.festivePrice, setFestivePrice, { duration: 0 }));
      setStrike(1);
    } else {
      disposer.add(observeOnce(deal, () => disposer.timeout(playCountdown, COUNTDOWN_DELAY_MS), DEAL_THRESHOLD));
    }

    return () => disposer.dispose();
  }, [dealRef, basePriceRef]);

  useEffect(() => {
    const chip = insiderChipRef.current;
    if (!isRevealed || !chip) return;

    const reduceMotion = prefersReducedMotion();
    if (reduceMotion) chip.style.opacity = "1";

    const chipAnimation = reduceMotion
      ? undefined
      : animate(chip, { opacity: [0, 1], scale: [0.6, 1], rotate: [-6, 0] }, { type: "spring", stiffness: 260, damping: 12 });
    const priceAnimation = tweenValue(PRICING.festivePrice, INSIDER_PRICE, setFinalPrice, {
      duration: reduceMotion ? 0 : 1.4,
      delay: reduceMotion ? 0 : 0.2,
    });

    return () => {
      chipAnimation?.stop();
      priceAnimation.stop();
    };
  }, [isRevealed, insiderChipRef]);

  const reveal = useCallback(() => setRevealed(true), []);

  return { festivePrice, finalPrice, isRevealed, reveal };
}
