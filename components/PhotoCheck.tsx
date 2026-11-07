"use client";

import { packagingById, pickPrice, type PackagingPick } from "@/lib/packaging";
import { fmtPrice } from "@/lib/pricing";
import type { DimensionEstimate, Restriction } from "@/lib/types";

/** What the photo shows: item label plus cue tags. */
export function DetectedItem({ estimate }: { estimate: DimensionEstimate }) {
  if (!estimate.itemLabel) return null;
  const tags = [...(estimate.cues ?? []), ...(estimate.fragile ? ["fragile"] : [])].filter((t, i, a) => a.indexOf(t) === i);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="label text-ink-mute">seen</span>
      <span className="text-[1.02rem] capitalize leading-tight">{estimate.itemLabel}</span>
      {tags.map((t) => (
        <span key={t} className="mono rounded-[4px] bg-paper-lo px-1.5 py-0.5 text-[0.72rem] text-ink-soft">
          {t}
        </span>
      ))}
      {estimate.packed !== undefined && (
        <span className="mono text-[0.72rem] text-ink-mute">· {estimate.packed ? "boxed" : "unpacked"}</span>
      )}
    </div>
  );
}

const TONE = { forbidden: "sticker-red", allowed_with_product: "sticker-blue", needs_declaration: "sticker-ink", ok: "sticker-ink" } as const;
const WORD = { forbidden: "Not accepted", allowed_with_product: "Restricted", needs_declaration: "Declaration", ok: "OK" } as const;

/** Deterministic restriction result for the detected item (data/restricted-items.json). */
export function RestrictionNote({ r }: { r: Restriction }) {
  const head =
    r.rule === "forbidden"
      ? `We can't ship ${r.item}.`
      : r.rule === "allowed_with_product"
        ? `${cap(r.item)}: only with ${r.productName ?? "a specific product"}.`
        : `${cap(r.item)}: needs a declaration.`;
  return (
    <div className={`flex items-start gap-3 rounded-[5px] border p-2.5 ${r.rule === "forbidden" ? "border-accent-red" : "border-line"}`}>
      <span className={`sticker ${TONE[r.rule]} mt-0.5 shrink-0 -rotate-2 uppercase`}>{WORD[r.rule]}</span>
      <div className="min-w-0">
        <div className="leading-tight">{head}</div>
        <div className="mono mt-0.5 text-[0.78rem] text-ink-soft">{r.note}</div>
      </div>
    </div>
  );
}

/** Optional NordParcel packaging add-on. Price comes from data/packaging.json, never from the model. */
export function PackagingOffer({
  pick,
  on,
  disabled,
  onChange,
}: {
  pick: PackagingPick;
  on: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-2.5 rounded-[5px] border border-dashed p-2.5 ${on ? "border-ink bg-label-yellow/40" : "border-line"}`}>
      <input type="checkbox" className="mt-1 accent-ink" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0 flex-1">
        <span className="label block text-ink-mute">packaging add-on · optional</span>
        <span className="block leading-tight">{pick.reason}</span>
        <span className="mono mt-0.5 block text-[0.74rem] text-ink-soft">
          {[pick.detail, ...pick.ids.map((id) => packagingById(id)?.description)].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="mono shrink-0 pt-0.5 text-[0.82rem]">+{fmtPrice(pickPrice(pick.ids))}</span>
    </label>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
