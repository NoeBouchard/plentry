# Runbook

## Local UI

No build. From `plentry/`, `python3 -m http.server 8766` or open `index.html`. Edge functions are the **deployed** ones unless you `supabase functions serve`.

## Tests

```bash
cd plentry && npm test
```

Must exit 0 before any production deploy below.

## Production static

```bash
cd plentry
npm test && vercel deploy --prod --yes --scope team_QHpJBQejbrxZ2PhEZQlmbuhj
```

Bare `vercel deploy --prod --yes` can return **Not authorized**; the team scope is required. Not git-connected. Push to GitHub does not update plentry.vercel.app.

**Logged out?** Vercel CLI 59 keeps its session in `~/Library/Application Support/com.vercel.cli/auth.json`; when it is missing, `vercel whoami` prints *Logged out* and the scoped deploy fails with *You do not have access to the specified account*. Fix: `vercel login` (device flow — opens vercel.com, approve, back to the terminal), confirm `vercel whoami` → `noebouchard`, re-run the deploy. Never run `vercel teams list` / `vercel login` from an unattended agent: it blocks on the browser step.

Only `index.html`, `sw.js`, `manifest.json`, `icons/`, `vendor/`, `vercel.json` are uploaded (`.vercelignore` allow-list, S-17). `vercel.json` carries the CSP and security headers (S-08). If you add a new remote origin to `index.html` (fetch, image host, font), add it to the CSP first or the browser blocks it silently — the contracts test checks `connect-src` against every `fetch(` host.

**Post-deploy checks (static):**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://plentry.vercel.app/doc/SECURITY.md            # 404
curl -s -o /dev/null -w '%{http_code}\n' https://plentry.vercel.app/supabase/functions/pay/index.ts   # 404
curl -sI https://plentry.vercel.app/ | grep -i -E 'content-security-policy|x-frame-options'  # both present
curl -s -o /dev/null -w '%{http_code}\n' https://plentry.vercel.app/vendor/supabase-js-2.116.0.js  # 200
```

Then open the app, DevTools console: no `Refused to …` CSP lines while loading a week and opening a meal.

Workspace: `/Users/noebouchard/work/EVERYTHING/Claude/Projects/Kitchen planner` (then `cd plentry`).

## Functions

```bash
cd plentry
npm test && supabase functions deploy ai checkout pay stripe-webhook notify-order newcoming
```

CLI needs `supabase-go` on PATH if the shim complains. `_shared/ratelimit.ts` and `_shared/orders.ts` are bundled into every function that imports them — redeploy **all** importers when a shared file changes (`ai`, `checkout`, `pay`, `stripe-webhook`, `notify-order`).

**17 Sep 2026 security batch:** functions shipped 17 Sep 16:20 BST (`ai` v21, `checkout` v14, `pay` v17, `stripe-webhook` v14, `notify-order` v16); static shipped 18 Sep 13:04 BST (`plentry-p1413liv3`), all static checks above green. Still to do once: one Stripe **test** hold end-to-end on the new build: checkout → 4242 → Orders shows the hold → Telegram (server-built list, store search links) → Ops capture.

**Post-deploy checks (functions), no side effects:**

```bash
B=https://ucciqthwxnlkjalwlhvh.supabase.co/functions/v1
for f in ai checkout pay stripe-webhook notify-order; do curl -s -o /dev/null -w "$f %{http_code}\n" -X OPTIONS -H 'Origin: https://plentry.vercel.app' -H 'Access-Control-Request-Method: POST' $B/$f; done   # 204 ×5
curl -s -X POST -H 'Content-Type: application/json' -H "apikey: $PUBLISHABLE" -d '{"task":"parse_pantry"}' $B/ai      # {"error":"retired task"} 400
curl -s -o /dev/null -w '%{http_code}\n' -X POST -d '{}' $B/pay              # 401 (platform JWT gate)
curl -s -o /dev/null -w '%{http_code}\n' -X POST -d '{}' $B/stripe-webhook   # 401 bad signature
curl -s -o /dev/null -w '%{http_code}\n' -X POST -d '{}' $B/notify-order     # 401 unauthorized
```

Then `supabase functions list --project-ref ucciqthwxnlkjalwlhvh` (versions bumped, ACTIVE, `verify_jwt` only true for `pay`) and the dashboard logs: only `booted (time: …ms)` lines, no `Uncaught`.

## Live schema check (after any project reset or before trusting the rate limits)

```sql
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and proname in ('check_rate_limit','validate_order','order_webhook_secret');   -- 3 rows
select tgname from pg_trigger where tgname = 'validate_order';                                             -- 1 row
select column_name from information_schema.columns where table_name = 'orders' and column_name = 'checkout_session';
select column_name from information_schema.columns where table_name = 'orders' and column_name = 'delivery_slot'; -- 1 row
select column_name from information_schema.columns where table_name = 'orders' and column_name in ('slot_date','slot_start','slot_end','issue_status'); -- 4 rows
select tgname from pg_trigger where tgname in ('validate_order','orders_clear_slot_on_insert');                   -- 2 rows
select tgname from pg_trigger where tgname in ('order_messages_open_issue','notify_issue_webhook');               -- 2 rows
select name from vault.secrets;                                                                            -- order_webhook_secret
select grantee, routine_name from information_schema.routine_privileges
 where specific_schema = 'public' and grantee in ('anon','authenticated','PUBLIC');                        -- 0 rows
