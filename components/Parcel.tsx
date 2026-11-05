"use client";

import { useEffect, useMemo, useState } from "react";
import rules from "@/data/rules.json";
import { fmtEta } from "@/lib/pricing";
import { useStore } from "@/lib/store";

/** Where rule stickers land on the front face: [left, top, rotation]. */
const SLOTS: [number, number, number][] = [
  [14, 20, -8],
  [256, 24, 9],
  [128, 206, 5],
  [250, 118, -6],
  [8, 112, -4],
  [176, 6, -3],
  [262, 168, 8],
  [56, 6, 4],
];

function useTyped(text: string) {
  const [out, setOut] = useState("");
  useEffect(() => {
    setOut("");
    let i = 0;
    const id = setInterval(() => {
      i++;
      setOut(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, 55);
    return () => clearInterval(id);
  }, [text]);
  return out;
}

export function Parcel() {
  const { profile, quotes, chatQuoteIds, events, busy, messages } = useStore();
  const lastBlock = [...messages].reverse().flatMap((m) => m.blocks ?? []).find((b) => b.type === "quotes");
  const latest = lastBlock?.type === "quotes" && lastBlock.highlight ? quotes[lastBlock.highlight] : undefined;

  const status = busy
    ? "working…"
    : latest
      ? `quoted ${chatQuoteIds.length} option${chatQuoteIds.length > 1 ? "s" : ""}`
      : !messages.length
        ? "ready when you are"
        : !profile.to
          ? "awaiting destination"
          : !profile.dimsCm
            ? "awaiting size"
            : "ready to quote";
  const typed = useTyped(status);

  const ruleHits = useMemo(() => {
    const order: string[] = [];
    [...events].reverse().forEach((e) => !order.includes(e.ruleId) && order.push(e.ruleId));
    return order.slice(0, SLOTS.length);
  }, [events]);

  const dims = profile.dimsCm ? profile.dimsCm.join("×") : "—";
  const kg = profile.weightKg ? profile.weightKg.toFixed(1) : "—";

  return (
    <div className="parcel-stage">
      <div className="parcel-scene">
        <div className="parcel">
          <div className="pf pf-front">
            <div className="tape tape-front" />

            {/* shipping label */}
            <div className="ship-label">
              <div className="flex items-start justify-between">
                <div className="font-display text-[15px] italic leading-none tracking-tight">NordParcel</div>
                <div className="barcode" />
              </div>
              <div className="mt-2 grid grid-cols-[34px_1fr] gap-x-2 gap-y-[1px] text-[11px] leading-tight">
                <span className="text-ink-mute">FROM</span>
                <span className="truncate">{profile.from}</span>
                <span className="text-ink-mute">TO</span>
                <span className="truncate font-bold">{profile.to ?? "—"}</span>
                <span className="text-ink-mute">KG</span>
                <span>
                  {kg} <span className="text-ink-mute">·</span> {dims}
                </span>
                <span className="text-ink-mute">REF</span>
                <span className="truncate">
                  {latest ? `${latest.id} · est. ${fmtEta(latest.etaDays)}` : "—"}
                </span>
              </div>
              <div className="thermal">
                {typed}
                <span className="cursor" />
              </div>
            </div>

            {profile.fragile && <div className="sticker-fragile">FRAGILE</div>}
            <div className="sticker-star" />
            <div className="sticker-dot">NP</div>

            {ruleHits.map((id, i) => {
              const [left, top, r] = SLOTS[i];
              const rule = rules.find((x) => x.id === id);
              return (
                <div
                  key={id}
                  className="rule-stamp"
                  style={{ left, top, ["--r" as string]: `${r}deg` }}
                  title={rule?.text}
                >
                  <span>{id}</span>
                  <small>{rule?.short}</small>
                </div>
              );
            })}
          </div>
          <div className="pf pf-back" />
          <div className="pf pf-left" />
          <div className="pf pf-right">
            <div className="side-print">
              <div className="arrows">↑↑</div>
              <div>THIS SIDE UP</div>
              <div className="glass">HANDLE WITH CARE</div>
            </div>
          </div>
          <div className="pf pf-top">
            <div className="tape tape-top" />
          </div>
          <div className="pf pf-bottom" />
        </div>
      </div>
    </div>
  );
}
