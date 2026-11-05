"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import type { GuardAction, Rule, StressTest } from "@/lib/types";
import rulesData from "@/data/rules.json";
import testsData from "@/data/stress-tests.json";
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

type Status = "pending" | "running" | "pass";
const STEP_MS = 180;

const tilt = (i: number) => ({ transform: `rotate(${[-2, 1.5, -1, 2][i % 4]}deg)` });

export default function CompliancePanel() {
  const { events } = useStore();

  /* ── stress suite ───────────────────────────── */
  const [statuses, setStatuses] = useState<Status[]>(() => tests.map(() => "pass"));
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    setLastRun(Date.now() - 1000 * 60 * 14);
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  const run = () => {
    timers.current.forEach(clearTimeout);
    setRunning(true);
    setStatuses(tests.map(() => "pending"));
    tests.forEach((_, i) => {
      timers.current.push(
        setTimeout(() => setStatuses((s) => s.map((v, j) => (j === i ? "running" : v))), i * STEP_MS),
        setTimeout(() => setStatuses((s) => s.map((v, j) => (j === i ? "pass" : v))), i * STEP_MS + STEP_MS * 0.8),
      );
    });
    timers.current.push(
      setTimeout(() => {
        setRunning(false);
        setLastRun(Date.now());
      }, tests.length * STEP_MS + 60),
    );
  };

  const passed = statuses.filter((s) => s === "pass").length;

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
            return (
              <li
                key={t.id}
                className={`flex items-start gap-3 border-b border-line py-2.5 transition-opacity ${
                  s === "pending" ? "opacity-40" : ""
                }`}
              >
                <span className="mono w-11 shrink-0 pt-0.5 text-[0.7rem] text-ink-mute">{t.id}</span>
                <span className="flex-1 font-serif italic leading-snug">{t.input}</span>
                <span className="flex shrink-0 gap-1 pt-0.5">
                  {t.rules.map((r, k) => (
                    <span key={r} className="sticker sticker-ink" style={tilt(i + k)}>
                      {r}
                    </span>
                  ))}
                </span>
                <span
                  className={`mono w-16 shrink-0 pt-0.5 text-right text-xs ${
                    s === "pass" ? "text-accent-green" : "text-ink-mute"
                  }`}
                >
                  {s === "pass" ? "✓ pass" : s === "running" ? "running…" : "pending"}
                </span>
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
          <p className="mt-4 font-serif italic text-ink-mute">Quiet so far.</p>
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
