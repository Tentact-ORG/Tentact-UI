"use client";

import { useId, useState } from "react";
import { cx } from "@/lib/cx";
import type { FilterField } from "./prospect.filters";
import type { MultiFilterKey, ProspectFilters, ToggleFilterKey } from "./prospect.types";
import styles from "./Prospecting.module.css";

/** Options shown before "Show all" for long lists. */
const COLLAPSED_OPTION_COUNT = 8;
/** Lists longer than this get their own filter box. */
const SEARCHABLE_FROM = 12;

interface FilterGroupProps {
  field: FilterField;
  filters: ProspectFilters;
  onToggleOption: (key: MultiFilterKey, value: string) => void;
  onSetToggle: (key: ToggleFilterKey, value: boolean) => void;
  onSetJobChange: (value: ProspectFilters["jobChange"]) => void;
  onClear: (key: keyof ProspectFilters) => void;
}

interface MultiSelectProps {
  field: Extract<FilterField, { kind: "multi" }>;
  selected: readonly string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}

function MultiSelectGroup({ field, selected, onToggle, onClear }: MultiSelectProps) {
  const [expanded, setExpanded] = useState(false);
  const [optionQuery, setOptionQuery] = useState("");
  const searchId = useId();

  const searchable = field.options.length >= SEARCHABLE_FROM;
  const needle = optionQuery.trim().toLowerCase();
  const matching = needle ? field.options.filter((option) => option.toLowerCase().includes(needle)) : field.options;
  const collapsible = !needle && matching.length > COLLAPSED_OPTION_COUNT;
  // Selected options always stay visible, even when the list is collapsed.
  const visible =
    collapsible && !expanded ? matching.filter((option, index) => index < COLLAPSED_OPTION_COUNT || selected.includes(option)) : matching;

  return (
    <fieldset className={styles.group}>
      <legend className={styles.groupLegend}>
        <span>{field.label}</span>
        {selected.length > 0 && (
          <>
            <b className={styles.groupCount}>{selected.length}</b>
            <button type="button" className={styles.groupClear} onClick={onClear}>
              Clear
            </button>
          </>
        )}
      </legend>

      {searchable && (
        <input
          id={searchId}
          type="search"
          className={styles.optionSearch}
          placeholder={`Find a ${field.label.toLowerCase()}…`}
          aria-label={`Find a ${field.label.toLowerCase()}`}
          value={optionQuery}
          onChange={(event) => setOptionQuery(event.target.value)}
          autoComplete="off"
        />
      )}

      <div className={styles.chips}>
        {visible.map((option) => {
          const pressed = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              className={cx(styles.chip, pressed && styles.chipOn)}
              aria-pressed={pressed}
              onClick={() => onToggle(option)}
            >
              {option}
            </button>
          );
        })}
        {visible.length === 0 && <span className={styles.noOptions}>No matches.</span>}
      </div>

      {collapsible && (
        <button type="button" className={styles.showMore} onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Show fewer" : `Show all ${matching.length}`}
        </button>
      )}
    </fieldset>
  );
}

interface ToggleRowProps {
  field: Extract<FilterField, { kind: "toggle" }>;
  checked: boolean;
  onChange: (value: boolean) => void;
}

function ToggleRow({ field, checked, onChange }: ToggleRowProps) {
  const labelId = useId();
  return (
    <div className={styles.toggleRow}>
      <div className={styles.toggleText}>
        <span id={labelId} className={styles.toggleLabel}>
          {field.label}
        </span>
        <small>{field.description}</small>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        className={cx(styles.switch, checked && styles.switchOn)}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.switchKnob} />
      </button>
    </div>
  );
}

interface ChoiceGroupProps {
  field: Extract<FilterField, { kind: "choice" }>;
  value: ProspectFilters["jobChange"];
  onChange: (value: ProspectFilters["jobChange"]) => void;
}

function ChoiceGroup({ field, value, onChange }: ChoiceGroupProps) {
  const labelId = useId();
  return (
    <div className={styles.group}>
      <p id={labelId} className={styles.groupLegend}>
        <span>{field.label}</span>
      </p>
      <div className={styles.segmented} role="radiogroup" aria-labelledby={labelId}>
        {field.options.map((option) => {
          const checked = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              className={cx(styles.segment, checked && styles.segmentOn)}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Renders one filter from the registry with the control its kind calls for. */
export function FilterGroup({ field, filters, onToggleOption, onSetToggle, onSetJobChange, onClear }: FilterGroupProps) {
  switch (field.kind) {
    case "multi":
      return (
        <MultiSelectGroup
          field={field}
          selected={filters[field.key]}
          onToggle={(value) => onToggleOption(field.key, value)}
          onClear={() => onClear(field.key)}
        />
      );
    case "toggle":
      return <ToggleRow field={field} checked={filters[field.key]} onChange={(value) => onSetToggle(field.key, value)} />;
    case "choice":
      return <ChoiceGroup field={field} value={filters.jobChange} onChange={onSetJobChange} />;
  }
}
