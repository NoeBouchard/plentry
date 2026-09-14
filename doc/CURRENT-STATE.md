# Current state

Updated: **14 Sep 2026**. If you ship behaviour, change this file in the same change.

Live: https://plentry.vercel.app (static). Edge functions and SQL must be deployed separately.

**Workspace:** `/Users/noebouchard/work/EVERYTHING/Claude/Projects/Kitchen planner`  
(moved off `Documents/EVERYTHING/…`. App git repo is `plentry/`. Vault is workspace-root `doc/`, copied to `plentry/doc/`.)

## Works in product

- **Auth:** email/password (Supabase). Site URL + redirect `https://plentry.vercel.app/**` confirmed 13 Sep.
- **Onboarding:** goals, supermarket, household size, budget, dinners/week, then a searchable cupboard list (oils, aromatics, spices).
- **Week:** exactly N dinners (`prefs.meals`). **Modify** (and New week) pick from **verified** meals in Postgres (`reviewed_at` set), never the AI. Unverified rows stay off New week / Modify. Week length stays N. Catalog dinners have **tags**; New week / Modify / auto-pick **weight** meals whose tags match onboarding goals (quick, meal_prep, low_calorie) **and diet**. Default diet is **omnivore** (meat/fish first, at most one vegetarian/vegan dinner) until Profile → What we eat is vegetarian / vegan / pescatarian. Goal weighting does not hide the rest of the live catalog.
- **Advisor:** the only meal-generation AI chat. Adding proposals fills empty slots then replaces from Monday, still capped at `prefs.meals`. Every meal it writes to Postgres has a closed **tags** array; new rows stay in **Meals → New meal** (`reviewed_at` null) until the founder verifies them. The advisor is told the tagged catalog and user goals so it prefers existing dinners.
- **Cupboard (Pantry tab):** oils, butter, garlic, onions, lemons, curry paste, plus salt, black pepper, paprika, cumin, chilli flakes, mixed herbs, soy sauce, stock cubes. Tick what you already have — we skip those on the shop. Groceries stay in the basket. **Every recipe `ing` includes salt, pepper, and the spices that dish uses.** `completeIng()` only invents extra spices when a list has no salt (stale copy); reviewed lists are used as-is.
- **Basket:** missing ingredients priced at Tesco / Sainsbury’s / Asda / Waitrose. **Order this week** (and login) always fills the basket from this week’s meals unless the user edited *this same week*. Empty or leftover `basketEdit` is ignored. User can still add/remove products; **Reset to this week's list** restores meal prices. Edits persist until they reset, change the week, or check out.
- **Checkout:** Stripe card **hold** (still **test** keys until live `sk_live_` + live webhook secret are set). Address + phone on Stripe. Unpaid orders do not ping Telegram. Test path proven 13 Sep: order **#31** hold £31.52 then **captured £26.25** (store £25 + 5%); Ops status **ordered**.
- **Customer Orders tab:** timeline Payment → Ordered → Delivered, loaded from **Postgres**, not only localStorage. After Stripe return, land on Orders.
- **Profile → Order history:** same orders, tap through to Orders.
- **Ops (founder email):** order queue only. Status **bar** New | Ordered | Delivered (reversible; locked while unpaid). Capture field is **store £**; server adds 5%.
- **Meals (founder email, own nav tab):** every catalog dinner. **New meal** = unverified (`reviewed_at` null) with ingredients + method shown. **Live catalog** = verified, grouped by meat / fish / vegetarian / vegan (searchable); ingredients and instructions sit behind **Ingredients & method**. Flow: Add meal → ingredients/instructions/tags → **Verify & publish**. That sets `reviewed_at`; customers pick it on New week / Modify from Postgres (no extra deploy). Unpublish sends it back to New meal. Telegram still pings the unreviewed queue on the 1st and 15th.
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
- **Stripe live keys** not set yet. Auth URLs confirmed. Telegram depends on secrets (see RUNBOOK).
- README/SPEC still describe an older “pay the supermarket directly / no Plentry payment” model. **Ignore that.** Concierge + Stripe + 5% is current.
- **Onboarding does not yet ask diet** (vegetarian / vegan / gym) as its own step. Profile **What we eat** (`prefs.diet`, default omnivore) already steers New week / Modify. Full diet/goal onboarding still on the roadmap.

## Money constants (must stay in sync)

| Name | Value | Where |
|---|---|---|
| Commission | 5% | `index.html` `COMMISSION`, `pay/index.ts` `COMMISSION` |
| Hold buffer | 15% | `HOLD_BUFFER` / `HOLD_MULTIPLIER` |
| Max grocery total | £500 | DB trigger + `pay` `MAX_ORDER_GBP` |
| Admin email | `noyouchka.bouchard@gmail.com` | `index.html`, `pay/index.ts`, `admin_policies.sql` |

## Tests

`npm test` inside `plentry/` — **42** passing (jsdom: money, XSS, Modify, cupboard/basket, orders, admin Meals add/verify, live catalog fallback, `tagsFor`, omnivore ranking, unpublished skipped on auto-pick, source contracts). See [TESTING.md](TESTING.md). Must be green before staging UI/money/order/XSS changes. `window.__plentry` is a test hook only.

## Last production ship

9 Sep 2026: static aliased to https://plentry.vercel.app; `ai` + `newcoming` deployed; `meals_tags.sql` applied (columns, backfill, CHECK, Ops UPDATE, pg_cron `plentry-newcoming-fortnight`).

13 Sep 2026: founder test hold **and capture** #31 (store £25 → customer £26.25). Still test keys. No production static/function redeploy.
