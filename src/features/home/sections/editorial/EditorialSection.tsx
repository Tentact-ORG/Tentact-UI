"use client";

import Image from "next/image";
import { Fragment, useRef } from "react";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { useElementList } from "@/hooks/useElementList";
import { useScene } from "@/hooks/useScene";
import { cx } from "@/lib/cx";
import { EDITORIAL_HIGHLIGHTS, EDITORIAL_META, SIDE_PHOTO_DEPTH, TICKER_ITEMS } from "./editorial.data";
import { EditorialScene } from "./editorial.scene";
import { SplitText } from "./SplitText";
import styles from "./EditorialSection.module.css";

export function EditorialSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const mainFigureRef = useRef<HTMLElement>(null);
  const mainImageRef = useRef<HTMLImageElement>(null);
  const focusRef = useRef<HTMLDivElement>(null);
  const focusLabelRef = useRef<HTMLDivElement>(null);
  const lineOneRef = useRef<HTMLSpanElement>(null);
  const lineTwoRef = useRef<HTMLSpanElement>(null);
  const leftPhotoRef = useRef<HTMLDivElement>(null);
  const rightPhotoRef = useRef<HTMLDivElement>(null);

  const lineOneChars = useElementList<HTMLSpanElement>();
  const lineTwoChars = useElementList<HTMLSpanElement>();
  const supportingItems = useElementList<HTMLElement>();

  useScene(() => {
    const scene = new EditorialScene({
      section: sectionRef.current!,
      stage: stageRef.current!,
      mainFigure: mainFigureRef.current!,
      mainImage: mainImageRef.current!,
      focus: focusRef.current!,
      focusLabel: focusLabelRef.current!,
      lineOne: lineOneRef.current!,
      lineTwo: lineTwoRef.current!,
      lineOneChars: lineOneChars.items.current,
      lineTwoChars: lineTwoChars.items.current,
      sidePhotos: [
        { element: leftPhotoRef.current!, depth: SIDE_PHOTO_DEPTH.left },
        { element: rightPhotoRef.current!, depth: SIDE_PHOTO_DEPTH.right },
      ],
      supportingItems: supportingItems.items.current,
    });
    scene.start();
    return () => scene.dispose();
  });

  return (
    <section ref={sectionRef} className={styles.section} id="real">
      <div ref={supportingItems.register(0)} className={cx(styles.meta, "micro")} data-intro="">
        {EDITORIAL_META.map(([top, bottom]) => (
          <span key={top}>
            {top}
            <br />
            {bottom}
          </span>
        ))}
      </div>

      <div ref={stageRef} className={styles.stage}>
        <figure ref={mainFigureRef} className={styles.main} data-intro="">
          <Image
            ref={mainImageRef}
            className={styles.photo}
            src="/assets/people/statues.jpg"
            alt="A real person standing among identical marble statues"
            fill
            sizes="(max-width: 860px) 100vw, min(31vw, 470px)"
          />
          <div ref={focusRef} className={styles.focus}>
            <i />
            <i />
            <i />
            <i />
          </div>
          <div ref={focusLabelRef} className={styles.focusLabel}>
            <span className={styles.focusDot} />
            Real buyer · verified
          </div>
        </figure>

        <h2 className={styles.title}>
          <span ref={lineOneRef} className={styles.lineOne}>
            <SplitText
              text="Real buyers,"
              wordClassName={styles.word}
              charClassName={styles.char}
              registerChar={lineOneChars.register}
            />
          </span>
          <span ref={lineTwoRef} className={styles.lineTwo}>
            <em>
              <SplitText
                text="not lookalikes."
                wordClassName={styles.word}
                charClassName={styles.char}
                registerChar={lineTwoChars.register}
              />
            </em>
          </span>
        </h2>

        <div ref={leftPhotoRef} className={styles.left} data-intro="">
          <div className={styles.photoFrame}>
            <Image className={styles.photo} src="/assets/people/curly.jpg" alt="" fill sizes="250px" />
          </div>
          <div className={cx(styles.caption, "micro")}>
            <span>Next buyer</span>
            <span>Berlin →</span>
          </div>
        </div>
        <div ref={rightPhotoRef} className={styles.right} data-intro="">
          <div className={styles.photoFrame}>
            <Image className={styles.photo} src="/assets/people/redglasses.jpg" alt="" fill sizes="200px" />
          </div>
        </div>

        <p ref={supportingItems.register(1)} className={styles.copy} data-intro="">
          <span className="micro">What we do</span>
          Everyone sells you the same tired list. We give you 420+ million verified data — filtered to your ICP, so
          every name is someone you can actually sell to.
        </p>
        <div ref={supportingItems.register(2)} className={styles.cta} data-intro="">
          <ButtonLink variant="line" href="#how">
            See how
          </ButtonLink>
          <ButtonLink variant="red" href="#start" withArrow>
            Get your first list
          </ButtonLink>
        </div>
        <div ref={supportingItems.register(3)} className={cx(styles.flow, "micro")} data-intro="">
          {EDITORIAL_HIGHLIGHTS.map((highlight, index) => (
            <Fragment key={highlight}>
              {index > 0 && "·"}
              <b>{highlight}</b>
            </Fragment>
          ))}
        </div>
      </div>

      <div className={styles.ticker}>
        {/* The list is rendered twice so the marquee can loop seamlessly at -50%. */}
        <div className={styles.tickerTrack}>
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, index) => (
            <span key={index}>{item}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
