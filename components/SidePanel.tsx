"use client";

import { useEffect, useRef, useState } from "react";
import rules from "@/data/rules.json";
import { useStore, type Tab } from "@/lib/store";
import type { GuardEvent } from "@/lib/types";
import { Parcel } from "./Parcel";
import CompliancePanel from "./panels/CompliancePanel";
import InboxPanel from "./panels/InboxPanel";
import LeadsPanel from "./panels/LeadsPanel";
import RoiPanel from "./panels/RoiPanel";

const TABS: { id: Tab; label: string }[] = [
  { id: "parcel", label: "Parcel" },
  { id: "leads", label: "Sales leads" },
  { id: "inbox", label: "Agent inbox" },
  { id: "compliance", label: "Compliance" },
  { id: "roi", label: "ROI" },
];

export function SidePanel() {
  const { tab, setTab, unseen } = useStore();
  return (
    <aside className="relative flex min-h-0 flex-col border-t border-line bg-paper-lo/40 lg:border-t-0 lg:border-l">
      <nav className="scroll-thin flex shrink-0 gap-6 overflow-x-auto px-6 pt-6 sm:px-8">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`label relative shrink-0 border-b-2 pb-2 transition ${
              tab === t.id ? "border-ink text-ink" : "border-transparent text-ink-mute hover:text-ink"
            }`}
          >
            {t.label}
            {unseen[t.id] > 0 && (
              <span className="mono absolute -top-2 -right-3.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent-orange px-1 text-[0.62rem] text-white">
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
    { k: "Quotes issued", v: Object.keys(quotes).length },
    { k: "Rules triggered", v: events.length, tab: "compliance" },
    { k: "Prices stripped", v: stripped, tab: "compliance" },
    { k: "Leads / handovers", v: `${leads.length} / ${handoffs.length}`, tab: leads.length ? "leads" : "inbox" },
  ];
  return (
    <div className="flex min-h-full flex-col justify-center px-6 pb-8 sm:px-10">
      <Parcel />
      <dl className="mx-auto grid w-full max-w-md grid-cols-2 gap-x-8 gap-y-5">
        {stats.map((s) => (
          <button key={s.k} className="text-left disabled:cursor-default" disabled={!s.tab} onClick={() => s.tab && setTab(s.tab)}>
            <dt className="label">{s.k}</dt>
            <dd className="mono mt-1 text-lg">{s.v}</dd>
          </button>
        ))}
      </dl>
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
  const { events, tab, setTab } = useStore();
  const [shown, setShown] = useState<GuardEvent[]>([]);
  const seen = useRef(0);

  useEffect(() => {
    const fresh = events.slice(0, events.length - seen.current);
    seen.current = events.length;
    if (!fresh.length) return;
    setShown((s) => [...fresh, ...s].slice(0, 3));
    const ids = fresh.map((e) => e.id);
    const t = setTimeout(() => setShown((s) => s.filter((e) => !ids.includes(e.id))), 4500);
    return () => clearTimeout(t);
  }, [events]);

  if (tab === "compliance" || !shown.length) return null;
  return (
    <div className="pointer-events-none absolute right-5 bottom-5 hidden flex-col items-end gap-2 lg:flex">
      {shown.map((e) => {
        const r = rules.find((x) => x.id === e.ruleId);
        return (
          <button
            key={e.id}
            onClick={() => setTab("compliance")}
            className="rise pointer-events-auto flex items-center gap-2 rounded-md bg-ink px-3 py-2 text-paper shadow-lg"
          >
            <span className="mono rounded-[3px] bg-label-yellow px-1.5 text-[0.72rem] font-bold text-ink">{e.ruleId}</span>
            <span className="text-[0.95rem]">{r?.short}</span>
            <span className="mono text-[0.75rem] text-paper/60">→ {ACTION[e.action]}</span>
          </button>
        );
      })}
    </div>
  );
}
