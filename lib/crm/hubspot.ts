import "server-only";
import type { CrmProvider, DealInput, DealStage } from "./types";

// HubSpot CRM v3 (private app token). Docs: https://developers.hubspot.com/docs/api/crm
// Stage IDs are the default sales pipeline's internal IDs; verify with `npm run hubspot:setup`,
// which lists the real pipeline stages and creates the aangan_* deal properties.
export const STAGE_IDS: Record<DealStage, string> = {
  qualified_not_booked: "qualifiedtobuy",
  booked: "appointmentscheduled",
  consultation_done: "presentationscheduled",
  proposal_sent: "contractsent",
  won: "closedwon",
  lost: "closedlost",
};

const DEAL_TO_CONTACT = 3; // HUBSPOT_DEFINED association type: deal → contact
const NOTE_TO_DEAL = 214; // HUBSPOT_DEFINED association type: note → deal

export class HubSpotCrmProvider implements CrmProvider {
  readonly name = "hubspot";
  constructor(private readonly token: string) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`https://api.hubapi.com${path}`, {
      method,
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(15_000),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = new Error(`hubspot ${res.status} ${method} ${path}: ${(await res.text()).slice(0, 200)}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return (res.status === 204 ? {} : await res.json()) as T;
  }

  async upsertContact({ phone, name }: { phone: string; name: string | null }) {
    const found = await this.call<{ results: { id: string }[] }>("POST", "/crm/v3/objects/contacts/search", {
      filterGroups: [{ filters: [{ propertyName: "phone", operator: "EQ", value: phone }] }],
      properties: ["phone", "firstname"],
      limit: 1,
    });
    const props: Record<string, string> = { phone };
    if (name) {
      const [first, ...rest] = name.split(/\s+/);
      props.firstname = first;
      if (rest.length) props.lastname = rest.join(" ");
    }
    if (found.results[0]) {
      await this.call("PATCH", `/crm/v3/objects/contacts/${found.results[0].id}`, { properties: props });
      return { contactId: found.results[0].id };
    }
    const created = await this.call<{ id: string }>("POST", "/crm/v3/objects/contacts", { properties: props });
    return { contactId: created.id };
  }

  private dealProps(deal: Partial<DealInput>) {
    const p: Record<string, string | number | null> = { ...(deal.properties ?? {}) };
    if (deal.name) p.dealname = deal.name;
    if (deal.stage) {
      p.pipeline = "default";
      p.dealstage = STAGE_IDS[deal.stage];
    }
    if (deal.amount != null) p.amount = deal.amount;
    if (deal.lostReason) p.closed_lost_reason = deal.lostReason;
    return p;
  }

  async createDeal(contactId: string, deal: DealInput) {
    const created = await this.call<{ id: string }>("POST", "/crm/v3/objects/deals", {
      properties: this.dealProps(deal),
      associations: [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: DEAL_TO_CONTACT }] }],
    });
    return { dealId: created.id };
  }

  async updateDeal(dealId: string, deal: Partial<DealInput>) {
    await this.call("PATCH", `/crm/v3/objects/deals/${dealId}`, { properties: this.dealProps(deal) });
  }

  async addNote(dealId: string, body: string) {
    await this.call("POST", "/crm/v3/objects/notes", {
      properties: { hs_note_body: body, hs_timestamp: new Date().toISOString() },
      associations: [{ to: { id: dealId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: NOTE_TO_DEAL }] }],
    });
  }
}
