# Plentry — Product Plan & MVP Roadmap

## One-liner
AI-automated meal planning and grocery replenishment. Like HelloFresh, but no boxes, no packing, no rigid menus — the AI plans your meals, compares prices across nearby supermarkets, and orders ingredients delivered from local stores.

## Job to be done
"Keep my kitchen stocked with what I need to cook the meals I want, at the best price, without me thinking about it."

HelloFresh solves "decide + shop" but fails on flexibility (fixed recipes, fixed box sizes), price (€8–11/serving), waste (packaging, pre-portioned everything), and pantry awareness (ignores what you already have).

## Differentiation vs HelloFresh
| | HelloFresh | Us |
|---|---|---|
| Recipes | Fixed weekly menu | AI-generated from your tastes + pantry |
| Price | Premium, opaque | Compares Tesco / Sainsbury's / Carrefour / Lidl etc. per item |
| Fulfilment | Own warehouses + packing | Existing supermarket delivery (no logistics capex) |
| Pantry | Ignored | Monitored; only orders what's missing |
| Sustainability | Heavy packaging, long supply chain | Local stores, normal pack sizes, less waste |

## Target market
UK/Europe first. Dense cities with multiple supermarket delivery options (London, Paris, Berlin). Initial persona: busy professionals/couples, 25–45, already ordering groceries online.

## How it works (core loop)
1. Onboard: dietary prefs, household size, budget, postcode → detect nearby stores.
2. AI generates a weekly meal plan (adjustable, swipe to swap).
3. Plan → ingredient list → subtract pantry stock → shopping list.
4. Price engine compares the basket across nearby stores (single-store or split-basket optimization).
5. One-tap order via store delivery; pantry auto-updates on delivery.
6. Consumption tracking (check-off cooked meals, barcode scan, later: smart predictions) keeps pantry model fresh → triggers replenishment.

## MVP scope (this prototype)
In: meal plan generation (rule-based "AI" on mock recipe DB), pantry tracking, basket builder, mock multi-store price comparison, order simulation, savings display.
Out: real store APIs, payments, accounts, mobile apps, ML.

## Roadmap
- **Phase 0 (now):** Clickable prototype → show 10 target users, validate willingness to pay.
- **Phase 1 (4–8 wks):** Real backend (Next.js + Postgres + LLM for meal planning). Price data via scraping/aggregators (e.g. Tesco/Sainsbury's via third-party APIs). Manual "concierge" ordering for first 20 users.
- **Phase 2 (3–6 mo):** Real ordering integrations — Instacart-style partners in EU: Everli, Wolt Market, Uber Eats grocery, or direct retailer APIs (Tesco Whoosh, Carrefour). Pantry via delivery-receipt parsing + meal check-offs.
- **Phase 3:** Subscriptions (€5–10/mo + affiliate/commission per basket), smart replenishment predictions, household sharing.

## Business model
Free meal planning; revenue from retailer affiliate commission (2–5% of basket) + premium tier (split-basket optimization, auto-ordering, waste analytics).

## Key risks
1. **Store API access** — most EU retailers have no public ordering API. Mitigation: start concierge/partner aggregators; ordering automation is the moat once secured.
2. **Price data accuracy** — scraping is fragile/ToS-sensitive. Mitigation: aggregator partnerships, user-confirmed prices at checkout.
3. **Pantry model accuracy** — garbage in, garbage out. Mitigation: keep it forgiving (suggest, don't assume), learn from corrections.
4. **HelloFresh/retailers copying** — speed + multi-retailer neutrality is the defense; a retailer can't be neutral across competitors.

## Validation metrics (Phase 0/1)
Activation: % completing first plan→basket. Core: weekly baskets ordered per user. Money: avg. savings shown vs single store; conversion to premium intent.
