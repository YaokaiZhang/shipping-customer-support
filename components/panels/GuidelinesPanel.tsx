"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import rulesData from "@/data/rules.json";
import { MAX_OPS_RULE_CHARS, MAX_OPS_RULES, OPS_PRESETS } from "@/lib/ops-rules";
import { useStore } from "@/lib/store";
import type { OpsRule, Rule } from "@/lib/types";

const rules = rulesData as Rule[];

const nextId = (ops: OpsRule[]) => `O-${ops.reduce((n, r) => Math.max(n, Number(r.id.slice(2)) || 0), 0) + 1}`;

export default function GuidelinesPanel() {
  const { opsRules, setOpsRules, opsDraft, draftOpsRule, events } = useStore();
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // "Draft rule" from Insights lands here.
  useEffect(() => {
    if (opsDraft === null) return;
    setText(opsDraft);
    draftOpsRule(null);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, [opsDraft, draftOpsRule]);

  const hits = useMemo(() => {
    const c: Record<string, number> = {};
    events.forEach((e) => (c[e.ruleId] = (c[e.ruleId] ?? 0) + 1));
    return c;
  }, [events]);

  const full = opsRules.length >= MAX_OPS_RULES;
  const add = (t: string) => {
    const clean = t.trim().slice(0, MAX_OPS_RULE_CHARS);
    if (!clean || full) return;
    setOpsRules([...opsRules, { id: nextId(opsRules), text: clean, enabled: true }]);
    setText("");
  };
  const update = (id: string, patch: Partial<OpsRule>) => setOpsRules(opsRules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => setOpsRules(opsRules.filter((r) => r.id !== id));
  const saveEdit = () => {
    const clean = editText.trim().slice(0, MAX_OPS_RULE_CHARS);
    if (editing && clean) update(editing, { text: clean });
    setEditing(null);
  };

  const active = opsRules.filter((r) => r.enabled).length;
  const presets = OPS_PRESETS.filter((p) => !opsRules.some((r) => r.text === p));
  const nearLimit = text.length > MAX_OPS_RULE_CHARS - 40;

  return (
    <div className="flex flex-col gap-8 px-4 py-5 sm:p-6">
      {/* a) live operations rules */}
      <section>
        <div
          className="panel-head"
          title="Applied from the customer's next message. The scripted fallback (no API key) only matches place names and keywords."
        >
          <span className="label">Operations rules</span>
          <span className="mono flex items-center gap-1.5 text-xs text-ink-mute">
            {active > 0 && <span className="live-dot !bg-accent-green" />}
            {active} live
          </span>
        </div>

        {opsRules.length > 0 && (
          <ul>
            {opsRules.map((r) => (
              <li key={r.id} className="border-b border-line py-2">
                {editing === r.id ? (
                  <form
                    className="flex flex-col gap-2 py-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveEdit();
                    }}
                  >
                    <label htmlFor={`ops-edit-${r.id}`} className="sr-only">
                      Edit rule {r.id}
                    </label>
                    <textarea
                      id={`ops-edit-${r.id}`}
                      autoFocus
                      rows={2}
                      maxLength={MAX_OPS_RULE_CHARS}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          saveEdit();
                        }
                        if (e.key === "Escape") setEditing(null);
                      }}
                      className="card w-full resize-none px-3 py-2 font-serif leading-snug outline-none focus:border-ink"
                    />
                    <div className="flex items-center gap-4">
                      <button type="submit" className="btn px-3 py-0.5 text-sm" disabled={!editText.trim()}>
                        Save
                      </button>
                      <button type="button" className="link-btn" onClick={() => setEditing(null)}>
                        cancel
                      </button>
                      <button type="button" className="link-btn ml-auto hover:!text-accent-red" onClick={() => remove(r.id)}>
                        delete
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="mono w-8 shrink-0 text-[0.7rem] text-ink-mute">{r.id}</span>
                    <button
                      type="button"
                      title="Edit"
                      className={`min-w-0 flex-1 text-left font-serif leading-snug break-words hover:underline hover:decoration-line ${
                        r.enabled ? "" : "text-ink-mute line-through"
                      }`}
                      onClick={() => {
                        setEditing(r.id);
                        setEditText(r.text);
                      }}
                    >
                      {r.text}
                    </button>
                    {hits[r.id] > 0 && (
                      <span className="mono shrink-0 text-xs font-bold tabular-nums" title="Times applied this session">
                        ×{hits[r.id]}
                      </span>
                    )}
                    <label className="flex shrink-0 cursor-pointer items-center" title={r.enabled ? "On" : "Off"}>
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={r.enabled}
                        aria-label={`Rule ${r.id} enabled`}
                        onChange={(e) => update(r.id, { enabled: e.target.checked })}
                      />
                      <span className="switch" />
                    </label>
                    <button
                      type="button"
                      title="Delete rule"
                      aria-label={`Delete rule ${r.id}`}
                      className="mono -mr-1 shrink-0 px-1 text-lg leading-none text-ink-mute hover:text-accent-red"
                      onClick={() => remove(r.id)}
                    >
                      ×
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <form
          className="mt-3 flex items-stretch gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add(text);
          }}
        >
          <label htmlFor="ops-new" className="sr-only">
            New rule
          </label>
          <input
            id="ops-new"
            ref={inputRef}
            maxLength={MAX_OPS_RULE_CHARS}
            value={text}
            disabled={full}
            placeholder={full ? `Max ${MAX_OPS_RULES} rules` : "Add a rule…"}
            onChange={(e) => setText(e.target.value)}
            className="card min-w-0 flex-1 px-3 py-1.5 font-serif outline-none placeholder:text-ink-mute focus:border-ink"
          />
          <button type="submit" className="btn px-4 py-0 text-base" disabled={!text.trim() || full}>
            Add
          </button>
        </form>
        {nearLimit && (
          <div className="mono mt-1 text-right text-[0.7rem] text-ink-mute">
            {text.length}/{MAX_OPS_RULE_CHARS}
          </div>
        )}

        {presets.length > 0 && !full && (
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="mono text-[0.7rem] text-ink-mute">try</span>
            {presets.map((p) => (
              <button key={p} type="button" className="link-btn text-left !whitespace-normal" onClick={() => add(p)}>
                + {p}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* b) company guidelines (read-only) */}
      <section>
        <div className="panel-head" title="Operations rules override these, except G-1 (engine prices) and G-8 (stay in role).">
          <span className="label">Company guidelines</span>
          <span className="mono text-xs text-ink-mute">read-only</span>
        </div>
        <ul>
          {rules.map((r) => (
            <li key={r.id} className="border-b border-line">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-baseline gap-3 py-2 [&::-webkit-details-marker]:hidden">
                  <span className="mono w-8 shrink-0 text-[0.7rem] text-ink-mute">{r.id}</span>
                  <span className="min-w-0 flex-1 font-serif leading-snug">{r.short}</span>
                  <span className="mono text-xs text-ink-mute transition group-open:rotate-90">›</span>
                </summary>
                <p className="pb-2.5 pl-11 text-[0.92rem] leading-snug text-ink-soft">{r.text}</p>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
