-- Plentry — published-meals read. PENDING. Not applied to any database.
-- Paste this file in the Supabase SQL editor and run it there.
-- Do not move it into supabase/migrations/. This repo has no migrations
-- folder; the Supabase GitHub integration can auto-apply a file placed there.
--
-- Production today: policy "read meals" is SELECT for authenticated on every
-- row (supabase/schema.sql). Anon matches no row. Any signed-in user can read
-- drafts, including created_by and source.
--
-- This file:
--   * drops "read meals"
--   * creates "read published meals" FOR SELECT TO anon, authenticated
--     USING (reviewed_at is not null)
--   * does not drop or recreate "admin read meals", "admin insert meals",
--     or "admin update meals review" (admin_roles.sql, is_admin_aal2())
--   * revokes table SELECT from anon and grants only the columns below
--
-- Column names match the catalog SQL. No rename:
--   id, name, emoji, time, ing          schema.sql
--   image_url, recipe, tags, reviewed_at schema.sql
--   portions                            servings.sql
--   category                            meals_categories_tags_ingredients_v2.sql
-- Left off the anon list: created_by, source, created_at.
-- Authenticated keeps its existing table SELECT. RLS hides drafts from
-- non-admins. service_role bypasses RLS and is unchanged.
--
-- Idempotent. Safe to re-run. The whole change is one transaction.

begin;

drop policy if exists "read meals" on public.meals;
drop policy if exists "read published meals" on public.meals;
create policy "read published meals" on public.meals
  for select
  to anon, authenticated
  using (reviewed_at is not null);

revoke select on public.meals from anon;
grant select (
  id,
  name,
  emoji,
  time,
  ing,
  image_url,
  recipe,
  tags,
  reviewed_at,
  portions,
  category
) on public.meals to anon;

commit;

-- Rollback. Uncomment this block and run it on its own. Do not run it in the
-- same session as the transaction above. It restores "read meals" and the
-- table-level anon SELECT that policy used (anon still saw 0 rows, because
-- the USING clause required auth.role() = 'authenticated').
-- begin;
-- drop policy if exists "read published meals" on public.meals;
-- drop policy if exists "read meals" on public.meals;
-- create policy "read meals" on public.meals
--   for select
--   using (auth.role() = 'authenticated');
-- revoke select (id, name, emoji, time, ing, image_url, recipe, tags, reviewed_at, portions, category) on public.meals from anon;
-- revoke select on public.meals from anon;
-- grant select on public.meals to anon;
-- commit;
