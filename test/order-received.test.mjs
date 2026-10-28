// I-O19 — order_received.sql on PGlite only. The file was applied to prod on 28 Oct 2026 ~15:35:50 GMT; this test never touches prod.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const sql = readFileSync(new URL("../supabase/order_received.sql", import.meta.url), "utf8");
const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const FIXTURE = `
  create role anon nologin;
  create role authenticated nologin;
  create schema if not exists auth;
  create or replace function auth.uid() returns uuid
    language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create or replace function public.is_admin_aal2() returns boolean
    language sql stable
    as $$ select current_setting('plentry.test_admin', true) = '1' $$;
  create table public.orders (
    id bigint generated always as identity primary key,
    user_id uuid,
    email text,
    status text,
    issue_status text,
    delivery_slot text
  );
  revoke all on table public.orders from public, anon, authenticated;
  grant usage on schema public to anon, authenticated;
  grant update (status, delivery_slot, issue_status) on table public.orders to authenticated;
`;

async function privilege(db, statement) {
  const { rows } = await db.query(statement);
  return rows[0].ok === true || rows[0].ok === "t";
}

async function flagUpdate(db, statement) {
  await db.exec("select set_config('plentry.receipt_write', '1', false)");
  try {
    await db.exec(statement);
  } finally {
    await db.exec("select set_config('plentry.receipt_write', '', false)");
  }
}

