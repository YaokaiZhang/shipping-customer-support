import packagingJson from "@/data/packaging.json";

/** NordParcel packaging sold with a shipment. Prices live only in data/packaging.json. */
export interface PackagingProduct {
  id: string;
  name: string;
  kind: "box" | "wrap" | "kit";
  innerCm?: [number, number, number];
  outerCm?: [number, number, number];
  weightKg: number;
  price: number;
  description: string;
}

export const packaging = packagingJson as PackagingProduct[];
export const packagingById = (id: string) => packaging.find((p) => p.id === id);

/** What the photo shows, as far as packaging cares. */
export interface PackagingCues {
  itemLabel?: string;
  cues?: string[];
  fragile?: boolean;
  packed?: boolean;
}

export interface PackagingPick {
  ids: string[];
  /** e.g. "Unpacked glass vase → Padded box M + Fragile kit" */
  reason: string;
  /** e.g. "fits 31×16×16 cm with 3 cm padding" */
  detail?: string;
}

const BOXES = ["box-s", "box-m", "box-l"];
const sortDesc = (d: number[]) => [...d].sort((a, b) => b - a);
const fitsIn = (dims: number[], inner: number[], pad: number) => {
  const a = sortDesc(dims.map((v) => v + 2 * pad));
  const b = sortDesc(inner);
  return a.every((v, i) => v <= b[i]);
};

export const pickNames = (ids: string[]) =>
  ids
    .map((id) => packagingById(id)?.name)
    .filter(Boolean)
    .join(" + ");

export const pickPrice = (ids: string[]) => ids.reduce((s, id) => s + (packagingById(id)?.price ?? 0), 0);

/**
 * Deterministic packaging recommendation from the (edited) item size and the photo cues.
 * Returns null when the item is already boxed and needs nothing extra.
 */
export function recommendPackaging(dims: [number, number, number], c: PackagingCues): PackagingPick | null {
  if (dims.some((v) => !(v > 0))) return null;
  const text = [c.itemLabel ?? "", ...(c.cues ?? [])].join(" ").toLowerCase();
  const breakable = !!c.fragile || /glass|ceramic|porcelain|china|mirror|crystal/.test(text);
  const liquid = /liquid|bottle|wine|oil|juice/.test(text);
  const label = c.itemLabel?.trim() || "item";
  const pad = breakable || liquid ? 3 : 1;
  const sized = `${sortDesc(dims).join("×")} cm with ${pad} cm padding`;
  const make = (ids: string[], why: string, detail?: string): PackagingPick => ({
    ids,
    reason: `${why} → ${pickNames(ids)}`,
    detail,
  });

  if (c.packed) return breakable ? make(["fragile-kit"], `Boxed but fragile ${label}`) : null;

  const what = `Unpacked ${label}`;
  if (liquid && fitsIn(dims, packagingById("bottle")!.innerCm!, 0)) return make(["bottle"], what, `fits ${sortDesc(dims).join("×")} cm`);
  const extra = breakable ? ["fragile-kit"] : [];
  const box = BOXES.find((id) => fitsIn(dims, packagingById(id)!.innerCm!, pad));
  if (box) return make([box, ...extra], what, `fits ${sized}`);
  return make(["bubble", ...extra], `${what}, too large for our boxes`);
}

/** Size and weight to quote once the item is packed (in our box if one was chosen). */
export function packedShipment(
  dims: [number, number, number],
  itemKg: number,
  ids: string[] = [],
): { dims: [number, number, number]; weightKg: number; items: PackagingProduct[] } {
  const items = ids.map(packagingById).filter((p): p is PackagingProduct => !!p);
  const box = items.find((p) => p.outerCm);
  // Without our packaging, allow 0.4 kg for the customer's own box and filler.
  const extraKg = items.length ? items.reduce((s, p) => s + p.weightKg, 0) : 0.4;
  return { dims: box?.outerCm ?? dims, weightKg: Math.ceil((itemKg + extraKg) * 2) / 2, items };
}
