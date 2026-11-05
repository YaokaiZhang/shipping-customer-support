"use client";

import { useEffect, useRef, useState } from "react";
import ticketsData from "@/data/tickets.json";

interface Ticket {
  id: string;
  message: string;
  category: string;
  resolvableByPolicy: boolean;
  language: "en" | "fi" | "sv";
}

const tickets = ticketsData as Ticket[];
const MIN_PER_TICKET = 6;
const TICKETS_PER_MONTH = 1200;
const STEP_MS = 40;

const CATEGORIES = Array.from(new Set(tickets.map((t) => t.category)));

function tally(upTo: number) {
  const seen = tickets.slice(0, upTo);
  const resolved = seen.filter((t) => t.resolvableByPolicy).length;
  const byCat = CATEGORIES.map((c) => {
    const rows = seen.filter((t) => t.category === c);
    return { category: c, total: rows.length, resolved: rows.filter((t) => t.resolvableByPolicy).length };
  });
  return { seen: seen.length, resolved, byCat };
}

const totals = Object.fromEntries(
  CATEGORIES.map((c) => [c, tickets.filter((t) => t.category === c).length]),
) as Record<string, number>;

export default function RoiPanel() {
  const [n, setN] = useState(tickets.length);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const replay = () => {
    if (timer.current) clearInterval(timer.current);
    setRunning(true);
    setN(0);
    let i = 0;
    timer.current = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= tickets.length) {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        setRunning(false);
      }
    }, STEP_MS);
  };

  const { seen, resolved, byCat } = tally(n);
  const pct = seen ? Math.round((resolved / seen) * 100) : 0;
  const hours = Math.round(((seen ? resolved / seen : 0) * TICKETS_PER_MONTH * MIN_PER_TICKET) / 60);
  const current = running && n > 0 ? tickets[n - 1] : null;

  return (
    <div className="flex flex-col gap-8 p-6">
      <section className="border-b border-line pb-5">
        <div className="flex items-start justify-between gap-4">
          <span className="label">ROI replay</span>
          <button type="button" className="btn" onClick={replay} disabled={running}>
            {running ? "Replaying…" : `Replay ${tickets.length} tickets`}
          </button>
        </div>

        <div className="mt-2 flex items-end gap-5">
          <div className="font-serif leading-none tabular-nums" style={{ fontSize: "5rem", letterSpacing: "-2px" }}>
            {pct}
            <span className="italic">%</span>
          </div>
          <div className="pb-2">
            <div className="font-serif text-lg leading-tight">resolved without a human</div>
            <div className="mono text-sm text-ink-soft">
              {resolved}/{seen} tickets
            </div>
          </div>
        </div>

        <div className="mt-3 font-serif text-2xl" style={{ letterSpacing: "-0.5px" }}>
          ≈ <span className="mono tabular-nums">{hours}</span> <span className="italic">agent-hours / month</span>
        </div>
        <div className="mono mt-1 text-[0.7rem] text-ink-mute">
          {MIN_PER_TICKET} min/ticket · {TICKETS_PER_MONTH.toLocaleString("en-US")} tickets/month (assumed)
        </div>

        <div className="mono mt-4 h-5 truncate text-xs text-ink-soft">
          {current ? (
            <>
              <span className="text-ink-mute">{current.id}</span>{" "}
              <span className={current.resolvableByPolicy ? "text-accent-green" : "text-accent-red"}>
                {current.resolvableByPolicy ? "✓" : "→"}
              </span>{" "}
              {current.message}
            </>
          ) : null}
        </div>
      </section>

      <section>
        <ul className="flex flex-col gap-3">
          {byCat.map((c) => {
            const total = totals[c.category];
            return (
              <li key={c.category}>
                <div className="flex items-baseline justify-between">
                  <span className="font-serif capitalize">{c.category}</span>
                  <span className="mono text-xs text-ink-soft tabular-nums">
                    {c.resolved}/{c.total}
                  </span>
                </div>
                <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-paper-lo">
                  <div
                    className="bg-ink transition-[width] duration-100"
                    style={{ width: `${(c.resolved / total) * 100}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
