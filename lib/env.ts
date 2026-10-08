import "server-only";
import { z } from "zod";

// All configuration comes from environment variables. Validated once, lazily, on first use.
const bool = z
  .enum(["true", "false"])
  .default("true")
  .transform((v) => v === "true");

const schema = z.object({
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  APP_URL: z.string().url().default("http://localhost:3000"),

  // Mock switches: every external service defaults to mock (build_spec.md §12)
  MOCK_VOICE: bool,
  MOCK_CALENDAR: bool,
  MOCK_AI: bool,
  MOCK_EMAIL: bool,
  MOCK_CRM: bool,

  // Voice (Vaani Labs)
  VAANI_WEBHOOK_SECRET: z.string().optional(), // vv_whk_...
  VAANI_API_KEY: z.string().optional(), // vv_live_...
  TOOL_SHARED_SECRET: z.string().optional(),

  // Google Calendar (service account JSON, base64)
  GOOGLE_SERVICE_ACCOUNT_B64: z.string().optional(),

  // Gemini
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),

  // Email (Resend)
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Aangan Assistant <onboarding@resend.dev>"),
  EMAIL_TEST_MODE: bool,
  EMAIL_TEST_TO: z.string().email().optional(),
  ESCALATION_EMAIL: z.string().email().optional(),
  OWNER_EMAIL: z.string().email().optional(),

  // HubSpot
  HUBSPOT_TOKEN: z.string().optional(),

  // Cron endpoints are called by an external scheduler with this bearer secret
  CRON_SECRET: z.string().optional(),

  RETENTION_MONTHS: z.coerce.number().int().positive().default(12),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid environment: ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}
