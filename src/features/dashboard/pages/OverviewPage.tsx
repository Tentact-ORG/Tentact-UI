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
  const { search, prospects, savedSearches } = useWorkspaceData();
  const { filters, results, summary } = search;
  const actions = useProspectingActions();

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
        <StatCard label="Matching prospects" value={summary.total} detail={`of ${prospects.length} in the workspace`} tone="ink" />
        <StatCard label="Verified emails" value={summary.verifiedEmail} detail={`${percentage(summary.verifiedEmail, summary.total)}% of matches`} tone="mint" />
        <StatCard label="Direct dials" value={summary.directDial} detail={`${percentage(summary.directDial, summary.total)}% of matches`} tone="sky" />
        <StatCard label="Changed jobs" value={summary.recentJobChanges} detail="In the last 90 days" tone="yellow" />
        <StatCard label="High intent" value={summary.highIntent} detail="Companies showing buying signals" tone="peach" />
      </section>

      <ProspectSearch />

      <ActiveFilters
        filters={filters}
        resultCount={results.length}
        totalCount={prospects.length}
        onRemove={actions.removeChip}
        onClearAll={search.clearAll}
        onSaveSearch={actions.saveCurrentSearch}
        onExport={() => actions.exportProspects(results, filters.query || "prospects")}
        viewResultsHref={DASHBOARD_PAGES.search.href}
      />

      <SavedSearches searches={savedSearches} onApply={actions.applySavedSearch} onDelete={actions.deleteSavedSearch} />
    </div>
  );
}
