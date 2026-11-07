"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { shortId } from "./id";
import type { Booking, ChatRequest, GuardEvent, Handoff, KnowledgeGap, Message, OpsRule, Quote, SalesLead, ShipmentProfile, TurnInput, TurnResult } from "./types";

export type Tab = "parcel" | "leads" | "inbox" | "compliance" | "roi" | "guide" | "insights";

const OPS_KEY = "nordparcel.opsRules.v1";

interface State {
  chatId: string;
  messages: Message[];
  profile: ShipmentProfile;
  quotes: Record<string, Quote>;
  chatQuoteIds: string[];
  leads: SalesLead[];
  /** Bookings made from quote cards (newest first); kept across chats. */
  bookings: Booking[];
  handoffs: Handoff[];
  events: GuardEvent[];
  /** Live operations rules (Guidelines tab), persisted to localStorage. */
  opsRules: OpsRule[];
  /** Knowledge gaps logged this session (Insights tab). */
  gaps: KnowledgeGap[];
  /** Text pre-filled into the Guidelines editor by "Draft rule" in Insights. */
  opsDraft: string | null;
  busy: boolean;
  tab: Tab;
  seen: Record<Tab, number>;
}

const freshProfile = (): ShipmentProfile => ({ from: "Helsinki" });

const initial: State = {
  chatId: "C-0001",
  messages: [],
  profile: freshProfile(),
  quotes: {},
  chatQuoteIds: [],
  leads: [],
  bookings: [],
  handoffs: [],
  events: [],
  opsRules: [],
  gaps: [],
  opsDraft: null,
  busy: false,
  tab: "parcel",
  seen: { parcel: 0, leads: 0, inbox: 0, compliance: 0, roi: 0, guide: 0, insights: 0 },
};

type Action =
  | { type: "user"; message: Message }
  | { type: "busy"; busy: boolean }
  | { type: "result"; result: TurnResult }
  | { type: "confirm-estimate"; messageId: string }
  | { type: "new-chat" }
  | { type: "tab"; tab: Tab }
  | { type: "ops"; rules: OpsRule[] }
  | { type: "ops-draft"; text: string | null }
  | { type: "human-reply"; handoffId: string; text: string; author: string };

const counts = (s: State): Record<Tab, number> => ({
  parcel: 0,
  leads: s.leads.length,
  inbox: s.handoffs.length,
  compliance: s.events.length,
  roi: 0,
  guide: 0,
  insights: s.gaps.length,
});

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "user":
      return { ...s, messages: [...s.messages, a.message] };
    case "busy":
      return { ...s, busy: a.busy };
    case "result": {
      const { result: r } = a;
      const quotes = { ...s.quotes };
      r.quotes.forEach((q) => (quotes[q.id] = q));
      const next: State = {
        ...s,
        busy: false,
        profile: r.profile,
        quotes,
        chatQuoteIds: [...s.chatQuoteIds, ...r.quotes.map((q) => q.id)],
        messages: [...s.messages, ...r.messages],
        leads: [...r.leads, ...s.leads],
        bookings: [...(r.bookings ?? []), ...s.bookings],
        handoffs: [...r.handoffs.map((h) => ({ ...h, chatId: h.chatId ?? s.chatId, status: h.status ?? ("open" as const) })), ...s.handoffs],
        events: [...r.events, ...s.events],
        gaps: [...(r.gaps ?? []), ...s.gaps],
      };
      return { ...next, seen: { ...s.seen, [s.tab]: counts(next)[s.tab] } };
    }
    case "confirm-estimate":
      return {
        ...s,
        messages: s.messages.map((m) =>
          m.id !== a.messageId
            ? m
            : { ...m, blocks: m.blocks?.map((b) => (b.type === "estimate" ? { ...b, confirmed: true } : b)) },
        ),
      };
    case "new-chat":
      return {
        ...s,
        chatId: shortId("C"),
        messages: [],
        profile: freshProfile(),
        chatQuoteIds: [],
        busy: false,
      };
    case "tab":
      return { ...s, tab: a.tab, seen: { ...s.seen, [a.tab]: counts(s)[a.tab] } };
    case "ops":
      return { ...s, opsRules: a.rules };
    case "ops-draft":
      return { ...s, opsDraft: a.text };
    case "human-reply": {
      // A human agent answers from the inbox: only into the chat the handoff came from, once.
      const h = s.handoffs.find((x) => x.id === a.handoffId);
      if (!h || h.status === "sent" || h.chatId !== s.chatId || !a.text.trim()) return s;
      const msg: Message = { id: shortId("M", 6), role: "assistant", from: "human", author: a.author, text: a.text.trim() };
      return {
        ...s,
        messages: [...s.messages, msg],
        handoffs: s.handoffs.map((x) => (x.id === a.handoffId ? { ...x, status: "sent" as const, draftReply: a.text.trim() } : x)),
      };
    }
  }
}

