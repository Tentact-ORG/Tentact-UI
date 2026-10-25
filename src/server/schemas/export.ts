import { z } from "zod";
import type { ExportJob } from "../models/entities";
import { searchRequestSchema } from "./search";

export const exportCreateRequestSchema = z.object({
  search_request: searchRequestSchema,
  max_rows: z.number().int().positive().nullable().default(100000),
});

export function toExportJobResponse(job: ExportJob) {
  return {
    id: job.id,
    org_id: job.org_id,
    user_id: job.user_id,
    status: job.status,
    search_target: job.search_target,
    total_rows: job.total_rows,
    download_token: job.download_token,
    error_message: job.error_message,
    created_at: job.created_at,
    completed_at: job.completed_at,
    expires_at: job.expires_at,
  };
}
