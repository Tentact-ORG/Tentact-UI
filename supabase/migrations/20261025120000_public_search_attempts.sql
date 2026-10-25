-- Search attempts by signed-out visitors on the landing page, limited per IP
-- address per rolling window (3 per 24 hours by default).
--
-- Only a keyed hash of the address is stored (HMAC-SHA256 with a server secret),
-- never the address itself. Rows are counted with a single atomic upsert (see
-- src/server/services/publicSearchLimit.ts), and expired rows are deleted every
-- ten minutes by pg_cron; the app also treats an expired row as a fresh window,
-- so the limit stays correct even before a row is purged.

create table if not exists public.public_search_attempts (
  ip_hash text primary key,
  attempts smallint not null check (attempts >= 0),
  window_started_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists public_search_attempts_expires_at_idx
  on public.public_search_attempts (expires_at);

-- Reachable only by the server's database connection: row level security with
-- no policies, and no grants to Supabase's API roles (anon, authenticated).
alter table public.public_search_attempts enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.public_search_attempts from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table public.public_search_attempts from authenticated';
  end if;
end
$$;

-- Cleanup every ten minutes with pg_cron (available on Supabase). Where the extension
-- can't be installed, the migration still succeeds and the app's own
-- occasional cleanup keeps the table small.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'purge-expired-public-search-attempts',
    '*/10 * * * *',
    'delete from public.public_search_attempts where expires_at < now()'
  );
exception
  when others then
    raise notice 'pg_cron is unavailable (%); expired attempts are purged by the app instead.', sqlerrm;
end
$$;
