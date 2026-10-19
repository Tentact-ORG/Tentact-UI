"use client";

import { useState, type MouseEvent } from "react";
import { useWindowScroll } from "@/hooks/useWindowScroll";
import { cx } from "@/lib/cx";
import styles from "../TermsPage.module.css";

/** Scroll distance after which the button appears. */
const SHOW_AFTER_PX = 600;

export function BackToTop() {
  const [isVisible, setVisible] = useState(false);

  useWindowScroll(() => setVisible(window.scrollY > SHOW_AFTER_PX));

  const scrollToTop = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <a
      className={cx(styles.backToTop, isVisible && styles.backToTopVisible)}
      href="#"
      aria-label="Back to top"
      onClick={scrollToTop}
    >
      ↑
    </a>
  );
}
