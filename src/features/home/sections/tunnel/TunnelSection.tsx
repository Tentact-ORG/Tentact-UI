"use client";

import Image from "next/image";
import { useRef } from "react";
import { FitFrame } from "@/components/ui/FitFrame";
import { Reveal } from "@/components/ui/Reveal";
import { useElementList } from "@/hooks/useElementList";
import { useScene } from "@/hooks/useScene";
import { cx } from "@/lib/cx";
import { AUDIENCE_CARDS } from "./tunnel.data";
import { TunnelScene } from "./tunnel.scene";
import styles from "./TunnelSection.module.css";

export function TunnelSection() {
  const tunnelRef = useRef<HTMLDivElement>(null);
  const cards = useElementList<HTMLDivElement>();

  useScene(() => {
    const scene = new TunnelScene({ tunnel: tunnelRef.current!, cards: cards.items.current });
    scene.start();
    return () => scene.dispose();
  });

  return (
    <FitFrame id="who" className={styles.section}>
      <Reveal as="h2" className="h2 center">
        Whoever you sell to,
        <br />
        <em>they&apos;re in here.</em>
      </Reveal>

      <div ref={tunnelRef} className={styles.tunnel}>
        {AUDIENCE_CARDS.map((card, index) => (
          <div key={card.label} ref={cards.register(index)} className={styles.card}>
            <Image className={styles.photo} src={card.image} alt="" fill sizes="(max-width: 860px) 200px, 320px" />
            <span className={styles.label}>{card.label}</span>
          </div>
        ))}
      </div>

      <div className={cx(styles.copy, "center")}>
        <Reveal as="p" className="lead">
          Be the strategist. Let the tentacles do the digging.
          <br />
          Describe a buyer, watch the list assemble, and refine it until it&apos;s exactly who you want.
        </Reveal>
      </div>
    </FitFrame>
  );
}
