"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import type { Block, Chip, Message } from "@/lib/types";
import { EstimateCard } from "./EstimateCard";
import { QuoteCard } from "./QuoteCard";
import { BookingFormCard } from "./BookingForm";
import { LabelCard } from "./LabelCard";
import { TrackingCard } from "./TrackingCard";
import { VolumeQuoteCard } from "./VolumeQuoteCard";

const DEMO_PHOTO = "/demo/vase-a4.jpg";
const STARTERS = [
  "I want to send my grandma a vase.",
  "We're a small webshop sending ~50 parcels a week to Sweden.",
  "I'm shipping a laptop battery, just send it normally.",
  "I want a refund, my parcel never came.",
  "Where's my parcel?",
];

export function Chat() {
  const { messages, busy, send, newChat, chatId } = useStore();
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  const submit = (t = text) => {
    const v = t.trim();
    if (!v || busy) return;
    setText("");
    send({ kind: "text", text: v });
  };

  const onChip = (c: Chip) => {
    if (c.action === "demo-photo") return send({ kind: "image", imageUrl: c.imageUrl ?? DEMO_PHOTO, demo: true });
    if (c.action === "upload") return fileRef.current?.click();
    submit(c.label);
  };

  const onFile = (f?: File) => {
    if (!f) return;
    send({ kind: "image", imageUrl: URL.createObjectURL(f), demo: false });
    if (fileRef.current) fileRef.current.value = "";
  };

  const lastId = messages.at(-1)?.id;

  return (
    <section className="flex h-dvh min-h-0 flex-col lg:h-auto">
      <header className="flex items-center justify-between px-6 pt-5 pb-3 sm:px-10">
        <Wordmark />
        <div className="flex items-center gap-4">
          <span className="mono hidden text-xs text-ink-mute sm:inline">{chatId}</span>
          <button className="btn btn-ghost !px-3 !py-1 !text-[0.95rem]" onClick={newChat} disabled={!messages.length}>
            New chat
          </button>
        </div>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 sm:px-10">
        {!messages.length ? (
          <div className="flex min-h-full flex-col justify-center py-10">
            <h1 className="font-display text-[clamp(3.2rem,7vw,5.4rem)] leading-[0.85] font-medium tracking-[-2px]">
              <span className="block">Send</span>
              <span className="-ml-1 block italic">anything.</span>
            </h1>
            <div className="mt-10 flex max-w-xl flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button key={s} className="chip" onClick={() => submit(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-[720px] space-y-6 py-6">
            {messages.map((m) => (
              <MessageView key={m.id} m={m} chipsActive={m.id === lastId && !busy} onChip={onChip} />
            ))}
            {busy && <Typing />}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <form
        className="px-6 pt-2 pb-6 sm:px-10"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="card mx-auto flex max-w-[720px] items-center gap-2 p-2 pl-2 focus-within:border-ink">
          <button
            type="button"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-ink-soft transition hover:bg-paper-lo hover:text-ink"
            onClick={() => fileRef.current?.click()}
            aria-label="Add photo"
            title="Photo next to an A4 sheet or bank card"
          >
            <CameraIcon />
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <input
            className="min-w-0 flex-1 bg-transparent py-2 text-[1.15rem] outline-none placeholder:text-ink-mute"
            placeholder="What are you sending?"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="btn" type="submit" disabled={!text.trim() || busy}>
            Send
          </button>
        </div>
      </form>
    </section>
  );
}

function MessageView({ m, chipsActive, onChip }: { m: Message; chipsActive: boolean; onChip: (c: Chip) => void }) {
  if (m.role === "user") {
    return (
      <div className="rise flex justify-end">
        {m.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.imageUrl} alt="" className="max-h-56 rounded-lg border border-line shadow-[3px_3px_0_var(--color-ink)]" />
        ) : (
          <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-ink px-4 py-2.5 text-[1.1rem] leading-snug text-paper">{m.text}</div>
        )}
      </div>
    );
  }
  return (
    <div className="rise space-y-3">
      {m.from === "human" && (
        <span className="sticker sticker-blue -rotate-1" title="Written by a person from the support team">
          Human agent · {m.author ?? "NordParcel"}
        </span>
      )}
      {m.text && (
        <p className="max-w-[60ch] text-[1.28rem] leading-[1.25] tracking-[-0.3px] text-ink-soft">
          <Redacted text={m.text} />
          {m.guarded?.map((r) => (
            <span key={r} className="sticker sticker-ink ml-2 -rotate-2 align-middle" title="Removed by the output guard">
              {r} guarded
            </span>
          ))}
        </p>
      )}
      {m.blocks?.map((b, i) => <BlockView key={i} b={b} messageId={m.id} />)}
      {m.chips && chipsActive && (
        <div className="flex flex-wrap gap-2">
          {m.chips.map((c) => (
            <button key={c.label} className="chip" onClick={() => onChip(c)}>
              {c.action === "demo-photo" || c.action === "upload" ? <CameraIcon small /> : null}
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Redacted({ text }: { text: string }) {
  const parts = text.split("▇▇▇");
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && (
            <span className="mx-0.5 inline-block h-[0.9em] w-[3.2em] translate-y-[2px] rounded-[2px] bg-ink" title="Unverified price removed" />
          )}
        </span>
      ))}
    </>
  );
}

function BlockView({ b, messageId }: { b: Block; messageId: string }) {
  const { quotes, leads, handoffs, setTab } = useStore();
  switch (b.type) {
    case "booking-form":
      return <BookingFormCard quoteId={b.quoteId} />;
    case "label":
      return <LabelCard booking={b.booking} />;
    case "tracking":
      return <TrackingCard tracking={b.tracking} />;
    case "quotes":
      return (
        <div className="grid gap-3 pt-3 sm:grid-cols-3">
          {b.quoteIds.map((id) => (
            <QuoteCard key={id} quote={quotes[id]} highlight={b.quoteIds.length > 1 && id === b.highlight} />
          ))}
        </div>
      );
    case "estimate":
      return <EstimateCard messageId={messageId} estimate={b.estimate} confirmed={b.confirmed} />;
    case "restriction": {
      const r = b.restriction;
      const tone = r.rule === "forbidden" ? "sticker-red" : r.rule === "allowed_with_product" ? "sticker-blue" : "sticker-ink";
      const word = { forbidden: "Not accepted", allowed_with_product: "Allowed", needs_declaration: "Declaration", ok: "OK" }[r.rule];
      return (
        <div className="card flex items-start gap-4 p-4">
          <span className={`sticker ${tone} mt-0.5 -rotate-2 uppercase`}>{word}</span>
          <div className="min-w-0">
            <div className="text-lg capitalize leading-tight">
              {r.item}
              {r.productName && <span className="text-ink-mute"> → {r.productName}</span>}
            </div>
            <div className="mono mt-1 text-[0.82rem] text-ink-soft">{r.note}</div>
          </div>
        </div>
      );
    }
    case "lead": {
      const l = leads.find((x) => x.id === b.leadId);
      return (
        <button className="card flex w-full items-center gap-3 p-3 text-left transition hover:border-ink" onClick={() => setTab("leads")}>
          <span className="sticker sticker-green -rotate-2">LEAD</span>
          <span className="flex-1 truncate text-lg">{l?.company}</span>
          <span className="mono text-xs text-ink-mute">{l?.volume}</span>
          <span className="mono text-xs">{b.leadId} →</span>
        </button>
      );
    }
    case "handoff": {
      const h = handoffs.find((x) => x.id === b.handoffId);
      return (
        <button className="card flex w-full items-center gap-3 p-3 text-left transition hover:border-ink" onClick={() => setTab("inbox")}>
          <span className="sticker sticker-red -rotate-2">HUMAN</span>
          <span className="flex-1 truncate text-lg">{h?.intent}</span>
          <span className="mono text-xs">{b.handoffId} →</span>
        </button>
      );
    }
    case "volume-quote":
      return <VolumeQuoteCard v={b.volumeQuote} />;
  }
}

function Typing() {
  return (
    <div className="mono flex gap-1 text-2xl text-ink-soft" aria-label="Typing">
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ animation: `dot 1.2s ${i * 0.15}s infinite` }}>
          ·
        </span>
      ))}
    </div>
  );
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
        <rect x="2" y="5" width="22" height="18" rx="1.5" fill="var(--color-kraft)" stroke="var(--color-ink)" strokeWidth="1.5" />
        <path d="M2 10h22" stroke="var(--color-ink)" strokeWidth="1.5" />
        <rect x="10.5" y="5" width="5" height="18" fill="var(--color-label-yellow)" stroke="var(--color-ink)" strokeWidth="1.5" />
      </svg>
      <span className="font-display text-[1.6rem] leading-none tracking-[-0.8px]">
        Nord<span className="italic">Parcel</span>
      </span>
    </div>
  );
}

function CameraIcon({ small }: { small?: boolean }) {
  const s = small ? 15 : 22;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
