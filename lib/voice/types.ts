// VoiceProvider — build_spec.md §6. Core logic depends only on these types;
// everything Vaani-specific lives in VaaniAdapter.
import type { TranscriptTurn } from "@/db/schema";

export type WebhookCheck = {
  ok: boolean; // signature valid
  eventId: string | null; // dedupe key
  eventType: string | null;
};

export type CallStatus = "completed" | "failed" | "dropped" | "unknown";

export type NormalizedCall = {
  providerCallId: string;
  startedAt: Date | null;
  endedAt: Date | null;
  durationSec: number | null;
  callerNumber: string | null;
  status: CallStatus;
  language: string | null;
  /** Reference to the call recording at the voice provider, if it sent one. */
  recordingUrl?: string | null;
  transcript: TranscriptTurn[];
};

export interface VoiceProvider {
  readonly name: string;
  /** Verify the webhook signature over the exact raw body. */
  verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookCheck>;
  /** Convert a webhook envelope into a call, or null if the event is not about a finished call. */
  parseCallEvent(envelope: unknown): NormalizedCall | null;
  /** Recent calls for reconciliation; "unsupported" if the provider has no list endpoint. */
  listRecentCalls(since: Date): Promise<NormalizedCall[] | "unsupported">;
}
