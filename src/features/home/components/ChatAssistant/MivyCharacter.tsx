import Image from "next/image";
import { cx } from "@/lib/cx";
import styles from "./MivyCharacter.module.css";

interface MivyCharacterProps {
  /** Rendered height in px; the width follows the artwork (441×600). */
  height: number;
  className?: string;
}

/**
 * Mivy, the chat assistant: the fluffy character, whose eyes blink. The lids
 * are drawn over the white of each eye (positions measured on
 * /assets/mivy/mivy.png). Blinking stops for prefers-reduced-motion.
 */
export function MivyCharacter({ height, className }: MivyCharacterProps) {
  return (
    <span className={cx(styles.root, className)} style={{ height, width: Math.round((height * 441) / 600) }} aria-hidden="true">
      <Image className={styles.art} src="/assets/mivy/mivy.png" alt="" width={441} height={600} sizes={`${Math.round((height * 441) / 600)}px`} draggable={false} />
      <span className={cx(styles.lid, styles.lidLeft)} />
      <span className={cx(styles.lid, styles.lidRight)} />
    </span>
  );
}
