"use client";

import { DataSourceBadge } from "../components/DataSourceBadge";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { DASHBOARD_PAGES } from "../navigation";
import { ActiveFilters } from "../prospecting/ActiveFilters";
import { percentage } from "../prospecting/prospect.matching";
import { ProspectSearch } from "../prospecting/ProspectSearch";
import { SavedSearches } from "../prospecting/SavedPanels";
import { useProspectingActions } from "../prospecting/useProspectingActions";
import { useWorkspaceData } from "../WorkspaceDataContext";
import styles from "./Pages.module.css";

interface OverviewPageProps {
  firstName: string;
  workspaceName: string;
}

/** /home: the workspace at a glance, the search bar, and saved searches. Enrichment lives in the search panel's Enrich tab. */
export function OverviewPage({ firstName, workspaceName }: OverviewPageProps) {
  const { search, savedSearches } = useWorkspaceData();
  const { filters, results, summary, state } = search;
  const actions = useProspectingActions();
  const searched = state.status === "success";
  const loadedNote = `of ${results.length.toLocaleString("en-US")} loaded`;

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Home"
        title={`Welcome back, ${firstName}.`}
        description={
          <>
            Here&apos;s what&apos;s happening in <b>{workspaceName}</b>.
          </>
        }
        aside={<DataSourceBadge />}
      />

      <section className={styles.stats} aria-label="Overview of the current results">
        <StatCard
          label="Matching prospects"
          value={searched ? state.total : 0}
          detail={searched ? (state.exactCount ? "Distinct people in the warehouse" : "At least this many") : "Run a search to see matches"}
          tone="ink"
        />
        <StatCard label="Verified emails" value={summary.verifiedEmail} detail={`${percentage(summary.verifiedEmail, summary.total)}% ${loadedNote}`} tone="mint" />
        <StatCard label="Phone numbers" value={summary.directDial} detail={`${percentage(summary.directDial, summary.total)}% ${loadedNote}`} tone="sky" />
        <StatCard label="Changed jobs" value={summary.recentJobChanges} detail={`In the last 90 days, ${loadedNote}`} tone="yellow" />
        <StatCard label="Hiring now" value={summary.hiring} detail={`At companies with open roles, ${loadedNote}`} tone="peach" />
      </section>

      <ProspectSearch />

      <ActiveFilters
        filters={filters}
        resultCount={searched ? state.total : null}
        exactCount={state.exactCount}
        exporting={actions.exporting}
        onRemove={actions.removeChip}
        onClearAll={search.clearAll}
        onSaveSearch={(name) => void actions.saveCurrentSearch(name)}
        onExport={(rows) => void actions.exportResults(rows)}
        searchedFilters={search.state.searchedFilters}
        viewResultsHref={DASHBOARD_PAGES.search.href}
      />

      <SavedSearches searches={savedSearches} onApply={actions.applySavedSearch} onDelete={(id) => void actions.deleteSavedSearch(id)} />
    </div>
  );
}
