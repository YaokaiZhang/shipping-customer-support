"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { Handoff, HandoffUrgency, ShipmentProfile } from "@/lib/types";
import { ago, useNow } from "./time";

/** The human agent working the inbox in the demo. */
const AGENT_NAME = "Aino";

const URGENCY: Record<HandoffUrgency, { label: string; cls: string }> = {
  high: { label: "High", cls: "sticker-red" },
  normal: { label: "Normal", cls: "sticker-ink" },
  low: { label: "Low", cls: "sticker-green" },
};

export default function InboxPanel() {
  const { handoffs } = useStore();
  const sorted = [...handoffs].sort((a, b) => b.createdAt - a.createdAt);
  const open = sorted.filter((h) => h.status !== "sent").length;

  return (
    <div className="p-6">
      <div className="flex items-baseline justify-between border-b border-line pb-3">
        <span className="label">Human inbox</span>
        <span className="mono text-sm text-ink-mute">{open} open</span>
      </div>

      {sorted.length === 0 ? (
        <p className="mt-6 font-serif text-ink-mute">Nothing waiting for a human.</p>
      ) : (
        <ul className="mt-5 flex flex-col gap-4">
          {sorted.map((h) => (
            <Packet key={h.id} h={h} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Packet({ h }: { h: Handoff }) {
  const { chatId, sendHumanReply } = useStore();
  const now = useNow();
  const [draft, setDraft] = useState(h.draftReply ?? "");
  const [taken, setTaken] = useState(false);
  const sent = h.status === "sent";
  const live = !h.chatId || h.chatId === chatId; // the customer is still in this chat
  const urgency = URGENCY[h.urgency ?? "normal"];
  const ruleIds = Array.from(new Set(h.reason.match(/G-\d+/g) ?? []));
  const shipment = shipmentLines(h.shipment);
  const quotes = h.quotesTried ?? h.quoteIds.map((id) => ({ id, productName: "" }));

  return (
    <li className={`card rise p-5 transition-opacity ${sent ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-serif text-2xl leading-tight">{h.intent}</h3>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`sticker ${urgency.cls} rotate-2 uppercase`}>{urgency.label}</span>
          <span className="mono text-xs text-ink-mute">{now ? ago(h.createdAt, now) : ""}</span>
        </div>
      </div>
      {h.sentiment && (
        <div className="mono mt-1 text-[0.82rem] text-ink-soft">
          <span className="text-ink-mute">mood</span> {h.sentiment}
        </div>
      )}

      <Section title="Why escalated">
        <div className="flex flex-wrap items-start gap-2">
          {ruleIds.map((r) => (
            <span key={r} className="sticker sticker-red -rotate-2">
              {r}
            </span>
          ))}
          <span className="font-serif leading-snug">{h.reason}</span>
        </div>
      </Section>

      {shipment.length > 0 && (
        <Section title="Shipment so far">
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1">
            {shipment.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="label pt-0.5 text-ink-mute">{k}</dt>
                <dd className="mono text-sm">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      <Section title="Quotes tried">
        {quotes.length ? (
          <div className="flex flex-wrap gap-2">
            {quotes.map((q, i) => (
              <span key={q.id} className="sticker sticker-ink" style={{ transform: `rotate(${i % 2 ? 1.5 : -1.5}deg)` }}>
                {q.id}
                {q.productName && <span className="font-normal opacity-80"> · {q.productName}</span>}
              </span>
            ))}
          </div>
        ) : (
          <span className="mono text-sm text-ink-mute">none</span>
        )}
      </Section>

      {h.details.length > 0 && (
        <Section title="Details">
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1">
            {h.details.map((d) => (
              <div key={d.label} className="contents">
                <dt className="label pt-0.5 text-ink-mute">{d.label}</dt>
                <dd className="mono text-sm break-words">{d.value}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {h.summary && <p className="mt-4 border-t border-line pt-3 font-serif text-ink-soft">{h.summary}</p>}

      {live ? (
        <div className="mt-4 border-t border-line pt-3">
          <label className="label text-ink-mute" htmlFor={`draft-${h.id}`}>
            {sent ? "Reply sent" : "Drafted reply · edit before sending"}
          </label>
          <textarea
            id={`draft-${h.id}`}
            className="mt-2 w-full resize-y rounded-md border border-line bg-paper-lo p-3 font-serif text-[1.02rem] leading-snug outline-none focus:border-ink disabled:opacity-80"
            rows={4}
            value={draft}
            disabled={sent}
            placeholder="Write a reply to the customer…"
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="mono text-[0.7rem] text-ink-mute">
              {h.id} · as {AGENT_NAME}
            </span>
            <button
              type="button"
              className={sent ? "btn btn-ghost" : "btn"}
              disabled={sent || !draft.trim()}
              onClick={() => sendHumanReply(h.id, draft, AGENT_NAME)}
            >
              {sent ? "✓ Sent" : "Send reply"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
          <span className="mono text-[0.75rem] text-ink-mute">
            {h.id} · {sent ? "replied" : `in the queue · chat ${h.chatId} ended`}
          </span>
          {!sent && (
            <button type="button" className={taken ? "btn btn-ghost" : "btn"} onClick={() => setTaken((t) => !t)}>
              {taken ? "✓ Assigned" : "Take over"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="label mb-1.5 text-ink-mute">{title}</div>
      {children}
    </div>
  );
}

function shipmentLines(p?: ShipmentProfile): [string, string][] {
  if (!p) return [];
  const out: [string, string][] = [];
  if (p.item) out.push(["Item", p.item]);
  if (p.to) out.push(["Route", `${p.from} → ${p.to}${p.zone ? ` (${p.zone})` : ""}`]);
  if (p.weightKg) out.push(["Weight", `${p.weightKg} kg`]);
  if (p.dimsCm) out.push(["Size", `${p.dimsCm.join("×")} cm`]);
  if (p.fragile) out.push(["Fragile", "yes"]);
  if (p.declaredValue) out.push(["Value", `€${p.declaredValue}`]);
  return out;
}
