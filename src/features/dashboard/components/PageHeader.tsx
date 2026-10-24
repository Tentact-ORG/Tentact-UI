import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./PageHeader.module.css";

interface PageHeaderProps {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  /** Rendered at the end of the header row, e.g. a badge or an action. */
  aside?: ReactNode;
}

/** The title block every dashboard page starts with. Renders the page's only h1. */
export function PageHeader({ eyebrow, title, description, aside }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div>
        <p className={cx("micro", styles.eyebrow)}>{eyebrow}</p>
        <h1 className={styles.title}>{title}</h1>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {aside}
    </header>
  );
}
