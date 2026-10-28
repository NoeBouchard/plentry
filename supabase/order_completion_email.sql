-- Plentry — order completion email (step 1). PENDING, not applied.
-- Requires supabase/order_received.sql applied first. That file adds
-- delivered_at, received_confirmed_at, and received_confirmed_by. This file
-- does not add those columns and does not run if they are missing.
-- Loose SQL. Paste this file in the Supabase SQL editor and run it there,
-- after order_received.sql. Do not move it into supabase/migrations/. This
-- repo has no migrations folder; a file placed there can auto-apply on merge.
--
-- One transaction. Re-runnable: columns IF NOT EXISTS, functions replaced,
-- the cron job inserted only when that job name is missing.
--
-- Backfill: every orders row that already has received_confirmed_at set,
-- payment_status = 'captured', and completion_email_status null is set to
-- 'skipped'. That includes rows order_received.sql marked
-- received_confirmed_by = 'backfill'. A backfill row is never emailed: the
-- sweep marks one skipped, and claim will not take it. On the first run the
-- email column is new, so every order already received and captured is
-- skipped and past customers are not emailed. A re-run does not change a row
-- that already has a status (sent, failed, sending, skipped). It does skip
-- a captured, already-received row that is still null. Do not re-run after
-- the first real completion email unless that is what you want.
--
-- The completion_email_* columns are service-owned. The guard allows
-- service_role, postgres, supabase_admin, and any superuser (the SQL editor
-- and a SECURITY DEFINER function owned by that role). Admin status updates
-- do not touch these columns, so they still succeed. A non-service INSERT
-- has those six columns reset to their defaults. A service-role INSERT keeps
-- the values it wrote. The backfill is an UPDATE and still runs.
--
-- The trigger reads the same Vault secret as notify-order
-- (public.order_webhook_secret(), from supabase/webhook_secret_vault.sql).
-- It does not copy the secret into this file.
--
-- completion_email_config is one row. It counts consecutive Resend 401/403
-- releases across every order. The third one asks for a single Telegram
-- alert. Later failures in that streak do not. A successful send resets the
-- row. There is no time cooldown. The Telegram token stays in the function
-- env, not in this file. This file revokes the table from public, anon, and
-- authenticated and grants select and update to service_role. That grant
-- does not remove insert, delete, or the other privileges. On Supabase,
-- default privileges already give service_role full access to a new table
-- in public. Row security is on and there is no policy, so anon and
-- authenticated cannot read it.
--
-- Rollback is commented at the bottom. It is not part of this run.

begin;

alter table public.orders
  add column if not exists completion_email_status text,
  add column if not exists completion_email_claimed_at timestamptz,
  add column if not exists completion_email_sent_at timestamptz,
  add column if not exists completion_email_attempts integer not null default 0,
  add column if not exists completion_email_error text,
  add column if not exists completion_email_message_id text;

do $chk$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_completion_email_status_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_completion_email_status_check
      check (
        completion_email_status is null
        or completion_email_status in ('sending', 'sent', 'failed', 'skipped')
      );
  end if;
end
$chk$;

-- Fires only when one of these columns is in the SET list, so an admin
-- update of status alone does not enter the function.
create or replace function public.guard_completion_email_columns()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  if exists (select 1 from pg_roles where rolname = current_user and rolsuper) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.completion_email_status := null;
    new.completion_email_claimed_at := null;
    new.completion_email_sent_at := null;
    new.completion_email_attempts := 0;
    new.completion_email_error := null;
    new.completion_email_message_id := null;
    return new;
  end if;
  raise exception 'completion email columns are service-owned'
    using errcode = '42501';
end
$fn$;

revoke all on function public.guard_completion_email_columns() from public, anon, authenticated;

drop trigger if exists orders_completion_email_guard on public.orders;
create trigger orders_completion_email_guard
  before insert or update of
    completion_email_status,
    completion_email_claimed_at,
    completion_email_sent_at,
    completion_email_attempts,
    completion_email_error,
    completion_email_message_id
  on public.orders
  for each row
  execute function public.guard_completion_email_columns();

