import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

// Liveness + DB check. Reports which services are mocked; never reveals secrets.
export async function GET() {
  try {
    const e = env();
    await db().execute(sql`select 1`);
    return Response.json({
      ok: true,
      db: "ok",
      mocks: {
        voice: e.MOCK_VOICE,
        calendar: e.MOCK_CALENDAR,
        ai: e.MOCK_AI,
        email: e.MOCK_EMAIL,
        crm: e.MOCK_CRM,
      },
      emailTestMode: e.EMAIL_TEST_MODE,
    });
  } catch (err) {
    console.error("health check failed:", err instanceof Error ? err.message : err);
    return Response.json({ ok: false, error: "health check failed" }, { status: 503 });
  }
}
