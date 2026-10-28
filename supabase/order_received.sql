-- PENDING, not applied
-- Plentry — customer receipt. An order is complete when received_confirmed_at
-- is set. Paste this file into the Supabase SQL editor, or run it with
-- execute_sql. Do not move it into supabase/migrations/. This repo has no
-- migrations folder; a file placed there can auto-apply on merge.
--
-- One transaction. Idempotent: columns IF NOT EXISTS, constraints replaced,
-- functions replaced, the cron job unscheduled when that name exists and
-- then scheduled again.
--
-- Status values stay new | ordered | delivered. This file does not replace
-- validate_order. delivered_at is stamped when status becomes delivered.
-- If status moves away before anyone confirms, delivered_at is cleared.
-- If status moves away after received_confirmed_at is set, the update raises.
--
-- Direct writes to delivered_at, received_confirmed_at, and
-- received_confirmed_by raise. The stamp trigger and the functions below
-- are the writers. The functions set the transaction-local flag
-- plentry.receipt_write with set_config(..., true).
--
-- This file does not GRANT or REVOKE table or column rights. authenticated
-- keeps UPDATE on status, delivery_slot, and issue_status when
-- orders_capture_split.sql has been applied. anon keeps none from this file.
--
-- An open issue is issue_status = 'open' (the only open value used by the
-- app and by orders_issue_status_sane). null and 'resolved' do not pause
-- auto-complete. Resolving an issue does not restart the 48 hour clock:
-- the next sweep completes the order when delivered_at is already 48 hours
-- old. There is no issue-resolved timestamp.
--
-- Backfill (below, marked): every order that is already status = 'delivered'
-- and still has received_confirmed_at null is marked received_confirmed_by
-- = 'backfill'. That covers historic delivered orders, including #31, #38,
-- and #39, without hardcoding ids. Those customers do not see
-- "Did it all arrive?". PR #34's completion-email backfill must treat these
-- rows as already emailed or skipped, so applying that file does not send
-- a surprise email.
--
-- Rollback is commented after COMMIT. It is not part of this run.

begin;

alter table public.orders add column if not exists delivered_at timestamptz;
alter table public.orders add column if not exists received_confirmed_at timestamptz;
alter table public.orders add column if not exists received_confirmed_by text;

alter table public.orders drop constraint if exists orders_received_confirmed_by_check;
alter table public.orders add constraint orders_received_confirmed_by_check
  check (
    received_confirmed_by is null
    or received_confirmed_by in ('customer', 'auto', 'ops', 'backfill')
  );

alter table public.orders drop constraint if exists orders_received_confirmed_pair_check;
alter table public.orders add constraint orders_received_confirmed_pair_check
  check (
    (received_confirmed_at is null and received_confirmed_by is null)
    or (received_confirmed_at is not null and received_confirmed_by is not null)
  );

create or replace function public.orders_receipt_reset() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $fn$
begin
  new.delivered_at := null;
  new.received_confirmed_at := null;
  new.received_confirmed_by := null;
  return new;
end
$fn$;

revoke all on function public.orders_receipt_reset() from public, anon, authenticated;

drop trigger if exists orders_receipt_insert on public.orders;
create trigger orders_receipt_insert
  before insert on public.orders
  for each row execute function public.orders_receipt_reset();

create or replace function public.orders_receipt_stamp() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $fn$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' and new.delivered_at is null then
    new.delivered_at := now();
  elsif old.status = 'delivered' and new.status is distinct from 'delivered' then
    if old.received_confirmed_at is not null then
      raise exception 'cannot change status after the order is received';
    end if;
    new.delivered_at := null;
  end if;
  return new;
end
$fn$;

revoke all on function public.orders_receipt_stamp() from public, anon, authenticated;

drop trigger if exists orders_receipt_stamp on public.orders;
create trigger orders_receipt_stamp
  before update on public.orders
  for each row execute function public.orders_receipt_stamp();

create or replace function public.orders_receipt_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $fn$
begin
  if current_setting('plentry.receipt_write', true) is distinct from '1' then
    raise exception 'receipt columns are server-owned' using errcode = '42501';
  end if;
  return new;
end
$fn$;

revoke all on function public.orders_receipt_guard() from public, anon, authenticated;

drop trigger if exists orders_receipt_guard on public.orders;
create trigger orders_receipt_guard
  before update of delivered_at, received_confirmed_at, received_confirmed_by
  on public.orders
  for each row execute function public.orders_receipt_guard();

