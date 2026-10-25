"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { cx } from "@/lib/cx";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon, ListIcon, MailIcon, PhoneIcon } from "../components/icons";
import { fullName, initials } from "./prospect.matching";
import type { Prospect } from "./prospect.types";
import type { SearchStatus } from "./useProspectSearch";
import styles from "./Prospecting.module.css";

export const PAGE_SIZE = 8;

interface ProspectTableProps {
  results: readonly Prospect[];
  status: SearchStatus;
  /** Error or clarification text from the last search. */
  message: string | null;
  /** Matching prospects in the warehouse (more than `results` when not all are loaded). */
  total: number;
  hasMore: boolean;
  onLoadMore: () => void;
  page: number;
  onPageChange: (page: number) => void;
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (id: string) => void;
  onTogglePage: (ids: string[], select: boolean) => void;
  onClearSelection: () => void;
  /** Selected prospects whose email and phone are still masked; saving or exporting reveals them for credits. */
  maskedInSelection: number;
  onRevealSelection: () => void;
  onSaveSelectionAsList: (name: string) => void;
  onExportSelection: () => void;
  onClearFilters: () => void;
}

function SignalChips({ prospect }: { prospect: Prospect }) {
  const chips: { label: string; tone: string }[] = [];
  if (prospect.jobChangeDays !== null && prospect.jobChangeDays <= 90) {
    chips.push({ label: `New role · ${prospect.jobChangeDays}d`, tone: styles.signalYellow });
  }
  const hiring = prospect.company.hiring[0];
  if (hiring) chips.push({ label: hiring, tone: styles.signalMint });
  if (prospect.company.intent === "High") chips.push({ label: "High intent", tone: styles.signalPeach });
  if (chips.length === 0) return <span className={styles.muted}>—</span>;
  return (
    <span className={styles.signals}>
      {chips.map((chip) => (
        <span key={chip.label} className={cx(styles.signal, chip.tone)}>
          {chip.label}
        </span>
      ))}
    </span>
  );
}

function VerifiedMarks({ prospect }: { prospect: Prospect }) {
  return (
    <span className={styles.verified}>
      <span
        className={cx(styles.verifiedMark, prospect.verifiedEmail && styles.verifiedOn)}
        aria-label={prospect.verifiedEmail ? "Verified email" : "Email not verified"}
        role="img"
      >
        <MailIcon width={14} height={14} />
        {prospect.verifiedEmail && <CheckIcon width={10} height={10} className={styles.verifiedTick} />}
      </span>
      <span
        className={cx(styles.verifiedMark, prospect.directDial && styles.verifiedOn)}
        aria-label={prospect.directDial ? "Phone number on record" : "No phone number"}
        role="img"
      >
        <PhoneIcon width={14} height={14} />
        {prospect.directDial && <CheckIcon width={10} height={10} className={styles.verifiedTick} />}
      </span>
    </span>
  );
}

function SaveListForm({ onSave }: { onSave: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setName("");
    setEditing(false);
  };
  if (!editing) {
    return (
      <Button variant="ink" onClick={() => setEditing(true)}>
        <ListIcon />
        <span>Save as list</span>
      </Button>
    );
  }
  return (
    <form className={styles.inlineForm} onSubmit={submit}>
      <input
        type="text"
        className={styles.inlineInput}
        placeholder="List name"
        aria-label="List name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={60}
        autoFocus
        required
      />
      <Button type="submit" variant="ink">
        Create
      </Button>
      <button type="button" className={styles.linkButton} onClick={() => setEditing(false)}>
        Cancel
      </button>
    </form>
  );
}

function pageNumbers(current: number, total: number): number[] {
  const windowStart = Math.max(1, Math.min(current - 2, total - 4));
  return Array.from({ length: Math.min(5, total) }, (_, index) => windowStart + index);
}

