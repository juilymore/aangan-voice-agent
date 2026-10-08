// CRM interface — build_spec.md §10. HubSpot implementation arrives at Checkpoint 7.

export type DealStage =
  | "qualified_not_booked"
  | "booked"
  | "consultation_done"
  | "proposal_sent"
  | "won"
  | "lost";

export type DealInput = {
  name: string;
  stage: DealStage;
  amount?: number | null;
  properties: Record<string, string | number | null>; // aangan_* custom properties
  lostReason?: string;
};

export interface CrmProvider {
  readonly name: string;
  upsertContact(input: { phone: string; name: string | null }): Promise<{ contactId: string }>;
  createDeal(contactId: string, deal: DealInput): Promise<{ dealId: string }>;
  updateDeal(dealId: string, deal: Partial<DealInput>): Promise<void>;
  addNote(dealId: string, body: string): Promise<void>;
}

export class MockCrmProvider implements CrmProvider {
  readonly name = "mock";
  contacts = new Map<string, { contactId: string; name: string | null }>();
  deals = new Map<string, DealInput & { contactId: string; notes: string[] }>();
  failNext429 = false; // simulate HubSpot rate limiting

  private maybe429() {
    if (this.failNext429) {
      this.failNext429 = false;
      const err = new Error("mock hubspot: 429 Too Many Requests") as Error & { status?: number };
      err.status = 429;
      throw err;
    }
  }

  async upsertContact({ phone, name }: { phone: string; name: string | null }) {
    this.maybe429();
    const existing = this.contacts.get(phone);
    if (existing) {
      existing.name = name ?? existing.name;
      return { contactId: existing.contactId };
    }
    const contactId = `c_${this.contacts.size + 1}`;
    this.contacts.set(phone, { contactId, name });
    return { contactId };
  }

  async createDeal(contactId: string, deal: DealInput) {
    this.maybe429();
    const dealId = `d_${this.deals.size + 1}`;
    this.deals.set(dealId, { ...deal, contactId, notes: [] });
    return { dealId };
  }

  async updateDeal(dealId: string, patch: Partial<DealInput>) {
    this.maybe429();
    const d = this.deals.get(dealId);
    if (!d) throw new Error(`mock hubspot: deal ${dealId} not found`);
    Object.assign(d, patch, { properties: { ...d.properties, ...(patch.properties ?? {}) } });
  }

  async addNote(dealId: string, body: string) {
    this.deals.get(dealId)?.notes.push(body);
  }
}
