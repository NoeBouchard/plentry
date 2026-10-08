-- Plentry — admin role list + catalog write checks.
-- SAFE TO RE-RUN. Does not deploy anything. Paste in the Supabase SQL editor and Run.
--
-- APPLY BEFORE the static site that calls is_admin(). Founder TOTP is already
-- enrolled and REQUIRE_ADMIN_MFA=1 is set (18 Sep 2026). This file replaces the
-- email check inside the admin policies from admin_mfa.sql. It still requires aal2.
--
-- Order:
--   1. Run THIS file (founder is inserted into public.admins, then policies switch).
--   2. Confirm: select email from public.admins;  — one row, the founder.
--   3. Deploy index.html (vercel). Do not deploy from the PR branch until merged
--      and npm test is green, and only when the founder asks.
--
-- If this file runs before the static ship, the founder still works: policies
-- use is_admin_aal2(), and the empty-table fallback is the founder email + aal2.
-- If the static ship runs first, the client falls back to that same email until
-- is_admin() exists.
--
-- Roll back the policies only: re-run supabase/admin_mfa.sql (email + aal2).
-- Do not drop public.admins if you have added more people.

create table if not exists public.admins (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  added_at timestamptz default now(),
  added_by uuid references auth.users(id),
  unique (user_id)
);

alter table public.admins enable row level security;

-- Membership without aal, so the client can learn "this user is an admin" before
-- the TOTP code (the code still hides Ops / Meals / Ingredients). SECURITY DEFINER
-- so the read does not recurse through RLS on admins.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
      or (
        not exists (select 1 from public.admins)
        and (auth.jwt()->>'email') = 'noyouchka.bouchard@gmail.com'
      )
$$;

-- Writes and other customers' rows: admin membership AND aal2.
create or replace function public.is_admin_aal2() returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin()
     and (auth.jwt()->>'aal') = 'aal2'
$$;

revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.is_admin_aal2() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_admin_aal2() to authenticated;

-- Founder row. The insert is as the migration role, not through RLS.
insert into public.admins (user_id, email)
select id, email from auth.users
where email = 'noyouchka.bouchard@gmail.com'
on conflict (user_id) do nothing;

-- to authenticated: anon never evaluates is_admin_aal2().
drop policy if exists "admins read admins" on public.admins;
create policy "admins read admins" on public.admins
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin_aal2());

drop policy if exists "admins insert admins" on public.admins;
create policy "admins insert admins" on public.admins
  for insert to authenticated
  with check (public.is_admin_aal2());

-- Orders / meals writes: same five policies as admin_mfa.sql, now the role list.
drop policy if exists "admin select all orders" on public.orders;
create policy "admin select all orders" on public.orders
  for select to authenticated
  using (public.is_admin_aal2());

drop policy if exists "admin update all orders" on public.orders;
create policy "admin update all orders" on public.orders
  for update to authenticated
  using (public.is_admin_aal2());

drop policy if exists "admin update meals review" on public.meals;
create policy "admin update meals review" on public.meals
  for update to authenticated
  using (public.is_admin_aal2())
  with check (public.is_admin_aal2());

drop policy if exists "insert meals" on public.meals;
drop policy if exists "admin insert meals" on public.meals;
create policy "admin insert meals" on public.meals
  for insert to authenticated
  with check (public.is_admin_aal2());

drop policy if exists "admin delete meals" on public.meals;
create policy "admin delete meals" on public.meals
  for delete to authenticated
  using (public.is_admin_aal2());

-- Leave the existing "read meals" policy in place: authenticated users can
-- already read published meals and drafts. Add admin read of unpublished
-- meals. Do not grant this to anon.
drop policy if exists "admin read meals" on public.meals;
create policy "admin read meals" on public.meals
  for select to authenticated
  using (public.is_admin_aal2());

-- Prices stay world-readable (landing + basket). Writes are admin + aal2.
drop policy if exists "admin insert ingredient_prices" on public.ingredient_prices;
create policy "admin insert ingredient_prices" on public.ingredient_prices
  for insert to authenticated
  with check (public.is_admin_aal2());

drop policy if exists "admin update ingredient_prices" on public.ingredient_prices;
create policy "admin update ingredient_prices" on public.ingredient_prices
  for update to authenticated
  using (public.is_admin_aal2())
  with check (public.is_admin_aal2());

drop policy if exists "admin delete ingredient_prices" on public.ingredient_prices;
create policy "admin delete ingredient_prices" on public.ingredient_prices
  for delete to authenticated
  using (public.is_admin_aal2());

-- Per-shop pack, so the next basketFor can read this instead of one catalog pack.
-- servings.sql adds the same columns; both files are safe to re-run.
alter table public.ingredient_prices add column if not exists pack_qty numeric;
alter table public.ingredient_prices add column if not exists pack_unit text;

-- Inbox follows the same role (orders_slot_issue.sql created these as is_founder_aal2).
do $$
begin
  if to_regclass('public.order_messages') is not null then
    execute 'drop policy if exists "admin select order messages" on public.order_messages';
    execute 'create policy "admin select order messages" on public.order_messages for select to authenticated using (public.is_admin_aal2())';
    execute 'drop policy if exists "admin insert order messages" on public.order_messages';
    execute 'create policy "admin insert order messages" on public.order_messages for insert to authenticated with check (public.is_admin_aal2() and author_role = ''ops'')';
  end if;
end $$;

