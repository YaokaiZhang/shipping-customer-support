import Anthropic from "@anthropic-ai/sdk";

/** One model and effort for every call: chat, vision, judge, ROI. */
export const MODEL = "claude-haiku-5-5";
export const EFFORT = "medium" as const;

const apiKey = process.env.ANTHROPIC_API_KEY || process.env.LLM_KEY;

export const hasKey = !!apiKey;

let client: Anthropic | null = null;
export function llm(): Anthropic {
  if (!apiKey) throw new Error("No API key: set ANTHROPIC_API_KEY (or LLM_KEY).");
  client ??= new Anthropic({ apiKey });
  return client;
}

/** Text of all text blocks in a response. */
export const textOf = (content: Anthropic.ContentBlock[]) =>
  content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

/** One structured-output call; returns the parsed JSON. */
export async function structured<T>(opts: {
  system: string;
  content: Anthropic.MessageParam["content"];
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  const res = await llm().messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 8000,
    output_config: { effort: EFFORT, format: { type: "json_schema", schema: opts.schema } },
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
  });
  if (res.stop_reason === "refusal") throw new Error("Model declined the request.");
  return JSON.parse(textOf(res.content)) as T;
}
