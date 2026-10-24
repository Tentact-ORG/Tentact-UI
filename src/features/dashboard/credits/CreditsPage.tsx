"use client";

import { useId, useState } from "react";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { cx } from "@/lib/cx";
import { formatThousands } from "@/lib/math";
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

/** /credits: choose a pack or a custom amount and request the top-up. */
export function CreditsPage({ workspaceName, email }: CreditsPageProps) {
  const defaultPack = CREDIT_PACKS.find((pack) => pack.highlight) ?? CREDIT_PACKS[0];
  const [selection, setSelection] = useState<Selection>({ kind: "pack", pack: defaultPack });
  const [customInput, setCustomInput] = useState(String(10_000));
  const customId = useId();

  const customCredits = clampCustom(Number(customInput.replace(/[^\d]/g, "")));
  const credits = selection.kind === "pack" ? selection.pack.credits : customCredits;
  const pack = selection.kind === "pack" ? selection.pack : undefined;
  const topUpHref = buildTopUpMailto({ credits, pack, workspaceName, email });

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
          <p className={styles.balanceValue}>Not connected yet</p>
          <p className={styles.balanceNote}>
            Your live balance appears here once billing is connected to this workspace. Until then, our team confirms every
            top-up by email.
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
            Top up opens a pre-filled email to our sales team with your workspace and amount. They reply with an invoice or a
            payment link, and the credits are added once it is paid.
          </p>
        </div>
        <ButtonLink variant="red" href={topUpHref} withArrow className={styles.topUp}>
          Top up {formatThousands(credits)} credits
        </ButtonLink>
      </section>

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
