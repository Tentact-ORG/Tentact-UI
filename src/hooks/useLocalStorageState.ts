"use client";

import { useCallback, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";

/**
 * `useState` backed by `localStorage`, exposed to React as an external store.
 *
 * - Server render and hydration use `initialValue`; the stored value applies
 *   right after, and the returned `hydrated` flag flips to true.
 * - Values that fail `isValid` are ignored, so stale or tampered entries can
 *   never break the UI.
 * - Writes go to `localStorage` when available and always to an in-memory
 *   copy, so a private window or a blocked quota still gets a working UI.
 * - Every hook instance reading the same key updates together, in this tab and
 *   (via the `storage` event) in other tabs.
 */

type Listener = () => void;

const listenersByKey = new Map<string, Set<Listener>>();
const memoryStore = new Map<string, string>();
const snapshotCache = new Map<string, { raw: string | null; value: unknown }>();

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memoryStore.get(key) ?? null;
  }
}

function writeRaw(key: string, raw: string): void {
  memoryStore.set(key, raw);
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    // Quota exceeded or storage blocked: the in-memory copy still serves this tab.
  }
}

function notify(key: string): void {
  listenersByKey.get(key)?.forEach((listener) => listener());
}

function subscribeToKey(key: string, listener: Listener): () => void {
  let listeners = listenersByKey.get(key);
  if (!listeners) {
    listeners = new Set();
    listenersByKey.set(key, listeners);
  }
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === key) listener();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const subscribeToNothing = () => () => {};

export function useLocalStorageState<T>(
  key: string,
  initialValue: T,
  isValid: (value: unknown) => value is T,
): [T, Dispatch<SetStateAction<T>>, boolean] {
  // Pin the fallback so an inline `[]` or `{}` argument cannot change identity between renders.
  const [fallback] = useState(() => initialValue);

  const getSnapshot = useCallback((): T => {
    const raw = readRaw(key);
    const cached = snapshotCache.get(key);
    if (cached && cached.raw === raw) return cached.value as T;

    let value = fallback;
    if (raw !== null) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isValid(parsed)) value = parsed;
      } catch {
        // Unreadable entry: keep the fallback.
      }
    }
    snapshotCache.set(key, { raw, value });
    return value;
  }, [key, fallback, isValid]);

  const getServerSnapshot = useCallback(() => fallback, [fallback]);
  const subscribe = useCallback((listener: Listener) => subscribeToKey(key, listener), [key]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      const current = getSnapshot();
      const resolved = typeof next === "function" ? (next as (previous: T) => T)(current) : next;
      writeRaw(key, JSON.stringify(resolved));
      notify(key);
    },
    [key, getSnapshot],
  );

  return [value, setValue, hydrated];
}
