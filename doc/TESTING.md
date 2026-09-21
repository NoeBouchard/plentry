# Testing

## Command

```bash
npm test   # from the app directory (plentry/)
```

Runs Node’s test runner on `test/app.test.mjs`, `test/contracts.test.mjs` and `test/edge.test.mjs`. **105** passing as of 21 Sep 2026. Needs Node ≥ 22.18 (native TypeScript stripping — `edge.test.mjs` imports the `.ts` helpers directly; `package.json` has `"type": "module"`).

**Merge gate:** GitHub Actions job **test** (`.github/workflows/test.yml`) runs this same command on every pull request and on push to `main`. Do not merge if CI is red.

**Production gate:** exit 0 is required before **any** production ship (`vercel deploy --prod`, `supabase functions deploy`). A failing suite means do not deploy. This is not optional for UI, money, orders, XSS, or “small” copy changes that sit in `index.html`. Merge is not live — Vercel is not git-connected.

Invariant IDs: [INVARIANTS.md](INVARIANTS.md). Automated rules are covered; `I-A01` / `I-A02` stay playbook (no React, no secrets).

## Harness

`plentry/test/harness.mjs`:

- Reads `index.html`.
- Strips the vendored `<script src="/vendor/supabase-js-…">` tag and injects `createClient() → window.__mockSb`.
- `JSDOM` with `runScripts: 'dangerously'`, url `https://plentry.vercel.app/`.
- Chainable mock `from()` / `auth.getSession`. Optional `opts.mfa` (use `mockMfa({ enrolled, goodCode, qr })`) adds a fake `sb.auth.mfa` surface (`getAuthenticatorAssuranceLevel`, `listFactors`, `enroll`, `challengeAndVerify`, `unenroll`); omitted = no 2-step configured.
- `fetch` stubbed (no network in unit tests).

App globals under test: function declarations on `window` (`gbp`, `renderMenu`, `applyModify`, `hydrateOrdersFromDb`, …). Live state via `window.__plentry.state()` (`let S` is not a window property). `COMMISSION` / `validMeal` are on `__plentry` too.

## Suites

| File | Guards |
|---|---|
| `test/app.test.mjs` | Load, commission, XSS, `stripeCheckoutUrl` (I-X02), hostile cloud budget (I-X03), postcode, password min 8 (I-A07), week length, Modify from catalog (no AI), advisor cap, cupboard already-have, editable basket + confirm, cupboard Have list + implied seasoning, catalog `recipe` without AI, meal tags, 1–7 meal bar, wantedTags vs goals, omnivore ranking, unpublished skipped on auto-pick, order hydrate, order recipes snapshot (I-O15), promised window + hollow timeline (I-O16), **Issue + Inbox** (I-O18), **founder 2-step verification** (code gate hides Ops/Inbox, enrol with QR, hostile QR/factor id refused, customers never see Security), Ops queue, Ops capture preview + two-tap confirm + money-received + over-hold, `payApi` errors, unpaid lock, `placeOrder` delivery insert + UK phone + slot, first-time + saved delivery, Profile delivery persist, Meals add/verify, photos |
| `test/contracts.test.mjs` | Commission/hold/£500; hardening SQL objects (I-S01); forced INSERT columns + capture hold guard (I-O11); server-built basket + whitelist links (I-O12); webhook 5xx / idempotent / postcode (I-O13); one session per order (I-O14); vendored supabase-js hash (I-A04); CSP + headers parse (I-A05); `.vercelignore` allow-list (I-A06); password min (I-A07); ai retired tasks / reviewed-only / drafts quota (I-A08); error detail (I-A09); founder MFA (I-A10); Vault secret (I-A11); redirect origins (I-X02); budget (I-X03); TheMealDB photos; AI tags + newcoming; Meals tab ids; founder insert/delete SQL; status whitelist; Telegram only on authorized; webhook keeps delivery; pay PI shipping vs Stripe collection fallback; no `meal_options` AI on Modify; cupboard pantry (no AI); cupboard + confirm copy |
| `test/edge.test.mjs` | Real unit tests on `supabase/functions/_shared/*.ts` (no `npm:` imports): rate-limit identity (last XFF, bounded, user id wins) and fail policy (signed-in open, anonymous closed); `rebuildBasket` (catalog-only, client text discarded, clamp/merge, fallback pricing), `searchUrl` whitelist, `cleanMeals`, `CATALOG` == `ai` `CATALOG` == `index.html` `INGREDIENTS` keys; `ukPostcode`; every `functions/*/index.ts` parses (a `SyntaxError` fails, only the `npm:` specifier may) |

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
