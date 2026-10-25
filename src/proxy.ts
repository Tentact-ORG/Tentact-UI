import { NextResponse, type NextRequest } from "next/server";

/**
 * CORS for cross-origin API consumers listed in CORS_ORIGINS. The bundled UI is served
 * from the same origin and does not depend on this.
 */
function allowedOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

function corsHeaders(origin: string, request: NextRequest): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": request.headers.get("access-control-request-headers") ?? "Authorization,Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export function proxy(request: NextRequest): NextResponse {
  const origin = request.headers.get("origin");
  const allowed = origin !== null && allowedOrigins().includes(origin);

  if (request.method === "OPTIONS" && origin !== null) {
    return allowed
      ? new NextResponse(null, { status: 204, headers: corsHeaders(origin, request) })
      : new NextResponse(null, { status: 400 });
  }

  const response = NextResponse.next();
  if (allowed) {
    for (const [key, value] of Object.entries(corsHeaders(origin, request))) response.headers.set(key, value);
  }
  return response;
}

export const config = { matcher: "/api/:path*" };
