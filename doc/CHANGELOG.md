# Changelog

Vault history of **functional** product changes. Newest first. Agents append here when staging.

## 2026-09-14

- **Meals tab (founder only):** catalog work moved off Ops. **New meal** holds unverified rows (`reviewed_at` null) with ingredients + method visible; **Live catalog** lists every verified dinner grouped by diet, with ingredients and instructions behind **Ingredients & method**. Add → save/verify/tags in one editor; Verify & publish is live from Postgres (no extra deploy). If the admin fetch is empty, Live catalog falls back to the week catalog so the list is never blank. New week / Modify ignore unverified rows when a live pool exists. Founder INSERT/UPDATE/DELETE via JWT email; leftover public `insert meals` (`created_by = auth.uid()`) dropped on live Postgres. `npm test` **42** passing. SQL: `admin_meals_write.sql` (also in `admin_policies.sql`). Static **not** deployed yet.
- Basket: **Order this week** / login rebuilds from this week’s meals. Stale or empty `basketEdit` no longer leaves a £0 week with only “add a product”. Manual add/remove still works for the same week; Reset restores meal prices. Meal cards price ingredients even if the store is missing.
- Weeks default to **omnivore** (meat/fish first, at most one vegetarian/vegan dinner) unless Profile → What we eat is vegetarian / vegan / pescatarian. New week uses the **full catalog**, not a 16-meal veggie-heavy slice. `npm test` was **39** before the Meals tab.

## 2026-09-13

- Founder verify: Auth Site URL + `https://plentry.vercel.app/**`; Stripe **test** order **#31** Tesco — hold £31.52 `authorized`, then **captured £26.25** (store £25 + 5% £1.25), Ops **ordered**. Safe to rotate to live `sk_live_` + **new** live webhook `whsec_`. Security pass: JWT `email` is `auth.users` (not `user_metadata`); leftover `orders` fn confirmed gone; leaked-password left off (org **Free**, feature is Pro). No app code change.

## 2026-09-09

- Live MCP verify (no code change): project healthy; `ai` `checkout` `pay` `stripe-webhook` `notify-order` `newcoming` ACTIVE; **77** meals / **0** newcoming; cron `plentry-newcoming-fortnight` `0 9 1,15 * *` UTC; `invoke_newcoming_review` not executable by anon/authenticated. Auth Site URL still dashboard-only.
- Closed meal **tags** on `public.meals` (diet, nutrition, context, use case). Backfill: **77** dinners, all marked reviewed (33 meat, 11 fish, 28 vegetarian, 5 vegan). Advisor/`ai` must return tags; the server whitelists and fills from `ing`. New rows stay **newcoming** (`reviewed_at` null) until Ops **Mark reviewed**. Fortnight Telegram via `newcoming` + pg_cron `plentry-newcoming-fortnight` (1st and 15th 09:00 UTC). New week / Modify weight by onboarding goals vs tags. Ops shows the newcoming queue. `npm test` **37** passing. Production: static + `ai` + `newcoming`. SQL: `meals_tags.sql`.
- Cursor workspace moved to `/Users/noebouchard/work/EVERYTHING/Claude/Projects/Kitchen planner`. Agents should open that folder, not the deleted Documents path.

## 2026-09-08

- Vault created at workspace-root `doc/` (copied to `plentry/doc/` for GitHub) as source of truth for agents and security audit.
- Automated jsdom unit suite + source contracts (`plentry/test`, `npm test`, 30 passing).
- Meal photos: new AI dishes search TheMealDB by name once at insert (`ai` function). Client still falls back by ingredient.
- Documented concierge model: Stripe hold, 5% fee, Ops capture.
- Advisor add no longer grows the week past `prefs.meals`.
- Revoked public RPC on `notify_order_webhook_fn`; Telegram only on authorized hold.
- Production static + `ai`/`pay` deployed.
- Modify / New week use the meals catalog only; AI is meal advisor (plus recipes). Pantry parse is not in the UI.
- Cupboard section (oil & aromatics) plus editable basket before confirm-and-send.
- Pantry is a searchable Have list of all 24 ingredients (onboarding + Pantry tab). “Update with AI” / “Scan with AI” removed until photo scan. Ticked items are skipped entirely on the shop.
- Pantry / onboarding cupboard is oils & spices only (salt, pepper, paprika, cumin, chilli, mixed herbs, soy, stock cubes). Groceries stay in the basket. Meals still omit salt/pepper from `ing`; the shop adds implied seasoning unless ticked.
- Recipes now carry a **full ingredient list** (salt, pepper, and dish spices on `ing`). Shop and cooking instructions use that list. Run `supabase/meals_full_ingredients.sql` on Postgres; deploy `ai` so new dinners include spices.
- Ran `meals_full_ingredients.sql` on production Postgres (8 Sep 2026): all **77** meals now include salt and black pepper; dish spices (cumin, herbs, soy, …) match the recipe type.
- Catalog review file now includes a **method + tip** for all 77 dinners (live `ai("recipe")`, 2 servings), alongside ingredients.
- Applied the founder catalog review: 62 meals’ `ing`/`time` corrected; three new keys (`chopped tomatoes`, `butter`, `fresh coriander`); reviewed methods stored on `meals.recipe`. Butter is a cupboard staple. `npm test` 35 passing.

## 2026-09-07

- Production static deploy path: `vercel deploy --prod --yes` from `plentry/` (Vercel not git-connected).
- Customer **Orders** + **Profile history** load from `orders` table (`hydrateOrdersFromDb`). Stripe return opens Orders.
- Ops status **bar** New / Ordered / Delivered (reversible; unpaid locked).
- **Modify** on each dinner: replace with 5 other meals; week size unchanged.
- **5% Plentry fee** on displayed totals; hold includes fee × 1.15; capture adds 5% server-side.
- Ingredient-level photo fallback for meals missing `image_url`.

## 2026-07 (prior)

- Concierge Stripe Checkout (manual capture), webhook, Telegram on authorized hold.
- Security hardening v1/v2 (rate limits, meals INSERT lockdown, order validation trigger).
- Pepesto checkout function (keyless fallback to shelf prices).
- Seed catalog (40) + `ingredient_prices`; Tesco estimates added later.
- Vanilla SPA + Supabase Auth/Postgres; Vercel static hosting.
