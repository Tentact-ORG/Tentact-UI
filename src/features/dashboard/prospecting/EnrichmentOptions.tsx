"use client";

import { EXPORT_BUNDLES, EXPORT_FIELDS } from "@/lib/exportFields";
import { useWorkspaceData } from "../WorkspaceDataContext";
import styles from "./Prospecting.module.css";

/**
 * The Enrich tab: what each exported contact includes, in bundles of export
 * fields (the same choice as the export window's checklist).
 */
export function EnrichmentOptions() {
  const { exportFields, setExportFields } = useWorkspaceData();
  const chosen = new Set(exportFields);
  const selectedCount = EXPORT_BUNDLES.filter((bundle) => bundle.fields.every((key) => chosen.has(key))).length;

  const toggle = (fields: readonly string[], on: boolean) =>
    setExportFields((current) => {
      const next = new Set(current);
      fields.forEach((key) => (on ? next.add(key) : next.delete(key)));
      const ordered = EXPORT_FIELDS.filter((field) => next.has(field.key)).map((field) => field.key);
      return ordered.length > 0 ? ordered : current;
    });

  return (
    <div className={styles.enrichment}>
      <p className={styles.enrichmentIntro}>
        Choose what each exported contact includes. These set the fields in the export window; email and phone cost credits.{" "}
        <b>{selectedCount}</b> of {EXPORT_BUNDLES.length} selected.
      </p>
      <ul className={styles.enrichmentList}>
        {EXPORT_BUNDLES.map((bundle) => (
          <li key={bundle.key}>
            <label className={styles.enrichmentOption}>
              <input type="checkbox" checked={bundle.fields.every((key) => chosen.has(key))} onChange={(event) => toggle(bundle.fields, event.target.checked)} />
              <span>
                <b>{bundle.label}</b>
                <small>
                  {bundle.description}
                  {bundle.paid ? " Costs credits." : ""}
                </small>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
