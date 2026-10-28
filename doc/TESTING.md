# Testing

## Command

```bash
npm test   # from the app directory (plentry/)
```

Runs Node’s test runner on `test/app.test.mjs`, `test/contracts.test.mjs`, `test/edge.test.mjs`, `test/meals-followups.test.mjs`, and `test/capture-split.test.mjs`. **223** passing as of 28 Oct 2026. Main `ea90a31` is **214**. Main `985a451` is **196**. Main `89c84c1b` is **194**. PR #32 added 7 I-A14 tests (2 jsdom, 3 source contracts, 2 PGlite) on top of the 187 at `df0c53e0`. PR #33 added 2 tests for the pending `MAINTAIN` revoke (1 source contract, 1 PGlite), so 194 + 2 = 196. The capture-integrity change added 18 I-M10 tests: 1 jsdom, 1 source contract, 14 edge (split, £4.30, 1p–£500 sweep, retry, alert, 42703 fallback, PGRST204 fallback, already-succeeded, reconcile, Telegram), and 2 PGlite, so 196 + 18 = 214. This servings change adds 6 tests (5 jsdom, 1 source contract), so 214 + 6 = 220. The delivery-window fix adds 3 tests (2 jsdom: a time tap does not invent a day and a half-typed address survives, and a stale day outside the window is cleared; 1 source contract: `#slot-days`, `#slot-wins`, `slotPickerHtml()`, and `slot_date` / `slot_start` / `slot_end` on the order insert, with no `days[0]` default), so 220 + 3 = 223. Needs Node ≥ 22.18 (native TypeScript stripping — `edge.test.mjs` imports the `.ts` helpers directly; `package.json` has `"type": "module"`).

**Merge gate:** GitHub Actions job **test** (`.github/workflows/test.yml`) runs this same command on every pull request and on push to `main`. Do not merge if CI is red.

**Production gate:** exit 0 is required before **any** production ship, including a merge to `main`. From 13 Oct 2026 until PR #12 (`4699353a`, 15 Oct 2026), merging to `main` auto-deployed static to production, so a red suite meant do not merge. Static still does not go live on merge (`git.deploymentEnabled.main` is false). Edge functions do not either: Deploy to production is OFF (Noé, 25/26 Oct 2026). Functions deploy only by hand with `supabase functions deploy <name>` or MCP, under a GO. If Deploy to production is ever re-enabled, every merge redeploys all functions. A red suite means do not merge and do not ship. The same gate applies to a hand functions deploy and to the REST create (`autoAssignCustomDomains: false`) / promote (founder CLI: `vercel deploy --prod --skip-domain` / `vercel promote`). This is not optional for UI, money, orders, XSS, or “small” copy changes that sit in `index.html`. When the change touches `_shared/portions.ts` or the basket block, follow [Shipping pay and static together](RUNBOOK.md#shipping-pay-and-static-together). Capture split: apply `orders_capture_split.sql`, then hand-deploy `pay` and `notify-order` in the same GO ([RUNBOOK](RUNBOOK.md#capture-split-pending)).

Invariant IDs: [INVARIANTS.md](INVARIANTS.md). Automated rules are covered; `I-A01` / `I-A02` stay playbook (no React, no secrets).

## Harness

`plentry/test/harness.mjs`:

- Reads `index.html`.
- Strips the vendored `<script src="/vendor/supabase-js-…">` tag and injects `createClient() → window.__mockSb`.
- `JSDOM` with `runScripts: 'dangerously'`, url `https://getplentry.com/`.
- Chainable mock `from()` / `auth.getSession`. Optional `opts.mfa` (use `mockMfa({ enrolled, goodCode, qr })`) adds a fake `sb.auth.mfa` surface (`getAuthenticatorAssuranceLevel`, `listFactors`, `enroll`, `challengeAndVerify`, `unenroll`); omitted = no 2-step configured.
- `fetch` stubbed (no network in unit tests).

App globals under test: function declarations on `window` (`gbp`, `renderMenu`, `applyModify`, `hydrateOrdersFromDb`, …). Live state via `window.__plentry.state()` (`let S` is not a window property). `COMMISSION` / `validMeal` are on `__plentry` too.

## Suites

