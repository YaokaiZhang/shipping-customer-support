/**
 * Scripted booking + tracking for the mock engine. Uses the same deterministic
 * stores as the LLM tools, so behaviour matches; only the wording is canned.
 */
import { TRACKING_RE } from "../agent/booking-store";
import { DEMO_TRACKING, findTracking, fmtWindow, OPTION_LABEL, rerouteParcel } from "../agent/tracking";
import type { Booking, Chip, Message, RerouteOption, Tracking } from "../types";

export interface ParcelCtx {
  history?: Message[];
  bookings?: Booking[];
}

export interface ParcelReply {
  text: string;
  extra: Partial<Message>;
  /** Set when the change needs a person (new address, second change). */
  handover?: { trackingNumber: string; request: string; newAddress?: string; reason: string };
}

const RE = {
  where: /where(['’]?s| is) my (parcel|package|shipment|order)|track(ing)? (my |a )?(parcel|package|shipment|number)|\btrack my\b|has my (parcel|package) (left|shipped)|missä (on )?paketti|var är mitt paket/i,
  reroute: /re-?route|redirect|pick-?up point|service point|\bhold (it|the|my|np\d)|keep it at|new address|different address/i,
  pickup: /pick-?up point|service point|locker/i,
  hold: /\bhold\b|keep it/i,
  address: /(?:new|different) address(?: is)?[:\s,]+(.{6,})$/i,
};

/** Last tracking number shown on a card in this chat. */
export function lastTracked(history: Message[] = []): string | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const blocks = history[i].blocks ?? [];
    for (let j = blocks.length - 1; j >= 0; j--) {
      const b = blocks[j];
      if (b.type === "tracking") return b.tracking.trackingNumber;
    }
  }
}

function rerouteChips(t: Tracking): Chip[] {
  const c: Chip[] = [];
  if (t.rerouteOptions.includes("pickup_point")) c.push({ label: "Reroute to a pickup point" });
  if (t.rerouteOptions.includes("hold")) c.push({ label: t.status === "held_at_pickup" ? "Hold it 7 more days" : "Hold it at the terminal" });
  return c;
}

function describe(t: Tracking): string {
  const w = fmtWindow(t);
  const est = w ? ` Delivery is ${w}; that's an estimate, not a fixed date.` : "";
  switch (t.status) {
    case "delayed":
      return `It's delayed, sorry. ${t.delayReason ?? ""}${est}${t.rerouteOptions.length ? " If it helps, I can send it to a pickup point or hold it." : ""}`;
    case "in_transit":
      return `It's on its way, last seen at ${t.events[0]?.location}.${est}`;
    case "label_created":
      return `The label is ready but we haven't received the parcel yet.${est}`;
    case "out_for_delivery":
      return "It's out for delivery today, so it can't be rerouted any more. The driver has it.";
    case "delivered":
      return `It was delivered (${t.events[0]?.text.toLowerCase()}). If something's wrong with it, tell me and I'll get a colleague on it.`;
    case "held_at_pickup":
      return `It's waiting for pickup at ${t.pickupPoint}. The code was sent by SMS. I can hold it longer or send it to a new address.`;
    case "returned":
      return `It was returned to the sender: ${t.events[1]?.text.toLowerCase() ?? "delivery failed"}. It can't be rerouted; the sender can book it again with the right address.`;
  }
}

export function mockParcel(text: string, ctx: ParcelCtx): ParcelReply | null {
  const bookings = ctx.bookings ?? [];
  const tn = text.match(TRACKING_RE)?.[0]?.toUpperCase();
  const wantsReroute = RE.reroute.test(text);

  // Reroute: needs a number in the message, or a tracking card earlier in the chat.
  const target = tn ?? (wantsReroute ? lastTracked(ctx.history) : undefined);
  if (wantsReroute && target) {
    const option: RerouteOption = RE.pickup.test(text) ? "pickup_point" : RE.hold.test(text) ? "hold" : "new_address";
    const newAddress = text.match(RE.address)?.[1]?.trim();
    const o = rerouteParcel(target, option, { newAddress }, bookings);
    if (!o.ok && o.handover)
      return {
        text: `${o.error} I've passed it on with your tracking number${newAddress ? " and the new address" : ""}; expect a reply within one business day.`,
        extra: {},
        handover: { trackingNumber: target, request: OPTION_LABEL[option], newAddress, reason: o.error },
      };
    if (!o.ok) return { text: o.error, extra: o.tracking ? { blocks: [{ type: "tracking", tracking: o.tracking }] } : {} };
    const w = fmtWindow(o.tracking);
    return {
      text: `Done: ${OPTION_LABEL[option].toLowerCase()}, ${o.tracking.reroute?.detail}.${w ? ` New window: ${w}, still an estimate.` : ""}`,
      extra: { blocks: [{ type: "tracking", tracking: o.tracking }] },
    };
  }

  if (tn) {
    const t = findTracking(tn, bookings);
    if (!t)
      return {
        text: `I can't find ${tn}. Could you check the number? It's on the label or the shipping email.`,
        extra: { chips: [{ label: `Track ${DEMO_TRACKING}` }] },
      };
    return { text: describe(t), extra: { blocks: [{ type: "tracking", tracking: t }], chips: rerouteChips(t) } };
  }

  if (RE.where.test(text)) {
    const mine = bookings.at(0)?.trackingNumber;
    return {
      text: "Happy to check. What's the tracking number? It starts with NP and ends with FI.",
      extra: { chips: [...(mine ? [{ label: `Track ${mine}` }] : []), { label: `Track ${DEMO_TRACKING}` }, { label: "Track NP557301884FI" }] },
    };
  }
  return null;
}
