"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { cx } from "@/lib/cx";
import { DEFAULT_EXPORT_FIELDS, EXPORT_FIELD_GROUPS, EXPORT_FIELDS, includesContactDetails } from "@/lib/exportFields";
import { DownloadIcon } from "../components/icons";
import { useCreditSummary } from "../credits/useCredits";
import { DASHBOARD_PAGES } from "../navigation";
import { useWorkspaceData } from "../WorkspaceDataContext";
import { activeFilterChips } from "./prospect.filters";
import type { ProspectFilters } from "./prospect.types";
import styles from "./Prospecting.module.css";

/** Upper bound on rows in one export (the server also enforces EXPORT_MAX_ROWS). */
export const MAX_EXPORT_ROWS = 100_000;

export type ExportScope =
  /** Every result of the last search, exported by the server. */
  | { kind: "results"; total: number; exactCount: boolean }
  /** Prospects selected on screen; `masked` of them still need their contact details revealed. */
  | { kind: "selection"; count: number; masked: number };

interface ExportDialogProps {
  open: boolean;
  scope: ExportScope;
  /** The filters the results were found with. */
  filters: ProspectFilters | null;
  /** Called with the number of rows (results) and the chosen field keys. */
  onExport: (rows: number, fields: readonly string[]) => void;
  onClose: () => void;
}

const fmt = (value: number) => value.toLocaleString("en-US");

/**
 * Confirms an export: the filters, the fields to include (a checklist,
 * remembered per browser), how many contacts and what it may cost. Only email
 * and phone cost credits, so an export without them is free and not capped.
 */
export function ExportDialog({ open, scope, filters, onExport, onClose }: ExportDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const inputId = useId();
  const { summary } = useCreditSummary();
  const { exportFields, setExportFields } = useWorkspaceData();

  const chosen = new Set(exportFields);
  const paid = includesContactDetails(exportFields);
  // Credits only limit exports that include contact details.
  const credit = paid && summary?.enabled && summary.cost_per_contact > 0 ? summary : null;
  const affordable = credit ? Math.floor(credit.balance / credit.cost_per_contact) : Number.POSITIVE_INFINITY;

  const available = scope.kind === "results" ? Math.min(scope.total, MAX_EXPORT_ROWS) : scope.count;
  const maxRows = scope.kind === "results" ? Math.max(0, Math.min(available, affordable)) : scope.count;
  const [input, setInput] = useState("");
  const parsed = Number(input.replace(/[^\d]/g, ""));
  const rows = scope.kind === "selection" ? scope.count : input === "" ? maxRows : Math.max(0, Math.min(maxRows, Number.isFinite(parsed) ? parsed : 0));
  const chargeable = scope.kind === "results" ? rows : scope.masked;
  const shortOfCredits = scope.kind === "selection" && credit !== null && affordable < scope.masked;
  const chips = filters ? activeFilterChips(filters) : [];

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const toggleField = (key: string) =>
    setExportFields((current) => (current.includes(key) ? current.filter((k) => k !== key) : EXPORT_FIELDS.filter((f) => f.key === key || current.includes(f.key)).map((f) => f.key)));

  const limitReason =
    scope.kind !== "results"
      ? null
      : credit && maxRows < available
        ? `Your ${fmt(credit.balance)} credits cover ${fmt(affordable)} contacts with email or phone.`
        : scope.total > MAX_EXPORT_ROWS
          ? `One export holds up to ${fmt(MAX_EXPORT_ROWS)} contacts.`
          : null;
  const canExport = rows >= 1 && exportFields.length > 0 && !shortOfCredits;

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
          if (!canExport) return;
          onExport(rows, exportFields);
          ref.current?.close();
        }}
      >
        <h2 id={titleId} className={styles.dialogTitle}>
          {scope.kind === "results" ? "Export contacts" : `Export ${fmt(scope.count)} selected contact${scope.count === 1 ? "" : "s"}`}
        </h2>

        {chips.length > 0 && (
          <div>
            <p className={styles.dialogLabel}>Filters</p>
            <div className={styles.dialogChips}>
              {chips.map((chip) => (
                <span key={`${chip.key}:${chip.value ?? ""}`} className={styles.dialogChip}>
                  {chip.label}
                </span>
              ))}
            </div>
          </div>
        )}

        <fieldset className={styles.fieldChecklist}>
          <legend className={styles.dialogLabel}>
            Fields to export · {exportFields.length} selected
            <button type="button" className={styles.linkButton} onClick={() => setExportFields(DEFAULT_EXPORT_FIELDS)}>
              Reset
            </button>
          </legend>
          {EXPORT_FIELD_GROUPS.map((group) => (
            <div key={group} className={styles.fieldGroup}>
              <p className={styles.fieldGroupName}>{group}</p>
              <div className={styles.fieldOptions}>
                {EXPORT_FIELDS.filter((field) => field.group === group).map((field) => (
                  <label key={field.key} className={cx(styles.fieldOption, chosen.has(field.key) && styles.fieldOptionOn)}>
                    <input type="checkbox" checked={chosen.has(field.key)} onChange={() => toggleField(field.key)} />
                    <span>{field.label}</span>
                    {field.contactDetail && <small>credits</small>}
                  </label>
                ))}
              </div>
            </div>
          ))}
          {exportFields.length === 0 && <p className={styles.dialogWarning}>Choose at least one field.</p>}
        </fieldset>

        <dl className={styles.dialogFacts}>
          <div>
            <dt>{scope.kind === "results" ? "Matching contacts" : "Selected"}</dt>
            <dd>
              {scope.kind === "results" ? `${scope.exactCount ? "" : "at least "}${fmt(scope.total)}` : fmt(scope.count)}
            </dd>
          </div>
          {credit && (
            <div>
              <dt>Credit balance</dt>
              <dd>{fmt(credit.balance)}</dd>
            </div>
          )}
        </dl>

        {scope.kind === "results" && maxRows < 1 ? (
          <p className={styles.dialogWarning}>
            You have no credits left to export emails or phone numbers. Untick them to export the other fields for free, or{" "}
            <ButtonLink variant="line" href={DASHBOARD_PAGES.credits.href}>
              buy credits
            </ButtonLink>
          </p>
        ) : (
          <>
            {scope.kind === "results" && (
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
            )}
            <p className={styles.dialogNote}>
              {!paid ? (
                <>No email or phone selected: this export is free.</>
              ) : credit ? (
                <>
                  Costs up to <b>{fmt(chargeable * credit.cost_per_contact)} credits</b> for email and phone. Contacts you have already paid for,
                  and contacts without an email or phone, are free.
                </>
              ) : (
                <>Email and phone are included.</>
              )}
            </p>
            {shortOfCredits && (
              <p className={styles.dialogWarning}>
                Revealing these {fmt(scope.masked)} contacts needs more credits than your {fmt(credit.balance)}. Untick email and phone, or{" "}
                <ButtonLink variant="line" href={DASHBOARD_PAGES.credits.href}>
                  buy credits
                </ButtonLink>
              </p>
            )}
          </>
        )}

        <div className={styles.dialogActions}>
          <button type="button" className={styles.linkButton} onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <Button type="submit" variant="ink" disabled={!canExport}>
            <DownloadIcon />
            <span>
              Export {fmt(rows)} contact{rows === 1 ? "" : "s"}
            </span>
          </Button>
        </div>
      </form>
    </dialog>
  );
}
