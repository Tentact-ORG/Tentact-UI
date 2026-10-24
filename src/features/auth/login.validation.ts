/** Validation shared by the sign-in form (client) and its Server Action. */

export interface LoginInput {
  email: string;
  password: string;
}

export type LoginFieldErrors = Partial<Record<keyof LoginInput, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;

export function validateLoginInput({ email, password }: LoginInput): LoginFieldErrors {
  const errors: LoginFieldErrors = {};

  if (email.length === 0) errors.email = "Enter your work email.";
  else if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address.";

  if (password.length === 0) errors.password = "Enter your password.";
  else if (password.length > MAX_PASSWORD_LENGTH) errors.password = "That password is too long.";

  return errors;
}

export function hasFieldErrors(errors: LoginFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
