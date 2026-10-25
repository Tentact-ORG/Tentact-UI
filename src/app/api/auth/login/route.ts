import { json, parseBody, route } from "@/server/api/handler";
import { authenticate } from "@/server/auth/credentials";
import { HttpError } from "@/server/core/errors";
import { createAccessToken } from "@/server/core/security";
import { toUserResponse, userLoginRequestSchema, type TokenResponse } from "@/server/schemas/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bearer-token sign-in for API clients; the same lockout and rate limit as the sign-in form. */
export const POST = route(async (request) => {
  const body = await parseBody(request, userLoginRequestSchema);
  const result = await authenticate({ email: body.email, password: body.password }, request.headers);

  if (!result.ok) {
    if (result.reason === "locked" || result.reason === "rate_limited") {
      throw new HttpError(429, "Too many sign-in attempts. Try again later.", { "Retry-After": String(result.retryAfterSec) });
    }
    if (result.reason === "inactive") throw new HttpError(403, "Account is disabled");
    throw new HttpError(401, "Incorrect email or password", { "WWW-Authenticate": "Bearer" });
  }

  const { user } = result;
  const token = await createAccessToken({ sub: String(user.id), org_id: user.org_id, role: user.role });
  const response: TokenResponse = { access_token: token, token_type: "bearer", user: toUserResponse(user) };
  return json(response);
});
