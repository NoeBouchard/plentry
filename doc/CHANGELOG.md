# Changelog

Vault history of **functional** product changes. Newest first. Agents append here when staging.

## 2026-10-05 — public site is getplentry.com

- Customer origin is `https://getplentry.com`. Stripe return URLs (`pay` v21 `APP_URL`) and the exact-origin check (`checkout` v17 `APP_ORIGIN`, I-X02) use that host. `www.getplentry.com` and `plentry.vercel.app` redirect to the apex. Supabase Site URL is the new origin; the old redirect stays on the allow list for a week. Auth mail and the Stripe webhook URL are unchanged. The promised-window test uses a date in 2099 so it still expects “We'll deliver” after 24 Sep 2026.

## 2026-09-24 — phone, slot, Issue + Inbox on production

- Founder deployed static and edge functions (including `notify-order`) after PR #1 merged. Live site confirmed 26 Sep: UK phone, promised window, Issue, Inbox. Vault had still said “not yet deployed”.

## 2026-09-21 — meal / ingredient verification workflow

- New `doc/meal-ingredient verification/`: README (3-stage workflow against chef sources), generated `1-INGREDIENTS.md` / `2-MEALS.md` / `3-INSTRUCTIONS.md`, `CANDIDATES.md`, `STATUS.md`, 77 `meals/*.md` records, `verify.py build|check` (0 problems). Worked examples: Shakshuka (Ottolenghi), Beef ragù spaghetti (RecipeTin Eats). No app or DB change yet — each record proposes its own DB patch.

## 2026-09-21 — be-in warning on the chosen delivery window

- Confirm: after the customer picks a day + 2-hour slot, an amber note **Be in for this window** — someone at the door, the driver will call the phone on the order.

## 2026-09-21 — small-team checks (CI + PR)

- GitHub Actions **test** (Node 22, `npm test`) on pull_request and `main`. PR template: requirements, invariants, security, tests, vault, no deploy.
- Loop: branch → PR → CI → Bugbot/security on money/XSS → merge → founder deploy. See [ENGINEERING.md](ENGINEERING.md). Vercel stays disconnected. Merge is not live.

## 2026-09-21 — UK phone, promised 2-hour slot, hollow timeline, Issue + Inbox

- **Phone (I-O08–10):** UK number required on Profile and checkout (`isUkPhone`). Reuse card only if the saved address includes a phone. Ops copy-list and Telegram lead with **PHONE:** so the supermarket driver calls the customer, not the founder.
- **Slot (I-O16):** customer picks a day ≥ order+3 (Europe/London) and a 2-hour block 08:00–22:00. Written on INSERT as `slot_date` / `slot_start` / `slot_end` (CHECKs live). After the hold: **We'll deliver {window}**. Ops **Confirm this window** (marks Ordered, snapshots `delivery_slot`) or **Message customer** — do not shop a different slot. Legacy rows without slot columns keep the 4-day estimate + free-text field.
- **Timeline:** incomplete dots are hollow white; complete is green fill. **Delivered** is not filled while status is Ordered. Delivered also greens after `slot_end`; pantry restock still only on `status=delivered`.
- **Issue + Inbox (I-O18):** `order_messages` + `issue_status`. Customer **Issue** on paid orders; founder **Inbox** (aal2) can start a thread when the slot is unavailable. Bodies stripped, `esc()` at render. SQL applied live (`orders_slot_issue`). Static + `notify-order` not deployed yet.
- Tests: `npm test` **105**.

## 2026-09-21 — vault tidy + one-file Word review

- All hanging markdown at the Kitchen planner root and in `plentry/` (`PLAN.md`, `SPEC.md`, `SECURITY-DEPLOY.md`, `user-acquisition-playbook.md`) plus the June `mvp.html` prototype moved to [`archive/`](archive/README.md). `plentry/README.md` is now a short pointer.
- Live contract files stay at the top of `doc/` (same names agents already read). Reading order is in [`README.md`](README.md). Founder pack: **`Plentry-review.docx`** (regenerate with `python3 doc/build-review.py`).
- `npm run vault` copies live markdown and `archive/*.md` into `plentry/doc/`. The `.docx` stays in workspace `doc/` only.

