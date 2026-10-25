import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import { ensureAppInitialized } from "../bootstrap";
import { HttpError } from "../core/errors";
import { getLogger } from "../core/logger";
import { InsufficientCreditsError } from "../services/creditService";

const logger = getLogger("leadgen.app");

/** Next.js passes dynamic route params as a Promise; handlers receive them resolved. */
type NextRouteContext<P> = { params: Promise<P> };
type RouteHandler<P> = (request: Request, context: { params: P }) => Promise<Response>;
type NextRouteHandler<P> = (request: Request, context: NextRouteContext<P>) => Promise<Response>;

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

function formatZodError(err: ZodError, location: string): string {
  return err.issues.map((i) => `${[location, ...i.path].join(".")}: ${i.message}`).join("; ");
}

/** Parses and validates a JSON request body (422 on malformed or invalid input). */
export async function parseBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new HttpError(422, "Request body must be valid JSON");
  }
  const result = schema.safeParse(raw);
  if (!result.success) throw new HttpError(422, formatZodError(result.error, "body"));
  return result.data;
}

/** Parses a positive integer path parameter (422 otherwise). */
export function intParam(value: string, name: string): number {
  if (!/^\d+$/.test(value)) throw new HttpError(422, `path.${name}: Expected an integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new HttpError(422, `path.${name}: Expected an integer`);
  return parsed;
}

/**
 * Wraps a route handler: waits for application startup, maps HttpError and validation
 * failures to `{"detail": ...}` responses and hides unexpected errors behind a generic 500.
 */
export function route<P = Record<string, never>>(
  handler: RouteHandler<P>,
  options: { requireInit?: boolean } = {},
): NextRouteHandler<P> {
  const requireInit = options.requireInit ?? true;
  return async (request, context) => {
    try {
      if (requireInit) await ensureAppInitialized();
      return await handler(request, { params: await context.params });
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ detail: err.detail }, { status: err.status, headers: err.headers });
      }
      if (err instanceof InsufficientCreditsError) {
        return NextResponse.json({ detail: err.message, required: err.required, balance: err.balance }, { status: 402 });
      }
      if (err instanceof ZodError) {
        return NextResponse.json({ detail: formatZodError(err, "body") }, { status: 422 });
      }
      const url = new URL(request.url);
      logger.error(`Unhandled server error on ${request.method} ${url.pathname}`, err);
      return NextResponse.json(
        { detail: "An internal server error occurred. Please contact the administrator." },
        { status: 500 },
      );
    }
  };
}
