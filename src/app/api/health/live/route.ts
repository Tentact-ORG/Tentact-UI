import { json, route } from "@/server/api/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Simple process liveness check (does not wait for startup). */
export const GET = route(async () => json({ status: "alive" }), { requireInit: false });
