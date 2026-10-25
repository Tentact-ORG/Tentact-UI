"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { DownloadIcon } from "../components/icons";
import { useCreditSummary } from "../credits/useCredits";
import { DASHBOARD_PAGES } from "../navigation";
import { activeFilterChips } from "./prospect.filters";
import type { ProspectFilters } from "./prospect.types";
import styles from "./Prospecting.module.css";

/** Upper bound on rows in one export (the server also enforces EXPORT_MAX_ROWS). */
export const MAX_EXPORT_ROWS = 100_000;

interface ExportDialogProps {
  open: boolean;
  /** The filters the results were found with. */
  filters: ProspectFilters;
  /** Matching prospects for those filters. */
  total: number;
  exactCount: boolean;
  onExport: (rows: number) => void;
  onClose: () => void;
}

const fmt = (value: number) => value.toLocaleString("en-US");

/**
 * Confirms a full-results export: the filters it was found with, how many
 * contacts will be exported (capped by the credit balance) and what it may cost.
 */
export function ExportDialog({ open, filters, total, exactCount, onExport, onClose }: ExportDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const inputId = useId();
  const { summary } = useCreditSummary();

  // Credits only limit the export when contact details are charged.
  const credit = summary?.enabled && summary.cost_per_contact > 0 ? summary : null;
  const affordable = credit ? Math.floor(credit.balance / credit.cost_per_contact) : Number.POSITIVE_INFINITY;
  const maxRows = Math.max(0, Math.min(total, MAX_EXPORT_ROWS, affordable));
  const [input, setInput] = useState("");
  const parsed = Number(input.replace(/[^\d]/g, ""));
  const rows = input === "" ? maxRows : Math.max(0, Math.min(maxRows, Number.isFinite(parsed) ? parsed : 0));
  const chips = activeFilterChips(filters);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const limitReason =
    credit && maxRows < Math.min(total, MAX_EXPORT_ROWS)
      ? `Your ${fmt(credit.balance)} credits cover ${fmt(affordable)} contacts.`
      : total > MAX_EXPORT_ROWS
        ? `One export holds up to ${fmt(MAX_EXPORT_ROWS)} contacts.`
        : null;

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onClose={() => {
        setInput("");
        onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop (the dialog element itself) closes it.
        if (event.target === ref.current) ref.current.close();
      }}
    >
      <form
        method="dialog"
        className={styles.dialogBody}
        onSubmit={(event) => {
          event.preventDefault();
          if (rows < 1) return;
          onExport(rows);
          ref.current?.close();
        }}
      >
        <h2 id={titleId} className={styles.dialogTitle}>
          Export contacts
        </h2>

        <div>
          <p className={styles.dialogLabel}>Filters</p>
          <div className={styles.dialogChips}>
            {chips.length === 0 ? (
              <span className={styles.muted}>No filters</span>
            ) : (
              chips.map((chip) => (
                <span key={`${chip.key}:${chip.value ?? ""}`} className={styles.dialogChip}>
                  {chip.label}
                </span>
              ))
            )}
          </div>
        </div>

        <dl className={styles.dialogFacts}>
          <div>
            <dt>Matching contacts</dt>
            <dd>
              {exactCount ? "" : "at least "}
              {fmt(total)}
            </dd>
          </div>
          {credit && (
            <div>
              <dt>Credit balance</dt>
              <dd>{fmt(credit.balance)}</dd>
            </div>
          )}
        </dl>

        {maxRows < 1 ? (
          <p className={styles.dialogWarning}>
            You have no credits left to export contact details.{" "}
            <ButtonLink variant="line" href={DASHBOARD_PAGES.credits.href}>
              Buy credits
            </ButtonLink>
          </p>
        ) : (
          <>
            <div>
              <label htmlFor={inputId} className={styles.dialogLabel}>
                Contacts to export
              </label>
              <input
                id={inputId}
                className={styles.dialogInput}
                inputMode="numeric"
                value={input === "" ? String(maxRows) : input}
                onChange={(event) => setInput(event.target.value)}
                onBlur={() => setInput(String(rows))}
                aria-describedby={`${inputId}-hint`}
              />
              <small id={`${inputId}-hint`} className={styles.muted}>
                Up to {fmt(maxRows)}, in the order shown in the results. {limitReason}
              </small>
            </div>
            {credit && (
              <p className={styles.dialogNote}>
                Costs up to <b>{fmt(rows * credit.cost_per_contact)} credits</b>. Contacts you have already paid for, and contacts
                without an email or phone, are free.
              </p>
            )}
          </>
        )}

        <div className={styles.dialogActions}>
          <button type="button" className={styles.linkButton} onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <Button type="submit" variant="ink" disabled={rows < 1}>
            <DownloadIcon />
            <span>Export {fmt(rows)} contact{rows === 1 ? "" : "s"}</span>
          </Button>
        </div>
      </form>
    </dialog>
  );
}
