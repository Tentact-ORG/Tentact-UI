# The Tentact — Next.js

The Tentact marketing site (landing page and Terms & Conditions) together with the workspace sign-in
and prospecting dashboard, built with Next.js (App Router, TypeScript). The landing page was ported
section by section from an earlier static HTML version, keeping the same visuals, copy and motion;
the static original is not part of this repository.

## Scripts

| Command                          | What it does                                          |
| -------------------------------- | ----------------------------------------------------- |
| `npm run dev`                    | Start the dev server on http://localhost:3000         |
| `npm run build`                  | Production build                                      |
| `npm start`                      | Serve the production build                            |
| `npm run lint`                   | ESLint (Next core-web-vitals + TypeScript)            |
| `npm run typecheck`              | `tsc --noEmit`                                        |
| `node scripts/hash-password.mjs` | Print a password hash for `TENTACT_AUTH_ACCOUNTS`     |

`dev` and `build` use webpack (`--webpack`) on purpose. Turbopack ignores `adjustFontFallback: false`
in `next/font` and always inserts an Arial fallback face. That changes how glyphs Geist doesn't have
(→ ✓ ✦ ★) render compared with the original design, which falls back to the system UI font.

## Configuration

Copy `.env.example` to `.env.local` and fill it in. Environment changes need a dev-server restart.

| Variable                 | Purpose                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`   | Absolute origin of the deployed site: canonical URLs, Open Graph tags, `sitemap.xml`, `robots.txt`, JSON-LD.   |
| `TENTACT_AUTH_SECRET`    | Signs session cookies. At least 32 random characters (`openssl rand -hex 32`). Rotating it signs everyone out.   |
| `TENTACT_AUTH_ACCOUNTS`  | Accounts allowed to sign in: `email:passwordHash[:Workspace name]` entries separated by `;`. Without a name, one is derived from the email domain. |

## Routes

| Route                                             | Rendering | Purpose                                                                         |
| ------------------------------------------------- | --------- | ------------------------------------------------------------------------------- |
| `/`                                               | static    | Landing page. Its header's "Sign in" opens `/login`.                            |
| `/terms`                                          | static    | Terms & Conditions                                                              |
| `/login`                                          | dynamic   | Sign-in (`noindex`). Sends an already signed-in visitor to `/home`.             |
| `/home`                                           | dynamic   | Dashboard home: stats, search bar and filter panel, saved searches, enrichment. |
| `/home/search`                                    | dynamic   | Prospect search with the full, selectable results table.                        |
| `/home/lists`                                     | dynamic   | Prospect lists, opened from the Lists button in the top bar.                    |
| `/credits`                                        | dynamic   | Buy credits: packs or a custom amount; Top up sends a pre-filled request to sales. |
| `/sitemap.xml`, `/robots.txt`, `/opengraph-image` | static    | Generated from `src/app/sitemap.ts`, `robots.ts` and `opengraph-image.tsx`.     |

Every `/home` route and `/credits` requires a session and otherwise redirects to `/login`; they share the `src/app/(dashboard)` layout. Credit pack sizes and prices in `features/dashboard/credits/credits.data.ts` are placeholders to confirm with sales before launch, and there is no payment backend yet. Search filters live in the
dashboard layout, so they carry over when moving between dashboard pages.

## Structure

```
src/
├── app/                      Routes, root layout (fonts, metadata), global CSS, sitemap/robots/OG image
│   ├── page.tsx              → features/home/HomePage (+ JSON-LD)
│   ├── terms/page.tsx        → features/terms/TermsPage (+ breadcrumb JSON-LD)
│   ├── login/page.tsx        → features/auth/LoginPage
│   └── (dashboard)/          layout.tsx guards the session; home/, home/search, home/lists, credits/
├── config/                   site.ts (brand copy, contact, demo URL, routes), seo.ts (site origin)
├── components/               Shared UI: Button, ButtonLink, TextField, Reveal, FitFrame, BrandMark, seo/JsonLd
├── hooks/                    React hooks (scroll reveal, fit-to-viewport, tilt, media query, localStorage store…)
├── lib/                      Framework-free helpers: math, motion presets, observers, workspace names,
│                             seo/structured-data builders
├── providers/                SmoothScrollProvider (Lenis), MotionGate
├── server/auth/              Server-only: env config, PBKDF2 passwords, credential check, signed sessions
└── features/
    ├── home/                 Landing page sections (see below)
    ├── terms/                Terms page, its content (terms.data.tsx) and small client widgets
    ├── auth/                 Sign-in page, form, Server Actions (login/logout), validation
    └── dashboard/            Shell (sidebar, topbar), shared workspace context, pages/ (one per route),
        └── prospecting/      Prospect model, filter registry, matching, sample repository,
                              search panel, results table, saved searches, lists, CSV export
