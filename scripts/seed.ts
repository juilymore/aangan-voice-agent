// Seeds designers and the three dashboard users. Idempotent: safe to re-run.
// Usage: npm run db:seed   (reads SEED_* variables from .env.local)
import { config } from "dotenv";
config({ path: ".env.local" });

import bcrypt from "bcryptjs";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "../db/schema";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env.local`);
  return v;
}

async function main() {
  const pool = new Pool({ connectionString: need("DATABASE_URL") });
  const db = drizzle({ client: pool, schema });

  const designers = [
    { key: "ruhi", name: "Ruhi", email: need("SEED_RUHI_EMAIL"), googleCalendarId: process.env.SEED_RUHI_CALENDAR_ID ?? null },
    { key: "jay", name: "Jay", email: need("SEED_JAY_EMAIL"), googleCalendarId: process.env.SEED_JAY_CALENDAR_ID ?? null },
  ];
  for (const d of designers) {
    await db
      .insert(schema.designers)
      .values(d)
      .onConflictDoUpdate({ target: schema.designers.key, set: { name: d.name, email: d.email, googleCalendarId: d.googleCalendarId } });
  }

  const users = [
    { email: need("SEED_RUHI_EMAIL"), name: "Ruhi", role: "designer" as const, designerKey: "ruhi", pw: need("SEED_RUHI_PASSWORD") },
    { email: need("SEED_JAY_EMAIL"), name: "Jay", role: "designer" as const, designerKey: "jay", pw: need("SEED_JAY_PASSWORD") },
    { email: need("SEED_OWNER_EMAIL"), name: "Nikhil", role: "owner" as const, designerKey: null, pw: need("SEED_OWNER_PASSWORD") },
  ];
  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.pw, 10);
    await db
      .insert(schema.users)
      .values({ email: u.email.toLowerCase(), name: u.name, role: u.role, designerKey: u.designerKey, passwordHash })
      .onConflictDoUpdate({ target: schema.users.email, set: { name: u.name, role: u.role, designerKey: u.designerKey, passwordHash } });
  }

  console.log(`Seeded ${designers.length} designers and ${users.length} users.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
