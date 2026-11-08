import type Anthropic from "@anthropic-ai/sdk";
import { guardPrices } from "../guard";
import { opsRulesPrompt, sanitizeOpsRules } from "../ops-rules";
import { shortId } from "../id";
import { packedShipment, pickNames } from "../packaging";
import { photoNote, photoPackaging, photoRestriction, detectionText, restrictionLine } from "../photo-check";
import { fmtEta, standardBox } from "../pricing";
import type { Block, ChatRequest, Message, Quote, TurnResult } from "../types";
import { EFFORT, MODEL, llm, textOf } from "./llm";
import { contextNote, SYSTEM } from "./prompt";
import { resolveQuotes } from "./quote-store";
import { bookingMessage, bookQuote } from "./booking-store";
import { fmtWindow, OPTION_LABEL, STATUS_LABEL } from "./tracking";
import { runTool, TOOLS, type TurnState } from "./tools";
import { estimateDimensions } from "./vision";
import { lastVolume } from "../volume";

const MAX_STEPS = 8;

/** How earlier UI messages read to the model: text plus a note per card. */
function blockNote(b: Block, quotes: Map<string, Quote>): string {
  switch (b.type) {
    case "quotes":
      return `[Quote cards shown: ${b.quoteIds
        .map((id) => quotes.get(id))
        .filter(Boolean)
        .map((q) => `${q!.id} ${q!.productName} (${q!.tags.join("/") || "quote"}, est. ${fmtEta(q!.etaDays)})`)
        .join("; ")}]`;
    case "estimate":
      return photoNote(b.estimate);
    case "restriction":
      return `[Restriction card: ${b.restriction.item} → ${b.restriction.rule}]`;
    case "lead":
      return `[Sales lead ${b.leadId} created]`;
    case "handoff":
      return `[Handed over to a human: ${b.handoffId}]`;
    case "booking-form":
      return `[Booking form shown for ${b.quoteId}]`;
    case "label":
      return `[Booked ${b.booking.quoteId} (${b.booking.productName}) → label printed, tracking number ${b.booking.trackingNumber}, to ${b.booking.recipient.city}]`;
    case "tracking": {
      const t = b.tracking;
      return `[Tracking card ${t.trackingNumber}: ${STATUS_LABEL[t.status]}, ${t.from} → ${t.to}${t.delayReason ? `; delay: ${t.delayReason}` : ""}${
        fmtWindow(t) ? `; ${fmtWindow(t)}` : ""
      }${t.reroute ? `; ${OPTION_LABEL[t.reroute.option]}: ${t.reroute.detail}` : ""}; reroute allowed: ${t.rerouteOptions.join("/") || "none"}]`;
    }
    case "volume-quote": {
      const v = b.volumeQuote; // ids and product names only, never money
      return `[Volume estimate card ${v.id} shown at list prices: ~${v.parcelsPerMonth} parcels/month, ${v.lanes
        .map((l) => `${l.label} ${Math.round(l.share * 100)}% → ${l.productName}`)
        .join("; ")}${v.dimsCm ? `; size ${v.dimsCm.join("×")} cm fits ${v.options?.map((o) => o.productName).join(", ") || "nothing"}` : ""}${
        v.leadId ? `; sales lead ${v.leadId}` : ""
      }]`;
    }
  }
}

