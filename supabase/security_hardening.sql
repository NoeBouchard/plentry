-- Plentry — security hardening. SAFE TO RE-RUN: paste the whole file in the
-- Supabase SQL Editor and Run. Added 6 Jul 2026.
--
-- 1) Rate limiting for the cost-bearing edge functions (ai / checkout / pay).
--    The `ai` function accepts the PUBLIC publishable key (it must work logged
--    out), so without a limit anyone with the key baked into the browser app can
--    spam Anthropic/Pepesto/Stripe calls and run up the bill. check_rate_limit()
--    does an atomic per-window counter keyed by user id (or client IP when
--    logged out) and returns false when the caller is over the limit.
--
-- 2) Defence-in-depth CHECK constraints on the shared `meals` table. Any signed
--    -in user can INSERT rows (RLS: auth.uid() = created_by), and every user
--    reads them back, so a meal name/emoji containing markup is stored XSS. The
--    app now HTML-escapes on render, but these constraints stop the bad data at
--    the door — the client cannot bypass them the way it can bypass JS checks.

-- ============ RATE LIMITING ============
create table if not exists public.rate_limits (
  bucket       text not null,          -- 'ai' | 'checkout' | 'pay'
  ident        text not null,          -- user uuid, or 'ip:<addr>' when logged out
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (bucket, ident, window_start)
);

alter table public.rate_limits enable row level security;
-- No policies: only the service role (edge functions via supabaseAdmin) touches
-- this table. RLS-on + no policy = deny all for anon/authenticated clients.

-- Atomic increment-and-check. Returns TRUE if the call is allowed (<= p_max in
-- the current fixed window), FALSE if it should be rejected.
create or replace function public.check_rate_limit(
  p_bucket text, p_ident text, p_max int, p_window_seconds int
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  c int;
begin
  insert into public.rate_limits(bucket, ident, window_start, count)
  values (p_bucket, p_ident, w, 1)
  on conflict (bucket, ident, window_start)
  do update set count = public.rate_limits.count + 1
  returning count into c;
  return c <= p_max;
end $$;

-- Let the edge functions (service role) call it; keep it away from clients.
revoke all on function public.check_rate_limit(text, text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, text, int, int) to service_role;

-- Optional housekeeping: drop counter rows older than a day. Run manually or via
-- a scheduled job (pg_cron) if you enable it.
-- delete from public.rate_limits where window_start < now() - interval '1 day';

-- ============ MEALS CONTENT CONSTRAINTS ============
-- Reject any markup-significant characters in the free-text meal fields.
alter table public.meals drop constraint if exists meals_name_no_html;
alter table public.meals add constraint meals_name_no_html
  check (name !~ '[<>]' and length(name) <= 80);

alter table public.meals drop constraint if exists meals_emoji_no_html;
alter table public.meals add constraint meals_emoji_no_html
  check (emoji is null or (emoji !~ '[<>]' and length(emoji) <= 16));
