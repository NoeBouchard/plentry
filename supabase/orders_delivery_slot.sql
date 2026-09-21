-- Plentry — supermarket delivery slot on orders (order tracking, 19 Sep 2026).
-- SAFE TO RE-RUN.  Applied live 19 Sep 2026 (migration orders_delivery_slot).
--
-- Customer copy before a slot exists: "Expected by <created_at + 4 days>"
-- (~3 days for the supermarket slot + ~1 day for Ops; ETA_DAYS in index.html).
-- Once the founder books the shop's delivery, Ops types the window here and
-- the customer sees "<store> delivers <slot>" until the order is Delivered.
--
-- Writes: founder only, via the existing "admin update all orders" policy
-- (aal2). Customers read it through "select own orders". No edge function
-- touches this column; `pay` and `stripe-webhook` never write it.

alter table public.orders add column if not exists delivery_slot text;

-- Short, plain text. Client strips < > and collapses whitespace (normSlot).
alter table public.orders drop constraint if exists orders_delivery_slot_sane;
alter table public.orders add constraint orders_delivery_slot_sane
  check (delivery_slot is null
         or (length(delivery_slot) between 1 and 80 and delivery_slot !~ '[<>]'));

-- ============ verify (read-only) ============
-- select column_name, data_type from information_schema.columns
--  where table_name = 'orders' and column_name = 'delivery_slot';           -- 1 row, text
-- select conname from pg_constraint where conname = 'orders_delivery_slot_sane'; -- 1 row
