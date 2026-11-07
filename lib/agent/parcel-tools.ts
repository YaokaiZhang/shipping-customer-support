import type Anthropic from "@anthropic-ai/sdk";
import type { RerouteOption } from "../types";
import { TRACKING_RE } from "./booking-store";
import { findTracking, OPTION_LABEL, rerouteParcel, trackingForModel } from "./tracking";
import type { TurnState } from "./tools";

/** Booking + tracking tools. Deterministic; spliced into TOOLS / runTool in tools.ts. */
export const PARCEL_TOOLS: Anthropic.Tool[] = [
  {
    name: "book_quote",
    description:
      "Show the booking form for one quote the customer wants to book. The customer fills in sender and recipient on the form and submits it; the booking, label and tracking number are created from the form, not by you.",
    input_schema: {
      type: "object",
      properties: { quoteId: { type: "string", description: "A quote id issued in this chat, e.g. Q-7F3K." } },
      required: ["quoteId"],
      additionalProperties: false,
    },
  },
  {
    name: "track_parcel",
    description:
      "Look up a parcel by tracking number (format NP + 9 digits + FI). Returns status, events, an estimated delivery window, any delay reason and which reroute options are allowed. Shows a tracking card with a timeline.",
    input_schema: {
      type: "object",
      properties: { trackingNumber: { type: "string", description: "e.g. NP220917465FI" } },
      required: ["trackingNumber"],
      additionalProperties: false,
    },
  },
  {
    name: "reroute_parcel",
    description:
      "Reroute a parcel: to a pickup point, to a new address, or hold it at the terminal. Only options listed in track_parcel's rerouteAllowed work. Shows the updated tracking card.",
    input_schema: {
      type: "object",
      properties: {
        trackingNumber: { type: "string" },
        option: { type: "string", enum: ["pickup_point", "new_address", "hold"] },
        pickupPoint: { type: "string", description: "One of pickupPointsNearby from track_parcel. Defaults to the first." },
        newAddress: { type: "string", description: "For new_address: street, postcode and city as the customer gave them." },
      },
      required: ["trackingNumber", "option"],
      additionalProperties: false,
    },
  },
];

type In = Record<string, unknown>;

/** Returns undefined when `name` is not one of these tools. */
export function runParcelTool(s: TurnState, name: string, input: In): unknown {
  const bookings = s.bookings ?? [];
  switch (name) {
    case "book_quote": {
      const id = String(input.quoteId ?? "").trim().toUpperCase();
      const q = [...s.issued, ...s.result.quotes].find((x) => x.id.toUpperCase() === id);
      if (!q) return { error: `No quote ${id} in this chat. Issue one with get_quote or compare_options first.` };
      if (Date.now() > q.validUntil) return { error: `Quote ${q.id} has expired. Issue a fresh quote.` };
      s.blocks.push({ type: "booking-form", quoteId: q.id });
      return { shownToCustomer: "booking form", quoteId: q.id, product: q.productName };
    }
    case "track_parcel": {
      const tn = String(input.trackingNumber ?? "").replace(/\s+/g, "").toUpperCase();
      if (!TRACKING_RE.test(tn)) return { error: "Tracking numbers look like NP123456789FI. Ask the customer to check it." };
      const t = findTracking(tn, bookings);
      if (!t) return { error: `No parcel found for ${tn}. Ask the customer to double-check the number.` };
      s.blocks.push({ type: "tracking", tracking: t });
      return trackingForModel(t);
    }
    case "reroute_parcel": {
      const tn = String(input.trackingNumber ?? "").replace(/\s+/g, "").toUpperCase();
      const option = String(input.option) as RerouteOption;
      if (!OPTION_LABEL[option]) return { error: "option must be pickup_point, new_address or hold." };
      const o = rerouteParcel(
        tn,
        option,
        { pickupPoint: input.pickupPoint as string | undefined, newAddress: input.newAddress as string | undefined },
        bookings,
      );
      if (!o.ok) return { error: o.error, ...(o.tracking ? { rerouteAllowed: o.tracking.rerouteOptions } : {}) };
      s.blocks.push({ type: "tracking", tracking: o.tracking });
      return { done: true, ...trackingForModel(o.tracking) };
    }
    default:
      return undefined;
  }
}
