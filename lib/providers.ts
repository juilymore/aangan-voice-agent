import "server-only";
import { env } from "@/lib/env";
import { MockCalendarProvider } from "@/lib/calendar/mock";
import type { CalendarProvider } from "@/lib/calendar/types";
import { MockVoiceProvider } from "@/lib/voice/mock";
import type { VoiceProvider } from "@/lib/voice/types";
import { VaaniAdapter } from "@/lib/voice/vaani-adapter";
import { MockEmailProvider, type EmailProvider } from "@/lib/email/types";
import { MockCrmProvider, type CrmProvider } from "@/lib/crm/types";
import { MockLlmProvider, type LlmProvider } from "@/lib/ai/types";

// Single place that chooses mock vs real for each external service.
// Real implementations are added at their checkpoints (Calendar: 5, Voice: 6, Email/CRM: 7, AI: 3).

let voice: VoiceProvider | undefined;
let calendar: CalendarProvider | undefined;
let email: EmailProvider | undefined;
let crm: CrmProvider | undefined;
let llm: LlmProvider | undefined;

function notYet(service: string): never {
  throw new Error(`${service}: real provider not implemented yet — set MOCK_${service.toUpperCase()}=true`);
}

export function voiceProvider(): VoiceProvider {
  voice ??= env().MOCK_VOICE ? new MockVoiceProvider() : new VaaniAdapter(env().VAANI_WEBHOOK_SECRET);
  return voice;
}

export function calendarProvider(): CalendarProvider {
  calendar ??= env().MOCK_CALENDAR ? new MockCalendarProvider() : notYet("calendar");
  return calendar;
}

export function emailProvider(): EmailProvider {
  email ??= env().MOCK_EMAIL ? new MockEmailProvider() : notYet("email");
  return email;
}

export function crmProvider(): CrmProvider {
  crm ??= env().MOCK_CRM ? new MockCrmProvider() : notYet("crm");
  return crm;
}

export function llmProvider(): LlmProvider {
  llm ??= env().MOCK_AI ? new MockLlmProvider() : notYet("ai");
  return llm;
}
