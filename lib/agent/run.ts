import type Anthropic from "@anthropic-ai/sdk";
import { guardPrices } from "../guard";
import { shortId } from "../id";
import { fmtEta } from "../pricing";
import type { Block, ChatRequest, Message, Quote, TurnResult } from "../types";
import { EFFORT, MODEL, llm, textOf } from "./llm";
import { contextNote, SYSTEM } from "./prompt";
import { resolveQuotes } from "./quote-store";
import { runTool, TOOLS, type TurnState } from "./tools";
import { estimateDimensions } from "./vision";

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
      return `[Photo estimate shown: ${b.estimate.lengthCm}×${b.estimate.widthCm}×${b.estimate.heightCm} cm, ~${b.estimate.estWeightKg} kg]`;
    case "restriction":
      return `[Restriction card: ${b.restriction.item} → ${b.restriction.rule}]`;
    case "lead":
      return `[Sales lead ${b.leadId} created]`;
    case "handoff":
      return `[Handed over to a human: ${b.handoffId}]`;
  }
}

function toParams(history: Message[], quotes: Map<string, Quote>): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of history) {
    const text =
      m.role === "user"
        ? m.text ?? (m.imageUrl ? "[sent a photo of the item]" : "")
        : [m.text, ...(m.blocks ?? []).map((b) => blockNote(b, quotes))].filter(Boolean).join("\n");
    if (text) out.push({ role: m.role, content: text });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

/** One customer turn through the real agent: tool loop, then the output guard. */
export async function runTurn(req: ChatRequest): Promise<TurnResult> {
  const issued = resolveQuotes(req.quotes);
  const s: TurnState = {
    issued,
    result: { messages: [], quotes: [], leads: [], handoffs: [], events: [], profile: { ...req.profile }, engine: "llm" },
    blocks: [],
    chips: [],
    tools: [],
  };

  // Photo → vision estimate. The customer confirms or edits it before anything is quoted.
  if (req.input.kind === "image") {
    const estimate = await estimateDimensions(req.input.imageUrl);
    const size = estimate.referenceObjectFound
      ? `Measured against the ${estimate.referenceObjectFound}.`
      : "I couldn't find a reference object, so the size is rough.";
    const weight = req.profile.weightKg
      ? `I kept the ${req.profile.weightKg} kg you gave me.`
      : "The weight is only a guess from the photo, so please put in the real one.";
    const text = `${size} ${weight} Check the numbers, then I'll quote.`;
    s.result.messages.push({ id: shortId("M", 6), role: "assistant", text, blocks: [{ type: "estimate", estimate }] });
    return s.result;
  }

  let userText: string;
  if (req.input.kind === "estimate") {
    const [l, w, h] = req.input.dims;
    runTool(s, "update_shipment", {
      lengthCm: l,
      widthCm: w,
      heightCm: h,
      weightKg: Math.ceil((req.input.weightKg + 0.4) * 2) / 2, // + packaging
      ...(req.input.declaredValue ? { declaredValue: req.input.declaredValue } : {}),
    });
    s.tools.length = 0;
    userText = `[Customer confirmed the measurements: ${l}×${w}×${h} cm, ${req.input.weightKg} kg${
      req.input.declaredValue ? `, declared value €${req.input.declaredValue}` : ""
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
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
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