describe("I-O19 order receipt (PGlite)", () => {
  it("I-O19 backfill is generic, insert resets, the stamp and guard hold, and a confirmed order cannot leave delivered", async () => {
    const db = new PGlite();
    await db.exec(FIXTURE);
    await db.exec(`
      insert into public.orders (user_id, email, status) values
        ('${ME}', 'historic@x.com', 'delivered'),
        ('${OTHER}', 'mid@x.com', 'ordered')
    `);
    await db.exec(sql);

    const filled = await db.query(`
      select email, status, delivered_at, received_confirmed_at, received_confirmed_by
      from public.orders order by id
    `);
    assert.equal(filled.rows[0].received_confirmed_by, "backfill");
    assert.ok(filled.rows[0].received_confirmed_at);
    assert.equal(filled.rows[1].received_confirmed_at, null);
    assert.equal(filled.rows[1].received_confirmed_by, null);
    assert.equal(filled.rows[1].status, "ordered");

    await db.exec(`
      insert into public.orders (user_id, email, status, delivered_at, received_confirmed_at, received_confirmed_by)
      values ('${ME}', 'new@x.com', 'new', now(), now(), 'customer')
    `);
    const born = await db.query(`
      select id, status, delivered_at, received_confirmed_at, received_confirmed_by
      from public.orders where email = 'new@x.com'
    `);
    const id = born.rows[0].id;
    assert.equal(born.rows[0].status, "new");
    assert.equal(born.rows[0].delivered_at, null);
    assert.equal(born.rows[0].received_confirmed_at, null);
    assert.equal(born.rows[0].received_confirmed_by, null);

    await db.exec(`update public.orders set status = 'delivered' where id = ${id}`);
    const stamped = await db.query(`select delivered_at, received_confirmed_at from public.orders where id = ${id}`);
    assert.ok(stamped.rows[0].delivered_at);
    assert.equal(stamped.rows[0].received_confirmed_at, null);
    await assert.rejects(
      () => db.query(`update public.orders set delivered_at = now() - interval '1 day' where id = ${id}`),
      /receipt columns are server-owned/,
    );

    await db.exec(`update public.orders set status = 'ordered' where id = ${id}`);
    const cleared = await db.query(`select status, delivered_at from public.orders where id = ${id}`);
    assert.equal(cleared.rows[0].status, "ordered");
    assert.equal(cleared.rows[0].delivered_at, null);

    await db.exec(`update public.orders set status = 'delivered' where id = ${id}`);
    await db.exec(`select set_config('request.jwt.claim.sub', '${OTHER}', false)`);
    await assert.rejects(() => db.query(`select public.confirm_order_received(${id})`), /order cannot be confirmed/);
    await db.exec(`select set_config('request.jwt.claim.sub', '${ME}', false)`);
    const confirmed = await db.query(`select public.confirm_order_received(${id}) as at`);
    assert.ok(confirmed.rows[0].at);
    const row = await db.query(`select received_confirmed_by, delivered_at from public.orders where id = ${id}`);
    assert.equal(row.rows[0].received_confirmed_by, "customer");
    const stampedAt = row.rows[0].delivered_at;
    await assert.rejects(
      () => db.query(`update public.orders set status = 'ordered' where id = ${id}`),
      /cannot change status after the order is received/,
    );
    const stuck = await db.query(`select status, delivered_at, received_confirmed_by from public.orders where id = ${id}`);
    assert.equal(stuck.rows[0].status, "delivered");
    assert.equal(String(stuck.rows[0].delivered_at), String(stampedAt));
    assert.equal(stuck.rows[0].received_confirmed_by, "customer");

    await assert.rejects(
      () => db.query(`select public.confirm_order_received(${id})`),
      /order cannot be confirmed/,
    );
    await db.exec("select set_config('plentry.test_admin', '', false)");
    await assert.rejects(() => db.query(`select public.admin_mark_received(${id})`), /admin only|order cannot be marked received/);

    await db.exec(sql);
    const again = await db.query(`select received_confirmed_by from public.orders where email = 'historic@x.com'`);
    assert.equal(again.rows[0].received_confirmed_by, "backfill");
    await db.close();
  });

  it("I-O19 auto-complete waits 48 hours, pauses while issue_status is open, and does not restart the clock", async () => {
    const db = new PGlite();
    await db.exec(FIXTURE);
    await db.exec(sql);
    await db.exec(`
      insert into public.orders (user_id, email, status, issue_status) values
        ('${ME}', 'soon@x.com', 'new', null),
        ('${ME}', 'open@x.com', 'new', null),
        ('${ME}', 'ready@x.com', 'new', null),
        ('${ME}', 'resolved@x.com', 'new', 'resolved')
    `);
    await db.exec(`update public.orders set status = 'delivered' where email in ('soon@x.com','open@x.com','ready@x.com','resolved@x.com')`);
    const ids = await db.query(`select id, email, delivered_at from public.orders order by id`);
    const byEmail = Object.fromEntries(ids.rows.map((r) => [r.email, r]));
    await flagUpdate(db, `update public.orders set delivered_at = now() - interval '47 hours' where id = ${byEmail["soon@x.com"].id}`);
    await flagUpdate(db, `update public.orders set delivered_at = now() - interval '49 hours', issue_status = 'open' where id = ${byEmail["open@x.com"].id}`);
    await flagUpdate(db, `update public.orders set delivered_at = now() - interval '49 hours' where id = ${byEmail["ready@x.com"].id}`);
    await flagUpdate(db, `update public.orders set delivered_at = now() - interval '49 hours' where id = ${byEmail["resolved@x.com"].id}`);

    const openBefore = await db.query(`select delivered_at from public.orders where email = 'open@x.com'`);
    const first = await db.query(`select public.auto_complete_orders() as n`);
    assert.equal(Number(first.rows[0].n), 2);
    const mid = await db.query(`select email, received_confirmed_by from public.orders order by email`);
    const who = Object.fromEntries(mid.rows.map((r) => [r.email, r.received_confirmed_by]));
    assert.equal(who["soon@x.com"], null);
    assert.equal(who["open@x.com"], null);
    assert.equal(who["ready@x.com"], "auto");
    assert.equal(who["resolved@x.com"], "auto");

    await db.exec(`update public.orders set issue_status = 'resolved' where email = 'open@x.com'`);
    const second = await db.query(`select public.auto_complete_orders() as n`);
    assert.equal(Number(second.rows[0].n), 1);
    const done = await db.query(`select delivered_at, received_confirmed_by, issue_status from public.orders where email = 'open@x.com'`);
    assert.equal(done.rows[0].received_confirmed_by, "auto");
    assert.equal(done.rows[0].issue_status, "resolved");
    assert.equal(String(done.rows[0].delivered_at), String(openBefore.rows[0].delivered_at));
    const soon = await db.query(`select received_confirmed_at from public.orders where email = 'soon@x.com'`);
    assert.equal(soon.rows[0].received_confirmed_at, null);

    const def = await db.query(`select pg_get_functiondef('public.auto_complete_orders()'::regprocedure) as src`);
    assert.match(def.rows[0].src, /interval '48 hours'/);
    assert.match(def.rows[0].src, /issue_status is distinct from 'open'/);
    await db.close();
  });

  it("I-O19 re-apply leaves a live delivery unconfirmed, and auto_complete_orders marks it at 48 hours", async () => {
    const db = new PGlite();
    await db.exec(FIXTURE);
    await db.exec(sql);
    await db.exec(`insert into public.orders (user_id, email, status) values ('${ME}', 'live@x.com', 'new')`);
    await db.exec(`update public.orders set status = 'delivered' where email = 'live@x.com'`);
    const born = await db.query(`select id from public.orders where email = 'live@x.com'`);
    const id = born.rows[0].id;
    await flagUpdate(db, `update public.orders set delivered_at = now() - interval '47 hours' where id = ${id}`);
    const before = await db.query(`select delivered_at, received_confirmed_at, received_confirmed_by from public.orders where id = ${id}`);
    assert.ok(before.rows[0].delivered_at);
    assert.equal(before.rows[0].received_confirmed_at, null);
    await db.exec(sql);
    const after = await db.query(`select status, delivered_at, received_confirmed_at, received_confirmed_by from public.orders where id = ${id}`);
    assert.equal(after.rows[0].status, "delivered");
    assert.equal(after.rows[0].received_confirmed_at, null);
    assert.equal(after.rows[0].received_confirmed_by, null);
    assert.equal(String(after.rows[0].delivered_at), String(before.rows[0].delivered_at));
    const early = await db.query(`select public.auto_complete_orders() as n`);
    assert.equal(Number(early.rows[0].n), 0);
    await flagUpdate(db, `update public.orders set delivered_at = now() - interval '48 hours' where id = ${id}`);
    const done = await db.query(`select public.auto_complete_orders() as n`);
    assert.equal(Number(done.rows[0].n), 1);
    const who = await db.query(`select received_confirmed_by from public.orders where id = ${id}`);
    assert.equal(who.rows[0].received_confirmed_by, "auto");
    await db.close();
  });

  it("I-O19 backfill skips an open issue so that delivered order stays awaiting receipt", async () => {
    const db = new PGlite();
    await db.exec(FIXTURE);
    await db.exec(`
      insert into public.orders (user_id, email, status, issue_status) values
        ('${ME}', 'plain@x.com', 'delivered', null),
        ('${ME}', 'issue@x.com', 'delivered', 'open')
    `);
    await db.exec(sql);
    const rows = await db.query(`select email, delivered_at, received_confirmed_at, received_confirmed_by, issue_status from public.orders order by email`);
    const by = Object.fromEntries(rows.rows.map((r) => [r.email, r]));
    assert.equal(by["plain@x.com"].received_confirmed_by, "backfill");
    assert.ok(by["plain@x.com"].received_confirmed_at);
    assert.equal(by["issue@x.com"].issue_status, "open");
    assert.equal(by["issue@x.com"].delivered_at, null);
    assert.equal(by["issue@x.com"].received_confirmed_at, null);
    assert.equal(by["issue@x.com"].received_confirmed_by, null);
    await db.exec(sql);
    const again = await db.query(`select received_confirmed_at, received_confirmed_by from public.orders where email = 'issue@x.com'`);
    assert.equal(again.rows[0].received_confirmed_at, null);
    assert.equal(again.rows[0].received_confirmed_by, null);
    await db.close();
  });

  it("I-O19 confirm and admin_mark_received are authenticated only; auto_complete is not executable by public, anon, or authenticated; no new column grants", async () => {
    const db = new PGlite();
    await db.exec(FIXTURE);
    await db.exec(sql);

    for (const col of ["delivered_at", "received_confirmed_at", "received_confirmed_by"]) {
      for (const role of ["anon", "authenticated"]) {
        assert.equal(await privilege(db, `select has_column_privilege('${role}','public.orders','${col}','UPDATE') as ok`), false, `${role} update ${col}`);
        assert.equal(await privilege(db, `select has_column_privilege('${role}','public.orders','${col}','INSERT') as ok`), false, `${role} insert ${col}`);
      }
    }
    assert.equal(await privilege(db, `select has_column_privilege('authenticated','public.orders','status','UPDATE') as ok`), true);
    assert.equal(await privilege(db, `select has_column_privilege('authenticated','public.orders','delivery_slot','UPDATE') as ok`), true);
    assert.equal(await privilege(db, `select has_column_privilege('authenticated','public.orders','issue_status','UPDATE') as ok`), true);
    assert.equal(await privilege(db, `select has_table_privilege('anon','public.orders','UPDATE') as ok`), false);
    assert.equal(await privilege(db, `select has_table_privilege('authenticated','public.orders','INSERT') as ok`), false);

    const fns = await db.query(`
      select proname, prosecdef, proconfig
      from pg_proc
      where pronamespace = 'public'::regnamespace
        and proname in ('confirm_order_received','admin_mark_received','auto_complete_orders')
      order by proname
    `);
    assert.equal(fns.rows.length, 3);
    for (const row of fns.rows) {
      assert.equal(row.prosecdef, true, row.proname);
      assert.ok(row.proconfig.some((c) => c.replace(/\s/g, "") === "search_path=public,pg_temp"), row.proconfig.join(" "));
    }

    for (const role of ["public", "anon", "authenticated"]) {
      assert.equal(await privilege(db, `select has_function_privilege('${role}','public.auto_complete_orders()','EXECUTE') as ok`), false, role);
      assert.equal(await privilege(db, `select has_function_privilege('${role}','public.confirm_order_received(bigint)','EXECUTE') as ok`), role === "authenticated", role);
      assert.equal(await privilege(db, `select has_function_privilege('${role}','public.admin_mark_received(bigint)','EXECUTE') as ok`), role === "authenticated", role);
    }

    await db.exec("set role anon");
    await assert.rejects(() => db.query("select public.auto_complete_orders()"), (error) => {
      assert.equal(error.code, "42501");
      assert.match(error.message, /permission denied/i);
      return true;
    });
    await db.exec("reset role");
    await db.exec("set role authenticated");
    await assert.rejects(() => db.query("select public.auto_complete_orders()"), (error) => {
      assert.equal(error.code, "42501");
      assert.match(error.message, /permission denied/i);
      return true;
    });
    await db.exec("reset role");

    await db.exec(`insert into public.orders (user_id, email, status) values ('${ME}', 'rpc@x.com', 'new'), ('${ME}', 'ops@x.com', 'new')`);
    await db.exec(`update public.orders set status = 'delivered' where email in ('rpc@x.com','ops@x.com')`);
    const rows = await db.query(`select id, email from public.orders where email in ('rpc@x.com','ops@x.com')`);
    const rpcId = rows.rows.find((r) => r.email === "rpc@x.com").id;
    const opsId = rows.rows.find((r) => r.email === "ops@x.com").id;
    await db.exec(`select set_config('request.jwt.claim.sub', '${ME}', false)`);
    await db.exec("set role authenticated");
    const at = await db.query(`select public.confirm_order_received(${rpcId}) as at`);
    assert.ok(at.rows[0].at);
    await assert.rejects(() => db.query(`select public.admin_mark_received(${opsId})`), /admin only/);
    await db.exec("reset role");
    await db.exec("select set_config('plentry.test_admin', '1', false)");
    await db.exec("set role authenticated");
    await db.query(`select public.admin_mark_received(${opsId})`);
    await db.exec("reset role");
    const marked = await db.query(`select email, received_confirmed_by from public.orders where email in ('rpc@x.com','ops@x.com') order by email`);
    assert.equal(marked.rows.find((r) => r.email === "ops@x.com").received_confirmed_by, "ops");
    assert.equal(marked.rows.find((r) => r.email === "rpc@x.com").received_confirmed_by, "customer");
    await db.close();
  });
});
