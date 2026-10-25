"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { SITE } from "@/config/site";
import { cx } from "@/lib/cx";
import { handleDemoLinkClick } from "../DemoBooking/DemoBooking";
import styles from "./ChatAssistant.module.css";

const BOT_NAME = SITE.assistantName;

interface Message {
  role: "user" | "assistant";
  content: string;
  /** Show the demo booking button under this answer. */
  demo?: boolean;
}

const GREETING: Message = {
  role: "assistant",
  content: `Hi! I'm ${BOT_NAME}, ${SITE.name}'s assistant. Ask me about our data, how search works, pricing, or book a quick demo.`,
};

const STARTERS = ["What data do you have?", "How does the search work?", "How much does it cost?"];

/** Messages sent to the server: the last few turns are enough context. */
const HISTORY = 10;
const GREETING_DELAY_MS = 6000;

/**
 * The landing page's chat assistant, Mivy: a launcher button in the
 * bottom-right corner that opens a small chat. Answers come from
 * /api/assistant (facts about The Tentact only); buying questions get a
 * button that opens the demo booking.
 */
const subscribeNever = () => () => {};

export function ChatAssistant() {
  // Rendered into <body> after hydration so no page section's stacking context can cover it.
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  return mounted ? createPortal(<ChatAssistantWidget />, document.body) : null;
}

function ChatAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [bubble, setBubble] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelId = useId();

  // A one-time nudge a few seconds after arrival.
  useEffect(() => {
    const timer = window.setTimeout(() => setBubble(true), GREETING_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const send = async (text: string) => {
    const content = text.trim().slice(0, 600);
    if (!content || busy) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.filter((m) => m !== GREETING).slice(-HISTORY).map(({ role, content: c }) => ({ role, content: c })) }),
      });
      const body = (await response.json().catch(() => null)) as { reply?: string; suggest_demo?: boolean; detail?: string } | null;
      if (!response.ok || !body?.reply) {
        setMessages((current) => [...current, { role: "assistant", content: body?.detail ?? "Sorry, I can't answer right now. You can book a demo with our team instead.", demo: true }]);
      } else {
        setMessages((current) => [...current, { role: "assistant", content: body.reply!, demo: body.suggest_demo === true }]);
      }
    } catch {
      setMessages((current) => [...current, { role: "assistant", content: "I couldn't reach the server. Check your connection, or book a demo below.", demo: true }]);
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(draft);
  };

  const userHasAsked = messages.some((m) => m.role === "user");

  return (
    <div className={styles.root}>
      <section id={panelId} className={cx(styles.panel, open && styles.panelOpen)} aria-label={`Chat with ${BOT_NAME}`} aria-hidden={!open} inert={!open}>
        <header className={styles.head}>
          <div className={styles.avatar}>
            <span>{BOT_NAME.charAt(0)}</span>
          </div>
          <div className={styles.headText}>
            <p className={styles.name}>{BOT_NAME}</p>
            <p className={styles.status}>
              <i aria-hidden="true" /> {busy ? `${BOT_NAME} is typing…` : `${SITE.name}'s assistant · online`}
            </p>
          </div>
          <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label={`Close the chat with ${BOT_NAME}`}>
            ×
          </button>
        </header>

        <div ref={listRef} className={styles.list} data-lenis-prevent="" aria-live="polite">
          {messages.map((message, index) => (
            <div key={index} className={cx(styles.message, message.role === "user" ? styles.fromUser : styles.fromBot)}>
              <p>{message.content}</p>
              {message.demo && (
                <a className={styles.demoButton} href={SITE.demoUrl} target="_blank" rel="noopener noreferrer" onClick={handleDemoLinkClick}>
                  Book a 30-min demo →
                </a>
              )}
            </div>
          ))}
          {busy && (
            <div className={cx(styles.message, styles.fromBot, styles.typing)} aria-label={`${BOT_NAME} is typing`}>
              <span />
              <span />
              <span />
            </div>
          )}
          {!userHasAsked && (
            <div className={styles.starters}>
              {STARTERS.map((starter) => (
                <button key={starter} type="button" onClick={() => void send(starter)}>
                  {starter}
                </button>
              ))}
              <a href={SITE.demoUrl} target="_blank" rel="noopener noreferrer" onClick={handleDemoLinkClick}>
                Book a demo
              </a>
            </div>
          )}
        </div>

        <form className={styles.composer} onSubmit={submit}>
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Ask ${BOT_NAME} about ${SITE.name}…`}
            aria-label="Your message"
            maxLength={600}
            autoComplete="off"
          />
          <button type="submit" disabled={busy || !draft.trim()} aria-label="Send">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M4 12l16-8-6 16-2.5-6.5L4 12z" fill="currentColor" />
            </svg>
          </button>
        </form>
      </section>

      {bubble && !open && (
        <div className={styles.bubble}>
          <button type="button" className={styles.bubbleText} onClick={() => setOpen(true)}>
            Hi, I&apos;m {BOT_NAME}! Looking for buyers? Ask me anything.
          </button>
          <button type="button" className={styles.bubbleClose} onClick={() => setBubble(false)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <button
        type="button"
        className={styles.launcher}
        onClick={() => {
          setOpen((value) => !value);
          setBubble(false);
        }}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? `Close the chat with ${BOT_NAME}` : `Chat with ${BOT_NAME}, ${SITE.name}'s assistant`}
      >
        <span className={styles.badge}>
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 0 1 4 13.5v-8Z" fill="currentColor" />
          </svg>
        </span>
      </button>
    </div>
  );
}
