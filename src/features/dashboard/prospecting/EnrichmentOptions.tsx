"use client";

import { useWorkspaceData } from "../WorkspaceDataContext";
import { ENRICHMENT_FIELDS } from "./prospect.filters";
import styles from "./Prospecting.module.css";

/** The enrichment choices, shared by the search panel's Enrich tab and the Enrichment page. */
export function EnrichmentOptions() {
  const { enrichment, setEnrichment } = useWorkspaceData();
  const selectedCount = ENRICHMENT_FIELDS.filter((field) => enrichment[field.key]).length;

  return (
    <div className={styles.enrichment}>
      <p className={styles.enrichmentIntro}>
        Choose what every delivered record should carry. Exports include these fields, and the same choices apply when
        enrichment runs on your connected data. <b>{selectedCount}</b> of {ENRICHMENT_FIELDS.length} selected.
      </p>
      <ul className={styles.enrichmentList}>
        {ENRICHMENT_FIELDS.map((field) => (
          <li key={field.key}>
            <label className={styles.enrichmentOption}>
              <input
                type="checkbox"
                checked={enrichment[field.key]}
                onChange={(event) => setEnrichment((current) => ({ ...current, [field.key]: event.target.checked }))}
              />
              <span>
                <b>{field.label}</b>
                <small>{field.description}</small>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
