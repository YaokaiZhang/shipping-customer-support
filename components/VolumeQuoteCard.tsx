"use client";

import { fmtEta, fmtPrice } from "@/lib/pricing";
import { useStore } from "@/lib/store";
import type { VolumeQuote } from "@/lib/types";

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Indicative monthly cost for a business sender, at LIST prices only (G-3: no discounts in chat). */
export function VolumeQuoteCard({ v }: { v: VolumeQuote }) {
  const { setTab } = useStore();
  return (
    <div className="card relative p-4 sm:p-5">
      <span className="sticker sticker-ink absolute -top-2.5 right-3 rotate-2">LIST PRICES</span>
      <div className="label text-ink-mute">Indicative monthly estimate</div>
      <div className="mt-1 text-xl leading-tight">
        ~{v.parcelsPerMonth} parcels / month · {v.avgWeightKg} kg avg
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="mono text-[1.7rem] leading-none font-bold tracking-tight">{fmtPrice(v.monthlyListTotal)}</span>
        <span className="mono text-[0.82rem] text-ink-soft">/ month at list · avg {fmtPrice(v.avgPerParcel)} per parcel</span>
      </div>

      <div className="mt-4 border-t border-dashed border-line pt-3">
        <div className="mono hidden grid-cols-[1fr_auto_auto_auto] gap-x-4 pb-1 text-[0.7rem] text-ink-mute uppercase sm:grid">
          <span>Lane · product</span>
          <span className="text-right">parcels</span>
          <span className="text-right">list / parcel</span>
          <span className="text-right">month</span>
        </div>
        <ul className="space-y-2">
          {v.lanes.map((l) => (
            <li key={`${l.zone}-${l.label}`} className="grid grid-cols-[1fr_auto] gap-x-4 sm:grid-cols-[1fr_auto_auto_auto]">
              <div className="min-w-0">
                <div className="leading-tight">
                  FI → {l.label} <span className="mono text-[0.78rem] text-ink-mute">{pct(l.share)}</span>
                </div>
                <div className="mono text-[0.78rem] text-ink-soft">
                  {l.productName} · est. {fmtEta(l.etaDays)} · {l.co2KgPerMonth.toFixed(1)} kg CO₂
                </div>
              </div>
              <span className="mono hidden text-right text-[0.88rem] sm:block">{l.parcelsPerMonth}</span>
              <span className="mono hidden text-right text-[0.88rem] sm:block">{fmtPrice(l.listPricePerParcel)}</span>
              <span className="mono text-right text-[0.88rem]">
                {fmtPrice(l.monthlyList)}
                <span className="block text-[0.72rem] text-ink-mute sm:hidden">
                  {l.parcelsPerMonth} × {fmtPrice(l.listPricePerParcel)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <dl className="mono mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-t border-dashed border-line pt-3 text-[0.82rem]">
        <dt className="text-ink-mute">CO₂</dt>
        <dd>{v.co2KgPerMonth.toFixed(1)} kg / month</dd>
      </dl>

      <p className="mt-3 rounded-md bg-label-yellow/60 px-3 py-2 text-[0.95rem] leading-snug">
        These are standard list prices with no discount applied. Our sales team prepares your contract pricing.
      </p>

      <div className="mono mt-3 flex items-center justify-between text-[0.72rem] text-ink-mute">
        <span>{v.id}</span>
        {v.leadId && (
          <button type="button" className="underline-offset-2 hover:text-ink hover:underline" onClick={() => setTab("leads")}>
            sales lead {v.leadId} →
          </button>
        )}
      </div>
    </div>
  );
}

/** Compact version for the Sales leads panel. */
export function VolumeSummary({ v }: { v: VolumeQuote }) {
  return (
    <div className="mt-3 rounded-md border border-dashed border-line bg-paper-lo p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="label text-ink-mute">Volume estimate · list</span>
        <span className="mono text-sm font-bold">{fmtPrice(v.monthlyListTotal)} / mo</span>
      </div>
      <ul className="mono mt-2 space-y-0.5 text-[0.78rem]">
        {v.lanes.map((l) => (
          <li key={`${l.zone}-${l.label}`} className="flex justify-between gap-3">
            <span className="truncate">
              {l.label} {pct(l.share)} · {l.productName}
            </span>
            <span className="shrink-0 text-ink-soft">
              {l.parcelsPerMonth} × {fmtPrice(l.listPricePerParcel)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mono mt-2 flex justify-between text-[0.72rem] text-ink-mute">
        <span>
          {v.parcelsPerMonth}/mo · {v.avgWeightKg} kg · {v.co2KgPerMonth.toFixed(0)} kg CO₂
        </span>
        <span>{v.id}</span>
      </div>
      <div className="mono mt-1 text-[0.7rem] text-ink-mute">No discount shown in chat; contract pricing is yours to set.</div>
    </div>
  );
}
