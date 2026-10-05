# Invariants

Rules that **must keep passing**. If an implementation changes behaviour, update the test **in the same change** and record why here. Never delete an assertion to go green.

IDs are stable. Tests should mention the ID in the title or a comment (`// I-M01`).

Coverage: **covered** = `npm test` already guards it. **ops** = founder/manual (Stripe Dashboard), not `npm test`.

## Money

| ID | Rule | Coverage |
|---|---|---|
| I-M01 | Commission is **0.05** in `index.html` `COMMISSION` and `pay/index.ts` `COMMISSION`. Change both. | covered — `contracts` + boot |
| I-M02 | `customerTotal(shop) = shop + 5%` (gbp-rounded). `holdAmount = customerTotal × 1.30` (was 1.15; raised 19 Sep because Waitrose tills were ~15% above shelf estimates). | covered — money suite |
| I-M03 | Capture pence = `Math.round(storePence * (1 + COMMISSION))`. Client `captureChargePence` matches `pay`. £1.00 store → **105** pence. | covered — rounding + capture preview |
| I-M04 | Capture **never** exceeds `round(amount_held * 100)` pence. If till + 5% is above the hold, `pay` captures the hold (customer pays the cap; Plentry covers the rest from the float). UI warns and two-tap confirms the hold amount. | covered — Ops over-hold + `pay` source |
| I-M05 | Stripe hold must **not** use client-written `orders.total`. `pay` recomputes via `serverTotal` / `ingredient_prices`. | covered — contracts |
| I-M06 | Grocery estimate cap **£500** (`MAX_ORDER_GBP` + DB trigger). | covered — contracts |
| I-M07 | `pay` task `capture` only if JWT email is `noyouchka.bouchard@gmail.com`. | covered — contracts |
| I-M08 | Failed `pay` HTTP responses are parsed JSON (`error` / `detail`), not swallowed as `null`. | covered — `payApi` jsdom + source |
| I-M09 | Do not capture more than the authorised PaymentIntent (Stripe). Manual capture. | covered — `capture_method` manual in `pay` |

## Orders and Ops

