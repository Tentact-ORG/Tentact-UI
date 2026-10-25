import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROUTES, SITE } from "@/config/site";
import { LoginPage } from "@/features/auth/LoginPage";
import { isAuthConfigured } from "@/server/auth/config";
import { ensureDatabaseReady } from "@/server/bootstrap";
import { adminBootstrapService } from "@/server/services/adminBootstrap";
import { readSession } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Sign in",
  description: `Sign in to your ${SITE.name} workspace.`,
  robots: { index: false, follow: false },
};

export default async function Page() {
  if (await readSession()) redirect(ROUTES.dashboard);
  return <LoginPage authConfigured={await isSignInAvailable()} />;
}

/** Sign-in needs a session secret and at least one administrator account (`npm run bootstrap-admin`). */
async function isSignInAvailable(): Promise<boolean> {
  if (!isAuthConfigured()) return false;
  await ensureDatabaseReady();
  return adminBootstrapService.isAdminBootstrapped();
}
