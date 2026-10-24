"use client";

import { useCallback, useMemo, useReducer } from "react";
import { searchProspects, summariseProspects } from "./prospect.matching";
import { EMPTY_FILTERS, type MultiFilterKey, type Prospect, type ProspectFilters, type ToggleFilterKey } from "./prospect.types";

type FilterAction =
  | { type: "query"; value: string }
  | { type: "toggleOption"; key: MultiFilterKey; value: string }
  | { type: "setToggle"; key: ToggleFilterKey; value: boolean }
  | { type: "setJobChange"; value: ProspectFilters["jobChange"] }
  | { type: "clearField"; key: keyof ProspectFilters }
  | { type: "replace"; filters: ProspectFilters }
  | { type: "clearAll" };

function reduceFilters(filters: ProspectFilters, action: FilterAction): ProspectFilters {
  switch (action.type) {
    case "query":
      return { ...filters, query: action.value };
    case "toggleOption": {
      const current: readonly string[] = filters[action.key];
      const next = current.includes(action.value) ? current.filter((item) => item !== action.value) : [...current, action.value];
      return { ...filters, [action.key]: next };
    }
    case "setToggle":
      return { ...filters, [action.key]: action.value };
    case "setJobChange":
      return { ...filters, jobChange: action.value };
    case "clearField":
      return { ...filters, [action.key]: EMPTY_FILTERS[action.key] };
    case "replace":
      return { ...action.filters };
    case "clearAll":
      return EMPTY_FILTERS;
  }
}

/** Filter state plus the matching prospects and their summary, recomputed only when inputs change. */
export function useProspectSearch(prospects: readonly Prospect[]) {
  const [filters, dispatch] = useReducer(reduceFilters, EMPTY_FILTERS);

  const results = useMemo(() => searchProspects(prospects, filters), [prospects, filters]);
  const summary = useMemo(() => summariseProspects(results), [results]);

  const setQuery = useCallback((value: string) => dispatch({ type: "query", value }), []);
  const toggleOption = useCallback((key: MultiFilterKey, value: string) => dispatch({ type: "toggleOption", key, value }), []);
  const setToggle = useCallback((key: ToggleFilterKey, value: boolean) => dispatch({ type: "setToggle", key, value }), []);
  const setJobChange = useCallback((value: ProspectFilters["jobChange"]) => dispatch({ type: "setJobChange", value }), []);
  const clearField = useCallback((key: keyof ProspectFilters) => dispatch({ type: "clearField", key }), []);
  const replaceFilters = useCallback((next: ProspectFilters) => dispatch({ type: "replace", filters: next }), []);
  const clearAll = useCallback(() => dispatch({ type: "clearAll" }), []);

  return useMemo(
    () => ({ filters, results, summary, setQuery, toggleOption, setToggle, setJobChange, clearField, replaceFilters, clearAll }),
    [filters, results, summary, setQuery, toggleOption, setToggle, setJobChange, clearField, replaceFilters, clearAll],
  );
}

export type ProspectSearchController = ReturnType<typeof useProspectSearch>;
