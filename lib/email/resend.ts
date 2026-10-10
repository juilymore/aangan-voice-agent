import "server-only";
import type { EmailMessage, EmailProvider } from "./types";

// Resend REST API: POST https://api.resend.com/emails (docs: https://resend.com/docs/api-reference/emails/send-email)
// Supports an Idempotency-Key header, so a retried job never sends twice.
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    /** When set, every email goes here instead, with the intended recipient in the subject. */
    private readonly testTo: string | null,
  ) {}

  async send(msg: EmailMessage): Promise<{ id: string }> {
    const to = this.testTo ?? msg.to;
    const subject = this.testTo ? `[TEST → ${msg.to}] ${msg.subject}` : msg.subject;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        "idempotency-key": msg.idempotencyKey.slice(0, 256),
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ from: this.from, to: [to], subject, html: msg.html, text: msg.text }),
    });
    if (!res.ok) {
      const err = new Error(`resend ${res.status}: ${(await res.text()).slice(0, 200)}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    const data = (await res.json()) as { id?: string };
    return { id: data.id ?? "unknown" };
  }
}
