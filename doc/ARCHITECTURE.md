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

Vercel is **not** git-connected. Production is `vercel deploy --prod --yes --scope team_QHpJBQejbrxZ2PhEZQlmbuhj` from `plentry/`. Workspace: `/Users/noebouchard/work/EVERYTHING/Claude/Projects/Kitchen planner`.

## Front end

- **File:** `plentry/index.html` — CSS, markup, all client JS in one `<script>`.
- **State `S`:** `{ user, prefs, pantry, menuOptions, selected, recipes, orders, onboarded }` in `localStorage` key `plentry_v1`, debounced to `profiles.state`.
- **Orders table is source of truth for order history/status.** `hydrateOrdersFromDb()` overwrites the local cache after login, on Orders/Profile, and after Stripe return (`?paid=1`).

## Data (Postgres)

| Table | Role |
|---|---|
| `profiles` | One row per user; `state` JSONB (≤256 KB) |
| `orders` | Concierge queue. `status` `new\|ordered\|delivered`. Payment columns from `orders_payment.sql` |
| `meals` | Shared catalog. `source` `seed\|ai\|advisor\|ops`. `tags` jsonb (closed set). `reviewed_at` null = **New meal**. Clients cannot INSERT; founder can INSERT/UPDATE/DELETE (JWT email); `ai` inserts drafts via service role |
| `ingredient_prices` | Shelf prices per store for quoting when Pepesto is off |
| `rate_limits` | Used by edge functions |

RLS: users see own profiles/orders; authenticated can read meals. Ops: JWT email `noyouchka.bouchard@gmail.com` can select/update all orders and write the meals catalog (`admin_policies.sql`).

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
