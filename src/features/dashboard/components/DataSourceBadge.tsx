"use client";

import { useWorkspaceData } from "../WorkspaceDataContext";
import styles from "../pages/Pages.module.css";

/** States where the records on screen come from, so sample data is never mistaken for live data. */
export function DataSourceBadge() {
  const { repository } = useWorkspaceData();
  return (
    <span
      className={styles.dataBadge}
      title={repository.isSample ? "Illustrative records until this workspace is connected to its data source" : undefined}
    >
      <i aria-hidden="true" />
      {repository.label}
    </span>
  );
}
