"use client";

import styles from "../pages/Pages.module.css";

/** States where the records on screen come from. */
export function DataSourceBadge() {
  return (
    <span className={styles.dataBadge} title="Searched live in the lead warehouse">
      <i aria-hidden="true" />
      Live workspace data
    </span>
  );
}
