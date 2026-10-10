import "server-only";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/** Cron endpoints require `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends this automatically). */
export function cronAuthorized(request: Request): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export const unauthorized = () => Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
