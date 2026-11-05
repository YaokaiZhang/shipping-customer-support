import type Anthropic from "@anthropic-ai/sdk";
import rules from "@/data/rules.json";
import { shortId } from "../id";
import { compareOptions, detectPlace, fmtEta, getQuote, products, standardBox } from "../pricing";
import { matchRestriction } from "../restrictions";
import type { Block, Chip, GuardEvent, Quote, ShipmentProfile, TurnResult, Zone } from "../types";
import { saveQuote } from "./quote-store";

const ZONES: Zone[] = ["FI", "NORDIC", "EU", "WORLD"];
const RULE_IDS = rules.map((r) => r.id);

/** Deterministic TypeScript tools. The model only ever sees quote ids, never prices. */
export const TOOLS: Anthropic.Tool[] = [
  {
    name: "update_shipment",
    description:
      "Record what you learned about the shipment. Send only the fields you learned; omit the rest. Dimensions are rounded up to a standard box.",
    input_schema: {
      type: "object",
      properties: {
        item: { type: "string", description: "What is being sent, one or two words, e.g. 'vase'." },
        to: { type: "string", description: "Destination city or country, in English." },
        zone: { type: "string", enum: ZONES, description: "Zone of the destination. FI = Finland, NORDIC = SE/NO/DK/IS, EU, WORLD." },
        weightKg: { type: "number" },
        lengthCm: { type: "number" },
        widthCm: { type: "number" },
        heightCm: { type: "number" },
        fragile: { type: "boolean" },
        declaredValue: { type: "number", description: "Declared value in euros, if the customer said it." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "search_products",
    description: "List the NordParcel products that fit the current shipment (size, weight, zone). No prices.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_quote",
    description: "Issue a binding quote for one product and show it to the customer as a quote card. Needs destination and weight.",
    input_schema: {
      type: "object",
      properties: { productId: { type: "string", enum: products.map((p) => p.id) } },
      required: ["productId"],
      additionalProperties: false,
    },
  },
  {
    name: "compare_options",
    description:
      "Issue quotes for the cheapest, greenest and fastest products that fit, and show them as three cards. Needs destination, weight and size.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "check_restrictions",
    description: "Check whether an item is forbidden, allowed only with a specific product, or needs a declaration. Shows the result to the customer.",
    input_schema: {
      type: "object",
      properties: { itemDescription: { type: "string" } },
      required: ["itemDescription"],
      additionalProperties: false,
    },
  },
  {
    name: "create_sales_lead",
    description: "Log a business customer for the sales team (volume or recurring shipping). Shown in the Sales leads panel.",
    input_schema: {
      type: "object",
      properties: {
        company: { type: "string", description: "Company name, or a short description if unnamed." },
        volume: { type: "string", description: "Estimated volume, e.g. '~50 parcels / week'." },
        lanes: { type: "array", items: { type: "string" }, description: "Lanes, e.g. 'FI → Sweden'." },
        needs: { type: "array", items: { type: "string" } },
        summary: { type: "string", description: "Two sentences for the sales rep. Note that no discount was promised." },
      },
      required: ["company", "volume", "lanes", "needs", "summary"],
      additionalProperties: false,
    },
  },
  {
    name: "handoff_to_human",
    description:
      "Hand the conversation to a human agent with a structured summary so they never re-ask. Required for refunds, claims, lost or damaged parcels.",
    input_schema: {
      type: "object",
      properties: {
        intent: { type: "string", description: "Short label, e.g. 'Refund / claim'." },
        reason: { type: "string", description: "Why a human is needed, citing the guideline." },
        details: {
          type: "array",
          items: {
            type: "object",
            properties: { label: { type: "string" }, value: { type: "string" } },
            required: ["label", "value"],
            additionalProperties: false,
          },
          description: "Facts gathered: tracking number, what happened, route, etc.",
        },
        summary: { type: "string", description: "One or two sentences for the human agent." },
      },
      required: ["intent", "reason", "details", "summary"],
      additionalProperties: false,
    },
  },
  {
    name: "log_guideline",
    description: "Log that you declined, redirected or softened a request because of a guideline. Feeds the compliance dashboard.",
    input_schema: {
      type: "object",
      properties: {
        ruleId: { type: "string", enum: RULE_IDS },
        action: { type: "string", enum: ["rephrased", "held", "routed"] },
        excerpt: { type: "string", description: "The customer's words that triggered it, max 8 words." },
      },
      required: ["ruleId", "action", "excerpt"],
      additionalProperties: false,
    },
  },
  {
    name: "suggest_replies",
    description: "Show tap-to-answer chips under your reply.",
    input_schema: {
      type: "object",
      properties: {
        replies: { type: "array", items: { type: "string" }, description: "Up to three short replies, in the customer's language." },
        offerPhoto: { type: "boolean", description: "Add 'use demo photo' and 'upload photo' chips for measuring the parcel." },
      },
      required: ["replies"],
      additionalProperties: false,
    },
  },
];

/** Mutable state of one turn; tools write into it. */
export interface TurnState {
  issued: Quote[]; // quotes from earlier turns
  result: TurnResult;
  blocks: Block[];
  chips: Chip[];
  tools: string[];
}

const event = (ruleId: string, action: GuardEvent["action"], excerpt: string): GuardEvent => ({
  id: shortId("E"),
  ruleId,
  action,
  excerpt: excerpt.slice(0, 60),
  at: Date.now(),
});

function addEvent(s: TurnState, e: GuardEvent) {
  if (!s.result.events.some((x) => x.ruleId === e.ruleId && x.action === e.action)) s.result.events.push(e);
}

const missing = (p: ShipmentProfile, needSize: boolean) =>
  [!p.to && "destination", !p.weightKg && "weight", needSize && !p.dimsCm && "size"].filter(Boolean) as string[];

/** What the model learns about a quote: everything except money. */
const forModel = (q: Quote) => ({
  quoteId: q.id,
  product: q.productName,
  estimatedDelivery: fmtEta(q.etaDays),
  co2Kg: q.co2Kg,
  tags: q.tags,
  suggestedAddOns: q.addOns.filter((a) => a.suggested).map((a) => a.name),
  price: "shown on the card",
});

type In = Record<string, unknown>;

export function runTool(s: TurnState, name: string, input: In): unknown {
  s.tools.push(name);
  const r = s.result;
  switch (name) {
    case "update_shipment": {
      const p: ShipmentProfile = { ...r.profile };
      if (typeof input.item === "string") p.item = input.item.toLowerCase();
      if (typeof input.to === "string") {
        const place = detectPlace(input.to);
        p.to = input.to;
        p.zone = (ZONES.includes(input.zone as Zone) ? (input.zone as Zone) : undefined) ?? place?.zone ?? p.zone;
      }
      if (typeof input.weightKg === "number" && input.weightKg > 0) p.weightKg = input.weightKg;
      const d = [input.lengthCm, input.widthCm, input.heightCm];
      if (d.every((v) => typeof v === "number" && v > 0)) p.dimsCm = standardBox(d as [number, number, number]);
      if (typeof input.fragile === "boolean") p.fragile = input.fragile;
      if (typeof input.declaredValue === "number") p.declaredValue = input.declaredValue;
      r.profile = p;
      return { profile: p, stillMissing: missing(p, true) };
    }
    case "search_products": {
      const fit = products.filter((p) => getQuote(p.id, r.profile));
      return fit.map((p) => ({ id: p.id, name: p.name, description: p.description, estimatedDays: p.speedDays }));
    }
    case "get_quote": {
      const m = missing(r.profile, false);
      if (m.length) return { error: `Ask the customer for: ${m.join(", ")}.` };
      const q = getQuote(String(input.productId), r.profile);
      if (!q) return { error: "That product does not fit this shipment. Try compare_options." };
      saveQuote(q);
      r.quotes.push(q);
      s.blocks.push({ type: "quotes", quoteIds: [q.id] });
      return forModel(q);
    }
    case "compare_options": {
      const m = missing(r.profile, true);
      if (m.length) return { error: `Ask the customer for: ${m.join(", ")}.` };
      const qs = compareOptions(r.profile);
      if (!qs.length) return { error: "No product fits this size and route. Offer a handover for freight." };
      qs.forEach(saveQuote);
      r.quotes.push(...qs);
      s.blocks.push({ type: "quotes", quoteIds: qs.map((q) => q.id), highlight: qs[Math.floor((qs.length - 1) / 2)].id });
      return { shownToCustomer: qs.map(forModel) };
    }
    case "check_restrictions": {
      const desc = String(input.itemDescription ?? "");
      const res = matchRestriction(desc);
      if (!res) return { rule: "ok", note: "No restriction applies." };
      addEvent(s, event("G-4", res.rule === "forbidden" ? "held" : "routed", desc));
      s.blocks.push({ type: "restriction", restriction: res });
      return res;
    }
    case "create_sales_lead": {
      const lead = {
        id: shortId("L"),
        company: String(input.company ?? "Unnamed business"),
        volume: String(input.volume ?? "recurring"),
        lanes: (input.lanes as string[]) ?? [],
        needs: (input.needs as string[]) ?? [],
        summary: String(input.summary ?? ""),
        createdAt: Date.now(),
      };
      r.leads.push(lead);
      addEvent(s, event("G-7", "routed", lead.volume));
      s.blocks.push({ type: "lead", leadId: lead.id });
      return { leadId: lead.id, status: "Sales will send a contract offer within one business day." };
    }
    case "handoff_to_human": {
      const h = {
        id: shortId("H"),
        intent: String(input.intent ?? "Customer request"),
        reason: String(input.reason ?? ""),
        details: (input.details as { label: string; value: string }[]) ?? [],
        quoteIds: [...s.issued, ...r.quotes].map((q) => q.id),
        summary: String(input.summary ?? ""),
        createdAt: Date.now(),
      };
      r.handoffs.push(h);
      addEvent(s, event("G-5", "handed_off", h.intent));
      s.blocks.push({ type: "handoff", handoffId: h.id });
      return { handoffId: h.id, status: "A human agent replies within one business day." };
    }
    case "log_guideline": {
      const id = String(input.ruleId);
      if (!RULE_IDS.includes(id)) return { error: "Unknown rule id." };
      const action = ["rephrased", "held", "routed"].includes(String(input.action)) ? (input.action as GuardEvent["action"]) : "rephrased";
      addEvent(s, event(id, action, String(input.excerpt ?? "")));
      return { logged: true };
    }
    case "suggest_replies": {
      const replies = ((input.replies as string[]) ?? []).slice(0, input.offerPhoto ? 1 : 3).map((label) => ({ label }));
      s.chips = [
        ...(input.offerPhoto ? [{ label: "Use demo photo", action: "demo-photo" as const }, { label: "Upload photo", action: "upload" as const }] : []),
        ...replies,
      ];
      return { shown: true };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}
