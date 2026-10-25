"use client";

import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import { dashboardApi, errorText, type SearchDiagnostic, type SearchRequestBody } from "../api/dashboard.api";
import { recordToProspect } from "./prospect.mapping";
import { summariseProspects } from "./prospect.matching";
import { hasSearchCriteria, toSearchRequest, type CountryNames } from "./prospect.query";
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
      // Keep the identity so a search run with these exact filters is not reported as out of date.
      return action.filters;
    case "clearAll":
      return EMPTY_FILTERS;
  }
}

export type SearchStatus = "idle" | "loading" | "loadingMore" | "success" | "clarification" | "error";

export interface SearchState {
  status: SearchStatus;
  /** Prospects loaded so far (the server returns them a page at a time). */
  results: Prospect[];
  /** Matching prospects in the warehouse. */
  total: number;
  /** False when the count query failed and `total` only reflects loaded rows. */
  exactCount: boolean;
  /** Last server page loaded. */
  page: number;
  totalPages: number;
  /** Error or clarification text from the server. */
  message: string | null;
  assumptions: string[];
  /** Generated SQL and review details, returned to administrators only. */
  diagnostic: SearchDiagnostic | null;
  /** The filters the current results were found with. */
  searchedFilters: ProspectFilters | null;
  /** The first-page request those results came from; exports reuse it. */
  searchedRequest: SearchRequestBody | null;
}

const INITIAL_SEARCH: SearchState = {
  status: "idle",
  results: [],
  total: 0,
  exactCount: true,
  page: 0,
  totalPages: 0,
  message: null,
  assumptions: [],
  diagnostic: null,
  searchedFilters: null,
  searchedRequest: null,
};

export const NO_CRITERIA_MESSAGE = "Describe who you're looking for or choose a filter, then press Enter to search.";

/** Filter state plus server-side search: run explicitly, with paging through the loaded results. */
export function useProspectSearch(countries: CountryNames) {
  const [filters, dispatch] = useReducer(reduceFilters, EMPTY_FILTERS);
  const [state, setState] = useState<SearchState>(INITIAL_SEARCH);
  // Each request gets a number; responses to superseded requests are ignored.
  const requestSeq = useRef(0);

  const execute = useCallback(
    async (target: ProspectFilters, page: number) => {
      if (!hasSearchCriteria(target)) {
        setState({ ...INITIAL_SEARCH, status: "error", message: NO_CRITERIA_MESSAGE });
        return;
      }
      const seq = ++requestSeq.current;
      const appending = page > 1;
      setState((current) => ({ ...current, status: appending ? "loadingMore" : "loading", message: null }));
      try {
        const request = toSearchRequest(target, page, countries);
        const response = await dashboardApi.search(request);
        const firstPageRequest = { ...request, page: 1 };
        if (seq !== requestSeq.current) return;
        if (response.clarification_required) {
          setState({
            ...INITIAL_SEARCH,
            status: "clarification",
            message: response.clarification_message ?? "Please refine the search.",
            assumptions: response.applied_assumptions,
            diagnostic: response.diagnostic,
            searchedFilters: target,
            searchedRequest: firstPageRequest,
          });
          return;
        }
        const offset = (page - 1) * response.page_size;
        const loaded = response.records.map((record, index) => recordToProspect(record, offset + index));
        setState((current) => {
          const previous = appending ? current.results : [];
          const seen = new Set(previous.map((prospect) => prospect.id));
          return {
            status: "success",
            results: [...previous, ...loaded.filter((prospect) => !seen.has(prospect.id))],
            total: response.total_distinct_count,
            exactCount: response.exact_count,
            page,
            totalPages: response.total_pages,
            message: null,
            assumptions: response.applied_assumptions,
            diagnostic: response.diagnostic,
            searchedFilters: target,
            searchedRequest: firstPageRequest,
          };
        });
      } catch (error) {
        if (seq !== requestSeq.current) return;
        setState((current) => ({ ...current, status: "error", message: errorText(error, "The search failed. Please try again.") }));
      }
    },
    [countries],
  );

  const run = useCallback((next?: ProspectFilters) => execute(next ?? filters, 1), [execute, filters]);
  const loadMore = useCallback(() => {
    if (state.searchedFilters && state.page < state.totalPages) void execute(state.searchedFilters, state.page + 1);
  }, [execute, state.searchedFilters, state.page, state.totalPages]);

  const setQuery = useCallback((value: string) => dispatch({ type: "query", value }), []);
  const toggleOption = useCallback((key: MultiFilterKey, value: string) => dispatch({ type: "toggleOption", key, value }), []);
  const setToggle = useCallback((key: ToggleFilterKey, value: boolean) => dispatch({ type: "setToggle", key, value }), []);
  const setJobChange = useCallback((value: ProspectFilters["jobChange"]) => dispatch({ type: "setJobChange", value }), []);
  const clearField = useCallback((key: keyof ProspectFilters) => dispatch({ type: "clearField", key }), []);
  const replaceFilters = useCallback((next: ProspectFilters) => dispatch({ type: "replace", filters: next }), []);
  const clearAll = useCallback(() => {
    requestSeq.current += 1;
    dispatch({ type: "clearAll" });
    setState(INITIAL_SEARCH);
  }, []);

  const results = state.results;
  const summary = useMemo(() => summariseProspects(results), [results]);
  const dirty = state.searchedFilters !== filters;
  const busy = state.status === "loading" || state.status === "loadingMore";
  const hasMore = state.status === "success" && state.page < state.totalPages;

  return useMemo(
    () => ({
      filters,
      state,
      results,
      summary,
      dirty,
      busy,
      hasMore,
      run,
      loadMore,
      setQuery,
      toggleOption,
      setToggle,
      setJobChange,
      clearField,
      replaceFilters,
      clearAll,
    }),
    [filters, state, results, summary, dirty, busy, hasMore, run, loadMore, setQuery, toggleOption, setToggle, setJobChange, clearField, replaceFilters, clearAll],
  );
}

export type ProspectSearchController = ReturnType<typeof useProspectSearch>;