| ID | Rule | Coverage |
|---|---|---|
| I-O01 | `orders` table is source of truth. `hydrateOrdersFromDb` overwrites local cache after login, Orders, Profile, Stripe return. | covered |
| I-O02 | Status whitelist **new \| ordered \| delivered**, reversible. Unpaid/canceled: status bar **disabled**, do not shop. | covered — status bar + unpaid hides capture |
| I-O03 | Telegram / `notify-order` only when `payment_status` becomes **authorized**. Unpaid must not look placeable. | covered — trigger + notify copy |
| I-O04 | Ops authorized: type store £ → preview **store + 5%** → **Charge £X** → **Confirm £X** (two taps). First tap must not call Stripe. | covered — two-tap test |
| I-O05 | Ops captured: **Money received** + Open {store}. Customer copy **Charged £X**. | covered — Ops HTML + `payLabel` |
| I-O06 | Door address is `orders.address.delivery` (and `prefs.delivery`). Not Stripe card billing. Ops **Deliver to** prefers delivery over `address.shipping`. | covered — Ops #33 fixture |
| I-O07 | `stripe-webhook` must **keep** `prev.delivery` when `delivery.line1` exists. Must not overwrite with Stripe shipping. | covered — webhook source |
| I-O08 | `placeOrder` inserts `address: { delivery, name, phone }` and a UK postcode. Phone is a required UK number (`isUkPhone`). `pay` checkout sets PI shipping from delivery; Stripe `shipping_address_collection` only if delivery is missing. | covered — insert + `pay` source |
| I-O09 | Confirm: no saved address **or saved address missing a UK phone** → door form (phone labelled for the driver). Saved with phone → **Deliver to this address?** (name, address, phone) + **Use a different address**. Replace → form + **Use the saved address**. | covered — first-time + reuse + no-phone |
| I-O10 | Profile delivery fields persist through `prefs.delivery` / `save()`. Saving any delivery field also requires a UK phone. | covered — Profile save |
| I-O11 | `orders` INSERT **forces** `payment_status='unpaid'`, `payment_intent=null`, `checkout_session=null`, `amount_held=null`, `amount_captured=null`, `status='new'` (`validate_order`, v3). `pay` capture refuses when no hold is recorded (`no hold recorded on order`). UPDATE re-validates total/postcode/store/items only when they change. | covered — contracts (SQL + `pay` source); live-probed 17 Sep |
| I-O12 | `pay` checkout rebuilds `items.basket` from the catalog + `ingredient_prices` (`rebuildBasket`) and writes it back before creating the hold; unknown keys are a 400, never £2.50. Telegram links come from the 4-store whitelist (`searchUrl`), never from the row. Meal names bounded and markup-free. | covered — `orders.ts` unit tests + contracts |
| I-O13 | `stripe-webhook`: DB read/update errors return **5xx** (Stripe retries); `completed` only authorises rows in `unpaid \| none \| canceled`; postcode written only when UK-shaped, else the row keeps its own. | covered — contracts + `ukPostcode` unit tests |
| I-O14 | One open Checkout Session per order: `pay` expires `orders.checkout_session` before creating a new one; `expired` cancels only the current session (or legacy null); `completed` records the real session id and hold. | covered — contracts |
| I-O15 | Cooking instructions for every ordered dinner are **snapshotted** onto `orders.items.recipes` at insert (`orderRecipesPayload`) and again at checkout (`pay` reads the catalog, then any client copy, through `cleanRecipes`). Orders tab shows a button per meal. Opening it uses the snapshot first; catalog-by-name is fallback; missing dinners say so — never a live `ai("recipe")` for an old order. Markup stripped; unknown ingredient keys dropped. | covered — jsdom + `cleanRecipes` unit + `pay` source |
| I-O16 | Customer picks a hard 2-hour window at checkout: `slot_date` ≥ order date + 3 (Europe/London), start in `{08,10,12,14,16,18,20}:00`, `slot_end = start + 2h`. After the hold, Orders says **We'll deliver {window}**. Ops shops **only if that exact supermarket slot exists**; **Confirm this window** writes `delivery_slot` (snapshot, INSERT still forced null) and marks **Ordered**. If the shop cannot do it, Ops messages the customer first. Legacy rows without slot columns still show **Expected by created_at + 4 days** until Ops types a slot. Timeline: hollow white until done, green when done. **Paid** = authorized/captured; **Ordered** = `status=ordered`; **Delivered** = `status=delivered` **or** `slot_end` in the past. Pantry restock only on `status=delivered`. Store marketing ETAs are not the order ETA. `pay` / webhook never write the slot. | covered — jsdom customer + Ops + SQL contracts |
| I-O18 | Paid orders show **Issue** (open issue: **View issue**). Unpaid hides it. `order_messages` body ≤1000, no `<>`, `esc()` at render. Customer insert/select only own order; founder `aal2` select/insert all (`author_role` must match). Customer insert opens `issue_status` via trigger (customers cannot UPDATE `orders`). Ops **Inbox** is `isAdmin()` gated. Composer strips markup. | covered — jsdom + SQL contracts |

## Week, catalog, cupboard

| ID | Rule | Coverage |
|---|---|---|
| I-W01 | Week length is exactly `prefs.meals` (1–7). Modify and advisor cannot grow it. | covered |
| I-W02 | New week / Modify pick **verified** meals only when a live pool exists. Not `ai("meal_options")`. | covered |
| I-W03 | Default diet **omnivore**: meat/fish first, at most one vegetarian/vegan dinner. | covered |
| I-W04 | `validMeal`: every `ing` key is in `INGREDIENTS`. Unknown keys drop the meal. | covered |
| I-W05 | Closed tag set; AI new rows `reviewed_at` null until Meals **Verify**. | covered |
| I-C01 | Ticked cupboard staples are skipped on the shop. Groceries stay. Spice skip warning on basket / confirm. | covered |
| I-C02 | Empty/stale `basketEdit` does not leave a £0 week; **Order this week** rebuilds from meals. | covered |
| I-C03 | Cooking method uses stored `meals.recipe`, not a live `ai("recipe")` for reviewed dinners. | covered |

## XSS and shape

