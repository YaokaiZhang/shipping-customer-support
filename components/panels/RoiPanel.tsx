"use client";

import { useEffect, useRef, useState } from "react";
import ticketsData from "@/data/tickets.json";
import saved from "@/data/roi-results.json";
import type { RoiVerdict } from "@/lib/types";

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

const ok = (v?: RoiVerdict) => !!v && v.route !== "human";

function tally(upTo: number, verdicts: RoiVerdict[]) {
  const seen = tickets.slice(0, upTo);
  const resolved = seen.filter((_, i) => ok(verdicts[i])).length;
  const byCat = CATEGORIES.map((c) => {
    const idx = seen.map((t, i) => (t.category === c ? i : -1)).filter((i) => i >= 0);
    return { category: c, total: idx.length, resolved: idx.filter((i) => ok(verdicts[i])).length };
  });
  const agree = seen.filter((t, i) => ok(verdicts[i]) === t.resolvableByPolicy).length;
  const sales = seen.filter((_, i) => verdicts[i]?.route === "sales").length;
  return { seen: seen.length, resolved, byCat, agree, sales };
}

const savedVerdicts = saved.verdicts as RoiVerdict[];

const totals = Object.fromEntries(
  CATEGORIES.map((c) => [c, tickets.filter((t) => t.category === c).length]),
) as Record<string, number>;

export default function RoiPanel() {
  const [n, setN] = useState(tickets.length);
  const [verdicts, setVerdicts] = useState<RoiVerdict[]>(savedVerdicts);
  const [phase, setPhase] = useState<"idle" | "classifying" | "replaying" | "error">("idle");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const running = phase === "classifying" || phase === "replaying";

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const replay = async () => {
    if (timer.current) clearInterval(timer.current);
    setPhase("classifying");
    setN(0);
    let next: RoiVerdict[];
    try {
      const res = await fetch("/api/roi", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      next = (await res.json()).verdicts;
    } catch {
      setPhase("error");
      setN(tickets.length);
      return;
    }
    setVerdicts(next);
    setPhase("replaying");
    let i = 0;
    timer.current = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= tickets.length) {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        setPhase("idle");
      }
    }, STEP_MS);
  };

  const { seen, resolved, byCat, agree, sales } = tally(n, verdicts);
  const pct = seen ? Math.round((resolved / seen) * 100) : 0;
  const hours = Math.round(((seen ? resolved / seen : 0) * TICKETS_PER_MONTH * MIN_PER_TICKET) / 60);
  const current = phase === "replaying" && n > 0 ? tickets[n - 1] : null;
  const currentV = current ? verdicts[n - 1] : undefined;

  return (
    <div className="flex flex-col gap-8 p-6">
      <section className="border-b border-line pb-5">
        <div className="flex items-start justify-between gap-4">
          <span className="label">ROI replay</span>
          <button type="button" className="btn" onClick={replay} disabled={running}>
            {phase === "classifying" ? "Classifying…" : phase === "replaying" ? "Replaying…" : `Replay ${tickets.length} tickets`}
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
              {resolved}/{seen} tickets{sales ? ` · ${sales} as leads` : ""}
            </div>
          </div>
        </div>

        <div className="mt-3 font-serif text-2xl" style={{ letterSpacing: "-0.5px" }}>
          ≈ <span className="mono tabular-nums">{hours}</span> <span className="italic">agent-hours / month</span>
        </div>
        <div className="mono mt-1 text-[0.7rem] text-ink-mute">
          {MIN_PER_TICKET} min/ticket · {TICKETS_PER_MONTH.toLocaleString("en-US")} tickets/month (assumed)
          {seen === tickets.length && ` · matches hand labels ${agree}/${seen}`}
        </div>

        <div className="mono mt-4 h-5 truncate text-xs text-ink-soft">
          {current ? (
            <>
              <span className="text-ink-mute">{current.id}</span>{" "}
              <span className={ok(currentV) ? "text-accent-green" : "text-accent-red"}>{ok(currentV) ? "✓" : "→"}</span>{" "}
              {current.message}
            </>
          ) : phase === "error" ? (
            <span className="text-accent-red">Couldn&apos;t reach the model. Showing the last run.</span>
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
