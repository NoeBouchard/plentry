-- Plentry — meals catalogue follow-ups. PENDING. Not applied to any database.
-- Paste this file in the Supabase SQL editor and run it there.
-- Do not move it into supabase/migrations/. This repo has no migrations
-- folder; the Supabase GitHub integration can auto-apply a file placed there.
--
-- Assumes supabase/meals_read_published.sql is already applied (PR #28):
-- policy "read published meals" FOR SELECT TO anon, authenticated
-- USING (reviewed_at is not null). That file is not modified here.
--
-- This file, in one transaction:
--   (a) Revokes table SELECT from authenticated and grants the same 11
--       catalogue columns anon already has. created_by, source, and
--       created_at stay off both grants. Revoking one column does nothing
--       while a table-level SELECT remains, so the table grant has to go.
--       The Meals screen shows source and created_at, and created_by on
--       advisor drafts is a customer id. Column grants are per role, so an
--       aal2 admin cannot hold extra columns on authenticated.
--       public.admin_read_meals() is security definer, checks
--       public.is_admin_aal2(), and returns the catalogue columns plus
--       source, created_by, and created_at, including drafts. Other callers
--       get no rows. EXECUTE is granted to authenticated only.
--       service_role is unchanged (ai writes, pay, and newcoming use it).
--       "admin read meals", "admin insert meals", and "admin update meals
--       review" are not dropped. Authenticated keeps INSERT and UPDATE so
--       those policies still have a table privilege. No admin path deletes
--       a meal: the Meals screen unpublishes with an UPDATE, and ai, pay,
--       and newcoming use the service role.
--   (d) Revokes anon's table INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES,
--       and TRIGGER. Supabase grants those to anon and to authenticated by
--       default. Also revokes DELETE, TRUNCATE, REFERENCES, and TRIGGER from
--       authenticated. TRUNCATE ignores row level security, so a signed-in
--       non-admin could empty the table while that privilege remains.
--       Authenticated keeps INSERT and UPDATE.
--
-- Any new public catalogue column on public.meals must be added to both
-- column grants below (anon and authenticated) and to the anon grant in
-- meals_read_published.sql. Do not add created_by or source.
--
-- Idempotent. Safe to re-run.

begin;

revoke insert, update, delete, truncate, references, trigger on table public.meals from anon;
revoke delete, truncate, references, trigger on table public.meals from authenticated;

revoke select on table public.meals from anon, authenticated;
revoke select (created_by, source, created_at) on table public.meals from anon, authenticated;

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
) on table public.meals to anon, authenticated;

drop function if exists public.admin_read_meals();

create function public.admin_read_meals()
returns table (
  id bigint,
  name text,
  emoji text,
  "time" integer,
  category text,
  ing jsonb,
  image_url text,
  recipe jsonb,
  tags jsonb,
  portions jsonb,
  source text,
  created_by uuid,
  created_at timestamptz,
  reviewed_at timestamptz
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    m.id,
    m.name,
    m.emoji,
    m.time,
    m.category,
    m.ing,
    m.image_url,
    m.recipe,
    m.tags,
    m.portions,
    m.source,
    m.created_by,
    m.created_at,
    m.reviewed_at
  from public.meals m
  where public.is_admin_aal2()
  order by m.created_at desc nulls last, m.id desc
  limit 500;
$$;

revoke all on function public.admin_read_meals() from public;
revoke all on function public.admin_read_meals() from anon, authenticated;
grant execute on function public.admin_read_meals() to authenticated;

comment on function public.admin_read_meals() is
  'Catalogue rows for an aal2 admin, including source, created_by, created_at, and drafts. Other callers get no rows.';

commit;

-- Rollback. Uncomment this block and run it on its own. Do not run it in the
-- same session as the transaction above. It restores authenticated table
-- SELECT (created_by and source are readable again on rows the policies
-- allow), authenticated DELETE, TRUNCATE, REFERENCES, and TRIGGER, and the
-- anon write privileges Supabase grants by default. It does not restore
-- policy "read meals", and it does not grant created_by or source to anon.
-- Authenticated INSERT and UPDATE were not revoked.
-- begin;
-- drop function if exists public.admin_read_meals();
-- revoke select (id, name, emoji, time, ing, image_url, recipe, tags, reviewed_at, portions, category) on table public.meals from authenticated;
-- revoke select (created_by, source, created_at) on table public.meals from authenticated;
-- grant select on table public.meals to authenticated;
-- grant delete, truncate, references, trigger on table public.meals to authenticated;
-- grant insert, update, delete, truncate, references, trigger on table public.meals to anon;
-- commit;
