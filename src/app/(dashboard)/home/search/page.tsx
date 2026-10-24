import type { Metadata } from "next";
import { SearchPage } from "@/features/dashboard/pages/SearchPage";
import { requireSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Prospect search" };

export default async function Page() {
  await requireSession();
  return <SearchPage />;
}
