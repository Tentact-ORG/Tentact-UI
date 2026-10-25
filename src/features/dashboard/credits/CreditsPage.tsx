"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cx } from "@/lib/cx";
import { formatThousands } from "@/lib/math";
import { dashboardApi, errorText, type CreditEntryRecord, type PendingCreditRequest } from "../api/dashboard.api";
import { CheckIcon } from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import pageStyles from "../pages/Pages.module.css";
import {
  buildTopUpMailto,
  CREDIT_PACKS,
  CREDIT_USES,
  CUSTOM_CREDITS,
  formatUsd,
  pricePerCredit,
  type CreditPack,
} from "./credits.data";
import styles from "./CreditsPage.module.css";
import { notifyCreditsChanged, useCreditSummary } from "./useCredits";

interface CreditsPageProps {
  workspaceName: string;
  email: string;
}

type Selection = { kind: "pack"; pack: CreditPack } | { kind: "custom" };

function clampCustom(value: number): number {
  if (!Number.isFinite(value)) return CUSTOM_CREDITS.min;
  const stepped = Math.round(value / CUSTOM_CREDITS.step) * CUSTOM_CREDITS.step;
  return Math.min(CUSTOM_CREDITS.max, Math.max(CUSTOM_CREDITS.min, stepped));
}

const REASON_LABELS: Record<string, string> = {
  grant: "Top-up",
  reveal: "Revealed contacts",
  export: "Export",
  adjustment: "Adjustment",
};

