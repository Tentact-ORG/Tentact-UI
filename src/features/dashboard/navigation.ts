import { ROUTES } from "@/config/site";

/** The dashboard's pages. Home and Prospect search are in the sidebar; Lists opens from the top bar. */
export const DASHBOARD_PAGES = {
  overview: { href: ROUTES.dashboard, title: "Home" },
  search: { href: `${ROUTES.dashboard}/search`, title: "Prospect search" },
  lists: { href: `${ROUTES.dashboard}/lists`, title: "Lists" },
  credits: { href: ROUTES.credits, title: "Credits" },
  admin: { href: `${ROUTES.dashboard}/admin`, title: "Admin console" },
} as const;

export type DashboardPageKey = keyof typeof DASHBOARD_PAGES;

/** Title of the dashboard page at `pathname`, for the breadcrumb. */
export function dashboardPageTitle(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const page = Object.values(DASHBOARD_PAGES).find((candidate) => candidate.href === normalized);
  return page?.title ?? DASHBOARD_PAGES.overview.title;
}