/** Results as a table on wide screens and as cards on narrow ones, with selection and paging. */
export function ProspectTable({
  results,
  status,
  message,
  total,
  hasMore,
  onLoadMore,
  page,
  onPageChange,
  selectedIds,
  onToggleSelect,
  onTogglePage,
  onClearSelection,
  maskedInSelection,
  onRevealSelection,
  onSaveSelectionAsList,
  onExportSelection,
  onClearFilters,
}: ProspectTableProps) {
  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = results.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pageIds = pageItems.map((prospect) => prospect.id);
  const allOnPageSelected = pageItems.length > 0 && pageIds.every((id) => selectedIds.has(id));

  return (
    <section className={styles.results} aria-labelledby="results-title">
      <div className={styles.resultsHead}>
        <div>
          <h2 id="results-title">Prospects</h2>
          <p className={styles.resultsMeta}>
            {status === "loading"
              ? "Searching the warehouse…"
              : results.length === 0
                ? "No results"
                : `${total.toLocaleString("en-US")} result${total === 1 ? "" : "s"} · ${results.length.toLocaleString("en-US")} loaded · page ${currentPage} of ${pageCount}`}
          </p>
        </div>
        {selectedIds.size > 0 && (
          <div className={styles.bulkBar} role="toolbar" aria-label="Selection actions">
            <b>{selectedIds.size} selected</b>
            {maskedInSelection > 0 && (
              <Button variant="line" onClick={onRevealSelection} title="Each contact not revealed before costs credits, once">
                <MailIcon />
                <span>
                  Reveal {maskedInSelection} contact{maskedInSelection === 1 ? "" : "s"}
                </span>
              </Button>
            )}
            <SaveListForm onSave={onSaveSelectionAsList} />
            <Button variant="line" onClick={onExportSelection}>
              <DownloadIcon />
              <span>Export selected</span>
            </Button>
            <button type="button" className={styles.linkButton} onClick={onClearSelection}>
              Clear
            </button>
          </div>
        )}
      </div>

      {status === "loading" ? (
        <div className={styles.empty} role="status">
          <p>Generating and checking the query, then searching the warehouse. This can take up to a minute.</p>
        </div>
      ) : status === "error" || status === "clarification" ? (
        <div className={styles.empty} role={status === "error" ? "alert" : "status"}>
          <p>{message ?? "The search couldn't be completed."}</p>
          {status === "clarification" && <p className={styles.muted}>Add detail to the search or choose filters, then search again.</p>}
        </div>
      ) : status === "idle" ? (
        <div className={styles.empty}>
          <p>Describe who you&apos;re looking for or choose filters, then press Enter to search.</p>
        </div>
      ) : results.length === 0 ? (
        <div className={styles.empty}>
          <p>No prospects match these filters.</p>
          <Button variant="line" onClick={onClearFilters}>
            Clear filters
          </Button>
        </div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col" className={styles.checkCell}>
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={() => onTogglePage(pageIds, !allOnPageSelected)}
                      aria-label="Select everyone on this page"
                    />
                  </th>
                  <th scope="col">Person</th>
                  <th scope="col">Company</th>
                  <th scope="col">Location</th>
                  <th scope="col">Signals</th>
                  <th scope="col">Verified</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((prospect) => {
                  const selected = selectedIds.has(prospect.id);
                  return (
                    <tr key={prospect.id} className={cx(selected && styles.rowSelected)}>
                      <td className={styles.checkCell}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => onToggleSelect(prospect.id)}
                          aria-label={`Select ${fullName(prospect)}`}
                        />
                      </td>
                      <td>
                        <span className={styles.person}>
                          <span className={styles.personAvatar} aria-hidden="true">
                            {initials(prospect)}
                          </span>
                          <span className={styles.stack}>
                            <b>{fullName(prospect)}</b>
                            <small>{prospect.title}</small>
                            {prospect.email && (
                              <small className={cx(prospect.contactMasked && styles.muted)} title={prospect.contactMasked ? "Reveal to see the full email (costs credits)" : undefined}>
                                {prospect.email}
                              </small>
                            )}
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className={styles.stack}>
                          <b>{prospect.company.name}</b>
                          <small>
                            {prospect.company.industry} · {prospect.company.employees}
                          </small>
                        </span>
                      </td>
                      <td>
                        <span className={styles.stack}>
                          <span>{prospect.city}</span>
                          <small>{prospect.country}</small>
                        </span>
                      </td>
                      <td>
                        <SignalChips prospect={prospect} />
                      </td>
                      <td>
                        <VerifiedMarks prospect={prospect} />
                      </td>
                      <td>
                        <small className={styles.muted}>{prospect.sources.join(", ")}</small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className={styles.cards}>
            {pageItems.map((prospect) => {
              const selected = selectedIds.has(prospect.id);
              return (
                <li key={prospect.id} className={cx(styles.card, selected && styles.cardSelected)}>
                  <label className={styles.cardSelect}>
                    <input type="checkbox" checked={selected} onChange={() => onToggleSelect(prospect.id)} />
                    <span className="sr-only">Select {fullName(prospect)}</span>
                  </label>
                  <span className={styles.personAvatar} aria-hidden="true">
                    {initials(prospect)}
                  </span>
                  <div className={styles.cardBody}>
                    <b>{fullName(prospect)}</b>
                    <small>{prospect.title}</small>
                    <small>
                      {prospect.company.name} · {prospect.city}, {prospect.country}
                    </small>
                    <div className={styles.cardFoot}>
                      <SignalChips prospect={prospect} />
                      <VerifiedMarks prospect={prospect} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {(hasMore || status === "loadingMore") && currentPage === pageCount && (
            <div className={styles.loadMore}>
              <Button variant="line" onClick={onLoadMore} loading={status === "loadingMore"} disabled={status === "loadingMore"}>
                {status === "loadingMore" ? "Loading more…" : "Load more prospects"}
              </Button>
            </div>
          )}

          {pageCount > 1 && (
            <nav className={styles.pagination} aria-label="Results pages">
              <button
                type="button"
                className={styles.pageButton}
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                aria-label="Previous page"
              >
                <ChevronLeftIcon />
              </button>
              {pageNumbers(currentPage, pageCount).map((number) => (
                <button
                  key={number}
                  type="button"
                  className={cx(styles.pageButton, number === currentPage && styles.pageButtonOn)}
                  onClick={() => onPageChange(number)}
                  aria-current={number === currentPage ? "page" : undefined}
                >
                  {number}
                </button>
              ))}
              <button
                type="button"
                className={styles.pageButton}
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === pageCount}
                aria-label="Next page"
              >
                <ChevronRightIcon />
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
