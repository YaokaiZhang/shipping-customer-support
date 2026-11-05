/**
 * Scripted stand-in for /api/chat. Returns the same TurnResult the real
 * LLM agent loop will return, so the UI can be swapped over in one place.
 * Prices still come from the real pricing engine; text still goes through the real guard.
 */
import { guardPrices } from "../guard";
import { shortId } from "../id";
import { compareOptions, detectPlace, fmtEta, standardBox } from "../pricing";
import { matchRestriction } from "../restrictions";
import type {
  Block,
  Chip,
  DimensionEstimate,
  GuardEvent,
  Handoff,
  Message,
  Quote,
  SalesLead,
  ShipmentProfile,
  TurnInput,
  TurnResult,
} from "../types";

export type { TurnInput, TurnResult };

export interface TurnContext {
  profile: ShipmentProfile;
  quotes: Quote[]; // issued in this conversation
}

const ev = (ruleId: string, action: GuardEvent["action"], excerpt: string): GuardEvent => ({
  id: shortId("E"),
  ruleId,
  action,
  excerpt,
  at: Date.now(),
});

const has = (t: string, re: RegExp) => re.test(t);

const RE = {
  injection: /ignore (your|all|previous|the) (rules|instructions)|system prompt|you are now|developer mode/i,
  refund: /refund|money back|claim|compensation|never (came|arrived)|lost|arrived broken|damaged/i,
  volume: /(\d+)\s*(parcels|packages|shipments|orders)\s*(a|per|\/)\s*(day|week|month)|webshop|web shop|our (company|business|store)|we're a|we are a/i,
  guarantee: /guarantee|promise|for sure|definitely arrive|arrive(s)? (by|on|before)/i,
  discount: /discount|\d+\s?% off|% discount|cheaper price|coupon|deal/i,
  competitor: /competitor|other carrier|match (it|their|the price)/i,
  fragile: /vase|glass|ceramic|porcelain|fragile|mirror|china/i,
  ship: /send|ship|post|mail|parcel|package|gift|vase|box/i,
  dims: /(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)/,
  kg: /(\d+(?:[.,]\d+)?)\s?kg/i,
  priceAsk: /how much|price|cost|ballpark|roughly|halvin|total/i,
  item: /\b(vase|lamp|book|books|laptop|shoes|painting|plant|guitar|camera|clothes|cake)\b/i,
};

function say(text: string, issued: Quote[], extra: Partial<Message> = {}) {
  const g = guardPrices(text, issued);
  const msg: Message = { id: shortId("M", 6), role: "assistant", text: g.text, ...extra };
  if (g.events.length) msg.guarded = g.events.map((e) => e.ruleId);
  return { msg, events: g.events };
}

const destinationChips: Chip[] = [{ label: "Tampere" }, { label: "Stockholm" }, { label: "Berlin" }];
const photoChips: Chip[] = [{ label: "Use demo photo", action: "demo-photo" }, { label: "Upload photo", action: "upload" }];

