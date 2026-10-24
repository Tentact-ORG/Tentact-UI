"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { logoutAction } from "@/features/auth/logout.action";
import { initialsFromEmail, type DashboardUser, type WorkspaceSummary } from "../dashboard.types";
import { cx } from "@/lib/cx";
import { DASHBOARD_PAGES, dashboardPageTitle } from "../navigation";
import { useWorkspaceData } from "../WorkspaceDataContext";
import { ChevronRightIcon, CloseIcon, HomeIcon, ListIcon, LogoutIcon, MenuIcon } from "./icons";
import styles from "../DashboardShell.module.css";

interface TopbarProps {
  workspace: WorkspaceSummary;
  user: DashboardUser;
  menuOpen: boolean;
  sidebarId: string;
  onToggleMenu: () => void;
}

export function Topbar({ workspace, user, menuOpen, sidebarId, onToggleMenu }: TopbarProps) {
  const pathname = usePathname();
  const { lists } = useWorkspaceData();
  const onLists = pathname === DASHBOARD_PAGES.lists.href;

  return (
    <header className={styles.topbar}>
      <div className={styles.topbarLeft}>
        <button
          type="button"
          className={styles.menuButton}
          onClick={onToggleMenu}
          aria-expanded={menuOpen}
          aria-controls={sidebarId}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
        >
          {menuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>

        <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
          <ol>
            <li>
              <Link href={DASHBOARD_PAGES.overview.href} className={styles.crumbHome} aria-label="Home">
                <HomeIcon />
              </Link>
            </li>
            <li className={styles.crumbSeparator} aria-hidden="true">
              <ChevronRightIcon />
            </li>
            <li className={styles.crumbWorkspace}>{workspace.name}</li>
            <li className={styles.crumbSeparator} aria-hidden="true">
              <ChevronRightIcon />
            </li>
            <li>
              <span className={styles.crumbCurrent} aria-current="page">
                {dashboardPageTitle(pathname)}
              </span>
            </li>
          </ol>
        </nav>
      </div>

      <div className={styles.topbarRight}>
        <Link
          href={DASHBOARD_PAGES.lists.href}
          className={cx(styles.listsButton, onLists && styles.listsButtonOn)}
          aria-current={onLists ? "page" : undefined}
        >
          <ListIcon />
          <span>Lists</span>
          <b className={styles.listsCount} aria-label={`${lists.length} lists`}>
            {lists.length}
          </b>
        </Link>
        <div className={styles.user} title={user.email}>
          <span className={styles.avatar} aria-hidden="true">
            {initialsFromEmail(user.email)}
          </span>
          <span className={styles.userEmail}>{user.email}</span>
        </div>
        <form action={logoutAction}>
          <Button type="submit" variant="line" className={styles.signOut}>
            <LogoutIcon />
            <span>Sign out</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
