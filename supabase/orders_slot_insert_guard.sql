-- Plentry — customers cannot set a delivery slot on INSERT (19 Sep 2026).
-- SAFE TO RE-RUN. Complements orders_delivery_slot.sql (column + CHECK).
--
-- Ops writes delivery_slot via "admin update all orders" after capture.
-- The INSERT path is customer-owned, so the slot is always born null.

create or replace function public.orders_clear_slot_on_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.delivery_slot := null;
  return new;
end $$;

drop trigger if exists orders_clear_slot_on_insert on public.orders;
create trigger orders_clear_slot_on_insert
  before insert on public.orders
  for each row execute function public.orders_clear_slot_on_insert();

revoke all on function public.orders_clear_slot_on_insert() from public, anon, authenticated;

-- ============ verify (read-only) ============
-- select tgname from pg_trigger where tgname = 'orders_clear_slot_on_insert';  -- 1 row