| ID | Rule | Coverage |
|---|---|---|
| I-X01 | Untrusted strings through `esc`. URLs through `safeUrl` (http/https only). Meal onclick uses indexes, not names. | covered |
| I-X02 | Redirects are exact-origin: `checkout` bag `redirect_url` must have origin `https://getplentry.com` (`appRedirect`); the client assigns `location.href` only to a `https://checkout.stripe.com` URL (`stripeCheckoutUrl`). No other `location.href=` sites. | covered — jsdom + contracts |
| I-X03 | Cloud `profiles.state` is untrusted JSON: `prefs.budget` normalised in `loadCloudState`, `esc()` at render. | covered — jsdom |
| I-A01 | No React/Next/bundler. App is `index.html` + Edge Functions. | ops + playbook (do not add a test that loads Next) |
| I-A02 | No secrets in `index.html` or `doc/`. Publishable Supabase key only. | ops |
| I-A03 | `cd plentry && npm test` must exit 0 before any production deploy. GitHub Actions **test** must be green before merge. Merge is not production. | ops — playbook / Cursor rule / ENGINEERING.md |
| I-A04 | supabase-js is **vendored** (`/vendor/supabase-js-<ver>.js`, sha384 pinned in the contracts test). No third-party `<script src>` in `index.html`. Bumping the bundle means bumping the hash on purpose. | covered — contracts |
| I-A05 | `vercel.json` ships CSP + headers: `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, no remote `script-src` hosts, no `unsafe-eval`, `connect-src` covers every host `index.html` fetches, `X-Frame-Options DENY`, `nosniff`, HSTS, Referrer-Policy, Permissions-Policy. | covered — contracts (directive parse); browser smoke 17 Sep |
| I-A06 | Static deploy is an allow-list (`.vercelignore`: `/*` then `!/index.html !/sw.js !/manifest.json !/icons !/vendor !/vercel.json`). `supabase/`, `doc/`, `test/`, `SPEC.md`, `README.md` are never served. | covered — contracts; post-deploy curl in RUNBOOK |
| I-A07 | Password minimum **8** in `submitAuth` (`PASSWORD_MIN`); Supabase Auth setting mirrors it. | covered — jsdom; dashboard = ops |
| I-A08 | `ai`: `parse_pantry` / `meal_options` return 400 (prompts deleted); advisor catalog context is `reviewed_at is not null`; ≤ 20 **new** drafts per user per day (`check_rate_limit('ai_drafts')`, fail closed); only the advisor path writes `meals`. | covered — contracts |
| I-A09 | Upstream / internal error `detail` is returned only to signed-in callers (`ai`, `checkout`); full text stays in function logs. | covered — contracts |
| I-A10 | Founder MFA: while a verified TOTP factor exists and the session is not `aal2`, `isAdmin()` is false and a code is demanded; QR rendered only from an SVG `data:` URL; factor ids validated. `pay` capture requires `ctx.jwtClaims.aal === 'aal2'` when `REQUIRE_ADMIN_MFA=1` (`userClaims.aal` is not a real claim). A `mfa_required` capture opens the 6-digit modal (does not dead-end on an alert) and retries after verify. `admin_mfa.sql` gates all five founder policies on `is_founder_aal2()`. | covered — jsdom + contracts; SQL apply = ops (after enrol) |
| I-A11 | The DB-webhook header secret lives in `vault.secrets` (`order_webhook_secret`), read via definer-only `public.order_webhook_secret()`; no function body contains it; new `public` functions have no anon/authenticated EXECUTE by default. | covered — contracts; live-verified 17 Sep |
| I-S01 | Hardening SQL defines and the functions use: `public.rate_limits`, `check_rate_limit()` (service_role only), `validate_order` trigger `before insert or update on orders`. Must be **applied on live** — check with RUNBOOK “Live schema check” after any project reset. | covered — contracts (source); live = ops |

## How to add a test

1. Name it after the invariant (`I-M04 capture blocked when store+5% exceeds hold`).
2. Prefer jsdom user-visible behaviour (`loadApp` + `renderAdmin` / `confirmOrder`).
3. Money: assert **client helper and** `pay/index.ts` source (or both files’ pence formula).
4. No live Stripe, Anthropic, or Pepesto in `npm test`.
