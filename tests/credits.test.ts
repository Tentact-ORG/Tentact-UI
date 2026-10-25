import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as reveal } from "@/app/api/contacts/reveal/route";
import { POST as grant } from "@/app/api/credits/grant/route";
import { PATCH as decide } from "@/app/api/credits/requests/[requestId]/route";
import { GET as pendingRequests, POST as requestCredits } from "@/app/api/credits/requests/route";
import { GET as credits } from "@/app/api/credits/route";
import { POST as search } from "@/app/api/search/route";
import { getSettings } from "@/server/core/config";
import { getCodec, getDb } from "@/server/core/database";
import { hashPassword } from "@/server/core/security";
import { toUser, type User } from "@/server/models/entities";
import { searchRequestSchema } from "@/server/schemas/search";
import { maskEmail, maskPhone } from "@/server/services/contactMasking";
import { creditService, InsufficientCreditsError } from "@/server/services/creditService";
import { exportService } from "@/server/services/exportService";
import { searchPlanCache } from "@/server/services/searchPlanCache";
import { authHeaders, callRoute, seedTestData, type SeedData } from "./helpers";

const contactSearch = { natural_query: "Find VP contacts in SaaS companies", search_target: "contact", page_size: 10 };

async function createOperator(orgId: number): Promise<User> {
  const codec = getCodec();
  const row = await getDb()
    .insertInto("users")
    .values({ org_id: orgId, email: "ops@platform.example", hashed_password: await hashPassword("operator_password_1"), full_name: "Ops", role: "MEMBER", is_active: codec.bool(true), created_at: codec.date(new Date()) })
    .returningAll()
    .executeTakeFirstOrThrow();
  return toUser(codec, row);
}

