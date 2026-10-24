"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import { DASHBOARD_PAGES } from "../navigation";
import { createLocalId, useWorkspaceData } from "../WorkspaceDataContext";
import { buildCsv, downloadTextFile, exportFilename } from "./prospect.export";
import type { ActiveFilterChip } from "./prospect.filters";
import type { MultiFilterKey, Prospect, ProspectList, SavedSearch } from "./prospect.types";

/** The actions several dashboard pages share: export, saved searches, lists and filter chips. */
export function useProspectingActions() {
  const { search, prospects, enrichment, setSavedSearches, setLists, announce } = useWorkspaceData();
  const router = useRouter();
  const pathname = usePathname();

  const exportProspects = useCallback(
    (items: readonly Prospect[], label: string) => {
      downloadTextFile(exportFilename(label), buildCsv(items, enrichment));
      announce(`Exported ${items.length} prospect${items.length === 1 ? "" : "s"} as CSV.`);
    },
    [enrichment, announce],
  );

  const removeChip = useCallback(
    (chip: ActiveFilterChip) => {
      if (chip.key === "query") search.setQuery("");
      else if (chip.value !== undefined && Array.isArray(search.filters[chip.key])) search.toggleOption(chip.key as MultiFilterKey, chip.value);
      else search.clearField(chip.key);
    },
    [search],
  );

  const saveCurrentSearch = useCallback(
    (name: string) => {
      const entry: SavedSearch = { id: createLocalId("search"), name, createdAt: new Date().toISOString(), filters: search.filters };
      setSavedSearches((current) => [entry, ...current]);
      announce(`Saved search “${name}”.`);
    },
    [search.filters, setSavedSearches, announce],
  );

  /** Applies the saved filters and opens the results. */
  const applySavedSearch = useCallback(
    (saved: SavedSearch) => {
      search.replaceFilters(saved.filters);
      announce(`Applied saved search “${saved.name}”.`);
      if (pathname !== DASHBOARD_PAGES.search.href) router.push(DASHBOARD_PAGES.search.href);
    },
    [search, announce, pathname, router],
  );

  const deleteSavedSearch = useCallback(
    (id: string) => setSavedSearches((current) => current.filter((item) => item.id !== id)),
    [setSavedSearches],
  );

  const createList = useCallback(
    (name: string, prospectIds: readonly string[]) => {
      const entry: ProspectList = { id: createLocalId("list"), name, createdAt: new Date().toISOString(), prospectIds: [...prospectIds] };
      setLists((current) => [entry, ...current]);
      announce(`Created list “${name}” with ${entry.prospectIds.length} prospects.`);
    },
    [setLists, announce],
  );

  const exportList = useCallback(
    (list: ProspectList) => exportProspects(prospects.filter((prospect) => list.prospectIds.includes(prospect.id)), list.name),
    [prospects, exportProspects],
  );

  const deleteList = useCallback((id: string) => setLists((current) => current.filter((item) => item.id !== id)), [setLists]);

  return { exportProspects, removeChip, saveCurrentSearch, applySavedSearch, deleteSavedSearch, createList, exportList, deleteList };
}
