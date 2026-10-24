import { cx } from "@/lib/cx";
import { formatThousands } from "@/lib/math";
import styles from "./StatCard.module.css";

export type StatTone = "ink" | "mint" | "sky" | "yellow" | "peach";

interface StatCardProps {
  label: string;
  value: number;
  detail: string;
  tone: StatTone;
}

const TONE_CLASS: Record<StatTone, string> = {
  ink: styles.toneInk,
  mint: styles.toneMint,
  sky: styles.toneSky,
  yellow: styles.toneYellow,
  peach: styles.tonePeach,
};

/** A pipeline-style figure: status chip, the number, and a line of context. */
export function StatCard({ label, value, detail, tone }: StatCardProps) {
  return (
    <div className={styles.card}>
      <span className={cx(styles.chip, TONE_CLASS[tone])}>
        <i aria-hidden="true" />
        {label}
      </span>
      <strong className={styles.value}>{formatThousands(value)}</strong>
      <span className={styles.detail}>{detail}</span>
    </div>
  );
}