describe("credits", () => {
  let seed: SeedData;
  let operator: User;
  beforeEach(async () => {
    Object.assign(getSettings(), { CREDITS_ENABLED: true, CREDITS_PER_CONTACT: 1 });
    searchPlanCache.clear();
    seed = await seedTestData();
    operator = await createOperator(seed.org2.id);
  });
  afterEach(() => {
    Object.assign(getSettings(), { CREDITS_ENABLED: false });
  });

  it("lets members request top-ups and only operators approve them, once", async () => {
    const member = await authHeaders(seed.member);
    const created = await callRoute(requestCredits, { method: "POST", body: { credits: 1000, pack: "starter" }, headers: member });
    expect(created.status).toBe(200);
    expect(created.body.status).toBe("PENDING");
    expect((await callRoute(requestCredits, { method: "POST", body: { credits: 5 }, headers: member })).status).toBe(422);

    // Workspace admins are not operators: no self-service credits.
    const admin = await authHeaders(seed.admin);
    expect((await callRoute(pendingRequests, { headers: admin })).status).toBe(403);
    expect((await callRoute(decide, { method: "PATCH", body: { status: "APPROVED" }, headers: admin, params: { requestId: String(created.body.id) } })).status).toBe(403);
    expect((await callRoute(grant, { method: "POST", body: { org_id: seed.org1.id, credits: 50 }, headers: admin })).status).toBe(403);

    const ops = await authHeaders(operator);
    const queue = await callRoute(pendingRequests, { headers: ops });
    expect(queue.body).toEqual([expect.objectContaining({ id: created.body.id, workspace: "Acme Corporation", requested_by: "member@acme.com", credits: 1000 })]);
    const approved = await callRoute(decide, { method: "PATCH", body: { status: "APPROVED" }, headers: ops, params: { requestId: String(created.body.id) } });
    expect(approved.body).toMatchObject({ status: "APPROVED", balance: 1000 });
    expect((await callRoute(decide, { method: "PATCH", body: { status: "APPROVED" }, headers: ops, params: { requestId: String(created.body.id) } })).status).toBe(404);

    const summary = await callRoute(credits, { headers: member });
    expect(summary.body).toMatchObject({ enabled: true, balance: 1000, cost_per_contact: 1, is_operator: false });
    expect(summary.body.history[0]).toMatchObject({ delta: 1000, balance_after: 1000, reason: "grant" });
    expect(summary.body.requests[0]).toMatchObject({ status: "APPROVED", credits: 1000 });
    expect((await callRoute(credits, { headers: ops })).body.is_operator).toBe(true);
  });

  it("caps pending requests per workspace", async () => {
    const member = await authHeaders(seed.member);
    for (let i = 0; i < 5; i++) await callRoute(requestCredits, { method: "POST", body: { credits: 500 }, headers: member });
    expect((await callRoute(requestCredits, { method: "POST", body: { credits: 500 }, headers: member })).status).toBe(429);
  });

  it("masks contact details in results and charges once per contact to reveal them", async () => {
    const member = await authHeaders(seed.member);
    const found = await callRoute(search, { method: "POST", body: contactSearch, headers: member });
    expect(found.status).toBe(200);
    expect(found.body.contact_details_masked).toBe(true);
    expect(found.body.result_id).toEqual(expect.any(String));
    const first = found.body.records[0];
    expect(first.work_email).toMatch(/^.{1,2}•••@/);
    expect(first.job_title).toBeTruthy(); // non-contact columns untouched
    const ids = found.body.records.slice(0, 3).map((r: { contact_id: number }) => String(r.contact_id));

    const broke = await callRoute(reveal, { method: "POST", body: { result_id: found.body.result_id, contact_ids: ids }, headers: member });
    expect(broke.status).toBe(402);
    expect(broke.body).toMatchObject({ required: 3, balance: 0 });

    await creditService.grant(seed.org1.id, 10, null, "test");
    const paid = await callRoute(reveal, { method: "POST", body: { result_id: found.body.result_id, contact_ids: ids }, headers: member });
    expect(paid.body).toMatchObject({ charged: 3, newly_revealed: 3, balance: 7 });
    expect(paid.body.contacts[ids[0]].work_email).toContain("@enterprise");
    expect(paid.body.contacts[ids[0]].work_email).not.toContain("•");

    const again = await callRoute(reveal, { method: "POST", body: { result_id: found.body.result_id, contact_ids: ids }, headers: member });
    expect(again.body).toMatchObject({ charged: 0, balance: 7 });

    // The next search shows paid-for contacts unmasked, for everyone in the workspace.
    const rerun = await callRoute(search, { method: "POST", body: contactSearch, headers: await authHeaders(seed.admin) });
    expect(rerun.body.revealed_ids.sort()).toEqual([...ids].sort());
    expect(rerun.body.records.find((r: { contact_id: number }) => String(r.contact_id) === ids[0]).work_email).not.toContain("•");

    // Results belong to their workspace; unknown ids are rejected.
    const otherOrg = await callRoute(reveal, { method: "POST", body: { result_id: found.body.result_id, contact_ids: ids }, headers: await authHeaders(seed.org2Member) });
    expect(otherOrg.status).toBe(410);
    expect((await callRoute(reveal, { method: "POST", body: { result_id: found.body.result_id, contact_ids: ["999999999"] }, headers: member })).status).toBe(422);
  });

  it("charges exports for contacts not yet paid for and fails them when credits run short", async () => {
    const request = searchRequestSchema.parse(contactSearch);
    const poor = await exportService.createExportJob(request, seed.member.id, seed.org1.id, "MEMBER", 10);
    await exportService.drain();
    const failed = await exportService.getJobByToken(poor.download_token!);
    expect(failed?.status).toBe("FAILED");
    expect(failed?.error_message).toMatch(/^Not enough credits: this needs \d+ credits and the workspace has 0\./);

    await creditService.grant(seed.org1.id, 100, null, "test");
    const paid = await exportService.createExportJob(request, seed.member.id, seed.org1.id, "MEMBER", 10);
    await exportService.drain();
    const done = await exportService.getJobByToken(paid.download_token!);
    expect(done?.status).toBe("COMPLETED");
    const balance = await creditService.balance(seed.org1.id);
    expect(balance).toBe(100 - done!.total_rows);

    // Re-exporting the same contacts costs nothing more.
    await exportService.createExportJob(request, seed.member.id, seed.org1.id, "MEMBER", 10);
    await exportService.drain();
    expect(await creditService.balance(seed.org1.id)).toBe(balance);
  });

  it("never spends more than the balance under concurrent charges", async () => {
    await creditService.grant(seed.org1.id, 3, null, "test");
    const results = await Promise.allSettled([
      creditService.chargeForContacts(seed.org1.id, null, ["a", "b", "c"], "reveal", null),
      creditService.chargeForContacts(seed.org1.id, null, ["d", "e", "f"], "reveal", null),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")?.reason).toBeInstanceOf(InsufficientCreditsError);
    expect(await creditService.balance(seed.org1.id)).toBe(0);
    const revealed = await getDb().selectFrom("revealed_contacts").select("contact_id").execute();
    expect(revealed).toHaveLength(3); // the failed charge revealed nothing
  });

  it("masks emails and phones readably", () => {
    expect(maskEmail("maya.rao@northwind.example")).toBe("ma•••@northwind.example");
    expect(maskPhone("+1 (555) 010-0199")).toBe("••• 0199");
    expect(maskPhone("12")).toBe("•••");
  });
});
