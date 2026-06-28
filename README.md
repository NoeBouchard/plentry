# Plentry

**Your kitchen on autopilot.** Tell Plentry what's in your fridge, pick the meals you fancy, and it prices the basket across local UK supermarkets and gets the groceries ordered. No boxes, no packing, no mark-ups. A flexible, AI-run alternative to HelloFresh that uses existing supermarkets instead of its own warehouses.

This README is written for the next engineer or AI agent picking up the project. For product direction and the path to revenue, read **`SPEC.md`**. For high-level strategy, **`PLAN.md`**.

---

## TL;DR for a new agent

- **It's a static single-page app + two serverless functions on Vercel + Supabase (Postgres/Auth).** No build step, no framework.
- **Live:** https://plentry.vercel.app · **Repo:** github.com/NoeBouchard/plentry (connected to Supabase + Vercel for auto-deploy)
- **Don't** look for a React/Next app — `index.html` is the entire front end (vanilla JS, inline `<script>`).
- **The AI endpoint (`api/ai.js`) is the brain.** It reads/writes the shared `meals` catalog in Postgres on the user's behalf, so the menu database grows as the app is used.
- **Prices and stores are currently SIMULATED.** This is the #1 thing to know before promising anything to customers (see Limitations).

---

## Architecture

```
Browser (index.html, vanilla JS)
  │  ├─ supabase-js (CDN)  ── Auth + reads/writes profiles, orders     ──┐
  │  └─ fetch /api/ai      ── meal ideas, fridge parsing, recipes, chat ─┤
  ▼                                                                       ▼
Vercel serverless                                            Supabase (Postgres + Auth)
  └─ api/ai.js ── Claude Haiku (Anthropic API)                 profiles · orders · meals
                └─ reads/writes `meals` via PostgREST            (all row-level-security'd)
                   using the caller's access token
```

There is **no custom server**. Everything is either the static page, the one AI function, or Supabase's auto-generated REST/Auth APIs.

### File map

| Path | What it is |
|---|---|
| `index.html` | **The whole front end.** UI, state, Supabase calls, all screens. ~1.3k lines, one inline `<script>`. |
| `api/ai.js` | **The AI serverless function.** Vercel deploys anything in `api/` as a function. Handles 4 tasks; talks to Anthropic + Postgres. |
| `supabase/schema.sql` | Database schema. **Idempotent — safe to re-run.** Creates `profiles`, `orders`, `meals` with RLS policies. |
| `SPEC.md` | Product spec + the concrete plan to first paying customers. Start here for "what to build next". |
| `PLAN.md` | Business/strategy: JTBD, differentiation, market, roadmap, risks. |
| `README.md` | This file. |

---

## How it works (the core loop)

1. **Auth** — Supabase email/password. On load, `init()` restores the session and pulls the user's saved state from `profiles.state` (a JSONB blob).
2. **Onboarding** — postcode / household / budget / dinners-per-week, then a free-text "what's in your kitchen?" box → `api/ai` `parse_pantry` turns it into a tracked pantry (catalog items with 0–1 stock fractions). No taste/cuisine questions — preferences are expressed by *picking meals*.
3. **Menu** — `api/ai` `meal_options` proposes dinners. The user taps the ones they want. "💬 Meal advisor" opens a chat (`advisor` task) that asks ~2 questions then proposes a set to pick from. Every meal card has "ⓘ Details & recipe".
4. **Basket** — selected meals → ingredient list → minus pantry stock → shopping list, priced across the 4 stores. User picks a store and confirms.
5. **Order** — written to the `orders` table for **manual concierge fulfilment** (you place it at the store). Recipes (`recipe` task) generate per chosen meal.
6. **Pantry sync** — marking an order delivered (or flipping `orders.status` to `delivered` in the dashboard) restocks the pantry.

### State model

Client state lives in a single object `S` (see `DEFAULTS` in `index.html`): `{ user, prefs, pantry, menuOptions, selected, recipes, orders, onboarded }`. It's mirrored to `localStorage` (`plentry_v1`) and debounced-synced to `profiles.state` in Postgres when signed in. **The `meals` table is the shared, cross-user catalog; everything else in `S` is per-user.**

---

## The AI endpoint contract (`POST /api/ai`)

Request body: `{ task, payload, accessToken }`. `accessToken` is the Supabase session JWT — required for any DB read/write. All responses are strict JSON.

| `task` | `payload` | Returns | DB side effects |
|---|---|---|---|
| `parse_pantry` | `{ text }` | `{ pantry: { item: 0..1 } }` | none |
| `meal_options` | `{ pantry, size, budget, count, exclude[] }` | `{ meals: [{name,emoji,time,ing[]}] }` | **reads** all `meals` names → adds to `exclude`; **writes** new valid dishes back (`source:'ai'`) |
| `recipe` | `{ name, ing[], servings }` | `{ steps[], tip }` | none |
| `advisor` | `{ messages: [{role,content}] }` | `{ message, meals[] }` | **writes** proposed dishes back (`source:'advisor'`) |

