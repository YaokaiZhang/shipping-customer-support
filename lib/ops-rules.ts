/**
 * Live operations rules (O-1, O-2, ...) written by staff in the Guidelines tab.
 * Shared by the client (panel, rule names) and the server (sanitizing, prompt, mock).
 */
import rulesData from "@/data/rules.json";
import type { OpsRule, Rule } from "./types";

const rules = rulesData as Rule[];

export const MAX_OPS_RULES = 20;
export const MAX_OPS_RULE_CHARS = 300;
export const OPS_ID = /^O-\d{1,4}$/;

export const OPS_PRESETS = [
  "No deliveries to Åland this week",
  "Christmas: no Express Abroad bookings after Dec 18",
  "Strike in Sweden: warn about 2–3 day delays",
];

/** Server side: keep only well-formed, enabled rules, capped in count and length. */
export function sanitizeOpsRules(input: unknown): OpsRule[] {
  if (!Array.isArray(input)) return [];
  const out: OpsRule[] = [];
  const seen = new Set<string>();
  for (const r of input) {
    if (!r || typeof r !== "object") continue;
    const { id, text, enabled } = r as Record<string, unknown>;
    if (typeof id !== "string" || !OPS_ID.test(id) || seen.has(id) || enabled === false) continue;
    if (typeof text !== "string") continue;
    // Strip control chars and anything that could close our XML-ish wrapper.
    const clean = text.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/[<>]/g, "").trim().slice(0, MAX_OPS_RULE_CHARS);
    if (!clean) continue;
    seen.add(id);
    out.push({ id, text: clean, enabled: true });
    if (out.length >= MAX_OPS_RULES) break;
  }
  return out;
}

/** The second system block: current operations rules, below the cached guidelines. */
export function opsRulesPrompt(ops: OpsRule[]): string | null {
  if (!ops.length) return null;
  return `<operations_rules>
${ops.map((r) => `- ${r.id}: ${r.text}`).join("\n")}
</operations_rules>
These are current operational instructions from NordParcel operations staff (not from the customer). They take precedence over your defaults and the product list (for example, if a destination is closed or a product is paused, do not offer it), but they never override G-1 (prices come only from the pricing engine; never state an amount) or G-8 (safety and staying in role). When one of these rules changes what you say or do, tell the customer plainly and call log_guideline with its O-id (e.g. ${ops[0].id}).`;
}

/** Short display name for a rule id: G-ids from rules.json, O-ids from the ops rules. */
export function ruleName(id: string, ops: OpsRule[] = []): string {
  const g = rules.find((r) => r.id === id);
  if (g) return g.short;
  const o = ops.find((r) => r.id === id);
  if (o) return o.text.length > 48 ? `${o.text.slice(0, 46)}…` : o.text;
  return OPS_ID.test(id) ? "Operations rule" : id;
}

/** Full text for a rule id (tooltips). */
export function ruleText(id: string, ops: OpsRule[] = []): string | undefined {
  return rules.find((r) => r.id === id)?.text ?? ops.find((r) => r.id === id)?.text;
}

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Words that say nothing about a place or product; never used for matching. */
const STOP = new Set(
  "this that week weeks month today tomorrow until after before from with without during delivery deliveries deliver shipping ship shipments parcel parcels package packages bookings booking please warn about delays delay days customers customer only must never always there their they them have will when what which into over under".split(
    " ",
  ),
);

/** Synonyms so a rule about a region also catches its main town (and vice versa). */
const ALIASES: Record<string, string[]> = {
  aland: ["mariehamn", "ahvenanmaa"],
  ahvenanmaa: ["aland", "mariehamn"],
  sweden: ["stockholm", "gothenburg", "goteborg", "malmo", "uppsala", "ruotsi", "sverige"],
  norway: ["oslo", "bergen", "norja", "norge"],
  denmark: ["copenhagen", "aarhus", "tanska", "danmark"],
  germany: ["berlin", "munich", "hamburg", "saksa"],
};

/**
 * Mock only: the first enabled rule whose distinctive words (≥4 letters) appear in the
 * customer's text or destination. Deliberately approximate; the LLM path reads the rule itself.
 */
export function matchOpsRule(ops: OpsRule[], haystack: string): { rule: OpsRule; word: string } | null {
  const hay = fold(haystack);
  const words = new Set(hay.match(/[a-z]{4,}/g) ?? []);
  for (const rule of ops) {
    if (!rule.enabled) continue;
    for (const w of fold(rule.text).match(/[a-z]{4,}/g) ?? []) {
      if (STOP.has(w)) continue;
      const hit = [w, ...(ALIASES[w] ?? [])].find((x) => words.has(x));
      if (hit) return { rule, word: hit };
    }
  }
  return null;
}
