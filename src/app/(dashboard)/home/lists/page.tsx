import type { Metadata } from "next";
import { ListsPage } from "@/features/dashboard/pages/ListsPage";
import { requireSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Lists" };

export default async function Page() {
  await requireSession();
  return <ListsPage />;
}
