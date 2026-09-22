-- Plentry — founder policies require a 2-step-verified session (aal2). S-06.
-- SAFE TO RE-RUN.  APPLIED 18 Sep 2026 (migration admin_mfa_aal2_policies) after the
-- founder enrolled TOTP; REQUIRE_ADMIN_MFA=1 set the same day. Verified live: the
-- founder JWT at aal1 sees only its own orders, at aal2 all orders.
--
-- ORDER OF OPERATIONS on a fresh project (or you lock yourself out of Ops):
--   1. Deploy the static app + `pay` (both carry the MFA UI / check).
--   2. Log in as the founder -> Profile -> Security -> Turn on 2-step verification
--      (scan the QR in an authenticator app, enter the first code).
--   3. Sign out, sign in, enter the code once: Ops and Meals reappear.
--   4. Paste THIS file in the SQL Editor and Run.
--   5. `cd plentry && supabase secrets set REQUIRE_ADMIN_MFA=1`  (capture needs aal2).
--
-- Roll back: re-run supabase/admin_policies.sql (email-only policies) and
-- `supabase secrets unset REQUIRE_ADMIN_MFA`.
--
-- Why: the founder email is the only key to every customer's orders/PII and to
-- the shared meals catalog. A phished or leaked password alone should not be
-- enough. auth.jwt()->>'aal' is 'aal2' only after a TOTP code in this session.

create or replace function public.is_founder_aal2() returns boolean
language sql stable as $$
  select (auth.jwt()->>'email') = 'noyouchka.bouchard@gmail.com'
     and (auth.jwt()->>'aal') = 'aal2'
$$;
revoke all on function public.is_founder_aal2() from public, anon;
grant execute on function public.is_founder_aal2() to authenticated;

drop policy if exists "admin select all orders" on public.orders;
create policy "admin select all orders" on public.orders
  for select using (public.is_founder_aal2());

drop policy if exists "admin update all orders" on public.orders;
create policy "admin update all orders" on public.orders
  for update using (public.is_founder_aal2());

drop policy if exists "admin update meals review" on public.meals;
create policy "admin update meals review" on public.meals
  for update using (public.is_founder_aal2())
  with check (public.is_founder_aal2());

drop policy if exists "insert meals" on public.meals;
drop policy if exists "admin insert meals" on public.meals;
create policy "admin insert meals" on public.meals
  for insert with check (public.is_founder_aal2());

drop policy if exists "admin delete meals" on public.meals;
create policy "admin delete meals" on public.meals
  for delete using (public.is_founder_aal2());

-- ============ verify (read-only) ============
-- select policyname, qual from pg_policies where tablename in ('orders','meals') and policyname like 'admin%';
