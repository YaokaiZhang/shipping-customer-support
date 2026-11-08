"use client";

import { useState } from "react";
import { fmtEta, fmtPrice } from "@/lib/pricing";
import { useStore } from "@/lib/store";
import { BookingForm } from "./BookingForm";
import type { Quote } from "@/lib/types";

const TAG_LABEL = { cheapest: "Cheapest", fastest: "Fastest", greenest: "Greenest" } as const;

function hoursLeft(q: Quote) {
  return Math.max(0, Math.round((q.validUntil - Date.now()) / 3_600_000));
}

export function QuoteCard({ quote, highlight }: { quote: Quote; highlight?: boolean }) {
  const [on, setOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(quote.addOns.map((a) => [a.id, a.suggested])),
  );
  const { bookings, messages } = useStore();
  // In a volume chat, also show what this price means per month on the matching lane.
  const vol = messages.flatMap((m) => m.blocks ?? []).findLast((b) => b.type === "volume-quote");
  const v = vol?.type === "volume-quote" ? vol.volumeQuote : undefined;
  const lane = v && (v.lanes.length === 1 ? v.lanes[0] : v.lanes.find((l) => l.zone === quote.inputs.zone));
  const booking = bookings.find((b) => b.quoteId === quote.id);
  const booked = !!booking;
  const expired = Date.now() > quote.validUntil;
  const [open, setOpen] = useState(false);
  const [showAddOns, setShowAddOns] = useState(false);
  const picked = quote.addOns.filter((a) => on[a.id]);
  const addOnTotal = picked.reduce((s, a) => s + a.price, 0);
  const total = quote.price + addOnTotal;

  return (
    <div
      className={`card relative flex flex-col p-4 transition-shadow ${open && !booked ? "sm:col-span-3" : ""} ${
        highlight ? "border-2 border-ink shadow-[4px_4px_0_var(--color-ink)]" : ""
      }`}
    >
      {highlight && (
        <span className="sticker sticker-red absolute -top-2.5 right-3 rotate-3">BEST VALUE</span>
      )}
      <div className="label text-ink-mute">{quote.tags.map((t) => TAG_LABEL[t]).join(" · ") || "\u00a0"}</div>
      <div className="mt-1 text-[1.15rem] leading-tight">{quote.productName}</div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-1.5">
        <span className="mono text-[1.6rem] font-bold leading-none tracking-tight">{fmtPrice(total)}</span>
        <span className="mono text-[0.72rem] whitespace-nowrap text-ink-mute">per parcel</span>
      </div>
      {lane && (
        <div className="mono mt-1 text-[0.78rem] text-ink-soft">
          × {lane.parcelsPerMonth} / mo ≈ {fmtPrice(total * lane.parcelsPerMonth)}
        </div>
      )}
      <div className="mono mt-1.5 text-[0.78rem] text-ink-soft">
        {fmtEta(quote.etaDays)} · {quote.co2Kg.toFixed(2)} kg CO₂
      </div>

      {quote.addOns.length > 0 && (
        <div className="mt-3 border-t border-line pt-2">
          <button
            type="button"
            className={`mono flex w-full items-center justify-between gap-2 py-0.5 ${open && !booked ? "max-w-sm" : ""} text-left text-[0.78rem] text-ink-soft hover:text-ink`}
            aria-expanded={showAddOns}
            onClick={() => setShowAddOns(!showAddOns)}
          >
            <span>
              add-ons{picked.length ? ` (${picked.length})` : ""} <span aria-hidden>{showAddOns ? "▴" : "▾"}</span>
            </span>
            {addOnTotal > 0 && <span>+{fmtPrice(addOnTotal)}</span>}
          </button>
          {showAddOns && (
            <div className="mt-1.5 max-w-sm space-y-1">
              {quote.addOns.map((a) => (
                <label
                  key={a.id}
                  className="flex cursor-pointer items-center gap-2 text-[0.88rem] leading-tight"
                  title={a.suggested ? "Suggested for this parcel" : undefined}
                >
                  <input
                    type="checkbox"
                    className="accent-ink"
                    checked={!!on[a.id]}
                    disabled={booked}
                    onChange={(e) => setOn({ ...on, [a.id]: e.target.checked })}
                  />
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  <span className="mono text-[0.72rem] text-ink-mute">+{a.price.toFixed(2)}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-auto pt-3">
        {open && !booked ? (
          <BookingForm
            quote={quote}
            addOns={picked.map((a) => a.id)}
            onCancel={() => setOpen(false)}
            onSent={() => setOpen(false)}
          />
        ) : (
          <button
            className={`btn w-full justify-center !py-1.5 ${booked ? "btn-ghost" : ""}`}
            onClick={() => setOpen(true)}
            disabled={booked || expired}
            title={booking ? booking.trackingNumber : undefined}
          >
            {booked ? "Booked ✓" : expired ? "Quote expired" : "Book this"}
          </button>
        )}
        {!booked && !expired && (
          <div className="mono mt-2 text-right text-[0.68rem] text-ink-mute">price held {hoursLeft(quote)} h</div>
        )}
      </div>
    </div>
  );
}
