// Right to erasure (DPDP): deletes every call, booking and tool log for one phone number.
// Usage: npm run erase-caller -- "+91 98220 34567"          (shows what would be deleted)
//        npm run erase-caller -- "+91 98220 34567" --yes    (deletes)
// Remember to delete the HubSpot contact/deal and the calendar event by hand if they exist.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

const { db } = await import("../lib/db");
const { sql } = await import("drizzle-orm");

const raw = process.argv[2] ?? "";
const n = raw.replace(/\D/g, "").slice(-10);
if (n.length !== 10) {
  console.error('Give a phone number, e.g. npm run erase-caller -- "+91 98220 34567"');
  process.exit(1);
}
const match = (col: string) => sql.raw(`right(regexp_replace(coalesce(${col}, ''), '\\D', '', 'g'), 10) = '${n}'`);
const calls = await db().execute(sql`select id, vaani_call_id, caller_name, started_at, hubspot_deal_id from calls where ${match("caller_number")}`);
const bookings = await db().execute(sql`select id, start_at, google_event_id from bookings where ${match("callback_number")}`);
const rows = (calls as unknown as { rows: { id: string; vaani_call_id: string; caller_name: string; started_at: string; hubspot_deal_id: string | null }[] }).rows;
console.log(`Calls: ${rows.length}, bookings: ${(bookings as unknown as { rows: unknown[] }).rows.length}`);
for (const r of rows) console.log(`  ${r.started_at}  ${r.caller_name ?? "?"}  ${r.hubspot_deal_id ? `(HubSpot deal ${r.hubspot_deal_id})` : ""}`);

if (!process.argv.includes("--yes")) {
  console.log("Nothing deleted. Re-run with --yes to delete.");
  process.exit(0);
}
const ids = rows.map((r) => r.vaani_call_id);
await db().execute(sql`delete from bookings where ${match("callback_number")}`);
if (ids.length) {
  await db().execute(sql`delete from tool_calls where vaani_call_id in ${sql.raw(`(${ids.map((i) => `'${i.replace(/'/g, "''")}'`).join(",")})`)}`);
  for (const id of ids) await db().execute(sql`delete from raw_events where payload::text like ${"%" + id + "%"}`);
}
await db().execute(sql`delete from calls where ${match("caller_number")}`);
console.log("Deleted.");
process.exit(0);
