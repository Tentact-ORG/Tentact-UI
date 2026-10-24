"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import type { DashboardUser, WorkspaceSummary } from "./dashboard.types";
import { DASHBOARD_PAGES } from "./navigation";
import { focusProspectSearch, requestSearchFocus } from "./prospecting/search-focus";
import { useWorkspaceData, WorkspaceDataProvider } from "./WorkspaceDataContext";
import styles from "./DashboardShell.module.css";

/** Below this width the sidebar becomes an off-canvas drawer (keep in sync with the stylesheet). */
const DRAWER_QUERY = "(max-width: 1024px)";

interface DashboardShellProps {
  workspace: WorkspaceSummary;
  user: DashboardUser;
  children: ReactNode;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Announces the result of actions (export, save, apply) to screen readers. */
function StatusAnnouncer() {
  const { status } = useWorkspaceData();
  return (
    <p className="sr-only" role="status" aria-live="polite">
      {status}
    </p>
  );
}

/** Sidebar + topbar frame around every dashboard page, with the drawer behaviour for small screens. */
export function DashboardShell({ workspace, user, children }: DashboardShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isCompact = useMediaQuery(DRAWER_QUERY);
  const sidebarId = useId();
  const router = useRouter();

  // The drawer only exists in the compact layout; widening the window simply makes the sidebar static again.
  const drawerOpen = isCompact && menuOpen;

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const toggleMenu = useCallback(() => setMenuOpen((open) => !open), []);

  /** Focuses the search on this page, or opens Prospect search with the input focused. */
  const goToSearch = useCallback(() => {
    if (focusProspectSearch()) return;
    requestSearchFocus();
    router.push(DASHBOARD_PAGES.search.href);
  }, [router]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  // "/" jumps to the search from anywhere in the dashboard, as the sidebar hint promises.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      event.preventDefault();
      goToSearch();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [goToSearch]);

  return (
    <WorkspaceDataProvider storageKey={user.email}>
      <div className={styles.shell}>
        <Sidebar
          id={sidebarId}
          workspace={workspace}
          open={drawerOpen}
          compact={isCompact}
          onClose={closeMenu}
          onSearch={goToSearch}
        />
        {drawerOpen && <button type="button" className={styles.backdrop} aria-label="Close menu" onClick={closeMenu} />}
        <div className={styles.main}>
          <Topbar workspace={workspace} user={user} menuOpen={drawerOpen} sidebarId={sidebarId} onToggleMenu={toggleMenu} />
          <main className={styles.content}>{children}</main>
        </div>
      </div>
      <StatusAnnouncer />
    </WorkspaceDataProvider>
  );
}
