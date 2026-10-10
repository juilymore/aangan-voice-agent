import { cronAuthorized, unauthorized } from "@/lib/cron";
import { reconcile } from "@/lib/pipeline/process";

// Every 15 minutes: process any webhook that wasn't finished and retry failed syncs (build_spec §8.2, §8.11).
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return unauthorized();
  const r = await reconcile();
  return Response.json({ ok: true, ...r });
}
