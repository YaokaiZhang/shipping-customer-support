/**
 * Scripted stand-in for /api/chat. Returns the same TurnResult the real
 * LLM agent loop will return, so the UI can be swapped over in one place.
 * Prices still come from the real pricing engine; text still goes through the real guard.
 */
import { guardPrices } from "../guard";
import { matchOpsRule } from "../ops-rules";
import { shortId } from "../id";
import { compareOptions, detectPlace, fmtEta, standardBox } from "../pricing";
import { matchRestriction } from "../restrictions";
import { bookingMessage, bookQuote } from "../agent/booking-store";
import { lastTracked, mockParcel } from "./parcel";
import { CLAIM_RE, claimChips, findTracking, STATUS_LABEL } from "../agent/tracking";
import { lastVolume, redoVolume, volumeLine } from "../volume";
import { mockPacket, mockVolume } from "./packets";
import { packedShipment } from "../packaging";
import { photoPackaging, photoRestriction, restrictionLine } from "../photo-check";
import type {
  Block,
  Booking,
  Chip,
  DimensionEstimate,
  GuardEvent,
  Handoff,
  Message,
  OpsRule,
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
  /** Enabled operations rules (already sanitized). Honoured approximately: keyword match only. */
  opsRules?: OpsRule[];
  /** Earlier messages (reroute finds the last tracking card) and bookings (client copies). */
  history?: Message[];
  bookings?: Booking[];
}

/** Questions our guidelines don't answer → logged as knowledge gaps for the Insights tab. */
const GAPS: [RegExp, string][] = [
  [/\b(sunday|saturday|weekends?|sunnuntai\w*|lauantai\w*|viikonlop\w*|söndag|lördag|helg)\b/i, "Weekend delivery"],
  [/\bp\.?\s?o\.?\s?box(es)?\b|post office box|postbox|postilokero/i, "PO box delivery"],
  [/pick(ed)?\s?(it\s|them\s)?up from (my |our )?(home|house|door|flat|apartment|office)|home pick-?up|collect(ed)? from (my |our )?(home|house|door)|nouto kotoa|hakea kotoa/i, "Home pickup"],
];

const ev = (ruleId: string, action: GuardEvent["action"], excerpt: string): GuardEvent => ({
  id: shortId("E"),
  ruleId,
  action,
  excerpt,
  at: Date.now(),
});

const has = (t: string, re: RegExp) => re.test(t);

/** Any carrier-style parcel number (NP123456789FI and similar). */
const PARCEL_NO = /\b[A-Z]{2}\d{6,}[A-Z]{0,2}\b/i;
const CLAIM_ASK = "What's the tracking number?";

/** The customer's refund message, if the agent's last reply asked for its tracking number. */
function pendingClaim(history: Message[] = []): string | undefined {
  const a = history.at(-1);
  const u = history.at(-2);
  if (a?.role === "assistant" && a.from !== "human" && a.text?.includes(CLAIM_ASK) && u?.role === "user") return u.text ?? "";
}

