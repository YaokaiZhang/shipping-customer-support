import { shortId } from "./id";
import { detectPlace, getQuote, products } from "./pricing";
import type { Quote, VolumeLane, VolumeQuote, Zone } from "./types";

/**
 * Business volume estimate at LIST prices (G-3: no discounts in chat).
 * Reuses the single-parcel pricing engine per lane; contract pricing is prepared by sales.
 */

const ZONES: Zone[] = ["FI", "NORDIC", "EU", "WORLD"];
const ZONE_LABEL: Record<Zone, string> = { FI: "Finland", NORDIC: "Nordics", EU: "EU", WORLD: "World" };
/** Products that make sense for recurring e-commerce parcels (no letters or pallets). */
const PARCEL_PRODUCTS = ["locker", "home", "intl-eco", "express"];

export interface VolumeLaneInput {
  zone?: string;
  destination?: string;
  share?: number;
}

export interface VolumeInput {
  parcelsPerMonth: number;
  avgWeightKg?: number;
  lanes?: VolumeLaneInput[];
  productId?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function laneZone(l: VolumeLaneInput): { zone: Zone; label: string } | null {
  const place = l.destination ? detectPlace(l.destination) : null;
  const zone = ZONES.includes(l.zone as Zone) ? (l.zone as Zone) : place?.zone;
  if (!zone) return null;
  return { zone, label: l.destination?.trim() || place?.name || ZONE_LABEL[zone] };
}

/** Cheapest list-price parcel product for this zone and weight; `preferred` wins when it fits. */
function pickQuote(zone: Zone, weightKg: number, preferred?: string): Quote | null {
  const profile = { from: "Helsinki", zone, weightKg };
  if (preferred) {
    const q = getQuote(preferred, profile);
    if (q) return q;
  }
  const qs = PARCEL_PRODUCTS.map((id) => getQuote(id, profile)).filter((q): q is Quote => !!q);
  const pool = qs.length ? qs : products.map((p) => getQuote(p.id, profile)).filter((q): q is Quote => !!q);
  return pool.sort((a, b) => a.price - b.price || a.co2Kg - b.co2Kg)[0] ?? null;
}

export function volumeQuote(input: VolumeInput): VolumeQuote | { error: string } {
  const parcels = Math.round(Number(input.parcelsPerMonth));
  if (!Number.isFinite(parcels) || parcels <= 0) return { error: "Ask for the number of parcels per month." };
  const w = Number(input.avgWeightKg) > 0 ? Number(input.avgWeightKg) : 2;

  // Normalise lanes: merge by zone+label, shares accept fractions or percentages.
  const raw = (input.lanes ?? []).map((l) => ({ z: laneZone(l), share: Number(l.share) })).filter((l) => l.z);
  const given = raw.length ? raw : [{ z: { zone: "FI" as Zone, label: "Finland" }, share: 1 }];
  const shares = given.map((l) => (Number.isFinite(l.share) && l.share > 0 ? l.share : NaN));
  const known = shares.filter((x) => !Number.isNaN(x));
  const knownSum = known.reduce((a, b) => a + b, 0);
  const scale = knownSum > 1.5 ? 100 : 1; // percentages vs fractions
  const missing = shares.length - known.length;
  const leftover = Math.max(0, 1 - knownSum / scale);
  const filled = shares.map((x) => (Number.isNaN(x) ? (missing ? leftover / missing || 1 / shares.length : 0) : x / scale));
  const total = filled.reduce((a, b) => a + b, 0) || 1;

  const lanes: VolumeLane[] = [];
  for (let i = 0; i < given.length; i++) {
    const { zone, label } = given[i].z!;
    const share = filled[i] / total;
    const q = pickQuote(zone, w, input.productId);
    if (!q) continue;
    const n = Math.round(parcels * share);
    lanes.push({
      zone,
      label,
      share,
      parcelsPerMonth: n,
      productId: q.productId,
      productName: q.productName,
      listPricePerParcel: q.price,
      monthlyList: round2(q.price * n),
      co2KgPerMonth: round2(q.co2Kg * n),
      etaDays: q.etaDays,
    });
  }
  if (!lanes.length) return { error: "No parcel product fits that weight. Offer a handover for freight." };

  const monthlyListTotal = round2(lanes.reduce((a, l) => a + l.monthlyList, 0));
  const counted = lanes.reduce((a, l) => a + l.parcelsPerMonth, 0) || parcels;
  return {
    id: shortId("V"),
    parcelsPerMonth: parcels,
    avgWeightKg: w,
    lanes,
    monthlyListTotal,
    avgPerParcel: round2(monthlyListTotal / counted),
    co2KgPerMonth: round2(lanes.reduce((a, l) => a + l.co2KgPerMonth, 0)),
    currency: "EUR",
    issuedAt: Date.now(),
  };
}

/** What the model may see: no money at all. */
export function volumeForModel(v: VolumeQuote) {
  return {
    volumeQuoteId: v.id,
    parcelsPerMonth: v.parcelsPerMonth,
    avgWeightKg: v.avgWeightKg,
    lanes: v.lanes.map((l) => ({ lane: l.label, zone: l.zone, sharePct: Math.round(l.share * 100), parcelsPerMonth: l.parcelsPerMonth, recommendedProduct: l.productName })),
    co2KgPerMonth: v.co2KgPerMonth,
    prices: "list prices shown on the card only; sales prepares contract pricing",
  };
}

/** One line for the lead panel / lead volume field, e.g. "~200 parcels / month · 2 kg avg". */
export const volumeLine = (v: VolumeQuote) => `~${v.parcelsPerMonth} parcels / month · ${v.avgWeightKg} kg avg`;

/** Parse "200 parcels a month", "50 a week", "10 per day" into parcels per month. */
export function parseMonthlyVolume(text: string): number | null {
  const m = text.match(/(\d[\d\s,.]*)\s*(?:parcels|packages|shipments|orders|pakettia|paket)?\s*(?:a|per|\/|each|every)\s*(day|week|month|kuussa)/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/[\s,]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2].toLowerCase();
  return Math.round(unit === "day" ? n * 22 : unit === "week" ? n * 4.33 : n);
}