function entryLabel(entry: CreditEntryRecord): string {
  return REASON_LABELS[entry.reason] ?? entry.reason;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** /credits: the live balance, top-up requests and (for operators) the approval queue. */
export function CreditsPage({ workspaceName, email }: CreditsPageProps) {
  const defaultPack = CREDIT_PACKS.find((pack) => pack.highlight) ?? CREDIT_PACKS[0];
  const [selection, setSelection] = useState<Selection>({ kind: "pack", pack: defaultPack });
  const [customInput, setCustomInput] = useState(String(10_000));
  const customId = useId();

  const customCredits = clampCustom(Number(customInput.replace(/[^\d]/g, "")));
  const credits = selection.kind === "pack" ? selection.pack.credits : customCredits;
  const pack = selection.kind === "pack" ? selection.pack : undefined;
  const topUpHref = buildTopUpMailto({ credits, pack, workspaceName, email });

  const { summary, error: summaryError, reload } = useCreditSummary();
  const [requesting, setRequesting] = useState(false);
  const [requestMessage, setRequestMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function requestTopUp() {
    setRequesting(true);
    setRequestMessage(null);
    try {
      await dashboardApi.requestCredits(credits, pack?.id ?? null);
      setRequestMessage({ ok: true, text: `Requested ${formatThousands(credits)} credits. Sales will send an invoice; the credits appear here once it is paid.` });
      await reload();
    } catch (err) {
      setRequestMessage({ ok: false, text: errorText(err, "Couldn't send the request.") });
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div className={pageStyles.page}>
      <PageHeader
        eyebrow="Billing"
        title="Buy credits"
        description={
          <>
            Top up <b>{workspaceName}</b>. Credits are spent when you export verified contacts, reveal direct dials or enrich
            records.
          </>
        }
      />

      <section className={styles.balance} aria-labelledby="balance-title">
        <div>
          <p id="balance-title" className={cx("micro", styles.balanceLabel)}>
            Credit balance
          </p>
          <p className={styles.balanceValue}>
            {summary ? `${formatThousands(summary.balance)} credits` : summaryError ? "Unavailable" : "Loading…"}
          </p>
          <p className={styles.balanceNote}>
            {summaryError
              ? summaryError
              : summary && !summary.enabled
                ? "Credits are not charged in this workspace: contact details are shown in full."
                : summary
                  ? `Revealing or exporting a contact's email and phone costs ${summary.cost_per_contact} credit${summary.cost_per_contact === 1 ? "" : "s"}, once per contact. Contacts you have already paid for stay free.`
                  : "\u00a0"}
          </p>
        </div>
      </section>

      <section aria-labelledby="packs-title">
        <h2 id="packs-title" className={styles.sectionTitle}>
          Choose a pack
        </h2>
        <div className={styles.packs} role="radiogroup" aria-labelledby="packs-title">
          {CREDIT_PACKS.map((item) => {
            const selected = selection.kind === "pack" && selection.pack.id === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={cx(styles.pack, selected && styles.packOn, item.highlight && styles.packHighlight)}
                onClick={() => setSelection({ kind: "pack", pack: item })}
              >
                {item.highlight && <span className={styles.badge}>Most popular</span>}
                <span className={styles.packName}>{item.name}</span>
                <span className={styles.packCredits}>
                  {formatThousands(item.credits)} <small>credits</small>
                </span>
                <span className={styles.packPrice}>{formatUsd(item.priceUsd)}</span>
                <span className={styles.packUnit}>{pricePerCredit(item)} per credit</span>
                <span className={styles.packDescription}>{item.description}</span>
                <span className={styles.radio} aria-hidden="true">
                  {selected && <CheckIcon width={14} height={14} />}
                </span>
              </button>
            );
          })}

          <div className={cx(styles.pack, styles.custom, selection.kind === "custom" && styles.packOn)}>
            <button
              type="button"
              role="radio"
              aria-checked={selection.kind === "custom"}
              className={styles.customSelect}
              onClick={() => setSelection({ kind: "custom" })}
            >
              <span className={styles.packName}>Custom</span>
              <span className={styles.packDescription}>Any amount from {formatThousands(CUSTOM_CREDITS.min)} credits. Sales sends a quote.</span>
              <span className={styles.radio} aria-hidden="true">
                {selection.kind === "custom" && <CheckIcon width={14} height={14} />}
              </span>
            </button>
            <label htmlFor={customId} className={styles.customLabel}>
              Credits
            </label>
            <input
              id={customId}
              className={styles.customInput}
              inputMode="numeric"
              value={customInput}
              onFocus={() => setSelection({ kind: "custom" })}
              onChange={(event) => setCustomInput(event.target.value)}
              onBlur={() => setCustomInput(String(customCredits))}
              aria-describedby={`${customId}-hint`}
            />
            <small id={`${customId}-hint`} className={styles.customHint}>
              In steps of {formatThousands(CUSTOM_CREDITS.step)}, up to {formatThousands(CUSTOM_CREDITS.max)}.
            </small>
          </div>
        </div>
      </section>

      <section className={styles.summary} aria-labelledby="summary-title">
        <div className={styles.summaryText}>
          <h2 id="summary-title" className={styles.sectionTitle}>
            Your top-up
          </h2>
          <p className={styles.summaryLine}>
            <b>{formatThousands(credits)} credits</b>
            {pack ? ` · ${pack.name} · ${formatUsd(pack.priceUsd)} before tax` : " · custom amount, quoted by sales"}
          </p>
          <p className={styles.summaryNote}>
            Requesting a top-up notifies our sales team with your workspace and amount. They reply with an invoice or a payment
            link, and the credits are added to this workspace once it is paid. Prefer email?{" "}
            <a href={topUpHref}>Write to sales instead</a>.
          </p>
          {requestMessage && (
            <p className={cx(styles.summaryNote, !requestMessage.ok && styles.error)} role={requestMessage.ok ? "status" : "alert"}>
              {requestMessage.text}
            </p>
          )}
        </div>
        <Button variant="red" withArrow className={styles.topUp} loading={requesting} onClick={() => void requestTopUp()}>
          Request {formatThousands(credits)} credits
        </Button>
      </section>

      {summary && summary.requests.length > 0 && (
        <section className={pageStyles.card} aria-labelledby="requests-title">
          <h2 id="requests-title" className={pageStyles.cardTitle}>
            Top-up requests
          </h2>
          <ul className={styles.rows}>
            {summary.requests.map((item) => (
              <li key={item.id}>
                <span>
                  {formatThousands(item.credits)} credits{item.pack ? ` · ${item.pack}` : ""}
                  <small>{formatDate(item.created_at)}</small>
                </span>
                <b className={cx(styles.status, styles[`status${item.status}`])}>{item.status.toLowerCase()}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary && summary.history.length > 0 && (
        <section className={pageStyles.card} aria-labelledby="history-title">
          <h2 id="history-title" className={pageStyles.cardTitle}>
            Credit activity
          </h2>
          <ul className={styles.rows}>
            {summary.history.map((entry) => (
              <li key={entry.id}>
                <span>
                  {entryLabel(entry)}
                  <small>{formatDate(entry.created_at)}</small>
                </span>
                <b className={entry.delta < 0 ? styles.debit : styles.credit}>
                  {entry.delta > 0 ? "+" : "−"}
                  {formatThousands(Math.abs(entry.delta))} · balance {formatThousands(entry.balance_after)}
                </b>
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary?.is_operator && <OperatorQueue onDecided={notifyCreditsChanged} />}

      <section className={pageStyles.card} aria-labelledby="uses-title">
        <h2 id="uses-title" className={pageStyles.cardTitle}>
          What a credit buys
        </h2>
        <ul className={styles.uses}>
          {CREDIT_USES.map((use) => (
            <li key={use.action}>
              <span>{use.action}</span>
              <b>{use.cost}</b>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Credit operators: pending top-up requests from every workspace, approved once paid. */
function OperatorQueue({ onDecided }: { onDecided: () => void }) {
  const [pending, setPending] = useState<PendingCreditRequest[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      dashboardApi
        .pendingCreditRequests()
        .then((loaded) => {
          setPending(loaded);
          setError(null);
        })
        .catch((err: unknown) => setError(errorText(err, "Couldn't load pending requests."))),
    [],
  );

  useEffect(() => {
    let active = true;
    dashboardApi
      .pendingCreditRequests()
      .then((loaded) => {
        if (active) setPending(loaded);
      })
      .catch((err: unknown) => {
        if (active) setError(errorText(err, "Couldn't load pending requests."));
      });
    return () => {
      active = false;
    };
  }, []);

  async function decide(id: number, status: "APPROVED" | "DECLINED") {
    setBusyId(id);
    setError(null);
    try {
      await dashboardApi.decideCreditRequest(id, status);
      await load();
      onDecided();
    } catch (err) {
      setError(errorText(err, "Couldn't update the request."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={pageStyles.card} aria-labelledby="queue-title">
      <h2 id="queue-title" className={pageStyles.cardTitle}>
        Pending top-ups · operator
      </h2>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {pending === null ? (
        <p className={styles.muted}>Loading…</p>
      ) : pending.length === 0 ? (
        <p className={styles.muted}>No requests are waiting.</p>
      ) : (
        <ul className={styles.rows}>
          {pending.map((item) => (
            <li key={item.id}>
              <span>
                <b>{item.workspace}</b> · {formatThousands(item.credits)} credits{item.pack ? ` · ${item.pack}` : ""}
                <small>
                  {item.requested_by} · {formatDate(item.created_at)}
                </small>
              </span>
              <span className={styles.actions}>
                <Button variant="ink" loading={busyId === item.id} onClick={() => void decide(item.id, "APPROVED")}>
                  Approve
                </Button>
                <Button variant="line" disabled={busyId === item.id} onClick={() => void decide(item.id, "DECLINED")}>
                  Decline
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
