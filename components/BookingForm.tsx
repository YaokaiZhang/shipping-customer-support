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
    <label className={`block min-w-0 ${opts.className ?? ""}`}>
      <span className={`label ${tried && errors[k] ? "text-accent-red" : "text-ink-mute"}`}>{label}</span>
      <input
        className={`field ${tried && errors[k] ? "!border-accent-red" : ""}`}
        type={opts.type ?? "text"}
        placeholder={opts.placeholder}
        value={v[k]}
        onChange={(e) => setV({ ...v, [k]: e.target.value })}
      />
    </label>
  );

  return (
    <form
      className="rise space-y-4 border-t border-dashed border-line pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <fieldset className="space-y-2">
        <legend className="mono mb-1 text-[0.8rem] text-ink-soft">FROM</legend>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
          {field("senderName", "Name", { className: "col-span-2" })}
          {field("senderStreet", "Street (opt.)", { className: "col-span-2" })}
          {field("senderPostcode", "Postcode (opt.)")}
          {field("senderCity", "City", { className: "sm:col-span-3" })}
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="mono mb-1 text-[0.8rem] text-ink-soft">TO</legend>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
          {field("name", "Recipient", { className: "col-span-2" })}
          {field("street", "Street", { className: "col-span-2" })}
          {field("postcode", "Postcode", { placeholder: "00100" })}
          {field("city", "City", { className: "sm:col-span-3" })}
          {field("email", "Email for tracking (opt.)", { type: "email", className: "col-span-2 sm:col-span-4" })}
        </div>
      </fieldset>
      {tried && !ok && (
        <p className="mono text-[0.8rem] text-accent-red">Missing or invalid: {Object.values(errors).join(", ")}.</p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {onCancel && (
          <button type="button" className="btn btn-ghost !px-4 !py-1.5" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn !px-4 !py-1.5" disabled={busy}>
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
    <div className="card rise p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="label text-ink-mute">Book {q.id}</div>
          <div className="text-xl leading-tight">{q.productName}</div>
        </div>
        {booking && <span className="sticker sticker-green -rotate-2">BOOKED · {booking.trackingNumber}</span>}
      </div>
      {!booking && <BookingForm quote={q} />}
    </div>
  );
}
