import { hasKey } from "@/lib/agent/llm";
import { runTurn } from "@/lib/agent/run";
import { mockTurn } from "@/lib/mock/agent";
import { sanitizeOpsRules } from "@/lib/ops-rules";
import type { ChatRequest, TurnResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json()) as ChatRequest;
  const useMock = !hasKey || process.env.NORDPARCEL_AGENT === "mock";
  let result: TurnResult;
  try {
    result = useMock ? await mockTurn({ profile: body.profile, quotes: body.quotes, opsRules: sanitizeOpsRules(body.opsRules), history: body.history, bookings: body.bookings }, body.input) : await runTurn(body);
  } catch (e) {
    // Keep the demo alive: fall back to the scripted agent and say so in the server log.
    console.error("[chat] LLM turn failed, using the scripted agent:", e);
    result = await mockTurn({ profile: body.profile, quotes: body.quotes, opsRules: sanitizeOpsRules(body.opsRules), history: body.history, bookings: body.bookings }, body.input);
  }
  delete result.trace;
  return Response.json(result);
}
