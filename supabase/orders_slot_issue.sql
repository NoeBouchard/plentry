-- Plentry — promised delivery window + issue threads (21 Sep 2026).
-- SAFE TO RE-RUN.
--
-- Customer picks slot_date / slot_start / slot_end at checkout (INSERT).
-- Ops confirms that exact window (writes delivery_slot snapshot + status ordered)
-- or messages the customer. INSERT still forces delivery_slot null (existing guard).
--
-- Apply on live after npm test. Founder aal2 policies already cover orders UPDATE.

alter table public.orders add column if not exists slot_date date;
alter table public.orders add column if not exists slot_start time;
alter table public.orders add column if not exists slot_end time;
alter table public.orders add column if not exists issue_status text;

alter table public.orders drop constraint if exists orders_issue_status_sane;
alter table public.orders add constraint orders_issue_status_sane
  check (issue_status is null or issue_status in ('open', 'resolved'));

alter table public.orders drop constraint if exists orders_slot_window_sane;
alter table public.orders add constraint orders_slot_window_sane
  check (
    (slot_date is null and slot_start is null and slot_end is null)
    or (
      slot_date is not null
      and slot_start is not null
      and slot_end is not null
      and slot_end = slot_start + interval '2 hours'
      and extract(minute from slot_start) = 0
      and extract(hour from slot_start) in (8, 10, 12, 14, 16, 18, 20)
    )
  );

alter table public.orders drop constraint if exists orders_slot_lead_sane;
alter table public.orders add constraint orders_slot_lead_sane
  check (
    slot_date is null
    or slot_date >= ((created_at at time zone 'Europe/London')::date + 3)
  );

create table if not exists public.order_messages (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders(id) on delete cascade,
  author_role text not null check (author_role in ('customer', 'ops')),
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.order_messages drop constraint if exists order_messages_body_sane;
alter table public.order_messages add constraint order_messages_body_sane
  check (length(body) between 1 and 1000 and body !~ '[<>]');

create index if not exists order_messages_order_id_created_at
  on public.order_messages (order_id, created_at);

alter table public.order_messages enable row level security;

drop policy if exists "select own order messages" on public.order_messages;
create policy "select own order messages" on public.order_messages
  for select using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  );

drop policy if exists "insert own order messages" on public.order_messages;
create policy "insert own order messages" on public.order_messages
  for insert with check (
    author_role = 'customer'
    and exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  );

drop policy if exists "admin select order messages" on public.order_messages;
create policy "admin select order messages" on public.order_messages
  for select using (public.is_founder_aal2());

drop policy if exists "admin insert order messages" on public.order_messages;
create policy "admin insert order messages" on public.order_messages
  for insert with check (public.is_founder_aal2() and author_role = 'ops');

revoke all on table public.order_messages from public, anon;
grant select, insert on table public.order_messages to authenticated;

create or replace function public.order_messages_open_issue() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.orders set issue_status = 'open' where id = new.order_id;
  return new;
end $$;
revoke all on function public.order_messages_open_issue() from public, anon, authenticated;

drop trigger if exists order_messages_open_issue on public.order_messages;
create trigger order_messages_open_issue
  after insert on public.order_messages
  for each row execute function public.order_messages_open_issue();

-- Telegram ping on a customer issue message (same vault secret as orders).
create or replace function public.notify_issue_webhook_fn() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  secret text := public.order_webhook_secret();
begin
  if new.author_role is distinct from 'customer' then return new; end if;
  if secret is null or secret = '' then
    raise warning 'notify_issue_webhook_fn: order_webhook_secret missing in vault - Telegram skipped';
    return new;
  end if;
  perform net.http_post(
    url := 'https://ucciqthwxnlkjalwlhvh.supabase.co/functions/v1/notify-order',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', secret),
    body := jsonb_build_object('type', TG_OP, 'table', 'order_messages', 'schema', 'public', 'record', to_jsonb(new))
  );
  return new;
end $$;
revoke all on function public.notify_issue_webhook_fn() from public, anon, authenticated;

drop trigger if exists notify_issue_webhook on public.order_messages;
create trigger notify_issue_webhook
  after insert on public.order_messages
  for each row execute function public.notify_issue_webhook_fn();
