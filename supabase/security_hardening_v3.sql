-- Plentry — security hardening v3. SAFE TO RE-RUN: paste the whole file in the
-- Supabase SQL Editor and Run. Added 17 Sep 2026 (security audit S-02, S-09).
--
-- Requires security_hardening.sql and security_hardening_v2.sql (both applied
-- to live Postgres on 17 Sep 2026 — they had never been run before that date).
--
-- 1) ORDERS INSERT — money and fulfilment columns are SERVER-OWNED. The client
--    (RLS "insert own orders") may only describe the basket. payment_status,
--    payment_intent, checkout_session, amount_held, amount_captured and status
--    are forced on INSERT, so a row can never be born looking paid. Ops shows a
--    card hold only after stripe-webhook flips payment_status to 'authorized'.
--    (Before: the trigger whitelisted values but did not force them, so a
--    customer could insert payment_status='authorized' + amount_held and get
--    the founder to shop an order Stripe never held.)
-- 2) ORDERS UPDATE — total / postcode / store / items are validated only when
--    they change, so legacy free-beta rows (null total) can still move
--    New -> Ordered -> Delivered in Ops. Status and payment enums, amount ranges
--    and address size are always checked.
-- 3) checkout_session — `pay` records the Stripe Checkout Session id and expires
--    the previous one before opening another (no double holds). stripe-webhook
--    only cancels the order when the expired session is the current one.

alter table public.orders add column if not exists checkout_session text;

create or replace function public.validate_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  b jsonb;
  n int;
  q numeric;
  jwt_email text := nullif(auth.jwt()->>'email','');
  is_insert boolean := (tg_op = 'INSERT');
  check_total boolean;
  check_postcode boolean;
  check_store boolean;
  check_items boolean;
begin
  check_total := is_insert or new.total is distinct from old.total;
  check_postcode := is_insert or new.postcode is distinct from old.postcode;
  check_store := is_insert or new.store is distinct from old.store;
  check_items := is_insert or new.items is distinct from old.items;

  -- ---- INSERT: server-owned columns (S-02). No legitimate INSERT path sets
  -- these: the app inserts 'unpaid'; pay / stripe-webhook / Ops only UPDATE. ----
  if is_insert then
    new.payment_status := 'unpaid';
    new.payment_intent := null;
    new.checkout_session := null;
    new.amount_held := null;
    new.amount_captured := null;
    new.status := 'new';
    -- identity: never trust client-supplied email/name
    if jwt_email is not null then new.email := jwt_email; end if;
    new.name := left(coalesce(new.name,''), 80);
  end if;

  -- ---- total: must be a sane positive amount ----
  if check_total and (new.total is null or new.total <= 0 or new.total > 500) then
    raise exception 'invalid order total';
  end if;

  -- ---- postcode: valid UK format (normalised to upper case) ----
  if check_postcode and new.postcode is not null then
    new.postcode := upper(trim(new.postcode));
    if new.postcode !~ '^[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}$' then
      raise exception 'invalid UK postcode';
    end if;
  end if;
  if is_insert and new.postcode is null then
    raise exception 'postcode required';
  end if;

  -- ---- store: whitelist ----
  if check_store and (new.store is null or new.store not in ('Asda','Sainsbury''s','Waitrose','Tesco')) then
    raise exception 'unknown store';
  end if;

  -- ---- items: bounded, sane shape ----
  if check_items and new.items is not null then
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

  -- ---- status / payment fields: sane values only (always) ----
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
  if new.checkout_session is not null and length(new.checkout_session) > 120 then
    raise exception 'invalid checkout_session';
  end if;

  return new;
end $$;

drop trigger if exists validate_order on public.orders;
create trigger validate_order
  before insert or update on public.orders
  for each row execute function public.validate_order();

-- Trigger function only: never callable through PostgREST RPC.
revoke all on function public.validate_order() from public, anon, authenticated;

-- ============ verify (read-only) ============
-- select proname from pg_proc where proname in ('check_rate_limit','validate_order');
-- select tgname from pg_trigger where tgname = 'validate_order';
-- select column_name from information_schema.columns where table_name='orders' and column_name='checkout_session';
