# Roadmap

Ordered. Do not skip the deploy/audit slice to build Phase 3 toys.

## Done (this week)

- ~~Catalog review~~ — 77 dinners: `ing`, `time`, `recipe`; three extra keys; butter staple (8 Sep).
- ~~Meal tags + newcoming~~ — closed tag set on Postgres; advisor writes tags; Ops queue; fortnight Telegram (9 Sep). Live: 33 meat / 11 fish / 28 vegetarian / 5 vegan; queue empty.
- ~~Static + `ai` + `newcoming`~~ — https://plentry.vercel.app (9 Sep). `npm test` 37 passing.

## Now (founder / verify)

1. **You:** File → Open Folder on `/Users/noebouchard/work/EVERYTHING/Claude/Projects/Kitchen planner` and start new agent chats there (old Documents path is gone).
2. **You:** confirm Auth Site URL + redirect `https://plentry.vercel.app/**` in the [Supabase Auth URL config](https://supabase.com/dashboard/project/ucciqthwxnlkjalwlhvh/auth/url-configuration).
3. **You:** Stripe **test** hold with `4242…`, Telegram ping, Ops toggle, capture store £ + 5%.
4. **You:** after the advisor adds a dinner, open **Ops → Newcoming meals**, check tags/`ing`/method, then Mark reviewed (or delete). First Telegram reminder: 15 Sep 2026 09:00 UTC (then 1 Oct, …).
5. Optional: commit the uncommitted `plentry/` tags work to GitHub (`git push` still does **not** ship Vercel).
6. **Security audit** (separate agent): start at [SECURITY.md](SECURITY.md). Closed here: leftover `orders` fn gone; notify RPC revoked; free-beta Telegram triggers dropped; tags CHECK + newcoming secret-gated.
7. Then Stripe **live** keys + live webhook; invite people.

## Next product

- **Diet / goal onboarding** that maps to tags (`vegetarian`/`vegan`/`meat`/`fish`, `gym`, `high_protein`) so the week is not only weighted by decide/shop/waste/budget.
- Photo pantry scan (reuse `parse_pantry` on the `ai` function; not in the UI today).
- Expand cupboard beyond oils/spices when the catalog grows (e.g. flour, sugar).
- Pepesto key if we want live supermarket quotes (still concierge-fulfil unless we switch to self-checkout bags).
- One-time photo backfill for old AI meals that still share ingredient stock shots.
- Expand ingredient catalog beyond 35 keys when pantry math still holds.
- Postcode → store set / honesty that fees are typical.
- Enable leaked-password protection in Auth.

## Later

- Subscription only if 5% + concierge does not retain.
- Split baskets, smart replenishment, native apps: out of scope until repeat orders exist.

## Success bar (pilot)

A real user: signup → week → Modify a dinner → pay hold → Telegram → Ops ordered → capture exact store total + 5% → customer sees Delivered.
