import { json, route } from "@/server/api/handler";
import { adminBootstrapService } from "@/server/services/adminBootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => json({ bootstrapped: await adminBootstrapService.isAdminBootstrapped() }));
