import productsJson from "@/data/products.json";
import pricesJson from "@/data/prices.json";
import { shortId } from "./id";
import { packagingById } from "./packaging";
import type { AddOn, Product, Quote, QuoteTag, ShipmentProfile, Zone } from "./types";

export const products = productsJson as Product[];
type Band = { maxKg: number } & Partial<Record<Zone, number>>;
const bands = pricesJson.bands as Record<string, Band[]>;
const addOnCfg = pricesJson.addOns;
const zoneKm = pricesJson.zoneDistanceKm as Record<Zone, number>;

const DAY = 24 * 60 * 60 * 1000;

const PLACES: [RegExp, Zone, string][] = [
  [/helsinki|espoo|vantaa|tampere|turku|oulu|jyväskylä|jyvaskyla|lahti|kuopio|rovaniemi|finland|suomi/i, "FI", "Finland"],
  [/stockholm|göteborg|gothenburg|malmö|malmo|uppsala|sweden|sverige|ruotsi|tukholma|tukholmaan|oslo|norway|bergen|copenhagen|denmark|aarhus|reykjavik|iceland/i, "NORDIC", "Nordics"],
  [/berlin|germany|paris|france|amsterdam|netherlands|tallinn|estonia|riga|vilnius|warsaw|poland|spain|madrid|rome|italy|vienna|austria|brussels|europe/i, "EU", "EU"],
  [/new york|usa|united states|london|uk|tokyo|japan|china|australia|canada|toronto|india/i, "WORLD", "World"],
];

export function detectPlace(text: string): { name: string; zone: Zone } | null {
  for (const [re, zone] of PLACES) {
    const m = text.match(re);
    if (m) {
      const raw = m[0];
      const name = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
      return { name: name.replace(/aan$/, "").replace(/^Tukholma$/, "Stockholm"), zone };
    }
  }
  return null;
}

function fits(p: Product, profile: ShipmentProfile) {
  const w = profile.weightKg ?? 1;
  if (w > p.maxWeightKg || w < (p.minWeightKg ?? 0)) return false;
  if (profile.zone && !p.zones.includes(profile.zone)) return false;
  if (profile.dimsCm) {
    const a = [...profile.dimsCm].sort((x, y) => y - x);
    const b = [...p.maxDimsCm].sort((x, y) => y - x);
    if (a.some((v, i) => v > b[i])) return false;
  }
  if (profile.fragile && p.id === "letter") return false;
  return true;
}

function basePrice(p: Product, profile: ShipmentProfile): number | null {
  const zone = profile.zone ?? "FI";
  const w = profile.weightKg ?? 1;
  const band = bands[p.id]?.find((b) => w <= b.maxKg);
  return band?.[zone] ?? null;
}

function suggestAddOns(profile: ShipmentProfile): AddOn[] {
  const value = profile.declaredValue ?? 0;
  const ins = Math.max(addOnCfg.insurance.minFee, (value * addOnCfg.insurance.percentOfValue) / 100);
  return [
    {
      id: "insurance",
      name: addOnCfg.insurance.name,
      price: round(ins),
      suggested: value > 200 || !!profile.fragile,
      reason: value > 200 ? "value > €200" : profile.fragile ? "fragile" : undefined,
    },
    { id: "fragile", name: addOnCfg.fragile.name, price: addOnCfg.fragile.fee, suggested: !!profile.fragile },
    { id: "sms", name: addOnCfg.sms.name, price: addOnCfg.sms.fee, suggested: false },
    ...packagingAddOns(profile),
  ];
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Packaging the customer selected on the photo estimate: pre-selected add-ons, priced from data/packaging.json. */
function packagingAddOns(profile: ShipmentProfile): AddOn[] {
  return (profile.packagingIds ?? []).flatMap((id) => {
    const p = packagingById(id);
    return p ? [{ id: `pkg-${p.id}`, name: p.name, price: p.price, suggested: true, reason: "packaging you chose" }] : [];
  });
}

export function getQuote(productId: string, profile: ShipmentProfile): Quote | null {
  const p = products.find((x) => x.id === productId);
  if (!p || !fits(p, profile)) return null;
  const price = basePrice(p, profile);
  if (price == null) return null;
  const now = Date.now();
  const w = profile.weightKg ?? 1;
  return {
    id: shortId("Q"),
    productId: p.id,
    productName: p.name,
    price,
    currency: "EUR",
    etaDays: profile.zone === "WORLD" && p.id !== "express" ? [p.speedDays[0] + 3, p.speedDays[1] + 4] : p.speedDays,
    co2Kg: Math.max(0.01, round(w * zoneKm[profile.zone ?? "FI"] * p.co2PerKgKm)),
    addOns: suggestAddOns(profile),
    inputs: { ...profile },
    issuedAt: now,
    validUntil: now + DAY,
    tags: [],
  };
}

/** Cheapest / fastest / greenest valid products. Returned in display order. */
export function compareOptions(profile: ShipmentProfile): Quote[] {
  const all = products.map((p) => getQuote(p.id, profile)).filter((q): q is Quote => !!q);
  if (!all.length) return [];
  const pick = (tag: QuoteTag, cmp: (a: Quote, b: Quote) => number) => {
    const q = [...all].sort(cmp)[0];
    q.tags.push(tag);
    return q;
  };
  const cheapest = pick("cheapest", (a, b) => a.price - b.price);
  const greenest = pick("greenest", (a, b) => a.co2Kg - b.co2Kg || a.price - b.price);
  const fastest = pick("fastest", (a, b) => a.etaDays[1] - b.etaDays[1] || a.price - b.price);
  return Array.from(new Set([cheapest, greenest, fastest]));
}

/** Round up to standard box sizes (cm). */
const BOXES: [number, number, number][] = [
  [25, 18, 10], [30, 20, 15], [35, 25, 20], [40, 30, 30], [50, 40, 40], [60, 40, 40], [80, 60, 60], [120, 60, 60],
];
export function standardBox(d: [number, number, number]): [number, number, number] {
  const s = [...d].sort((a, b) => b - a);
  return BOXES.find((b) => b[0] >= s[0] && b[1] >= s[1] && b[2] >= s[2]) ?? (s as [number, number, number]);
}

export const fmtPrice = (n: number) => `€${n.toFixed(2)}`;
export const fmtEta = (d: [number, number]) => (d[0] === d[1] ? `${d[0]} day${d[0] > 1 ? "s" : ""}` : `${d[0]}–${d[1]} days`);
