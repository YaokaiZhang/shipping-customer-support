"use client";

import { useState } from "react";
import { fmtEta, fmtPrice } from "@/lib/pricing";
import type { Quote } from "@/lib/types";

const TAG_LABEL = { cheapest: "Cheapest", fastest: "Fastest", greenest: "Greenest" } as const;

function hoursLeft(q: Quote) {
  return Math.max(0, Math.round((q.validUntil - Date.now()) / 3_600_000));
}

export function QuoteCard({ quote, highlight }: { quote: Quote; highlight?: boolean }) {
  const [on, setOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(quote.addOns.map((a) => [a.id, a.suggested])),
  );
  const [booked, setBooked] = useState(false);
  const total = quote.price + quote.addOns.reduce((s, a) => s + (on[a.id] ? a.price : 0), 0);

  return (
    <div
      className={`card relative flex flex-col p-4 transition-shadow ${
        highlight ? "border-2 border-ink shadow-[4px_4px_0_var(--color-ink)]" : ""
      }`}
    >
      {highlight && (
        <span className="sticker sticker-red absolute -top-2.5 right-3 rotate-3">BEST VALUE</span>
      )}
      <div className="label text-ink-mute">{quote.tags.map((t) => TAG_LABEL[t]).join(" · ")}</div>
      <div className="mt-1 text-xl leading-tight">{quote.productName}</div>

      <div className="mono mt-3 text-[1.7rem] font-bold leading-none tracking-tight">{fmtPrice(total)}</div>

      <dl className="mono mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[0.82rem]">
        <dt className="text-ink-mute">est.</dt>
        <dd>{fmtEta(quote.etaDays)}</dd>
        <dt className="text-ink-mute">CO₂</dt>
        <dd>{quote.co2Kg.toFixed(2)} kg</dd>
      </dl>

      <div className="mt-3 space-y-1 border-t border-dashed border-line pt-3">
        {quote.addOns.map((a) => (
          <label key={a.id} className="flex cursor-pointer items-center gap-2 text-[0.92rem] leading-tight">
            <input
              type="checkbox"
              className="accent-ink"
              checked={!!on[a.id]}
              disabled={booked}
              onChange={(e) => setOn({ ...on, [a.id]: e.target.checked })}
            />
            <span className="flex-1">
              {a.name}
              {a.suggested && <span className="ml-1 text-accent-orange">•</span>}
            </span>
            <span className="mono text-[0.78rem] text-ink-soft">+{a.price.toFixed(2)}</span>
          </label>
        ))}
      </div>

      <div className="mt-auto pt-4">
        <button className={`btn w-full justify-center ${booked ? "btn-ghost" : ""}`} onClick={() => setBooked(true)} disabled={booked}>
          {booked ? "Booked ✓" : "Book"}
        </button>
        <div className="mono mt-2 flex justify-between text-[0.72rem] text-ink-mute">
          <span>{quote.id}</span>
          <span>valid {hoursLeft(quote)}h</span>
        </div>
      </div>
    </div>
  );
}
