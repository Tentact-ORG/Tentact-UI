import { FitFrame } from "@/components/ui/FitFrame";
import { Reveal } from "@/components/ui/Reveal";
import { cx } from "@/lib/cx";
import { buildReachMapModel } from "./reach.model.server";
import { ReachMap } from "./ReachMap";
import styles from "./ReachSection.module.css";

/** Server component: projects the map once, then hands finished data to the interactive client map. */
export function ReachSection() {
  const model = buildReachMapModel();

  return (
    <FitFrame id="reach" className={cx("sec", styles.section)} origin="bottom">
      <div className="center">
        <Reveal as="span" className={cx("micro", styles.eyebrow)}>
          ( 004 ) — Reach
        </Reveal>
        <Reveal as="h2" className={cx("h2", styles.title)}>
          Our tentacles reach
          <br />
          <em>every market.</em>
        </Reveal>
        <Reveal as="p" className={cx("lead", styles.intro)}>
          420+ million verified data across every market. Here&apos;s one ICP search, traced live.
        </Reveal>
      </div>
      <ReachMap model={model} />
    </FitFrame>
  );
}
