import testsData from "@/data/stress-tests.json";
import { runStressTest } from "@/lib/agent/judge";
import { hasKey } from "@/lib/agent/llm";
import type { StressTest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const tests = testsData as StressTest[];

/** POST { id } → one stress test through the real agent, checked against its rules. */
export async function POST(req: Request) {
  if (!hasKey) return Response.json({ error: "No API key configured." }, { status: 503 });
  const { id } = (await req.json()) as { id: string };
  const t = tests.find((x) => x.id === id);
  if (!t) return Response.json({ error: "Unknown test." }, { status: 404 });
  try {
    return Response.json(await runStressTest(t));
  } catch (e) {
    console.error("[stress-test]", e);
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
