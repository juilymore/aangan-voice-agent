import type { NormalizedCall, VoiceProvider, WebhookCheck } from "./types";

/** Mock voice provider: accepts every webhook and serves a fixed call list for reconcile tests. */
export class MockVoiceProvider implements VoiceProvider {
  readonly name = "mock";
  calls: NormalizedCall[] = [];

  async verifyWebhook(rawBody: string): Promise<WebhookCheck> {
    try {
      const env = JSON.parse(rawBody);
      return { ok: true, eventId: env?.id ?? null, eventType: env?.type ?? null };
    } catch {
      return { ok: false, eventId: null, eventType: null };
    }
  }

  parseCallEvent(envelope: unknown): NormalizedCall | null {
    const e = envelope as { type?: string; data?: NormalizedCall };
    if (e?.type !== "call.completed" || !e.data?.providerCallId) return null;
    return {
      ...e.data,
      startedAt: e.data.startedAt ? new Date(e.data.startedAt) : null,
      endedAt: e.data.endedAt ? new Date(e.data.endedAt) : null,
    };
  }

  async listRecentCalls(since: Date) {
    return this.calls.filter((c) => !c.startedAt || c.startedAt >= since);
  }
}
