import type { Updateable } from "kysely";
import { requireAdmin } from "@/server/api/deps";
import { intParam, json, parseBody, route } from "@/server/api/handler";
import { getCodec, getDb, type UsersTable } from "@/server/core/database";
import { HttpError } from "@/server/core/errors";
import { toUser } from "@/server/models/entities";
import { adminUpdateUserRequestSchema, toUserResponse } from "@/server/schemas/auth";
import { auditService } from "@/server/services/auditService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Changes the role or active state of a user in the administrator's organization. */
export const PATCH = route<{ userId: string }>(async (request, { params }) => {
  const admin = await requireAdmin(request);
  const userId = intParam(params.userId, "user_id");
  const body = await parseBody(request, adminUpdateUserRequestSchema);
  const db = getDb();
  const codec = getCodec();

  const existing = await db
    .selectFrom("users")
    .select("id")
    .where("id", "=", userId)
    .where("org_id", "=", admin.org_id)
    .executeTakeFirst();
  if (!existing) throw new HttpError(404, "User not found");

  const changes: Updateable<UsersTable> = {};
  if (body.role !== null) changes.role = body.role;
  if (body.is_active !== null) changes.is_active = codec.bool(body.is_active);
  if (Object.keys(changes).length > 0) {
    await db.updateTable("users").set(changes).where("id", "=", userId).execute();
  }
  const user = toUser(codec, await db.selectFrom("users").selectAll().where("id", "=", userId).executeTakeFirstOrThrow());

  await auditService.logEvent({
    action: "UPDATE_USER",
    resource: `user:${user.id}`,
    status: "SUCCESS",
    orgId: admin.org_id,
    userId: admin.id,
    details: { updated_role: user.role, is_active: user.is_active },
  });
  return json(toUserResponse(user));
});
