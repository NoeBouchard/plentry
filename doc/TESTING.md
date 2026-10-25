# Testing

## Command

```bash
npm test   # from the app directory (plentry/)
```

Runs Node’s test runner on `test/app.test.mjs`, `test/contracts.test.mjs` and `test/edge.test.mjs`. **178** passing as of 25 Oct 2026. Needs Node ≥ 22.18 (native TypeScript stripping — `edge.test.mjs` imports the `.ts` helpers directly; `package.json` has `"type": "module"`).

**Merge gate:** GitHub Actions job **test** (`.github/workflows/test.yml`) runs this same command on every pull request and on push to `main`. Do not merge if CI is red.

**Production gate:** exit 0 is required before **any** production ship. From 13 Oct 2026 until PR #12 (`4699353a`, 15 Oct 2026), merging to `main` auto-deployed static to production, so a red suite meant do not merge. A merge does not deploy `main` (`git.deploymentEnabled.main` is false), and a red suite means do not merge and do not ship. The same gate applies to the `pay` deploy and to the REST create (`autoAssignCustomDomains: false`) / promote (founder CLI: `vercel deploy --prod --skip-domain` / `vercel promote`). This is not optional for UI, money, orders, XSS, or “small” copy changes that sit in `index.html`. When the change touches `_shared/portions.ts` or the basket block, follow [Shipping pay and static together](RUNBOOK.md#shipping-pay-and-static-together). Static does not go live on merge.

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
| `test/app.test.mjs` | Load, commission, XSS, `stripeCheckoutUrl` (I-X02), hostile cloud budget (I-X03), postcode (empty start, placeholder, blank blocked, saved kept), password min 8 (I-A07), **Log in opens login**, **Don't have an account?** switches to sign-up (sign-up still returns to log in), sign-up entry points still open sign-up (New week, dinner pick, meal details, advisor, checkout confirm), week length, Modify from catalog (no AI), **Modify alternatives (I-W02: 4–6 when enough fit, refresh excludes the week and meals already shown, diet filter, tag order, short list, vegan week already full, swap rebuilds the basket and the basket share; basket shares sum to the Tesco basket at 2/4/6, Modify’s simulated share equals the post-swap card, other cards and the basket move after a swap, pomodoro’s share stays under its private basket, the Tesco week shares and basket totals are pinned at 2/4/6 and pomodoro swapped in for salmon is pinned at £4.07 / £4.71 / £5.83, a dinner that owns no basket line says From your cupboard, a 0p share that still owns a line shows the price, customer Price soon, admin incomplete, catalogue fallback, SQL parity)**, advisor cap, cupboard already-have, editable basket + confirm, cupboard Have list + pictures (I-C04) + implied seasoning, catalog `recipe` without AI, meal tags, 1–7 meal bar, wantedTags vs goals, onboarding step order, diet filter (I-W07), meal_prep chip hidden, legacy goals/budget, unset budget (no cap, no line, stored number, Profile set), omnivore ranking, unpublished skipped on auto-pick, order hydrate, order recipes snapshot (I-O15), promised window + hollow timeline (I-O16), **Issue + Inbox** (I-O18), **founder 2-step verification** (code gate hides Ops/Inbox, enrol with QR, hostile QR/factor id refused, customers never see Security), **servings 2/4/6** (I-P01, I-P05) and Beef ragù packs + recipe note (I-P02), **basket share** (I-P06: each dinner’s share of the whole-pack basket; the day cards sum to Basket £; Modify shows that share; a dinner that owns no basket line says From your cupboard; a share that rounds to 0p while the dinner still owns a line shows the price), Ops queue, Ops capture preview + two-tap confirm + money-received + over-hold, `payApi` errors, unpaid lock, `placeOrder` delivery insert + UK phone + slot, first-time + saved delivery, Profile delivery persist, Meals add/verify, photos |
| `test/contracts.test.mjs` | Commission/hold/£500; hardening SQL objects (I-S01); forced INSERT columns + capture hold guard (I-O11); server-built basket + whitelist links (I-O12, now `basketFor` then `rebuildBasket`); webhook 5xx / idempotent / postcode (I-O13); one session per order (I-O14); vendored supabase-js hash (I-A04); CSP + headers parse (I-A05); `.vercelignore` allow-list (I-A06); password min (I-A07); ai retired tasks / reviewed-only / drafts quota (I-A08); error detail (I-A09); founder MFA (I-A10); Vault secret (I-A11); redirect origins (I-X02); budget (I-X03); TheMealDB photos; AI tags + newcoming; Meals tab ids; founder insert/delete SQL; status whitelist; Telegram only on authorized; webhook keeps delivery; pay PI shipping vs Stripe collection fallback; no `meal_options` AI on Modify; cupboard pantry (no AI); cupboard pictures (I-C04); cupboard + confirm copy; **published meals read (I-A13, SQL file parsed only — not applied)** |
| `test/edge.test.mjs` | Real unit tests on `supabase/functions/_shared/*.ts` (no `npm:` imports): rate-limit identity (last XFF, bounded, user id wins) and fail policy (signed-in open, anonymous closed); `rebuildBasket` (catalog-only, client text discarded, clamp/merge, fallback pricing), `searchUrl` whitelist, `cleanMeals`, `CATALOG` == `ai` `CATALOG` == `index.html` `INGREDIENTS` keys **and pack sizes**; `basketFor` / `scalePortion` (I-P02–I-P04, Beef ragù, byte-identical client block); `ukPostcode`; every `functions/*/index.ts` parses (a `SyntaxError` fails, only the `npm:` specifier may) |

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

## Manual check after `meals_read_published.sql` is applied

Not part of `npm test`. The file is pending. Paste it in the Supabase SQL editor and run that transaction there. Do not apply it with the Supabase CLI, the Supabase GitHub integration, or a `supabase/migrations/` file.

Catalog count as of 21 Oct 2026: **52 published, 25 drafts** (77 rows). Drafts are rows with `reviewed_at` null. If Verify & publish changed the catalog before this check, use the new published count and still expect zero drafts.

1. **Anon, published columns.** `GET /rest/v1/meals?select=id,name,reviewed_at` with the anon key (`apikey` and `Authorization: Bearer`). Expect **52** rows. Every `reviewed_at` is non-null. No draft is in the list.
2. **Non-admin login.** The same request with a signed-in non-admin JWT returns those published rows and no row with `reviewed_at` null. The Meals tab stays hidden.
3. **Anon `select=*`.** `GET /rest/v1/meals?select=*` with the anon key fails (permission denied). It must not return `created_by`, `source`, or `created_at`.
4. **Admin.** An admin session at aal2 can still read drafts (`reviewed_at` null) from the Meals tab. `admin read meals` is unchanged.
