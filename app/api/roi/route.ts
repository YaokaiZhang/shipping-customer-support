import { hasKey } from "@/lib/agent/llm";
import { classifyTickets } from "@/lib/agent/roi";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST → one classify-only call over all past tickets. */
export async function POST() {
  if (!hasKey) return Response.json({ error: "No API key configured." }, { status: 503 });
  try {
    return Response.json({ verdicts: await classifyTickets() });
  } catch (e) {
    console.error("[roi]", e);
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