export async function mockTurn(ctx: TurnContext, input: TurnInput): Promise<TurnResult> {
  const r: TurnResult = { messages: [], quotes: [], leads: [], handoffs: [], events: [], profile: { ...ctx.profile }, engine: "mock" };
  const issued = () => [...ctx.quotes, ...r.quotes];
  const push = (text: string, extra?: Partial<Message>) => {
    const { msg, events } = say(text, issued(), extra);
    r.messages.push(msg);
    r.events.push(...events);
  };

  // ── Photo → dimension estimate ───────────────────────────────
  if (input.kind === "image") {
    const estimate: DimensionEstimate = input.demo
      ? { imageUrl: input.imageUrl, lengthCm: 16, widthCm: 16, heightCm: 31, estWeightKg: 1.4, confidence: 0.86, referenceObjectFound: "A4 sheet" }
      : { imageUrl: input.imageUrl, lengthCm: 30, widthCm: 20, heightCm: 15, estWeightKg: 2, confidence: 0.52, referenceObjectFound: null };
    push(
      estimate.referenceObjectFound
        ? `Measured against the ${estimate.referenceObjectFound}. Check the numbers, then I'll quote.`
        : "I couldn't find a reference object, so these are rough. Please check them.",
      { blocks: [{ type: "estimate", estimate }] },
    );
    return r;
  }

  // ── Confirmed estimate → three options ───────────────────────
  if (input.kind === "estimate") {
    const packed = standardBox(input.dims);
    r.profile = {
      ...r.profile,
      dimsCm: packed,
      weightKg: Math.ceil((input.weightKg + 0.4) * 2) / 2,
      declaredValue: input.declaredValue,
    };
    return quoteNow(r, push);
  }

  // ── Text ─────────────────────────────────────────────────────
  const t = input.text;
  const place = detectPlace(t);
  if (place) r.profile = { ...r.profile, to: place.name, zone: place.zone };
  const item = t.match(RE.item)?.[1];
  if (item) r.profile.item = item.toLowerCase();
  if (has(t, RE.fragile)) r.profile.fragile = true;
  const dm = t.match(RE.dims);
  if (dm) r.profile.dimsCm = standardBox([dm[1], dm[2], dm[3]].map((v) => parseFloat(v.replace(",", "."))) as [number, number, number]);
  const kg = t.match(RE.kg);
  if (kg) r.profile.weightKg = parseFloat(kg[1].replace(",", "."));

  const last = issued().at(-1);

  if (has(t, RE.injection)) {
    r.events.push(ev("G-8", "held", t.slice(0, 48)));
    push("I'll stick to how NordParcel works. Prices only come from quotes. What are you sending, and where?");
    return r;
  }

  if (has(t, RE.refund)) {
    const tracking = t.match(/\b[A-Z]{2}\d{6,}[A-Z]{0,2}\b/)?.[0];
    const h: Handoff = {
      id: shortId("H"),
      intent: "Refund / claim",
      reason: "G-5 · refunds and claims go to a human",
      details: [
        { label: "Customer said", value: t },
        { label: "Tracking", value: tracking ?? "not given" },
        ...(r.profile.to ? [{ label: "Route", value: `${r.profile.from} → ${r.profile.to}` }] : []),
      ],
      quoteIds: issued().map((q) => q.id),
      summary: `Customer requests a refund${tracking ? ` for ${tracking}` : ""}. No promises made in chat.`,
      createdAt: Date.now(),
    };
    r.handoffs.push(h);
    r.events.push(ev("G-5", "handed_off", t.slice(0, 48)));
    push("I'm sorry about that. A colleague will take it from here, with everything you've told me so far. Expect a reply within one business day.", {
      blocks: [{ type: "handoff", handoffId: h.id }],
    });
    return r;
  }

  const restriction = matchRestriction(t);
  if (restriction) {
    r.events.push(ev("G-4", restriction.rule === "forbidden" ? "held" : "routed", restriction.item));
    const text =
      restriction.rule === "forbidden"
        ? `Sorry, ${restriction.item} can't be shipped with NordParcel.`
        : restriction.rule === "allowed_with_product"
          ? `That works, with conditions. It has to go by ${restriction.productName}.`
          : "That's possible, but it needs a declaration.";
    push(text, { blocks: [{ type: "restriction", restriction }] });
    return r;
  }

  if (has(t, RE.volume)) {
    const vol = t.match(/(\d+)\s*(parcels|packages|shipments|orders)\s*(a|per|\/)\s*(day|week|month)/i);
    const volume = vol?.[1] ? `~${vol[1]} ${vol[2]} / ${vol[4]}` : "recurring";
    const lanes = [`FI → ${place ? place.name : "?"}`];
    const company = t.match(/(?:we're|we are|from)\s+([A-Z][\w&]+(?:\s[A-Z][\w&]+)*)/)?.[1] ?? "Small webshop (name pending)";
    const lead: SalesLead = {
      id: shortId("L"),
      company,
      volume,
      lanes,
      needs: ["Contract pricing", "Pickup from sender", place?.zone === "NORDIC" ? "Cross-border Nordics" : "Domestic"],
      summary: `E-commerce sender, ${volume}, mainly ${lanes[0]}. Interested in recurring shipping; asked about terms. No discount promised in chat.`,
      createdAt: Date.now(),
    };
    r.leads.push(lead);
    r.events.push(ev("G-7", "routed", volume));
    if (has(t, RE.discount)) r.events.push(ev("G-3", "rephrased", t.match(RE.discount)![0]));
    push("That's a good fit for a business contract. I've passed your details to our sales team; they'll send an offer within one business day. Until then, chat quotes are at list rates.", {
      blocks: [{ type: "lead", leadId: lead.id }],
    });
    return r;
  }

  if (has(t, RE.competitor)) {
    r.events.push(ev("G-6", "rephrased", t.match(RE.competitor)![0]));
    // Simulates a model slip: an invented amount. The guard strips it before it reaches the customer.
    push("I can't match other carriers' prices, but our Parcel Locker starts from €4.90 and it's often the best value.");
    return r;
  }

  if (has(t, RE.guarantee) || has(t, RE.discount)) {
    const lines: string[] = [];
    if (has(t, RE.guarantee)) {
      r.events.push(ev("G-2", "rephrased", t.match(RE.guarantee)![0]));
      lines.push(
        last
          ? `I can't guarantee a delivery day. ${last.id} is estimated at ${fmtEta(last.etaDays)}, so booking today gives it a good chance.`
          : "I can't guarantee a delivery day; all times are estimates.",
      );
    }
    if (has(t, RE.discount)) {
      r.events.push(ev("G-3", "rephrased", t.match(RE.discount)![0]));
      lines.push("Discounts aren't available in chat. If you ship regularly, I can connect you with our sales team.");
    }
    push(lines.join(" "));
    return r;
  }

  if (has(t, RE.ship) || place || item || has(t, RE.priceAsk) || dm || kg) {
    if (!r.profile.to) {
      push(r.profile.item ? `Lovely. Where is the ${r.profile.item} going?` : "Happy to help. Where is it going?", { chips: destinationChips });
      return r;
    }
    if (!r.profile.dimsCm || !r.profile.weightKg) {
      push(
        `${r.profile.to}, got it. Snap a photo next to an A4 sheet or a bank card and I'll measure it.`,
        { chips: [...photoChips, { label: "30×20×15 cm, 2 kg" }] },
      );
      return r;
    }
    return quoteNow(r, push);
  }

  push("Tell me what you're sending and where, and I'll find the right option.", {
    chips: [{ label: "Send a vase to Tampere" }, { label: "Ship a laptop" }, { label: "We ship 50 parcels a week" }],
  });
  return r;
}

function quoteNow(r: TurnResult, push: (text: string, extra?: Partial<Message>) => void): TurnResult {
  const quotes = compareOptions(r.profile);
  if (!quotes.length) {
    push("Nothing in our range fits that size and route. A colleague can look at freight options.");
    return r;
  }
  r.quotes.push(...quotes);
  const block: Block = { type: "quotes", quoteIds: quotes.map((q) => q.id), highlight: quotes[Math.floor((quotes.length - 1) / 2)].id };
  const ins = quotes[0].addOns.find((a) => a.id === "insurance" && a.suggested);
  push(ins ? `Three ways to send it. Since it's ${r.profile.fragile ? "fragile" : "valuable"}, I'd add insurance.` : "Three ways to send it.", {
    blocks: [block],
  });
  return r;
}
