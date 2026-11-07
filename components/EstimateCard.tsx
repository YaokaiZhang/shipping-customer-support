"use client";

import { useState } from "react";
import { packedShipment, recommendPackaging } from "@/lib/packaging";
import { standardBox } from "@/lib/pricing";
import { useStore } from "@/lib/store";
import type { DimensionEstimate } from "@/lib/types";
import { DetectedItem, PackagingOffer, RestrictionNote } from "./PhotoCheck";

export function EstimateCard({
  messageId,
  estimate,
  confirmed,
}: {
  messageId: string;
  estimate: DimensionEstimate;
  confirmed?: boolean;
}) {
  const { confirmEstimate, busy, profile } = useStore();
  // A photo can't weigh anything: the vision weight is only a guess. If the customer already
  // told us the weight, start from their number so a guess never silently replaces it.
  const [statedKg] = useState(profile.weightKg);
  const [v, setV] = useState({
    l: estimate.lengthCm,
    w: estimate.widthCm,
    h: estimate.heightCm,
    kg: statedKg ?? estimate.estWeightKg,
    value: "" as string,
  });
  // Packaging follows the edited size; only offered once the photo told us what the item is.
  const pick = estimate.packed === undefined ? null : recommendPackaging([v.l, v.w, v.h], estimate);
  const [wantPkg, setWantPkg] = useState(true);
  const pkgIds = pick && wantPkg ? pick.ids : undefined;
  const box = standardBox(packedShipment([v.l, v.w, v.h], v.kg, pkgIds).dims);
  const forbidden = estimate.restriction?.rule === "forbidden";
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
    <div className="card grid grid-cols-[84px_1fr] gap-3 p-3 sm:grid-cols-[132px_1fr] sm:gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={estimate.imageUrl} alt="" className="h-full max-h-40 w-full rounded-[5px] object-cover" />
      <div className="flex min-w-0 flex-col">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {estimate.referenceObjectFound ? (
            <span className="sticker sticker-ink shrink-0 -rotate-2 whitespace-nowrap">{estimate.referenceObjectFound}</span>
          ) : (
            <span className="sticker sticker-red shrink-0 -rotate-2 whitespace-nowrap">no reference</span>
          )}
          <DetectedItem estimate={estimate} />
          <div className="ml-auto flex shrink-0 items-center gap-2" title="Measurement confidence">
            <div className="h-1.5 w-10 overflow-hidden sm:w-16 rounded-full bg-paper-lo">
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
          <span className="mono pb-1 text-xs text-ink-mute">
            kg {statedKg !== undefined ? "(yours)" : "(guess)"}
          </span>
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
          <span className="mono text-xs text-ink-soft" title="Box size we quote">▢ {box.join("×")} cm</span>
          <button
            className="btn !px-4 !py-1.5"
            disabled={confirmed || busy || forbidden}
            onClick={() =>
              confirmEstimate(
                messageId,
                [v.l, v.w, v.h],
                v.kg,
                v.value ? parseFloat(v.value.replace(",", ".")) : undefined,
                pkgIds,
              )
            }
          >
            {confirmed ? "Quoted ✓" : forbidden ? "Can't ship" : "Quote"}
          </button>
        </div>
      </div>

      {(estimate.restriction || (pick && !forbidden)) && (
        <div className="col-span-2 space-y-2.5 border-t border-line pt-3">
          {estimate.restriction && <RestrictionNote r={estimate.restriction} />}
          {pick && !forbidden && <PackagingOffer pick={pick} on={wantPkg} disabled={confirmed} onChange={setWantPkg} />}
        </div>
      )}
    </div>
  );
}
