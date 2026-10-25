import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import pg from "pg";
import { getSettings } from "../core/config";
import { getLogger } from "../core/logger";
import { singleton } from "../core/singleton";

const logger = getLogger("leadgen.public_search");

/**
 * The per-IP limit on landing page searches (3 per 24 hours by default), kept
 * in Supabase Postgres so refreshes, new tabs, cleared cookies and server
 * restarts don't reset it. Only a keyed hash of the address is stored.
 *
 * Counting is one atomic upsert: Postgres locks the visitor's row, so
 * concurrent requests from the same address are serialized and at most
 * `limit` of them are allowed per window. Table: supabase/migrations.
 */

/** What the limiter needs from a Postgres client (pg.Pool and PGlite both fit). */
export interface SqlClient {
  query<R>(text: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

export interface AttemptStatus {
  limit: number;
  /** Attempts used in the current window (0 when there is none). */
  used: number;
  remaining: number;
  /** When the current window ends and attempts are available again; null when no window is open. */
  resetsAt: Date | null;
}

export interface AttemptDecision extends AttemptStatus {
  allowed: boolean;
}

const CONSUME_SQL = `
insert into public.public_search_attempts as a (ip_hash, attempts, window_started_at, expires_at)
values ($1, 1, now(), now() + make_interval(secs => $3))
on conflict (ip_hash) do update set
  attempts = case when a.expires_at <= now() then 1 else a.attempts + 1 end,
  window_started_at = case when a.expires_at <= now() then now() else a.window_started_at end,
  expires_at = case when a.expires_at <= now() then now() + make_interval(secs => $3) else a.expires_at end
where a.expires_at <= now() or a.attempts < $2
returning attempts, expires_at`;

const STATUS_SQL = `
select attempts, expires_at from public.public_search_attempts
where ip_hash = $1 and expires_at > now()`;

// Gives back an attempt that didn't produce a search (the provider failed), within the same window only.
const REFUND_SQL = `
update public.public_search_attempts set attempts = attempts - 1
where ip_hash = $1 and attempts > 0 and expires_at > now()`;

const PURGE_SQL = `delete from public.public_search_attempts where expires_at < now()`;

interface AttemptRow {
  attempts: number;
  expires_at: Date | string;
}

export class PublicSearchLimiter {
  constructor(
    private readonly db: SqlClient,
    readonly limit: number,
    private readonly windowSeconds: number,
    private readonly secret: string,
  ) {}

  /** HMAC-SHA256 of the address: stable per visitor, useless without the server secret. */
  keyFor(address: string): string {
    return createHmac("sha256", this.secret).update(`public-search:${address}`).digest("hex");
  }

  /** Counts an attempt for `address` if it has one left in its window. */
  async consume(address: string): Promise<AttemptDecision> {
    const key = this.keyFor(address);
    const { rows } = await this.db.query<AttemptRow>(CONSUME_SQL, [key, this.limit, this.windowSeconds]);
    // Expired rows are also purged by pg_cron; this keeps the table small where it isn't available.
    if (Math.random() < 0.02) void this.db.query(PURGE_SQL).catch(() => undefined);
    if (rows.length > 0) return { allowed: true, ...this.statusOf(rows[0]) };
    return { allowed: false, ...(await this.status(address, key)) };
  }

  /** The visitor's current window, without counting an attempt. */
  async status(address: string, key = this.keyFor(address)): Promise<AttemptStatus> {
    const { rows } = await this.db.query<AttemptRow>(STATUS_SQL, [key]);
    return rows.length > 0 ? this.statusOf(rows[0]) : { limit: this.limit, used: 0, remaining: this.limit, resetsAt: null };
  }

  async refund(address: string): Promise<void> {
    await this.db.query(REFUND_SQL, [this.keyFor(address)]);
  }

  private statusOf(row: AttemptRow): AttemptStatus {
    const used = Number(row.attempts);
    return { limit: this.limit, used, remaining: Math.max(0, this.limit - used), resetsAt: new Date(row.expires_at) };
  }
}

/** Raised when the landing page search has no database to count attempts in. */
export class PublicSearchUnavailableError extends Error {}

/** A small pool for the Supabase database (TLS, verified when SUPABASE_DB_CA_PATH is set). */
export function createSupabasePool(url: string): pg.Pool {
  const settings = getSettings();
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
  const ca = settings.SUPABASE_DB_CA_PATH ? readFileSync(settings.SUPABASE_DB_CA_PATH, "utf8") : null;
  const pool = new pg.Pool({
    connectionString: url.replace(/[?&]sslmode=[^&]*/, ""),
    // Supabase requires TLS; with its CA certificate the server is also verified.
    ssl: local ? false : ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
    max: Math.max(1, Math.min(4, settings.DATABASE_POOL_MAX)),
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  pool.on("error", (err) => logger.warn(`Supabase connection error: ${err.message}`));
  return pool;
}

let override: PublicSearchLimiter | null | undefined;

/** The configured limiter; throws PublicSearchUnavailableError when SUPABASE_DB_URL is unset (fail closed). */
export function publicSearchLimiter(): PublicSearchLimiter {
  if (override) return override;
  const settings = getSettings();
  const url = settings.SUPABASE_DB_URL;
  if (!url || override === null) throw new PublicSearchUnavailableError("SUPABASE_DB_URL is not configured");
  return singleton(
    "publicSearchLimiter",
    () =>
      new PublicSearchLimiter(
        createSupabasePool(url),
        Math.max(1, settings.PUBLIC_SEARCH_LIMIT),
        Math.max(1, settings.PUBLIC_SEARCH_WINDOW_HOURS) * 3600,
        settings.PUBLIC_SEARCH_IP_SECRET ?? settings.JWT_SECRET_KEY,
      ),
  );
}

/** Tests: use `limiter` (or none, with null) instead of the configured database. */
export function setPublicSearchLimiterForTests(limiter: PublicSearchLimiter | null | undefined): void {
  override = limiter;
}

/**
 * The visitor's address as seen by the nearest trusted proxy. When
 * TRUSTED_CLIENT_IP_HEADER names a header the edge proxy sets itself (such as
 * Cloudflare's CF-Connecting-IP), only that header is used. Otherwise each proxy
 * appends the address it received from to X-Forwarded-For, so with `hops`
 * trusted proxies the entry `hops` from the end is the one a client can't
 * forge (the left-most entries are whatever the client sent). IPv6 addresses
 * are grouped by /64, the block one subscriber typically gets, so rotating
 * addresses within it doesn't buy more attempts. The app must not be reachable
 * except through those proxies, or the header is the client's to choose.
 */
export function trustedClientAddress(
  headers: Headers,
  hops = getSettings().TRUSTED_PROXY_HOPS,
  trustedHeader = getSettings().TRUSTED_CLIENT_IP_HEADER,
): string | null {
  if (trustedHeader) {
    const value = headers.get(trustedHeader)?.split(",")[0]?.trim();
    return value ? normalizeAddress(value) : null;
  }
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const candidate = chain.length > 0 ? chain[Math.max(0, chain.length - Math.max(1, hops))] : headers.get("x-real-ip")?.trim();
  return candidate ? normalizeAddress(candidate) : null;
}

export function normalizeAddress(raw: string): string | null {
  let address = raw.replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  // "1.2.3.4:5678" from some proxies
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(address)) address = address.replace(/:\d+$/, "");
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) address = mapped[1];
  const version = isIP(address);
  if (version === 4) return address;
  if (version !== 6) return null;
  return `${expandIPv6(address).slice(0, 4).join(":")}::/64`;
}

function expandIPv6(address: string): string[] {
  const [head, tail = ""] = address.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = address.includes("::") && tail ? tail.split(":") : [];
  const missing = address.includes("::") ? 8 - left.length - right.length : 0;
  return [...left, ...Array<string>(missing).fill("0"), ...right].map((group) => group.replace(/^0+(?=.)/, ""));
}
