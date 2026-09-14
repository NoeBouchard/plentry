-- Plentry — founder write access on public.meals for the Ops Meals screen.
-- SAFE TO RE-RUN. Same policies live in admin_policies.sql.
--
-- Add / edit / verify / delete catalog dinners as noyouchka.bouchard@gmail.com.
-- Unverified rows keep reviewed_at NULL (New meal). Verify sets reviewed_at;
-- the customer week then picks them up from Postgres with no extra deploy.

drop policy if exists "admin update meals review" on public.meals;
create policy "admin update meals review" on public.meals
  for update using ((auth.jwt()->>'email') = 'noyouchka.bouchard@gmail.com')
  with check ((auth.jwt()->>'email') = 'noyouchka.bouchard@gmail.com');

drop policy if exists "insert meals" on public.meals;
drop policy if exists "admin insert meals" on public.meals;
create policy "admin insert meals" on public.meals
  for insert with check ((auth.jwt()->>'email') = 'noyouchka.bouchard@gmail.com');

drop policy if exists "admin delete meals" on public.meals;
create policy "admin delete meals" on public.meals
  for delete using ((auth.jwt()->>'email') = 'noyouchka.bouchard@gmail.com');

grant select, insert, update, delete on public.meals to authenticated;
