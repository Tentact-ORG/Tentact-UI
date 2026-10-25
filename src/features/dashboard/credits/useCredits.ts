"use client";

import { useCallback, useEffect, useState } from "react";
import { dashboardApi, errorText, type CreditSummary } from "../api/dashboard.api";

/** Fired after anything that changes the balance (a reveal, an export, an approved top-up). */
const CREDITS_CHANGED = "tentact:credits-changed";

export function notifyCreditsChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CREDITS_CHANGED));
}

/** The workspace's live credit summary, reloaded whenever `notifyCreditsChanged` fires. */
export function useCreditSummary() {
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      dashboardApi
        .credits()
        .then((loaded) => {
          setSummary(loaded);
          setError(null);
        })
        .catch((err: unknown) => setError(errorText(err, "Couldn't load the credit balance."))),
    [],
  );

  useEffect(() => {
    let active = true;
    const load = () =>
      dashboardApi
        .credits()
        .then((loaded) => {
          if (!active) return;
          setSummary(loaded);
          setError(null);
        })
        .catch((err: unknown) => {
          if (active) setError(errorText(err, "Couldn't load the credit balance."));
        });
    void load();
    window.addEventListener(CREDITS_CHANGED, load);
    return () => {
      active = false;
      window.removeEventListener(CREDITS_CHANGED, load);
    };
  }, []);

  return { summary, error, reload };
}
