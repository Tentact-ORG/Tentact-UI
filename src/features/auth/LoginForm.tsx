"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { buildSalesMailto } from "@/config/site";
import { loginAction } from "./login.action";
import { INITIAL_LOGIN_STATE } from "./login.state";
import styles from "./LoginPage.module.css";

interface LoginFormProps {
  /** False when the server has no sign-in configuration; the form explains instead of failing silently. */
  authConfigured: boolean;
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <path d="M4 4l16 16" />}
    </svg>
  );
}

export function LoginForm({ authConfigured }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(loginAction, INITIAL_LOGIN_STATE);
  const [showPassword, setShowPassword] = useState(false);

  const forgotPasswordHref = buildSalesMailto("Password reset for The Tentact");

  return (
    <form action={formAction} className={styles.form} noValidate>
      {!authConfigured && (
        <p className={styles.notice} role="status">
          Sign-in isn&apos;t set up for this environment yet.
          {process.env.NODE_ENV !== "production" && (
            <>
              {" "}
              Set <code>TENTACT_AUTH_SECRET</code> and <code>TENTACT_AUTH_ACCOUNTS</code> (see <code>.env.example</code>).
            </>
          )}
        </p>
      )}

      {state.formError && (
        <p className={styles.formError} role="alert">
          {state.formError}
        </p>
      )}

      <TextField
        label="Email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@company.com"
        defaultValue={state.values.email}
        error={state.fieldErrors.email}
        required
        autoFocus
      />

      <TextField
        label="Password"
        name="password"
        type={showPassword ? "text" : "password"}
        autoComplete="current-password"
        placeholder="Your password"
        error={state.fieldErrors.password}
        required
        trailing={
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            <EyeIcon open={showPassword} />
          </button>
        }
      />

      <div className={styles.options}>
        <label className={styles.remember}>
          <input type="checkbox" name="remember" defaultChecked={state.values.remember} />
          Remember me
        </label>
        <a href={forgotPasswordHref} className={styles.forgot}>
          Forgot password?
        </a>
      </div>

      <Button type="submit" variant="ink" block loading={isPending} disabled={!authConfigured} className={styles.submit}>
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
