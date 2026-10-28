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
- ~~Half-pack basket~~ — shared extra pack, from PR #7, shipped 8 Oct in PR #8. Pack count does not depend on meal order. PR #7 was closed unmerged.
- ~~Per-shop pack sizes~~ — `ingredient_prices` pack quantity and unit, with a fallback to code `PACKS` (8 Oct, PR #8).
- ~~Admin Meals and Ingredients~~ — live 8 Oct (PR #8). `admin_roles.sql` applied. Meals are unpublish-only. `public.admins` is one row (Noé).
- ~~Garam masala, one jar~~ — unscaled seasoning, one jar per week at any servings. PR #10 squash-merged 13 Oct 2026 as `711f059d9087e65406d3004c7d29aa1d3efd0e9c`. That merge auto-deployed static (`dpl_FjLuhYS8QSV28DcxmqnPzdGWjdWL`); `pay` v33. See [RUNBOOK.md](RUNBOOK.md) before the next shared basket change.
- ~~Per-meal price split~~ — day cards share the week basket. PR #15 squash-merged 15 Oct 2026 as `e35b087b6a7f64e6cb50e0cc8dfde10ade247ca9`. Static REST ship `dpl_ByazVmgr1eDffUFhqEwwWRDdTVea`, promoted 15:52 BST. The merge also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. The headline price is based on the meal basket, not a basket the user has edited.
- ~~Meals read~~ — `supabase/meals_read_published.sql` applied to prod 25 Oct 2026 at 12:59 GMT. Anon and authenticated see 52 published meals and 0 drafts. Static the same day: `dpl_E3gKjdssEyFx6NXbaNsLQo5Zvrbp` (PR #29, `7d1d53ac`), promoted 13:14:43 GMT. Each of the 25 Oct merges also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. `pay` v52 is the #29 deploy at 13:10:17 GMT on 25 Oct 2026. `pay` was v33 after PR #10 on 13 Oct.

## Now

1. **Capture split, not live.** Paste `supabase/orders_capture_split.sql` (PENDING) in the SQL editor, then hand-deploy `pay` and `notify-order` in the same GO. SQL first: `pay` writes the new columns. `notify-order` behaviour is unchanged; it imports `_shared/telegram.ts`. See [RUNBOOK.md](RUNBOOK.md#capture-split-pending). Do not apply it from GitHub and do not create `supabase/migrations/`.
2. **Pilot** — do not rewrite `index.html`. Invite when you are happy with a live hold + capture on this build. A merge to `main` auto-deployed static from 13 Oct 2026 until PR #12 (`4699353a`, 15 Oct) set `git.deploymentEnabled.main` false. A production static ship follows [RUNBOOK.md](RUNBOOK.md): REST create of the merge SHA with `autoAssignCustomDomains: false` (founder CLI: `--skip-domain`), then promote. Deploy to production is OFF. Functions deploy only by hand with `supabase functions deploy <name>` or MCP, under a GO. If that setting is re-enabled, every merge redeploys all functions. Do not deploy a function that did not change. A docs-only merge does not promote static, does not apply loose SQL, and does not deploy edge functions. Never create `supabase/migrations/`. The 15 Oct PR #15 ship is that static REST path. The current static is the 26 Oct 2026 ship (`dpl_4DarVmBySV9ujJq3Lrdn7MJgDx93`).
3. **Agent lock:** [REQUIREMENTS.md](REQUIREMENTS.md), [INVARIANTS.md](INVARIANTS.md), [FLOWS.md](FLOWS.md). Product changes: branch → PR → CI (see [ENGINEERING.md](ENGINEERING.md)). **You click once:** GitHub ruleset on `main` — require a pull request with **0** approvals, require status check **test** only. Do not require Supabase Preview, Vercel, or a second person.
4. After the advisor (or you) add a dinner: **Meals → New meal** → run its record through [`meal-ingredient verification/`](meal-ingredient%20verification/README.md) → **Verify & publish**. Unpublish sends a live dinner back to New meal. Do not delete the row.
5. **Recipe source-check** — work the 75 pending records in `meal-ingredient verification/STATUS.md`, 5 per session, most-ordered dishes first; apply each DB patch via the Meals tab. Decide `tomato purée` as a 36th key once 3 records want it.
6. ~~**Servings (LIVE 6 Oct 2026)**~~ — PR #3 merged, SQL applied, `pay` v29 and that static deploy. Basket lines are whole packs from `meals.portions`. ~~**Half-pack basket (LIVE 8 Oct 2026)**~~ — shared extra pack, from PR #7, shipped in PR #8. PR #7 was closed unmerged.
7. ~~**Meals read (applied 25 Oct 2026 12:59 GMT).**~~ `supabase/meals_read_published.sql` is applied on prod. It is still not a migration and must not be moved into `supabase/migrations/`. Anon and authenticated see 52 published meals and 0 drafts. Anon `select=*` and `select=created_by` are permission denied. The admin-with-MFA draft check is untested. See [TESTING.md](TESTING.md).
8. ~~**Meals column follow-ups (applied 26 Oct 2026 ~15:42 GMT).**~~ `supabase/meals_followups.sql` is applied on prod. It is still not a migration and must not be moved into `supabase/migrations/`. Grants were as reviewed. Anon and authenticated each see 52 published meals and 0 drafts. The aal2 admin path is untested. Open: anon and authenticated still hold `MAINTAIN` on `public.meals`. `supabase/fix_meal_photos.sql` was applied the same afternoon (8 rows); 52 of 52 photos return 200. Deploy to production is OFF. Functions deploy only by hand with `supabase functions deploy <name>` or MCP, under a GO. If that setting is re-enabled, every merge redeploys all functions. Never create `supabase/migrations/`.

## Next product

- ~~**Per-shop packs (LIVE 8 Oct 2026)**~~ — `pack_qty` / `pack_unit` from `ingredient_prices` when the unit matches or converts g/kg or ml/l; otherwise the code `PACKS` entry. The shop comparison and a shop change use that store's packs. The confirm hold matches `pay`.
- **Catalog keys in `pay`.** `pay` still rejects a `meal_key` that is not in the 46-key code catalog. Admin-added keys stay flagged not usable in baskets until that changes.

## Next product (older)

- ~~Diet / tag onboarding~~ — step 2 + Profile (16 Sep static).
- ~~Ops capture + door address~~ — two-tap charge, money-received state, in-app delivery (16 Sep).
- Photo pantry scan — `parse_pantry` was **retired** from `ai` on 17 Sep (S-11); re-add it behind a signed-in check when the UI needs it.
- CAPTCHA (Turnstile/hCaptcha) on signup only if throwaway-account abuse shows up in `rate_limits`.
- Expand cupboard beyond oils/spices when the catalog grows (e.g. flour, sugar).
- Pepesto key if we want live supermarket quotes (still concierge-fulfil unless we switch to self-checkout bags).
- One-time photo backfill for old AI meals that still share ingredient stock shots.
- Apply `supabase/fix_meal_photos.sql` by hand so the live dinners stop requesting 404 Unsplash photos. The file covers the seed names and the extra production rows that still store those URLs (Baked tomato & basil risotto, Creamy Spinach & Feta Baked Potatoes).
- Expand ingredient catalog beyond 35 keys when pantry math still holds.
- Postcode → store set / honesty that fees are typical.
- Enable leaked-password protection in Auth (**Pro** plan; org is Free today).

## Later

- Subscription only if 5% + concierge does not retain.
- Split baskets, smart replenishment, native apps: out of scope until repeat orders exist.

## Success bar (pilot)

A real user: signup → week → Modify a dinner → pay hold → Telegram → Ops ordered → capture exact store total + 5% → customer sees Delivered.
