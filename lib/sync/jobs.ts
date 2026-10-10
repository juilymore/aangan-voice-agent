import "server-only";
import type { CallChange } from "./hooks";

// Placeholder until Checkpoint 7 wires email and HubSpot. Keeps the dashboard contract callable.
export async function enqueueForChange(_callId: string, _change: CallChange, _actor: string): Promise<void> {}
