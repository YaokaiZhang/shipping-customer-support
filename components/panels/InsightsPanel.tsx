"use client";

import { useMemo, useState } from "react";
import { draftFromGap, groupGaps, groupHandoffs, groupRuleHits, SEED_CONVERSATIONS, SEED_LABEL } from "@/lib/insights";
import { ruleName } from "@/lib/ops-rules";
import { useStore } from "@/lib/store";

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <span className="block h-1 w-full overflow-hidden rounded-full bg-paper-lo">
      <span className="block h-full rounded-full bg-ink" style={{ width: `${max ? Math.max(4, (value / max) * 100) : 0}%` }} />
    </span>
  );
}

/** Marks rows that grew this session; the count lives in the tooltip. */
function Live({ n }: { n: number }) {
  if (!n) return null;
  return <span role="img" className="live-dot self-center" title={`+${n} this session`} aria-label={`${n} new this session`} />;
}

function Head({ title, total }: { title: string; total: number }) {
  return (
    <div className="panel-head">
      <span className="label">{title}</span>
      <span className="mono text-sm text-ink-mute tabular-nums">{total}</span>
    </div>
  );
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
    <div className="flex flex-col gap-8 px-4 py-5 sm:p-6">
      <label
        className="mono -mb-4 flex cursor-pointer items-center justify-end gap-2 self-end text-xs text-ink-mute"
        title={`${SEED_LABEL}, ${SEED_CONVERSATIONS} conversations, merged with this session`}
      >
        <input type="checkbox" className="peer sr-only" checked={withSeed} onChange={(e) => setWithSeed(e.target.checked)} />
        <span className="switch" />
        sample history
      </label>

      {/* a) knowledge gaps: questions with no rule, most asked first */}
      <section>
        <Head title="Knowledge gaps" total={gapGroups.reduce((n, g) => n + g.count, 0)} />
        {gapGroups.length === 0 ? (
          <p className="mt-3 font-serif text-ink-mute">None yet. Try “can you deliver on Sunday?”</p>
        ) : (
          <ol>
            {gapGroups.map((g, i) => (
              <li key={g.topic} className={`group border-b border-line py-2.5 ${g.live ? "rise" : ""}`}>
                <div className="flex items-baseline gap-3">
                  <span className="mono w-5 shrink-0 text-[0.7rem] text-ink-mute tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1 font-serif text-[1.05rem] leading-snug first-letter:uppercase">{g.topic}</span>
                  <Live n={g.live} />
                  <span className="mono w-8 shrink-0 text-right text-sm font-bold tabular-nums">{g.count}</span>
                </div>
                <div className="mt-0.5 flex items-baseline gap-3 pl-8">
                  <p className="mono min-w-0 flex-1 truncate text-xs text-ink-soft" title={g.examples.join("\n")}>
                    {g.examples
                      .slice(0, 2)
                      .map((q) => `“${q}”`)
                      .join("  ")}
                  </p>
                  <button
                    type="button"
                    className="link-btn shrink-0"
                    aria-label={`Draft rule for ${g.topic}`}
                    onClick={() => draftOpsRule(draftFromGap(g))}
                  >
                    draft rule →
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* b) handoffs by intent */}
      <section>
        <Head title="Handovers by intent" total={handoffRows.reduce((n, r) => n + r.count, 0)} />
        {handoffRows.length === 0 ? (
          <p className="mt-3 font-serif text-ink-mute">No handovers yet.</p>
        ) : (
          <ul>
            {handoffRows.map((r) => (
              <li key={r.key} className="border-b border-line py-2">
                <div className="flex items-baseline gap-3">
                  <span className="min-w-0 flex-1 truncate font-serif">{r.key}</span>
                  <Live n={r.live} />
                  <span className="mono w-8 shrink-0 text-right text-sm tabular-nums">{r.count}</span>
                </div>
                <div className="mt-1">
                  <Bar value={r.count} max={maxH} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* c) rule hits */}
      <section>
        <Head title="Rule hits" total={ruleRows.reduce((n, r) => n + r.count, 0)} />
        {ruleRows.length === 0 ? (
          <p className="mt-3 font-serif text-ink-mute">No rules triggered yet.</p>
        ) : (
          <ul>
            {ruleRows.map((r) => (
              <li key={r.key} className="border-b border-line py-2">
                <div className="flex items-baseline gap-3">
                  <span className="mono w-8 shrink-0 text-[0.7rem] text-ink-mute">{r.key}</span>
                  <span className="min-w-0 flex-1 truncate font-serif">{ruleName(r.key, opsRules)}</span>
                  <Live n={r.live} />
                  <span className="mono w-8 shrink-0 text-right text-sm tabular-nums">{r.count}</span>
                </div>
                <div className="mt-1 pl-11">
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
