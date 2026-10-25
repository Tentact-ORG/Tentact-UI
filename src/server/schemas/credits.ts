import { z } from "zod";

export const MIN_TOP_UP = 100;
export const MAX_TOP_UP = 1_000_000;

export const CreditRequestStatus = { PENDING: "PENDING", APPROVED: "APPROVED", DECLINED: "DECLINED" } as const;

export const createCreditRequestSchema = z.object({
  credits: z.number().int().min(MIN_TOP_UP).max(MAX_TOP_UP),
  pack: z.string().trim().max(50).nullable().default(null),
  note: z.string().trim().max(1000).nullable().default(null),
});

export const decideCreditRequestSchema = z.object({
  status: z.enum([CreditRequestStatus.APPROVED, CreditRequestStatus.DECLINED]),
});

export const grantCreditsSchema = z.object({
  org_id: z.number().int().positive(),
  credits: z.number().int().min(1).max(MAX_TOP_UP),
  note: z.string().trim().max(255).nullable().default(null),
});
