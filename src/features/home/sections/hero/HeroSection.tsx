"use client";

import Image from "next/image";
import { useRef } from "react";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { useElementList, useElementRecordList } from "@/hooks/useElementList";
import { useScene } from "@/hooks/useScene";
import { cx } from "@/lib/cx";
import {
  EXAMPLE_QUERIES,
  GLOBE_PINS,
  HERO_BUYERS,
  HERO_CLOUDS,
  ORBIT_RINGS,
  SATELLITE_COUNT,
  type HeroCloud,
} from "./hero.data";
import { HeroScene, type BuyerLinkElements } from "./hero.scene";
import { PromptSlider } from "./PromptSlider";
import styles from "./HeroSection.module.css";

const WORDMARK = "Tentact";
const PACKET_GLOW_ID = "hero-packet-glow";
const maskId = (index: number) => `hero-tentacle-mask-${index}`;

const BACK_CLOUDS = HERO_CLOUDS.filter((cloud) => cloud.depth === "back");
const FRONT_CLOUDS = HERO_CLOUDS.filter((cloud) => cloud.depth === "front");

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const giantRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const globeWrapRef = useRef<HTMLDivElement>(null);
  const globeImageRef = useRef<HTMLImageElement>(null);
  const atmosphereRef = useRef<HTMLDivElement>(null);
  const sheenRef = useRef<HTMLDivElement>(null);
  const orbitRingsRef = useRef<HTMLDivElement>(null);
  const tentaclesRef = useRef<SVGSVGElement>(null);

  const letters = useElementList<HTMLSpanElement>();
  const introItems = useElementList<HTMLElement>();
  const pins = useElementList<HTMLSpanElement>();
  const satelliteLayers = useElementList<HTMLDivElement>();
  const satellites = useElementList<HTMLSpanElement>();
  const clouds = useElementList<HTMLImageElement>();
  const buyerLinks = useElementRecordList<BuyerLinkElements>(HERO_BUYERS.length);

  useScene(() => {
    const scene = new HeroScene({
      section: sectionRef.current!,
      giant: giantRef.current!,
      letters: letters.items.current,
      copy: copyRef.current!,
      introItems: introItems.items.current,
      globeWrap: globeWrapRef.current!,
      globeImage: globeImageRef.current!,
      globeLayers: [
        globeImageRef.current!,
        atmosphereRef.current!,
        sheenRef.current!,
        orbitRingsRef.current!,
        ...satelliteLayers.items.current,
      ],
      pins: pins.items.current,
      satelliteLayers: satelliteLayers.items.current,
      satellites: satellites.items.current,
      tentacles: tentaclesRef.current!,
      clouds: clouds.items.current,
      buyerLinks: buyerLinks.read(),
    });
    scene.start();
    return () => scene.dispose();
  });

  // Clouds are registered in HERO_CLOUDS order so the scene can pair each element with its config.
  const renderCloud = (cloud: HeroCloud) => (
    <Image
      key={cloud.id}
      ref={clouds.register(HERO_CLOUDS.indexOf(cloud))}
      className={cx(styles.cloud, styles[cloud.id])}
      src={cloud.src}
      width={cloud.width}
      height={cloud.height}
      loading="eager"
      alt=""
    />
  );

  return (
    <section ref={sectionRef} className={styles.hero} id="top">
      {BACK_CLOUDS.map(renderCloud)}
      <div className={styles.birds}>
        <Image src="/assets/birds.png" width={831} height={306} loading="eager" alt="" />
      </div>
      <div className={cx(styles.birds, styles.birdsFar)}>
        <Image src="/assets/birds.png" width={831} height={306} loading="eager" alt="" />
      </div>

      <div ref={introItems.register(0)} className={cx(styles.eyebrow, "micro")} data-intro="">
        The Tentact® — Sales data studio
      </div>
      <div ref={giantRef} className={styles.giant} aria-hidden="true">
        {[...WORDMARK].map((char, index) => (
          <span key={index} ref={letters.register(index)} className={styles.letter}>
            {char}
          </span>
        ))}
      </div>

      <div ref={globeWrapRef} className={styles.globeWrap}>
        <div className={styles.globeFloat}>
          <div ref={atmosphereRef} className={styles.atmosphere} />
          <div ref={orbitRingsRef} className={styles.orbitRings}>
            {ORBIT_RINGS.map((ring) => (
              <svg key={ring.tilt} className={styles.orbitLine} viewBox="0 0 100 100">
                <ellipse
                  cx="50"
                  cy="50"
                  rx={ring.radiusX}
                  ry={ring.radiusY}
                  transform={`rotate(${ring.tilt} 50 50)`}
                  fill="none"
                  stroke="rgba(255,255,255,.75)"
                  strokeWidth=".18"
                  strokeDasharray=".6 1.4"
                />
              </svg>
            ))}
          </div>
          <Image
            ref={globeImageRef}
            className={styles.globeImage}
            src="/assets/globe.png"
            width={1104}
            height={1104}
            sizes="(max-width: 760px) 118vw, min(60vw, 780px)"
            preload
            alt="White relief globe"
          />
          <div ref={sheenRef} className={styles.sheen} />
          {GLOBE_PINS.map((pin, index) => (
            <span
              key={index}
              ref={pins.register(index)}
              className={styles.pin}
              style={{ left: `${pin.left}%`, top: `${pin.top}%` }}
            />
          ))}
          {Array.from({ length: SATELLITE_COUNT }, (_, index) => (
            <div key={index} ref={satelliteLayers.register(index)} className={styles.satelliteLayer}>
              <span ref={satellites.register(index)} className={styles.satellite} />
            </div>
          ))}
        </div>
      </div>

      <svg ref={tentaclesRef} className={styles.tentacles} aria-hidden="true">
        <defs>
          <radialGradient id={PACKET_GLOW_ID}>
            <stop offset="0" stopColor="#fff" stopOpacity=".9" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          {HERO_BUYERS.map((buyer, index) => (
            <mask key={buyer.initials} id={maskId(index)} maskUnits="userSpaceOnUse">
              <path ref={buyerLinks.register(index, "threadReveal")} className={styles.threadReveal} pathLength={100} />
            </mask>
          ))}
        </defs>
        {HERO_BUYERS.map((buyer, index) => (
          <g key={buyer.initials} ref={buyerLinks.register(index, "group")}>
            <path
              ref={buyerLinks.register(index, "thread")}
              className={styles.thread}
              pathLength={100}
              mask={`url(#${maskId(index)})`}
            />
            <circle ref={buyerLinks.register(index, "beaconRing")} className={styles.beaconRing} r={3.5} />
            <circle ref={buyerLinks.register(index, "beaconCore")} className={styles.beaconCore} r={3.5} />
            <circle ref={buyerLinks.register(index, "packetGlow")} className={styles.packetGlow} r={11} opacity={0} />
            <circle ref={buyerLinks.register(index, "packetCore")} className={styles.packetCore} r={3.4} opacity={0} />
            <circle ref={buyerLinks.register(index, "anchor")} className={styles.anchor} r={4} />
          </g>
        ))}
      </svg>

      {HERO_BUYERS.map((buyer, index) => (
        <div
          key={buyer.initials}
          ref={buyerLinks.register(index, "card")}
          className={styles.buyer}
          data-keep={buyer.keepOnMobile ? "" : undefined}
        >
          <span className={styles.avatar} style={{ background: buyer.avatarColor }}>
            {buyer.initials}
          </span>
          <div>
            <b>{buyer.name}</b>
            <small>{buyer.role}</small>
          </div>
          <i className={styles.verified}>✓</i>
        </div>
      ))}

      {FRONT_CLOUDS.map(renderCloud)}

      <div ref={copyRef} className={styles.copy}>
        <h1 ref={introItems.register(1)} data-intro="">
          Sales data <em>for people who sell.</em>
        </h1>
        <p ref={introItems.register(2)} data-intro="">
          <b>420+ million verified data</b>, filtered to your ideal customer profile.
        </p>
        <div ref={introItems.register(3)} className={styles.ctas} data-intro="">
          <ButtonLink variant="red" href="#start" withArrow>
            Get your first list
          </ButtonLink>
          <ButtonLink variant="glass" href="#how">
            See how it works
          </ButtonLink>
        </div>
      </div>

      <div ref={introItems.register(4)} className={styles.bottom} data-intro="">
        <PromptSlider queries={EXAMPLE_QUERIES} />
      </div>
    </section>
  );
}
