# Runbook

## Local UI

No build. From `plentry/`, `python3 -m http.server 8766` or open `index.html`. Edge functions are the **deployed** ones unless you `supabase functions serve`.

## Tests

```bash
cd plentry && npm test
```

## Production static

```bash
cd plentry
vercel deploy --prod --yes --scope team_QHpJBQejbrxZ2PhEZQlmbuhj
```

Bare `vercel deploy --prod --yes` can return **Not authorized**; the team scope is required. Not git-connected. Push to GitHub does not update plentry.vercel.app.

Workspace: `/Users/noebouchard/work/EVERYTHING/Claude/Projects/Kitchen planner` (then `cd plentry`).

## Functions

```bash
cd plentry
supabase login
supabase link --project-ref ucciqthwxnlkjalwlhvh
supabase functions deploy ai checkout pay stripe-webhook notify-order newcoming
```

CLI needs `supabase-go` on PATH if the shim complains.

## Auth dashboard

Site URL: `https://plentry.vercel.app`  
Redirects: `https://plentry.vercel.app/**`

## Stripe

Test first. Webhook:

`https://ucciqthwxnlkjalwlhvh.supabase.co/functions/v1/stripe-webhook`

Events: `checkout.session.completed`, `checkout.session.expired`.

Then `STRIPE_WEBHOOK_SECRET`. After 4242 works: live key + **new** live webhook + live `whsec_`.

## Telegram

`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ORDER_WEBHOOK_SECRET` must match the DB trigger header.

## Meals catalog

After changing the catalog, apply `catalog_review_2026_09_08.sql` (or an equivalent name-keyed update) so `ing`, `time`, and `recipe` match the review file. `meals_full_ingredients.sql` only adds missing salt/pepper — it does not invent dish spices. Deploy **static + `ai`** together when catalog keys change, or meals using new keys disappear from the client.

Meal **tags** and the newcoming queue: apply `meals_tags.sql` (SAFE TO RE-RUN). It backfills empty tags, marks pre-2026-09-09 rows reviewed, enables the fortnight cron, and the Ops review policy. Closed tag list: [TAGS.md](TAGS.md). Queue: [NEWCOMING-MEALS.md](NEWCOMING-MEALS.md). Deploy `ai` and `newcoming` with the static app.

Log in as `noyouchka.bouchard@gmail.com`. Status bar is reversible. Capture box = **exact supermarket charge**; 5% is added in `pay`. Newcoming: mark reviewed in Ops or `update meals set reviewed_at = now() where id = …`.
