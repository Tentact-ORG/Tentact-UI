import { getCurrentUser } from "@/server/api/deps";
import { json, parseBody, route } from "@/server/api/handler";
import { getCodec, getDb } from "@/server/core/database";
import { HttpError } from "@/server/core/errors";
import { createCreditRequestSchema, CreditRequestStatus } from "@/server/schemas/credits";
import { auditService } from "@/server/services/auditService";
import { creditService } from "@/server/services/creditService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PENDING_PER_WORKSPACE = 5;

/** Requests a credit top-up for the caller's workspace; an operator approves it once paid. */
export const POST = route(async (request) => {
  const user = await getCurrentUser(request);
  const body = await parseBody(request, createCreditRequestSchema);
  const db = getDb();
  const codec = getCodec();

  const pending = await db
    .selectFrom("credit_requests")
    .select(({ fn }) => fn.countAll<number>().as("n"))
    .where("org_id", "=", user.org_id)
    .where("status", "=", CreditRequestStatus.PENDING)
    .executeTakeFirstOrThrow();
  if (Number(pending.n) >= MAX_PENDING_PER_WORKSPACE) {
    throw new HttpError(429, "This workspace already has several top-up requests waiting. Sales will be in touch.");
  }

  const row = await db
    .insertInto("credit_requests")
    .values({
      org_id: user.org_id,
      user_id: user.id,
      credits: body.credits,
      pack: body.pack,
      status: CreditRequestStatus.PENDING,
      note: body.note,
      created_at: codec.date(new Date()),
      decided_at: null,
      decided_by: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  await auditService.logEvent({
    action: "REQUEST_CREDITS",
    resource: `credit_request:${row.id}`,
    status: CreditRequestStatus.PENDING,
    orgId: user.org_id,
    userId: user.id,
    details: { credits: body.credits, pack: body.pack },
  });
  return json({ id: row.id, credits: row.credits, pack: row.pack, status: row.status, created_at: codec.readDate(row.created_at) });
});

/** Operators: pending top-up requests from every workspace. */
export const GET = route(async (request) => {
  const user = await getCurrentUser(request);
  if (!creditService.isOperator(user.email)) throw new HttpError(403, "Only credit operators can review top-up requests");
  const codec = getCodec();
  const rows = await getDb()
    .selectFrom("credit_requests")
    .innerJoin("organizations", "organizations.id", "credit_requests.org_id")
    .innerJoin("users", "users.id", "credit_requests.user_id")
    .select([
      "credit_requests.id",
      "credit_requests.org_id",
      "organizations.name as workspace",
      "users.email as requested_by",
      "credit_requests.credits",
      "credit_requests.pack",
      "credit_requests.note",
      "credit_requests.created_at",
    ])
    .where("credit_requests.status", "=", CreditRequestStatus.PENDING)
    .orderBy("credit_requests.id", "asc")
    .execute();
  return json(rows.map((r) => ({ ...r, created_at: codec.readDate(r.created_at) })));
});