-- Portion units for the 46 catalog keys. Empty string = seasoning (never a portion).
-- A later per-shop pack may change pack_qty; the unit here is what meals.portions must match today.
create or replace function public.validate_meal_write() returns trigger
language plpgsql
set search_path = public
as $$
declare
  rowj jsonb := to_jsonb(new);
  portions jsonb := rowj->'portions';
  packs jsonb := '{
    "chicken thighs":"pc","salmon fillet":"pc","minced beef":"g","halloumi":"g","eggs":"pc",
    "chickpeas":"g","rice":"g","spaghetti":"g","tortillas":"pc","coconut milk":"ml",
    "curry paste":"tbsp","passata":"g","onions":"pc","garlic":"clove","bell peppers":"pc",
    "broccoli":"pc","spinach":"g","tomatoes":"pc","lemons":"pc","potatoes":"g",
    "olive oil":"tbsp","feta":"g","yoghurt":"g","parmesan":"g","chopped tomatoes":"g",
    "butter":"g","fresh coriander":"g","tomato puree":"g","fresh ginger":"g","garam masala":"tsp",
    "limes":"pc","spring onions":"pc","penne":"g","arborio rice":"g","fresh basil":"g",
    "cucumber":"pc","red onions":"pc","cheddar":"g",
    "salt":"","black pepper":"","paprika":"","cumin":"","chilli flakes":"","mixed herbs":"","soy sauce":"","stock cubes":""
  }'::jsonb;
  k text;
  spec jsonb;
  amt numeric;
  unit text;
  expect text;
  steps jsonb;
begin
  -- Service role (advisor) and postgres (SQL editor) have no auth.uid().
  -- Their writes stay exactly as they are today, including seasoning keys.
  if auth.uid() is null then
    return new;
  end if;
  if new.name is null or length(btrim(new.name)) < 1 then
    raise exception 'meal needs a name';
  end if;
  if portions is not null and portions <> 'null'::jsonb then
    if jsonb_typeof(portions) <> 'object' then
      raise exception 'portions must be an object';
    end if;
    for k, spec in select * from jsonb_each(portions) loop
      expect := packs->>k;
      -- Seasoning keys stay on the row. Basket logic never scales them.
      if expect is not null and expect = '' then
        continue;
      end if;
      if jsonb_typeof(spec) <> 'array' or jsonb_array_length(spec) < 2 then
        raise exception 'bad portion for %', k;
      end if;
      begin
        amt := (spec->>0)::numeric;
      exception when others then
        raise exception 'bad portion amount for %', k;
      end;
      unit := spec->>1;
      if amt is null or amt <= 0 or amt > 5000 then
        raise exception 'bad portion amount for %', k;
      end if;
      if unit not in ('g','ml','pc','clove','tbsp','tsp') then
        raise exception 'bad portion unit for %', k;
      end if;
      if expect is not null and expect <> '' and unit <> expect then
        raise exception 'portion unit for % must be %', k, expect;
      end if;
    end loop;
  end if;
  if new.reviewed_at is not null then
    steps := new.recipe->'steps';
    if steps is null or jsonb_typeof(steps) <> 'array' or jsonb_array_length(steps) < 1 then
      raise exception 'a published meal needs at least one instruction step';
    end if;
  end if;
  return new;
end $$;

revoke all on function public.validate_meal_write() from public, anon, authenticated;

drop trigger if exists validate_meal_write on public.meals;
create trigger validate_meal_write
  before insert or update on public.meals
  for each row execute function public.validate_meal_write();

create or replace function public.validate_ingredient_price() returns trigger
language plpgsql
set search_path = public
as $$
declare
  rowj jsonb := to_jsonb(new);
  qty jsonb := rowj->'pack_qty';
  unit text := rowj->>'pack_unit';
begin
  -- Catalog price SQL and other postgres/service-role writes are unchanged.
  if auth.uid() is null then
    return new;
  end if;
  if new.store is null or new.store not in ('tesco','sainsburys','asda','waitrose') then
    raise exception 'shop must be tesco, sainsburys, asda, or waitrose';
  end if;
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := trim(both '-' from regexp_replace(lower(coalesce(nullif(btrim(new.meal_key), ''), new.display_name)), '[^a-z0-9]+', '-', 'g'));
  end if;
  -- A brand-new slug needs one of the six catalog categories. Another shop for a
  -- slug that is already grocery or fresh may keep that category. Updates are not checked.
  if tg_op = 'INSERT' then
    if new.category is null
       or (
         new.category not in ('protein','dairy','veg','fruit','carbs','pantry')
         and not exists (
           select 1 from public.ingredient_prices p
           where p.slug = new.slug and p.category = new.category
         )
       )
    then
      raise exception 'category is required';
    end if;
  end if;
  if new.price_gbp is null or new.price_gbp <= 0 then
    raise exception 'price is required';
  end if;
  if unit is not null and unit <> '' then
    if unit not in ('g','ml','pc','clove','tbsp','tsp') then
      raise exception 'pack unit must be g, ml, pc, clove, tbsp, or tsp';
    end if;
    if qty is null or qty = 'null'::jsonb then
      raise exception 'pack quantity and unit must be set together';
    end if;
  elsif qty is not null and qty <> 'null'::jsonb then
    raise exception 'pack quantity and unit must be set together';
  end if;
  return new;
end $$;

revoke all on function public.validate_ingredient_price() from public, anon, authenticated;

drop trigger if exists validate_ingredient_price on public.ingredient_prices;
create trigger validate_ingredient_price
  before insert or update on public.ingredient_prices
  for each row execute function public.validate_ingredient_price();

notify pgrst, 'reload schema';
