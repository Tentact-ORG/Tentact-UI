import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DashboardShell } from "@/features/dashboard/DashboardShell";
import { requireSession } from "@/server/auth/session";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * The signed-in area (`/home/*` and `/credits`) requires a session. The layout
 * stays mounted while moving between these pages, so filters and selections
 * carry over; each page also checks the session itself because layouts don't
 * re-render on client-side navigation.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();

  return (
    <DashboardShell workspace={{ name: session.workspaceName }} user={{ email: session.email, role: session.role }}>
      {children}
    </DashboardShell>
  );
}
