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

alter table public.meals enable row level security;

drop policy if exists "read meals" on public.meals;
create policy "read meals" on public.meals
  for select using (auth.role() = 'authenticated');
drop policy if exists "insert meals" on public.meals;
create policy "insert meals" on public.meals
  for insert with check (auth.uid() = created_by);