Key behaviours baked into `api/ai.js`:
- **Catalog-grounded.** Every ingredient must be in `CATALOG` (24 items today). `VALID()` drops any meal referencing an unknown ingredient — both from the model and before DB writes. **Expanding the catalog is the single highest-leverage change** for menu variety; see SPEC.
- **DB-as-memory.** For `meal_options` it reads existing meal names and forbids duplicates, then persists new ones — so the menu database grows with use and never repeats. This is the "AI uses the DB like an MCP" behaviour.
- **Model:** `claude-haiku-4-5` (cheapest tier). A full onboarding + menu + 5 recipes is roughly £0.01–0.02/user.
- **Graceful degradation.** If `ANTHROPIC_API_KEY` is missing the endpoint returns `503 ai_not_configured`; the front end silently falls back to `FALLBACK_MEALS` and a regex pantry parser, so the app never hard-breaks.

---

## Run & deploy

### Local
There's no build. Open `index.html` directly for UI work, **but** `/api/ai` won't exist (the app falls back to built-ins). For the full stack locally, use `vercel dev` (Vercel CLI) with the env var set.

### Environment variables (Vercel project)
| Var | Where | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Vercel env (encrypted) | The only secret. Set on `production`/`preview`/`development`. |

The Supabase **URL and publishable key are hard-coded** in `index.html` and `api/ai.js` — that's fine, they're public by design; data is protected by RLS, not by hiding the key. The Anthropic key must NEVER reach the client — it lives only in the serverless function.

### Deploy
The repo is connected to Vercel and Supabase via GitHub, so **`git push` auto-deploys**. Manual deploy if needed:
```bash
vercel deploy --prod --yes --token <VERCEL_TOKEN>
```
After changing `supabase/schema.sql`, re-run the whole file in the Supabase SQL Editor (it's idempotent).

---

## Database

Run `supabase/schema.sql` (idempotent). Three tables, all RLS-protected:

- **`profiles`** — `id (=auth.users.id)`, `email`, `name`, `state jsonb`, `updated_at`. One row per user; `state` is the synced client blob.
- **`orders`** — `id`, `user_id`, `email`, `name`, `postcode`, `store`, `total`, `items jsonb` (basket + meals + eta), `status` (`new`→`ordered`→`delivered`), `created_at`. **This is the ops queue** you work from to fulfil orders.
- **`meals`** — shared catalog: `name (unique)`, `emoji`, `time`, `ing jsonb`, `source` (`ai`|`advisor`|`seed`), `created_by`. Grows automatically via `api/ai.js`.

RLS: users only see/write their own `profiles`/`orders`; any authenticated user can read `meals` and insert ones they create.

---

## Conventions & gotchas

- **Vanilla everything.** No bundler, no TypeScript, no framework. Keep `index.html` self-contained; add front-end deps via CDN `<script>` only.
- **Edit live, test headless.** The project is verified with `jsdom` smoke tests (mock Supabase + `fetch`) before each deploy — replicate that when changing flows. Live AI tasks are smoke-tested with `curl` against `/api/ai`.
- **Git lock files in the synced folder.** Working in the mounted Drive folder, git sometimes leaves `*.lock` files it can't delete ("Operation not permitted"). Clear them before git ops: `find .git -name "*.lock" | xargs -r rm -f`.
- **Idempotent SQL.** Postgres `CREATE POLICY` has no `IF NOT EXISTS`, so re-running naive SQL aborts midway (this is why tables once went missing). Always `drop policy if exists` before `create policy`. The current schema already does this.
- **Auth is required for the backend.** Orders and the meals catalog are written under RLS with the user's token. A logged-out user can't persist anything. Disable *email confirmation* (Supabase → Auth → Email) to remove signup friction, but don't remove login itself.
- **Secrets hygiene.** Tokens (GitHub/Vercel/Anthropic) have been pasted into chat during setup — rotate them periodically. Only `ANTHROPIC_API_KEY` needs to exist server-side.

---

## Current limitations (read before promising anything to a customer)

1. **Store prices are simulated.** Each store has a fixed multiplier on a hard-coded reference price per ingredient (`INGREDIENTS` in `index.html`). The "best price near you" is an *estimate*, not live data. Real or honestly-framed pricing is a prerequisite for charging a price-comparison promise — see `SPEC.md`.
2. **Stores are hard-coded** (Asda/Tesco/Sainsbury's/Waitrose) with fixed distances/fees/slots — not geolocated from the postcode.
3. **Ordering is manual.** No retailer API; you place each confirmed order yourself from the `orders` table. This is intentional for the pilot ("do things that don't scale").
4. **No payments yet.** Free during beta; the plan is manual Stripe Payment Links, then in-app Checkout (see `SPEC.md`).
5. **Catalog is 24 ingredients**, capping menu variety.

---

## Name

**Plentry** (plenty + pantry). "Forq" was dropped early — forq.tech is an active AI food-delivery product with ™ branding.
