"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { Address, Quote } from "@/lib/types";

/** Inline booking form. Submits a `book` turn; the server books deterministically and returns the label. */
export function BookingForm({
  quote,
  addOns,
  onCancel,
  onSent,
}: {
  quote: Quote;
  /** Selected add-on ids from the quote card; defaults to the suggested ones on the server. */
  addOns?: string[];
  onCancel?: () => void;
  onSent?: () => void;
}) {
  const { send, busy } = useStore();
  const [v, setV] = useState({
    senderName: "",
    senderStreet: "",
    senderPostcode: "",
    senderCity: quote.inputs.from || "Helsinki",
    name: "",
    street: "",
    postcode: "",
    city: quote.inputs.to ?? "",
    email: "",
  });
  const [tried, setTried] = useState(false);

  const errors: Partial<Record<keyof typeof v, string>> = {};
  if (v.senderName.trim().length < 2) errors.senderName = "your name";
  if (!v.senderCity.trim()) errors.senderCity = "city";
  if (v.name.trim().length < 2) errors.name = "recipient name";
  if (v.street.trim().length < 3) errors.street = "street";
  if (!/^[A-Z0-9][A-Z0-9 -]{2,9}$/i.test(v.postcode.trim())) errors.postcode = "postcode";
  if (!v.city.trim()) errors.city = "city";
  if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) errors.email = "email";
  const ok = Object.keys(errors).length === 0;

  const submit = () => {
    setTried(true);
    if (!ok || busy) return;
    const sender: Address = { name: v.senderName, street: v.senderStreet || undefined, postcode: v.senderPostcode || undefined, city: v.senderCity };
    const recipient: Address = { name: v.name, street: v.street, postcode: v.postcode, city: v.city };
    send(
      { kind: "book", quoteId: quote.id, sender, recipient, email: v.email.trim() || undefined, addOns },
      { text: `Book ${quote.id} (${quote.productName}) to ${recipient.name}, ${recipient.city}` },
    );
    onSent?.();
  };

  const field = (k: keyof typeof v, label: string, opts: { type?: string; className?: string; placeholder?: string } = {}) => (
    <input
      aria-label={label}
      aria-invalid={tried && !!errors[k]}
      className={`field min-w-0 !text-[0.95rem] placeholder:text-ink-mute ${tried && errors[k] ? "!border-accent-red placeholder:!text-accent-red" : ""} ${opts.className ?? ""}`}
      type={opts.type ?? "text"}
      placeholder={opts.placeholder ?? label}
      value={v[k]}
      onChange={(e) => setV({ ...v, [k]: e.target.value })}
    />
  );

  const row = "grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-[1.3fr_1.3fr_0.8fr_1fr]";
  const legend = "mono pt-1 text-[0.72rem] text-ink-mute";

  return (
    <form
      className="rise grid grid-cols-1 gap-x-3 gap-y-2 border-t border-line pt-3 sm:grid-cols-[2.5rem_1fr]"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <span className={legend}>from</span>
      <fieldset className={row} aria-label="From">
        {field("senderName", "Your name")}
        {field("senderStreet", "Street (optional)", { placeholder: "Street" })}
        {field("senderPostcode", "Postcode (optional)", { placeholder: "Postcode" })}
        {field("senderCity", "City")}
      </fieldset>
      <span className={`${legend} sm:pt-2`}>to</span>
      <fieldset className={`${row} sm:pt-1`} aria-label="To">
        {field("name", "Recipient")}
        {field("street", "Street")}
        {field("postcode", "Postcode")}
        {field("city", "City")}
        {field("email", "Email for tracking (optional)", { type: "email", className: "col-span-2 sm:col-span-4" })}
      </fieldset>
      <div className="flex flex-wrap items-center justify-end gap-2 pt-2 sm:col-span-2">
        {tried && !ok && (
          <p className="mono mr-auto text-[0.75rem] text-accent-red">Check: {Object.values(errors).join(", ")}</p>
        )}
        {onCancel && (
          <button type="button" className="mono px-2 text-[0.8rem] text-ink-soft hover:text-ink hover:underline" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn !px-4 !py-1.5 !text-[0.98rem]" disabled={busy}>
          Book &amp; create label
        </button>
      </div>
    </form>
  );
}

/** The `booking-form` block (from the LLM's book_quote tool): the form for one quote, standalone. */
export function BookingFormCard({ quoteId }: { quoteId: string }) {
  const { quotes, bookings } = useStore();
  const q = quotes[quoteId];
  const booking = bookings.find((b) => b.quoteId === quoteId);
  if (!q) return null;
  return (
    <div className="card rise space-y-3 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[1.15rem] leading-tight">
          Book {q.productName} <span className="mono text-[0.7rem] text-ink-mute">{q.id}</span>
        </div>
        {booking && <span className="sticker sticker-green -rotate-2" title={booking.trackingNumber}>BOOKED</span>}
      </div>
      {!booking && <BookingForm quote={q} />}
    </div>
  );
}
