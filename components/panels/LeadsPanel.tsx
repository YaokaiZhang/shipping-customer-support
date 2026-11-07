"use client";

import { fmtPrice } from "@/lib/pricing";
import { useStore } from "@/lib/store";
import type { SalesLead } from "@/lib/types";
import { ago, useNow } from "./time";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function LeadsPanel() {
  const { leads } = useStore();
  const sorted = [...leads].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="px-4 py-5 sm:p-6">
      <div className="panel-head">
        <span className="label">Sales leads</span>
        <span className="mono text-sm text-ink-mute">{sorted.length}</span>
      </div>

      {sorted.length === 0 ? (
        <p className="mt-4 font-serif text-ink-mute">No leads yet.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {sorted.map((l) => (
            <Lead key={l.id} l={l} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Lead({ l }: { l: SalesLead }) {
  const now = useNow();
  const v = l.volumeQuote;

  return (
    <li className="card rise p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-serif text-xl leading-tight">{l.company}</h3>
        <span className="mono shrink-0 text-xs text-ink-mute">{now ? ago(l.createdAt, now) : ""}</span>
      </div>
      <div className="mono mt-1 text-[0.8rem] text-ink-soft">{l.volume}</div>
      {l.needs.length > 0 && <p className="mt-2 font-serif leading-snug">{l.needs.join(" · ")}</p>}

      {v ? (
        <div className="mt-3 border-t border-line pt-3">
          <ul className="mono space-y-0.5 text-[0.78rem]">
            {v.lanes.map((ln) => (
              <li key={`${ln.zone}-${ln.label}`} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">
                  {ln.label} <span className="text-ink-mute">{pct(ln.share)}</span> · {ln.productName}
                </span>
                <span className="shrink-0 text-ink-soft tabular-nums">
                  {ln.parcelsPerMonth} × {fmtPrice(ln.listPricePerParcel)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <span className="mono text-[0.7rem] text-ink-mute" title="Indicative, at list prices. Contract pricing is set by sales.">
              list estimate · {v.co2KgPerMonth.toFixed(0)} kg CO₂
            </span>
            <span className="mono text-sm font-bold tabular-nums">{fmtPrice(v.monthlyListTotal)} / mo</span>
          </div>
        </div>
      ) : (
        <>
          {l.lanes.length > 0 && <p className="mono mt-2 text-[0.78rem] text-ink-soft">{l.lanes.join(" · ")}</p>}
          {l.summary && <p className="mt-2 text-[0.92rem] leading-snug text-ink-soft">{l.summary}</p>}
        </>
      )}

      <div className="mono mt-3 text-[0.7rem] text-ink-mute" title={v ? l.summary : undefined}>
        {l.id}
        {v && ` · ${v.id}`}
      </div>
    </li>
  );
}