```

If anything is missing, re-run in order: `security_hardening.sql`, `security_hardening_v2.sql`, `security_hardening_v3.sql`, `webhook_secret_vault.sql`, `orders_slot_issue.sql` (all SAFE TO RE-RUN). Before 17 Sep 2026 the first two had never been applied — every rate limit failed open.

## Supermarket checkout — per order (pilot)

No special Waitrose/Tesco concierge account. For **each** Plentry order, start a **new** supermarket checkout and paste **that row** (Ops Copy list / Telegram):

1. **PHONE** first — the driver's callback. Never your number.
2. Name, line 1/2, city, postcode from **Deliver to**.
3. Book **MUST book:** `{weekday} {date} {start}–{end}` only. If that window is not offered, stop and **Message customer** in Inbox.
4. Two orders in flight = two checkouts. Do not edit address A while order B is already booked.

Leave your account billing/login as-is. A saved second address is enough; guest checkout is optional.

## Founder 2-step verification (S-06) — switch-on order

**Done 18 Sep 2026** (factor verified, `admin_mfa_aal2_policies` migration, `REQUIRE_ADMIN_MFA=1`). Kept for a fresh project or after a roll-back:

1. Deploy static + `pay` (above).
2. Log in as the founder → **Profile → Security → Turn on 2-step verification**. Scan the QR (Google Authenticator / 1Password / Authy), enter the first code.
3. Sign out, sign in, enter the code when asked — Ops and Meals come back.
4. SQL Editor: run `supabase/admin_mfa.sql` (founder RLS now needs `aal2`).
5. `cd plentry && supabase secrets set REQUIRE_ADMIN_MFA=1` (capture needs `aal2`).

Lost device: Supabase Dashboard → Authentication → Users → founder → remove the TOTP factor, then re-enrol. Roll back the server side with `admin_policies.sql` + `supabase secrets unset REQUIRE_ADMIN_MFA`. Quick live check that the gate holds (read-only, run in the SQL Editor as postgres): `create temp table f as select id from auth.users where email='noyouchka.bouchard@gmail.com'; grant select on f to authenticated; select set_config('request.jwt.claims', json_build_object('sub',(select id from f),'email','noyouchka.bouchard@gmail.com','role','authenticated','aal','aal1')::text, true); set local role authenticated; select public.is_founder_aal2(), count(*) from public.orders;` → `false`, own orders only; with `'aal2'` → `true`, every order.

## Live money test (live Stripe — test cards do not work)

Do this once after any change to `pay`, `stripe-webhook`, `notify-order` or the checkout UI. The founder is the customer, with their own real card.

1. Log in as a **customer account** (or the founder account — either works; the founder gets the code prompt), pick a small week, **Order this week** → Confirm → Stripe Checkout with the real card. Hold ≈ (basket + 5%) × 1.30.
2. Expect: redirect back to **Orders** with *hold placed*; the DB row has `payment_status=authorized`, `checkout_session=cs_…`, `amount_held`, server-built `items.basket` (`product`, `shelf_price`, whitelisted `search`); Telegram message with the list + store search links; `stripe-webhook` log shows 200.
3. **Ops** (founder, after the 6-digit code): the order shows *Deliver to*; type store £ **1.00** → *Charge £1.05* → *Confirm £1.05* → *Money received — £1.05 is in Stripe*. Stripe releases the rest of the hold automatically (partial capture). This is the **money test** in FLOWS — do **not** shop for it; leave status New or tap Delivered to tidy.
4. Stripe Dashboard → Payments → that £1.05 → **Refund**. Stripe keeps its fee (≈ 1.5% + 20p ≈ £0.22); the customer gets £1.05 back in a few days.
5. Zero-cost variant: stop after step 2 and in Stripe Dashboard → Payments → the *Uncaptured* payment → **Cancel**. Note the app row stays `authorized` (the webhook handles `checkout.session.expired`, not `payment_intent.canceled`); set `payment_status='canceled'` by hand in the SQL Editor.

Test mode (4242 cards) is possible but means swapping `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` to test keys, adding a **test-mode** webhook endpoint in Stripe for `checkout.session.completed` / `checkout.session.expired`, and swapping back afterwards — production takes fake payments meanwhile. Not worth it for a single check.

## Auth settings (dashboard)

Auth → Providers → Email → **Minimum password length: 8** (client already enforces 8, S-14). Leaked-password protection stays off (Pro-only).

## Vendored supabase-js (S-07)

`index.html` loads `/vendor/supabase-js-<version>.js`, copied from the npm package (not jsDelivr). To update:

```bash
cd /tmp && npm pack @supabase/supabase-js@<version> && tar -xzf supabase-supabase-js-<version>.tgz
cp package/dist/umd/supabase.js "<workspace>/plentry/vendor/supabase-js-<version>.js"
shasum -a 384 "<workspace>/plentry/vendor/supabase-js-<version>.js"
```

Then change the `<script src>` in `index.html`, delete the old file, and update the version + sha384 in `test/contracts.test.mjs` (I-A04) **in the same change**. `npm test` fails until all three agree.

## Rotating the DB webhook secret (S-13)

```sql
select vault.update_secret((select id from vault.secrets where name = 'order_webhook_secret'), '<new value>');
```

then `supabase secrets set ORDER_WEBHOOK_SECRET=<new value>`. No function redeploy or SQL redefinition needed; both trigger functions read the Vault at call time.

## Auth dashboard

Site URL: `https://plentry.vercel.app`  
Redirects: `https://plentry.vercel.app/**`

