-- Plentry — move the DB-webhook shared secret into Supabase Vault (S-13).
-- SAFE TO RE-RUN. Applied to live Postgres 17 Sep 2026.
--
-- Before: the `x-webhook-secret` header value (= ORDER_WEBHOOK_SECRET on the
-- notify-order / newcoming edge functions) sat as a literal inside
-- notify_order_webhook_fn, and invoke_newcoming_review scraped it back out of
-- pg_get_functiondef(). Anyone who could read function bodies (dashboard,
-- schema dumps, a future over-granted role) could forge Telegram pings.
--
-- After: the value lives in vault.secrets (encrypted at rest), both functions
-- read it through public.order_webhook_secret() (SECURITY DEFINER, not
-- executable by app roles), and no function body contains it.
--
-- Rotation: `select vault.update_secret((select id from vault.secrets where
-- name='order_webhook_secret'), '<new>');` then
-- `supabase secrets set ORDER_WEBHOOK_SECRET=<new>` — no SQL redeploy needed.

-- ============ 1) seed the vault from the current inline value (once) ============
do $$
declare src text; secret text;
begin
  if exists (select 1 from vault.secrets where name = 'order_webhook_secret') then
    raise notice 'order_webhook_secret already in vault - keeping it';
    return;
  end if;
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'notify_order_webhook_fn' limit 1;
  secret := substring(src from 'x-webhook-secret'',''([^'']+)');
  if secret is null or secret = '' or secret like '%ORDER_WEBHOOK%' or secret like '%secret%' then
    raise exception 'order_webhook_secret: no inline value found to migrate. Run: select vault.create_secret(''<ORDER_WEBHOOK_SECRET value>'', ''order_webhook_secret'');';
  end if;
  perform vault.create_secret(secret, 'order_webhook_secret',
    'x-webhook-secret header for notify-order / newcoming edge functions (= ORDER_WEBHOOK_SECRET)');
end $$;

-- ============ 2) reader: definer-only, never callable by app roles ============
create or replace function public.order_webhook_secret() returns text
language sql security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'order_webhook_secret' limit 1
$$;
revoke all on function public.order_webhook_secret() from public, anon, authenticated, service_role;

-- ============ 3) orders -> notify-order (Telegram), secret from vault ============
create or replace function public.notify_order_webhook_fn() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  secret text := public.order_webhook_secret();
begin
  if secret is null or secret = '' then
    raise warning 'notify_order_webhook_fn: order_webhook_secret missing in vault - Telegram skipped';
    return new;
  end if;
  perform net.http_post(
    url := 'https://ucciqthwxnlkjalwlhvh.supabase.co/functions/v1/notify-order',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', secret),
    body := jsonb_build_object('type', TG_OP, 'table', 'orders', 'schema', 'public', 'record', to_jsonb(new), 'old_record', null)
  );
  return new;
end $$;
revoke all on function public.notify_order_webhook_fn() from public, anon, authenticated;

-- ============ 4) fortnightly cron -> newcoming (Telegram digest), secret from vault ============
create or replace function public.invoke_newcoming_review() returns void
language plpgsql security definer set search_path = public as $$
declare
  secret text := public.order_webhook_secret();
begin
  if secret is null or secret = '' then
    raise notice 'newcoming cron skipped: order_webhook_secret missing in vault';
    return;
  end if;
  perform net.http_post(
    url := 'https://ucciqthwxnlkjalwlhvh.supabase.co/functions/v1/newcoming',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', secret),
    body := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 8000
  );
end $$;
revoke all on function public.invoke_newcoming_review() from public, anon, authenticated;

-- ============ 5) future functions in public are private by default ============
-- Supabase grants EXECUTE to anon/authenticated/service_role on new postgres-owned
-- functions. Nothing in the app calls an RPC, so new functions start closed;
-- grant service_role explicitly where an edge function needs one.
alter default privileges for role postgres in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;

-- ============ verify (read-only) ============
-- select name from vault.secrets;                       -> order_webhook_secret
-- select pg_get_functiondef('public.notify_order_webhook_fn'::regproc) !~ 'x-webhook-secret'',''[A-Za-z0-9]';  -> true (no literal)
-- select public.invoke_newcoming_review();  then  select status_code from net._http_response order by id desc limit 1;  -> 200
