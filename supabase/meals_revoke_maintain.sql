-- Plentry — revoke MAINTAIN on public.meals. APPLIED to prod 27 Oct 2026 ~22:42 GMT.
-- Paste this file in the Supabase SQL editor and run it there.
-- Do not move it into supabase/migrations/. This repo has no migrations
-- folder; a file placed there auto-applies to prod on merge.
--
-- Assumes supabase/meals_followups.sql is already applied. This file does
-- not change the 11-column SELECT grants. Approved by Product. Applied to
-- prod at about 22:42 GMT on 27 Oct 2026, after PR #33 (985a4511) merged at
-- 22:41:31 GMT. Read-only check on 4 Nov 2026: anon and authenticated have
-- no MAINTAIN on public.meals and keep the same 11 SELECT columns.

begin;

revoke maintain on table public.meals from anon, authenticated;

commit;

-- Rollback. Uncomment this line and run it on its own. Do not run it in the
-- same session as the transaction above.
-- grant maintain on table public.meals to anon, authenticated;
