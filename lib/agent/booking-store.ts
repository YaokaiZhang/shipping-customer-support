import { shortId } from "../id";
import type { Address, Booking, Message, Quote, TurnInput } from "../types";
import { findQuote } from "./quote-store";

/**
 * Server-side booking store. A booking turns a valid quote into a label and a
 * tracking number. In-memory on globalThis, like quote-store.ts.
 */
const g = globalThis as unknown as { __npBookings?: Map<string, Booking> };
const store = (g.__npBookings ??= new Map<string, Booking>());

export const TRACKING_RE = /\bNP\d{9}FI\b/i;

/** "NP" + 9 digits + "FI". */
export function newTrackingNumber(): string {
  let n: string;
  do {
    n = "NP" + Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join("") + "FI";
  } while (store.has(n));
  return n;
}

/** Look up a booking by tracking number. The server copy wins over the client's. */
export function getBooking(trackingNumber: string, client: Booking[] = []): Booking | undefined {
  const tn = trackingNumber.toUpperCase();
  return store.get(tn) ?? client.find((b) => b.trackingNumber === tn);
}

const INSTRUCTIONS: Record<string, string> = {
  letter: "Drop it in any NordParcel mailbox or post office within 7 days. Tape the label flat on the front.",
  locker: "Drop it off at any NordParcel parcel locker within 7 days: scan the barcode at the locker screen and a door opens.",
  home: "Leave it ready at the door: a driver picks it up on the next working day between 9 and 16. Or drop it at a service point.",
  express: "Pickup is booked for the next working day before 12:00. Have the parcel packed with the label on top.",
  pallet: "Our freight team calls you within one working day to agree a pickup slot. Wrap the pallet and attach the label to two sides.",
  "intl-eco": "Drop it at any NordParcel service point within 7 days. Customs documents print with the label if needed.",
};

const clean = (a: Address): Address => ({
  name: a.name?.trim() ?? "",
  street: a.street?.trim() || undefined,
  postcode: a.postcode?.trim() || undefined,
  city: a.city?.trim() ?? "",
});

function validate(sender: Address, recipient: Address, email?: string): string | null {
  if (sender.name.length < 2 || !sender.city) return "the sender's name and city";
  if (recipient.name.length < 2) return "the recipient's name";
  if (!recipient.street || recipient.street.length < 3) return "the recipient's street address";
  if (!recipient.postcode || !/^[A-Z0-9][A-Z0-9 -]{2,9}$/i.test(recipient.postcode)) return "a valid postcode";
  if (!recipient.city) return "the recipient's city";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "a valid email address (or leave it empty)";
  return null;
}

export type BookOutcome = { ok: true; booking: Booking; existing: boolean } | { ok: false; error: string };

/**
 * Deterministic booking: the quote must exist and still be valid. Never goes through the LLM.
 * `clientQuotes` are the chat's quotes as the client holds them (the server copy wins).
 */
export function bookQuote(input: Extract<TurnInput, { kind: "book" }>, clientQuotes: Quote[]): BookOutcome {
  const quote = findQuote(input.quoteId) ?? clientQuotes.find((q) => q.id === input.quoteId);
  if (!quote) return { ok: false, error: "I can't find that quote. Let's get a fresh one first." };
  const already = [...store.values()].find((b) => b.quoteId === quote.id);
  if (already) return { ok: true, booking: already, existing: true };
  if (Date.now() > quote.validUntil)
    return { ok: false, error: `The ${quote.productName} price has expired (prices are held for 24 hours). I can issue a fresh quote.` };

  const sender = clean(input.sender);
  const recipient = clean(input.recipient);
  const email = input.email?.trim() || undefined;
  const bad = validate(sender, recipient, email);
  if (bad) return { ok: false, error: `The booking needs ${bad}.` };

  const wanted = new Set(input.addOns ?? quote.addOns.filter((a) => a.suggested).map((a) => a.id));
  const booking: Booking = {
    id: shortId("B"),
    trackingNumber: newTrackingNumber(),
    quoteId: quote.id,
    productId: quote.productId,
    productName: quote.productName,
    weightKg: quote.inputs.weightKg,
    dimsCm: quote.inputs.dimsCm,
    addOns: quote.addOns.filter((a) => wanted.has(a.id)).map((a) => a.name),
    sender,
    recipient,
    email,
    etaDays: quote.etaDays,
    instructions: INSTRUCTIONS[quote.productId] ?? "Drop it off at any NordParcel service point within 7 days.",
    createdAt: Date.now(),
  };
  store.set(booking.trackingNumber, booking);
  return { ok: true, booking, existing: false };
}

/** The assistant's line after a booking attempt. No prices, no promised dates. */
export function bookingReply(o: BookOutcome): string {
  if (!o.ok) return o.error;
  const b = o.booking;
  if (o.existing) return `That quote is already booked. Here's the label again: tracking number ${b.trackingNumber}.`;
  return `Booked. Your tracking number is ${b.trackingNumber}. Print the label below; ${b.instructions.charAt(0).toLowerCase()}${b.instructions.slice(1)}`;
}

/** The whole assistant message for a booking attempt (label card on success). Used by run.ts and the mock. */
export function bookingMessage(o: BookOutcome): Message {
  const msg: Message = { id: shortId("M", 6), role: "assistant", text: bookingReply(o) };
  if (o.ok) {
    msg.blocks = [{ type: "label", booking: o.booking }];
    msg.chips = [{ label: `Track ${o.booking.trackingNumber}` }];
  }
  return msg;
}
