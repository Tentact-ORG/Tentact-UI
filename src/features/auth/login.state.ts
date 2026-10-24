import type { LoginFieldErrors } from "./login.validation";

/** State handed back to the form by the sign-in action (`useActionState`). */
export interface LoginFormState {
  status: "idle" | "error";
  /** Error that applies to the whole attempt, e.g. wrong credentials. */
  formError?: string;
  fieldErrors: LoginFieldErrors;
  /** Values to restore after React resets the form following a submission. */
  values: {
    email: string;
    remember: boolean;
  };
}

export const INITIAL_LOGIN_STATE: LoginFormState = {
  status: "idle",
  fieldErrors: {},
  values: { email: "", remember: true },
};