```

### Anatomy of a landing-page section

Each section lives in `features/home/sections/<name>/`:

- `<name>.data.ts(x)`: the content (cards, copy, coordinates). Edit copy here, not in JSX.
- `<Name>Section.tsx`: the view. Renders markup and collects element refs.
- `<name>.scene.ts`: the animation controller, a plain class used as
  `new Scene(elements)` → `start()` → `dispose()`. It owns render loops, observers and
  listeners, and registers every one of them on a `Disposer` so unmounting cleans up completely.
- `<Name>Section.module.css`: styles scoped to the section. Phone-specific blocks sit at the end of
  each file so they win the cascade over the base rules.

Animations write styles directly to DOM nodes every frame rather than going through React state,
so scrolling and pointer movement never re-render components. User-driven state (menu, legend
filter, sealed price reveal, prompt slider) stays in React. Scenes respect `prefers-reduced-motion`.

The reach map is split between server and client. `reach.model.server.ts` projects the world
atlas and route curves at build time, so the browser receives finished SVG paths and never
downloads d3 or the atlas.

## Sign-in and sessions

- **Credentials** come from `TENTACT_AUTH_ACCOUNTS` and are verified in `src/server/auth/credentials.ts`
  with PBKDF2-HMAC-SHA256 (600k iterations) and constant-time comparison. An unknown email costs the
  same as a wrong password, and the form never says which part failed. This module is the single
  place to swap in a real identity provider or user store.
- **Sessions** are stateless HMAC-SHA256 tokens in an HttpOnly, SameSite=Lax cookie, valid for 12 hours
  or 30 days with "Remember me". The cookie is `Secure` whenever the request arrived over HTTPS (read
  from `x-forwarded-proto`), not merely in production builds: a Secure cookie on plain-HTTP localhost is
  dropped by Safari and would sign you out on the next click. `requireSession()` guards every `/home` page.
- **Not included** (do these at the edge or in the identity provider): rate limiting and lockout,
  password reset (the "Forgot password?" link emails sales), multi-factor authentication.

## Dashboard

The dashboard reads prospects through `ProspectRepository`. The only implementation is the sample
repository, and the page says so ("Sample workspace data"); connecting a workspace's real data means
implementing that interface. Saved searches, lists and enrichment preferences are kept per workspace
in the browser (`localStorage`) through `WorkspaceDataProvider`, in shapes that serialise directly to
a backend. CSV exports are generated client-side and follow the enrichment options.

## Security and source exposure

Everything a browser renders — HTML, CSS and the JavaScript bundles — is necessarily delivered to
the visitor and can be read in devtools. That cannot be prevented, so the site is built so that
there is nothing sensitive to find:

- No credentials, API keys or private endpoints exist client-side. Password hashes, the session
  secret and session verification live in `src/server/auth`, which is marked `server-only`.
- Production bundles are minified and browser source maps are off (`productionBrowserSourceMaps:
  false`), so the original TypeScript is not shipped. The map projection in
  `reach.model.server.ts` is also `server-only` and never reaches the client bundle.
- `next.config.ts` sends security headers with every response: a Content Security Policy that only
  allows same-origin scripts, styles, images and fonts, `frame-ancestors 'none'` and
  `X-Frame-Options: DENY` against clickjacking, `X-Content-Type-Options: nosniff`, a strict referrer
  policy, a restrictive `Permissions-Policy`, HSTS, and `X-Robots-Tag: noindex` for `/home/*`. The
  `X-Powered-By` header is suppressed.
- Headers are applied by `next start` and by hosts that honour `headers()` (such as Vercel). A purely
  static export served by another web server must set them at that server instead.

## SEO, GEO and AEO

- Metadata uses the App Router metadata API: a title template, per-page descriptions, canonical
  URLs, Open Graph and Twitter cards, and a generated 1200×630 sharing image. Sign-in and dashboard
  pages are `noindex, nofollow` (meta tag and `X-Robots-Tag`); `/home` is also blocked in `robots.txt`.
- Structured data (`src/lib/seo/structured-data.ts`) restates what the pages already say:
  `Organization`, `WebSite`, `WebPage` and `SoftwareApplication` (with the published price and
  included features) on the landing page, `WebPage` and `BreadcrumbList` on the terms page. There is
  no `FAQPage` because the site has no FAQ content; add a visible FAQ section before adding that schema.
- `NEXT_PUBLIC_SITE_URL` must be set in production; otherwise canonical URLs and the sitemap point at
  localhost and a warning is logged.

## Notes carried over from the original

- **Hero globe pins stay hidden.** In the original page the intro animation never shows them (the CSS
  `scale: 0` and the animated `transform: scale()` multiply to zero). This port keeps that behaviour.
  See `HeroScene.hideIntroElements` for the one-line change that makes them pop in.
- The Terms page still has a `[city]` placeholder in "Governing law".
