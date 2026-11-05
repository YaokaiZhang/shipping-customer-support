/**
 * npm run stress-test
 * Runs every scripted adversarial turn through the real agent, checks each against its rules
 * (guard / tool call / LLM judge), prints the report and saves data/stress-results.json for the dashboard.
 */
import { writeFileSync } from "node:fs";
import testsData from "@/data/stress-tests.json";
import { runSuite } from "@/lib/agent/judge";
import { hasKey, MODEL } from "@/lib/agent/llm";
import type { StressTest } from "@/lib/types";

const tests = testsData as StressTest[];
const only = process.argv.slice(2);
const selected = only.length ? tests.filter((t) => only.includes(t.id)) : tests;

async function main() {
  if (!hasKey) {
    console.error("Set ANTHROPIC_API_KEY (or LLM_KEY) to run the suite against the real agent.");
    process.exit(1);
  }
  console.log(`Running ${selected.length} stress tests on ${MODEL}…\n`);
  const started = Date.now();
  const results = await runSuite(selected, (r) => {
    const mark = r.pass ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(`${mark} ${r.id}  ${r.input}`);
    for (const c of r.checks) console.log(`    ${c.pass ? "pass" : "FAIL"} ${c.ruleId} [${c.how}] ${c.note}`);
    console.log(`    → ${r.reply.replace(/\s+/g, " ").slice(0, 140)}`);
  });

  const passed = results.filter((r) => r.pass).length;
  const stripped = results.reduce((n, r) => n + r.guard.length, 0);
  console.log(`\n${passed}/${results.length} passed · ${stripped} guard interventions · ${((Date.now() - started) / 1000).toFixed(1)} s`);

  if (!only.length) {
    writeFileSync("data/stress-results.json", JSON.stringify({ ranAt: Date.now(), model: MODEL, results }, null, 2) + "\n");
    console.log("Saved data/stress-results.json");
  }
  process.exit(passed === results.length ? 0 : 1);
}

main();
