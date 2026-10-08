export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string; // Resend supports an Idempotency-Key header
};

export interface EmailProvider {
  readonly name: string;
  send(msg: EmailMessage): Promise<{ id: string }>;
}

/** Captures emails in memory. Used in tests and whenever MOCK_EMAIL=true. */
export class MockEmailProvider implements EmailProvider {
  readonly name = "mock";
  sent: EmailMessage[] = [];
  async send(msg: EmailMessage) {
    // Same idempotency key -> same message, sent once (mirrors Resend behaviour)
    if (!this.sent.some((m) => m.idempotencyKey === msg.idempotencyKey)) this.sent.push(msg);
    return { id: `mock_email_${msg.idempotencyKey}` };
  }
}
