# Landing page search

The "Describe the list" section of the landing page has a working natural-language search for
signed-out visitors. A request runs through the same pipeline as the dashboard (the model writes
SQL, a second model reviews it, the validator checks it, and it runs read-only) and returns
**10 real people** from the warehouse.

- **Shown:** full name, job title and company.
- **Hidden:** email, LinkedIn and phone number. The API returns only whether each person has one
  (`has_email`, `has_linkedin`, `has_phone`); the values never leave the server, so the blur in the
  table can't be undone in the browser. Visitors unlock them by getting access (the demo booking)
  or signing in.

Code: `src/features/home/sections/ring/ProspectSearch.tsx` (UI), `src/app/api/public-search/route.ts`
(API), `src/server/services/publicProspectSearch.ts` (search and row shaping) and
`src/server/services/publicSearchLimit.ts` (the limit).

## The limit: 3 searches per IP address per 24 hours

Attempts are counted in **Supabase Postgres**, so refreshing, opening a new tab, clearing cookies or
restarting the server doesn't reset them. The browser only displays what `GET /api/public-search`
reports; nothing is counted client-side.

- **Atomic.** Each search is one `INSERT … ON CONFLICT DO UPDATE … WHERE attempts < limit RETURNING`.
  Postgres locks the visitor's row, so simultaneous requests are serialized and at most 3 succeed.
  `npm run verify-public-search-limit` fires 20 at once against your database to check this.
- **Rolling window.** The window starts with a visitor's first search and lasts
  `PUBLIC_SEARCH_WINDOW_HOURS` (24). After it ends, the next search starts a new one.
- **Fair.** A search that fails on our side (model or warehouse error) or that needs a clearer
  request gives the attempt back. Invalid requests (under 3 characters) are rejected before
  counting.
- **Private.** Only `HMAC-SHA256(secret, address)` is stored, never the address. The secret is
  `PUBLIC_SEARCH_IP_SECRET` (falls back to `JWT_SECRET_KEY`); changing it starts every visitor's
  count afresh. The table has row level security on and no grants for Supabase's `anon` and
  `authenticated` roles, so it isn't reachable through the Supabase API.
- **Expiry.** pg_cron deletes expired rows every 10 minutes. The app also purges them now and then,
  and treats an expired row as a fresh window, so the limit is correct even before cleanup runs.
- **Fails closed.** Without `SUPABASE_DB_URL`, or if Supabase can't be reached, the search answers
  "unavailable" rather than running unlimited.
- **Cost ceiling.** All visitors together get `PUBLIC_SEARCH_HOURLY_CAP` searches per hour per server.

### Which address counts

The visitor's address must come from your proxy, not the client:

- **Behind Vercel, a load balancer or nginx** (appending with `proxy_add_x_forwarded_for`): the
  default `TRUSTED_PROXY_HOPS=1` uses the address the nearest proxy appended to `X-Forwarded-For`.
  Anything the client puts in that header sits further left and is ignored. With two proxies in a
  chain, set it to 2.
- **Behind Cloudflare** (or another edge that sets its own header): set
  `TRUSTED_CLIENT_IP_HEADER=CF-Connecting-IP`; only that header is used.
- **The app must not be reachable directly.** `next start` on an open port passes the client's own
  `X-Forwarded-For` through, so a visitor could claim any address.

IPv6 addresses are grouped by /64 (one subscriber's block), so rotating addresses within it doesn't
buy more searches. Visitors behind one shared address (an office, a mobile carrier's NAT) share
its 3 searches.

## Setup

1. In Supabase: **Project Settings → Database → Connection string → Session pooler**. Put it in
   `.env` as `SUPABASE_DB_URL` (keep it out of chat and git). Optionally download the CA
   certificate on that page and set `SUPABASE_DB_CA_PATH` to verify the server's certificate;
   without it the connection is encrypted but the certificate isn't verified.
2. Set `PUBLIC_SEARCH_IP_SECRET` to a random value: `openssl rand -base64 48`.
3. Apply the migration: `npm run migrate-supabase` (preview with `-- --check`). It records applied
   files in `public.app_migrations`; the files in `supabase/migrations` also work with
   `supabase db push`.
4. Check the limit: `npm run verify-public-search-limit`. It uses a made-up address and deletes its
   row afterwards.
5. Configure the proxy settings above for your hosting.

## Known limits

- A fresh search takes about 30–60 seconds, mostly the model writing SQL; repeating a recent
  request is fast because its approved query is cached.
- The same request can return different people on different runs, and the review step sometimes
  rejects every attempt for a request; the visitor then sees "didn't run" and keeps the attempt.
