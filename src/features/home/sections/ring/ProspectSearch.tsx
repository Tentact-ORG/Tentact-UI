"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { SITE } from "@/config/site";
import { cx } from "@/lib/cx";
import { handleDemoLinkClick } from "../../components/DemoBooking/DemoBooking";
import { INITIAL_TYPEWRITER_STATE, nextTypewriterStep, visibleText } from "./typewriter";
import styles from "./ProspectSearch.module.css";

interface Prospect {
  full_name: string;
  job_title: string | null;
  company_name: string | null;
  has_email: boolean;
  has_linkedin: boolean;
  has_phone: boolean;
}

interface Attempts {
  limit: number;
  remaining: number;
  resets_at: string | null;
}

type SearchState =
  | { kind: "idle" }
  | { kind: "loading"; query: string }
  | { kind: "results"; query: string; prospects: Prospect[]; total: number }
  | { kind: "message"; query: string; tone: "info" | "limit" | "error"; text: string };

// Shapes of the hidden details; the real values never reach the browser.
const HIDDEN = { email: "name@company.com", linkedin: "in/first-last", phone: "+1 415 555 0142" };

function resetText(resetsAt: string | null): string {
  if (!resetsAt) return "tomorrow";
  const hours = Math.max(1, Math.ceil((new Date(resetsAt).getTime() - Date.now()) / 3_600_000));
  return hours >= 20 ? "tomorrow" : `in about ${hours} hour${hours === 1 ? "" : "s"}`;
}

function attemptsText(attempts: Attempts | null): string {
  if (!attempts) return "Try it free · no sign-up";
  if (attempts.remaining === 0) return `Free searches used · more ${resetText(attempts.resets_at)}`;
  return `${attempts.remaining} of ${attempts.limit} free searches left today · no sign-up`;
}

/** The example requests typing themselves out, as the placeholder of the empty search bar. */
function useTypedExample(examples: readonly string[], running: boolean): string {
  const [state, setState] = useState(INITIAL_TYPEWRITER_STATE);
  useEffect(() => {
    if (!running) return;
    let timeoutId = 0;
    let current = state;
    const advance = () => {
      const step = nextTypewriterStep(current, examples);
      current = step.state;
      setState(current);
      timeoutId = window.setTimeout(advance, step.delayMs);
    };
    timeoutId = window.setTimeout(advance, 0);
    return () => window.clearTimeout(timeoutId);
    // Resume from where it paused rather than restarting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examples, running]);
  return visibleText(state, examples);
}

const subscribeNever = () => () => {};

/**
 * The landing page's natural-language search for signed-out visitors: 10 real
 * people per search, with emails, LinkedIn profiles and phone numbers hidden
 * until they get access. Each visitor gets a few searches a day, counted on
 * the server by IP address (/api/public-search).
 */
export function ProspectSearch({ examples }: { examples: readonly string[] }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [attempts, setAttempts] = useState<Attempts | null>(null);
  const [search, setSearch] = useState<SearchState>({ kind: "idle" });
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const typed = useTypedExample(examples, !focused && query === "");
  const inputId = useId();

  // The remaining searches come from the server, so a refresh shows the true count.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/public-search", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { attempts?: Attempts } | null) => {
        if (!cancelled && body?.attempts) setAttempts(body.attempts);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const busy = search.kind === "loading";
  const exhausted = attempts?.remaining === 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = query.trim();
    if (busy) return;
    if (text.length < 3) {
      setSearch({ kind: "message", query: text, tone: "info", text: "Describe the people you're looking for, e.g. “CMOs at fintech companies in London”." });
      setOpen(true);
      return;
    }
    setSearch({ kind: "loading", query: text });
    setOpen(true);
    try {
      const response = await fetch("/api/public-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text }),
      });
      const body = (await response.json().catch(() => null)) as {
        status?: "ok" | "clarify";
        prospects?: Prospect[];
        total?: number;
        message?: string;
        detail?: string;
        attempts?: Attempts | null;
      } | null;
      if (body?.attempts) setAttempts(body.attempts);
      if (response.status === 429) {
        setSearch({ kind: "message", query: text, tone: "limit", text: body?.detail ?? "You've used your free searches for today." });
      } else if (!response.ok || !body) {
        setSearch({ kind: "message", query: text, tone: "error", text: body?.detail ?? "We couldn't run that search right now. Please try again." });
      } else if (body.status === "clarify") {
        setSearch({ kind: "message", query: text, tone: "info", text: body.message ?? "Please describe the people you're looking for in more detail." });
      } else {
        setSearch({ kind: "results", query: text, prospects: body.prospects ?? [], total: body.total ?? 0 });
      }
    } catch {
      setSearch({ kind: "message", query: text, tone: "error", text: "We couldn't reach the server. Check your connection and try again." });
    }
  };

  return (
    <div className={styles.search}>
      <form className={styles.bar} onSubmit={submit} role="search">
        <label htmlFor={inputId} className={styles.srOnly}>
          Describe the people you want to find
        </label>
        <input
          id={inputId}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={focused ? "Describe the people you want to find…" : ""}
          maxLength={300}
          autoComplete="off"
          enterKeyHint="search"
        />
        {!focused && query === "" && (
          <span className={styles.typed} aria-hidden="true">
            “{typed}
            <span className={styles.caret} />”
          </span>
        )}
        <button type="submit" disabled={busy} aria-label="Search">
          {busy ? <span className={styles.spinner} aria-hidden="true" /> : <span aria-hidden="true">→</span>}
        </button>
      </form>
      <p className={cx(styles.note, exhausted && styles.noteLimit)} aria-live="polite">
        {attemptsText(attempts)}
        {search.kind !== "idle" && !open && (
          <>
            {" · "}
            <button type="button" className={styles.reopen} onClick={() => setOpen(true)}>
              {busy ? "Searching…" : "View results"}
            </button>
          </>
        )}
      </p>
      {mounted && open && search.kind !== "idle" && createPortal(<ResultsDialog search={search} onClose={() => setOpen(false)} />, document.body)}
    </div>
  );
}

