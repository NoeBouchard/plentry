# Current state

Updated: **9 Sep 2026**. If you ship behaviour, change this file in the same change.

Live: https://plentry.vercel.app (static). Edge functions and SQL must be deployed separately.

**Workspace:** `/Users/noebouchard/work/EVERYTHING/Claude/Projects/Kitchen planner`  
(moved off `Documents/EVERYTHING/…`. App git repo is `plentry/`. Vault is workspace-root `doc/`, copied to `plentry/doc/`.)

## Works in product

- **Auth:** email/password (Supabase). Site URL should be `https://plentry.vercel.app`.
- **Onboarding:** goals, supermarket, household size, budget, dinners/week, then a searchable cupboard list (oils, aromatics, spices).
- **Week:** exactly N dinners (`prefs.meals`). **Modify** (and New week) pick from the **meals catalog in Postgres**, never the AI. Week length stays N. Catalog dinners have **tags**; New week / Modify / auto-pick **weight** meals whose tags match onboarding goals (quick, meal_prep, low_calorie) without hiding the rest of the catalog.
- **Advisor:** the only meal-generation AI chat. Adding proposals fills empty slots then replaces from Monday, still capped at `prefs.meals`. Every meal it writes to Postgres has a closed **tags** array; new rows stay **newcoming** (`reviewed_at` null) until Ops marks them. The advisor is told the tagged catalog and user goals so it prefers existing dinners.
- **Cupboard (Pantry tab):** oils, butter, garlic, onions, lemons, curry paste, plus salt, black pepper, paprika, cumin, chilli flakes, mixed herbs, soy sauce, stock cubes. Tick what you already have — we skip those on the shop. Groceries stay in the basket. **Every recipe `ing` includes salt, pepper, and the spices that dish uses.** `completeIng()` only invents extra spices when a list has no salt (stale copy); reviewed lists are used as-is.
- **Basket:** missing ingredients priced at Tesco / Sainsbury’s / Asda / Waitrose. User can add/remove products and change quantities, then **Review & send order** (confirm modal → Stripe hold). Edits persist until they reset or change the week.
- **Checkout:** Stripe card **hold** (test or live keys). Address + phone on Stripe. Unpaid orders do not ping Telegram.
- **Customer Orders tab:** timeline Payment → Ordered → Delivered, loaded from **Postgres**, not only localStorage. After Stripe return, land on Orders.
- **Profile → Order history:** same orders, tap through to Orders.
- **Ops (founder email):** all orders, status **bar** New | Ordered | Delivered (reversible; locked while unpaid). Capture field is **store £**; server adds 5%. **Newcoming meals** lists unreviewed advisor dinners; **Mark reviewed** sets `reviewed_at`. Telegram reminder on the 1st and 15th if any remain.
- **5% fee:** shown in UI totals (`customerTotal`). Hold = fee × 1.15. Capture adds 5% on the server (`pay/index.ts`).
- **Photos:** 40 seed dishes have Unsplash URLs. AI meals without a unique URL use an ingredient fallback in the client. **Newly generated** meals search TheMealDB by dish name **once** and store `image_url`.
- **Meals `ing`:** production catalog (**77** rows) updated 8 Sep 2026 from the founder review: salt/pepper/spices plus three new keys (`chopped tomatoes`, `butter`, `fresh coriander`). Client `completeIng()` still fills stale local copies that omit salt.
- **Catalog recipes:** each `meals` row has `recipe` JSON (`steps` + `tip`) from the same review. Cooking instructions in the app use that method (quantities for 2) instead of generating a new AI recipe. New advisor dinners still get an AI method until they are reviewed.
- **Tags (9 Sep 2026):** closed set on `meals.tags` (see [TAGS.md](TAGS.md)). Live split: **33 meat / 11 fish / 28 vegetarian / 5 vegan**. All 77 marked reviewed; newcoming queue is empty until the advisor inserts a new dish. Week cards and meal details show tag chips.

## Intentionally not live / degraded

- **Pepesto** off unless `PEPESTO_API_KEY` is set → shelf/estimate prices, concierge shops manually.
- **Delivery fees & ETAs** are typical constants, not live slots.
- **Stores** are the four UK names, not geolocated from postcode (postcode is format-checked).
- **35 catalog keys** (27 groceries + 8 cupboard seasonings). Every meal ingredient must be in that set. `chopped tomatoes` = 400g tin; `tomatoes` = fresh; `passata` = sieved sauce.
- **Telegram / Stripe / Auth URLs** depend on secrets and dashboard config (see RUNBOOK).
- README/SPEC still describe an older “pay the supermarket directly / no Plentry payment” model. **Ignore that.** Concierge + Stripe + 5% is current.
- **Onboarding does not yet ask diet** (vegetarian / vegan / gym). Tag weighting today uses the existing goals only (`decide` → quick, `waste`/`shop` → meal_prep, `budget` → low_calorie).

## Money constants (must stay in sync)

| Name | Value | Where |
|---|---|---|
| Commission | 5% | `index.html` `COMMISSION`, `pay/index.ts` `COMMISSION` |
| Hold buffer | 15% | `HOLD_BUFFER` / `HOLD_MULTIPLIER` |
| Max grocery total | £500 | DB trigger + `pay` `MAX_ORDER_GBP` |
| Admin email | `noyouchka.bouchard@gmail.com` | `index.html`, `pay/index.ts`, `admin_policies.sql` |

## Tests

`npm test` inside `plentry/` — **37** passing (jsdom: money, XSS, Modify, cupboard/basket, orders, Ops newcoming, `tagsFor`, source contracts). See [TESTING.md](TESTING.md). Must be green before staging UI/money/order/XSS changes. `window.__plentry` is a test hook only.

## Last production ship

9 Sep 2026: static aliased to https://plentry.vercel.app; `ai` + `newcoming` deployed; `meals_tags.sql` applied (columns, backfill, CHECK, Ops UPDATE, pg_cron `plentry-newcoming-fortnight`).
