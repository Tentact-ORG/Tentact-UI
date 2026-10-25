"use client";

import { useMemo, useState } from "react";
import { DataSourceBadge } from "../components/DataSourceBadge";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { percentage } from "../prospecting/prospect.matching";
import { includesContactDetails } from "@/lib/exportFields";
import { ActiveFilters } from "../prospecting/ActiveFilters";
import { ExportDialog } from "../prospecting/ExportDialog";
import type { ProspectFilters } from "../prospecting/prospect.types";
import { ProspectSearch } from "../prospecting/ProspectSearch";
import { SavedSearches } from "../prospecting/SavedPanels";
import { PAGE_SIZE, ProspectTable } from "../prospecting/ProspectTable";
import { useProspectingActions } from "../prospecting/useProspectingActions";
import { useWorkspaceData } from "../WorkspaceDataContext";
import styles from "./Pages.module.css";

/** /home: the workspace — search and filters, saved searches, the results with their stats, lists and exports. */
export function SearchPage() {
  const { search, role, savedSearches } = useWorkspaceData();
  const { filters, results, state } = search;
  const actions = useProspectingActions();
  const searched = state.status === "success" || state.status === "loadingMore";

  // The page is remembered per result set, so a new search starts from the first page again.
  const [pageState, setPageState] = useState<{ filters: ProspectFilters | null; page: number } | null>(null);
  const resultKey = state.searchedFilters;
  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const page = Math.min(pageState && pageState.filters === resultKey ? pageState.page : 1, pageCount);

  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  // Only selections that are still in the results count; records filtered out are released.
  const visibleSelectedIds = useMemo(() => {
    const visible = new Set(results.map((prospect) => prospect.id));
    return new Set([...selectedIds].filter((id) => visible.has(id)));
  }, [results, selectedIds]);

  const toggleSelect = (id: string) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const togglePage = (ids: string[], select: boolean) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => (select ? next.add(id) : next.delete(id)));
      return next;
    });

  const selection = results.filter((prospect) => visibleSelectedIds.has(prospect.id));
  const maskedInSelection = selection.filter((prospect) => prospect.contactMasked).length;

  // Lists and CSVs hold full contact details, so masked contacts are revealed (for credits) first.
  const saveSelectionAsList = async (name: string) => {
    const revealed = await actions.revealProspects(selection);
    if (!revealed) return;
    await actions.createList(name, revealed);
    setSelectedIds(new Set());
  };

  // Contacts are revealed (for credits) only when the export includes email or phone.
  const [confirmingSelection, setConfirmingSelection] = useState(false);
  const exportSelection = async (fields: readonly string[]) => {
    const ready = includesContactDetails(fields) ? await actions.revealProspects(selection) : selection;
    if (ready) actions.exportProspects(ready, "selection", fields);
  };

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Prospecting"
        title="Prospect search"
        description="Describe your buyers or use the filters, review the results, then save them as a list or export them."
        aside={<DataSourceBadge />}
      />

      <ProspectSearch />

      <ActiveFilters
        filters={filters}
        resultCount={searched ? state.total : null}
        exactCount={state.exactCount}
        exporting={actions.exporting}
        onRemove={actions.removeChip}
        onClearAll={search.clearAll}
        onSaveSearch={(name) => void actions.saveCurrentSearch(name)}
        onExport={(rows, fields) => void actions.exportResults(rows, fields)}
        searchedFilters={search.state.searchedFilters}
      />

      {state.status === "success" && results.length > 0 && (
        <section className={styles.stats} aria-label="Overview of the current results">
          <StatCard label="Matching prospects" value={state.total} detail={state.exactCount ? "Distinct people in the warehouse" : "At least this many"} tone="ink" />
          <StatCard label="Verified emails" value={search.summary.verifiedEmail} detail={`${percentage(search.summary.verifiedEmail, search.summary.total)}% of ${results.length.toLocaleString("en-US")} loaded`} tone="mint" />
          <StatCard label="Phone numbers" value={search.summary.directDial} detail={`${percentage(search.summary.directDial, search.summary.total)}% of ${results.length.toLocaleString("en-US")} loaded`} tone="sky" />
          <StatCard label="Changed jobs" value={search.summary.recentJobChanges} detail={`In the last 90 days, of ${results.length.toLocaleString("en-US")} loaded`} tone="yellow" />
          <StatCard label="Hiring now" value={search.summary.hiring} detail={`At companies with open roles, of ${results.length.toLocaleString("en-US")} loaded`} tone="peach" />
        </section>
      )}

      {savedSearches.length > 0 && (
        <SavedSearches searches={savedSearches} onApply={actions.applySavedSearch} onDelete={(id) => void actions.deleteSavedSearch(id)} />
      )}

      {state.assumptions.length > 0 && state.status === "success" && (
        <p className={styles.searchNote}>Assumed: {state.assumptions.join(" ")}</p>
      )}

      <ProspectTable
        results={results}
        status={state.status}
        message={state.message}
        total={state.total}
        hasMore={search.hasMore}
        onLoadMore={search.loadMore}
        page={page}
        onPageChange={(next) => setPageState({ filters: resultKey, page: next })}
        selectedIds={visibleSelectedIds}
        onToggleSelect={toggleSelect}
        onTogglePage={togglePage}
        onClearSelection={() => setSelectedIds(new Set())}
        maskedInSelection={maskedInSelection}
        onRevealSelection={() => void actions.revealProspects(selection)}
        onSaveSelectionAsList={(name) => void saveSelectionAsList(name)}
        onExportSelection={() => setConfirmingSelection(true)}
        onClearFilters={search.clearAll}
      />

      <ExportDialog
        open={confirmingSelection}
        scope={{ kind: "selection", count: selection.length, masked: maskedInSelection }}
        filters={state.searchedFilters}
        onExport={(_rows, fields) => void exportSelection(fields)}
        onClose={() => setConfirmingSelection(false)}
      />

      {(role === "ADMIN" || role === "AUDITOR") && state.diagnostic?.generated_sql && (
        <details className={styles.diagnostic}>
          <summary>
            Query details · {state.diagnostic.reviewer_verdict ?? "—"} · validation {state.diagnostic.validation_status ?? "—"}
            {state.diagnostic.repair_attempts > 0 ? ` · ${state.diagnostic.repair_attempts} repair(s)` : ""}
          </summary>
          <pre>{state.diagnostic.generated_sql}</pre>
          {state.diagnostic.reviewer_reasoning && <p>{state.diagnostic.reviewer_reasoning}</p>}
        </details>
      )}
    </div>
  );
}
