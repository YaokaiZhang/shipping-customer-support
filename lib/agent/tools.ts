import type Anthropic from "@anthropic-ai/sdk";
import rules from "@/data/rules.json";
import { shortId } from "../id";
import { compareOptions, detectPlace, fmtEta, getQuote, products } from "../pricing";
import { guardPrices } from "../guard";
import { matchRestriction } from "../restrictions";
import { redoVolume, volumeForModel, volumeLine, volumeQuote } from "../volume";
import type { Block, Booking, Chip, GuardEvent, Handoff, HandoffUrgency, Quote, SalesLead, ShipmentProfile, TurnResult, VolumeQuote, Zone } from "../types";
import { saveQuote } from "./quote-store";
import { PARCEL_TOOLS, runParcelTool } from "./parcel-tools";

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
      "Issue quotes for the cheapest, greenest and fastest products that fit, and show them as three cards. Needs destination, weight and size. If a volume estimate was shown in this chat, it instead redoes that monthly estimate with the size: which products fit, each priced per month.",
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
    name: "volume_quote",
    description:
      "For business / volume customers: show an indicative monthly cost card at LIST prices (per lane: recommended product, parcels, CO2) and log the sales lead with these numbers attached. It creates the lead itself, so do not also call create_sales_lead. No prices are returned to you and no discount exists in chat.",
    input_schema: {
      type: "object",
      properties: {
        parcelsPerMonth: { type: "number", description: "Parcels per month (convert from per week x4.3 or per day x22)." },
        avgWeightKg: { type: "number", description: "Typical parcel weight in kg." },
        lanes: {
          type: "array",
          description: "Main destinations with their share of parcels. Omit share to split evenly.",
          items: {
            type: "object",
            properties: {
              destination: { type: "string", description: "Country or region, in English, e.g. 'Sweden'." },
              zone: { type: "string", enum: ZONES },
              share: { type: "number", description: "Share of parcels, 0-1 or percent." },
            },
            required: ["zone"],
            additionalProperties: false,
          },
        },
        productId: { type: "string", enum: products.map((p) => p.id), description: "Only if the customer wants one specific product." },
        company: { type: "string", description: "Company name, or a short description if unnamed." },
        needs: { type: "array", items: { type: "string" }, description: "e.g. 'Pickup from warehouse', 'Returns'." },
        summary: { type: "string", description: "Two sentences for the sales rep. Note that no discount was promised." },
      },
      required: ["parcelsPerMonth", "avgWeightKg", "lanes"],
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
        urgency: {
          type: "string",
          enum: ["low", "normal", "high"],
          description: "high = parcel lost/damaged with time pressure or a very upset customer; low = general question.",
        },
        sentiment: { type: "string", description: "The customer's mood in two or three words, e.g. 'frustrated, polite'." },
        draftReply: {
          type: "string",
          description:
            "A reply the human agent can send as-is: acknowledges the issue, says what happens next, promises no outcome or compensation. In the customer's language, two to four sentences, no amounts of money.",
        },
      },
      required: ["intent", "reason", "details", "summary", "urgency", "sentiment", "draftReply"],
      additionalProperties: false,
    },
  },
  {
    name: "log_guideline",
    description: "Log that you declined, redirected or softened a request because of a guideline. Feeds the compliance dashboard.",
    input_schema: {
      type: "object",
      properties: {
        ruleId: {
          type: "string",
          description: `A guideline id (${RULE_IDS.join(", ")}) or an operations rule id from <operations_rules> (O-1, O-2, ...).`,
        },
        action: { type: "string", enum: ["rephrased", "held", "routed"] },
        excerpt: { type: "string", description: "The customer's words that triggered it, max 8 words." },
      },
      required: ["ruleId", "action", "excerpt"],
      additionalProperties: false,
    },
  },
  {
    name: "log_knowledge_gap",
    description:
      "Log a customer question that the guidelines, operations rules and product list do not answer (e.g. Sunday delivery, PO boxes, pickup from home). Call it once, then answer honestly that you don't know or offer a human. Feeds the Insights report so operations can write a rule.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Short label in English, 2-4 words, e.g. 'Sunday delivery'. Reuse the same label for the same topic." },
        question: { type: "string", description: "The customer's question paraphrased in English, max 15 words." },
      },
      required: ["topic", "question"],
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
  ...PARCEL_TOOLS,
];

