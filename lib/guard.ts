import { shortId } from "./id";
import type { GuardEvent, Quote } from "./types";

const AMOUNT = /(€\s?\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?\s?(?:€|eur(?:os?)?\b))/gi;

const toNumber = (s: string) => parseFloat(s.replace(/[^\d.,]/g, "").replace(",", "."));

/**
 * Output guard: every currency amount in an assistant message must match a quote
 * issued in this conversation. Anything else is stripped and logged under G-1.
 */
export function guardPrices(text: string, issued: Quote[]): { text: string; events: GuardEvent[] } {
  const allowed = new Set(issued.flatMap((q) => [q.price, ...q.addOns.map((a) => a.price)]).map((n) => n.toFixed(2)));
  const events: GuardEvent[] = [];
  const out = text.replace(AMOUNT, (m) => {
    if (allowed.has(toNumber(m).toFixed(2))) return m;
    events.push({ id: shortId("E"), ruleId: "G-1", action: "stripped", excerpt: m.trim(), at: Date.now() });
    return "▇▇▇";
  });
  return { text: out, events };
}
