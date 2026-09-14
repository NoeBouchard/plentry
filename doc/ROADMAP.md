# Roadmap

Ordered. Do not skip the deploy/audit slice to build Phase 3 toys.

## Done (this week)

- ~~Catalog review~~ — 77 dinners: `ing`, `time`, `recipe`; three extra keys; butter staple (8 Sep).
- ~~Meal tags + newcoming~~ — closed tag set on Postgres; advisor writes tags; Ops queue; fortnight Telegram (9 Sep). Live: 33 meat / 11 fish / 28 vegetarian / 5 vegan; queue empty.
- ~~Static + `ai` + `newcoming`~~ — https://plentry.vercel.app (9 Sep). `npm test` 37 passing.
- ~~Workspace + git~~ — this folder; tags already on `origin/main` (`git push` still does **not** ship Vercel).
- ~~Auth URLs~~ — Site URL + `https://plentry.vercel.app/**` (founder, 13 Sep).
- ~~Meals tab~~ — founder catalog add/verify/remove on https://plentry.vercel.app (14 Sep). Postgres write policies live. `npm test` 42 passing.
- ~~Stripe **test** hold + capture~~ — order **#31** Tesco, grocery est. £26.10, hold £31.52, store £25.00 captured as **£26.25** (5% fee £1.25), status **ordered**. Webhook 200. Safe to rotate to live keys.
- ~~Security pass 13 Sep~~ — see [SECURITY.md](SECURITY.md). JWT `email` is GoTrue/`auth.users`, not `user_metadata`. Leftover `orders` fn gone. `pg_net` in `public` accepted. Leaked-password is **Pro-only** (org is Free).

## Now

1. **You — Stripe live:** Dashboard **Live** mode (finish [account activation](https://dashboard.stripe.com) if still on KYC) → [API keys](https://dashboard.stripe.com/apikeys) (`sk_live_…`) + **new** webhook (test and live secrets are different):
   - URL: `https://ucciqthwxnlkjalwlhvh.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed`, `checkout.session.expired`
   - Then `supabase secrets set STRIPE_SECRET_KEY=sk_live_… STRIPE_WEBHOOK_SECRET=whsec_…` (do not put these in git or `doc/`). Redeploy is not required; secrets apply to the next invoke. Keep the test webhook for 4242 later if you want a sandbox.
2. Invite people only after a **live** card hold (not 4242) round-trips to `authorized`.
3. After the advisor (or you) add a dinner: **Meals → New meal** → check ingredients/method/tags → **Verify & publish** (or Remove). First cron ping if anything is still unverified: **15 Sep 2026 09:00 UTC**.

## Next product

- **Diet / goal onboarding** as its own step (maps to tags). Profile **What we eat** already defaults to omnivore and steers New week / Modify.
- Photo pantry scan (reuse `parse_pantry` on the `ai` function; not in the UI today).
- Expand cupboard beyond oils/spices when the catalog grows (e.g. flour, sugar).
- Pepesto key if we want live supermarket quotes (still concierge-fulfil unless we switch to self-checkout bags).
- One-time photo backfill for old AI meals that still share ingredient stock shots.
- Expand ingredient catalog beyond 35 keys when pantry math still holds.
- Postcode → store set / honesty that fees are typical.
- Enable leaked-password protection in Auth (**Pro** plan; org is Free today).

## Later

- Subscription only if 5% + concierge does not retain.
- Split baskets, smart replenishment, native apps: out of scope until repeat orders exist.

## Success bar (pilot)

A real user: signup → week → Modify a dinner → pay hold → Telegram → Ops ordered → capture exact store total + 5% → customer sees Delivered.
