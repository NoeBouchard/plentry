-- Plentry — admin (concierge/ops) access to orders.
-- SAFE TO RE-RUN: paste the whole file in the Supabase SQL Editor and Run.
--
-- Grants the founder account full visibility of all orders plus the right to
-- update status (new -> ordered -> delivered) for manual fulfilment.
-- Policies are permissive (OR'd with the existing "own orders" policies).

drop policy if exists "admin select all orders" on public.orders;
create policy "admin select all orders" on public.orders
  for select using ((auth.jwt()->>'email') = 'noyouchka.bouchard@gmail.com');

drop policy if exists "admin update all orders" on public.orders;
create policy "admin update all orders" on public.orders
  for update using ((auth.jwt()->>'email') = 'noyouchka.bouchard@gmail.com');
