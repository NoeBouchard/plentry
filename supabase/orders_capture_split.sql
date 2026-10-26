-- PENDING, not applied
-- Plentry — store the capture split on public.orders.
-- Paste this file in the Supabase SQL editor and run it there.
-- Do not move it into supabase/migrations/. This repo has no migrations
-- folder; a file placed there can auto-apply.
--
-- Apply this BEFORE deploying pay. pay capture writes store_total,
-- fee_amount, and overrun_amount in the same update as amount_captured.
-- If the columns are missing, that update fails.
--
-- Units are pounds, the same as amount_captured and amount_held (the
-- authorised hold). Old rows stay null. Accounts backfills those in the books.
--
-- Customers cannot write the new columns. Live grants are table-wide:
-- anon and authenticated have UPDATE on amount_captured, and RLS is what
-- stops a non-admin update (no customer UPDATE policy; admin update is
-- aal2). A column-only REVOKE does nothing while that table UPDATE remains
-- (same lesson as meals_followups.sql). This file revokes table INSERT and
-- UPDATE from anon and authenticated, then grants back only the columns the
-- app writes. Money columns, including amount_captured and the new split,
-- stay with service_role (pay and stripe-webhook). service_role is not revoked.
--
-- validate_order still forces the money columns null on INSERT, and checks
-- ranges on UPDATE. fee_amount may be negative (till above the hold).
--
-- Idempotent. Safe to re-run.
--
-- Rollback — only after the previous pay is deployed, so pay no longer
-- writes these columns. Order matters: restoring the trigger first, then
-- the grants, then dropping the columns. Dropping the columns while this
-- function is still installed breaks every orders write.
--   1. Re-run supabase/security_hardening_v3.sql
--      (validate_order without store_total / fee_amount / overrun_amount).
--   2. grant insert, update on table public.orders to anon, authenticated;
--   3. alter table public.orders drop column if exists overrun_amount;
--      alter table public.orders drop column if exists fee_amount;
--      alter table public.orders drop column if exists store_total;

begin;

alter table public.orders add column if not exists store_total numeric;
alter table public.orders add column if not exists fee_amount numeric;
alter table public.orders add column if not exists overrun_amount numeric;

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

  -- INSERT: server-owned columns. pay / stripe-webhook / Ops only UPDATE.
  if is_insert then
    new.payment_status := 'unpaid';
    new.payment_intent := null;
    new.checkout_session := null;
    new.amount_held := null;
    new.amount_captured := null;
    new.store_total := null;
    new.fee_amount := null;
    new.overrun_amount := null;
    new.status := 'new';
    if jwt_email is not null then new.email := jwt_email; end if;
    new.name := left(coalesce(new.name,''), 80);
  end if;

  if check_total and (new.total is null or new.total <= 0 or new.total > 500) then
    raise exception 'invalid order total';
  end if;

  if check_postcode and new.postcode is not null then
    new.postcode := upper(trim(new.postcode));
    if new.postcode !~ '^[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}$' then
      raise exception 'invalid UK postcode';
    end if;
  end if;
  if is_insert and new.postcode is null then
    raise exception 'postcode required';
  end if;

  if check_store and (new.store is null or new.store not in ('Asda','Sainsbury''s','Waitrose','Tesco')) then
    raise exception 'unknown store';
  end if;

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
  if new.store_total is not null and (new.store_total < 0 or new.store_total > 1000) then
    raise exception 'invalid store_total';
  end if;
  -- Negative when the till is above the hold. Zero is the no-fee edge.
  if new.fee_amount is not null and (new.fee_amount < -1000 or new.fee_amount > 1000) then
    raise exception 'invalid fee_amount';
  end if;
  if new.overrun_amount is not null and (new.overrun_amount < 0 or new.overrun_amount > 1000) then
    raise exception 'invalid overrun_amount';
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

revoke all on function public.validate_order() from public, anon, authenticated;

-- Table UPDATE/INSERT would keep every new column writable. Take the table
-- privilege away, then hand back the columns the browser writes.
revoke insert, update on table public.orders from anon;
revoke insert, update on table public.orders from authenticated;

grant insert (
  user_id,
  email,
  name,
  postcode,
  store,
  total,
  payment_status,
  address,
  items,
  slot_date,
  slot_start,
  slot_end
) on table public.orders to authenticated;

grant update (
  status,
  delivery_slot,
  issue_status
) on table public.orders to authenticated;

commit;
