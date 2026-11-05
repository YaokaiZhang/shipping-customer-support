/**
 * npm run roi
 * Classifies the past tickets with one call and reports the share the agent would have resolved.
 */
import { writeFileSync } from "node:fs";
import { hasKey, MODEL } from "@/lib/agent/llm";
import { classifyTickets, MIN_PER_TICKET, summarize, TICKETS_PER_MONTH, tickets } from "@/lib/agent/roi";

async function main() {
  if (!hasKey) {
    console.error("Set ANTHROPIC_API_KEY (or LLM_KEY).");
    process.exit(1);
  }
  const verdicts = await classifyTickets();
  verdicts.forEach((v, i) => console.log(`${v.id}  ${v.route.padEnd(5)}  ${tickets[i].message.slice(0, 70)}`));
  const s = summarize(verdicts);
  console.log(
    `\n${Math.round(s.share * 100)}% resolved without a human (${s.resolved}/${s.total}, ${s.sales} as sales leads), ${s.handovers} handovers.`,
  );
  console.log(`≈ ${s.hoursPerMonth} agent-hours / month (assumes ${MIN_PER_TICKET} min/ticket, ${TICKETS_PER_MONTH} tickets/month).`);
  console.log(`Agrees with the hand labels on ${s.agreeWithLabels}/${s.total}.`);
  writeFileSync("data/roi-results.json", JSON.stringify({ ranAt: Date.now(), model: MODEL, verdicts }, null, 2) + "\n");
  console.log("Saved data/roi-results.json");
}

main();