| File | Guards |
|---|---|
| `test/app.test.mjs` | Load, commission, XSS, `stripeCheckoutUrl` (I-X02), hostile cloud budget (I-X03), postcode (empty start, placeholder, blank blocked, saved kept), password min 8 (I-A07), **Log in opens login**, **Don't have an account?** switches to sign-up (sign-up still returns to log in), sign-up entry points still open sign-up (New week, dinner pick, meal details, advisor, checkout confirm), week length, Modify from catalog (no AI), **seeded tie-break (I-W08: unpinned New week taps mint a seed and usually differ, a pinned `?seed=` or `setWeekSeed` repeats seed, seed+1, seed+2 across runs, Modify stays on that week's seed, higher scores stay first, no `Math.random` in ordering, tie-break order across seeds is roughly uniform)**, **Modify alternatives (I-W02: 4–6 when enough fit, refresh excludes the week and meals already shown, diet filter, tag order, short list, vegan week already full, swap rebuilds the basket and the basket share; basket shares sum to the Tesco basket at 2/4/6, Modify’s simulated share equals the post-swap card, other cards and the basket move after a swap, pomodoro’s share stays under its private basket, the Tesco week shares and basket totals are pinned at 2/4/6 and pomodoro swapped in for salmon is pinned at £4.07 / £4.71 / £5.83, a dinner that owns no basket line says From your cupboard, a 0p share that still owns a line shows the price, customer Price soon, admin incomplete, catalogue fallback, SQL parity)**, advisor cap, cupboard already-have, editable basket + confirm, cupboard Have list + pictures (I-C04) + implied seasoning, catalog `recipe` without AI, meal tags, 1–7 meal bar, wantedTags vs goals, onboarding step order, diet filter (I-W07), meal_prep chip hidden, legacy goals/budget, unset budget (no cap, no line, stored number, Profile set), omnivore ranking, unpublished skipped on auto-pick, order hydrate, order recipes snapshot (I-O15), promised window + hollow timeline (I-O16), **Issue + Inbox** (I-O18), **founder 2-step verification** (code gate hides Ops/Inbox, enrol with QR, hostile QR/factor id refused, customers never see Security), **servings 2/4/6** (I-P01, I-P05) and Beef ragù packs + recipe note (I-P02), **basket share** (I-P06: each dinner’s share of the whole-pack basket; the day cards sum to Basket £; Modify shows that share; a dinner that owns no basket line says From your cupboard; a share that rounds to 0p while the dinner still owns a line shows the price), Ops queue, Ops capture preview + two-tap confirm + money-received + over-hold, `payApi` errors, capture not recorded stays off Money received (I-M10), unpaid lock, `placeOrder` delivery insert + UK phone + slot, **no silent default day (I-O16: time tap does not invent the earliest day, pay stays off until day and time, half-typed address survives, a day outside the window is cleared with its time, the disabled pay button names the missing day and time, aria-pressed marks the selection)**, first-time + saved delivery, Profile delivery persist, Meals add/verify, photos |
| `test/contracts.test.mjs` | Commission/hold/£500; hardening SQL objects (I-S01); forced INSERT columns + capture hold guard (I-O11); server-built basket + whitelist links (I-O12, now `basketFor` then `rebuildBasket`); webhook 5xx / idempotent / postcode (I-O13); one session per order (I-O14); vendored supabase-js hash (I-A04); CSP + headers parse (I-A05); `.vercelignore` allow-list (I-A06); password min (I-A07); ai retired tasks / reviewed-only / drafts quota (I-A08); error detail (I-A09); founder MFA (I-A10); Vault secret (I-A11); redirect origins (I-X02); budget (I-X03); TheMealDB photos; AI tags + newcoming; Meals tab ids; founder insert/delete SQL; status whitelist; Telegram only on authorized; webhook keeps delivery; pay PI shipping vs Stripe collection fallback; no `meal_options` AI on Modify; cupboard pantry (no AI); cupboard pictures (I-C04); cupboard + confirm copy; **published meals read (I-A13, SQL file parsed; applied to prod 25 Oct 2026)**; **seeded tie-break (I-W08)**; **meals column follow-ups (I-A14, SQL parsed; applied to prod 26 Oct 2026)**; **MAINTAIN revoke (`meals_revoke_maintain.sql` parsed; PENDING, not applied)**; **capture split SQL (I-M10, pending, not a migration)**; **delivery window step (I-O16: `#slot-days`, `#slot-wins`, `slotPickerHtml()`, insert `slot_date` / `slot_start` / `slot_end`, no `days[0]` default, stale day cleared, pay reason, aria-pressed)** |
| `test/meals-followups.test.mjs` | **I-A14.** PGlite runs `meals_read_published.sql` then `meals_followups.sql`. Anon `select created_by` is permission denied, anon sees 0 drafts, the 11 catalogue columns return the published row, and anon INSERT/UPDATE/DELETE/TRUNCATE are permission denied. A signed-in non-admin is permission denied for DELETE, TRUNCATE, REFERENCES, and TRIGGER, and the row count stays. An aal2 admin can still INSERT and UPDATE and call `admin_read_meals()`; a non-admin and an aal1 member are refused by the insert policy and the RPC. The follow-ups SQL was applied to prod at about 15:42 GMT on 26 Oct 2026. PGlite still runs that file, then `meals_revoke_maintain.sql` (Postgres 18): anon and authenticated lack `MAINTAIN` and still have the 11-column SELECT. That revoke file is PENDING and not applied. The aal2 admin path is untested |
| `test/capture-split.test.mjs` | **I-M10.** PGlite runs `orders_capture_split.sql` only inside the test. Old rows stay null. INSERT forces the split null. A negative fee within range is kept. Authenticated cannot INSERT or UPDATE `store_total`, `fee_amount`, `overrun_amount`, or `amount_captured`, and can still update `status`. `service_role` can write the split. The SQL is not applied to any database |
| `test/edge.test.mjs` | Real unit tests on `supabase/functions/_shared/*.ts` (no `npm:` imports): rate-limit identity (last XFF, bounded, user id wins) and fail policy (signed-in open, anonymous closed); `rebuildBasket` (catalog-only, client text discarded, clamp/merge, fallback pricing), `searchUrl` whitelist, `cleanMeals`, `CATALOG` == `ai` `CATALOG` == `index.html` `INGREDIENTS` keys **and pack sizes**; `basketFor` / `scalePortion` (I-P02–I-P04, Beef ragù, byte-identical client block); `ukPostcode`; capture split, £4.30, 1p–£500 sweep, retry, 42703 and PGRST204 fallbacks, already-succeeded PaymentIntent, assertion alert, reconcile (I-M10); Telegram send; every `functions/*/index.ts` parses (a `SyntaxError` fails, only the `npm:` specifier may) |

