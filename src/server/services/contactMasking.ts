import { randomBytes } from "node:crypto";
import { HttpError } from "../core/errors";
import { singleton } from "../core/singleton";
import { creditService } from "./creditService";

/**
 * Contact details (emails and phone numbers) are masked in search results and
 * revealed for credits. The unmasked values of each search result stay on the
 * server for an hour under an unguessable result id, so a reveal never re-queries
 * the warehouse and only returns contacts that were actually in the result.
 */

/** Columns holding contact details; status and verification columns stay visible. */
const CONTACT_DETAIL = /(email|phone|mobile|cell)/i;
const NOT_CONTACT_DETAIL = /(status|verif|valid|type|count|domain|tech)/i;
const CONTACT_ID_KEYS = ["contact_id", "rbid_per", "id"];

const RESULT_TTL_MS = 60 * 60_000;
const MAX_RESULTS = 300;

export function isContactDetailColumn(column: string): boolean {
  return CONTACT_DETAIL.test(column) && !NOT_CONTACT_DETAIL.test(column);
}

/** The person identifier of a result row, if it has one. */
export function contactIdOf(record: Record<string, unknown>): string | null {
  for (const key of Object.keys(record)) {
    if (CONTACT_ID_KEYS.includes(key.toLowerCase())) {
      const value = record[key];
      if (value !== null && value !== undefined && String(value).trim() !== "") return String(value).trim();
    }
  }
  return null;
}

export function maskEmail(value: string): string {
  const at = value.indexOf("@");
  if (at <= 0) return "•••";
  return `${value.slice(0, Math.min(2, at))}•••${value.slice(at)}`;
}

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? `••• ${digits.slice(-4)}` : "•••";
}

function maskValue(column: string, value: unknown): unknown {
  if (value === null || value === undefined || value === "") return value;
  const text = String(value);
  return /email/i.test(column) ? maskEmail(text) : maskPhone(text);
}

interface StoredResult {
  orgId: number;
  createdAt: number;
  /** Contact id → that row's unmasked contact-detail columns. */
  details: Map<string, Record<string, unknown>>;
}

class RevealableResults {
  private readonly results = new Map<string, StoredResult>();

  store(orgId: number, details: Map<string, Record<string, unknown>>): string {
    const resultId = randomBytes(18).toString("base64url");
    this.results.set(resultId, { orgId, createdAt: Date.now(), details });
    while (this.results.size > MAX_RESULTS) {
      const oldest = this.results.keys().next().value;
      if (oldest === undefined) break;
      this.results.delete(oldest);
    }
    return resultId;
  }

  get(resultId: string, orgId: number): StoredResult | null {
    const result = this.results.get(resultId);
    if (!result || result.orgId !== orgId) return null;
    if (Date.now() - result.createdAt > RESULT_TTL_MS) {
      this.results.delete(resultId);
      return null;
    }
    return result;
  }
}

const revealable = singleton("revealableResults", () => new RevealableResults());

export interface MaskedRecords {
  records: Record<string, unknown>[];
  /** Present when contact details were masked: pass it to the reveal endpoint. */
  resultId: string | null;
  /** Contacts in this page whose details the organization already paid for (shown unmasked). */
  revealedIds: string[];
  masked: boolean;
}

/** Masks the contact details in search result rows the organization hasn't revealed yet. */
export async function maskSearchRecords(orgId: number, records: Record<string, unknown>[]): Promise<MaskedRecords> {
  if (!creditService.enabled || records.length === 0) return { records, resultId: null, revealedIds: [], masked: false };
  const detailColumns = Object.keys(records[0]).filter(isContactDetailColumn);
  if (detailColumns.length === 0) return { records, resultId: null, revealedIds: [], masked: false };

  const ids = records.map(contactIdOf);
  const revealed = await creditService.revealedAmong(orgId, ids.filter((id): id is string => id !== null));
  const details = new Map<string, Record<string, unknown>>();
  const masked = records.map((record, index) => {
    const id = ids[index];
    if (id !== null) details.set(id, Object.fromEntries(detailColumns.map((column) => [column, record[column]])));
    if (id !== null && revealed.has(id)) return record;
    const copy = { ...record };
    for (const column of detailColumns) copy[column] = maskValue(column, record[column]);
    return copy;
  });
  return { records: masked, resultId: details.size > 0 ? revealable.store(orgId, details) : null, revealedIds: [...revealed], masked: true };
}

/**
 * Charges for and returns the contact details of `contactIds` from a stored
 * search result. Throws HttpError 410 when the result has expired, 422 for ids
 * that weren't in it, and lets InsufficientCreditsError propagate.
 */
export async function revealContacts(orgId: number, userId: number, resultId: string, contactIds: readonly string[]) {
  const result = revealable.get(resultId, orgId);
  if (!result) throw new HttpError(410, "These search results have expired. Run the search again to reveal contacts.");
  const unknown = contactIds.filter((id) => !result.details.has(id));
  if (unknown.length > 0) throw new HttpError(422, `body.contact_ids: ${unknown.length} id(s) are not part of this search result`);

  const { charged, newlyRevealed, balance } = await creditService.chargeForContacts(orgId, userId, contactIds, "reveal", `result:${resultId.slice(0, 8)}`);
  const contacts: Record<string, Record<string, unknown>> = {};
  for (const id of contactIds) contacts[id] = result.details.get(id) ?? {};
  return { contacts, charged, newly_revealed: newlyRevealed, balance };
}
