"use client";

import { useEffect, useRef } from "react";

/**
 * Calls `onScroll` on every window scroll (passive) and once on mount, so
 * scroll-derived UI is correct when the page opens part-way down.
 */
export function useWindowScroll(onScroll: () => void): void {
  const handlerRef = useRef(onScroll);

  useEffect(() => {
    handlerRef.current = onScroll;
  });

  useEffect(() => {
    const handleScroll = () => handlerRef.current();
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
}
