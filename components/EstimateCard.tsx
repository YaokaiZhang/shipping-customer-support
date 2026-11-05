"use client";

import { useState } from "react";
import { standardBox } from "@/lib/pricing";
import { useStore } from "@/lib/store";
import type { DimensionEstimate } from "@/lib/types";

export function EstimateCard({
  messageId,
  estimate,
  confirmed,
}: {
  messageId: string;
  estimate: DimensionEstimate;
  confirmed?: boolean;
}) {
  const { confirmEstimate, busy } = useStore();
  const [v, setV] = useState({
    l: estimate.lengthCm,
    w: estimate.widthCm,
    h: estimate.heightCm,
    kg: estimate.estWeightKg,
    value: "" as string,
  });
  const box = standardBox([v.l, v.w, v.h]);
  const pct = Math.round(estimate.confidence * 100);
  const low = estimate.confidence < 0.7;

  const num = (k: "l" | "w" | "h" | "kg") => (
    <input
      className="field w-full text-center"
      type="number"
      step={k === "kg" ? 0.1 : 1}
      min={0}
      value={v[k]}
      disabled={confirmed}
      onChange={(e) => setV({ ...v, [k]: parseFloat(e.target.value) || 0 })}
    />
  );

  return (
    <div className="card grid grid-cols-[132px_1fr] gap-4 p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={estimate.imageUrl} alt="" className="h-full max-h-40 w-full rounded-[5px] object-cover" />
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center gap-2">
          {estimate.referenceObjectFound ? (
            <span className="sticker sticker-ink -rotate-2">{estimate.referenceObjectFound}</span>
          ) : (
            <span className="sticker sticker-red -rotate-2">no reference</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-paper-lo">
              <div className={`h-full ${low ? "bg-accent-orange" : "bg-ink"}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="mono text-xs text-ink-soft">{pct}%</span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto_1fr_auto_1fr_auto] items-end gap-1.5">
          {num("l")}
          <span className="pb-1 text-ink-mute">×</span>
          {num("w")}
          <span className="pb-1 text-ink-mute">×</span>
          {num("h")}
          <span className="mono pb-1 text-xs text-ink-mute">cm</span>
        </div>
        <div className="mt-2 grid grid-cols-[1fr_auto_1fr_auto] items-end gap-1.5">
          {num("kg")}
          <span className="mono pb-1 text-xs text-ink-mute">kg</span>
          <input
            className="field text-center"
            placeholder="value"
            inputMode="decimal"
            value={v.value}
            disabled={confirmed}
            onChange={(e) => setV({ ...v, value: e.target.value.replace(/[^\d.,]/g, "") })}
          />
          <span className="mono pb-1 text-xs text-ink-mute">€</span>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          <span className="mono text-xs text-ink-soft">▢ {box.join("×")}</span>
          <button
            className="btn !px-4 !py-1.5"
            disabled={confirmed || busy}
            onClick={() =>
              confirmEstimate(messageId, [v.l, v.w, v.h], v.kg, v.value ? parseFloat(v.value.replace(",", ".")) : undefined)
            }
          >
            {confirmed ? "Quoted ✓" : "Quote"}
          </button>
        </div>
      </div>
    </div>
  );
}
