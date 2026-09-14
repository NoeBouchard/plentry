# New meal (unverified catalog)

Queue of catalog dinners that are **not founder-verified** (`meals.reviewed_at` is null). Weird advisor recipes must not sit here forever. The UI label is **New meal** on the founder **Meals** tab (not Ops).

**Empty as of 9 Sep 2026** (77 reviewed). New advisor dishes and founder drafts appear here. Next cron ping: **15 Sep 2026 09:00 UTC** (then 1st and 15th each month).

## Fast path

1. Log in as `noyouchka.bouchard@gmail.com`.
2. **Meals** tab → **+ Add meal** (or open a card in **New meal**).
3. Ingredients (catalog keys only), instructions (one step per line, qty for 2), diet + extra tags. **Fill tags from ingredients** if you want a starting set.
4. **Verify & publish** — sets `reviewed_at`. Customers get it on New week / Modify from Postgres; no extra deploy.
5. **Save to New meal** if it is not ready. **Unpublish** on a live dish sends it back here. **Remove** deletes the row.

Advisor drafts land in New meal automatically (`source` advisor, `reviewed_at` null). Do not verify a bad recipe.

## Fortnight reminder

pg_cron job `plentry-newcoming-fortnight` (`0 9 1,15 * *` UTC) calls `public.invoke_newcoming_review()` → Edge Function `newcoming` → Telegram if the queue is not empty. Same `ORDER_WEBHOOK_SECRET` as order notify. Manual run: `select public.invoke_newcoming_review();`

SQL: `plentry/supabase/meals_tags.sql` (queue + CHECK). Founder write: `plentry/supabase/admin_meals_write.sql`.
