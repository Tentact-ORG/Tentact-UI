"use client";

import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { SITE } from "@/config/site";
import styles from "./DemoBooking.module.css";

/**
 * The cal.com booking page for a 30-minute demo, embedded in a dialog so
 * visitors book without leaving the site. One `<DemoBooking />` is mounted per
 * page; any "Book a demo" link opens it through `openDemoBooking`, and keeps
 * its plain link to cal.com as the fallback (no JavaScript, or no dialog
 * mounted on the page).
 */

let opener: (() => void) | null = null;

/** Opens the booking dialog; returns false when none is mounted on this page. */
export function openDemoBooking(): boolean {
  if (!opener) return false;
  opener();
  return true;
}

/** onClick for a link to SITE.demoUrl: opens the dialog instead when one is mounted. */
export function handleDemoLinkClick(event: MouseEvent<HTMLAnchorElement>): void {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return; // new tab/window requests
  if (openDemoBooking()) event.preventDefault();
}

const EMBED_URL = `${SITE.demoUrl}?embed=true&layout=month_view&theme=light`;

export function DemoBooking() {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // The iframe loads on first open only, so the landing page doesn't pay for cal.com up front.
  const [requested, setRequested] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    opener = () => {
      setRequested(true);
      ref.current?.showModal();
    };
    return () => {
      opener = null;
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === ref.current) ref.current.close();
      }}
    >
      <div className={styles.head}>
        <div>
          <p id={titleId} className={styles.title}>
            Book a 30-minute demo
          </p>
          <p className={styles.sub}>Pick a time that suits you. We&apos;ll walk through your ideal customer profile live.</p>
        </div>
        <button type="button" className={styles.close} onClick={() => ref.current?.close()} aria-label="Close">
          ×
        </button>
      </div>
      <div className={styles.frameWrap} data-lenis-prevent="">
        {!loaded && <p className={styles.loading}>Loading the calendar…</p>}
        {requested && (
          <iframe
            className={styles.frame}
            src={EMBED_URL}
            title="Book a demo with The Tentact on cal.com"
            onLoad={() => setLoaded(true)}
            allow="payment"
          />
        )}
      </div>
      <p className={styles.fallback}>
        Calendar not loading?{" "}
        <a href={SITE.demoUrl} target="_blank" rel="noopener noreferrer">
          Open it on cal.com →
        </a>
      </p>
    </dialog>
  );
}
