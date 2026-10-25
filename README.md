# The Tentact — Next.js

The Tentact marketing site (landing page and Terms & Conditions) together with the workspace sign-in,
the prospecting dashboard and the workspace API behind it, built with Next.js (App Router, TypeScript).
The landing page was ported section by section from an earlier static HTML version, keeping the same
visuals, copy and motion; the static original is not part of this repository.

The dashboard searches a ClickHouse lead warehouse through an AI search pipeline: an LLM SQL generator,
an independent LLM reviewer and a deterministic SQL validator, then read-only execution (see
[docs/architecture.md](docs/architecture.md)). Accounts, saved searches, lists, exports and the audit
log live in an application database (SQLite or PostgreSQL).

## Scripts

| Command                          | What it does                                          |
| -------------------------------- | ----------------------------------------------------- |
| `npm run dev`                    | Start the dev server on http://localhost:3000         |
| `npm run build`                  | Production build                                      |
| `npm start`                      | Serve the production build                            |
| `npm run lint`                   | ESLint (Next core-web-vitals + TypeScript)            |
| `npm run typecheck`              | `tsc --noEmit`                                        |
| `npm test`                       | Unit and API integration tests (Vitest, offline)      |
| `npm run bootstrap-admin`        | Create the first organization and administrator       |
| `npm run verify-azure`           | Check the Azure OpenAI endpoint, key, deployment and quota |
| `npm run seed-clickhouse`        | Load the synthetic dataset into a local ClickHouse    |
| `npm run generate-data`          | Regenerate `database/synthetic_seed_data.json`        |
| `npm run migrate-supabase`       | Apply `supabase/migrations` to `SUPABASE_DB_URL`      |
| `npm run verify-public-search-limit` | Check the landing page search limit holds under concurrency |

`dev` and `build` use webpack (`--webpack`) on purpose. Turbopack ignores `adjustFontFallback: false`
in `next/font` and always inserts an Arial fallback face. That changes how glyphs Geist doesn't have
(→ ✓ ✦ ★) render compared with the original design, which falls back to the system UI font.

## Configuration

Copy `.env.example` to `.env` and fill it in; environment changes need a server restart. The full
reference is [docs/environment_variables.md](docs/environment_variables.md). The essentials:

| Variable                                   | Purpose                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                     | Absolute origin of the deployed site: canonical URLs, Open Graph tags, sitemap, robots, JSON-LD. |
| `TENTACT_AUTH_SECRET`                      | Signs dashboard session cookies (32+ random characters). Rotating it signs everyone out.    |
| `JWT_SECRET_KEY`                           | Signs Bearer tokens for API clients (32+ random characters).                                |
| `DATABASE_URL`                             | Application database: `sqlite:///./leadgen_app.db` or a `postgresql://` URL.                |
| `CLICKHOUSE_*`                             | The lead warehouse connection (`CLICKHOUSE_MODE=mock` runs on the bundled synthetic data).  |
| `LLM_PROVIDER` and `AZURE_OPENAI_*`        | The model behind the SQL agents; see [docs/llm_configuration.md](docs/llm_configuration.md). |
| `LLM_REVIEWER_PROVIDER`, `AZURE_ANTHROPIC_*` | Optional: run the SQL reviewer on Claude (Azure AI Foundry) for an independent check.     |
| `CREDITS_*`                                | Pay-to-reveal contact details and the top-up operators; see [docs/credits.md](docs/credits.md). |
| `SUPABASE_DB_URL`, `PUBLIC_SEARCH_*`, `TRUSTED_*` | The landing page search and its 3-per-IP daily limit; see [docs/public_search.md](docs/public_search.md). |

First run: create the first administrator with `npm run bootstrap-admin`, then sign in at `/login`.
An existing database (including one created by the earlier Python service) is upgraded on the
first start; preview the changes with `npm run migrate-db -- --check` and apply them with
`npm run migrate-db`. SQLite databases are backed up next to the file (`*.db.backup-<time>`) first.
Administrators add further users in the admin console.

## Routes

| Route                                             | Rendering | Purpose                                                                         |
| ------------------------------------------------- | --------- | ------------------------------------------------------------------------------- |
| `/`                                               | static    | Landing page. Its header's "Sign in" opens `/login`; "Describe the list" is a live search for visitors ([docs/public_search.md](docs/public_search.md)). |
| `/terms`                                          | static    | Terms & Conditions                                                              |
| `/login`                                          | dynamic   | Sign-in (`noindex`). Sends an already signed-in visitor to `/home`.             |
| `/home`                                           | dynamic   | Dashboard home: stats, search bar and filter panel, saved searches, enrichment. |
| `/home/search`                                    | dynamic   | Prospect search with the full, selectable results table.                        |
| `/home/lists`                                     | dynamic   | Prospect lists, opened from the Lists button in the top bar.                    |
| `/credits`                                        | dynamic   | Credit balance, activity, top-up requests and (for operators) the approval queue. |
| `/home/admin`                                     | dynamic   | Admin console (administrators and auditors): schema health, join approvals, column policies, users, audit log. |
| `/api/*`                                          | dynamic   | The workspace API (route handlers in `src/app/api`); see [docs/architecture.md](docs/architecture.md). |
| `/credits`                                        | dynamic   | Buy credits: packs or a custom amount; Top up sends a pre-filled request to sales. |
| `/sitemap.xml`, `/robots.txt`, `/opengraph-image` | static    | Generated from `src/app/sitemap.ts`, `robots.ts` and `opengraph-image.tsx`.     |

