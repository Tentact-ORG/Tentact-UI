import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROUTES } from "@/config/site";
import { AdminConsole } from "@/features/admin/AdminConsole";
import { canOpenAdminConsole } from "@/features/dashboard/dashboard.types";
import { requireSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Admin console" };

/** Schema health, relationship approvals, column policies, users and audit log (administrators and auditors). */
export default async function Page() {
  const session = await requireSession();
  if (!canOpenAdminConsole(session.role)) redirect(ROUTES.dashboard);
  return <AdminConsole role={session.role} />;
}
