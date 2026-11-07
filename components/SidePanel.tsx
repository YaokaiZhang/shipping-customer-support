"use client";

import { useEffect, useRef, useState } from "react";
import { ruleName } from "@/lib/ops-rules";
import { useStore, type Tab } from "@/lib/store";
import type { GuardEvent } from "@/lib/types";
import { Parcel } from "./Parcel";
import CompliancePanel from "./panels/CompliancePanel";
import GuidelinesPanel from "./panels/GuidelinesPanel";
import InboxPanel from "./panels/InboxPanel";
import InsightsPanel from "./panels/InsightsPanel";
import LeadsPanel from "./panels/LeadsPanel";
import RoiPanel from "./panels/RoiPanel";

const TABS: { id: Tab; label: string }[] = [
  { id: "parcel", label: "Parcel" },
  { id: "leads", label: "Leads" },
  { id: "inbox", label: "Inbox" },
  { id: "compliance", label: "Compliance" },
  { id: "guide", label: "Guidelines" },
  { id: "insights", label: "Insights" },
  { id: "roi", label: "ROI" },
];

export function SidePanel() {
  const { tab, setTab, unseen } = useStore();
  const activeRef = useRef<HTMLButtonElement>(null);
  // Keep the active tab visible when the bar scrolls (phone width).
  // Scroll only the bar itself: scrollIntoView would also move the page.
  useEffect(() => {
    const el = activeRef.current;
    const bar = el?.parentElement;
    if (!el || !bar) return;
    const left = el.offsetLeft - bar.offsetLeft;
    if (left < bar.scrollLeft || left + el.offsetWidth > bar.scrollLeft + bar.clientWidth)
      bar.scrollTo({ left: left - 16, behavior: "smooth" });
  }, [tab]);
  return (
    <aside className="relative flex min-h-0 flex-col border-t border-line bg-paper-lo/40 lg:border-t-0 lg:border-l">
      <nav className="tabbar scroll-thin flex shrink-0 gap-5 overflow-x-auto px-4 pt-5 sm:gap-6 sm:px-6 sm:pt-6" aria-label="Side panel">
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={tab === t.id ? activeRef : undefined}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 pb-2 text-[0.95rem] transition ${
              tab === t.id ? "border-ink text-ink" : "border-transparent text-ink-mute hover:text-ink"
            }`}
          >
            {t.label}
            {unseen[t.id] > 0 && (
              <span className="mono grid h-4 min-w-4 place-items-center rounded-full bg-accent-orange px-1 text-[0.6rem] leading-none text-white">
                {unseen[t.id]}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="scroll-thin min-h-0 flex-1 lg:overflow-y-auto">
        {tab === "parcel" && <ParcelView />}
        {tab === "leads" && <LeadsPanel />}
        {tab === "inbox" && <InboxPanel />}
        {tab === "compliance" && <CompliancePanel />}
        {tab === "guide" && <GuidelinesPanel />}
        {tab === "insights" && <InsightsPanel />}
        {tab === "roi" && <RoiPanel />}
      </div>
      <Toasts />
    </aside>
  );
}

function ParcelView() {
  const { events, leads, handoffs, quotes, setTab } = useStore();
  const stripped = events.filter((e) => e.action === "stripped").length;
  const stats: { k: string; v: string | number; tab?: Tab }[] = [
    { k: "quotes", v: Object.keys(quotes).length },
    { k: "rule hits", v: events.length, tab: "compliance" },
    { k: "prices stripped", v: stripped, tab: "compliance" },
    { k: "leads/handovers", v: `${leads.length} / ${handoffs.length}`, tab: leads.length ? "leads" : "inbox" },
  ];
  return (
    <div className="flex min-h-full flex-col justify-center px-4 pb-8 sm:px-10">
      <Parcel />
      <div className="mx-auto grid w-full max-w-lg grid-cols-2 border-t border-line sm:grid-cols-4">
        {stats.map((s) => (
          <button
            key={s.k}
            className="group self-start px-2 pt-4 text-left disabled:cursor-default sm:text-center"
            disabled={!s.tab}
            onClick={() => s.tab && setTab(s.tab)}
          >
            <span className="block font-serif text-2xl leading-none tabular-nums group-enabled:group-hover:underline">{s.v}</span>
            <span className="mono mt-1.5 block text-[0.7rem] whitespace-nowrap text-ink-mute">{s.k}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const ACTION: Record<GuardEvent["action"], string> = {
  stripped: "stripped",
  rephrased: "rephrased",
  handed_off: "handed off",
  held: "held",
  routed: "routed",
};

function Toasts() {
  const { events, tab, setTab, opsRules } = useStore();
  const [shown, setShown] = useState<GuardEvent[]>([]);
  const seen = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    const fresh = events.slice(0, events.length - seen.current);
    seen.current = events.length;
    if (!fresh.length) return;
    setShown((s) => [...fresh, ...s].slice(0, 3));
    const ids = fresh.map((e) => e.id);
    // Each batch owns its timer, so a new event never cancels an older toast's dismissal.
    timers.current.push(setTimeout(() => setShown((s) => s.filter((e) => !ids.includes(e.id))), 4500));
  }, [events]);

  if (tab === "compliance" || !shown.length) return null;
  return (
    <div className="pointer-events-none absolute right-5 bottom-5 hidden flex-col items-end gap-2 lg:flex">
      {shown.map((e) => {
        return (
          <button
            key={e.id}
            onClick={() => setTab("compliance")}
            className="rise pointer-events-auto flex items-center gap-2 rounded-md bg-ink px-3 py-2 text-paper shadow-lg"
          >
            <span className="mono rounded-[3px] bg-label-yellow px-1.5 text-[0.72rem] font-bold text-ink">{e.ruleId}</span>
            <span className="text-[0.95rem]">{ruleName(e.ruleId, opsRules)}</span>
            <span className="mono text-[0.75rem] text-paper/60">→ {ACTION[e.action]}</span>
          </button>
        );
      })}
    </div>
  );
}
