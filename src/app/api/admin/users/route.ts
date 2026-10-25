import { requireAdmin } from "@/server/api/deps";
import { json, parseBody, route } from "@/server/api/handler";
import { getCodec, getDb } from "@/server/core/database";
import { HttpError } from "@/server/core/errors";
import { hashPassword } from "@/server/core/security";
import { toUser } from "@/server/models/entities";
import { adminCreateUserRequestSchema, DEFAULT_STARTING_CREDITS, toUserResponse } from "@/server/schemas/auth";
import { auditService } from "@/server/services/auditService";
import { creditService } from "@/server/services/creditService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Users of the administrator's organization. */
export const GET = route(async (request) => {
  const admin = await requireAdmin(request);
  const codec = getCodec();
  const rows = await getDb().selectFrom("users").selectAll().where("org_id", "=", admin.org_id).orderBy("id", "asc").execute();
  return json(rows.map((row) => toUserResponse(toUser(codec, row))));
});

/** "Acme Corp" → "acme-corp" (letters, digits and dashes; at most 80 characters). */
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "workspace";
}

/**
 * Creates a user. Workspace admins add people to their own workspace. Credit
 * operators can instead create the user in a new workspace of their own, which
 * starts with `starting_credits` (default 499), recorded as a credit grant.
 */
export const POST = route(async (request) => {
  const admin = await requireAdmin(request);
  const body = await parseBody(request, adminCreateUserRequestSchema);
  const db = getDb();
  const codec = getCodec();
  const email = body.email.trim().toLowerCase();

  const newWorkspace = body.workspace_name !== null;
  if ((newWorkspace || body.starting_credits !== null) && !creditService.isOperator(admin.email)) {
    throw new HttpError(403, "Only credit operators can create workspaces or give credits");
  }
  if (body.starting_credits !== null && !newWorkspace) {
    throw new HttpError(422, "body.starting_credits: only for a new workspace");
  }

  const duplicate = await db.selectFrom("users").select("id").where("email", "=", email).executeTakeFirst();
  if (duplicate) throw new HttpError(400, "Email already registered");

  const { user, workspace } = await db.transaction().execute(async (trx) => {
    let orgId = admin.org_id;
    let workspace: { id: number; name: string; slug: string } | null = null;
    if (newWorkspace) {
      const name = body.workspace_name!;
      const base = slugify(name);
      let slug = base;
      for (let n = 2; await trx.selectFrom("organizations").select("id").where("slug", "=", slug).executeTakeFirst(); n++) slug = `${base}-${n}`;
      const org = await trx.insertInto("organizations").values({ name, slug, created_at: codec.date(new Date()) }).returning(["id", "name", "slug"]).executeTakeFirstOrThrow();
      orgId = org.id;
      workspace = org;
    }
    const row = await trx
      .insertInto("users")
      .values({
        org_id: orgId,
        email,
        hashed_password: await hashPassword(body.password),
        full_name: body.full_name.trim(),
        role: body.role,
        is_active: codec.bool(true),
        created_at: codec.date(new Date()),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { user: toUser(codec, row), workspace };
  });

  // The new workspace's starting balance, as an ordinary (ledgered, audited) grant.
  const credits = workspace ? (body.starting_credits ?? DEFAULT_STARTING_CREDITS) : 0;
  const balance = workspace && credits > 0 ? await creditService.grant(workspace.id, credits, admin.id, `Welcome credits for ${email}`) : null;

  await auditService.logEvent({
    action: "CREATE_USER",
    resource: `user:${user.id}`,
    status: "SUCCESS",
    orgId: user.org_id,
    userId: admin.id,
    details: { created_email: user.email, role: user.role, ...(workspace ? { workspace: workspace.name, starting_credits: credits } : {}) },
  });
  return json({ ...toUserResponse(user), workspace, credits_granted: credits, balance });
});
