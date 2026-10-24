/** Mailbox providers whose domain says nothing about the company. */
const PERSONAL_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail",
  "googlemail",
  "outlook",
  "hotmail",
  "live",
  "yahoo",
  "icloud",
  "me",
  "proton",
  "protonmail",
  "aol",
]);

/**
 * Display name for a workspace when the account doesn't configure one, taken
 * from the email's domain: `maya@northwind-cloud.io` → `Northwind Cloud`.
 */
export function workspaceNameFromEmail(email: string): string {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const label = domain.split(".")[0] ?? "";
  if (!label || PERSONAL_EMAIL_DOMAINS.has(label)) return "Your workspace";
  return label
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
