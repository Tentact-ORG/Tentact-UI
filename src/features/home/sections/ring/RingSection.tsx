"use client";

import Image from "next/image";
import { useRef, type CSSProperties } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { useElementList } from "@/hooks/useElementList";
import { useScene } from "@/hooks/useScene";
import { cx } from "@/lib/cx";
import { PILL_AVATARS, RING_CARDS, RING_CORNERS, TYPED_PROMPTS, type RingCard, type RingCardTone } from "./ring.data";
import { RingScene } from "./ring.scene";
import { TypedPrompt } from "./TypedPrompt";
import styles from "./RingSection.module.css";

const TONE_CLASS: Record<RingCardTone, string | undefined> = {
  plain: undefined,
  red: styles.red,
  yellow: styles.yellow,
  ink: styles.ink,
  lime: styles.lime,
};

function cardSize(card: RingCard): CSSProperties {
  return { "--w": `${card.width}px`, "--h": `${card.height}px` } as CSSProperties;
}

function RingCardContent({ card }: { card: RingCard }) {
  if (card.kind === "photo") {
    return (
      <>
        <Image className={styles.photo} src={card.src} alt="" fill sizes={`${card.width}px`} />
        <span className={styles.photoLabel}>{card.label}</span>
      </>
    );
  }

  return (
    <>
      <span className={styles.label}>{card.label}</span>
      {card.body}
      {card.footer}
    </>
  );
}

export function RingSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const cards = useElementList<HTMLDivElement>();

  useScene(() => {
    const scene = new RingScene({
      section: sectionRef.current!,
      ring: ringRef.current!,
      cards: cards.items.current,
    });
    scene.start();
    return () => scene.dispose();
  });

  return (
    <section ref={sectionRef} className={styles.section} id="how">
      <div className={cx(styles.corner, styles.topLeft)}>{RING_CORNERS.topLeft}</div>
      <div className={cx(styles.corner, styles.topRight)}>{RING_CORNERS.topRight}</div>
      <div className={cx(styles.corner, styles.bottomLeft)}>{RING_CORNERS.bottomLeft}</div>
      <div className={cx(styles.corner, styles.bottomRight)}>{RING_CORNERS.bottomRight}</div>

      <div ref={ringRef} className={styles.ring}>
        {RING_CARDS.map((card, index) => (
          <div
            key={card.id}
            ref={cards.register(index)}
            className={cx(styles.card, card.kind === "data" && styles.data, card.kind === "data" && TONE_CLASS[card.tone])}
            style={cardSize(card)}
          >
            <RingCardContent card={card} />
          </div>
        ))}
      </div>

      <div className={styles.centerWrap}>
        <Reveal className={styles.center}>
          <div className={styles.pill}>
            <span className={styles.recording} />
            Describe the list
            <span className={styles.avatars}>
              {PILL_AVATARS.map((avatar) => (
                <b key={avatar.initials} style={{ background: avatar.color }}>
                  {avatar.initials}
                </b>
              ))}
            </span>
          </div>
          <h2 className="h2">
            Describe the list.
            <br />
            <em>Our AI builds it.</em>
          </h2>
          <TypedPrompt prompts={TYPED_PROMPTS} />
        </Reveal>
      </div>
    </section>
  );
}
