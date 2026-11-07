"use client";

import { useStore } from "@/lib/store";
import type { RerouteOption, Tracking, TrackingStatus } from "@/lib/types";

const STATUS: Record<TrackingStatus, { word: string; tone: string }> = {
  label_created: { word: "Label created", tone: "sticker-ink" },
  in_transit: { word: "In transit", tone: "sticker-blue" },
  delayed: { word: "Delayed", tone: "sticker-red" },
  out_for_delivery: { word: "Out for delivery", tone: "sticker-blue" },
  delivered: { word: "Delivered", tone: "sticker-green" },
  held_at_pickup: { word: "At pickup point", tone: "sticker-ink" },
  returned: { word: "Returned", tone: "sticker-red" },
};

const ACTION: Record<RerouteOption, (tn: string, held: boolean) => { label: string; text: string }> = {
  pickup_point: (tn) => ({ label: "To a pickup point", text: `Reroute ${tn} to a pickup point` }),
  hold: (tn, held) => ({ label: held ? "Hold 7 more days" : "Hold at terminal", text: `Hold ${tn} at the terminal` }),
  new_address: (tn) => ({ label: "New address", text: `Deliver ${tn} to a new address` }),
};

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const fmtTime = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function TrackingCard({ tracking: t }: { tracking: Tracking }) {
  const { send, busy } = useStore();
  const st = STATUS[t.status];
  const win = t.estimate && (fmtDay(t.estimate.from) === fmtDay(t.estimate.to) ? fmtDay(t.estimate.from) : `${fmtDay(t.estimate.from)} – ${fmtDay(t.estimate.to)}`);
  const done = t.status === "delivered" || t.status === "returned";

  return (
    <div className="card rise relative overflow-hidden p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`sticker ${st.tone} -rotate-2 uppercase`}>{st.word}</span>
        {t.reroute && (
          <span className="mono text-[0.75rem] text-accent-green" title={t.reroute.detail}>
            {t.reroute.option === "hold" ? "on hold ✓" : "rerouted ✓"}
          </span>
        )}
        <span className="mono ml-auto text-[0.8rem] tracking-[0.1em] text-ink-soft">{t.trackingNumber}</span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <div className="text-xl leading-tight">
          {t.from} <span className="text-ink-mute">→</span> {t.to}
        </div>
        {win && (
          <div className="mono text-[0.95rem] font-bold" title="Estimate, not a promise">
            {win}
          </div>
        )}
      </div>
      <div className="mono mt-0.5 text-[0.75rem] text-ink-mute">
        {[t.product, t.address ?? t.pickupPoint, t.pickupBy && `collect by ${fmtDay(t.pickupBy)}`].filter(Boolean).join(" · ")}
      </div>

      {t.delayReason && (
        <p className="mt-3 border-l-2 border-accent-orange pl-3 text-[0.95rem] leading-snug text-ink-soft">{t.delayReason}</p>
      )}

      <ol className="mt-4 border-t border-line pt-3">
        {t.events.map((e, i) => (
          <li key={i} className="relative grid grid-cols-[18px_1fr] gap-2 pb-3 last:pb-0">
            {i < t.events.length - 1 && <span className="absolute top-3 bottom-0 left-[5px] w-px bg-line" aria-hidden />}
            <span
              className={`mt-1.5 h-[11px] w-[11px] rounded-full border-2 border-ink ${
                i === 0 ? (t.status === "delayed" ? "bg-accent-orange" : "bg-ink") : "bg-paper-hi"
              }`}
              aria-hidden
            />
            <div className="min-w-0">
              <div className={`leading-tight ${i === 0 ? "text-[1.02rem]" : "text-[0.95rem] text-ink-soft"}`}>{e.text}</div>
              <div className="mono text-[0.72rem] text-ink-mute">
                {fmtTime(e.at)} · {e.location}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-4 border-t border-line pt-3">
        {t.rerouteOptions.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="mono mr-1 text-[0.75rem] text-ink-mute">change delivery</span>
            {t.rerouteOptions.map((o) => {
              const a = ACTION[o](t.trackingNumber, t.status === "held_at_pickup");
              return (
                <button key={o} className="chip !px-3 !py-0.5 !text-[0.88rem]" disabled={busy} onClick={() => send({ kind: "text", text: a.text })}>
                  {a.label}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="mono text-[0.75rem] text-ink-mute">
            {done ? "Journey finished." : "Can't reroute now: the driver has it."}
          </p>
        )}
      </div>
    </div>
  );
}
