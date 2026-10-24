import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROUTES, SITE } from "@/config/site";
import { LoginPage } from "@/features/auth/LoginPage";
import { isAuthConfigured } from "@/server/auth/config";
import { readSession } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Sign in",
  description: `Sign in to your ${SITE.name} workspace.`,
  robots: { index: false, follow: false },
};

export default async function Page() {
  if (await readSession()) redirect(ROUTES.dashboard);
  return <LoginPage authConfigured={isAuthConfigured()} />;
}
