"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { BookmarkIcon, CloseIcon, DownloadIcon } from "../components/icons";
import { activeFilterChips, type ActiveFilterChip } from "./prospect.filters";
import type { ProspectFilters } from "./prospect.types";
import styles from "./Prospecting.module.css";

interface ActiveFiltersProps {
  filters: ProspectFilters;
  resultCount: number;
  totalCount: number;
  onRemove: (chip: ActiveFilterChip) => void;
  onClearAll: () => void;
  onSaveSearch: (name: string) => void;
  onExport: () => void;
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
  totalCount,
  onRemove,
  onClearAll,
  onSaveSearch,
  onExport,
  viewResultsHref,
}: ActiveFiltersProps) {
  const chips = activeFilterChips(filters);

  return (
    <div className={styles.activeBar}>
      <div className={styles.activeChips}>
        {chips.length === 0 && <span className={styles.activeHint}>No filters applied. Showing everyone in the workspace.</span>}
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
        <span className={styles.resultCount} aria-live="polite">
          <b>{resultCount}</b> of {totalCount} prospects
        </span>
        <SaveSearchForm onSave={onSaveSearch} disabled={chips.length === 0} />
        <Button variant={viewResultsHref ? "line" : "ink"} onClick={onExport} disabled={resultCount === 0}>
          <DownloadIcon />
          <span>Export CSV</span>
        </Button>
        {viewResultsHref && (
          <ButtonLink variant="ink" href={viewResultsHref} withArrow>
            View {resultCount} result{resultCount === 1 ? "" : "s"}
          </ButtonLink>
        )}
      </div>
    </div>
  );
}
