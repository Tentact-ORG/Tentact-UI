import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";

/**
 * Content Security Policy.
 *
 * Both pages are static, so the policy only has to allow Next's own output:
 * same-origin scripts, styles, optimised images and the self-hosted fonts from
 * `next/font`. `'unsafe-inline'` is required for scripts by Next's hydration
 * payload and the pre-animation guard in the root layout, and for styles by
 * React's inline `style` attributes; a nonce-based policy would force every page
 * to render dynamically. Development additionally needs `eval` (webpack), a
 * websocket (hot reload) and data: fonts (the error overlay). Allow a host under
 * `frame-src` if an external widget (for example the cal.com embed) is ever
 * placed inline.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  `font-src 'self'${isDevelopment ? " data:" : ""}`,
  `connect-src 'self'${isDevelopment ? " ws: wss:" : ""}`,
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * Sent with every response. HSTS deliberately omits `includeSubDomains` and
 * `preload`: add them once every subdomain of the production host serves HTTPS.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Ship minified bundles only; source maps would hand the original TypeScript to anyone who opens devtools.
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // Private pages; belt and braces alongside their `noindex` meta tag (and robots.txt for /home).
      { source: "/home/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/login", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/credits", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
