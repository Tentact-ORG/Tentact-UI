import { getCurrentUser } from "@/server/api/deps";
import { intParam, json, parseBody, route } from "@/server/api/handler";
import { getCodec, getDb } from "@/server/core/database";
import { HttpError } from "@/server/core/errors";
import { CreditRequestStatus, decideCreditRequestSchema } from "@/server/schemas/credits";
import { auditService } from "@/server/services/auditService";
import { creditService } from "@/server/services/creditService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Operators: approve (adding the credits) or decline a pending top-up request. */
export const PATCH = route<{ requestId: string }>(async (request, { params }) => {
  const user = await getCurrentUser(request);
  if (!creditService.isOperator(user.email)) throw new HttpError(403, "Only credit operators can decide top-up requests");
  const requestId = intParam(params.requestId, "request_id");
  const body = await parseBody(request, decideCreditRequestSchema);
  const codec = getCodec();

  // Claim the request first so it can only be decided (and credited) once.
  const claimed = await getDb()
    .updateTable("credit_requests")
    .set({ status: body.status, decided_at: codec.date(new Date()), decided_by: user.email })
    .where("id", "=", requestId)
    .where("status", "=", CreditRequestStatus.PENDING)
    .returningAll()
    .executeTakeFirst();
  if (!claimed) throw new HttpError(404, "No pending top-up request with this id");

  let balance: number | null = null;
  if (body.status === CreditRequestStatus.APPROVED) {
    balance = await creditService.grant(claimed.org_id, claimed.credits, user.id, `credit_request:${claimed.id}`);
  }
  await auditService.logEvent({
    action: "DECIDE_CREDIT_REQUEST",
    resource: `credit_request:${claimed.id}`,
    status: body.status,
    orgId: claimed.org_id,
    userId: user.id,
    details: { credits: claimed.credits, decided_by: user.email },
  });
  return json({ id: claimed.id, status: claimed.status, credits: claimed.credits, org_id: claimed.org_id, balance });
});
