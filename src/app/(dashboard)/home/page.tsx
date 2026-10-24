import type { Metadata } from "next";
import { firstNameFromEmail } from "@/features/dashboard/dashboard.types";
import { OverviewPage } from "@/features/dashboard/pages/OverviewPage";
import { requireSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Home" };

export default async function Page() {
  const session = await requireSession();
  return <OverviewPage firstName={firstNameFromEmail(session.email)} workspaceName={session.workspaceName} />;
}
