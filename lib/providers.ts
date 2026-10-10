import "server-only";
import { env } from "@/lib/env";
import { GoogleCalendarProvider } from "@/lib/calendar/google";
import { MockCalendarProvider } from "@/lib/calendar/mock";
import type { CalendarProvider } from "@/lib/calendar/types";
import { MockVoiceProvider } from "@/lib/voice/mock";
import type { VoiceProvider } from "@/lib/voice/types";
import { VaaniAdapter } from "@/lib/voice/vaani-adapter";
import { MockEmailProvider, type EmailProvider } from "@/lib/email/types";
import { ResendEmailProvider } from "@/lib/email/resend";
import { MockCrmProvider, type CrmProvider } from "@/lib/crm/types";
import { HubSpotCrmProvider } from "@/lib/crm/hubspot";
import { MockLlmProvider, type LlmProvider } from "@/lib/ai/types";
import { GeminiProvider } from "@/lib/ai/gemini";

// The single place that chooses mock vs real for each external service (MOCK_* in .env.local).
// A real provider whose key is missing falls back to the mock, so nothing breaks half-configured.

export type Deps = {
  voice: VoiceProvider;
  calendar: CalendarProvider;
  email: EmailProvider;
  crm: CrmProvider;
  llm: LlmProvider;
};

let cached: Deps | undefined;

export function deps(): Deps {
  if (cached) return cached;
  const e = env();
  cached = {
    voice: e.MOCK_VOICE ? new MockVoiceProvider() : new VaaniAdapter(e.VAANI_WEBHOOK_SECRET),
    calendar:
      !e.MOCK_CALENDAR && e.GOOGLE_SERVICE_ACCOUNT_B64 && e.GOOGLE_CALENDAR_ID
        ? new GoogleCalendarProvider(e.GOOGLE_SERVICE_ACCOUNT_B64, e.GOOGLE_CALENDAR_ID)
        : new MockCalendarProvider(),
    email:
      !e.MOCK_EMAIL && e.RESEND_API_KEY
        ? new ResendEmailProvider(e.RESEND_API_KEY, e.EMAIL_FROM, e.EMAIL_TEST_MODE ? (e.EMAIL_TEST_TO ?? null) : null)
        : new MockEmailProvider(),
    crm: !e.MOCK_CRM && e.HUBSPOT_TOKEN ? new HubSpotCrmProvider(e.HUBSPOT_TOKEN) : new MockCrmProvider(),
    llm: !e.MOCK_AI && e.GEMINI_API_KEY ? new GeminiProvider(e.GEMINI_API_KEY, e.GEMINI_MODEL) : new MockLlmProvider(),
  };
  return cached;
}

/** All-mock dependencies: used by the demo seed and tests so nothing real is ever contacted. */
export function mockDeps(llm?: LlmProvider): Deps {
  return {
    voice: new MockVoiceProvider(),
    calendar: new MockCalendarProvider(),
    email: new MockEmailProvider(),
    crm: new MockCrmProvider(),
    llm: llm ?? new MockLlmProvider(),
  };
}