create or replace function public.confirm_order_received(p_order_id bigint)
returns timestamptz
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  v_at timestamptz;
begin
  perform set_config('plentry.receipt_write', '1', true);
  update public.orders
    set received_confirmed_at = now(),
        received_confirmed_by = 'customer'
    where id = p_order_id
      and user_id = auth.uid()
      and status = 'delivered'
      and received_confirmed_at is null
    returning received_confirmed_at into v_at;
  if not found then
    raise exception 'order cannot be confirmed';
  end if;
  perform set_config('plentry.receipt_write', '', true);
  return v_at;
end
$fn$;

revoke all on function public.confirm_order_received(bigint) from public, anon, authenticated;
grant execute on function public.confirm_order_received(bigint) to authenticated;

create or replace function public.admin_mark_received(p_order_id bigint)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  v_at timestamptz;
begin
  if not coalesce(public.is_admin_aal2(), false) then
    raise exception 'admin only' using errcode = '42501';
  end if;
  perform set_config('plentry.receipt_write', '1', true);
  update public.orders
    set received_confirmed_at = now(),
        received_confirmed_by = 'ops'
    where id = p_order_id
      and status = 'delivered'
      and received_confirmed_at is null
    returning received_confirmed_at into v_at;
  if not found then
    raise exception 'order cannot be marked received';
  end if;
  perform set_config('plentry.receipt_write', '', true);
end
$fn$;

revoke all on function public.admin_mark_received(bigint) from public, anon, authenticated;
grant execute on function public.admin_mark_received(bigint) to authenticated;

create or replace function public.auto_complete_orders()
returns int
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  n int;
begin
  perform set_config('plentry.receipt_write', '1', true);
  update public.orders
    set received_confirmed_at = now(),
        received_confirmed_by = 'auto'
    where status = 'delivered'
      and received_confirmed_at is null
      and delivered_at <= now() - interval '48 hours'
      and issue_status is distinct from 'open';
  get diagnostics n = row_count;
  perform set_config('plentry.receipt_write', '', true);
  return n;
end
$fn$;

revoke all on function public.auto_complete_orders() from public, anon, authenticated;

do $cron$
begin
  begin
    if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
      create extension if not exists pg_cron with schema pg_catalog;
    end if;
  exception when others then
    raise notice 'pg_cron not enabled: %', SQLERRM;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'plentry_auto_complete') then
      perform cron.unschedule('plentry_auto_complete');
    end if;
    perform cron.schedule(
      'plentry_auto_complete',
      '*/15 * * * *',
      $job$select public.auto_complete_orders()$job$
    );
  end if;
end
$cron$;

-- ===== Backfill (apply-time) =====
-- Generic. Every delivered order that is not yet confirmed, including
-- historic #31, #38, and #39 when they are still delivered and unconfirmed.
-- received_confirmed_by = 'backfill'. PR #34's completion-email backfill
-- must treat these rows as already emailed or skipped.
do $backfill$
begin
  perform set_config('plentry.receipt_write', '1', true);
  update public.orders
    set received_confirmed_at = now(),
        received_confirmed_by = 'backfill'
    where status = 'delivered'
      and received_confirmed_at is null;
  perform set_config('plentry.receipt_write', '', true);
end
$backfill$;

commit;

-- Rollback (not applied by this file). Unschedule the job, drop the
-- functions and triggers, then drop the columns:
--   select cron.unschedule('plentry_auto_complete');
--   drop trigger if exists orders_receipt_guard on public.orders;
--   drop trigger if exists orders_receipt_stamp on public.orders;
--   drop trigger if exists orders_receipt_insert on public.orders;
--   drop function if exists public.orders_receipt_guard();
--   drop function if exists public.orders_receipt_stamp();
--   drop function if exists public.orders_receipt_reset();
--   drop function if exists public.auto_complete_orders();
--   drop function if exists public.admin_mark_received(bigint);
--   drop function if exists public.confirm_order_received(bigint);
--   alter table public.orders drop constraint if exists orders_received_confirmed_pair_check;
--   alter table public.orders drop constraint if exists orders_received_confirmed_by_check;
--   alter table public.orders drop column if exists received_confirmed_by;
--   alter table public.orders drop column if exists received_confirmed_at;
--   alter table public.orders drop column if exists delivered_at;
