-- Plentry — security hardening v2. SAFE TO RE-RUN: paste the whole file in the
-- Supabase SQL Editor and Run. Added 7 Jul 2026.
--
-- 1) MEALS LOCKDOWN — users can no longer INSERT into the shared catalog from
--    the browser. Only the `ai` edge function (service role, validated content)
--    writes meals now. Client-side saveMealsToDB was removed from index.html.
-- 2) ORDERS VALIDATION TRIGGER — the client can no longer insert orders with a
--    negative/absurd total, a fake email, an invalid postcode, unknown stores,
--    or oversized/negative-quantity item lists. Applies to EVERY write path
--    (direct RLS insert, edge functions using the user client) because it runs
--    in the database itself.
-- 3) PROFILES / MEALS sanity constraints — cap state blob size, meal time and
--    ingredient list shape, so no client can bloat storage or store junk shapes.
--
-- NOTE: run this AFTER deploying the updated `ai` function (it now writes meals
-- via the service role); otherwise meal persistence pauses until you deploy.

-- ============ 1) MEALS: block direct client INSERT ============
drop policy if exists "insert meals" on public.meals;
-- RLS stays enabled; SELECT policy ("read meals", authenticated) remains.
-- No INSERT/UPDATE/DELETE policies => clients cannot write at all.
-- The `ai` edge function writes via supabaseAdmin (service role bypasses RLS).

-- Shape constraints on what the service role writes (defence in depth):
alter table public.meals drop constraint if exists meals_time_sane;
alter table public.meals add constraint meals_time_sane
  check (time is null or (time between 1 and 240));

alter table public.meals drop constraint if exists meals_ing_shape;
alter table public.meals add constraint meals_ing_shape
  check (ing is null or (jsonb_typeof(ing) = 'array' and jsonb_array_length(ing) between 1 and 20));

alter table public.meals add column if not exists recipe jsonb;
alter table public.meals drop constraint if exists meals_recipe_shape;
alter table public.meals add constraint meals_recipe_shape
  check (
    recipe is null
    or (
      jsonb_typeof(recipe) = 'object'
      and jsonb_typeof(recipe->'steps') = 'array'
      and jsonb_array_length(recipe->'steps') between 1 and 20
    )
  );

alter table public.meals add column if not exists tags jsonb;
alter table public.meals add column if not exists reviewed_at timestamptz;
-- Full tag whitelist + diet/dinner checks live in meals_tags.sql (applied after backfill).

-- ============ 2) ORDERS: server-side validation trigger ============
-- UK postcode (permissive official pattern). Uppercased before checking.
create or replace function public.validate_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  b jsonb;
  n int;
  q numeric;
  jwt_email text := nullif(auth.jwt()->>'email','');
begin
  -- ---- total: must be a sane positive amount ----
  if new.total is null or new.total <= 0 or new.total > 500 then
    raise exception 'invalid order total';
  end if;

  -- ---- postcode: valid UK format (normalised to upper case) ----
  if new.postcode is not null then
    new.postcode := upper(trim(new.postcode));
    if new.postcode !~ '^[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}$' then
      raise exception 'invalid UK postcode';
    end if;
  end if;
  if tg_op = 'INSERT' and new.postcode is null then
    raise exception 'postcode required';
  end if;

  -- ---- store: whitelist ----
  if new.store is null or new.store not in ('Asda','Sainsbury''s','Waitrose','Tesco') then
    raise exception 'unknown store';
  end if;

  -- ---- identity: never trust client-supplied email/name on insert ----
  if tg_op = 'INSERT' then
    if jwt_email is not null then new.email := jwt_email; end if;
    new.name := left(coalesce(new.name,''), 80);
  end if;

  -- ---- items: bounded, sane shape ----
  if new.items is not null then
    if pg_column_size(new.items) > 40000 then
      raise exception 'items too large';
    end if;
    b := new.items->'basket';
    if b is not null then
      if jsonb_typeof(b) <> 'array' then raise exception 'basket must be an array'; end if;
      n := jsonb_array_length(b);
      if n < 1 or n > 60 then raise exception 'basket size out of range'; end if;
      for i in 0..(n-1) loop
        q := coalesce((b->i->>'q')::numeric, 0);
        if q < 1 or q > 50 then raise exception 'item quantity out of range'; end if;
      end loop;
    end if;
  end if;

  -- ---- status / payment fields: sane values only ----
  if new.status is not null and new.status not in ('new','ordered','delivered') then
    raise exception 'invalid status';
  end if;
  if new.payment_status is not null
     and new.payment_status not in ('none','unpaid','authorized','captured','canceled') then
    raise exception 'invalid payment_status';
  end if;
  if new.amount_held is not null and (new.amount_held < 0 or new.amount_held > 1000) then
    raise exception 'invalid amount_held';
  end if;
  if new.amount_captured is not null and (new.amount_captured < 0 or new.amount_captured > 1000) then
    raise exception 'invalid amount_captured';
  end if;
  if new.address is not null and pg_column_size(new.address) > 10000 then
    raise exception 'address too large';
  end if;

  return new;
end $$;

drop trigger if exists validate_order on public.orders;
create trigger validate_order
  before insert or update on public.orders
  for each row execute function public.validate_order();

-- ============ 3) PROFILES: cap the state blob ============
-- The whole app state syncs into profiles.state; without a cap a malicious
-- client can store megabytes per row. 256 KB is ~50x normal usage.
-- NOT VALID = existing rows untouched; all new writes are checked.
alter table public.profiles drop constraint if exists profiles_state_size;
alter table public.profiles add constraint profiles_state_size
  check (pg_column_size(state) <= 262144) not valid;

-- ============ housekeeping reminder ============
-- Rate limiting (security_hardening.sql) must also be applied if not yet done:
-- it creates public.rate_limits + check_rate_limit(), used by ai/checkout/pay.
