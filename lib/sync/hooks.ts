import "server-only";

// Contract between the dashboard (writer of designer changes) and the integration layer.
// The dashboard calls this AFTER it has saved a change and written call_audit. This module decides what
// must be synced (HubSpot deal stage/properties, designer email, calendar) and enqueues sync_jobs.
// Implemented in lib/sync/jobs.ts (Checkpoint 7); safe to call now.

export type CallChange =
  | { kind: "qualification"; from: string | null; to: string; reason: string }
  | { kind: "temperature"; from: string | null; to: string }
  | { kind: "designer"; from: string | null; to: string }
  | { kind: "outcome"; to: string; value?: number | null; reason?: string | null }
  | { kind: "followup_done" }
  | { kind: "note"; text: string }
  | { kind: "booking"; action: "rescheduled" | "cancelled" | "confirmed_with_customer"; bookingId: string };

export async function onCallChanged(callId: string, change: CallChange, actor: string): Promise<void> {
  const { enqueueForChange } = await import("./jobs");
  await enqueueForChange(callId, change, actor);
}

/** "Retry" button on a failed or dead sync job: resets it and runs it now. */
export async function retrySync(jobId: string): Promise<void> {
  const { retryJob } = await import("./jobs");
  await retryJob(jobId);
}
