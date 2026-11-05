import ticketsData from "@/data/tickets.json";
import type { RoiVerdict } from "../types";
import { structured } from "./llm";

export interface Ticket {
  id: string;
  message: string;
  category: string;
  resolvableByPolicy: boolean;
  language: string;
}
export const tickets = ticketsData as Ticket[];

const SYSTEM = `You triage past customer-service tickets for NordParcel, a parcel carrier, to estimate how many an AI agent could have closed alone.
The agent can: answer product and policy questions, give instant quotes (destination + size/weight, from a photo too), compare options, check restricted items, and log business customers as sales leads.
The agent must hand over to a human for: refunds, claims, lost or damaged parcels, complaints needing investigation, changes to an existing shipment it cannot see (address change, redelivery, customs holds), and anything needing account access.
For each ticket choose route:
- "agent": the agent resolves it fully in chat.
- "sales": a business/volume enquiry; the agent logs a lead and the conversation is done (counts as resolved without a human agent).
- "human": needs a human agent.`;

const SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          route: { type: "string", enum: ["agent", "human", "sales"] },
          reason: { type: "string", description: "Max 10 words." },
        },
        required: ["id", "route", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["verdicts"],
  additionalProperties: false,
};

/** One classify-only call over all past tickets. */
export async function classifyTickets(list: Ticket[] = tickets): Promise<RoiVerdict[]> {
  const body = list.map((t) => `<ticket id="${t.id}">${t.message}</ticket>`).join("\n");
  const { verdicts } = await structured<{ verdicts: RoiVerdict[] }>({
    system: SYSTEM,
    schema: SCHEMA,
    maxTokens: 16000,
    content: `Classify every ticket, in order.\n${body}`,
  });
  const byId = new Map(verdicts.map((v) => [v.id, v]));
  return list.map((t) => byId.get(t.id) ?? { id: t.id, route: "human", reason: "not classified" });
}

export const MIN_PER_TICKET = 6;
export const TICKETS_PER_MONTH = 1200;

export function summarize(verdicts: RoiVerdict[], list: Ticket[] = tickets) {
  const resolved = verdicts.filter((v) => v.route !== "human").length;
  const agree = verdicts.filter((v, i) => (v.route !== "human") === list[i].resolvableByPolicy).length;
  const share = verdicts.length ? resolved / verdicts.length : 0;
  return {
    total: verdicts.length,
    resolved,
    handovers: verdicts.length - resolved,
    sales: verdicts.filter((v) => v.route === "sales").length,
    share,
    agreeWithLabels: agree,
    hoursPerMonth: Math.round((share * TICKETS_PER_MONTH * MIN_PER_TICKET) / 60),
  };
}
