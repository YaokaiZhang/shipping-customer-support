"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { ago, useNow } from "./time";

export default function InboxPanel() {
  const { handoffs } = useStore();
  const now = useNow();
  const [assigned, setAssigned] = useState<Record<string, boolean>>({});
  const sorted = [...handoffs].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="p-6">
      <div className="flex items-baseline justify-between border-b border-line pb-3">
        <span className="label">Human inbox</span>
        <span className="mono text-sm text-ink-mute">
          {sorted.filter((h) => !assigned[h.id]).length} open
        </span>
      </div>

      {sorted.length === 0 ? (
        <p className="mt-6 font-serif text-ink-mute">Nothing waiting for a human.</p>
      ) : (
        <ul className="mt-5 flex flex-col gap-4">
          {sorted.map((h) => {
            const taken = !!assigned[h.id];
            return (
              <li key={h.id} className={`card rise p-5 transition-opacity ${taken ? "opacity-60" : ""}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-serif text-2xl leading-tight">{h.intent}</h3>
                  <span className="mono shrink-0 text-xs text-ink-mute">{now ? ago(h.createdAt, now) : ""}</span>
                </div>
                <span className="sticker sticker-red mt-2" style={{ transform: "rotate(-1.5deg)" }}>
                  {h.reason}
                </span>

                {h.details.length > 0 && (
                  <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5">
                    {h.details.map((d) => (
                      <div key={d.label} className="contents">
                        <dt className="label pt-1 text-ink-mute">{d.label}</dt>
                        <dd className="mono text-sm">{d.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {h.quoteIds.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {h.quoteIds.map((q, i) => (
                      <span
                        key={q}
                        className="sticker sticker-ink"
                        style={{ transform: `rotate(${i % 2 ? 1.5 : -1.5}deg)` }}
                      >
                        {q}
                      </span>
                    ))}
                  </div>
                )}

                {h.summary && (
                  <p className="mt-4 border-t border-line pt-3 font-serif text-ink-soft">{h.summary}</p>
                )}

                <div className="mt-4 flex items-center justify-between">
                  <span className="mono text-[0.7rem] text-ink-mute">{h.id}</span>
                  <button
                    type="button"
                    className={taken ? "btn btn-ghost" : "btn"}
                    onClick={() => setAssigned((a) => ({ ...a, [h.id]: !a[h.id] }))}
                  >
                    {taken ? "✓ Assigned" : "Take over"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
