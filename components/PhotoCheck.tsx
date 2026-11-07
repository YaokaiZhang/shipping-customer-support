"use client";

import { packagingById, pickNames, pickPrice, type PackagingPick } from "@/lib/packaging";
import { fmtPrice } from "@/lib/pricing";
import type { DimensionEstimate, Restriction } from "@/lib/types";

/** What the photo shows: the item name, with the cue tags as a tooltip. */
export function DetectedItem({ estimate }: { estimate: DimensionEstimate }) {
  if (!estimate.itemLabel) return null;
  const tags = [...(estimate.cues ?? []), ...(estimate.fragile ? ["fragile"] : [])].filter((t, i, a) => a.indexOf(t) === i);
  if (estimate.packed !== undefined) tags.push(estimate.packed ? "boxed" : "unpacked");
  return (
    <span className="min-w-0 truncate leading-tight" title={tags.join(" · ") || undefined}>
      {cap(estimate.itemLabel.toLowerCase())}
    </span>
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
    <div className="flex items-start gap-2.5">
      <span className={`sticker ${TONE[r.rule]} mt-0.5 shrink-0 -rotate-2 uppercase`}>{WORD[r.rule]}</span>
      <div className="min-w-0">
        <div className="leading-tight">{head}</div>
        <div className="mono mt-0.5 text-[0.75rem] text-ink-soft">{r.note}</div>
      </div>
    </div>
  );
}

/** Optional NordParcel packaging add-on, one line. Price comes from data/packaging.json, never from the model. */
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
  const hint = [pick.reason, pick.detail, ...pick.ids.map((id) => packagingById(id)?.description)].filter(Boolean).join("\n");
  return (
    <label className="flex cursor-pointer items-center gap-2.5" title={hint}>
      <input type="checkbox" className="accent-ink" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className={`min-w-0 flex-1 truncate leading-tight ${on ? "" : "text-ink-mute"}`}>{pickNames(pick.ids)}</span>
      <span className={`mono shrink-0 text-[0.82rem] ${on ? "" : "text-ink-mute"}`}>+{fmtPrice(pickPrice(pick.ids))}</span>
    </label>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
