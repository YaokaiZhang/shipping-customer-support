"use client";

import { useStore } from "@/lib/store";
import { ago, useNow } from "./time";

export default function LeadsPanel() {
  const { leads } = useStore();
  const now = useNow();
  const sorted = [...leads].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="p-6">
      <div className="flex items-baseline justify-between border-b border-line pb-3">
        <span className="label">Sales leads</span>
        <span className="mono text-sm text-ink-mute">{sorted.length}</span>
      </div>

      {sorted.length === 0 ? (
        <p className="mt-6 font-serif text-ink-mute">No leads yet.</p>
      ) : (
        <ul className="mt-5 flex flex-col gap-4">
          {sorted.map((l, i) => (
            <li key={l.id} className="card rise relative p-5">
              {i === 0 && (
                <span className="sticker sticker-red absolute -top-2 right-4" style={{ transform: "rotate(4deg)" }}>
                  New
                </span>
              )}
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-serif text-2xl leading-tight">{l.company}</h3>
                <span className="mono shrink-0 text-xs text-ink-mute">{now ? ago(l.createdAt, now) : ""}</span>
              </div>
              <div className="mono mt-1 text-sm">{l.volume}</div>

              {l.lanes.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {l.lanes.map((lane) => (
                    <span
                      key={lane}
                      className="mono rounded-full border border-ink px-2.5 py-0.5 text-xs"
                    >
                      {lane}
                    </span>
                  ))}
                </div>
              )}

              {l.needs.length > 0 && (
                <ul className="mt-3 space-y-0.5 text-[1.02rem]">
                  {l.needs.map((n) => (
                    <li key={n} className="flex gap-2">
                      <span className="text-ink-mute">—</span>
                      {n}
                    </li>
                  ))}
                </ul>
              )}

              {l.summary && (
                <p className="mt-3 border-t border-line pt-3 font-serif text-ink-soft">{l.summary}</p>
              )}
              <div className="mono mt-3 text-[0.7rem] text-ink-mute">{l.id}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
