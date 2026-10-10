import { cronAuthorized, unauthorized } from "@/lib/cron";
import { sendDigest } from "@/lib/digest";
import { deps } from "@/lib/providers";

// 08:00 IST daily digest to Nikhil, including the silence alarm (build_spec §9).
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return unauthorized();
  const r = await sendDigest(deps());
  return Response.json({ ok: true, ...r });
}
