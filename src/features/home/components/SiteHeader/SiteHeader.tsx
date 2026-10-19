"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { SITE } from "@/config/site";
import { cx } from "@/lib/cx";
import { MENU_LINKS } from "../../data/navigation";
import styles from "./SiteHeader.module.css";

function MenuIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 8h16M4 16h16" />
    </svg>
  );
}

/** Closes the menu when the user clicks anywhere outside the panel and its toggle. */
function useCloseOnOutsideClick(
  isOpen: boolean,
  close: () => void,
  insideRefs: ReadonlyArray<RefObject<HTMLElement | null>>,
) {
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInside = insideRefs.some((ref) => ref.current?.contains(target));
      if (!clickedInside) close();
    };

    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [isOpen, close, insideRefs]);
}

export function SiteHeader() {
  const [isMenuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const insideRefs = useMemo(() => [toggleRef, panelRef], []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const toggleMenu = useCallback(() => setMenuOpen((open) => !open), []);

  useCloseOnOutsideClick(isMenuOpen, closeMenu, insideRefs);

  return (
    <>
      <header className={styles.nav}>
        <div className={styles.brand}>
          <a href="#top" className={styles.logo}>
            <BrandMark size={36} className={styles.mark} />
            <span>
              The <em>Tentact</em>
            </span>
          </a>
          <button
            ref={toggleRef}
            type="button"
            className={styles.menuButton}
            aria-label="Open menu"
            aria-expanded={isMenuOpen}
            aria-controls="menuPanel"
            onClick={toggleMenu}
          >
            <MenuIcon />
          </button>
        </div>
        <div className={styles.actions}>
          <a className={styles.signIn} href="#">
            Sign in
          </a>
          <ButtonLink variant="red" href={SITE.demoUrl} target="_blank" rel="noopener" withArrow>
            Book a demo
          </ButtonLink>
        </div>
      </header>

      <nav ref={panelRef} id="menuPanel" className={cx(styles.panel, isMenuOpen && styles.panelOpen)}>
        {MENU_LINKS.map((link, index) => (
          <a key={link.href} href={link.href} onClick={closeMenu}>
            {link.label} <span>{String(index + 1).padStart(2, "0")}</span>
          </a>
        ))}
      </nav>
    </>
  );
}
