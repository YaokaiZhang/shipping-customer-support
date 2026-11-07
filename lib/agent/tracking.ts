import parcels from "@/data/parcels.json";
import type { Booking, RerouteOption, Tracking, TrackingEvent, TrackingStatus } from "../types";
import { getBooking } from "./booking-store";

/**
 * Deterministic parcel tracking. Looks up bookings made in this demo first, then the
 * mock network data in data/parcels.json. Reroutes are kept in memory on globalThis.
 */

interface ParcelRow {
  trackingNumber: string;
  product: string;
  from: string;
  to: string;
  status: string;
  delayReason?: string;
  etaDaysFromNow?: number[];
  pickupPoint?: string;
  pickupByDaysFromNow?: number;
  events: { hoursAgo: number; location: string; text: string }[];
}

interface RerouteState {
  option: RerouteOption;
  detail: string;
  pickupPoint?: string;
  at: number;
}

const g = globalThis as unknown as { __npReroutes?: Map<string, RerouteState> };
const reroutes = (g.__npReroutes ??= new Map<string, RerouteState>());

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const day = (offsetDays: number, from = Date.now()) => {
  const d = new Date(from + offsetDays * DAY);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
};

/** A tracking number the demo user can try (the weather-delayed parcel). */
export const DEMO_TRACKING = "NP220917465FI";

const OPTIONS_BY_STATUS: Record<TrackingStatus, RerouteOption[]> = {
  label_created: ["pickup_point", "new_address", "hold"],
  in_transit: ["pickup_point", "new_address", "hold"],
  delayed: ["pickup_point", "new_address", "hold"],
  held_at_pickup: ["new_address", "hold"],
  out_for_delivery: [],
  delivered: [],
  returned: [],
};

export const STATUS_LABEL: Record<TrackingStatus, string> = {
  label_created: "Label created",
  in_transit: "In transit",
  delayed: "Delayed",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  held_at_pickup: "Waiting at pickup point",
  returned: "Returned to sender",
};

export const OPTION_LABEL: Record<RerouteOption, string> = {
  pickup_point: "Reroute to a pickup point",
  new_address: "Deliver to a new address",
  hold: "Hold at the terminal",
};

export function pickupPointsFor(city: string): string[] {
  const c = city.split(",")[0].trim() || "City";
  return [`Parcel locker, ${c} central station`, `K-Market service point, ${c} centre`, `NordParcel service point, ${c}`];
}

function fromBooking(b: Booking): Tracking {
  const label = b.createdAt;
  return {
    trackingNumber: b.trackingNumber,
    product: b.productName,
    from: b.sender.city,
    to: b.recipient.city,
    status: "label_created",
    events: [{ at: label, location: b.sender.city, text: "Label created, waiting for the parcel to be handed over" }],
    // +1 day for hand-over: the clock starts when the parcel is with us.
    estimate: { from: day(b.etaDays[0] + 1, label), to: day(b.etaDays[1] + 1, label) },
    rerouteOptions: OPTIONS_BY_STATUS.label_created,
    pickupPoints: pickupPointsFor(b.recipient.city),
    source: "booking",
  };
}

function fromRow(p: ParcelRow): Tracking {
  const now = Date.now();
  const status = p.status as TrackingStatus;
  const eta = p.etaDaysFromNow;
  return {
    trackingNumber: p.trackingNumber,
    product: p.product,
    from: p.from,
    to: p.to,
    status,
    events: p.events.map((e): TrackingEvent => ({ at: now - e.hoursAgo * HOUR, location: e.location, text: e.text })),
    estimate: eta ? { from: day(eta[0]), to: day(eta[1]) } : undefined,
    delayReason: p.delayReason,
    pickupPoint: p.pickupPoint,
    pickupBy: p.pickupByDaysFromNow !== undefined ? day(p.pickupByDaysFromNow) : undefined,
    rerouteOptions: OPTIONS_BY_STATUS[status] ?? [],
    pickupPoints: pickupPointsFor(p.to),
    source: "network",
  };
}

/** City from a free-text address: "Banegårdspladsen 7, 1570 København" → "København". */
export function cityOf(address: string): string | undefined {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return undefined;
  const last = parts[parts.length - 1]
    .replace(/^[A-Z]{1,3}-/i, "")
    .replace(/^[\d\s]+/, "")
    .trim();
  return /\p{L}/u.test(last) ? last : undefined;
}

