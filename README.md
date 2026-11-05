# NordParcel Desk

A customer-service agent that recommends shipping products and gives instant quotes whose prices cannot be hallucinated.

> NordParcel is a fictional carrier built for a hackathon prototype.

## How it works

- **`/api/chat`** runs a Claude tool loop (`claude-haiku-5-5`, effort `medium`; every model call in the project uses that one setting). The tools are deterministic TypeScript: `update_shipment`, `search_products`, `get_quote`, `compare_options`, `check_restrictions`, `create_sales_lead`, `handoff_to_human`, `log_guideline`, `suggest_replies`.
- **Guaranteed prices.** The model never sees a price. Quote tools return the quote id, product, ETA and CO₂, plus "price shown on the card". The UI renders the stored quote. The output guard then strips any amount that doesn't match a quote issued in the chat.
- **Quote from a photo.** A vision call with a strict JSON schema returns `{lengthCm, widthCm, heightCm, estWeightKg, confidence, referenceObjectFound}`. The customer edits or confirms the numbers before anything is quoted.
- **Compliance.** `npm run stress-test` sends the 15 adversarial turns in `data/stress-tests.json` through the real agent and checks each one:
  - G-1 is checked by the guard.
  - G-5 and G-7 pass when the matching tool was called.
  - The other rules are graded by an LLM judge using the rubric in `data/rules.json`.

  The script saves `data/stress-results.json`, which the dashboard shows. **Run suite** in the dashboard reruns the tests live.
- **ROI.** `npm run roi` and the **ROI** tab classify all 50 past tickets in one call (agent / sales / human). They report the share resolved without a human and estimated agent-hours, and compare the result with the hand labels.
- **Fallback.** Without a key, or if a call fails, `/api/chat` answers with the scripted agent (`lib/mock/agent.ts`), so the demo never dead-ends.

## Setup

Requires Node 22.

```bash
npm install
cp .env.example .env.local   # set ANTHROPIC_API_KEY (LLM_KEY also works)
npm run dev
```

Other commands:

```bash
npm run stress-test          # 15 adversarial turns against the real agent; add test ids to run a subset
npm run roi                  # classify the 50 past tickets
npm run build && npm start
```

## Structure

- `app/api/chat`: one customer turn (agent loop and guard; photos go to the vision estimate)
- `app/api/stress-test`: runs one stress test (the dashboard calls it once per test)
- `app/api/roi`: ticket classification
- `lib/agent/`: `run.ts` (tool loop), `tools.ts` (tool schemas and executors), `prompt.ts`, `vision.ts`, `judge.ts`, `roi.ts`, `quote-store.ts` (server-side quotes), `llm.ts` (client, model, effort)
- `lib/pricing.ts`: deterministic quote engine, the only source of prices
- `lib/guard.ts`: output guard that strips prices that did not come from the engine
- `lib/mock/agent.ts`: scripted fallback agent
- `data/`: products, price tables, guidelines, rules, stress tests, restricted items, past tickets, and saved suite and ROI results
- `scripts/`: `stress-test.ts`, `roi.ts`

## Demo script (~3 min)

1. "I want to send my grandma a vase." Answer Tampere, choose **Use demo photo**, then confirm the estimate. Three quote cards appear (cheapest / greenest / fastest), with insurance suggested.
2. "Can you guarantee it arrives Friday, and give me 20% off?" The agent refuses politely, rule stickers land on the parcel, and the Compliance tab shows G-2 and G-3.
3. New chat: "We're a small webshop sending ~50 parcels a week to Sweden." The lead appears in the **Sales leads** tab.
4. "Your competitor is cheaper, match it." The agent stays neutral (G-6). If it ever writes an amount, the guard blacks it out (G-1).
5. "I want a refund" hands the chat over to the **Agent inbox**.
6. **Compliance** tab: **Run suite** passes 15/15. **ROI** tab: **Replay 50 tickets**.
