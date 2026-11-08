/**
 * Scripted versions of the handoff packet and the business volume quote, for the mock engine.
 * Same deterministic pieces as the LLM path: quotesTried from turn state, guard on the draft,
 * list prices from lib/volume.ts.
 */
import { guardPrices } from "../guard";
import { detectPlace } from "../pricing";
import type { Handoff, HandoffUrgency, Quote, ShipmentProfile } from "../types";
import { parseMonthlyVolume, volumeQuote, type VolumeLaneInput } from "../volume";

/** Fills the packet fields a model would write (urgency, sentiment, draft) plus the deterministic ones. */
export function mockPacket(text: string, tracking: string | undefined, profile: ShipmentProfile, issued: Quote[]): Partial<Handoff> {
  const upset = /!{2,}|angry|furious|ridiculous|unacceptable|worst|terrible|again|still/i.test(text);
  const pressing = /urgent|asap|today|tomorrow|birthday|wedding|medicine|deadline|lost|never (came|arrived)/i.test(text);
  const urgency: HandoffUrgency = upset || pressing ? "high" : "normal";
  const what = /damaged|broken/i.test(text) ? "arrived damaged" : /lost|never (came|arrived)/i.test(text) ? "hasn't arrived" : "needs sorting out";
  const draft = [
    `Hi, NordParcel support here. I'm sorry your parcel${tracking ? ` ${tracking}` : ""} ${what}; I've picked up your case.`,
    tracking
      ? "I'm checking its scan history with our depot now and will get back to you within one business day with what I find."
      : "Could you reply with the tracking number (it's on your receipt or the confirmation email)? I'll check it with our depot and get back to you within one business day.",
    /damaged|broken/i.test(text) ? "If you can, please keep the packaging and send a photo of the damage; it helps the claim." : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    urgency,
    sentiment: upset ? "frustrated" : pressing ? "worried, polite" : "concerned, polite",
    draftReply: guardPrices(draft, []).text,
    shipment: { ...profile },
    quotesTried: issued.map((q) => ({ id: q.id, productName: q.productName })),
    status: "open",
  };
}

/** Parse "200 parcels a month to Sweden and Germany, about 1.5 kg" into a list-price volume quote. */
export function mockVolume(text: string, profile: ShipmentProfile) {
  const parcels = parseMonthlyVolume(text) ?? 200;
  const kg = text.match(/(\d+(?:[.,]\d+)?)\s?kg/i);
  const weight = kg ? parseFloat(kg[1].replace(",", ".")) : profile.weightKg ?? 2;

  // Each fragment between "and" / commas may name a destination, optionally with a percentage.
  const lanes: VolumeLaneInput[] = [];
  for (const frag of text.split(/,|;|\band\b|\bja\b|\boch\b|\//i)) {
    const place = detectPlace(frag);
    if (!place || lanes.some((l) => l.destination === place.name)) continue;
    const pct = frag.match(/(\d{1,3})\s?%/);
    lanes.push({ destination: place.name, zone: place.zone, share: pct ? Number(pct[1]) : undefined });
  }
  const assumed = !lanes.length;
  if (assumed) lanes.push({ destination: "Finland", zone: "FI", share: 1 });

  const v = volumeQuote({ parcelsPerMonth: parcels, avgWeightKg: weight, lanes, dimsCm: profile.dimsCm });
  return { v, assumed: { parcels: !parseMonthlyVolume(text), weight: !kg && !profile.weightKg, lanes: assumed } };
}