## 2026-09-19 later — hold 30%, capture MFA prompt, over-hold charges the hold

- Hold buffer **15% → 30%** (`HOLD_BUFFER` / `HOLD_MULTIPLIER` in `index.html` and `pay`). Shelf estimates were coming in ~15% low (order **#38** Waitrose: est. £46.21, till £53.10). New holds need a `pay` deploy; existing holds stay at the amount already on the card.
- Capture `mfa_required`: Ops opens the 6-digit modal and retries after verify (no dead-end alert). `mfaPending()` is true whenever the founder has a verified TOTP factor and the session is not `aal2`.
- **Bug:** live capture always 403'd `mfa_required` even after a TOTP login. `@supabase/server` `userClaims` has no `aal`; the claim is `ctx.jwtClaims.aal`. Capture now reads that. `payApi('capture')` refreshes the session so the JWT sent is current.
- If till + 5% exceeds the hold, `pay` captures the hold (never more). Ops warns “Plentry covers £X”. Stripe cannot charge past the authorised amount — the shortfall is the float.
- Tests: `npm test` **103**. **Shipped:** static `plentry-11vcbs682` + `pay` **v19**.

## 2026-09-19 — cooking methods on the order + 4-day then slot tracking

- **I-O15:** `placeOrder` writes `items.recipes` (name, emoji, time, ing, steps/tip). `pay` checkout looks up those names in `meals` and writes a cleaned snapshot (`cleanRecipes`, catalog rows win over the client) so a later catalog edit cannot blank the customer's method. Orders tab: one **Cooking instructions** button per dinner; snapshot first, catalog-by-name fallback, honest copy if gone — no live AI. Friend order **#38** (Waitrose, 4 dinners) backfilled from the catalog.
- **I-O16:** after the hold the customer sees **Expected by {created_at + 4 days}** (~3 supermarket + ~1 Ops). After capture, Ops types the shop's delivery window into `orders.delivery_slot` (≤80, no `<>`; INSERT forced null by `orders_clear_slot_on_insert`). Saving the slot marks **Ordered**; the customer then sees **{store} delivers {slot}**, then **Delivered**. Store marketing ETAs are no longer shown as the order ETA.
- Tests: `npm test` **102**. Needs static + `pay` deploy before customers see it.

## 2026-09-18 13:25 BST — S-06 / S-14 closed; audit complete

- Founder enrolled TOTP in Profile → Security (factor `verified` 12:19 UTC) and re-logged in with the code. Agent then applied `supabase/admin_mfa.sql` as migration `admin_mfa_aal2_policies` (five founder policies on `orders`/`meals` now `using/with check (public.is_founder_aal2())`; function executable by `authenticated` only) and ran `supabase secrets set REQUIRE_ADMIN_MFA=1` (`pay` capture returns `mfa_required` 403 for an `aal1` founder session).
- Verified live, read-only: RLS probe with a founder JWT — `aal1` → 5 own orders, 0 other customers, `is_founder_aal2()` false; `aal2` → 30 orders, 25 other customers, true. Rolled-back probe: a 60-line worst-case server-built basket at £249.99 passes `validate_order` (so `pay`'s write-back cannot trip the trigger on real orders; the £500 total cap stays).
- Founder raised the dashboard minimum password length to 8 (S-14). `admin_mfa.sql` header now says APPLIED; contract test `I-A10` asserts the date, the lock-out warning and the roll-back path instead of "NOT APPLIED YET". All 17 findings closed (S-16 accepted). Remaining: one live money test on the new checkout path.

## 2026-09-18 13:04 BST — static shipped (batch complete bar founder steps)

- Founder ran `vercel login` then `npm test && vercel deploy --prod --yes --scope team_…` → `plentry-p1413liv3` is production. Agent ran the RUNBOOK post-deploy checks: sensitive paths 404, app assets 200, all six security headers present, vendor immutable / `sw.js` no-cache, bundle hash matches the repo; in a real browser on production: vendored supabase-js loaded, no third-party script, `eval` blocked by CSP, Supabase REST reachable, SW active. **S-07, S-08, S-10 client, S-12, S-14 client, S-17 and the S-06 UI are live.** S-17 is closed in production (the vault, function sources and SQL are no longer served).
- Still open: S-06 founder enrol (then `admin_mfa.sql` + `REQUIRE_ADMIN_MFA=1`) and S-14 dashboard minimum password length. Vault: SECURITY status cells, CURRENT-STATE, ROADMAP, RUNBOOK.

## 2026-09-17 16:20 BST — functions shipped, static blocked

- **Deployed** (`npm test` 97/97 first): `supabase functions deploy ai checkout pay stripe-webhook notify-order` → `ai` v21, `checkout` v14, `pay` v17, `stripe-webhook` v14, `notify-order` v16 (`_shared/ratelimit.ts` + `_shared/orders.ts` bundled). `verify_jwt` flags unchanged. Smoke: all booted 30–56 ms, no error lines; OPTIONS 204 ×5; `ai` `parse_pantry` → 400 `retired task`; `pay`/webhook/`notify-order` still refuse unauthenticated calls with 401. S-03, S-04, S-05, S-09, S-10 (server), S-11, S-15 are therefore live.
- **Not deployed:** static. `vercel deploy --prod --yes --scope team_…` returned *You do not have access to the specified account*, then `vercel whoami` → *Logged out* (no `auth.json` in `~/Library/Application Support/com.vercel.cli/`). Needs the founder's `vercel login` (browser device flow), then the RUNBOOK static deploy + checks. Compatibility of old static + new functions was checked before shipping the functions alone (same `{i,q}` basket lines; retired `ai` tasks were never called by the client; redirect check falls back to the app origin).
- Why functions alone: every function-side fix is client-transparent, and S-03/S-05 were the highest-risk open items that did not need the static build.

## 2026-09-17 (later) — security fixes S-01…S-17

- **Live Postgres (applied via migrations, each probed in a rolled-back block):** `security_hardening.sql` + `security_hardening_v2.sql` (S-01 — first time ever on production: `rate_limits`, `check_rate_limit()`, `validate_order`, meals/profile CHECKs); new `security_hardening_v3.sql` (S-02/S-09: INSERT forces `payment_status='unpaid'`, null `payment_intent`/`checkout_session`/`amount_held`/`amount_captured`, `status='new'`; total/postcode/store/items re-validated on UPDATE only when they change so 15 legacy null-total rows still move status; `orders.checkout_session` column); new `webhook_secret_vault.sql` (S-13: header secret seeded into `vault.secrets` server-side, `notify_order_webhook_fn` / `invoke_newcoming_review` read `public.order_webhook_secret()`, `ALTER DEFAULT PRIVILEGES` closes new functions to anon/authenticated; cron function fired once → `newcoming` 200, queue empty so no Telegram).
- **Edge functions (staged, not deployed):** `_shared/ratelimit.ts` last-XFF key, bounded, anonymous fail-closed (S-03); new `_shared/orders.ts` (`CATALOG`, `rebuildBasket`, `searchUrl`, `ukPostcode`, `cleanMeals`); `pay` rebuilds and writes back `items` before the hold, rejects unknown keys, refuses capture without a recorded hold, expires the previous Checkout Session, records `checkout_session`, cards only, `REQUIRE_ADMIN_MFA` aal2 gate on capture (S-02/S-04/S-06/S-09); `stripe-webhook` 5xx on DB errors, `completed` only from `unpaid|none|canceled`, UK-postcode guard, records real hold + session, `expired` matches the current session (S-05/S-09); `notify-order` rebuilds every link from the store whitelist, bounded fields, 4000-char cap (S-04); `ai` retires `parse_pantry`/`meal_options` (400), advisor context reviewed-only, 20 new drafts/user/day, error detail only when signed in (S-11/S-15); `checkout` exact-origin `appRedirect`, detail only when signed in (S-10/S-15).
- **Static app (staged, not deployed):** supabase-js **vendored** `vendor/supabase-js-2.116.0.js` from the npm tarball, no CDN (S-07); `vercel.json` CSP + HSTS/nosniff/DENY/Referrer/Permissions headers, smoke-tested in a real browser with the exact headers — zero violations (S-08); `.vercelignore` allow-list after finding `plentry.vercel.app/doc/SECURITY.md`, `/supabase/functions/pay/index.ts`, SQL and tests were publicly served (**new S-17**); `stripeCheckoutUrl()` — `location.href` only to `https://checkout.stripe.com` (S-10); cloud `prefs.budget` normalised + escaped (S-12); `PASSWORD_MIN=8` (S-14); **Profile → Security** founder TOTP enrol (QR from SVG `data:` URL only) + login code challenge, `isAdmin()` false while a code is pending (S-06 UI). `admin_mfa.sql` prepared, **not applied** (enrol first).
- **Tests:** `npm test` **97** passing (was 56). New `test/edge.test.mjs` loads the shared `.ts` helpers directly in Node (rate-limit identity/fail policy, basket rebuild, postcode, store links, catalog equality across `index.html`/`ai`/`orders.ts`) and parse-checks all six functions. Harness: vendored-script strip, `mockMfa()` MFA surface. Invariants added: I-S01, I-O11–14, I-X02–03, I-A04–11.
- **Not done here (founder):** deploy (`vercel deploy --prod` + functions), enrol TOTP then `admin_mfa.sql` + `supabase secrets set REQUIRE_ADMIN_MFA=1`, Auth minimum password length 8. Until the deploy, production functions/static are the 16 Sep build.

## 2026-09-17

- **Security audit (no app code change):** backend → frontend pass recorded in [SECURITY.md](SECURITY.md) “Open findings” (S-01…S-16). Headline: `security_hardening.sql` / `security_hardening_v2.sql` were never applied to live Postgres — no `rate_limits` / `check_rate_limit()` (all edge rate limits fail open) and no `validate_order` trigger (orders unvalidated). Also: customers can insert orders that look `authorized`; XFF-spoofable anonymous rate key; webhook swallows DB errors; no CSP/frame headers; CDN script without SRI. `CURRENT-STATE.md` money table corrected. `npm test` 56 passing.
- Vault lock for agents: [REQUIREMENTS.md](REQUIREMENTS.md) (MVP in/out), [INVARIANTS.md](INVARIANTS.md) (test IDs + gaps), [FLOWS.md](FLOWS.md) (checkout / Ops / Meals). Playbook, `AGENTS.md`, and Cursor rule now start there. **No app rewrite** — `index.html` stays the front end.
- Invariant tests closed: over-hold capture, `payApi` error JSON, unpaid Ops lock, Telegram only on authorized, webhook keeps door address, `placeOrder` writes `address.delivery`, first-time vs saved checkout, Profile delivery persist. `npm test` **56** passing.
- Production gate spelled out for agents: `npm test` must exit 0 before `vercel deploy --prod` or `supabase functions deploy` (`I-A03`).

## 2026-09-16

- Ops capture: type store £ → preview **customer charge (store + 5%)** → **Charge £X** → **Confirm £X**. After capture: **Money received — £X is in Stripe** and **Open {store}**. Delivery line prefers the in-app door address, not card billing. Checkout asks for a door address every time (reuse saved, or a new one); saved on Profile. Stripe billing stays on Stripe. `payApi` surfaces Stripe error text. `npm test` **46** passing.

## 2026-09-14

- Onboarding: dinners/week is a **1–7** bar (same control on Profile). New step for **diet + dinner tags** (`prefs.tags`); Profile has the same tag chips. Week ranking uses those tags when set, else the old goals map. Basket / shop / confirm show a noticeable **Do NOT keep spices you already have** warning and **I already have — skip**. Client-only until the next static ship. `npm test` **44** passing.
- **Meals tab (founder only):** catalog work moved off Ops. **New meal** holds unverified rows (`reviewed_at` null) with ingredients + method visible; **Live catalog** lists every verified dinner grouped by diet, with ingredients and instructions behind **Ingredients & method**. Add → save/verify/tags in one editor; Verify & publish is live from Postgres (no extra deploy). If the admin fetch is empty, Live catalog falls back to the week catalog so the list is never blank. New week / Modify ignore unverified rows when a live pool exists. Founder INSERT/UPDATE/DELETE via JWT email; leftover public `insert meals` (`created_by = auth.uid()`) dropped on live Postgres. `npm test` **42** passing. SQL: `admin_meals_write.sql` (also in `admin_policies.sql`). Production static: https://plentry.vercel.app (`49a7697`).
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
