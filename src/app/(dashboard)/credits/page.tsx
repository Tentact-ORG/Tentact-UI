import type { Metadata } from "next";
import { CreditsPage } from "@/features/dashboard/credits/CreditsPage";
import { requireSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Buy credits" };

export default async function Page() {
  const session = await requireSession();
  return <CreditsPage workspaceName={session.workspaceName} email={session.email} />;
}