function ResultsDialog({ search, onClose }: { search: Exclude<SearchState, { kind: "idle" }>; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const heading =
    search.kind === "results"
      ? search.prospects.length > 0
        ? `${search.prospects.length} of ${search.total.toLocaleString("en-US")} people`
        : "No matches yet"
      : search.kind === "loading"
        ? "Searching…"
        : search.tone === "limit"
          ? "Free searches used"
          : search.tone === "error"
            ? "Search didn't run"
            : "Tell us a bit more";

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
        <header className={styles.head}>
          <div>
            <p className={styles.eyebrow}>Prospect search</p>
            <h3 id={titleId}>{heading}</h3>
            {search.query && <p className={styles.query}>“{search.query}”</p>}
          </div>
          <button ref={closeRef} type="button" className={styles.close} onClick={onClose} aria-label="Close results">
            ×
          </button>
        </header>

        <div className={styles.body} data-lenis-prevent="">
          {search.kind === "loading" && <LoadingTable />}
          {search.kind === "results" && search.prospects.length > 0 && <ResultsTable prospects={search.prospects} />}
          {search.kind === "results" && search.prospects.length === 0 && (
            <p className={styles.message}>Nobody matched that description. Try something broader, like a role and an industry or country.</p>
          )}
          {search.kind === "message" && <p className={cx(styles.message, search.tone === "error" && styles.messageError)}>{search.text}</p>}
        </div>

        {(search.kind === "results" || (search.kind === "message" && search.tone === "limit")) && (
          <footer className={styles.foot}>
            <p>
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1zm2 0h6V7a3 3 0 0 0-6 0v3z" fill="currentColor" />
              </svg>
              Emails, LinkedIn profiles and phone numbers unlock with an account.
            </p>
            <div className={styles.actions}>
              <a className={styles.primary} href={SITE.demoUrl} target="_blank" rel="noopener noreferrer" onClick={handleDemoLinkClick}>
                Get access →
              </a>
              <a className={styles.secondary} href="/login">
                Sign in
              </a>
            </div>
          </footer>
        )}
      </section>
    </div>
  );
}

const COLUMNS = ["Full name", "Job title", "Company", "Email", "LinkedIn", "Phone"];

function Hidden({ available, sample }: { available: boolean; sample: string }) {
  if (!available) return <span className={styles.none}>—</span>;
  return (
    <span className={styles.hidden} aria-label="Hidden until you get access">
      <span aria-hidden="true">{sample}</span>
    </span>
  );
}

function ResultsTable({ prospects }: { prospects: Prospect[] }) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          {COLUMNS.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {prospects.map((prospect, index) => (
          <tr key={index}>
            <th scope="row">{prospect.full_name}</th>
            <td>{prospect.job_title ?? "—"}</td>
            <td>{prospect.company_name ?? "—"}</td>
            <td>
              <Hidden available={prospect.has_email} sample={HIDDEN.email} />
            </td>
            <td>
              <Hidden available={prospect.has_linkedin} sample={HIDDEN.linkedin} />
            </td>
            <td>
              <Hidden available={prospect.has_phone} sample={HIDDEN.phone} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LoadingTable() {
  return (
    <div aria-busy="true">
      <p className={styles.loadingNote}>Searching 420M+ verified records. A new search can take up to a minute.</p>
      <table className={cx(styles.table, styles.skeleton)} aria-hidden="true">
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 10 }, (_, row) => (
            <tr key={row}>
              {COLUMNS.map((column) => (
                <td key={column}>
                  <span style={{ width: `${55 + ((row * 7 + column.length * 5) % 40)}%` }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
