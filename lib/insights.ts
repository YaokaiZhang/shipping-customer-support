/** Aggregation for the Insights tab: sample history (data/insights-seed.json) merged with live session data. */
import seed from "@/data/insights-seed.json";
import type { GuardEvent, Handoff, KnowledgeGap } from "./types";

export interface GapGroup {
  topic: string;
  count: number;
  live: number;
  examples: string[];
}
export interface CountRow {
  key: string;
  count: number;
  live: number;
}

export const SEED_LABEL = seed.label;
export const SEED_CONVERSATIONS = seed.conversations;

const norm = (s: string) => s.trim().toLowerCase();

export function groupGaps(live: KnowledgeGap[], withSeed = true): GapGroup[] {
  const map = new Map<string, GapGroup>();
  if (withSeed) for (const g of seed.gaps) map.set(norm(g.topic), { topic: g.topic, count: g.count, live: 0, examples: [...g.examples] });
  for (const g of live) {
    const k = norm(g.topic);
    const cur = map.get(k) ?? { topic: g.topic, count: 0, live: 0, examples: [] };
    cur.count++;
    cur.live++;
    if (g.question && !cur.examples.includes(g.question)) cur.examples.unshift(g.question);
    map.set(k, cur);
  }
  return [...map.values()].sort((a, b) => b.live - a.live || b.count - a.count);
}

function countRows(seedRows: { key: string; count: number }[], liveKeys: string[]): CountRow[] {
  const map = new Map<string, CountRow>();
  for (const r of seedRows) map.set(norm(r.key), { key: r.key, count: r.count, live: 0 });
  for (const key of liveKeys) {
    const k = norm(key);
    const cur = map.get(k) ?? { key, count: 0, live: 0 };
    cur.count++;
    cur.live++;
    map.set(k, cur);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export const groupHandoffs = (live: Handoff[], withSeed = true) =>
  countRows(withSeed ? seed.handoffs.map((h) => ({ key: h.intent, count: h.count })) : [], live.map((h) => h.intent));

export const groupRuleHits = (live: GuardEvent[], withSeed = true) =>
  countRows(withSeed ? seed.ruleHits.map((h) => ({ key: h.ruleId, count: h.count })) : [], live.map((e) => e.ruleId));

/** Starting text for an ops rule drafted from a gap group; staff finish the sentence. */
export const draftFromGap = (g: GapGroup) => `${g.topic}: `;