const RE = {
  injection: /ignore (your|all|previous|the) (rules|instructions)|system prompt|you are now|developer mode/i,
  refund: CLAIM_RE,
  volume: /(\d+)\s*(parcels|packages|shipments|orders)\s*(a|per|\/)\s*(day|week|month)|webshop|web shop|e-?shop|online store|our (company|business|store)|we're a|we are a|per month|a month|monthly|\bbusiness\b(?! day)|\bvolume\b/i,
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
const photoChips: Chip[] = [
  { label: "Use demo photo", action: "demo-photo" },
  { label: "Upload photo", action: "upload" },
  { label: "Demo: restricted item", action: "demo-photo", imageUrl: "/demo/powerbank-a4.jpg" },
];

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
    const estimate: DimensionEstimate = !input.demo
      ? { imageUrl: input.imageUrl, lengthCm: 30, widthCm: 20, heightCm: 15, estWeightKg: 2, confidence: 0.52, referenceObjectFound: null }
      : /powerbank/.test(input.imageUrl)
        ? // Demo of a restricted item: a loose power bank on an A4 sheet.
          { imageUrl: input.imageUrl, lengthCm: 15, widthCm: 7, heightCm: 3, estWeightKg: 0.4, confidence: 0.82, referenceObjectFound: "A4 sheet",
            itemLabel: "power bank", cues: ["lithium battery pack"], fragile: false, packed: false }
        : { imageUrl: input.imageUrl, lengthCm: 16, widthCm: 16, heightCm: 31, estWeightKg: 1.4, confidence: 0.86, referenceObjectFound: "A4 sheet",
            itemLabel: "glass vase", cues: ["glass"], fragile: true, packed: false };
    // Same deterministic checks as the LLM path: restriction (G-4) and profile.
    estimate.restriction = photoRestriction(estimate);
    const res = estimate.restriction;
    if (res) r.events.push(ev("G-4", res.rule === "forbidden" ? "held" : "routed", res.item));
    if (estimate.itemLabel) r.profile.item = estimate.itemLabel;
    if (estimate.fragile) r.profile.fragile = true;
    const lines = [
      estimate.itemLabel && `Looks like a ${estimate.itemLabel}.`,
      res && restrictionLine(res),
      estimate.referenceObjectFound
        ? `Measured against the ${estimate.referenceObjectFound}.`
        : "I couldn't find a reference object, so these are rough.",
      res?.rule !== "forbidden" && photoPackaging(estimate) && "I've suggested packaging on the card; it's optional.",
      res?.rule !== "forbidden" && "Check the numbers, then I'll quote.",
    ];
    push(lines.filter(Boolean).join(" "), { blocks: [{ type: "estimate", estimate }] });
    return r;
  }

  // ── Booking form submit → label (deterministic, same as the LLM path) ──
  if (input.kind === "book") {
    const o = bookQuote(input, ctx.quotes);
    if (o.ok && !o.existing) r.bookings = [o.booking];
    r.messages.push(bookingMessage(o));
    return r;
  }

  // ── Confirmed estimate → three options ───────────────────────
  if (input.kind === "estimate") {
    const packed = packedShipment(input.dims, input.weightKg, input.packagingIds);
    r.profile = {
      ...r.profile,
      dimsCm: standardBox(packed.dims),
      weightKg: packed.weightKg,
      declaredValue: input.declaredValue,
      packagingIds: packed.items.length ? packed.items.map((p) => p.id) : undefined,
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
  if (dm) r.profile.dimsCm = [dm[1], dm[2], dm[3]].map((v) => parseFloat(v.replace(",", "."))) as [number, number, number];
  const kg = t.match(RE.kg);
  if (kg) r.profile.weightKg = parseFloat(kg[1].replace(",", "."));

  const last = issued().at(-1);

  if (has(t, RE.injection)) {
    r.events.push(ev("G-8", "held", t.slice(0, 48)));
    push("I'll stick to how NordParcel works. Prices only come from quotes. What are you sending, and where?");
    return r;
  }

  // Refunds and claims (G-5): ask once for the tracking number, then hand off with whatever the customer gave.
  const claim = pendingClaim(ctx.history);
  if (claim !== undefined || has(t, RE.refund)) {
    const tracking = (t.match(PARCEL_NO) ?? claim?.match(PARCEL_NO))?.[0]?.toUpperCase() ?? lastTracked(ctx.history);
    if (claim === undefined && !tracking) {
      push(
        `I'm sorry about that. ${CLAIM_ASK} It starts with NP and is on the label or the shipping email. If you don't have it, tell me roughly when you sent it, from where to where, and what was inside, and I'll pass it to a colleague.`,
        { chips: claimChips() },
      );
      return r;
    }
    const said = claim ?? t;
    const tr = tracking ? findTracking(tracking, ctx.bookings ?? []) : undefined;
    const lastEv = tr?.events[0];
    const scan = tr && lastEv ? `${STATUS_LABEL[tr.status]}: ${lastEv.text}, ${lastEv.location}, ${new Date(lastEv.at).toLocaleDateString("en-GB")}` : undefined;
    const h: Handoff = {
      id: shortId("H"),
      intent: "Refund / claim",
      reason: "G-5 · refunds and claims go to a human",
      details: [
        { label: "Customer said", value: said },
        { label: "Tracking", value: tracking ?? "not given" },
        ...(scan ? [{ label: "Last scan", value: scan }] : []),
        ...(claim !== undefined && !tracking ? [{ label: "Order details", value: t }] : []),
        ...(r.profile.to ? [{ label: "Route", value: `${r.profile.from} → ${r.profile.to}` }] : []),
      ],
      quoteIds: issued().map((q) => q.id),
      summary: `Customer requests a refund${tracking ? ` for ${tracking}` : ""}. No promises made in chat.`,
      createdAt: Date.now(),
      ...mockPacket(said, tracking, r.profile, issued()),
    };
    r.handoffs.push(h);
    r.events.push(ev("G-5", "handed_off", said.slice(0, 48)));
    push(
      `${claim !== undefined ? "Thank you." : "I'm sorry about that."} A colleague will take it from here with everything you've told me${tracking ? `, including ${tracking}` : ""}. Expect a reply within one business day.`,
      { blocks: [{ type: "handoff", handoffId: h.id }] },
    );
    return r;
  }

  // ── Tracking / reroute ("where's my parcel?", NP123456789FI) ──
  const parcel = mockParcel(t, ctx);
  if (parcel) {
    const ho = parcel.handover;
    if (ho) {
      const h: Handoff = {
        id: shortId("H"),
        intent: "Delivery change",
        reason: `G-5 · ${ho.reason}`,
        details: [
          { label: "Tracking", value: ho.trackingNumber },
          { label: "Requested", value: ho.request },
          { label: "New address", value: ho.newAddress ?? "not given yet" },
        ],
        quoteIds: issued().map((q) => q.id),
        summary: `Customer wants to change delivery of ${ho.trackingNumber}: ${ho.request.toLowerCase()}${ho.newAddress ? ` (${ho.newAddress})` : ""}.`,
        createdAt: Date.now(),
        ...mockPacket(t, ho.trackingNumber, r.profile, issued()),
        draftReply: `Hi, NordParcel support here. I've picked up your request for ${ho.trackingNumber}${
          ho.newAddress ? ` to go to ${ho.newAddress}` : ""
        }. I'm checking with the depot whether it can still be changed and if it adds a cost, and I'll confirm within one business day.`,
        urgency: "normal",
      };
      r.handoffs.push(h);
      r.events.push(ev("G-5", "handed_off", t.slice(0, 48)));
      push(parcel.text, { blocks: [{ type: "handoff", handoffId: h.id }] });
      return r;
    }
    push(parcel.text, parcel.extra);
    return r;
  }

  const ops = ctx.opsRules?.length ? matchOpsRule(ctx.opsRules, `${t} ${r.profile.to ?? ""}`) : null;
  let opsNote: string | null = null;
  if (ops) {
    const blocks = /\b(no|not|don't|do not|never|stop(ped)?|paused?|closed|suspend(ed)?|cancel(led)?)\b/i.test(ops.rule.text);
    r.events.push(ev(ops.rule.id, blocks ? "held" : "rephrased", t.slice(0, 48)));
    if (blocks) {
      push(`Sorry, I can't book that right now. Our operations team has a current notice: "${ops.rule.text}" (${ops.rule.id}). Anything else I can help with?`);
      return r;
    }
    opsNote = `Heads up, a current notice from our operations team: "${ops.rule.text}" (${ops.rule.id}).`;
  }

  if (opsNote) push(opsNote);

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

  // Size or weight after a volume estimate: redo the monthly estimate instead of single-parcel cards.
  const prevVol = lastVolume(ctx.history ?? []);
  if (prevVol && (dm || kg) && !has(t, RE.volume)) {
    const v = redoVolume(prevVol, r.profile);
    if (!("error" in v)) {
      const fit = v.options?.map((o) => o.productName) ?? [];
      const list = fit.length > 1 ? `${fit.slice(0, -1).join(", ")} and ${fit.at(-1)}` : fit[0];
      r.volumeUpdates = [v];
      push(
        v.dimsCm
          ? fit.length
            ? `I've updated the monthly estimate for ${v.dimsCm.join("×")} cm parcels. ${fit.length > 1 ? `They fit ${list}; the card compares them per month.` : `Only ${list} fits that size.`}`
            : "Nothing in our parcel range fits that size. A colleague can look at freight options."
          : `I've updated the monthly estimate for ${v.avgWeightKg} kg parcels. What's a typical size, so I can check which products fit?`,
        { blocks: [{ type: "volume-quote", volumeQuote: v }] },
      );
      return r;
    }
  }

  if (has(t, RE.volume)) {
    // Indicative monthly cost at LIST prices (G-3) + the sales lead with the estimate attached (G-7).
    const { v, assumed } = mockVolume(t, r.profile);
    const company = t.match(/(?:we're|we are|from)\s+([A-Z][\w&]+(?:\s[A-Z][\w&]+)*)/)?.[1] ?? "Small webshop (name pending)";
    const lanes = "error" in v ? [`FI → ${place ? place.name : "?"}`] : v.lanes.map((l) => `FI → ${l.label} (${Math.round(l.share * 100)}%)`);
    const volume = "error" in v ? "recurring" : volumeLine(v);
    const lead: SalesLead = {
      id: shortId("L"),
      company,
      volume,
      lanes,
      needs: ["Contract pricing", "Pickup from sender", lanes.some((l) => !/Finland/.test(l)) ? "Cross-border" : "Domestic"],
      summary: `E-commerce sender, ${volume}, ${lanes.join(", ")}. ${"error" in v ? "" : `List-price estimate ${v.id} shown in chat. `}No discount promised in chat.`,
      createdAt: Date.now(),
    };
    if (!("error" in v)) {
      v.leadId = lead.id;
      lead.volumeQuote = v;
    }
    r.leads.push(lead);
    r.events.push(ev("G-7", "routed", volume));
    if (has(t, RE.discount)) r.events.push(ev("G-3", "rephrased", t.match(RE.discount)![0]));
    const guesses = ("error" in v ? [] : [assumed.parcels && "volume", assumed.weight && "weight", assumed.lanes && "destinations"]).filter(
      (x): x is string => !!x,
    );
    push(
      "error" in v
        ? "That's a good fit for a business contract. I've passed your details to our sales team; they'll send an offer within one business day."
        : `Here's an indicative monthly estimate at our standard list prices. I've passed it to our sales team, who prepare contract pricing within one business day.${
            guesses.length ? ` I assumed the ${guesses.join(", ").replace(/, ([^,]*)$/, " and $1")}; tell me yours and I'll redo it.` : ""
          }`,
      {
        blocks: ["error" in v ? { type: "lead", leadId: lead.id } : { type: "volume-quote", volumeQuote: v }],
        ...(guesses.length ? { chips: [{ label: "200 parcels a month, 1.5 kg, 60% Sweden, 40% Finland" }] } : {}),
      },
    );
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
          ? `I can't guarantee a delivery day. ${last.productName} is estimated at ${fmtEta(last.etaDays)}, so booking today gives it a good chance.`
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

  const gap = GAPS.find(([re]) => re.test(t));
  if (gap) {
    r.gaps = [{ id: shortId("K"), topic: gap[1], question: t.slice(0, 160), at: Date.now() }];
    push("Good question, but our current guidelines don't cover that, so I won't guess. I've flagged it for our operations team, and a colleague can confirm if it matters for your shipment.");
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
  const pkg = r.profile.packagingIds?.length ? " Your packaging is pre-selected on each card." : "";
  push((ins ? `Three ways to send it. Since it's ${r.profile.fragile ? "fragile" : "valuable"}, I'd add insurance.` : "Three ways to send it.") + pkg, {
    blocks: [block],
  });
  return r;
}
