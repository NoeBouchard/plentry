-- Plentry schema — SAFE TO RE-RUN: paste the whole file in Supabase SQL Editor and Run.

-- ============ PROFILES ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  state jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "select own profile" on public.profiles;
create policy "select own profile" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles
  for insert with check (auth.uid() = id);
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update using (auth.uid() = id);

-- ============ ORDERS ============
-- Written by the app on confirm; fulfil manually from the dashboard
-- (Table Editor -> orders, set status: new -> ordered -> delivered).
create table if not exists public.orders (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users(id) on delete cascade,
  email text,
  name text,
  postcode text,
  store text,
  total numeric,
  items jsonb,
  status text default 'new',
  created_at timestamptz default now()
);

alter table public.orders enable row level security;

drop policy if exists "insert own orders" on public.orders;
create policy "insert own orders" on public.orders
  for insert with check (auth.uid() = user_id);
drop policy if exists "select own orders" on public.orders;
create policy "select own orders" on public.orders
  for select using (auth.uid() = user_id);

-- ============ MEALS ============
-- Shared catalog. The AI endpoint reads it before proposing (no duplicates)
-- and writes every new dish back, so it grows as the app is used.
create table if not exists public.meals (
  id bigint generated always as identity primary key,
  name text unique not null,
  emoji text,
  time int,
  ing jsonb,
  source text default 'ai',          -- 'ai' | 'advisor' | 'seed'
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz default now()
);
alter table public.meals add column if not exists image_url text;
alter table public.meals add column if not exists recipe jsonb;
alter table public.meals add column if not exists tags jsonb;
alter table public.meals add column if not exists reviewed_at timestamptz;

alter table public.meals enable row level security;

-- Production, applied in the SQL editor after PR #28: policy "read published
-- meals" FOR SELECT TO anon, authenticated USING (reviewed_at is not null).
-- Anon SELECT is the 11 catalogue columns (not created_by, source, or
-- created_at). This bootstrap file still creates the old "read meals" policy
-- below. Re-running THIS file recreates "read meals"; run
-- meals_read_published.sql again after that, then meals_followups.sql.
-- Any new public catalogue column on public.meals must be added to the anon
-- column grant and to the authenticated column grant. Do not add created_by
-- or source.
-- PENDING, NOT APPLIED: supabase/meals_followups.sql is a loose file in
-- supabase/, not a migration. It revokes authenticated table SELECT, grants
-- the same 11 columns to anon and authenticated, adds admin_read_meals()
-- (is_admin_aal2()), revokes anon INSERT, UPDATE, DELETE, TRUNCATE,
-- REFERENCES, and TRIGGER, and revokes DELETE, TRUNCATE, REFERENCES, and
-- TRIGGER from authenticated. Authenticated keeps INSERT and UPDATE.
drop policy if exists "read meals" on public.meals;
create policy "read meals" on public.meals
  for select using (auth.role() = 'authenticated');
drop policy if exists "insert meals" on public.meals;
create policy "insert meals" on public.meals
  for insert with check (auth.uid() = created_by);
