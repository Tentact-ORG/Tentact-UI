import { getCurrentUser } from "@/server/api/deps";
import { json, parseBody, route } from "@/server/api/handler";
import { HttpError, errorMessage } from "@/server/core/errors";
import { exportCreateRequestSchema, toExportJobResponse } from "@/server/schemas/export";
import { exportService } from "@/server/services/exportService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Queues an asynchronous CSV export of the given search. */
export const POST = route(async (request) => {
  const user = await getCurrentUser(request);
  const body = await parseBody(request, exportCreateRequestSchema);
  try {
    const job = await exportService.createExportJob(body.search_request, user.id, user.org_id, user.role, body.max_rows);
    return json(toExportJobResponse(job));
  } catch (err) {
    throw new HttpError(400, errorMessage(err));
  }
});
