"use client";

import { useMemo, useState } from "react";
import { DataSourceBadge } from "../components/DataSourceBadge";
import { PageHeader } from "../components/PageHeader";
import { ActiveFilters } from "../prospecting/ActiveFilters";
import type { ProspectFilters } from "../prospecting/prospect.types";
import { ProspectSearch } from "../prospecting/ProspectSearch";
import { PAGE_SIZE, ProspectTable } from "../prospecting/ProspectTable";
import { useProspectingActions } from "../prospecting/useProspectingActions";
import { useWorkspaceData } from "../WorkspaceDataContext";
import styles from "./Pages.module.css";

/** /home/search: the filter panel and the full, selectable results. */
export function SearchPage() {
  const { search, role } = useWorkspaceData();
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

  const saveSelectionAsList = (name: string) => {
    void actions.createList(
      name,
      results.filter((prospect) => visibleSelectedIds.has(prospect.id)),
    );
    setSelectedIds(new Set());
  };

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Prospecting"
        title="Prospect search"
        description="Combine people and company filters, then save the search, export the results, or select prospects to build a list."
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
        onExport={() => void actions.exportResults()}
      />

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
        onSaveSelectionAsList={saveSelectionAsList}
        onExportSelection={() => actions.exportProspects(results.filter((p) => visibleSelectedIds.has(p.id)), "selection")}
        onClearFilters={search.clearAll}
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
