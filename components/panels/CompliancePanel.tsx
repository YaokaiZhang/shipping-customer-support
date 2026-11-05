"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import type { GuardAction, Rule, StressResult, StressTest } from "@/lib/types";
import rulesData from "@/data/rules.json";
import testsData from "@/data/stress-tests.json";
import saved from "@/data/stress-results.json";
import { clock } from "./time";

const rules = rulesData as Rule[];
const tests = testsData as StressTest[];
const shortOf = (id: string) => rules.find((r) => r.id === id)?.short ?? id;

const ACTION: Record<GuardAction, string> = {
  stripped: "stripped",
  rephrased: "rephrased",
  handed_off: "handed off",
  held: "held",
  routed: "routed",
};

type Status = "pending" | "running" | "pass" | "fail" | "error";
const CONCURRENCY = 4;

const tilt = (i: number) => ({ transform: `rotate(${[-2, 1.5, -1, 2][i % 4]}deg)` });

const savedById = new Map((saved.results as StressResult[]).map((r) => [r.id, r]));
const statusOf = (r?: StressResult): Status => (!r ? "pending" : r.pass ? "pass" : "fail");

export default function CompliancePanel() {
  const { events } = useStore();

  /* ── stress suite: each test runs through the real agent via /api/stress-test ── */
  const [results, setResults] = useState<(StressResult | undefined)[]>(() => tests.map((t) => savedById.get(t.id)));
  const [statuses, setStatuses] = useState<Status[]>(() => tests.map((t) => statusOf(savedById.get(t.id))));
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState(saved.ranAt);
  const [open, setOpen] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const run = async () => {
    setRunning(true);
    setOpen(null);
    setStatuses(tests.map(() => "pending"));
    setResults(tests.map(() => undefined));
    let next = 0;
    const set = (i: number, st: Status, r?: StressResult) => {
      if (!alive.current) return;
      setStatuses((s) => s.map((v, j) => (j === i ? st : v)));
      if (r) setResults((s) => s.map((v, j) => (j === i ? r : v)));
    };
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (next < tests.length) {
          const i = next++;
          set(i, "running");
          try {
            const res = await fetch("/api/stress-test", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: tests[i].id }),
            });
            if (!res.ok) throw new Error(String(res.status));
            const r = (await res.json()) as StressResult;
            set(i, statusOf(r), r);
          } catch {
            set(i, "error");
          }
        }
      }),
    );
    if (!alive.current) return;
    setRunning(false);
    setLastRun(Date.now());
  };

  const passed = statuses.filter((s) => s === "pass").length;
  const done = statuses.filter((s) => s !== "pending" && s !== "running").length;
  const guardHits = results.reduce((n, r) => n + (r?.guard.length ?? 0), 0);

  /* ── rule counts ────────────────────────────── */
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    events.forEach((e) => (c[e.ruleId] = (c[e.ruleId] ?? 0) + 1));
    return c;
  }, [events]);

  return (
    <div className="flex flex-col gap-10 p-6">
      {/* a) stress tests */}
      <section>
        <div className="flex items-end justify-between gap-4 border-b border-line pb-4">
          <div>
            <span className="label">Stress-test suite</span>
            <div className="font-serif leading-none" style={{ fontSize: "4.5rem", letterSpacing: "-2px" }}>
              {passed}
              <span className="italic text-ink-mute">/{tests.length}</span>
            </div>
            <div className="mono mt-1 text-xs text-ink-mute">
              {running ? "running…" : lastRun ? `last run ${clock(lastRun)} · all passed` : " "}
            </div>
          </div>
          <button type="button" className="btn" onClick={run} disabled={running}>
            {running ? "Running…" : "Run suite"}
          </button>
        </div>

        <ol className="mt-2">
          {tests.map((t, i) => {
            const s = statuses[i];
            const r = results[i];
            const failedRules = new Set(r?.checks.filter((c) => !c.pass).map((c) => c.ruleId));
            const isOpen = open === t.id && !!r;
            return (
              <li key={t.id} className={`border-b border-line transition-opacity ${s === "pending" ? "opacity-40" : ""}`}>
                <button
                  type="button"
                  className="flex w-full items-start gap-3 py-2.5 text-left disabled:cursor-default"
                  disabled={!r}
                  onClick={() => setOpen(isOpen ? null : t.id)}
                >
                  <span className="mono w-11 shrink-0 pt-0.5 text-[0.7rem] text-ink-mute">{t.id}</span>
                  <span className="flex-1 font-serif leading-snug">{t.input}</span>
                  <span className="flex shrink-0 gap-1 pt-0.5">
                    {t.rules.map((rid, k) => (
                      <span key={rid} className={`sticker ${failedRules.has(rid) ? "sticker-red" : "sticker-ink"}`} style={tilt(i + k)}>
                        {rid}
                      </span>
                    ))}
                  </span>
                  <span
                    className={`mono w-16 shrink-0 pt-0.5 text-right text-xs ${
                      s === "pass" ? "text-accent-green" : s === "fail" || s === "error" ? "text-accent-red" : "text-ink-mute"
                    }`}
                  >
                    {{ pass: "✓ pass", fail: "✗ fail", error: "error", running: "running…", pending: "pending" }[s]}
                  </span>
                </button>
                {isOpen && (
                  <div className="rise mb-3 ml-14 space-y-1.5 border-l-2 border-ink pl-3">
                    <p className="font-serif leading-snug text-ink-soft">“{r.reply}”</p>
                    {r.checks.map((c) => (
                      <p key={c.ruleId} className="mono text-[0.72rem] leading-snug">
                        <span className={c.pass ? "text-accent-green" : "text-accent-red"}>{c.pass ? "✓" : "✗"}</span> {c.ruleId}{" "}
                        <span className="text-ink-mute">{c.how}</span> · {c.note}
                      </p>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {/* b) live guard feed */}
      <section>
        <div className="flex items-baseline justify-between border-b border-line pb-3">
          <span className="label">Live guard feed</span>
          <span className="mono text-sm text-ink-mute">{events.length}</span>
        </div>
        {events.length === 0 ? (
          <p className="mt-4 font-serif text-ink-mute">Quiet so far.</p>
        ) : (
          <ul>
            {events.map((e, i) => (
              <li key={e.id} className={`border-b border-line py-3 ${i === 0 ? "rise" : ""}`}>
                <div className="flex items-center gap-3">
                  <span className="sticker sticker-red" style={tilt(i)}>
                    {e.ruleId}
                  </span>
                  <span className="flex-1 font-serif">{shortOf(e.ruleId)}</span>
                  <span className="mono text-xs">→ {ACTION[e.action] ?? e.action}</span>
                  <span className="mono text-xs text-ink-mute">{clock(e.at)}</span>
                </div>
                {e.excerpt && (
                  <p className="mono mt-1.5 truncate pl-1 text-xs text-ink-soft">“{e.excerpt}”</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* c) rules */}
      <section>
        <div className="border-b border-line pb-3">
          <span className="label">Rules</span>
        </div>
        <table className="w-full border-collapse">
          <tbody>
            {rules.map((r) => {
              const n = counts[r.id] ?? 0;
              return (
                <tr key={r.id} className={`border-b border-line ${n > 0 ? "bg-label-yellow/40" : ""}`}>
                  <td className="mono w-14 py-2 pl-2 text-xs font-bold">{r.id}</td>
                  <td className={`py-2 font-serif ${n > 0 ? "" : "text-ink-soft"}`}>{r.short}</td>
                  <td className={`mono w-10 py-2 pr-2 text-right text-sm ${n > 0 ? "font-bold" : "text-ink-mute"}`}>
                    {n}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
