"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { cx } from "@/lib/cx";
import { BuildingIcon, FilterIcon, SearchIcon, SparkleIcon, UserIcon } from "../components/icons";
import { useWorkspaceData } from "../WorkspaceDataContext";
import { EnrichmentOptions } from "./EnrichmentOptions";
import { FilterGroup } from "./FilterGroup";
import { activeFilterChips, type FilterTab } from "./prospect.filters";
import { consumeSearchFocusRequest, PROSPECT_SEARCH_INPUT_ID } from "./search-focus";
import styles from "./Prospecting.module.css";

const TABS: { id: FilterTab; label: string; Icon: typeof UserIcon }[] = [
  { id: "people", label: "People", Icon: UserIcon },
  { id: "company", label: "Company", Icon: BuildingIcon },
  { id: "enrich", label: "Enrich", Icon: SparkleIcon },
];

/**
 * The prominent search bar. Hovering, focusing or pressing "Filters" opens the
 * panel beneath it with People, Company and Enrich tabs; Escape, "Done" or a
 * click elsewhere closes it. Filters live in the dashboard's shared state, so
 * they carry over between pages.
 */
export function ProspectSearch() {
  const { search, fields, prospects } = useWorkspaceData();
  const { filters, results, setQuery, toggleOption, setToggle, setJobChange, clearField, clearAll } = search;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<FilterTab>("people");
  const containerRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<Partial<Record<FilterTab, HTMLButtonElement | null>>>({});
  const panelId = useId();

  const chips = activeFilterChips(filters).filter((chip) => chip.key !== "query");
  const countForTab = (id: FilterTab) => chips.filter((chip) => fields.some((field) => field.tab === id && field.key === chip.key)).length;

  const openPanel = useCallback(() => setOpen(true), []);

  // Arriving from the "/" shortcut or the sidebar's search button.
  useEffect(() => {
    if (consumeSearchFocusRequest()) inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = TABS.findIndex((item) => item.id === tab);
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = TABS.length - 1;
    else return;
    event.preventDefault();
    const next = TABS[nextIndex].id;
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const tabId = (id: FilterTab) => `${panelId}-tab-${id}`;
  const tabPanelId = (id: FilterTab) => `${panelId}-panel-${id}`;

  return (
    <section ref={containerRef} className={styles.search} aria-labelledby={`${panelId}-title`}>
      <div className={styles.searchHead}>
        <h2 id={`${panelId}-title`}>Find your next buyers</h2>
        <p>Describe who you sell to, or open the filters to build the list field by field.</p>
      </div>

      <div
        className={cx(styles.bar, open && styles.barOpen)}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") openPanel();
        }}
      >
        <SearchIcon className={styles.barIcon} />
        <input
          ref={inputRef}
          id={PROSPECT_SEARCH_INPUT_ID}
          type="search"
          className={styles.barInput}
          value={filters.query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={openPanel}
          placeholder="Search people or companies, e.g. “VP Marketing SaaS London”"
          aria-label="Search prospects"
          autoComplete="off"
          spellCheck={false}
        />
        <kbd className={styles.kbd} aria-hidden="true">
          /
        </kbd>
        <button
          type="button"
          className={cx(styles.filtersButton, open && styles.filtersButtonOn)}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
        >
          <FilterIcon />
          <span>Filters</span>
          {chips.length > 0 && <b className={styles.filtersCount}>{chips.length}</b>}
        </button>
      </div>

      <div id={panelId} className={styles.panel} hidden={!open}>
        <div className={styles.panelHead}>
          <div role="tablist" aria-label="Filter categories" className={styles.tabs}>
            {TABS.map(({ id, label, Icon }) => {
              const selected = id === tab;
              const count = id === "enrich" ? 0 : countForTab(id);
              return (
                <button
                  key={id}
                  ref={(element) => {
                    tabRefs.current[id] = element;
                  }}
                  type="button"
                  role="tab"
                  id={tabId(id)}
                  aria-selected={selected}
                  aria-controls={tabPanelId(id)}
                  tabIndex={selected ? 0 : -1}
                  className={cx(styles.tab, selected && styles.tabOn)}
                  onClick={() => setTab(id)}
                  onKeyDown={onTabKeyDown}
                >
                  <Icon />
                  <span>{label}</span>
                  {count > 0 && <b className={styles.tabCount}>{count}</b>}
                </button>
              );
            })}
          </div>
          <div className={styles.panelMeta}>
            <span className={styles.panelCount}>
              <b>{results.length}</b> of {prospects.length} match
            </span>
            {chips.length > 0 && (
              <button type="button" className={styles.linkButton} onClick={clearAll}>
                Clear all
              </button>
            )}
            <button type="button" className={styles.doneButton} onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>

        <div role="tabpanel" id={tabPanelId(tab)} aria-labelledby={tabId(tab)} className={styles.tabPanel}>
          {tab === "enrich" ? (
            <EnrichmentOptions />
          ) : (
            <div className={styles.fieldGrid}>
              {fields
                .filter((field) => field.tab === tab)
                .map((field) => (
                  <FilterGroup
                    key={field.key}
                    field={field}
                    filters={filters}
                    onToggleOption={toggleOption}
                    onSetToggle={setToggle}
                    onSetJobChange={setJobChange}
                    onClear={clearField}
                  />
                ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
