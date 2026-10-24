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
  const { search, prospects } = useWorkspaceData();
  const { filters, results } = search;
  const actions = useProspectingActions();

  // The page is remembered per filter set, so changing a filter starts from the first page again.
  const [pageState, setPageState] = useState<{ filters: ProspectFilters; page: number } | null>(null);
  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const page = Math.min(pageState && pageState.filters === filters ? pageState.page : 1, pageCount);

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
    actions.createList(name, [...visibleSelectedIds]);
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
        resultCount={results.length}
        totalCount={prospects.length}
        onRemove={actions.removeChip}
        onClearAll={search.clearAll}
        onSaveSearch={actions.saveCurrentSearch}
        onExport={() => actions.exportProspects(results, filters.query || "prospects")}
      />

      <ProspectTable
        results={results}
        page={page}
        onPageChange={(next) => setPageState({ filters, page: next })}
        selectedIds={visibleSelectedIds}
        onToggleSelect={toggleSelect}
        onTogglePage={togglePage}
        onClearSelection={() => setSelectedIds(new Set())}
        onSaveSelectionAsList={saveSelectionAsList}
        onExportSelection={() => actions.exportProspects(results.filter((p) => visibleSelectedIds.has(p.id)), "selection")}
        onClearFilters={search.clearAll}
      />
    </div>
  );
}