Every `/home` route and `/credits` requires a session and otherwise redirects to `/login`; they share the `src/app/(dashboard)` layout. Credit pack sizes and prices in `features/dashboard/credits/credits.data.ts` are placeholders to confirm with sales before launch, and there is no payment or credit-metering backend yet. Search filters live in the
dashboard layout, so they carry over when moving between dashboard pages.

## Structure

```
src/
├── app/                      Routes, root layout (fonts, metadata), global CSS, sitemap/robots/OG image
│   ├── page.tsx              → features/home/HomePage (+ JSON-LD)
│   ├── terms/page.tsx        → features/terms/TermsPage (+ breadcrumb JSON-LD)
│   ├── login/page.tsx        → features/auth/LoginPage
│   ├── (dashboard)/          layout.tsx guards the session; home/, home/search, home/lists, home/admin, credits/
│   └── api/                  Workspace API route handlers (auth, search, lists, export, admin, health)
├── config/                   site.ts (brand copy, contact, demo URL, routes), seo.ts (site origin)
├── components/               Shared UI: Button, ButtonLink, TextField, Reveal, FitFrame, BrandMark, seo/JsonLd
├── hooks/                    React hooks (scroll reveal, fit-to-viewport, tilt, media query, localStorage store…)
├── lib/                      Framework-free helpers: math, motion presets, observers, workspace names,
│                             seo/structured-data builders
├── providers/                SmoothScrollProvider (Lenis), MotionGate
├── server/                   Server-only code
│   ├── auth/                 Sign-in against the users table, signed session cookies
│   ├── core/                 Config validation, database (Kysely: SQLite/PostgreSQL) and migrations, Argon2id + JWT
│   ├── models/, schemas/     Entities and row mappers; zod request schemas
│   ├── services/             Schema/value discovery, SQL generator and reviewer agents, LLM providers,
│   │                         SQL analyzer and validator, query executor, exports, audit
│   ├── api/                  Request authentication (cookie or Bearer), roles, route wrapper
│   └── bootstrap.ts          Startup: migrations, ClickHouse discovery, background workers
└── features/
    ├── home/                 Landing page sections (see below)
    ├── terms/                Terms page, its content (terms.data.tsx) and small client widgets
    ├── auth/                 Sign-in page, form, Server Actions (login/logout), validation
    ├── admin/                Admin console and its API client
    └── dashboard/            Shell (sidebar, topbar), shared workspace context, pages/ (one per route),
        ├── api/              Typed client for the workspace API
        └── prospecting/      Prospect model, filter registry, filter → search request and row → prospect
                              mapping, search panel, results table, saved searches, lists, CSV export
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

- **Accounts** live in the application database (`users`, grouped into organizations, the dashboard's
  workspaces). Passwords are Argon2id hashes; `src/server/auth/credentials.ts` verifies them with
  constant-time cost, so an unknown email takes as long as a wrong password, and the form never says
  which part failed. Every attempt is written to the audit log. Deactivated accounts cannot sign in.
- **Sessions** are HMAC-SHA256 tokens in an HttpOnly, SameSite=Lax cookie, valid for 12 hours or 30 days
  with "Remember me". The token names only the user; the user, role and workspace are loaded on every
  request, so deactivating an account or changing a role takes effect immediately. The cookie is
  `Secure` whenever the request arrived over HTTPS (read from `x-forwarded-proto`), not merely in
  production builds: a Secure cookie on plain-HTTP localhost is dropped by Safari.
- **The API** accepts the session cookie (the dashboard) or an `Authorization: Bearer` token from
  `/api/auth/login` (API clients). Cookie-authenticated writes must come from the same origin.
- **Roles**: `MEMBER` searches, saves and exports; `AUDITOR` can also read the admin console;
  `ADMIN` manages users, column policies and table relationships and sees the SQL behind each search.
- **Not included** (do these at the edge or in an identity provider): rate limiting and lockout,
  password reset (the "Forgot password?" link emails sales), multi-factor authentication.

## Dashboard

The search bar and filters describe who to find; pressing Enter (or Done in the filter panel) runs an
AI search over the lead warehouse. Each filter maps to a warehouse column
(`prospecting/prospect.query.ts`) and is sent as an explicit structured filter; free text is applied by
the SQL generator. Filter options are the values discovered in those columns, and filters whose column
holds no data or isn't visible to the user's role are hidden. Results load a hundred at a time.

Saved searches and lists are stored per organization on the server. "Export CSV" generates the full
result set as a server-side export job; exports of a selection or a list are built in the browser.
Both follow the enrichment options (kept per account in the browser) and neutralise spreadsheet
formula injection.

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
