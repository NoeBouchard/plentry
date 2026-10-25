# Architecture

Vanilla **single HTML page** + **Supabase** (Postgres, Auth, Edge Functions) + **Vercel** static hosting. No React, no bundler, no Next.js.

```
Browser  index.html (vanilla JS)
  ├─ supabase-js (CDN)     Auth, profiles, orders, meals, ingredient_prices
  └─ fetch SUPABASE_URL/functions/v1/{ai,checkout,pay}
        │
        ├─ ai              Claude Haiku; meals catalog; recipes; advisor; parse_pantry unused by UI (photo later)
        ├─ checkout         Pepesto quotes/bags (optional key). Keyless → {live:false}
        ├─ pay              Stripe Checkout (manual capture) + admin capture
        ├─ stripe-webhook   checkout.session.completed / expired → payment_status
        ├─ notify-order     Telegram ping after authorized hold
        └─ newcoming        Fortnight Telegram of unreviewed meals (cron, not the browser)
```

From 13 Oct 2026 until PR #12 (`4699353a`, 15 Oct 2026), merging to `main` auto-deployed static to production through Vercel’s Git integration. `vercel.json` now sets `git.deploymentEnabled` to `{ "main": false }`, so a merge does not deploy `main`. Other branches still get preview deployments. `pay` and the other edge functions are still a separate Supabase deploy. Static ships from the merge SHA through the Vercel REST API (`autoAssignCustomDomains: false`, then promote). A logged-in founder session can use `vercel deploy --prod --yes --skip-domain --scope team_QHpJBQejbrxZ2PhEZQlmbuhj`, confirm READY, then `vercel promote`. When `_shared/portions.ts` or the basket block changes, follow [Shipping pay and static together](RUNBOOK.md#shipping-pay-and-static-together). Workspace: `/Users/noebouchard/work/EVERYTHING/Claude/Projects/Kitchen planner`.

## Front end

- **File:** `plentry/index.html` — CSS, markup, all client JS in one `<script>`.
- **State `S`:** `{ user, prefs, pantry, menuOptions, selected, recipes, orders, onboarded }` in `localStorage` key `plentry_v1`, debounced to `profiles.state`.
- **Orders table is source of truth for order history/status.** `hydrateOrdersFromDb()` overwrites the local cache after login, on Orders/Profile, and after Stripe return (`?paid=1`).

## Data (Postgres)

| Table | Role |
|---|---|
| `profiles` | One row per user; `state` JSONB (≤256 KB) |
| `orders` | Concierge queue. `status` `new\|ordered\|delivered`. Payment columns from `orders_payment.sql` |
| `meals` | Shared catalog. `source` `seed\|ai\|advisor\|ops`. `tags` jsonb (closed set). `reviewed_at` null = **New meal**. Clients cannot INSERT; admin insert/update is `is_admin_aal2()`; `ai` inserts drafts via service role. Production SELECT is `read published meals` (`reviewed_at` set) for anon and authenticated. Anon column SELECT is the 11 catalogue columns. Authenticated still has table SELECT until `meals_followups.sql` (pending, not applied). Any new public catalogue column must be added to the anon and authenticated column grants |
| `ingredient_prices` | Shelf prices per store for quoting when Pepesto is off |
| `rate_limits` | Used by edge functions |

RLS on production: users see own profiles/orders. `read published meals` is SELECT for `anon` and `authenticated` where `reviewed_at` is not null (applied after PR #28). Anon has column SELECT on `id, name, emoji, time, ing, image_url, recipe, tags, reviewed_at, portions, category` only. Authenticated still has table SELECT, so a signed-in non-admin can read `created_by` and `source` on published rows. Admin writes and the extra admin read use `admin_roles.sql` (`is_admin_aal2()`). **Pending, not applied:** `supabase/meals_followups.sql` (loose file, not a migration) grants authenticated those same 11 columns, exposes `source`, `created_by`, and `created_at` only through `admin_read_meals()`, and revokes anon INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, and TRIGGER. Any new public catalogue column on `meals` must be added to the anon and authenticated column grants. It does not change `admin read meals`, admin insert, or admin update.

## Edge functions

All under `plentry/supabase/functions/`. Shared rate limiter: `_shared/ratelimit.ts`.

| Fn | Auth | Job |
|---|---|---|
| `ai` | user or publishable | `recipe`, `advisor`. `parse_pantry` and `meal_options` remain in the function; the UI does not call them (pantry is a Have list; Modify uses the meals catalog). Writes meals via **service role** with **tags**; new rows leave `reviewed_at` null. New meals get `image_url` via TheMealDB name search (once at insert). |
| `checkout` | user or publishable | `quote` / `bag` via Pepesto. No key or logged out → `{live:false}` |
| `pay` | user | `checkout` session (hold). `capture` **admin email only**. Server recomputes grocery total from `ingredient_prices`. Adds 5% on hold and capture. |
| `stripe-webhook` | none (signature) | Sets `payment_status=authorized` + address |
| `notify-order` | webhook secret | Telegram |
| `newcoming` | webhook secret | Telegram list of meals with `reviewed_at` null; no-op if empty |

An old `orders` example function is **not** deployed (confirmed 13 Sep 2026). Do not add it back.

## Money path

1. Client inserts `orders` row (`payment_status=unpaid`, `total` = grocery+delivery estimate, `address.delivery` = door).
2. `pay` `checkout` recomputes total, opens Stripe Checkout (manual capture, **card billing** + PI shipping from `address.delivery`). Stripe `shipping_address_collection` only if delivery is missing.
3. Webhook → `authorized` (keeps `address.delivery`) → DB trigger → Telegram.
4. Ops shops from the founder float. Status New/Ordered/Delivered (toggle; reversible). Capture = store £ + 5%, never above hold. Stripe payouts are **not** Tesco cash (days later).

## Ingredient catalog

Catalog keys in `CATALOG` (`ai/index.ts`) and `INGREDIENTS` (`index.html`): 27 groceries plus cupboard seasonings (salt, black pepper, paprika, cumin, chilli flakes, mixed herbs, soy sauce, stock cubes). Butter is a cupboard staple; `chopped tomatoes` and `fresh coriander` are groceries. Every meal ingredient must be in that set or the meal is dropped. Reviewed dinners store `recipe` (`steps` + `tip`) on `public.meals`; the client shows that method instead of calling `ai("recipe")`. `completeIng()` only adds salt/pepper (and dish spices on stale lists that omit salt). Re-run `supabase/catalog_review_2026_09_08.sql` to restore the reviewed catalog. Tag taxonomy: [TAGS.md](TAGS.md). Unverified queue: [NEWCOMING-MEALS.md](NEWCOMING-MEALS.md). Founder catalog UI is the **Meals** tab.
