import { requireAdmin } from "@/server/api/deps";
import { json, parseBody, route } from "@/server/api/handler";
import { getCodec, getDb } from "@/server/core/database";
import { HttpError } from "@/server/core/errors";
import { hashPassword } from "@/server/core/security";
import { toUser } from "@/server/models/entities";
import { adminCreateUserRequestSchema, toUserResponse } from "@/server/schemas/auth";
import { auditService } from "@/server/services/auditService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Users of the administrator's organization. */
export const GET = route(async (request) => {
  const admin = await requireAdmin(request);
  const codec = getCodec();
  const rows = await getDb().selectFrom("users").selectAll().where("org_id", "=", admin.org_id).orderBy("id", "asc").execute();
  return json(rows.map((row) => toUserResponse(toUser(codec, row))));
});

/** Creates a user inside the administrator's organization. */
export const POST = route(async (request) => {
  const admin = await requireAdmin(request);
  const body = await parseBody(request, adminCreateUserRequestSchema);
  const db = getDb();
  const codec = getCodec();
  const email = body.email.trim().toLowerCase();

  const duplicate = await db.selectFrom("users").select("id").where("email", "=", email).executeTakeFirst();
  if (duplicate) throw new HttpError(400, "Email already registered");

  const row = await db
    .insertInto("users")
    .values({
      org_id: admin.org_id,
      email,
      hashed_password: await hashPassword(body.password),
      full_name: body.full_name.trim(),
      role: body.role,
      is_active: codec.bool(true),
      created_at: codec.date(new Date()),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const user = toUser(codec, row);

  await auditService.logEvent({
    action: "CREATE_USER",
    resource: `user:${user.id}`,
    status: "SUCCESS",
    orgId: admin.org_id,
    userId: admin.id,
    details: { created_email: user.email, role: user.role },
  });
  return json(toUserResponse(user));
});
