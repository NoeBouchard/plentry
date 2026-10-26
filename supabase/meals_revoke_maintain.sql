-- Plentry — revoke MAINTAIN on public.meals. PENDING, not applied.
-- Paste this file in the Supabase SQL editor and run it there.
-- Do not move it into supabase/migrations/. This repo has no migrations
-- folder; a file placed there auto-applies to prod on merge.
--
-- Assumes supabase/meals_followups.sql is already applied. This file does
-- not change the 11-column SELECT grants. Approved by Product. Not applied.

begin;

revoke maintain on table public.meals from anon, authenticated;

commit;

-- Rollback. Uncomment this line and run it on its own. Do not run it in the
-- same session as the transaction above.
-- grant maintain on table public.meals to anon, authenticated;
