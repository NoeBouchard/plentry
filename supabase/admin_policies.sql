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

drop policy if exists "admin update meals review" on public.meals;
create policy "admin update meals review" on public.meals
  for update using ((auth.jwt()->>'email') = 'noyouchka.bouchard@gmail.com')
  with check ((auth.jwt()->>'email') = 'noyouchka.bouchard@gmail.com');

-- Ops Meals screen: founder can add, edit, verify, and remove catalog dinners.
-- Other clients still cannot INSERT (drop the old uid=created_by insert policy).
drop policy if exists "insert meals" on public.meals;
drop policy if exists "admin insert meals" on public.meals;
create policy "admin insert meals" on public.meals
  for insert with check ((auth.jwt()->>'email') = 'noyouchka.bouchard@gmail.com');

drop policy if exists "admin delete meals" on public.meals;
create policy "admin delete meals" on public.meals
  for delete using ((auth.jwt()->>'email') = 'noyouchka.bouchard@gmail.com');

grant select, insert, update, delete on public.meals to authenticated;
