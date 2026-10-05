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
- ~~Security audit + fixes 17 Sep~~ — 17 findings; DB hardening live; functions/static shipped 17–19 Sep. `npm test` **103**.
- ~~Small-team loop~~ — GitHub Actions `npm test` on PR/`main`, PR checklist, [ENGINEERING.md](ENGINEERING.md) (21 Sep). Merge still is not Vercel.
- ~~Phone / slot / dots / Inbox~~ — SQL, static, and functions live (founder deploy 24 Sep). https://plentry.vercel.app asks for a UK phone and a 2-hour window.

- ~~Custom domain~~ — https://getplentry.com (5 Oct). `plentry.vercel.app` redirects there.

## Now

1. **Pilot** — do not rewrite `index.html`. Invite when you are happy with a live hold + capture on this build.
2. **Agent lock:** [REQUIREMENTS.md](REQUIREMENTS.md), [INVARIANTS.md](INVARIANTS.md), [FLOWS.md](FLOWS.md). Product changes: branch → PR → CI (see [ENGINEERING.md](ENGINEERING.md)). **You click once:** GitHub ruleset on `main` — require a pull request with **0** approvals, require status check **test** only. Do not require Supabase Preview, Vercel, or a second person.
3. After the advisor (or you) add a dinner: **Meals → New meal** → run its record through [`meal-ingredient verification/`](meal-ingredient%20verification/README.md) → **Verify & publish** (or Remove).
4. **Recipe source-check** — work the 75 pending records in `meal-ingredient verification/STATUS.md`, 5 per session, most-ordered dishes first; apply each DB patch via the Meals tab. Decide `tomato purée` as a 36th key once 3 records want it.

## Next product

- ~~Diet / tag onboarding~~ — step 2 + Profile (16 Sep static).
- ~~Ops capture + door address~~ — two-tap charge, money-received state, in-app delivery (16 Sep).
- Photo pantry scan — `parse_pantry` was **retired** from `ai` on 17 Sep (S-11); re-add it behind a signed-in check when the UI needs it.
- CAPTCHA (Turnstile/hCaptcha) on signup only if throwaway-account abuse shows up in `rate_limits`.
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
