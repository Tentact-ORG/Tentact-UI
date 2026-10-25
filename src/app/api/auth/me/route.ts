import { getCurrentUser } from "@/server/api/deps";
import { json, route } from "@/server/api/handler";
import { getDb } from "@/server/core/database";
import { toUserResponse } from "@/server/schemas/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  const user = await getCurrentUser(request);
  const org = await getDb().selectFrom("organizations").select(["id", "name", "slug"]).where("id", "=", user.org_id).executeTakeFirst();
  return json({
    user: toUserResponse(user),
    organization: {
      id: org?.id ?? user.org_id,
      name: org?.name ?? "Primary Organization",
      slug: org?.slug ?? "primary",
    },
  });
});
