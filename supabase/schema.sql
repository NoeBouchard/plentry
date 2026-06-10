-- Plentry schema — run once in Supabase: SQL Editor → New query → paste → Run
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  state jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "select own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "insert own profile" on public.profiles
  for insert with check (auth.uid() = id);
create policy "update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Orders: written by the app on confirm; you fulfil them manually from the
-- Supabase dashboard (Table Editor -> orders, status: new -> ordered -> delivered).
create table if not exists public.orders (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
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

create policy "insert own orders" on public.orders
  for insert with check (auth.uid() = user_id);
create policy "select own orders" on public.orders
  for select using (auth.uid() = user_id);