/** Mutable state of one turn; tools write into it. */
export interface TurnState {
  issued: Quote[]; // quotes from earlier turns
  result: TurnResult;
  blocks: Block[];
  chips: Chip[];
  tools: string[];
  /** Bookings from earlier turns (client copies); tracking looks these up. */
  bookings?: Booking[];
  /** Chat id from the request; stamped on handoffs. */
  chatId?: string;
  /** Ids of the operations rules sent with this turn; log_guideline accepts them. */
  opsRuleIds?: string[];
  /** Latest volume estimate in this chat. Once there is one, compare_options redoes it instead of issuing single-parcel cards. */
  volume?: VolumeQuote;
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

/** Shared by create_sales_lead and volume_quote: one lead + one G-7 event. */
function createLead(s: TurnState, input: In): SalesLead {
  const lead: SalesLead = {
    id: shortId("L"),
    company: String(input.company ?? "Unnamed business"),
    volume: String(input.volume ?? "recurring"),
    lanes: (input.lanes as string[]) ?? [],
    needs: (input.needs as string[]) ?? [],
    summary: String(input.summary ?? ""),
    createdAt: Date.now(),
  };
  s.result.leads.push(lead);
  addEvent(s, event("G-7", "routed", lead.volume));
  return lead;
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
      if (d.every((v) => typeof v === "number" && v > 0)) p.dimsCm = d as [number, number, number];
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
      if (s.volume) {
        // Business sender: answer per month on the estimate, not with single-parcel booking cards.
        if (!r.profile.dimsCm) return { error: "Ask the customer for: size." };
        const v = redoVolume(s.volume, r.profile);
        if ("error" in v) return v;
        if (!v.options?.length) return { error: "No parcel product fits that size on these lanes. Offer a handover for freight." };
        s.volume = v;
        (r.volumeUpdates ??= []).push(v);
        s.blocks.push({ type: "volume-quote", volumeQuote: v });
        return { ...volumeForModel(v), status: "Monthly estimate updated with the size: the card lists each product that fits, priced per month." };
      }
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
      const lead = createLead(s, input);
      s.blocks.push({ type: "lead", leadId: lead.id });
      return { leadId: lead.id, status: "Sales will send a contract offer within one business day." };
    }
    case "volume_quote": {
      const v = volumeQuote({
        parcelsPerMonth: Number(input.parcelsPerMonth),
        avgWeightKg: Number(input.avgWeightKg),
        lanes: input.lanes as { zone?: string; destination?: string; share?: number }[],
        productId: typeof input.productId === "string" ? input.productId : undefined,
        dimsCm: r.profile.dimsCm,
      });
      if ("error" in v) return v;
      // Attach to a lead logged earlier this turn, else create one (G-7) with the estimate attached.
      const lead =
        r.leads.at(-1) ??
        createLead(s, {
          ...input,
          volume: volumeLine(v),
          lanes: v.lanes.map((l) => `FI → ${l.label} (${Math.round(l.share * 100)}%)`),
          summary:
            input.summary ??
            `Business sender, ${volumeLine(v)}, lanes ${v.lanes.map((l) => l.label).join(", ")}. Indicative list-price estimate ${v.id} shown in chat; no discount promised.`,
        });
      v.leadId = lead.id;
      lead.volumeQuote = v;
      s.volume = v;
      s.blocks.push({ type: "volume-quote", volumeQuote: v });
      return { ...volumeForModel(v), leadId: lead.id, status: "Shown at list prices. Sales prepares contract pricing within one business day." };
    }
    case "handoff_to_human": {
      const tried = [...s.issued, ...r.quotes];
      // G-1 also applies to the drafted reply: the model never knows a real amount, so strip them all.
      const draft = guardPrices(String(input.draftReply ?? ""), []);
      draft.events.forEach((e) => addEvent(s, e));
      const h: Handoff = {
        id: shortId("H"),
        intent: String(input.intent ?? "Customer request"),
        reason: String(input.reason ?? ""),
        details: (input.details as { label: string; value: string }[]) ?? [],
        quoteIds: tried.map((q) => q.id),
        summary: String(input.summary ?? ""),
        createdAt: Date.now(),
        chatId: s.chatId,
        shipment: { ...r.profile },
        quotesTried: tried.map((q) => ({ id: q.id, productName: q.productName })),
        urgency: (["low", "normal", "high"] as HandoffUrgency[]).find((u) => u === input.urgency) ?? "normal",
        sentiment: typeof input.sentiment === "string" ? input.sentiment : undefined,
        draftReply: draft.text || undefined,
        status: "open",
      };
      r.handoffs.push(h);
      addEvent(s, event("G-5", "handed_off", h.intent));
      s.blocks.push({ type: "handoff", handoffId: h.id });
      return { handoffId: h.id, status: "A human agent replies within one business day." };
    }
    case "log_guideline": {
      const id = String(input.ruleId);
      if (!RULE_IDS.includes(id) && !s.opsRuleIds?.includes(id)) return { error: "Unknown rule id." };
      const action = ["rephrased", "held", "routed"].includes(String(input.action)) ? (input.action as GuardEvent["action"]) : "rephrased";
      addEvent(s, event(id, action, String(input.excerpt ?? "")));
      return { logged: true };
    }
    case "log_knowledge_gap": {
      const topic = String(input.topic ?? "").trim().slice(0, 40);
      if (!topic) return { error: "topic is required." };
      const gaps = (r.gaps ??= []);
      if (!gaps.some((g) => g.topic.toLowerCase() === topic.toLowerCase()))
        gaps.push({ id: shortId("K"), topic, question: String(input.question ?? "").trim().slice(0, 160), at: Date.now() });
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
      return runParcelTool(s, name, input) ?? { error: `Unknown tool ${name}` };
  }
}
