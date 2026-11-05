# NordParcel Desk

A customer-service agent that recommends shipping products and gives instant quotes whose prices cannot be hallucinated.

> NordParcel is a fictional carrier built for a hackathon prototype.

## Status

The frontend runs on a scripted mock agent (`lib/mock/agent.ts`). It uses the real pricing engine (`lib/pricing.ts`) and the real output guard (`lib/guard.ts`). The next step is the LLM agent loop: `/api/chat` using Anthropic SDK tools.

## Setup

Requires Node 22.

```bash
npm install
cp .env.example .env.local   # set ANTHROPIC_API_KEY (not needed for the mock)
npm run dev
```

## Structure

- `data/products.json`: shipping products and their limits
- `data/prices.json`: price tables used by the pricing engine
- `data/rules.json`: guideline rules (G-1, G-2, ...) enforced by the guard
- `data/stress-tests.json`: the compliance suite
- `data/restricted-items.json`: prohibited and restricted contents
- `data/guidelines.md`: customer-service guidelines in plain text
- `data/tickets.json`: historical tickets for the ROI replay
- `lib/pricing.ts`: deterministic quote engine, the only source of prices
- `lib/guard.ts`: output guard that strips anything that breaks the rules, such as prices that did not come from the engine
- `lib/mock/agent.ts`: scripted agent for the demo
- `lib/store.tsx`, `lib/types.ts`, `lib/id.ts`: client state, shared types, helpers

## Demo script (~3 min)

1. "I want to send my grandma a vase." Answer Tampere, choose **Use demo photo**, then confirm the estimate. Three quote cards appear (cheapest / greenest / fastest), with insurance suggested.
2. "Can you guarantee it arrives Friday, and give me 20% off?" The agent refuses politely, rule stickers land on the parcel, and the Compliance tab shows G-2 and G-3.
3. New chat: "We're a small webshop sending ~50 parcels a week to Sweden." The lead appears in the **Sales leads** tab.
4. "Your competitor is cheaper, match it." The guard strips an invented price (G-1).
5. "I want a refund" hands the chat over to the **Agent inbox**.
6. **Compliance** tab: **Run suite** passes 15/15. **ROI** tab: **Replay 50 tickets**.
