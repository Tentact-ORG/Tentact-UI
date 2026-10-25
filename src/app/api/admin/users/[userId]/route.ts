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

/**
 * Deletes a user of the administrator's organization. Their saved searches,
 * lists, export jobs and top-up requests go with them; credit history,
 * revealed contacts and audit events stay with the workspace (unlinked).
 * Admins can't delete themselves or the workspace's last active admin.
 */
export const DELETE = route<{ userId: string }>(async (request, { params }) => {
  const admin = await requireAdmin(request);
  const userId = intParam(params.userId, "user_id");
  const db = getDb();
  const codec = getCodec();

  const target = await db.selectFrom("users").selectAll().where("id", "=", userId).where("org_id", "=", admin.org_id).executeTakeFirst();
  if (!target) throw new HttpError(404, "User not found");
  if (target.id === admin.id) throw new HttpError(400, "You can't delete your own account");
  const user = toUser(codec, target);
  if (user.role === "ADMIN" && user.is_active) {
    const admins = await db
      .selectFrom("users")
      .select(({ fn }) => fn.countAll<number>().as("n"))
      .where("org_id", "=", admin.org_id)
      .where("role", "=", "ADMIN")
      .where("is_active", "=", codec.bool(true))
      .executeTakeFirstOrThrow();
    if (Number(admins.n) <= 1) throw new HttpError(400, "This is the workspace's last active admin");
  }

  await db.deleteFrom("users").where("id", "=", userId).execute();
  await auditService.logEvent({
    action: "DELETE_USER",
    resource: `user:${userId}`,
    status: "SUCCESS",
    orgId: admin.org_id,
    userId: admin.id,
    details: { deleted_email: user.email, role: user.role },
  });
  return json({ id: userId, deleted: true });
});