`window.__plentry` is a test/debug hook at the end of `index.html`. Do not call it from product UI.

## Adding a test

1. Prefer asserting through the harness (user-visible behaviour).
2. For money, assert **both** client helpers and the `pay` source contract.
3. Edge-function logic you want to unit test goes in `supabase/functions/_shared/*.ts` with **no** `npm:` imports, then import it from `test/edge.test.mjs`. Files that import `npm:@supabase/server` can only be source-contracted.
4. Do not call live Anthropic, Stripe, or Pepesto in `npm test`.

## Manual CSP smoke (before a static deploy that touches `vercel.json` or adds an origin)

Serve `plentry/` locally with the `vercel.json` headers applied (any tiny static server that copies the `headers` rules), open it in a browser, register `document.addEventListener('securitypolicyviolation', …)`, then boot the app, load a week (Supabase REST), a meal photo, and the MFA QR (`data:` SVG). Expect zero violations. Done 17 Sep 2026 for the current policy.

## Manual / staging smoke (not automated)

Signup → week → Modify (catalog, no AI wait) → Basket: skip oil / add item → Review & send → Stripe `4242` → Orders → Ops capture. See ROADMAP.

## Seeded week smoke

New week and Modify break equal scores with the week's seed. Each **New week** tap mints a new seed, so the next week usually changes. Modify, including Show 4 more, stays on the seed of the week on screen.

A shared link pins the sequence. Open `https://getplentry.com/?seed=4242` (a whole number is used as-is; any other text is hashed). The first **New week** uses that seed, and each further tap steps to the next number (`4242`, then `4243`, then `4244`). The same link in another tab walks the same weeks. In the console, `window.__plentry.setWeekSeed(4242)` (also `window.setWeekSeed`) starts that sequence for the rest of the page. `window.__plentry.weekSeed()` reads the seed of the week on screen. The tab stores it as `plentry_week_seed`, with the pin and the step beside it.

## Manual check after `meals_read_published.sql` (applied after PR #28)

