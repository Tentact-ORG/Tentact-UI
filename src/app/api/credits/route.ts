import { getCurrentUser } from "@/server/api/deps";
import { json, route } from "@/server/api/handler";
import { getCodec, getDb } from "@/server/core/database";
import { creditService } from "@/server/services/creditService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The workspace's balance, recent credit activity and top-up requests. */
export const GET = route(async (request) => {
  const user = await getCurrentUser(request);
  const codec = getCodec();
  const [balance, history, requests] = await Promise.all([
    creditService.balance(user.org_id),
    creditService.history(user.org_id, 50),
    getDb().selectFrom("credit_requests").selectAll().where("org_id", "=", user.org_id).orderBy("id", "desc").limit(20).execute(),
  ]);
  return json({
    enabled: creditService.enabled,
    cost_per_contact: creditService.costPerContact,
    balance,
    history,
    requests: requests.map((r) => ({
      id: r.id,
      credits: r.credits,
      pack: r.pack,
      status: r.status,
      note: r.note,
      created_at: codec.readDate(r.created_at),
      decided_at: codec.readNullableDate(r.decided_at),
    })),
    is_operator: creditService.isOperator(user.email),
  });
});
