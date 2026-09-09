-- Plentry — payment support on orders + notify triggers.
-- SAFE TO RE-RUN. Applied to the live DB on 6 Jul 2026 (via Management API);
-- kept here so the repo mirrors the database.
--
-- payment_status lifecycle:
--   'none'       free-beta order (no Stripe configured) — notify fires on INSERT
--   'unpaid'     checkout session created, user not paid yet — NO notification
--   'authorized' card held (estimate +15%) — notification fires HERE
--   'captured'   exact store total captured after fulfilment
--   'canceled'   hold released / session abandoned

alter table public.orders add column if not exists payment_status text default 'none';
alter table public.orders add column if not exists payment_intent text;
alter table public.orders add column if not exists amount_held numeric;
alter table public.orders add column if not exists amount_captured numeric;
alter table public.orders add column if not exists address jsonb;

-- Webhook plumbing (pg_net). The live function embeds the real ORDER_WEBHOOK_SECRET;
-- replace the placeholder if re-applying by hand.
create extension if not exists pg_net;

create or replace function public.notify_order_webhook_fn() returns trigger
language plpgsql security definer set search_path=public as $fn$
begin
  perform net.http_post(
    url:='https://ucciqthwxnlkjalwlhvh.supabase.co/functions/v1/notify-order',
    headers:=jsonb_build_object('Content-Type','application/json','x-webhook-secret','<ORDER_WEBHOOK_SECRET>'),
    body:=jsonb_build_object('type',TG_OP,'table','orders','schema','public','record',to_jsonb(new),'old_record',null)
  );
  return new;
end $fn$;

-- Free-beta orders (no payment): notify immediately on insert.
drop trigger if exists notify_order_webhook on public.orders;
create trigger notify_order_webhook
  after insert on public.orders
  for each row
  when (new.payment_status is null or new.payment_status = 'none')
  execute function public.notify_order_webhook_fn();

-- Paid orders: notify only when the card hold succeeds.
drop trigger if exists notify_order_paid_webhook on public.orders;
create trigger notify_order_paid_webhook
  after update on public.orders
  for each row
  when (old.payment_status is distinct from new.payment_status and new.payment_status = 'authorized')
  execute function public.notify_order_webhook_fn();

-- Free-beta fallback when Stripe is unconfigured: the app inserts 'unpaid'
-- and the pay fn downgrades to 'none' -> notify then.
drop trigger if exists notify_order_freebeta_webhook on public.orders;
create trigger notify_order_freebeta_webhook
  after update on public.orders
  for each row
  when (old.payment_status = 'unpaid' and new.payment_status = 'none')
  execute function public.notify_order_webhook_fn();

-- 8 Sep 2026: concierge no longer uses free-beta. See revoke_notify_rpc.sql
-- (applied live): RPC revoked; insert/free-beta triggers dropped; paid trigger kept.
