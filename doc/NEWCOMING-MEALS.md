# Newcoming meals

Queue of catalog dinners that are **not founder-reviewed** (`meals.reviewed_at` is null). Weird advisor recipes must not sit here forever.

**Empty as of 9 Sep 2026** (77 reviewed). New advisor dishes appear here and in **Ops → Newcoming meals**. Next cron ping: **15 Sep 2026 09:00 UTC** (then 1st and 15th each month).

## How to clear the queue

1. Log in as `noyouchka.bouchard@gmail.com`.
2. Ops tab → **Newcoming meals**.
3. Check ingredients, tags, and (when present) the method. Delete the row in Table Editor if it should not be in the catalog.
4. Tap **Mark reviewed**. That only sets `reviewed_at`; it does not auto-promote a bad recipe.

## Fortnight reminder

pg_cron job `plentry-newcoming-fortnight` (`0 9 1,15 * *` UTC) calls `public.invoke_newcoming_review()` → Edge Function `newcoming` → Telegram if the queue is not empty. Same `ORDER_WEBHOOK_SECRET` as order notify. Manual run: `select public.invoke_newcoming_review();`

SQL: `plentry/supabase/meals_tags.sql`.
