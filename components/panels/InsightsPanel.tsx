"use client";

import { useMemo, useState } from "react";
import { draftFromGap, groupGaps, groupHandoffs, groupRuleHits, SEED_CONVERSATIONS, SEED_LABEL } from "@/lib/insights";
import { ruleName } from "@/lib/ops-rules";
import { useStore } from "@/lib/store";

const tilt = (i: number) => ({ transform: `rotate(${[-2, 1.5, -1, 2][i % 4]}deg)` });

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-paper-lo">
      <span className="block h-full rounded-full bg-ink" style={{ width: `${max ? Math.max(4, (value / max) * 100) : 0}%` }} />
    </span>
  );
}

function LiveTag({ n }: { n: number }) {
  if (!n) return null;
  return <span className="mono rounded-[3px] bg-accent-orange px-1.5 text-[0.65rem] font-bold text-white">+{n} live</span>;
}

export default function InsightsPanel() {
  const { gaps, handoffs, events, opsRules, draftOpsRule } = useStore();
  const [withSeed, setWithSeed] = useState(true);

  const gapGroups = useMemo(() => groupGaps(gaps, withSeed), [gaps, withSeed]);
  const handoffRows = useMemo(() => groupHandoffs(handoffs, withSeed), [handoffs, withSeed]);
  const ruleRows = useMemo(() => groupRuleHits(events, withSeed), [events, withSeed]);
  const maxH = Math.max(0, ...handoffRows.map((r) => r.count));
  const maxR = Math.max(0, ...ruleRows.map((r) => r.count));

  return (
    <div className="flex flex-col gap-10 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-serif leading-snug text-ink-soft">What customers ask that we have no rule for.</p>
        <label className="mono flex cursor-pointer items-center gap-2 text-xs text-ink-mute">
          <input type="checkbox" checked={withSeed} onChange={(e) => setWithSeed(e.target.checked)} className="accent-ink" />
          include sample history
        </label>
      </div>
      {withSeed && (
        <p className="-mt-8 mono text-[0.72rem] text-ink-mute">
          Sample data: {SEED_LABEL}, {SEED_CONVERSATIONS} conversations, merged with this session.
        </p>
      )}

      {/* a) knowledge gaps */}
      <section>
        <div className="flex items-baseline justify-between border-b border-line pb-3">
          <span className="label">Knowledge gaps</span>
          <span className="mono text-sm text-ink-mute">{gapGroups.reduce((n, g) => n + g.count, 0)}</span>
        </div>
        {gapGroups.length === 0 ? (
          <p className="mt-4 font-serif text-ink-mute">No gaps yet. Try asking “can you deliver on Sunday?”</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {gapGroups.map((g, i) => (
              <li key={g.topic} className={`card p-4 ${g.live ? "rise" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-serif text-lg leading-snug">
                      Customers keep asking about <span className="italic">{g.topic.toLowerCase()}</span>
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="mono text-xs text-ink-mute">
                        {g.count} time{g.count === 1 ? "" : "s"} · no rule
                      </span>
                      <LiveTag n={g.live} />
                    </div>
                  </div>
                  <span className="sticker sticker-red shrink-0" style={tilt(i)}>
                    ×{g.count}
                  </span>
                </div>
                <ul className="mt-3 space-y-1 border-l-2 border-line pl-3">
                  {g.examples.slice(0, 3).map((q) => (
                    <li key={q} className="mono truncate text-xs text-ink-soft">
                      “{q}”
                    </li>
                  ))}
                </ul>
                <button type="button" className="btn btn-ghost mt-3 px-3 py-1 text-sm" onClick={() => draftOpsRule(draftFromGap(g))}>
                  Draft rule →
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* b) handoffs by intent */}
      <section>
        <div className="flex items-baseline justify-between border-b border-line pb-3">
          <span className="label">Handovers by intent</span>
          <span className="mono text-sm text-ink-mute">{handoffRows.reduce((n, r) => n + r.count, 0)}</span>
        </div>
        {handoffRows.length === 0 ? (
          <p className="mt-4 font-serif text-ink-mute">No handovers yet.</p>
        ) : (
          <ul>
            {handoffRows.map((r) => (
              <li key={r.key} className="border-b border-line py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-serif">{r.key}</span>
                  <span className="flex items-center gap-2">
                    <LiveTag n={r.live} />
                    <span className="mono text-sm">{r.count}</span>
                  </span>
                </div>
                <div className="mt-1.5">
                  <Bar value={r.count} max={maxH} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* c) rule hits */}
      <section>
        <div className="flex items-baseline justify-between border-b border-line pb-3">
          <span className="label">Rule hits</span>
          <span className="mono text-sm text-ink-mute">{ruleRows.reduce((n, r) => n + r.count, 0)}</span>
        </div>
        {ruleRows.length === 0 ? (
          <p className="mt-4 font-serif text-ink-mute">No rules triggered yet.</p>
        ) : (
          <ul>
            {ruleRows.map((r) => (
              <li key={r.key} className="border-b border-line py-2.5">
                <div className="flex items-baseline gap-3">
                  <span className="mono w-10 shrink-0 text-xs font-bold">{r.key}</span>
                  <span className="min-w-0 flex-1 truncate font-serif">{ruleName(r.key, opsRules)}</span>
                  <LiveTag n={r.live} />
                  <span className="mono text-sm">{r.count}</span>
                </div>
                <div className="mt-1.5 pl-13">
                  <Bar value={r.count} max={maxR} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
