"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { Handoff, ShipmentProfile } from "@/lib/types";
import { ago, useNow } from "./time";

/** The human agent working the inbox in the demo. */
const AGENT_NAME = "Aino";

export default function InboxPanel() {
  const { handoffs } = useStore();
  const sorted = [...handoffs].sort((a, b) => b.createdAt - a.createdAt);
  const open = sorted.filter((h) => h.status !== "sent").length;

  return (
    <div className="px-4 py-5 sm:p-6">
      <div className="panel-head">
        <span className="label">Human inbox</span>
        <span className="mono text-sm text-ink-mute">{open} open</span>
      </div>

      {sorted.length === 0 ? (
        <p className="mt-4 font-serif text-ink-mute">Nothing waiting for a human.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {sorted.map((h) => (
            <Packet key={h.id} h={h} />
          ))}
        </ul>
      )}
    </div>
  );
}

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9åäö]+/g, "");

function Packet({ h }: { h: Handoff }) {
  const { chatId, sendHumanReply } = useStore();
  const now = useNow();
  const [draft, setDraft] = useState(h.draftReply ?? "");
  const [taken, setTaken] = useState(false);
  const sent = h.status === "sent";
  const live = !h.chatId || h.chatId === chatId; // the customer is still in this chat
  const urgency = h.urgency ?? "normal";
  const shipment = shipmentLine(h.shipment);
  const quotes = h.quotesTried ?? h.quoteIds.map((id) => ({ id, productName: "" }));

  // Drop detail rows that only repeat the route, the shipment line or the opening message.
  const seen = norm(shipment + (h.shipment?.from ?? "") + (h.shipment?.to ?? ""));
  const details = h.details.filter(
    (d) => !/^(route|customer said|message)$/i.test(d.label.trim()) && !(d.value && seen.includes(norm(d.value))),
  );

  const facts: [string, React.ReactNode][] = [];
  if (shipment) facts.push(["parcel", shipment]);
  details.forEach((d) => facts.push([d.label.toLowerCase(), d.value]));
  if (quotes.length) {
    // Latest quote per product; the full list stays in the tooltip.
    const latest = [...new Map(quotes.map((q) => [q.productName || q.id, q])).values()];
    const fmt = (q: { id: string; productName: string }) => (q.productName ? `${q.productName} ${q.id}` : q.id);
    facts.push([
      "quoted",
      <span key="q" className="text-ink-mute" title={quotes.map(fmt).join("\n")}>
        {latest.map(fmt).join(" · ")}
      </span>,
    ]);
  }

  return (
    <li className={`card rise p-4 transition-opacity sm:p-5 ${sent ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-serif text-xl leading-tight">{h.intent}</h3>
        <div className="flex shrink-0 items-center gap-2 pt-1">
          {urgency === "high" ? (
            <span className="sticker sticker-red rotate-2 uppercase">High</span>
          ) : urgency === "low" ? (
            <span className="mono text-xs text-ink-mute">low</span>
          ) : null}
          <span className="mono text-xs text-ink-mute">{now ? ago(h.createdAt, now) : ""}</span>
        </div>
      </div>
      {h.summary && <p className="mt-1.5 font-serif leading-snug text-ink-soft">{h.summary}</p>}
      <p className="mono mt-1.5 text-[0.75rem] leading-snug text-ink-mute">
        <span className="text-accent-red">{h.reason}</span>
        {h.sentiment && <> · {h.sentiment}</>}
      </p>

      {facts.length > 0 && (
        <dl className="mono mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[0.78rem]">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-mute">{k}</dt>
              <dd className="min-w-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {live ? (
        <div className="mt-4">
          <label className="sr-only" htmlFor={`draft-${h.id}`}>
            {sent ? "Reply sent" : "Drafted reply"}
          </label>
          <textarea
            id={`draft-${h.id}`}
            className="w-full resize-y rounded-md border border-line bg-paper-lo p-3 font-serif text-[1rem] leading-snug outline-none focus:border-ink disabled:opacity-80"
            rows={4}
            value={draft}
            disabled={sent}
            placeholder="Write a reply to the customer…"
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="mono text-[0.7rem] text-ink-mute" title="Handover id">
              {h.id} · as {AGENT_NAME}
            </span>
            <button
              type="button"
              className={`${sent ? "btn btn-ghost" : "btn"} px-4 py-1.5 text-base`}
              disabled={sent || !draft.trim()}
              onClick={() => sendHumanReply(h.id, draft, AGENT_NAME)}
            >
              {sent ? "✓ Sent" : "Send reply"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="mono text-[0.7rem] text-ink-mute">
            {h.id} · {sent ? "replied" : "chat ended"}
          </span>
          {!sent && (
            <button type="button" className={`${taken ? "btn btn-ghost" : "btn"} px-4 py-1.5 text-base`} onClick={() => setTaken((t) => !t)}>
              {taken ? "✓ Assigned" : "Take over"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function shipmentLine(p?: ShipmentProfile): string {
  if (!p) return "";
  const out: string[] = [];
  if (p.item) out.push(p.item);
  if (p.to) out.push(`${p.from} → ${p.to}${p.zone ? ` (${p.zone})` : ""}`);
  if (p.weightKg) out.push(`${p.weightKg} kg`);
  if (p.dimsCm) out.push(`${p.dimsCm.join("×")} cm`);
  if (p.fragile) out.push("fragile");
  if (p.declaredValue) out.push(`€${p.declaredValue}`);
  return out.join(" · ");
}