function toParams(history: Message[], quotes: Map<string, Quote>): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of history) {
    const text =
      m.role === "user"
        ? m.text ?? (m.imageUrl ? "[sent a photo of the item]" : "")
        : [m.from === "human" && m.text ? `[Human agent ${m.author ?? ""} wrote:] ${guardPrices(m.text, []).text}` : m.text, ...(m.blocks ?? []).map((b) => blockNote(b, quotes))].filter(Boolean).join("\n");
    if (text) out.push({ role: m.role, content: text });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

/** One customer turn through the real agent: tool loop, then the output guard. */
export async function runTurn(req: ChatRequest): Promise<TurnResult> {
  const issued = resolveQuotes(req.quotes);
  const ops = sanitizeOpsRules(req.opsRules);
  const opsText = opsRulesPrompt(ops);
  // Cached guidelines first; live ops rules after the cache breakpoint so editing them never busts the cache.
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
    ...(opsText ? [{ type: "text" as const, text: opsText }] : []),
  ];
  const s: TurnState = {
    issued,
    result: { messages: [], quotes: [], leads: [], handoffs: [], events: [], profile: { ...req.profile }, engine: "llm" },
    blocks: [],
    chips: [],
    tools: [],
    chatId: req.chatId,
    opsRuleIds: ops.map((r) => r.id),
    bookings: req.bookings ?? [],
    volume: lastVolume(req.history),
  };

  // Booking form submit → deterministic booking + label. Never goes through the model.
  if (req.input.kind === "book") {
    const o = bookQuote(req.input, issued);
    if (o.ok && !o.existing) s.result.bookings = [o.booking];
    s.result.messages.push(bookingMessage(o));
    return s.result;
  }

  // Photo → vision estimate. The customer confirms or edits it before anything is quoted.
  if (req.input.kind === "image") {
    const estimate = await estimateDimensions(req.input.imageUrl);
    // Deterministic checks on what the photo shows: restriction (G-4 event, like check_restrictions) and profile.
    estimate.restriction = photoRestriction(estimate);
    if (estimate.restriction) runTool(s, "check_restrictions", { itemDescription: detectionText(estimate) });
    if (estimate.itemLabel || estimate.fragile)
      runTool(s, "update_shipment", { ...(estimate.itemLabel ? { item: estimate.itemLabel } : {}), ...(estimate.fragile ? { fragile: true } : {}) });
    s.blocks.length = 0; // the restriction is shown on the estimate card itself
    s.tools.length = 0;
    const forbidden = estimate.restriction?.rule === "forbidden";
    const seen = estimate.itemLabel ? `Looks like ${/^[aeiou]/.test(estimate.itemLabel) ? "an" : "a"} ${estimate.itemLabel}.` : "";
    const warn = estimate.restriction ? restrictionLine(estimate.restriction) : "";
    const size = estimate.referenceObjectFound
      ? `Measured against the ${estimate.referenceObjectFound}.`
      : "I couldn't find a reference object, so the size is rough.";
    const weight = req.profile.weightKg
      ? `I kept the ${req.profile.weightKg} kg you gave me.`
      : "The weight is only a guess from the photo, so please put in the real one.";
    const pack = !forbidden && photoPackaging(estimate) ? "I've suggested packaging on the card; it's optional." : "";
    const text = forbidden
      ? [seen, warn].filter(Boolean).join(" ")
      : [seen, warn, size, weight, pack, "Check the numbers, then I'll quote."].filter(Boolean).join(" ");
    s.result.messages.push({ id: shortId("M", 6), role: "assistant", text, blocks: [{ type: "estimate", estimate }] });
    return s.result;
  }

  let userText: string;
  if (req.input.kind === "estimate") {
    const [l, w, h] = req.input.dims;
    // Our box (if chosen) sets the quoted size and weight; the packaging becomes a pre-selected add-on.
    const packed = packedShipment(req.input.dims, req.input.weightKg, req.input.packagingIds);
    // Photo sizes are rough: quote the standard box the estimate card shows.
    const box = standardBox(packed.dims);
    runTool(s, "update_shipment", {
      lengthCm: box[0],
      widthCm: box[1],
      heightCm: box[2],
      weightKg: packed.weightKg,
      ...(req.input.declaredValue ? { declaredValue: req.input.declaredValue } : {}),
    });
    const pkgIds = packed.items.map((p) => p.id);
    s.result.profile = { ...s.result.profile, packagingIds: pkgIds.length ? pkgIds : undefined };
    s.tools.length = 0;
    userText = `[Customer confirmed the measurements: ${l}×${w}×${h} cm, ${req.input.weightKg} kg${
      req.input.declaredValue ? `, declared value €${req.input.declaredValue}` : ""
    }${
      pkgIds.length ? `. Packed in NordParcel ${pickNames(pkgIds)} (pre-selected as an add-on on the quote cards)` : ""
    }. Packed size and weight are recorded.]`;
  } else {
    userText = req.input.text;
  }

  const byId = new Map(issued.map((q) => [q.id, q]));
  const messages: Anthropic.MessageParam[] = [
    ...toParams(req.history, byId),
    {
      role: "user",
      content: [
        { type: "text", text: contextNote(s.result.profile, issued.map((q) => q.id)) },
        { type: "text", text: userText },
      ],
    },
  ];

  const texts: string[] = [];
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await llm().messages.create({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: EFFORT },
      system,
      tools: TOOLS,
      messages,
    });
    if (res.stop_reason === "refusal") {
      texts.push("Sorry, I can't help with that here.");
      break;
    }
    const t = textOf(res.content);
    if (t) texts.push(t);
    const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !calls.length) break;
    messages.push({ role: "assistant", content: res.content });
    messages.push({
      role: "user",
      content: calls.map((c) => {
        try {
          return { type: "tool_result", tool_use_id: c.id, content: JSON.stringify(runTool(s, c.name, c.input as Record<string, unknown>)) };
        } catch (e) {
          return { type: "tool_result", tool_use_id: c.id, content: String(e), is_error: true };
        }
      }),
    });
  }

  // The model often drafts text alongside its tool calls and restates it at the end: keep the last word.
  const rawText = texts.at(-1) ?? "";
  const g = guardPrices(rawText, [...issued, ...s.result.quotes]);
  s.result.events.unshift(...g.events);
  const msg: Message = { id: shortId("M", 6), role: "assistant", text: g.text };
  if (s.blocks.length) msg.blocks = s.blocks;
  if (s.chips.length) msg.chips = s.chips;
  if (g.events.length) msg.guarded = ["G-1"];
  s.result.messages.push(msg);
  s.result.trace = { rawText, tools: s.tools };
  return s.result;
}