interface Store extends State {
  send: (input: TurnInput, display?: Partial<Message>) => Promise<void>;
  confirmEstimate: (
    messageId: string,
    dims: [number, number, number],
    weightKg: number,
    declaredValue?: number,
    packagingIds?: string[],
  ) => void;
  newChat: () => void;
  setTab: (tab: Tab) => void;
  setOpsRules: (rules: OpsRule[]) => void;
  /** Pre-fill a new ops rule in the Guidelines tab and switch to it (null clears). */
  draftOpsRule: (text: string | null) => void;
  /** Human agent sends a reply from the inbox into the handoff's chat and marks it sent. */
  sendHumanReply: (handoffId: string, text: string, author: string) => void;
  unseen: Record<Tab, number>;
}

const Ctx = createContext<Store | null>(null);

const blobToDataUrl = async (url: string) => {
  const blob = await (await fetch(url)).blob();
  return new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
};

const failed = (text: string): TurnResult => ({
  messages: [{ id: shortId("M", 6), role: "assistant", text }],
  quotes: [],
  leads: [],
  handoffs: [],
  events: [],
  profile: { from: "Helsinki" },
});

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const ref = useRef(state);
  ref.current = state;

  // Ops rules live in localStorage. Load after mount (no hydration mismatch); every access may throw.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(OPS_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed))
        dispatch({
          type: "ops",
          rules: parsed
            .filter((r) => r && typeof r.id === "string" && typeof r.text === "string")
            .map((r) => ({ id: r.id, text: r.text, enabled: r.enabled !== false })),
        });
    } catch {
      /* storage blocked or corrupt: start empty */
    }
  }, []);

  const run = useCallback(async (input: TurnInput, history: Message[]) => {
    const s = ref.current;
    const chatId = s.chatId;
    dispatch({ type: "busy", busy: true });
    let result: TurnResult;
    try {
      const wire: TurnInput =
        input.kind === "image" && input.imageUrl.startsWith("blob:") ? { ...input, imageUrl: await blobToDataUrl(input.imageUrl) } : input;
      const body: ChatRequest = { chatId, history, profile: s.profile, quotes: s.chatQuoteIds.map((id) => s.quotes[id]), input: wire, bookings: s.bookings, opsRules: s.opsRules.filter((r) => r.enabled) };
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(String(res.status));
      result = await res.json();
      // Photo estimates keep the local preview rather than a round-tripped data URL.
      if (input.kind === "image")
        result.messages.forEach((m) =>
          m.blocks?.forEach((b) => b.type === "estimate" && (b.estimate.imageUrl = input.imageUrl)),
        );
    } catch {
      result = { ...failed("The line dropped. Try that again?"), profile: s.profile };
    }
    if (ref.current.chatId !== chatId) return; // chat was reset mid-turn
    dispatch({ type: "result", result });
  }, []);

  const send = useCallback<Store["send"]>(
    async (input, display) => {
      const history = ref.current.messages;
      if (input.kind !== "estimate") {
        dispatch({
          type: "user",
          message: {
            id: shortId("M", 6),
            role: "user",
            text: input.kind === "text" ? input.text : undefined,
            imageUrl: input.kind === "image" ? input.imageUrl : undefined,
            ...display,
          },
        });
      }
      await run(input, history);
    },
    [run],
  );

  const confirmEstimate = useCallback<Store["confirmEstimate"]>(
    (messageId, dims, weightKg, declaredValue, packagingIds) => {
      dispatch({ type: "confirm-estimate", messageId });
      run({ kind: "estimate", dims, weightKg, declaredValue, ...(packagingIds?.length ? { packagingIds } : {}) }, ref.current.messages);
    },
    [run],
  );

  const value = useMemo<Store>(() => {
    const c = counts(state);
    const unseen = Object.fromEntries(
      (Object.keys(c) as Tab[]).map((k) => [k, Math.max(0, c[k] - state.seen[k])]),
    ) as Record<Tab, number>;
    return {
      ...state,
      unseen,
      send,
      confirmEstimate,
      newChat: () => dispatch({ type: "new-chat" }),
      setTab: (tab) => dispatch({ type: "tab", tab }),
      setOpsRules: (rules) => {
        try {
          window.localStorage.setItem(OPS_KEY, JSON.stringify(rules));
        } catch {
          /* storage unavailable: rules still apply for this session */
        }
        dispatch({ type: "ops", rules });
      },
      sendHumanReply: (handoffId, text, author) => dispatch({ type: "human-reply", handoffId, text, author }),
      draftOpsRule: (text) => {
        dispatch({ type: "ops-draft", text });
        if (text !== null) dispatch({ type: "tab", tab: "guide" });
      },
    };
  }, [state, send, confirmEstimate]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