/** Apply a stored reroute on top of the base record. */
function withReroute(t: Tracking): Tracking {
  const r = reroutes.get(t.trackingNumber);
  if (!r) return t;
  const out: Tracking = { ...t, reroute: { option: r.option, detail: r.detail, at: r.at } };
  out.events = [{ at: r.at, location: "Customer service", text: `${OPTION_LABEL[r.option]}: ${r.detail}` }, ...t.events];
  const shift = (n: number) => t.estimate && { from: t.estimate.from + n * DAY, to: t.estimate.to + n * DAY };
  if (r.option === "pickup_point") {
    out.pickupPoint = r.pickupPoint;
    out.estimate = shift(1);
  } else if (r.option === "new_address") {
    const city = cityOf(r.detail);
    const moved = !!city && city.toLowerCase() !== t.to.toLowerCase();
    out.product = "Home delivery";
    out.address = r.detail;
    if (city) {
      out.to = city;
      out.pickupPoints = pickupPointsFor(city);
    }
    out.estimate = shift(moved ? 2 : 1);
    if (t.status === "held_at_pickup") {
      out.status = "in_transit";
      out.pickupPoint = undefined;
      out.pickupBy = undefined;
      out.estimate = { from: day(1, r.at), to: day(3, r.at) };
    }
  } else if (r.option === "hold") {
    if (t.status === "held_at_pickup" && t.pickupBy) out.pickupBy = t.pickupBy + 7 * DAY;
    else out.estimate = undefined; // no window while it's held
  }
  out.rerouteOptions = OPTIONS_BY_STATUS[out.status];
  return out;
}

export function findTracking(trackingNumber: string, clientBookings: Booking[] = []): Tracking | null {
  const tn = trackingNumber.trim().toUpperCase().replace(/\s+/g, "");
  const b = getBooking(tn, clientBookings);
  if (b) return withReroute(fromBooking(b));
  const row = (parcels as ParcelRow[]).find((p) => p.trackingNumber === tn);
  return row ? withReroute(fromRow(row)) : null;
}

export type RerouteOutcome = { ok: true; tracking: Tracking } | { ok: false; error: string; tracking?: Tracking };

export function rerouteParcel(
  trackingNumber: string,
  option: RerouteOption,
  opts: { pickupPoint?: string; newAddress?: string } = {},
  clientBookings: Booking[] = [],
): RerouteOutcome {
  const t = findTracking(trackingNumber, clientBookings);
  if (!t) return { ok: false, error: `No parcel found with tracking number ${trackingNumber}.` };
  if (!OPTION_LABEL[option]) return { ok: false, error: `Unknown option ${option}.`, tracking: t };
  // Check against the base status (before any earlier reroute), so a customer can change their mind.
  const base = findBase(t.trackingNumber, clientBookings) ?? t;
  if (!OPTIONS_BY_STATUS[base.status].includes(option))
    return {
      ok: false,
      error: `${OPTION_LABEL[option]} is not possible: the parcel is ${STATUS_LABEL[base.status].toLowerCase()}.`,
      tracking: t,
    };
  let detail: string;
  let pickupPoint: string | undefined;
  if (option === "pickup_point") {
    pickupPoint = (opts.pickupPoint?.trim() || t.pickupPoints[0]) as string;
    detail = pickupPoint;
  } else if (option === "new_address") {
    if (!opts.newAddress?.trim()) return { ok: false, error: "Ask the customer for the new street address, postcode and city.", tracking: t };
    detail = opts.newAddress.trim();
  } else {
    detail =
      base.status === "held_at_pickup" ? "pickup time extended by 7 days" : "held at the nearest terminal until you release it (up to 14 days)";
  }
  reroutes.set(t.trackingNumber, { option, detail, pickupPoint, at: Date.now() });
  return { ok: true, tracking: findTracking(t.trackingNumber, clientBookings)! };
}

function findBase(tn: string, clientBookings: Booking[]): Tracking | null {
  const b = getBooking(tn, clientBookings);
  if (b) return fromBooking(b);
  const row = (parcels as ParcelRow[]).find((p) => p.trackingNumber === tn);
  return row ? fromRow(row) : null;
}

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** Human text of the estimated window. Always framed as an estimate (G-2). */
export function fmtWindow(t: Tracking): string | null {
  if (!t.estimate) return null;
  const a = fmtDay(t.estimate.from);
  const b = fmtDay(t.estimate.to);
  return a === b ? `estimated ${a}` : `estimated ${a} – ${b}`;
}

/** What the model sees from a tracking lookup: facts, plus the allowed actions. */
export function trackingForModel(t: Tracking) {
  return {
    trackingNumber: t.trackingNumber,
    status: STATUS_LABEL[t.status],
    product: t.product,
    route: `${t.from} → ${t.to}`,
    latestEvent: t.events[0] ? `${t.events[0].text} (${t.events[0].location})` : undefined,
    estimatedDelivery: fmtWindow(t) ? `${fmtWindow(t)} (an estimate, not a guarantee)` : "no estimate while held / not applicable",
    delayReason: t.delayReason,
    pickupPoint: t.pickupPoint,
    pickupBy: t.pickupBy ? fmtDay(t.pickupBy) : undefined,
    rerouteAllowed: t.rerouteOptions,
    pickupPointsNearby: t.rerouteOptions.includes("pickup_point") ? t.pickupPoints : undefined,
    reroute: t.reroute ? `${OPTION_LABEL[t.reroute.option]}: ${t.reroute.detail}` : undefined,
    shownToCustomer: "tracking card with timeline",
  };
}
