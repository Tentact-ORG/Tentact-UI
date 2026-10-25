import { sql, type Transaction } from "kysely";
import { getSettings } from "../core/config";
import { getCodec, getDb, type Database } from "../core/database";
import { auditService } from "./auditService";

/**
 * Workspace credits. Every change is a ledger entry; balances change through a
 * conditional update (`balance >= amount`), so concurrent spending can never
 * take an organization below zero. Revealing a contact's details is charged
 * once per organization and contact: contacts it has already paid for are free.
 */

export class InsufficientCreditsError extends Error {
  constructor(
    readonly required: number,
    readonly balance: number,
  ) {
    super(`Not enough credits: this needs ${required.toLocaleString("en-US")} credit${required === 1 ? "" : "s"} and the workspace has ${balance.toLocaleString("en-US")}.`);
    this.name = "InsufficientCreditsError";
  }
}

export type CreditReason = "grant" | "reveal" | "export" | "adjustment";

export interface CreditEntry {
  id: number;
  delta: number;
  balance_after: number;
  reason: string;
  reference: string | null;
  user_id: number | null;
  created_at: Date;
}

/** Inserts the organization's account row (balance 0) if it doesn't exist yet. */
async function ensureAccount(trx: Transaction<Database>, orgId: number): Promise<void> {
  await trx
    .insertInto("credit_accounts")
    .values({ org_id: orgId, balance: 0, updated_at: getCodec().date(new Date()) })
    .onConflict((oc) => oc.column("org_id").doNothing())
    .execute();
}

/** Adds `delta` (negative to spend) within a transaction; throws when spending more than the balance. */
async function applyDelta(
  trx: Transaction<Database>,
  orgId: number,
  delta: number,
  reason: CreditReason,
  userId: number | null,
  reference: string | null,
): Promise<number> {
  const codec = getCodec();
  await ensureAccount(trx, orgId);
  const updated = await trx
    .updateTable("credit_accounts")
    .set({ balance: sql<number>`balance + ${delta}`, updated_at: codec.date(new Date()) })
    .where("org_id", "=", orgId)
    .where("balance", ">=", delta < 0 ? -delta : 0)
    .returning("balance")
    .executeTakeFirst();
  if (!updated) {
    const current = await trx.selectFrom("credit_accounts").select("balance").where("org_id", "=", orgId).executeTakeFirst();
    throw new InsufficientCreditsError(-delta, current?.balance ?? 0);
  }
  await trx
    .insertInto("credit_ledger")
    .values({ org_id: orgId, user_id: userId, delta, balance_after: updated.balance, reason, reference, created_at: codec.date(new Date()) })
    .execute();
  return updated.balance;
}

class CreditService {
  /** Whether revealing and exporting contact details costs credits. */
  get enabled(): boolean {
    return getSettings().CREDITS_ENABLED;
  }

  get costPerContact(): number {
    return Math.max(0, getSettings().CREDITS_PER_CONTACT);
  }

  isOperator(email: string): boolean {
    return getSettings().creditOperatorEmails.includes(email.trim().toLowerCase());
  }

  async balance(orgId: number): Promise<number> {
    const row = await getDb().selectFrom("credit_accounts").select("balance").where("org_id", "=", orgId).executeTakeFirst();
    return row?.balance ?? 0;
  }

  async history(orgId: number, limit = 50): Promise<CreditEntry[]> {
    const codec = getCodec();
    const rows = await getDb()
      .selectFrom("credit_ledger")
      .select(["id", "delta", "balance_after", "reason", "reference", "user_id", "created_at"])
      .where("org_id", "=", orgId)
      .orderBy("id", "desc")
      .limit(limit)
      .execute();
    return rows.map((r) => ({ ...r, created_at: codec.readDate(r.created_at) }));
  }

  /** Adds credits to a workspace (an approved top-up or an operator grant). */
  async grant(orgId: number, credits: number, userId: number | null, reference: string | null): Promise<number> {
    if (!Number.isSafeInteger(credits) || credits <= 0) throw new RangeError("Credits to grant must be a positive integer");
    const balance = await getDb().transaction().execute((trx) => applyDelta(trx, orgId, credits, "grant", userId, reference));
    await auditService.logEvent({ action: "GRANT_CREDITS", resource: `org:${orgId}`, status: "SUCCESS", orgId, userId, details: { credits, balance, reference } });
    return balance;
  }

  /** The subset of `contactIds` whose details this organization has already paid for. */
  async revealedAmong(orgId: number, contactIds: readonly string[]): Promise<Set<string>> {
    const revealed = new Set<string>();
    const unique = [...new Set(contactIds)];
    for (let i = 0; i < unique.length; i += 500) {
      const rows = await getDb()
        .selectFrom("revealed_contacts")
        .select("contact_id")
        .where("org_id", "=", orgId)
        .where("contact_id", "in", unique.slice(i, i + 500))
        .execute();
      for (const row of rows) revealed.add(row.contact_id);
    }
    return revealed;
  }

  /**
   * Charges for revealing the contacts this organization hasn't paid for yet and
   * records them as revealed, atomically. Returns the credits charged. With
   * credits disabled nothing is charged, but reveals are still recorded.
   */
  async chargeForContacts(
    orgId: number,
    userId: number | null,
    contactIds: readonly string[],
    reason: Extract<CreditReason, "reveal" | "export">,
    reference: string | null,
  ): Promise<{ charged: number; newlyRevealed: number; balance: number }> {
    const codec = getCodec();
    const unique = [...new Set(contactIds.filter((id) => id.length > 0 && id.length <= 100))];
    const result = await getDb()
      .transaction()
      .execute(async (trx) => {
        let newlyRevealed = 0;
        const now = codec.date(new Date());
        for (let i = 0; i < unique.length; i += 500) {
          const inserted = await trx
            .insertInto("revealed_contacts")
            .values(unique.slice(i, i + 500).map((contactId) => ({ org_id: orgId, contact_id: contactId, user_id: userId, revealed_at: now })))
            .onConflict((oc) => oc.columns(["org_id", "contact_id"]).doNothing())
            .returning("contact_id")
            .execute();
          newlyRevealed += inserted.length;
        }
        const charged = this.enabled ? newlyRevealed * this.costPerContact : 0;
        if (charged > 0) {
          const balance = await applyDelta(trx, orgId, -charged, reason, userId, reference);
          return { charged, newlyRevealed, balance };
        }
        const account = await trx.selectFrom("credit_accounts").select("balance").where("org_id", "=", orgId).executeTakeFirst();
        return { charged, newlyRevealed, balance: account?.balance ?? 0 };
      });
    if (result.newlyRevealed > 0) {
      await auditService.logEvent({
        action: reason === "export" ? "CHARGE_EXPORT" : "REVEAL_CONTACTS",
        resource: `org:${orgId}`,
        status: "SUCCESS",
        orgId,
        userId,
        details: { contacts: result.newlyRevealed, charged: result.charged, balance: result.balance, reference },
      });
    }
    return result;
  }
}

export const creditService = new CreditService();
