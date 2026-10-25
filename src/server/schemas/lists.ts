import { z } from "zod";
import type { ProspectList } from "../models/entities";

/** Upper bound on prospects per list, keeping stored snapshots and exports manageable. */
export const MAX_LIST_ITEMS = 1000;

const text = (max = 500) => z.string().max(max);
const nullableText = (max = 500) => text(max).nullable();

/** One prospect as the dashboard displays it; lists store these snapshots. */
export const prospectSnapshotSchema = z.object({
  id: text(100).min(1),
  firstName: text(200),
  lastName: text(200),
  title: text(),
  seniority: text(200),
  department: text(200),
  jobFunction: text(200),
  city: text(200),
  country: text(200),
  email: nullableText(320),
  phone: nullableText(100),
  linkedinUrl: nullableText(),
  verifiedEmail: z.boolean(),
  directDial: z.boolean(),
  jobChangeDays: z.number().int().nonnegative().nullable(),
  sources: z.array(text(100)).max(10),
  company: z.object({
    id: nullableText(100),
    name: text(),
    industry: text(),
    employees: text(100),
    revenue: text(100),
    headquarters: text(200),
    website: nullableText(),
    technologies: z.array(text(200)).max(200),
    hiring: z.array(text(100)).max(10),
    funding: text(200),
    intent: nullableText(100),
  }),
});
export type ProspectSnapshot = z.infer<typeof prospectSnapshotSchema>;

export const createListRequestSchema = z.object({
  name: z.string().trim().min(1).max(255),
  prospects: z.array(prospectSnapshotSchema).min(1).max(MAX_LIST_ITEMS),
});

export function toProspectListResponse(list: ProspectList) {
  return {
    id: list.id,
    name: list.name,
    prospect_count: list.item_count,
    prospects: list.items,
    created_at: list.created_at,
  };
}
