"use client";

import { useEffect, useId, useState } from "react";
import { cx } from "@/lib/cx";
import { dashboardApi } from "../api/dashboard.api";
import { ChevronRightIcon } from "../components/icons";
import type { FilterField } from "./prospect.filters";
import type { MultiFilterKey, ProspectFilters, ToggleFilterKey } from "./prospect.types";
import styles from "./Prospecting.module.css";

/** Lists this long or longer get a searchable dropdown instead of chips. */
const SEARCHABLE_FROM = 12;

interface FilterGroupProps {
  field: FilterField;
  filters: ProspectFilters;
  onToggleOption: (key: MultiFilterKey, value: string) => void;
  onSetToggle: (key: ToggleFilterKey, value: boolean) => void;
  onSetJobChange: (value: ProspectFilters["jobChange"]) => void;
  onClear: (key: keyof ProspectFilters) => void;
}

/**
 * A group is open while it has a value (or after the user opens it) and folds
 * down to its header otherwise, so the panel leads with the filters in use.
 */
function useGroupOpen(active: boolean): [boolean, () => void] {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? active;
  return [open, () => setUserOpen(!open)];
}

function GroupHeader({
  label,
  open,
  onToggle,
  controls,
  count,
  onClear,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  controls: string;
  count: number;
  onClear?: () => void;
}) {
  return (
    <div className={styles.groupLegend}>
      <button type="button" className={styles.groupToggle} aria-expanded={open} aria-controls={controls} onClick={onToggle}>
        <ChevronRightIcon width={14} height={14} className={cx(styles.groupChevron, open && styles.groupChevronOpen)} aria-hidden="true" />
        <span>{label}</span>
      </button>
      {count > 0 && (
        <>
          <b className={styles.groupCount}>{count}</b>
          {onClear && (
            <button type="button" className={styles.groupClear} onClick={onClear}>
              Clear
            </button>
          )}
        </>
      )}
    </div>
  );
}

interface MultiSelectProps {
  field: Extract<FilterField, { kind: "multi" }>;
  selected: readonly string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}

/** Most options listed in the dropdown at once. */
const MAX_LISTED = 60;

/** "City" → "cities", "Job title" → "job titles". */
function plural(label: string): string {
  const word = label.toLowerCase();
  return /[^aeiou]y$/.test(word) ? `${word.slice(0, -1)}ies` : /(s|x|ch|sh)$/.test(word) ? `${word}es` : `${word}s`;
}

/** The typed text highlighted inside an option. */
function Highlight({ text, needle }: { text: string; needle: string }) {
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + needle.length)}</mark>
      {text.slice(at + needle.length)}
    </>
  );
}

/**
 * A searchable dropdown for long or free-text filters: the chosen values sit
 * above as removable chips; typing lists matching options and, for large
 * columns (job titles, cities, companies), matching values from the warehouse.
 */
