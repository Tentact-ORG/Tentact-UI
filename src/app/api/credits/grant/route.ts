import { getCurrentUser } from "@/server/api/deps";
import { json, parseBody, route } from "@/server/api/handler";
import { getDb } from "@/server/core/database";
import { HttpError } from "@/server/core/errors";
import { grantCreditsSchema } from "@/server/schemas/credits";
import { creditService } from "@/server/services/creditService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Operators: add credits to any workspace directly (e.g. a paid invoice without a request). */
export const POST = route(async (request) => {
  const user = await getCurrentUser(request);
  if (!creditService.isOperator(user.email)) throw new HttpError(403, "Only credit operators can grant credits");
  const body = await parseBody(request, grantCreditsSchema);
  const org = await getDb().selectFrom("organizations").select("id").where("id", "=", body.org_id).executeTakeFirst();
  if (!org) throw new HttpError(404, "Workspace not found");
  const balance = await creditService.grant(body.org_id, body.credits, user.id, body.note ? `grant: ${body.note}` : "grant");
  return json({ org_id: body.org_id, credits: body.credits, balance });
});
