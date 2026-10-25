import { ensureAppInitialized } from "@/server/bootstrap";
import { getCodec, getDb, migrateDatabase, TABLE_NAMES } from "@/server/core/database";
import { createAccessToken, hashPassword } from "@/server/core/security";
import { toOrganization, toUser, UserRole, type Organization, type User } from "@/server/models/entities";
import { relationshipService } from "@/server/services/relationshipDiscovery";
import { schemaDiscoveryService } from "@/server/services/schemaDiscovery";
import { valueDiscoveryService } from "@/server/services/valueDiscovery";

export interface SeedData {
  org1: Organization;
  org2: Organization;
  admin: User;
  member: User;
  org2Member: User;
}

/** Drops and recreates every application table, then reloads empty caches. */
export async function resetDatabase(): Promise<void> {
  await ensureAppInitialized();
  const db = getDb();
  for (const table of [...TABLE_NAMES].reverse()) {
    await db.schema.dropTable(table).ifExists().execute();
  }
  await migrateDatabase();
  await schemaDiscoveryService.loadSchemaCache();
  await relationshipService.loadApprovedRelationships();
  await valueDiscoveryService.loadValueCache();
}

async function createOrg(name: string, slug: string): Promise<Organization> {
  const codec = getCodec();
  const row = await getDb()
    .insertInto("organizations")
    .values({ name, slug, created_at: codec.date(new Date()) })
    .returningAll()
    .executeTakeFirstOrThrow();
  return toOrganization(codec, row);
}

async function createUser(orgId: number, email: string, password: string, fullName: string, role: UserRole): Promise<User> {
  const codec = getCodec();
  const row = await getDb()
    .insertInto("users")
    .values({
      org_id: orgId,
      email,
      hashed_password: await hashPassword(password),
      full_name: fullName,
      role,
      is_active: codec.bool(true),
      created_at: codec.date(new Date()),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return toUser(codec, row);
}

/** Two tenants with admin/member users plus discovered schema metadata (mirrors the Python conftest). */
export async function seedTestData(): Promise<SeedData> {
  await resetDatabase();
  const org1 = await createOrg("Acme Corporation", "acme");
  const org2 = await createOrg("Beta Industries", "beta");
  const admin = await createUser(org1.id, "admin@acme.com", "admin_secure_password_123", "Alice Admin", UserRole.ADMIN);
  const member = await createUser(org1.id, "member@acme.com", "member_secure_password_123", "Bob Member", UserRole.MEMBER);
  const org2Member = await createUser(org2.id, "user@beta.com", "beta_secure_password_123", "Charlie Beta", UserRole.MEMBER);

  await schemaDiscoveryService.discoverClickhouseSchema();
  await relationshipService.discoverCandidateRelationships();
  return { org1, org2, admin, member, org2Member };
}

export async function authHeaders(user: User): Promise<Record<string, string>> {
  const token = await createAccessToken({ sub: String(user.id), org_id: user.org_id, role: user.role });
  return { Authorization: `Bearer ${token}` };
}

// Response bodies are asserted on dynamically in tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonBody = any;

type Handler<P> = (request: Request, context: { params: Promise<P> }) => Promise<Response>;

/** Invokes an App Router handler directly with a synthetic request. */
export async function callRoute<P = Record<string, never>>(
  handler: Handler<P>,
  options: { method?: string; path?: string; body?: unknown; headers?: Record<string, string>; params?: P } = {},
): Promise<{ status: number; body: JsonBody; response: Response }> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const request = new Request(`http://test${options.path ?? "/"}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const response = await handler(request, { params: Promise.resolve((options.params ?? {}) as P) });
  const text = await response.clone().text();
  let body: JsonBody = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON (e.g. CSV download)
  }
  return { status: response.status, body, response };
}