function SearchableSelect({ field, selected, onToggle }: Omit<MultiSelectProps, "onClear">) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<{ q: string; values: string[]; failed?: boolean } | null>(null);
  const listId = useId();
  const typed = query.trim();
  const needle = typed.toLowerCase();
  const wantsRemote = Boolean(field.suggestKey) && typed.length >= 2;

  // Look values up in the warehouse as the user types (debounced; superseded requests are cancelled).
  useEffect(() => {
    if (!field.suggestKey || typed.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      dashboardApi
        .suggest(field.suggestKey!, typed, controller.signal)
        .then((result) => setRemote({ q: typed, values: result.values }))
        .catch(() => {
          if (!controller.signal.aborted) setRemote({ q: typed, values: [], failed: true });
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [field.suggestKey, typed]);

  const chosen = new Set(selected);
  const local = (needle ? field.options.filter((option) => option.toLowerCase().includes(needle)) : field.options).filter((option) => !chosen.has(option));
  const fromDb = remote && remote.q === typed ? remote.values.filter((value) => !chosen.has(value) && !local.includes(value)) : [];
  const loading = wantsRemote && remote?.q !== typed;
  const items = [...local.slice(0, MAX_LISTED), ...fromDb];
  const exact = [...items, ...selected].some((option) => option.toLowerCase() === needle);
  const addTyped = field.allowCustom && typed.length > 0 && !exact;
  const total = items.length + (addTyped ? 1 : 0);
  const open = focused && (typed.length > 0 || field.options.length > 0);

  const pick = (value: string) => {
    onToggle(value);
    setQuery("");
    setActive(0);
  };
  const choose = (index: number) => {
    if (index < items.length) pick(items[index]);
    else if (addTyped) pick(typed);
  };
  const optionId = (index: number) => `${listId}-${index}`;
  const containsWording = field.key === "titles" || field.key === "companies";

  return (
    <div className={styles.combo}>
      {selected.length > 0 && (
        <div className={styles.comboChosen}>
          {selected.map((value) => (
            <span key={value} className={styles.comboChip}>
              {value}
              <button type="button" onClick={() => onToggle(value)} aria-label={`Remove ${value}`}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && total > 0 ? optionId(Math.min(active, total - 1)) : undefined}
        aria-label={`Search ${field.label.toLowerCase()}`}
        className={styles.optionSearch}
        placeholder={field.suggestKey ? `Search ${plural(field.label)} in the database…` : `Search ${plural(field.label)}…`}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((index) => Math.min(index + 1, Math.max(total - 1, 0)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (total > 0) choose(Math.min(active, total - 1));
          } else if (event.key === "Escape" && (query || open)) {
            // Close this dropdown, not the whole filter panel.
            event.nativeEvent.stopPropagation();
            setQuery("");
            (event.target as HTMLInputElement).blur();
          }
        }}
        autoComplete="off"
      />
      {open && (
        <ul id={listId} role="listbox" className={styles.comboList} aria-label={field.label} onMouseDown={(event) => event.preventDefault()}>
          {items.map((option, index) => (
            <li
              key={option}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              className={cx(styles.comboItem, index === active && styles.comboItemActive)}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(index)}
            >
              <Highlight text={option} needle={needle} />
            </li>
          ))}
          {addTyped && (
            <li
              id={optionId(items.length)}
              role="option"
              aria-selected={active === items.length}
              className={cx(styles.comboItem, styles.comboAdd, active === items.length && styles.comboItemActive)}
              onMouseEnter={() => setActive(items.length)}
              onClick={() => choose(items.length)}
            >
              {containsWording ? `Any ${field.label.toLowerCase()} containing “${typed}”` : `Add “${typed}”`}
            </li>
          )}
          {loading && <li className={styles.comboStatus}>Searching the database…</li>}
          {!loading && remote?.failed && remote.q === typed && <li className={styles.comboStatus}>Couldn&apos;t search the database. Try again.</li>}
          {!loading && total === 0 && (
            <li className={styles.comboStatus}>{typed ? "No matches in the database." : `Type to search ${plural(field.label)}.`}</li>
          )}
        </ul>
      )}
    </div>
  );
}

function MultiSelectGroup({ field, selected, onToggle, onClear }: MultiSelectProps) {
  const bodyId = useId();
  const [open, toggleOpen] = useGroupOpen(selected.length > 0);
  // Short fixed lists stay one-click chips; long and free-text ones get a searchable dropdown.
  const searchable = field.allowCustom || field.options.length >= SEARCHABLE_FROM;

  return (
    <div className={cx(styles.group, !open && styles.groupClosed)} role="group" aria-label={field.label}>
      <GroupHeader label={field.label} open={open} onToggle={toggleOpen} controls={bodyId} count={selected.length} onClear={onClear} />

      <div id={bodyId} hidden={!open} className={styles.groupBody}>
        {searchable ? (
          <SearchableSelect field={field} selected={selected} onToggle={onToggle} />
        ) : (
          <div className={styles.chips}>
            {field.options.map((option) => {
              const pressed = selected.includes(option);
              return (
                <button key={option} type="button" className={cx(styles.chip, pressed && styles.chipOn)} aria-pressed={pressed} onClick={() => onToggle(option)}>
                  {option}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
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
  const bodyId = useId();
  const active = value !== field.options[0]?.value;
  const [open, toggleOpen] = useGroupOpen(active);
  return (
    <div className={cx(styles.group, !open && styles.groupClosed)} role="group" aria-label={field.label}>
      <GroupHeader label={field.label} open={open} onToggle={toggleOpen} controls={bodyId} count={active ? 1 : 0} />
      <div id={bodyId} hidden={!open} className={styles.groupBody}>
        <div className={styles.segmented} role="radiogroup" aria-label={field.label}>
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
