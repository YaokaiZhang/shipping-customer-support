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
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  return (
    <div className="flex flex-col gap-10 p-6">
      {/* a) live operations rules */}
      <section>
        <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
          <span className="label">Operations rules · live</span>
          <span className="mono text-sm text-ink-mute">
            {active} active
          </span>
        </div>
        <p className="mt-3 font-serif leading-snug text-ink-soft">
          Applied from the customer&apos;s very next message. No redeploy.
        </p>

        {opsRules.length === 0 ? (
          <p className="mt-4 font-serif text-ink-mute">No operations rules yet. Add one below or tap a preset.</p>
        ) : (
          <ul className="mt-3">
            {opsRules.map((r, i) => (
              <li key={r.id} className={`border-b border-line py-3 ${r.enabled ? "" : "opacity-50"}`}>
                <div className="flex items-start gap-3">
                  <span className="sticker sticker-ink mt-0.5 shrink-0" style={{ transform: `rotate(${i % 2 ? 1.5 : -1.5}deg)` }}>
                    {r.id}
                  </span>
                  {editing === r.id ? (
                    <form
                      className="flex min-w-0 flex-1 flex-col gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        saveEdit();
                      }}
                    >
                      <textarea
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
                      <div className="flex gap-2">
                        <button type="submit" className="btn px-3 py-1 text-sm" disabled={!editText.trim()}>
                          Save
                        </button>
                        <button type="button" className="btn btn-ghost px-3 py-1 text-sm" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <p className={`min-w-0 flex-1 font-serif leading-snug break-words ${r.enabled ? "" : "line-through"}`}>{r.text}</p>
                  )}
                  {hits[r.id] > 0 && editing !== r.id && (
                    <span className="mono shrink-0 pt-0.5 text-xs font-bold" title="Times applied this session">
                      ×{hits[r.id]}
                    </span>
                  )}
                </div>
                {editing !== r.id && (
                  <div className="mt-2 flex items-center gap-4 pl-12">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={r.enabled}
                        onChange={(e) => update(r.id, { enabled: e.target.checked })}
                      />
                      <span className="relative h-4 w-7 rounded-full border border-ink bg-paper-lo transition peer-checked:bg-accent-green peer-focus-visible:outline-2 after:absolute after:top-[1px] after:left-[1px] after:h-3 after:w-3 after:rounded-full after:bg-ink after:transition peer-checked:after:translate-x-3" />
                      <span className="mono text-xs text-ink-mute">{r.enabled ? "on" : "off"}</span>
                    </label>
                    <button
                      type="button"
                      className="mono text-xs text-ink-mute underline-offset-2 hover:text-ink hover:underline"
                      onClick={() => {
                        setEditing(r.id);
                        setEditText(r.text);
                      }}
                    >
                      edit
                    </button>
                    <button
                      type="button"
                      className="mono text-xs text-ink-mute underline-offset-2 hover:text-accent-red hover:underline"
                      onClick={() => remove(r.id)}
                    >
                      delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <form
          className="mt-5 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add(text);
          }}
        >
          <label htmlFor="ops-new" className="label text-ink-mute">
            New rule
          </label>
          <textarea
            id="ops-new"
            ref={inputRef}
            rows={2}
            maxLength={MAX_OPS_RULE_CHARS}
            value={text}
            placeholder="e.g. No deliveries to Åland this week"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                add(text);
              }
            }}
            className="card w-full resize-none px-3 py-2 font-serif leading-snug outline-none placeholder:text-ink-mute focus:border-ink"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="mono text-xs text-ink-mute">
              {full ? `max ${MAX_OPS_RULES} rules` : `${text.length}/${MAX_OPS_RULE_CHARS}`}
            </span>
            <button type="submit" className="btn px-4 py-1.5 text-base" disabled={!text.trim() || full}>
              Add rule
            </button>
          </div>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          {OPS_PRESETS.filter((p) => !opsRules.some((r) => r.text === p)).map((p) => (
            <button key={p} type="button" className="chip text-[0.9rem]" disabled={full} onClick={() => add(p)}>
              + {p}
            </button>
          ))}
        </div>

        <p className="mono mt-5 text-[0.72rem] leading-relaxed text-ink-mute">
          The live agent reads every rule word for word. The scripted fallback (no API key) only honours them approximately, by
          matching place names and keywords.
        </p>
      </section>

      {/* b) company guidelines (read-only) */}
      <section>
        <div className="flex items-baseline justify-between border-b border-line pb-3">
          <span className="label">Company guidelines</span>
          <span className="mono text-xs text-ink-mute">read-only</span>
        </div>
        <ul>
          {rules.map((r) => (
            <li key={r.id} className="flex items-start gap-3 border-b border-line py-2.5">
              <span className="mono w-10 shrink-0 pt-0.5 text-xs font-bold">{r.id}</span>
              <div className="min-w-0 flex-1">
                <p className="font-serif leading-snug">{r.short}</p>
                <p className="mt-0.5 text-[0.9rem] leading-snug text-ink-soft">{r.text}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mono mt-3 text-[0.72rem] leading-relaxed text-ink-mute">
          Operations rules override defaults, never G-1 (engine prices) or G-8 (stay in role).
        </p>
      </section>
    </div>
  );
}