Applied in the SQL editor. Not part of `npm test`. Applied to prod Supabase at 12:59 GMT on 25 Oct 2026. The applied file sha256 is `3efbb68ce7adc1f613a5251d412da0a1a31b8cbe4cb93858ac4eb5f4a701ac59`. It stays a loose file under `supabase/`, not `supabase/migrations/`. Do not apply it with the Supabase CLI, the Supabase GitHub integration, or a `supabase/migrations/` file. Never create `supabase/migrations/`.

Catalog count at that check: **52 published, 25 drafts** (77 rows). Drafts are rows with `reviewed_at` null. Anon and authenticated do not see the drafts.

Post-apply checks that passed:

1. **Policies.** `pg_policies` shows `read published meals` plus the 3 admin policies.
2. **Anon grants.** Anon has no table-level SELECT and exactly 11 columns granted (`id, name, emoji, time, ing, image_url, recipe, tags, reviewed_at, portions, category`).
3. **Anon and authenticated rows.** Each sees 52 published meals and 0 drafts.
4. **Anon REST.** `select=*` and `select=created_by` return permission denied.
5. **Admin.** An admin session at aal2 should still read drafts (`reviewed_at` null) from the Meals tab. `admin read meals` was not changed. **The admin-with-MFA draft visibility check is untested.** `meals_followups.sql` is applied (26 Oct 2026 ~15:42 GMT). Authenticated no longer has table SELECT. `created_by` and `source` are readable through `admin_read_meals()` for an aal2 admin. That aal2 path is untested.

The same checks, if the catalog changes later:

1. **Anon, published columns.** `GET /rest/v1/meals?select=id,name,reviewed_at` with the anon key (`apikey` and `Authorization: Bearer`). Expect the published count (52 at the 25 Oct check). Every `reviewed_at` is non-null. No draft is in the list.
2. **Non-admin login.** The same request with a signed-in non-admin JWT returns those published rows and no row with `reviewed_at` null. The Meals tab stays hidden. Prod smoke uses the non-admin account whose credentials live in box env vars `PLENTRY_SMOKE_EMAIL` and `PLENTRY_SMOKE_PASSWORD`.
3. **Anon `select=*`.** `GET /rest/v1/meals?select=*` with the anon key fails (permission denied). It must not return `created_by`, `source`, or `created_at`. `select=created_by` fails the same way.
4. **Admin.** An admin session at aal2 can still read drafts (`reviewed_at` null) from the Meals tab. `admin read meals` is unchanged. This check was not run on 25 Oct 2026.

## Manual check after `meals_followups.sql` (applied 26 Oct 2026 ~15:42 GMT)

Not part of `npm test`. Applied to prod at about 15:42 GMT on 26 Oct 2026. The applied file sha256 is `af014769bf7444bb464a7fb37448f278c67ea5872fa6801aa5bc818e05907fb8`. It stays a loose file under `supabase/`, not `supabase/migrations/`. Do not apply it with the Supabase CLI, the Supabase GitHub integration, or a `supabase/migrations/` file. Never create `supabase/migrations/`. `npm test` already runs the file on PGlite (I-A14).

Checks that passed the same day: grants were as reviewed. Anon and authenticated each see 52 published meals and 0 drafts. The aal2 admin path is untested. Open: anon and authenticated still hold `MAINTAIN` on `public.meals`.

The same checks, if the grants are reviewed again:

1. **Anon `created_by`.** `GET /rest/v1/meals?select=created_by` with the anon key fails (permission denied). The same request for `source` fails. `select=id,name,reviewed_at` still returns the published rows and no drafts.
2. **Non-admin login.** `select=created_by` and `select=source` fail. `select=id,name` returns published rows only.
3. **Anon writes.** An anon POST, PATCH, or DELETE to `/rest/v1/meals` fails with permission denied.
4. **Admin.** An aal2 admin still sees **source** and the created date on the Meals tab, including drafts. That read is `admin_read_meals()`, not a table select of `source`. The same session can still add a meal and unpublish one. This aal2 path was not run on 26 Oct 2026. The static client that calls the RPC shipped the same day (`dpl_4DarVmBySV9ujJq3Lrdn7MJgDx93`).
5. **Signed-in non-admin writes.** DELETE and TRUNCATE on `public.meals` fail with permission denied, and the row count is unchanged. INSERT and UPDATE stay granted; the insert and update policies still require `is_admin_aal2()`.
