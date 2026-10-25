"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ROUTES, SITE } from "@/config/site";
import { AuthConfigurationError, getAuthConfig } from "@/server/auth/config";
import { authenticate, type SignInResult } from "@/server/auth/credentials";
import { createSession } from "@/server/auth/session";
import { ensureDatabaseReady } from "@/server/bootstrap";
import type { LoginFormState } from "./login.state";
import { hasFieldErrors, validateLoginInput } from "./login.validation";

const INVALID_CREDENTIALS_MESSAGE = "We couldn't sign you in with those details. Check your email and password and try again.";
const LOCKED_MESSAGE = (minutes: number) =>
  `Too many sign-in attempts. For your security, wait ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`;
const UNAVAILABLE_MESSAGE = `Sign-in isn't available right now. Please try again later or write to ${SITE.salesEmail}.`;

function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Server Action behind the sign-in form. On success it redirects to the workspace home. */
export async function loginAction(_previous: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const email = readField(formData, "email").trim();
  const password = readField(formData, "password");
  const remember = formData.get("remember") === "on";
  const values = { email, remember };

  const fieldErrors = validateLoginInput({ email, password });
  if (hasFieldErrors(fieldErrors)) return { status: "error", fieldErrors, values };

  let result: SignInResult;
  try {
    getAuthConfig();
    await ensureDatabaseReady();
    result = await authenticate({ email, password }, await headers());
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      console.error(`[auth] ${error.message}`);
      return { status: "error", formError: UNAVAILABLE_MESSAGE, fieldErrors: {}, values };
    }
    throw error;
  }

  if (!result.ok) {
    const formError =
      result.reason === "locked" || result.reason === "rate_limited"
        ? LOCKED_MESSAGE(Math.max(1, Math.ceil(result.retryAfterSec / 60)))
        : INVALID_CREDENTIALS_MESSAGE;
    return { status: "error", formError, fieldErrors: {}, values };
  }

  await createSession({ userId: result.account.userId, remember });
  redirect(ROUTES.dashboard);
}