## Stripe

Test first. Webhook (same URL in **test** and **live**; each mode has its own `whsec_`):

`https://ucciqthwxnlkjalwlhvh.supabase.co/functions/v1/stripe-webhook`

Events: `checkout.session.completed`, `checkout.session.expired`.

Then `STRIPE_WEBHOOK_SECRET`. After 4242 works (done 13 Sep, order #31 captured):

1. Capture any open **test** authorized orders in Ops (store £ + 5%). Test PaymentIntents cannot be captured with `sk_live_`.
2. Stripe Dashboard → **Live** mode → [API keys](https://dashboard.stripe.com/apikeys) → secret `sk_live_…`.
3. **New** live webhook (do not reuse the test signing secret) with the URL and events above.
4. Set both on the project (never in git / `doc/` / `index.html`):

```bash
cd plentry
supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_...
```

Secrets apply on the next function invoke; redeploy `pay` / `stripe-webhook` only if the code changed. Keep the test-mode webhook if you still want 4242 in the Stripe sandbox.

**Float:** capture is money in Stripe, not Tesco. First live payout is 7–14 days. Shop from a dedicated Wise (or other) debit balance. Instant Payouts do not skip the first wait. See [REQUIREMENTS.md](REQUIREMENTS.md).

## Telegram

`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ORDER_WEBHOOK_SECRET` must match the DB-side value in `vault.secrets.order_webhook_secret` (the trigger functions read it from Vault since 17 Sep 2026; see “Rotating the DB webhook secret”). Messages are capped at 4000 chars and every store link is rebuilt server-side.

## Meals catalog

After changing the catalog, apply `catalog_review_2026_09_08.sql` (or an equivalent name-keyed update) so `ing`, `time`, and `recipe` match the review file. `meals_full_ingredients.sql` only adds missing salt/pepper — it does not invent dish spices. Deploy **static + `ai`** together when catalog keys change, or meals using new keys disappear from the client.

Meal **tags** and the unverified queue: apply `meals_tags.sql` (SAFE TO RE-RUN). It backfills empty tags, marks pre-2026-09-09 rows reviewed, and enables the fortnight cron. Founder add/verify/delete: `admin_meals_write.sql`. Closed tag list: [TAGS.md](TAGS.md). Queue: [NEWCOMING-MEALS.md](NEWCOMING-MEALS.md). Deploy `ai` and `newcoming` with the static app.

Log in as `noyouchka.bouchard@gmail.com`. Ops status bar is reversible. Capture box = **exact supermarket charge**; 5% is added in `pay`. Catalog: **Meals** tab → New meal → Verify & publish (or `update meals set reviewed_at = now() where id = …`).
