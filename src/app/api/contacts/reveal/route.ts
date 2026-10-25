import { z } from "zod";
import { getCurrentUser } from "@/server/api/deps";
import { json, parseBody, route } from "@/server/api/handler";
import { revealContacts } from "@/server/services/contactMasking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const revealRequestSchema = z.object({
  result_id: z.string().min(16).max(64),
  contact_ids: z.array(z.string().min(1).max(100)).min(1).max(1000),
});

/**
 * Reveals the emails and phone numbers of contacts from a search result,
 * charging credits for contacts the organization hasn't paid for before
 * (402 when the balance is too low).
 */
export const POST = route(async (request) => {
  const user = await getCurrentUser(request);
  const body = await parseBody(request, revealRequestSchema);
  return json(await revealContacts(user.org_id, user.id, body.result_id, body.contact_ids));
});
