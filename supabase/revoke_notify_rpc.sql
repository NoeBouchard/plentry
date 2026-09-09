-- Trigger-only: clients must not call this via PostgREST RPC.
-- Triggers still fire as the table owner (SECURITY DEFINER).

revoke execute on function public.notify_order_webhook_fn() from public, anon, authenticated;

-- Concierge launch does not use free-beta (payment_status none). Keep Telegram
-- only when a card hold is authorized.
drop trigger if exists notify_order_webhook on public.orders;
drop trigger if exists notify_order_freebeta_webhook on public.orders;
