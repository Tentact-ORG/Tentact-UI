"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { BookmarkIcon, DownloadIcon, ListIcon, TrashIcon } from "../components/icons";
import { countActiveFilters } from "./prospect.filters";
import type { ProspectList, SavedSearch } from "./prospect.types";
import styles from "./Prospecting.module.css";

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : dateFormatter.format(date);
}

interface PanelDisplayProps {
  /** Show at most this many items (the overview's summary cards). */
  limit?: number;
  /** Adds a "View all" link to the full page. */
  viewAllHref?: string;
}

function PanelCount({ count, viewAllHref }: { count: number; viewAllHref?: string }) {
  if (viewAllHref) {
    return (
      <Link href={viewAllHref} className={styles.viewAll}>
        View all ({count}) →
      </Link>
    );
  }
  return <span className={styles.panelCardCount}>{count}</span>;
}

interface SavedSearchesProps extends PanelDisplayProps {
  searches: readonly SavedSearch[];
  onApply: (search: SavedSearch) => void;
  onDelete: (id: string) => void;
}

export function SavedSearches({ searches, onApply, onDelete, limit, viewAllHref }: SavedSearchesProps) {
  const shown = limit === undefined ? searches : searches.slice(0, limit);
  return (
    <section className={styles.panelCard} aria-labelledby="saved-searches-title">
      <div className={styles.panelCardHead}>
        <h2 id="saved-searches-title">
          <BookmarkIcon />
          Saved searches
        </h2>
        <PanelCount count={searches.length} viewAllHref={viewAllHref} />
      </div>
      {searches.length === 0 ? (
        <p className={styles.panelCardEmpty}>
          Save a filter combination from Prospect search to reuse it later. Saved searches stay in this browser until the
          workspace is connected to your account.
        </p>
      ) : (
        <ul className={styles.panelList}>
          {shown.map((search) => (
            <li key={search.id} className={styles.panelItem}>
              <div className={styles.stack}>
                <b>{search.name}</b>
                <small>
                  {countActiveFilters(search.filters)} filter{countActiveFilters(search.filters) === 1 ? "" : "s"}
                  {search.filters.query.trim() ? ` · “${search.filters.query.trim()}”` : ""} · saved {formatDate(search.createdAt)}
                </small>
              </div>
              <div className={styles.panelItemActions}>
                <Button variant="line" onClick={() => onApply(search)}>
                  Apply
                </Button>
                <button type="button" className={styles.iconAction} onClick={() => onDelete(search.id)} aria-label={`Delete saved search ${search.name}`}>
                  <TrashIcon />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface ProspectListsProps extends PanelDisplayProps {
  lists: readonly ProspectList[];
  onExport: (list: ProspectList) => void;
  onDelete: (id: string) => void;
}

export function ProspectLists({ lists, onExport, onDelete, limit, viewAllHref }: ProspectListsProps) {
  const shown = limit === undefined ? lists : lists.slice(0, limit);
  return (
    <section className={styles.panelCard} aria-labelledby="lists-title">
      <div className={styles.panelCardHead}>
        <h2 id="lists-title">
          <ListIcon />
          Lists
        </h2>
        <PanelCount count={lists.length} viewAllHref={viewAllHref} />
      </div>
      {lists.length === 0 ? (
        <p className={styles.panelCardEmpty}>Select prospects in Prospect search and save them as a list to export together.</p>
      ) : (
        <ul className={styles.panelList}>
          {shown.map((list) => (
            <li key={list.id} className={styles.panelItem}>
              <div className={styles.stack}>
                <b>{list.name}</b>
                <small>
                  {list.prospectIds.length} prospect{list.prospectIds.length === 1 ? "" : "s"} · created {formatDate(list.createdAt)}
                </small>
              </div>
              <div className={styles.panelItemActions}>
                <Button variant="line" onClick={() => onExport(list)}>
                  <DownloadIcon />
                  <span>Export</span>
                </Button>
                <button type="button" className={styles.iconAction} onClick={() => onDelete(list.id)} aria-label={`Delete list ${list.name}`}>
                  <TrashIcon />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
