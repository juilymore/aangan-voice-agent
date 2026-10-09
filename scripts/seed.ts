// Seeds the two designers. Idempotent: safe to re-run.
// Usage: npm run db:seed   (reads .env.local)
import { config } from "dotenv";
config({ path: ".env.local" });

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "../db/schema";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DATABASE_URL in .env.local");
  const pool = new Pool({ connectionString: url });
  const db = drizzle({ client: pool, schema });

  // Designer emails are where lead emails go. While EMAIL_TEST_MODE=true every email is redirected
  // to EMAIL_TEST_TO anyway, so placeholders are fine for the project.
  const designers = [
    { key: "ruhi", name: "Ruhi", email: process.env.RUHI_EMAIL || "ruhi@aangan.example" },
    { key: "jay", name: "Jay", email: process.env.JAY_EMAIL || "jay@aangan.example" },
  ];
  for (const d of designers) {
    await db
      .insert(schema.designers)
      .values(d)
      .onConflictDoUpdate({ target: schema.designers.key, set: { name: d.name, email: d.email } });
  }

  console.log(`Seeded ${designers.length} designers.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
