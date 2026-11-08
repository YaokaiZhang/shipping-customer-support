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
      <span className="sticker sticker-ink absolute -top-2.5 right-3 rotate-2" title="Standard list prices, no discount. Sales prepares contract pricing.">
        LIST PRICES
      </span>
      <div className="text-[1.15rem] leading-tight">
        ~{v.parcelsPerMonth} parcels / month <span className="text-ink-mute">·</span> {v.avgWeightKg} kg avg
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="mono text-[1.6rem] leading-none font-bold tracking-tight">{fmtPrice(v.monthlyListTotal)}</span>
        <span className="mono text-[0.78rem] text-ink-soft">
          / month · {fmtPrice(v.avgPerParcel)} avg · {v.co2KgPerMonth.toFixed(1)} kg CO₂
        </span>
      </div>

      <table className="mono mt-4 w-full border-t border-line text-[0.82rem]">
        <thead className="sr-only">
          <tr>
            <th>Lane</th>
            <th>Parcels × list price</th>
            <th>Month</th>
          </tr>
        </thead>
        <tbody>
          {v.lanes.map((l) => (
            <tr key={`${l.zone}-${l.label}`} className="border-b border-line last:border-0">
              <td className="w-full py-2 pr-3 align-top">
                <div className="font-serif text-[1rem] leading-tight">
                  {l.label} <span className="mono text-[0.72rem] text-ink-mute">{pct(l.share)}</span>
                </div>
                <div
                  className="text-[0.72rem] text-ink-mute"
                  title={`est. ${fmtEta(l.etaDays)} · ${l.co2KgPerMonth.toFixed(1)} kg CO₂ / month`}
                >
                  {l.productName}
                </div>
              </td>
              <td className="py-2 pr-4 text-right align-top whitespace-nowrap text-ink-soft">
                {l.parcelsPerMonth} × {fmtPrice(l.listPricePerParcel)}
              </td>
              <td className="py-2 text-right align-top whitespace-nowrap">{fmtPrice(l.monthlyList)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {v.dimsCm && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="label text-ink-mute">
            {v.dimsCm.join("×")} cm · {v.options?.length ? "fits" : "fits no parcel product"}
          </div>
          {!!v.options?.length && (
            <ul className="mono mt-1.5 space-y-1 text-[0.82rem]">
              {v.options.map((o) => (
                <li key={o.productId} className="flex items-baseline gap-3">
                  <span className="min-w-0 flex-1 truncate font-serif text-[1rem]">{o.productName}</span>
                  <span className="hidden text-[0.72rem] text-ink-mute sm:inline">
                    {fmtEta(o.etaDays)} · {o.co2KgPerMonth.toFixed(1)} kg CO₂
                  </span>
                  <span className="w-24 text-right whitespace-nowrap">{fmtPrice(o.monthlyList)}</span>
                </li>
              ))}
            </ul>
          )}
          {!!v.options?.length && <div className="mono mt-1 text-right text-[0.68rem] text-ink-mute">per month at list prices</div>}
        </div>
      )}

      <div className="mono mt-2 flex items-center justify-end gap-3 text-[0.68rem] text-ink-mute">
        {v.leadId && (
          <button type="button" className="underline-offset-2 hover:text-ink hover:underline" onClick={() => setTab("leads")}>
            lead {v.leadId} →
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
    </div>
  );
}
