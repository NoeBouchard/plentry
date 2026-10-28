-- Plentry — revoke DELETE and TRUNCATE on public.orders. APPLIED to prod 28 Oct 2026 ~15:41:55 GMT.
-- Apply with Supabase SQL (execute_sql). Not a migration.
-- Do not move it into supabase/migrations/. This repo has no migrations
-- folder; a file placed there auto-applies to prod on merge.
--
-- After the 28 Oct 2026 capture-split ship, anon and authenticated hold
-- table privileges rdDxtm on public.orders, plus column-level INSERT and
-- UPDATE. DELETE (d) and TRUNCATE (D) are still granted. TRUNCATE bypasses
-- RLS. The app never deletes an order (insert, select, and update only).
-- This file does not change other privileges or column grants.
-- Independent of PR #34 (feat/order-completion-email).

begin;

revoke delete, truncate on table public.orders from anon, authenticated;

commit;

-- Verify. Expect delete = false and truncate = false for both roles.
-- select rolname,
--        has_table_privilege(rolname, 'public.orders', 'DELETE') as delete,
--        has_table_privilege(rolname, 'public.orders', 'TRUNCATE') as truncate
-- from (values ('anon'), ('authenticated')) as roles(rolname);

-- Rollback. Uncomment this line and run it on its own. Do not run it in the
-- same session as the transaction above.
-- grant delete, truncate on table public.orders to anon, authenticated;
