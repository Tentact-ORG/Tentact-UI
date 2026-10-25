"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { BookmarkIcon, CloseIcon, DownloadIcon } from "../components/icons";
import { ExportDialog } from "./ExportDialog";
import { activeFilterChips, type ActiveFilterChip } from "./prospect.filters";
import type { ProspectFilters } from "./prospect.types";
import styles from "./Prospecting.module.css";

interface ActiveFiltersProps {
  filters: ProspectFilters;
  /** Matching prospects in the warehouse for the last search; null before any search. */
  resultCount: number | null;
  /** False when the server could only estimate the count. */
  exactCount: boolean;
  /** An export of the full results is being prepared. */
  exporting: boolean;
  onRemove: (chip: ActiveFilterChip) => void;
  onClearAll: () => void;
  onSaveSearch: (name: string) => void;
  /** Exports the first `rows` results of the last search. */
  onExport: (rows: number) => void;
  /** The filters of the last search, shown in the export confirmation (defaults to `filters`). */
  searchedFilters?: ProspectFilters | null;
  /** When set, a primary link to the full results page. */
  viewResultsHref?: string;
}

function SaveSearchForm({ onSave, disabled }: { onSave: (name: string) => void; disabled: boolean }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setName("");
    setEditing(false);
  };

  if (!editing) {
    return (
      <Button variant="line" onClick={() => setEditing(true)} disabled={disabled} title={disabled ? "Add a filter to save a search" : undefined}>
        <BookmarkIcon />
        <span>Save search</span>
      </Button>
    );
  }

  return (
    <form className={styles.inlineForm} onSubmit={submit}>
      <input
        type="text"
        className={styles.inlineInput}
        placeholder="Name this search"
        aria-label="Search name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={60}
        autoFocus
        required
      />
      <Button type="submit" variant="ink">
        Save
      </Button>
      <button type="button" className={styles.linkButton} onClick={() => setEditing(false)}>
        Cancel
      </button>
    </form>
  );
}

/** The chips under the search bar: every active filter, the match count and the save / export actions. */
export function ActiveFilters({
  filters,
  resultCount,
  exactCount,
  exporting,
  onRemove,
  onClearAll,
  onSaveSearch,
  onExport,
  searchedFilters,
  viewResultsHref,
}: ActiveFiltersProps) {
  const chips = activeFilterChips(filters);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className={styles.activeBar}>
      <div className={styles.activeChips}>
        {chips.length === 0 && <span className={styles.activeHint}>No filters applied yet. Describe your buyers or open the filters to start.</span>}
        {chips.map((chip) => (
          <button
            key={`${chip.key}:${chip.value ?? ""}`}
            type="button"
            className={styles.activeChip}
            onClick={() => onRemove(chip)}
            aria-label={`Remove filter ${chip.label}`}
          >
            <span>{chip.label}</span>
            <CloseIcon width={14} height={14} />
          </button>
        ))}
        {chips.length > 0 && (
          <button type="button" className={styles.linkButton} onClick={onClearAll}>
            Clear all
          </button>
        )}
      </div>

      <div className={styles.activeActions}>
        {resultCount !== null && (
          <span className={styles.resultCount} aria-live="polite">
            {exactCount ? "" : "at least "}
            <b>{resultCount.toLocaleString("en-US")}</b> prospect{resultCount === 1 ? "" : "s"}
          </span>
        )}
        <SaveSearchForm onSave={onSaveSearch} disabled={chips.length === 0} />
        <Button variant={viewResultsHref ? "line" : "ink"} onClick={() => setConfirming(true)} disabled={!resultCount || exporting}>
          <DownloadIcon />
          <span>{exporting ? "Preparing export…" : "Export CSV"}</span>
        </Button>
        {viewResultsHref && resultCount !== null && (
          <ButtonLink variant="ink" href={viewResultsHref} withArrow>
            View {resultCount.toLocaleString("en-US")} result{resultCount === 1 ? "" : "s"}
          </ButtonLink>
        )}
      </div>

      <ExportDialog
        open={confirming}
        filters={searchedFilters ?? filters}
        total={resultCount ?? 0}
        exactCount={exactCount}
        onExport={onExport}
        onClose={() => setConfirming(false)}
      />
    </div>
  );
}
