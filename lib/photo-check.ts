import { pickNames, recommendPackaging } from "./packaging";
import { matchRestriction } from "./restrictions";
import type { DimensionEstimate, Restriction } from "./types";

/** Detected item + cues as one phrase for restriction matching, e.g. "power bank lithium battery pack". */
export const detectionText = (e: DimensionEstimate) => [e.itemLabel ?? "", ...(e.cues ?? [])].join(" ").trim();

/** Deterministic restriction check on what the photo shows (never the model's verdict). */
export function photoRestriction(e: DimensionEstimate): Restriction | null {
  const t = detectionText(e);
  return t ? matchRestriction(t) : null;
}

export const photoPackaging = (e: DimensionEstimate) =>
  e.packed === undefined ? null : recommendPackaging([e.lengthCm, e.widthCm, e.heightCm], e);

/** One customer-facing sentence about a restriction (no prices). */
export function restrictionLine(r: Restriction): string {
  const item = r.item.charAt(0).toUpperCase() + r.item.slice(1);
  switch (r.rule) {
    case "forbidden":
      return `Sorry, ${r.item} can't be shipped with NordParcel, so I can't quote this one.`;
    case "allowed_with_product":
      return `${item} can only go by ${r.productName ?? "a specific product"}: ${r.note}`;
    case "needs_declaration":
      return `${item} needs a declaration: ${r.note}`;
    default:
      return "";
  }
}

/** How a photo estimate reads to the model in later turns. No prices. */
export function photoNote(e: DimensionEstimate): string {
  const parts = [`${e.lengthCm}×${e.widthCm}×${e.heightCm} cm, ~${e.estWeightKg} kg`];
  if (e.itemLabel) {
    const flags = [e.fragile && "fragile", e.packed === true ? "already boxed" : e.packed === false ? "unpacked" : ""].filter(Boolean);
    const cues = e.cues?.length ? ` (${e.cues.join(", ")})` : "";
    parts.push(`detected: ${e.itemLabel}${cues}${flags.length ? `, ${flags.join(", ")}` : ""}`);
  }
  const r = e.restriction ?? photoRestriction(e);
  parts.push(`restriction: ${r ? `${r.item} → ${r.rule}${r.productName ? ` (${r.productName})` : ""}` : "none"}`);
  const pick = photoPackaging(e);
  if (pick) parts.push(`packaging suggested: ${pickNames(pick.ids)}`);
  return `[Photo estimate shown: ${parts.join("; ")}]`;
}