-- Single conditional UPDATE ... RETURNING. A second UPDATE marks an
-- otherwise-eligible order with no recipient as skipped ('no recipient').
create or replace function public.claim_completion_email(p_order_id bigint)
returns table (
  id bigint,
  email text,
  address jsonb,
  delivery_slot text,
  slot_date date,
  slot_start time,
  slot_end time,
  amount_captured numeric,
  completion_email_attempts integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  return query
  update public.orders o
  set completion_email_status = 'sending',
      completion_email_claimed_at = now(),
      completion_email_attempts = o.completion_email_attempts + 1,
      completion_email_error = null
  where o.id = p_order_id
    and o.received_confirmed_at is not null
    and o.payment_status = 'captured'
    and o.amount_captured is not null
    and o.received_confirmed_by is distinct from 'backfill'
    and coalesce(nullif(btrim(o.email), ''), nullif(btrim(o.address->>'email'), '')) is not null
    and (
      o.completion_email_status is null
      or (o.completion_email_status = 'failed' and o.completion_email_attempts < 5)
      or (
        o.completion_email_status = 'sending'
        and o.completion_email_attempts < 5
        and o.completion_email_claimed_at < now() - interval '15 minutes'
      )
    )
  returning
    o.id,
    o.email,
    o.address,
    o.delivery_slot,
    o.slot_date,
    o.slot_start,
    o.slot_end,
    o.amount_captured,
    o.completion_email_attempts;

  update public.orders o
  set completion_email_status = 'skipped',
      completion_email_error = 'no recipient'
  where o.id = p_order_id
    and o.received_confirmed_at is not null
    and o.payment_status = 'captured'
    and o.amount_captured is not null
    and o.received_confirmed_by is distinct from 'backfill'
    and coalesce(nullif(btrim(o.email), ''), nullif(btrim(o.address->>'email'), '')) is null
    and (
      o.completion_email_status is null
      or (o.completion_email_status = 'failed' and o.completion_email_attempts < 5)
      or (
        o.completion_email_status = 'sending'
        and o.completion_email_attempts < 5
        and o.completion_email_claimed_at < now() - interval '15 minutes'
      )
    );
end
$fn$;

revoke all on function public.claim_completion_email(bigint) from public, anon, authenticated;
grant execute on function public.claim_completion_email(bigint) to service_role;

drop function if exists public.mark_completion_email(bigint, boolean, text, text, boolean);

create or replace function public.mark_completion_email(
  p_order_id bigint,
  p_ok boolean,
  p_message_id text,
  p_error text,
  p_skipped boolean default false,
  p_terminal boolean default false
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if p_skipped then
    update public.orders
    set completion_email_status = 'skipped',
        completion_email_error = coalesce(nullif(btrim(p_error), ''), 'no recipient'),
        completion_email_message_id = null
    where id = p_order_id
      and completion_email_status is distinct from 'sent';
    return;
  end if;
  if p_ok then
    update public.orders
    set completion_email_status = 'sent',
        completion_email_sent_at = now(),
        completion_email_message_id = nullif(btrim(p_message_id), ''),
        completion_email_error = null
    where id = p_order_id
      and completion_email_status = 'sending';
    return;
  end if;
  update public.orders
  set completion_email_status = 'failed',
      completion_email_error = left(coalesce(nullif(btrim(p_error), ''), 'send failed'), 500),
      completion_email_message_id = null,
      completion_email_attempts = case
        when p_terminal then greatest(completion_email_attempts, 5)
        else completion_email_attempts
      end
  where id = p_order_id
    and completion_email_status = 'sending';
end
$fn$;

revoke all on function public.mark_completion_email(bigint, boolean, text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.mark_completion_email(bigint, boolean, text, text, boolean, boolean) to service_role;

-- Undo a claim that must not count: missing Resend config after a send, or a
-- 409 concurrent_idempotent_requests. Status returns to null and attempts drop by one.
create or replace function public.release_completion_email(p_order_id bigint)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  update public.orders
  set completion_email_status = null,
      completion_email_claimed_at = null,
      completion_email_error = null,
      completion_email_attempts = greatest(completion_email_attempts - 1, 0)
  where id = p_order_id
    and completion_email_status = 'sending';
end
$fn$;

revoke all on function public.release_completion_email(bigint) from public, anon, authenticated;
grant execute on function public.release_completion_email(bigint) to service_role;

-- One row. fail_streak counts 401/403 releases. alerted stays true from the
-- alert until a successful send clears it. This file revokes the table from
-- public, anon, and authenticated and grants select and update to
-- service_role. That grant does not remove insert or delete. On Supabase,
-- default privileges already give service_role full access to a new table
-- in public. The functions below do the writes as the owner.
create table if not exists public.completion_email_config (
  id smallint primary key default 1,
  fail_streak integer not null default 0,
  alerted boolean not null default false,
  constraint completion_email_config_singleton check (id = 1)
);

insert into public.completion_email_config (id)
values (1)
on conflict (id) do nothing;

alter table public.completion_email_config enable row level security;

revoke all on table public.completion_email_config from public, anon, authenticated;
grant select, update on table public.completion_email_config to service_role;

-- Increments the streak. alert is true only on the failure that reaches 3
-- while this streak has not already alerted. That call sets alerted, so the
-- next failure in the streak returns alert false.
create or replace function public.note_completion_email_config_failure()
returns table (streak integer, alert boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  prev_streak integer;
  prev_alerted boolean;
  next_streak integer;
  fire boolean;
begin
  select c.fail_streak, c.alerted
    into prev_streak, prev_alerted
  from public.completion_email_config c
  where c.id = 1
  for update;

  if not found then
    insert into public.completion_email_config (id, fail_streak, alerted)
    values (1, 0, false);
    prev_streak := 0;
    prev_alerted := false;
  end if;

  next_streak := prev_streak + 1;
  fire := next_streak >= 3 and not prev_alerted;

  update public.completion_email_config
  set fail_streak = next_streak,
      alerted = prev_alerted or fire
  where id = 1;

  streak := next_streak;
  alert := fire;
  return next;
end
$fn$;

revoke all on function public.note_completion_email_config_failure() from public, anon, authenticated;
grant execute on function public.note_completion_email_config_failure() to service_role;

-- A successful Resend send, customer or test. Re-arms the alert. No timer.
create or replace function public.note_completion_email_config_success()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  insert into public.completion_email_config (id, fail_streak, alerted)
  values (1, 0, false)
  on conflict (id) do update
  set fail_streak = 0,
      alerted = false;
end
$fn$;

revoke all on function public.note_completion_email_config_success() from public, anon, authenticated;
grant execute on function public.note_completion_email_config_success() to service_role;

-- Telegram did not accept the alert. The streak stays. The next 401/403 can alert.
create or replace function public.rearm_completion_email_config_alert()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  update public.completion_email_config
  set alerted = false
  where id = 1;
end
$fn$;

revoke all on function public.rearm_completion_email_config_alert() from public, anon, authenticated;
grant execute on function public.rearm_completion_email_config_alert() to service_role;

create or replace function public.notify_order_completion_email_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  secret text := public.order_webhook_secret();
begin
  if secret is null or secret = '' then
    raise warning 'notify_order_completion_email_fn: order_webhook_secret missing in vault - email skipped';
    return new;
  end if;
  perform net.http_post(
    url := 'https://ucciqthwxnlkjalwlhvh.supabase.co/functions/v1/order-email',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', secret),
    body := jsonb_build_object('order_id', new.id)
  );
  return new;
end
$fn$;

revoke all on function public.notify_order_completion_email_fn() from public, anon, authenticated;

drop trigger if exists notify_order_completion_email on public.orders;
create trigger notify_order_completion_email
  after update of received_confirmed_at on public.orders
  for each row
  when (
    old.received_confirmed_at is null
    and new.received_confirmed_at is not null
    and new.payment_status = 'captured'
  )
  execute function public.notify_order_completion_email_fn();

-- Same eligibility as claim_completion_email, including a null recipient
-- (the claim marks that row skipped). Does not select sent or skipped.
-- A received_confirmed_by = 'backfill' row is marked skipped and is not posted.
create or replace function public.sweep_completion_emails()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  secret text := public.order_webhook_secret();
  r record;
begin
  update public.orders o
  set completion_email_status = 'skipped',
      completion_email_error = 'backfill: receipt backfill is not emailed'
  where o.received_confirmed_at is not null
    and o.payment_status = 'captured'
    and o.received_confirmed_by = 'backfill'
    and o.completion_email_status is distinct from 'sent'
    and o.completion_email_status is distinct from 'skipped';

  if secret is null or secret = '' then
    raise notice 'order-email sweep skipped: order_webhook_secret missing in vault';
    return;
  end if;
  for r in
    select o.id
    from public.orders o
    where o.received_confirmed_at is not null
      and o.payment_status = 'captured'
      and o.amount_captured is not null
      and o.received_confirmed_by is distinct from 'backfill'
      and (
        o.completion_email_status is null
        or (o.completion_email_status = 'failed' and o.completion_email_attempts < 5)
        or (
          o.completion_email_status = 'sending'
          and o.completion_email_attempts < 5
          and o.completion_email_claimed_at < now() - interval '15 minutes'
        )
      )
  loop
    perform net.http_post(
      url := 'https://ucciqthwxnlkjalwlhvh.supabase.co/functions/v1/order-email',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', secret),
      body := jsonb_build_object('order_id', r.id)
    );
  end loop;
end
$fn$;

revoke all on function public.sweep_completion_emails() from public, anon, authenticated;

do $ext$
begin
  create extension if not exists pg_cron with schema pg_catalog;
exception when others then
  raise notice 'pg_cron not enabled: %', SQLERRM;
end
$ext$;

do $job$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'plentry-order-email-sweep') then
      perform cron.schedule(
        'plentry-order-email-sweep',
        '*/15 * * * *',
        $cron$select public.sweep_completion_emails()$cron$
      );
    end if;
  end if;
exception when others then
  raise notice 'order-email sweep cron not scheduled: %', SQLERRM;
end
$job$;

update public.orders
set completion_email_status = 'skipped',
    completion_email_error = case
      when received_confirmed_by = 'backfill' then 'backfill: receipt backfill is not emailed'
      else 'backfill: received before completion email'
    end
where received_confirmed_at is not null
  and payment_status = 'captured'
  and completion_email_status is null;

commit;

-- -------- rollback (commented, not applied) --------
-- begin;
-- select cron.unschedule('plentry-order-email-sweep');
-- drop trigger if exists notify_order_completion_email on public.orders;
-- drop trigger if exists orders_completion_email_guard on public.orders;
-- drop function if exists public.sweep_completion_emails();
-- drop function if exists public.notify_order_completion_email_fn();
-- drop function if exists public.rearm_completion_email_config_alert();
-- drop function if exists public.note_completion_email_config_success();
-- drop function if exists public.note_completion_email_config_failure();
-- drop table if exists public.completion_email_config;
-- drop function if exists public.release_completion_email(bigint);
-- drop function if exists public.mark_completion_email(bigint, boolean, text, text, boolean, boolean);
-- drop function if exists public.mark_completion_email(bigint, boolean, text, text, boolean);
-- drop function if exists public.claim_completion_email(bigint);
-- drop function if exists public.guard_completion_email_columns();
-- alter table public.orders drop constraint if exists orders_completion_email_status_check;
-- alter table public.orders
--   drop column if exists completion_email_status,
--   drop column if exists completion_email_claimed_at,
--   drop column if exists completion_email_sent_at,
--   drop column if exists completion_email_attempts,
--   drop column if exists completion_email_error,
--   drop column if exists completion_email_message_id;
-- commit;
