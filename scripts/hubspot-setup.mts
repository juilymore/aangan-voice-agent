// One-time HubSpot setup: lists the deal pipeline stages (to verify STAGE_IDS in lib/crm/hubspot.ts)
// and creates the custom aangan_* deal properties. Safe to re-run. Usage: npm run hubspot:setup
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

const token = process.env.HUBSPOT_TOKEN;
if (!token) {
  console.error("Missing HUBSPOT_TOKEN in .env.local");
  process.exit(1);
}
const h = { authorization: `Bearer ${token}`, "content-type": "application/json" };

const pipes = await fetch("https://api.hubapi.com/crm/v3/pipelines/deals", { headers: h }).then((r) => r.json());
for (const p of pipes.results ?? []) {
  console.log(`Pipeline "${p.label}" (id ${p.id})`);
  for (const s of p.stages) console.log(`  ${s.id.padEnd(24)} ${s.label}`);
}

const props = [
  ["aangan_temperature", "Aangan temperature"],
  ["aangan_designer", "Aangan designer"],
  ["aangan_summary", "Aangan call summary"],
  ["aangan_dashboard_url", "Aangan dashboard link"],
  ["aangan_meeting_at", "Aangan meeting time"],
  ["aangan_meeting_mode", "Aangan meeting mode"],
  ["aangan_source", "Aangan lead source"],
];
for (const [name, label] of props) {
  const r = await fetch("https://api.hubapi.com/crm/v3/properties/deals", {
    method: "POST",
    headers: h,
    body: JSON.stringify({ name, label, type: "string", fieldType: "text", groupName: "dealinformation" }),
  });
  console.log(r.ok ? `created ${name}` : r.status === 409 ? `exists  ${name}` : `FAILED  ${name}: ${r.status} ${(await r.text()).slice(0, 120)}`);
}
