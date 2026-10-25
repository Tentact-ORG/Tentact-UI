import { json, parseBody, route } from "@/server/api/handler";
import { HttpError } from "@/server/core/errors";
import { createAccessToken } from "@/server/core/security";
import { bootstrapRequestSchema, toUserResponse, type TokenResponse } from "@/server/schemas/auth";
import { adminBootstrapService, AlreadyBootstrappedError } from "@/server/services/adminBootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One-time creation of the primary organization and first administrator. */
export const POST = route(async (request) => {
  const body = await parseBody(request, bootstrapRequestSchema);
  try {
    const { user } = await adminBootstrapService.bootstrapInitialAdmin({
      adminEmail: body.admin_email,
      adminPassword: body.admin_password,
      adminName: body.admin_name,
      orgName: body.org_name,
      orgSlug: body.org_slug,
    });
    const token = await createAccessToken({ sub: String(user.id), org_id: user.org_id, role: user.role });
    const response: TokenResponse = { access_token: token, token_type: "bearer", user: toUserResponse(user) };
    return json(response);
  } catch (err) {
    if (err instanceof AlreadyBootstrappedError) throw new HttpError(403, err.message);
    throw err;
  }
});
