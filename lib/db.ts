import "server-only";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";

// neon-serverless (WebSocket) driver: supports interactive transactions, needed for booking safety.
let instance: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function db() {
  if (!instance) {
    const pool = new Pool({ connectionString: env().DATABASE_URL });
    instance = drizzle({ client: pool, schema });
  }
  return instance;
}

export { schema };
