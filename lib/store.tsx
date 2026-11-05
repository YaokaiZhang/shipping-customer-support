"use client";

import { createContext, useCallback, useContext, useMemo, useReducer, useRef } from "react";
import { shortId } from "./id";
import { mockTurn, type TurnInput, type TurnResult } from "./mock/agent";
import type { GuardEvent, Handoff, Message, Quote, SalesLead, ShipmentProfile } from "./types";

export type Tab = "parcel" | "leads" | "inbox" | "compliance" | "roi";

interface State {
  chatId: string;
  messages: Message[];
  profile: ShipmentProfile;
  quotes: Record<string, Quote>;
  chatQuoteIds: string[];
  leads: SalesLead[];
  handoffs: Handoff[];
  events: GuardEvent[];
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
  handoffs: [],
  events: [],
  busy: false,
  tab: "parcel",
  seen: { parcel: 0, leads: 0, inbox: 0, compliance: 0, roi: 0 },
};

type Action =
  | { type: "user"; message: Message }
  | { type: "busy"; busy: boolean }
  | { type: "result"; result: TurnResult }
  | { type: "confirm-estimate"; messageId: string }
  | { type: "new-chat" }
  | { type: "tab"; tab: Tab };

const counts = (s: State): Record<Tab, number> => ({
  parcel: 0,
  leads: s.leads.length,
  inbox: s.handoffs.length,
  compliance: s.events.length,
  roi: 0,
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
        handoffs: [...r.handoffs, ...s.handoffs],
        events: [...r.events, ...s.events],
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
  }
}

interface Store extends State {
  send: (input: TurnInput, display?: Partial<Message>) => Promise<void>;
  confirmEstimate: (messageId: string, dims: [number, number, number], weightKg: number, declaredValue?: number) => void;
  newChat: () => void;
  setTab: (tab: Tab) => void;
  unseen: Record<Tab, number>;
}

const Ctx = createContext<Store | null>(null);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const ref = useRef(state);
  ref.current = state;

  const run = useCallback(async (input: TurnInput) => {
    const s = ref.current;
    const chatId = s.chatId;
    dispatch({ type: "busy", busy: true });
    const [result] = await Promise.all([
      mockTurn({ profile: s.profile, quotes: s.chatQuoteIds.map((id) => s.quotes[id]) }, input),
      wait(input.kind === "image" ? 1600 : 700 + Math.random() * 500),
    ]);
    if (ref.current.chatId !== chatId) return; // chat was reset mid-turn
    dispatch({ type: "result", result });
  }, []);

  const send = useCallback<Store["send"]>(
    async (input, display) => {
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
      await run(input);
    },
    [run],
  );

  const confirmEstimate = useCallback<Store["confirmEstimate"]>(
    (messageId, dims, weightKg, declaredValue) => {
      dispatch({ type: "confirm-estimate", messageId });
      run({ kind: "estimate", dims, weightKg, declaredValue });
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
    };
  }, [state, send, confirmEstimate]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
