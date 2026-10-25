"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { buildSalesMailto, ROUTES, SITE } from "@/config/site";
import { cx } from "@/lib/cx";
import { formatThousands } from "@/lib/math";
import { useCreditSummary } from "../credits/useCredits";
import type { WorkspaceSummary } from "../dashboard.types";
import { DASHBOARD_PAGES } from "../navigation";
import { BookIcon, CloseIcon, HelpIcon, HomeIcon, SearchIcon, SettingsIcon, UsersIcon } from "./icons";
import styles from "../DashboardShell.module.css";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

interface NavItem {
  label: string;
  icon: IconComponent;
  /** Internal page (client-side navigation) or external URL. */
  href?: string;
  external?: boolean;
  count?: number;
  /** Announced but not yet available. */
  soon?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

interface SidebarProps {
  id: string;
  workspace: WorkspaceSummary;
  /** Shows the admin console (users, schema, relationships, audit) for administrators and auditors. */
  canAdmin: boolean;
  open: boolean;
  /** True when the sidebar is rendered as a drawer. */
  compact: boolean;
  onClose: () => void;
  onSearch: () => void;
}

function NavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate: () => void }) {
  const Icon = item.icon;
  const content = (
    <>
      <Icon className={styles.navIcon} />
      <span className={styles.navLabel}>{item.label}</span>
      {item.count !== undefined && <span className={styles.navCount}>{item.count}</span>}
      {item.soon && <em className={styles.navSoon}>Soon</em>}
    </>
  );
  const className = cx(styles.navItem, active && styles.navItemActive, item.soon && styles.navItemSoon);

  if (item.soon || !item.href) {
    return (
      <span className={className} aria-disabled="true">
        {content}
      </span>
    );
  }
  if (item.external) {
    return (
      <a href={item.href} className={className} target="_blank" rel="noopener noreferrer" onClick={onNavigate}>
        {content}
      </a>
    );
  }
  return (
    <Link href={item.href} className={className} aria-current={active ? "page" : undefined} onClick={onNavigate}>
      {content}
    </Link>
  );
}

export function Sidebar({ id, workspace, canAdmin, open, compact, onClose, onSearch }: SidebarProps) {
  const pathname = usePathname();
  const { summary: credits } = useCreditSummary();

  const groups: NavGroup[] = [
    {
      label: "Prospecting",
      items: [
        { label: DASHBOARD_PAGES.overview.title, icon: HomeIcon, href: DASHBOARD_PAGES.overview.href },
        { label: DASHBOARD_PAGES.search.title, icon: SearchIcon, href: DASHBOARD_PAGES.search.href },
      ],
    },
    {
      label: "Workspace",
      items: canAdmin
        ? [{ label: DASHBOARD_PAGES.admin.title, icon: SettingsIcon, href: DASHBOARD_PAGES.admin.href }]
        : [
            { label: "Team", icon: UsersIcon, soon: true },
            { label: "Settings", icon: SettingsIcon, soon: true },
          ],
    },
    {
      label: "Others",
      items: [
        { label: "Talk to sales", icon: HelpIcon, href: buildSalesMailto(`Question from the ${workspace.name} workspace`), external: true },
        { label: "Terms & privacy", icon: BookIcon, href: ROUTES.terms },
      ],
    },
  ];

  const handleSearchShortcut = () => {
    onClose();
    // Let the drawer close before moving focus so the scroll lands on the page, not the drawer.
    if (compact) window.setTimeout(onSearch, 50);
    else onSearch();
  };

  return (
    <aside
      id={id}
      className={cx(styles.sidebar, open && styles.sidebarOpen)}
      aria-label="Workspace navigation"
      inert={compact && !open ? true : undefined}
    >
      <div className={styles.sidebarTop}>
        <Link href={DASHBOARD_PAGES.overview.href} className={styles.workspace} onClick={onClose}>
          <BrandMark size={36} className={styles.workspaceMark} />
          <div className={styles.workspaceText}>
            <b>{workspace.name}</b>
            <small>The Tentact workspace</small>
          </div>
        </Link>
        {compact && (
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close menu">
            <CloseIcon />
          </button>
        )}
      </div>

      <button type="button" className={styles.searchShortcut} onClick={handleSearchShortcut}>
        <SearchIcon />
        <span>Search prospects</span>
        <kbd aria-hidden="true">/</kbd>
      </button>

      <nav className={styles.nav} aria-label="Sections">
        {groups.map((group) => (
          <div key={group.label} className={styles.navGroup}>
            <p className={cx("micro", styles.navGroupLabel)}>{group.label}</p>
            <ul>
              {group.items.map((item) => (
                <li key={item.label}>
                  <NavLink item={item} active={!item.external && item.href === pathname} onNavigate={onClose} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className={styles.promo}>
        {credits?.enabled ? (
          <>
            <p className={styles.promoTitle}>{formatThousands(credits.balance)} credits left</p>
            <p className={styles.promoBody}>Each new contact you reveal or export costs {credits.cost_per_contact}. Contacts you have paid for stay free.</p>
          </>
        ) : (
          <>
            <p className={styles.promoTitle}>Running low on credits?</p>
            <p className={styles.promoBody}>Top up to keep exporting verified emails and direct dials.</p>
          </>
        )}
        <ButtonLink
          variant="ink"
          href={DASHBOARD_PAGES.credits.href}
          className={styles.promoButton}
          aria-current={pathname === DASHBOARD_PAGES.credits.href ? "page" : undefined}
          onClick={onClose}
          withArrow
        >
          Buy credits
        </ButtonLink>
        <a href={SITE.demoUrl} target="_blank" rel="noopener noreferrer" className={styles.promoLink}>
          Or book a call with sales
        </a>
      </div>
    </aside>
  );
}
