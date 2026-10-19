"use client";

import { useCallback, useRef } from "react";

/**
 * Collects a list of DOM nodes rendered from an array, for handing to an
 * imperative scene. Usage: `ref={letters.register(index)}`, then read
 * `letters.items.current` inside an effect.
 */
export function useElementList<T extends Element>() {
  const items = useRef<T[]>([]);

  const register = useCallback(
    (index: number) => (element: T | null) => {
      if (element) items.current[index] = element;
    },
    [],
  );

  return { items, register };
}

/**
 * Collects a list of records of named DOM nodes — one record per rendered item,
 * e.g. the card, path and circles that together make up one hero tentacle.
 */
export function useElementRecordList<T extends { [K in keyof T]: Element }>(count: number) {
  const records = useRef<Partial<T>[]>(Array.from({ length: count }, () => ({})));

  const register = useCallback(
    <K extends keyof T>(index: number, key: K) =>
      (element: T[K] | null) => {
        if (element) records.current[index][key] = element;
      },
    [],
  );

  /** Returns the records once every part has been mounted. Call from an effect. */
  const read = useCallback((): T[] => records.current as T[], []);

  return { register, read };
}
