"use server";

import { redirect } from "next/navigation";
import { ROUTES } from "@/config/site";
import { clearSession } from "@/server/auth/session";

/** Ends the session and returns the visitor to the sign-in page. */
export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect(ROUTES.login);
}
