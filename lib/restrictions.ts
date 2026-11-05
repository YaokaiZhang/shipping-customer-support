import restricted from "@/data/restricted-items.json";
import { products } from "./pricing";
import type { Restriction } from "./types";

/** Keyword match against restricted-items.json. Null when nothing matches. */
export function matchRestriction(text: string): Restriction | null {
  const t = text.toLowerCase();
  for (const r of restricted) {
    const k = r.keywords.find((kw) => t.includes(kw));
    if (k) {
      return {
        item: k,
        rule: r.rule as Restriction["rule"],
        productName: "productId" in r ? products.find((p) => p.id === r.productId)?.name : undefined,
        note: r.note,
      };
    }
  }
  return null;
}
