/**
 * The site's absolute origin, used for canonical URLs, Open Graph tags, the
 * sitemap, robots.txt and structured data.
 *
 * Set `NEXT_PUBLIC_SITE_URL` in production (for example `https://www.example.com`).
 * On Vercel the production URL is used when the variable is missing; elsewhere
 * the fallback is localhost, which is only right for local development.
 */
const LOCAL_SITE_URL = "http://localhost:3000";

let warnedAboutFallback = false;

export function getSiteUrl(): URL {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const candidate = configured || (vercel ? `https://${vercel}` : "");

  if (candidate) {
    try {
      return new URL(candidate);
    } catch {
      // Fall through to the local fallback with a warning.
    }
  }

  if (process.env.NODE_ENV === "production" && !warnedAboutFallback) {
    warnedAboutFallback = true;
    console.warn("[seo] NEXT_PUBLIC_SITE_URL is not set; canonical URLs and the sitemap point at localhost.");
  }
  return new URL(LOCAL_SITE_URL);
}

/** Absolute URL for a site path, e.g. `/terms` → `https://www.example.com/terms`. */
export function absoluteUrl(path: string): string {
  return new URL(path, getSiteUrl()).toString();
}
