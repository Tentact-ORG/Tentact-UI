"use client";

import Image from "next/image";
import { useRef } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { useElementList } from "@/hooks/useElementList";
import { useScene } from "@/hooks/useScene";
import { ARC_CARDS, ARC_FEATURES } from "./arc.data";
import { ArcScene } from "./arc.scene";
import styles from "./ArcSection.module.css";

export function ArcSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const arcRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const cards = useElementList<HTMLDivElement>();

  useScene(() => {
    const scene = new ArcScene({
      section: sectionRef.current!,
      arc: arcRef.current!,
      center: centerRef.current!,
      cards: cards.items.current,
    });
    scene.start();
    return () => scene.dispose();
  });

  return (
    <section ref={sectionRef} className={styles.section} id="data">
      <div ref={arcRef} className={styles.arc}>
        {ARC_CARDS.map((card, index) => (
          <div key={card.label} ref={cards.register(index)} className={styles.card}>
            <Image className={styles.photo} src={card.image} alt="" fill sizes="176px" />
            <span className={styles.tick}>✓</span>
            <div className={styles.info} style={{ background: card.chipColor, color: card.chipInk }}>
              <span className={styles.infoLabel}>{card.label}</span>
              <span className={styles.infoValue}>{card.value}</span>
            </div>
          </div>
        ))}
      </div>

      <div ref={centerRef} className={styles.center}>
        <Reveal as="h2" className="h2">
          Every lead arrives <em>complete.</em>
        </Reveal>
        <Reveal as="p" className="lead">
          Not a name and a guess. Every contact is verified and matched to your ideal customer profile, with the
          details you need to start the conversation.
        </Reveal>
        <div className={styles.features}>
          {ARC_FEATURES.map((feature) => (
            <Reveal key={feature.title}>
              <h4>{feature.title}</h4>
              <p>{feature.description}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
