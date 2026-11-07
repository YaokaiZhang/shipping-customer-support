"use client";

import { useStore } from "@/lib/store";
import type { Address, Booking } from "@/lib/types";

/** Deterministic bar pattern from the tracking number: guard bars, then 4 bars per character. */
export function barcodeBars(code: string): { x: number; w: number }[] {
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  const bar = (w: number, gap: number) => {
    bars.push({ x, w });
    x += w + gap;
  };
  bar(2, 1);
  bar(1, 1);
  bar(2, 2);
  for (const ch of code) {
    const c = ch.charCodeAt(0) * 7 + 3;
    bar((c % 3) + 1, ((c >> 2) % 2) + 1);
    bar(((c >> 3) % 3) + 1, ((c >> 5) % 2) + 1);
    bar(((c >> 1) % 2) + 1, ((c >> 4) % 3) + 1);
    bar(((c >> 6) % 3) + 1, 2);
  }
  bar(2, 1);
  bar(1, 1);
  bar(2, 0);
  return bars;
}

function barcodeSvg(code: string, height = 56) {
  const bars = barcodeBars(code);
  const width = bars.at(-1)!.x + bars.at(-1)!.w;
  return { width, height, bars };
}

const lines = (a: Address) => [a.name, a.street, [a.postcode, a.city].filter(Boolean).join(" ")].filter(Boolean) as string[];
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** A standalone print view: only the label, sized for a 10×15 cm label printer or A4. */
function printLabel(b: Booking) {
  const { width, height, bars } = barcodeSvg(b.trackingNumber, 70);
  const svg = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" width="100%" height="${height}">${bars
    .map((r) => `<rect x="${r.x}" y="0" width="${r.w}" height="${height}" fill="#000"/>`)
    .join("")}</svg>`;
  const block = (title: string, a: Address, big: boolean) =>
    `<div class="blk"><div class="t">${title}</div><div class="${big ? "big" : ""}">${lines(a).map(esc).join("<br>")}</div></div>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Label ${b.trackingNumber}</title><style>
    @page { size: 100mm 150mm; margin: 4mm; }
    body { font-family: "Courier New", monospace; margin: 0; color: #000; }
    .label { width: 92mm; border: 2px solid #000; padding: 4mm; box-sizing: border-box; }
    .hd { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #000; padding-bottom: 2mm; }
    .brand { font: 600 20px Georgia, serif; } .prod { font-weight: 700; font-size: 14px; text-transform: uppercase; }
    .blk { padding: 2mm 0; border-bottom: 1px dashed #000; } .t { font-size: 10px; letter-spacing: 1px; }
    .big { font-size: 17px; font-weight: 700; line-height: 1.25; }
    .meta { display: flex; justify-content: space-between; font-size: 11px; padding: 2mm 0; border-bottom: 1px dashed #000; }
    .tn { text-align: center; font-size: 15px; letter-spacing: 3px; font-weight: 700; margin-top: 1mm; }
    .bc { margin-top: 3mm; }
  </style></head><body><div class="label">
    <div class="hd"><span class="brand">NordParcel</span><span class="prod">${esc(b.productName)}</span></div>
    ${block("FROM", b.sender, false)}
    ${block("TO", b.recipient, true)}
    <div class="meta"><span>${b.weightKg ? `${b.weightKg} kg` : "—"}${b.dimsCm ? ` · ${b.dimsCm.join("×")} cm` : ""}</span><span>${esc(
      b.addOns.join(" · ") || "no add-ons",
    )}</span><span>${fmtDate(b.createdAt)}</span></div>
    <div class="bc">${svg}</div><div class="tn">${b.trackingNumber}</div>
  </div><script>window.onload = () => { window.focus(); window.print(); };</script></body></html>`;
  const w = window.open("", "_blank", "width=480,height=720");
  if (!w) return window.print(); // popup blocked: fall back to printing the page
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export function LabelCard({ booking: b }: { booking: Booking }) {
  const { send, busy } = useStore();
  const { width, height, bars } = barcodeSvg(b.trackingNumber);
  const fragile = b.addOns.some((a) => /fragile/i.test(a));

  return (
    <div className="rise space-y-3">
      <div className="relative mx-auto max-w-[440px] -rotate-[0.6deg] rounded-[3px] border-2 border-ink bg-[#fdfcf7] p-4 shadow-[4px_4px_0_var(--color-ink)]">
        {fragile && <span className="sticker sticker-red absolute -top-3 right-4 rotate-3 uppercase">Fragile</span>}
        <div className="flex items-baseline justify-between border-b-2 border-ink pb-2">
          <span className="font-display text-[1.45rem] leading-none tracking-[-0.6px]">
            Nord<span className="italic">Parcel</span>
          </span>
          <span className="mono text-[0.85rem] font-bold uppercase">{b.productName}</span>
        </div>

        <div className="mono border-b border-dashed border-ink/40 py-2 text-[0.8rem] leading-snug">
          <div className="label text-ink-mute">From</div>
          {lines(b.sender).map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
        <div className="mono border-b border-dashed border-ink/40 py-2.5">
          <div className="label text-ink-mute">To</div>
          {lines(b.recipient).map((l, i) => (
            <div key={i} className={`text-[1.12rem] leading-tight ${i === 0 || i === 2 ? "font-bold" : ""}`}>
              {l}
            </div>
          ))}
        </div>
        <div className="mono flex flex-wrap justify-between gap-x-3 border-b border-dashed border-ink/40 py-1.5 text-[0.75rem] text-ink-soft">
          <span>
            {b.weightKg ? `${b.weightKg} kg` : "—"}
            {b.dimsCm ? ` · ${b.dimsCm.join("×")} cm` : ""}
          </span>
          <span>{b.addOns.join(" · ") || "no add-ons"}</span>
          <span>{fmtDate(b.createdAt)}</span>
        </div>

        <svg
          className="mt-3 block h-14 w-full"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Barcode ${b.trackingNumber}`}
        >
          {bars.map((r, i) => (
            <rect key={i} x={r.x} y={0} width={r.w} height={height} fill="var(--color-ink)" />
          ))}
        </svg>
        <div className="mono mt-1 text-center text-[1.05rem] font-bold tracking-[0.25em]">{b.trackingNumber}</div>
      </div>

      <div className="mx-auto flex max-w-[440px] items-center gap-2 pt-1">
        <span className="mono mr-auto truncate text-[0.68rem] text-ink-mute" title={`${b.instructions}\nfrom ${b.quoteId}`}>
          {b.id}
        </span>
        <button
          className="mono px-2 text-[0.8rem] text-ink-soft hover:text-ink hover:underline disabled:opacity-40"
          disabled={busy}
          onClick={() => send({ kind: "text", text: `Track ${b.trackingNumber}` })}
        >
          Track it
        </button>
        <button className="btn !px-3 !py-1 !text-[0.92rem]" onClick={() => printLabel(b)}>
          Print label
        </button>
      </div>
    </div>
  );
}
