import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { z } from "zod";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";

// Shared wrapper for the four mid-call tools (build_spec §6): shared-secret auth, zod validation,
// a hard timeout, logging to tool_calls, and ALWAYS a well-formed body the agent can act on.
// Vaani-specific request shapes are unwrapped here (VaaniAdapter boundary for tools).

const buckets = new Map<string, { n: number; reset: number }>();
function rateLimited(key: string, perMinute = 120) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + 60_000 });
    return false;
  }
  b.n++;
  return b.n > perMinute;
}

function authorized(req: Request) {
  const secret = env().TOOL_SHARED_SECRET;
  if (!secret) return false;
  const given = req.headers.get("x-aangan-tool-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Unwraps common tool-call envelopes ({arguments}, {parameters}, {args}, {input}) to the flat params. */
export function unwrapParams(body: unknown): Obj {
  if (!isObj(body)) return {};
  for (const k of ["arguments", "parameters", "args", "input", "params"]) {
    const v = body[k];
    if (isObj(v)) return v;
    if (typeof v === "string") {
      try {
        const parsed = JSON.parse(v);
        if (isObj(parsed)) return parsed;
      } catch {
        /* not JSON */
      }
    }
  }
  return body;
}

/** The call id: from params, the envelope, or headers. Vaani has no {{call_id}} prompt variable. */
export function callIdOf(body: unknown, params: Obj, req: Request): string {
  const env_ = isObj(body) ? body : {};
  const cand = [
    params.call_id, params.callId, env_.call_id, env_.callId, env_.session_id, env_.sessionId,
    isObj(env_.call) ? (env_.call as Obj).id : undefined,
    req.headers.get("x-vaani-call-id"), req.headers.get("x-call-id"), req.headers.get("x-session-id"),
  ].find((v) => typeof v === "string" && v.trim());
  return (cand as string | undefined)?.trim() ?? `unknown-${new Date().toISOString().slice(0, 16)}`;
}

export function callerNumberOf(body: unknown, params: Obj, req: Request): string | undefined {
  const env_ = isObj(body) ? body : {};
  const cand = [params.caller_number, env_.caller_number, env_.from, env_.from_number, req.headers.get("x-caller-number")].find(
    (v) => typeof v === "string" && v.trim(),
  );
  return cand as string | undefined;
}

export async function runTool<S extends z.ZodTypeAny>(
  req: Request,
  tool: string,
  schemaIn: S,
  timeoutMs: number,
  fallback: object,
  handler: (params: z.infer<S>, ctx: { callId: string; body: unknown; raw: Obj }) => Promise<object>,
): Promise<Response> {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (rateLimited(`${tool}:${req.headers.get("x-forwarded-for") ?? "local"}`)) return Response.json({ ...fallback, error: "rate_limited" }, { status: 429 });

  const t0 = Date.now();
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const raw = unwrapParams(body);
  const callId = callIdOf(body, raw, req);
  const parsed = schemaIn.safeParse(raw);

  let response: object;
  let ok = true;
  if (!parsed.success) {
    ok = false;
    response = { ...fallback, error: "invalid_input" };
  } else {
    try {
      response = await Promise.race([
        handler(parsed.data, { callId, body, raw }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs)),
      ]);
    } catch (e) {
      ok = false;
      console.error(`tool ${tool} failed:`, e instanceof Error ? e.message : e);
      response = { ...fallback, error: "internal" };
    }
  }

  const latencyMs = Date.now() - t0;
  try {
    await db().insert(schema.toolCalls).values({ vaaniCallId: callId, tool, request: raw, response, latencyMs, ok });
  } catch (e) {
    console.error("tool_calls log failed:", e instanceof Error ? e.message : e);
  }
  return Response.json(response, { headers: { "x-latency-ms": String(latencyMs) } });
}
