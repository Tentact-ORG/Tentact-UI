"use client";

import { useState } from "react";
import { useWindowScroll } from "@/hooks/useWindowScroll";
import { cx } from "@/lib/cx";
import styles from "../TermsPage.module.css";

/** A section counts as "current" once its top passes this line (just below the fixed nav). */
const ACTIVE_LINE_PX = 140;

interface TocEntry {
  id: string;
  title: string;
}

interface TableOfContentsProps {
  entries: readonly TocEntry[];
}

function findCurrentSection(entries: readonly TocEntry[]): string {
  let current = entries[0].id;
  for (const entry of entries) {
    const section = document.getElementById(entry.id);
    if (section && section.getBoundingClientRect().top < ACTIVE_LINE_PX) current = entry.id;
  }
  return current;
}

/** Numbered contents list that highlights the section currently being read. */
export function TableOfContents({ entries }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState(entries[0].id);

  useWindowScroll(() => setActiveId(findCurrentSection(entries)));

  return (
    <nav className={styles.toc} aria-label="Contents">
      <span className="micro">Contents</span>
      <ol>
        {entries.map((entry) => (
          <li key={entry.id}>
            <a href={`#${entry.id}`} className={cx(entry.id === activeId && styles.tocLinkActive)}>
              {entry.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
