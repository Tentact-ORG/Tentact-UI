import { getCodec, getDb } from "../core/database";
import { getLogger } from "../core/logger";
import { toAuditEvent, type AuditEvent } from "../models/entities";

const logger = getLogger("leadgen.audit");

const SECRET_KEY_MARKERS = ["password", "secret", "token", "key", "authorization"];

export interface AuditEventInput {
  action: string;
  resource: string;
  status: string;
  durationMs?: number;
  orgId?: number | null;
  userId?: number | null;
  details?: Record<string, unknown> | null;
}

/** Redacts any detail whose key looks like a credential or secret. */
export function sanitizeAuditDetails(details: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!details || Object.keys(details).length === 0) return null;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    const lowered = key.toLowerCase();
    sanitized[key] = SECRET_KEY_MARKERS.some((marker) => lowered.includes(marker)) ? "[REDACTED]" : value;
  }
  return sanitized;
}

class AuditService {
  /** Records an audit event into the application database and the application log. */
  async logEvent(input: AuditEventInput): Promise<AuditEvent> {
    const codec = getCodec();
    const durationMs = input.durationMs ?? 0;
    const orgId = input.orgId ?? null;
    const userId = input.userId ?? null;
    const details = sanitizeAuditDetails(input.details);

    logger.info(
      `AUDIT_EVENT: action=${input.action} resource=${input.resource} status=${input.status} ` +
        `user_id=${userId ?? "None"} org_id=${orgId ?? "None"} duration_ms=${durationMs}`,
    );

    const row = await getDb()
      .insertInto("audit_events")
      .values({
        action: input.action,
        // Column is VARCHAR(100); resources embed user-supplied text such as emails.
        resource: input.resource.slice(0, 100),
        status: input.status,
        duration_ms: durationMs,
        org_id: orgId,
        user_id: userId,
        details: details === null ? null : codec.json(details),
        created_at: codec.date(new Date()),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toAuditEvent(codec, row);
  }
}

export const auditService = new AuditService();
