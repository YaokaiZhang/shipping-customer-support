import type { Quote } from "../types";

/**
 * Server-side quote store. Every price a customer can see is one of these.
 * In-memory (kept on globalThis so dev hot-reloads don't wipe it).
 */
const g = globalThis as unknown as { __npQuotes?: Map<string, Quote> };
const store = (g.__npQuotes ??= new Map<string, Quote>());

export const saveQuote = (q: Quote) => store.set(q.id, q);

/** Resolve the quotes issued in a chat. The server copy wins over the client's. */
export const resolveQuotes = (client: Quote[]) => client.map((q) => store.get(q.id) ?? q);
