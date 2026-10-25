"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, dashboardApi, errorText } from "../api/dashboard.api";
import { notifyCreditsChanged } from "../credits/useCredits";
import { DASHBOARD_PAGES } from "../navigation";
import { useWorkspaceData } from "../WorkspaceDataContext";
import { MAX_EXPORT_ROWS } from "./ExportDialog";
import { includesContactDetails } from "@/lib/exportFields";
import { buildFieldCsv, downloadTextFile, exportFilename } from "./prospect.export";
import type { ActiveFilterChip } from "./prospect.filters";
import type { MultiFilterKey, Prospect, ProspectList, SavedSearch } from "./prospect.types";

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
  const { search, exportFields, announce, saveSearch, deleteSavedSearch: removeSavedSearch, createList: storeList, deleteList: removeList } =
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

  /** CSV of prospects already on screen (a selection or a saved list), with the chosen export fields. */
  const exportProspects = useCallback(
    (items: readonly Prospect[], label: string, fields: readonly string[] = exportFields) => {
      downloadTextFile(exportFilename(label), buildFieldCsv(items, fields));
      announce(`Exported ${items.length} prospect${items.length === 1 ? "" : "s"} as CSV.`);
    },
    [exportFields, announce],
  );

  /**
   * Reveals the masked contact details among `items` (charging credits for new
   * contacts) and returns the prospects unmasked, or null when it failed.
   */
  const revealProspects = useCallback(
    async (items: readonly Prospect[]): Promise<Prospect[] | null> => {
      try {
        const outcome = await search.reveal(items);
        if (outcome.revealed > 0) {
          announce(
            `Revealed ${outcome.revealed} contact${outcome.revealed === 1 ? "" : "s"}` +
              (outcome.charged > 0 ? ` for ${outcome.charged} credit${outcome.charged === 1 ? "" : "s"}.` : " (already paid for)."),
          );
        }
        return outcome.prospects;
      } catch (error) {
        const topUp = error instanceof ApiError && error.status === 402 ? " Top up on the Credits page." : "";
        announce(`${errorText(error, "The contacts couldn't be revealed.")}${topUp}`);
        return null;
      }
    },
    [search, announce],
  );

  /** Every result of the last search, generated as a server-side export job and downloaded when ready. */
  const exportResults = useCallback(async (requestedRows?: number, fields: readonly string[] = exportFields) => {
    const { searchedRequest, total } = search.state;
    if (!searchedRequest || exporting) return;
    setExporting(true);
    try {
      // Export what the balance covers (each new contact with contact details costs credits; others are free,
      // so this is a safe upper bound) instead of starting a job that fails for lack of credits.
      let rows = Math.min(Math.max(requestedRows ?? total, 1), MAX_EXPORT_ROWS);
      const credits = await dashboardApi.credits();
      // Only email and phone cost credits; without them the export isn't capped by the balance.
      if (credits.enabled && credits.cost_per_contact > 0 && includesContactDetails(fields)) {
        const affordable = Math.floor(credits.balance / credits.cost_per_contact);
        if (affordable < 1) {
          announce("You have no credits left to export contact details. Top up on the Credits page.");
          return;
        }
        if (affordable < rows) {
          announce(`Your ${credits.balance.toLocaleString("en-US")} credits cover ${affordable.toLocaleString("en-US")} contacts: exporting the first ${affordable.toLocaleString("en-US")}. Top up to export more.`);
          rows = affordable;
        } else announce(`Preparing your export of ${rows.toLocaleString("en-US")} contacts…`);
      } else announce(`Preparing your export of ${rows.toLocaleString("en-US")} contacts…`);
      let job = await dashboardApi.createExport(searchedRequest, rows, fields);
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
      // Exporting contact details charges credits for contacts not paid for yet.
      notifyCreditsChanged();
      if (mounted.current) setExporting(false);
    }
  }, [search.state, exporting, announce, exportFields]);

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
    revealProspects,
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
