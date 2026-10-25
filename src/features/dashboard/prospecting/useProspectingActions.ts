"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { dashboardApi, errorText } from "../api/dashboard.api";
import { DASHBOARD_PAGES } from "../navigation";
import { useWorkspaceData } from "../WorkspaceDataContext";
import { buildCsv, downloadTextFile, exportFilename } from "./prospect.export";
import type { ActiveFilterChip } from "./prospect.filters";
import type { MultiFilterKey, Prospect, ProspectList, SavedSearch } from "./prospect.types";

/** Upper bound on rows in a full-results export (the server also enforces EXPORT_MAX_ROWS). */
const MAX_EXPORT_ROWS = 100_000;
const EXPORT_POLL_MS = 1500;
const EXPORT_TIMEOUT_MS = 10 * 60_000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function startDownload(url: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

/** The actions several dashboard pages share: export, saved searches, lists and filter chips. */
export function useProspectingActions() {
  const { search, enrichment, announce, saveSearch, deleteSavedSearch: removeSavedSearch, createList: storeList, deleteList: removeList } =
    useWorkspaceData();
  const router = useRouter();
  const pathname = usePathname();
  const [exporting, setExporting] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** CSV of prospects already on screen (a selection or a saved list). */
  const exportProspects = useCallback(
    (items: readonly Prospect[], label: string) => {
      downloadTextFile(exportFilename(label), buildCsv(items, enrichment));
      announce(`Exported ${items.length} prospect${items.length === 1 ? "" : "s"} as CSV.`);
    },
    [enrichment, announce],
  );

  /** Every result of the last search, generated as a server-side export job and downloaded when ready. */
  const exportResults = useCallback(async () => {
    const { searchedRequest, total } = search.state;
    if (!searchedRequest || exporting) return;
    setExporting(true);
    announce("Preparing your export…");
    try {
      let job = await dashboardApi.createExport(searchedRequest, Math.min(Math.max(total, 1), MAX_EXPORT_ROWS));
      const deadline = Date.now() + EXPORT_TIMEOUT_MS;
      while ((job.status === "QUEUED" || job.status === "RUNNING") && Date.now() < deadline) {
        await wait(EXPORT_POLL_MS);
        job = await dashboardApi.getExport(job.id);
      }
      if (job.status === "COMPLETED" && job.download_token) {
        startDownload(dashboardApi.exportDownloadUrl(job.download_token));
        announce(`Exported ${job.total_rows} prospect${job.total_rows === 1 ? "" : "s"} as CSV.`);
      } else if (job.status === "FAILED") {
        announce(`The export failed: ${job.error_message ?? "unknown error"}`);
      } else {
        announce("The export is taking longer than expected. Try again in a few minutes.");
      }
    } catch (error) {
      announce(errorText(error, "The export couldn't be started."));
    } finally {
      if (mounted.current) setExporting(false);
    }
  }, [search.state, exporting, announce]);

  const removeChip = useCallback(
    (chip: ActiveFilterChip) => {
      if (chip.key === "query") search.setQuery("");
      else if (chip.value !== undefined && Array.isArray(search.filters[chip.key])) search.toggleOption(chip.key as MultiFilterKey, chip.value);
      else search.clearField(chip.key);
    },
    [search],
  );

  const saveCurrentSearch = useCallback(
    async (name: string) => {
      try {
        await saveSearch(name, search.filters);
        announce(`Saved search “${name}”.`);
      } catch (error) {
        announce(errorText(error, "The search couldn't be saved."));
      }
    },
    [saveSearch, search.filters, announce],
  );

  /** Applies the saved filters, runs the search and opens the results. */
  const applySavedSearch = useCallback(
    (saved: SavedSearch) => {
      search.replaceFilters(saved.filters);
      void search.run(saved.filters);
      announce(`Applied saved search “${saved.name}”.`);
      if (pathname !== DASHBOARD_PAGES.search.href) router.push(DASHBOARD_PAGES.search.href);
    },
    [search, announce, pathname, router],
  );

  const deleteSavedSearch = useCallback(
    async (id: string) => {
      try {
        await removeSavedSearch(id);
        announce("Deleted the saved search.");
      } catch (error) {
        announce(errorText(error, "The saved search couldn't be deleted."));
      }
    },
    [removeSavedSearch, announce],
  );

  const createList = useCallback(
    async (name: string, prospects: readonly Prospect[]) => {
      try {
        await storeList(name, prospects);
        announce(`Created list “${name}” with ${prospects.length} prospect${prospects.length === 1 ? "" : "s"}.`);
      } catch (error) {
        announce(errorText(error, "The list couldn't be created."));
      }
    },
    [storeList, announce],
  );

  const exportList = useCallback((list: ProspectList) => exportProspects(list.prospects, list.name), [exportProspects]);

  const deleteList = useCallback(
    async (id: string) => {
      try {
        await removeList(id);
        announce("Deleted the list.");
      } catch (error) {
        announce(errorText(error, "The list couldn't be deleted."));
      }
    },
    [removeList, announce],
  );

  return {
    exportProspects,
    exportResults,
    exporting,
    removeChip,
    saveCurrentSearch,
    applySavedSearch,
    deleteSavedSearch,
    createList,
    exportList,
    deleteList,
  };
}
