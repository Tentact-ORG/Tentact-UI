"use client";

import { useId, useState } from "react";
import { cx } from "@/lib/cx";
import { ChevronRightIcon } from "../components/icons";
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

function MultiSelectGroup({ field, selected, onToggle, onClear }: MultiSelectProps) {
  const [expanded, setExpanded] = useState(false);
  const [optionQuery, setOptionQuery] = useState("");
  const searchId = useId();
  const bodyId = useId();
  const [open, toggleOpen] = useGroupOpen(selected.length > 0);

  const searchable = field.allowCustom || field.options.length >= SEARCHABLE_FROM;
  const typed = optionQuery.trim();
  const needle = typed.toLowerCase();
  // Typed values that aren't options yet (free-text attributes) are listed alongside the options.
  const options = [...field.options, ...selected.filter((value) => !field.options.includes(value))];
  const matching = needle ? options.filter((option) => option.toLowerCase().includes(needle)) : options;
  const canAddTyped = field.allowCustom && typed.length > 0 && !options.some((option) => option.toLowerCase() === needle);

  const addTyped = () => {
    if (!canAddTyped) return;
    onToggle(typed);
    setOptionQuery("");
  };
  const collapsible = !needle && matching.length > COLLAPSED_OPTION_COUNT;
  // Selected options always stay visible, even when the list is collapsed.
  const visible =
    collapsible && !expanded ? matching.filter((option, index) => index < COLLAPSED_OPTION_COUNT || selected.includes(option)) : matching;

  return (
    <div className={cx(styles.group, !open && styles.groupClosed)} role="group" aria-label={field.label}>
      <GroupHeader label={field.label} open={open} onToggle={toggleOpen} controls={bodyId} count={selected.length} onClear={onClear} />

      <div id={bodyId} hidden={!open} className={styles.groupBody}>
        {searchable && (
          <input
            id={searchId}
            type="search"
            className={styles.optionSearch}
            placeholder={field.allowCustom ? `Type a ${field.label.toLowerCase()}…` : `Find a ${field.label.toLowerCase()}…`}
            aria-label={field.allowCustom ? `Type or find a ${field.label.toLowerCase()}` : `Find a ${field.label.toLowerCase()}`}
            value={optionQuery}
            onChange={(event) => setOptionQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addTyped();
              }
            }}
            autoComplete="off"
          />
        )}

        <div className={styles.chips}>
          {visible.map((option) => {
            const pressed = selected.includes(option);
            return (
              <button key={option} type="button" className={cx(styles.chip, pressed && styles.chipOn)} aria-pressed={pressed} onClick={() => onToggle(option)}>
                {option}
              </button>
            );
          })}
          {canAddTyped && (
            <button type="button" className={styles.chip} onClick={addTyped}>
              Add “{typed}”
            </button>
          )}
          {visible.length === 0 && !canAddTyped && <span className={styles.noOptions}>{field.allowCustom ? "Type a value to add it." : "No matches."}</span>}
        </div>

        {collapsible && (
          <button type="button" className={styles.showMore} onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Show fewer" : `Show all ${matching.length}`}
          </button>
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
