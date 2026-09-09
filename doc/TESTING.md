# Testing

## Command

```bash
npm test   # from the app directory (plentry/)
```

Runs Node’s test runner on `test/app.test.mjs` and `test/contracts.test.mjs`. **37** passing as of 9 Sep 2026. Exit 0 is required before staging UI, money, order, or XSS changes.

## Harness

`plentry/test/harness.mjs`:

- Reads `index.html`.
- Replaces the Supabase CDN script with `createClient() → window.__mockSb`.
- `JSDOM` with `runScripts: 'dangerously'`, url `https://plentry.vercel.app/`.
- Chainable mock `from()` / `auth.getSession`.
- `fetch` stubbed (no network in unit tests).

App globals under test: function declarations on `window` (`gbp`, `renderMenu`, `applyModify`, `hydrateOrdersFromDb`, …). Live state via `window.__plentry.state()` (`let S` is not a window property). `COMMISSION` / `validMeal` are on `__plentry` too.

## Suites

| File | Guards |
|---|---|
| `test/app.test.mjs` | Load, commission, XSS, postcode, week length, Modify from catalog (no AI), advisor cap, cupboard already-have, editable basket + confirm, cupboard Have list + implied seasoning, catalog `recipe` without AI, meal tags, order hydrate, Ops (incl. newcoming empty state), photos |
| `test/contracts.test.mjs` | Commission/hold; TheMealDB photos; AI tags + newcoming; status whitelist; no `meal_options` AI on Modify; cupboard pantry (no AI); cupboard + confirm copy |

`window.__plentry` is a test/debug hook at the end of `index.html`. Do not call it from product UI.

## Adding a test

1. Prefer asserting through the harness (user-visible behaviour).
2. For money, assert **both** client helpers and the `pay` source contract.
3. Do not call live Anthropic, Stripe, or Pepesto in `npm test`.

## Manual / staging smoke (not automated)

Signup → week → Modify (catalog, no AI wait) → Basket: skip oil / add item → Review & send → Stripe `4242` → Orders → Ops capture. See ROADMAP.
