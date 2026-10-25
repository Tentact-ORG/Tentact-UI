"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cx } from "@/lib/cx";
import { dashboardApi, errorText } from "../api/dashboard.api";
import { BuildingIcon, FilterIcon, SearchIcon, SparkleIcon, UserIcon } from "../components/icons";
import { useWorkspaceData } from "../WorkspaceDataContext";
import { EnrichmentOptions } from "./EnrichmentOptions";
import { FilterGroup } from "./FilterGroup";
import { activeFilterChips, applyInterpretation, explainInterpretation, toInterpretFields, type FilterTab, type UnderstoodPhrase } from "./prospect.filters";
import type { MultiFilterKey, ProspectFilters } from "./prospect.types";
import { consumeSearchFocusRequest, PROSPECT_SEARCH_INPUT_ID } from "./search-focus";
import styles from "./Prospecting.module.css";

/** The typed request being turned into filters, and what to restore for "search as typed". */
type Interpretation =
  | { status: "idle" }
  | { status: "loading"; text: string }
  | { status: "ready"; text: string; previous: ProspectFilters; remaining: string; understood: UnderstoodPhrase[] }
  | { status: "error"; text: string; previous: ProspectFilters; message: string };

function SuggestionChips({ items, onAdd }: { items: { key: MultiFilterKey; value: string; label: string }[]; onAdd: (key: MultiFilterKey, value: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className={styles.suggestions}>
      <span className={styles.suggestionsLabel}>Suggested</span>
      {items.map((item) => (
        <button
          key={`${item.key}:${item.value}`}
          type="button"
          className={styles.suggestion}
          onClick={() => onAdd(item.key, item.value)}
          aria-label={`Add filter ${item.label}: ${item.value}`}
        >
          + {item.label}: {item.value}
        </button>
      ))}
    </div>
  );
}

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
  const { search, fields, fieldsReady, fieldsError } = useWorkspaceData();
  const { filters, state, dirty, busy, run, setQuery, toggleOption, setToggle, setJobChange, clearField, clearAll, replaceFilters } = search;
  const [interpretation, setInterpretation] = useState<Interpretation>({ status: "idle" });
  // Related values from the last interpretation, offered as one-click additions until used.
  const [suggestions, setSuggestions] = useState<{ key: MultiFilterKey; value: string; label: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<FilterTab>("people");
  const containerRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<Partial<Record<FilterTab, HTMLButtonElement | null>>>({});
  const panelId = useId();

  const chips = activeFilterChips(filters).filter((chip) => chip.key !== "query");
  const tabCounts = useMemo(() => {
    const counts: Record<FilterTab, number> = { people: 0, company: 0, enrich: 0 };
    for (const chip of chips) {
      const field = fields.find((item) => item.key === chip.key);
      if (field) counts[field.tab] += 1;
    }
    return counts;
  }, [chips, fields]);
  const countForTab = (id: FilterTab) => tabCounts[id];

  // Opening the panel shows the tab with the filters in use when the current one has none.
  const openPanel = useCallback(() => {
    if (!open && tabCounts[tab] === 0) {
      const withFilters = TABS.find((item) => item.id !== "enrich" && tabCounts[item.id] > 0);
      if (withFilters) setTab(withFilters.id);
    }
    setOpen(true);
  }, [open, tab, tabCounts]);

  const openSuggestions = suggestions.filter((item) => !(filters[item.key] as readonly string[]).includes(item.value));

  /** Closes the panel and searches with the current filters. */
  const submit = useCallback(() => {
    setOpen(false);
    setInterpretation({ status: "idle" });
    void run();
  }, [run]);

  /**
   * Enter in the search bar: the typed request becomes filters the user reviews
   * and applies. With no text (or no filter fields loaded) it searches directly.
   */
  const interpret = useCallback(async () => {
    const text = filters.query.trim();
    if (!text || !fieldsReady || fields.length === 0) {
      submit();
      return;
    }
    const previous = filters;
    setOpen(false);
    setInterpretation({ status: "loading", text });
    try {
      const result = await dashboardApi.interpret(text, toInterpretFields(fields));
      replaceFilters(applyInterpretation(previous, result, fields));
      setSuggestions(
        result.suggestions.flatMap((item) => {
          const field = fields.find((f) => f.kind === "multi" && f.key === item.key);
          return field && field.kind === "multi" ? [{ key: field.key, value: item.value, label: field.label }] : [];
        }),
      );
      setInterpretation({ status: "ready", text, previous, remaining: result.remaining_query, understood: explainInterpretation(text, result, fields) });
    } catch (error) {
      setInterpretation({ status: "error", text, previous, message: errorText(error, "The request couldn't be turned into filters.") });
    }
  }, [filters, fields, fieldsReady, replaceFilters, submit]);

  /** Ignores the suggested filters and searches the request as typed. */
  const searchAsTyped = useCallback(() => {
    if (interpretation.status !== "ready" && interpretation.status !== "error") return;
    const typed = { ...interpretation.previous, query: interpretation.text };
    replaceFilters(typed);
    setInterpretation({ status: "idle" });
    void run(typed);
  }, [interpretation, replaceFilters, run]);

  const finish = () => {
    if (dirty) submit();
    else setOpen(false);
  };

  let matchSummary;
  if (busy) matchSummary = <>Searching…</>;
  else if (state.status === "success" && !dirty) {
    matchSummary = (
      <>
        <b>{state.total.toLocaleString("en-US")}</b> {state.exactCount ? "match" : "loaded"}
      </>
    );
  } else matchSummary = <>Press Done to search</>;

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
        <p>Describe who you sell to and press Enter: we turn it into filters you can review and adjust, then apply.</p>
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
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void interpret();
            }
          }}
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

      {interpretation.status !== "idle" && (
        <div className={styles.assist} role="status" aria-live="polite">
          {interpretation.status === "loading" ? (
            <p>Turning “{interpretation.text}” into filters…</p>
          ) : interpretation.status === "error" ? (
            <>
              <p className={styles.assistError}>{interpretation.message}</p>
              <div className={styles.assistActions}>
                <button type="button" className={styles.linkButton} onClick={searchAsTyped}>
                  Search the text as typed
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                {chips.length > 0 ? (
                  <>
                    <b>
                      {chips.length} filter{chips.length === 1 ? "" : "s"}
                    </b>{" "}
                    set from “{interpretation.text}”.
                  </>
                ) : (
                  <>No filters matched “{interpretation.text}”; it will be searched as text.</>
                )}
                {interpretation.remaining && chips.length > 0 ? <> Also searching for “{interpretation.remaining}”.</> : null} Review or edit them, then apply.
              </p>
              <div className={styles.assistActions}>
                <button type="button" className={styles.linkButton} onClick={searchAsTyped} disabled={busy}>
                  Search the text as typed
                </button>
                <button type="button" className={styles.linkButton} onClick={() => setOpen(true)}>
                  Edit filters
                </button>
                <button type="button" className={styles.doneButton} onClick={submit} disabled={busy}>
                  Apply filters
                </button>
              </div>
              {(interpretation.understood.length > 0 || interpretation.remaining) && (
                <div className={styles.understood}>
                  <p className={styles.understoodTitle}>What we understood</p>
                  <dl>
                    {interpretation.understood.map((row) => (
                      <div key={row.phrase ?? "-"} className={styles.understoodRow}>
                        <dt>{row.phrase ? `“${row.phrase}”` : "From your request"}</dt>
                        <dd>
                          {row.items.map((item) => (
                            <span key={item.label} className={styles.understoodItem}>
                              <b>{item.label}:</b> {item.values.join(", ")}
                            </span>
                          ))}
                        </dd>
                      </div>
                    ))}
                    {interpretation.remaining && (
                      <div className={styles.understoodRow}>
                        <dt>“{interpretation.remaining}”</dt>
                        <dd>
                          <span className={styles.understoodItem}>No matching filter: searched as text</span>
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}
              <SuggestionChips items={openSuggestions} onAdd={toggleOption} />
            </>
          )}
        </div>
      )}

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
            <span className={styles.panelCount} aria-live="polite">
              {matchSummary}
            </span>
            {chips.length > 0 && (
              <button type="button" className={styles.linkButton} onClick={clearAll}>
                Clear all
              </button>
            )}
            <button type="button" className={styles.doneButton} onClick={finish} disabled={busy}>
              Done
            </button>
          </div>
        </div>

        {openSuggestions.length > 0 && (
          <div className={styles.panelSuggestions}>
            <SuggestionChips items={openSuggestions} onAdd={toggleOption} />
          </div>
        )}

        <div role="tabpanel" id={tabPanelId(tab)} aria-labelledby={tabId(tab)} className={styles.tabPanel}>
          {tab === "enrich" ? (
            <EnrichmentOptions />
          ) : !fieldsReady ? (
            <p className={styles.noOptions}>Loading filters…</p>
          ) : fieldsError ? (
            <p className={styles.noOptions} role="alert">
              {fieldsError}
            </p>
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
