import { json, parseBody, route } from "@/server/api/handler";
import { getCodec, getDb } from "@/server/core/database";
import { HttpError } from "@/server/core/errors";
import { createAccessToken, hashPassword, verifyPassword } from "@/server/core/security";
import { toUser } from "@/server/models/entities";
import { toUserResponse, userLoginRequestSchema, type TokenResponse } from "@/server/schemas/auth";
import { auditService } from "@/server/services/auditService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Verified against when the email is unknown so response timing does not reveal account existence.
let dummyHash: Promise<string> | null = null;

export const POST = route(async (request) => {
  const body = await parseBody(request, userLoginRequestSchema);
  const row = await getDb().selectFrom("users").selectAll().where("email", "=", body.email.trim().toLowerCase()).executeTakeFirst();
  const user = row ? toUser(getCodec(), row) : null;

  dummyHash ??= hashPassword("leadgen-timing-equalizer");
  const passwordOk = await verifyPassword(body.password, user ? user.hashed_password : await dummyHash);

  if (!user || !passwordOk) {
    await auditService.logEvent({
      action: "LOGIN_FAILED",
      resource: `user:${body.email}`,
      status: "UNAUTHORIZED",
      details: { email: body.email },
    });
    throw new HttpError(401, "Incorrect email or password", { "WWW-Authenticate": "Bearer" });
  }
  if (!user.is_active) throw new HttpError(403, "Account is disabled");

  const token = await createAccessToken({ sub: String(user.id), org_id: user.org_id, role: user.role });
  await auditService.logEvent({
    action: "LOGIN_SUCCESS",
    resource: `user:${user.id}`,
    status: "SUCCESS",
    orgId: user.org_id,
    userId: user.id,
  });
  const response: TokenResponse = { access_token: token, token_type: "bearer", user: toUserResponse(user) };
  return json(response);
});
