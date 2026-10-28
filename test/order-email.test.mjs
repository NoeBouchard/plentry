// I-O20 — order_completion_email.sql on PGlite.
// Not applied to any database. The SQL file runs only inside this process.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const sql = readFileSync(new URL("../supabase/order_completion_email.sql", import.meta.url), "utf8");

const FIXTURE = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema if not exists net;
  create table public.net_calls (
    id bigserial primary key,
    url text,
    headers jsonb,
    body jsonb
  );
  create function net.http_post(
    url text,
    body jsonb default '{}'::jsonb,
    params jsonb default '{}'::jsonb,
    headers jsonb default '{}'::jsonb,
    timeout_milliseconds integer default 1000
  ) returns bigint
  language plpgsql
  as $$
  declare
    new_id bigint;
  begin
    insert into public.net_calls (url, headers, body)
    values (url, headers, body)
    returning id into new_id;
    return new_id;
  end
  $$;
  create function public.order_webhook_secret() returns text
  language sql
  as $$ select 'test-webhook-secret'::text $$;
  create table public.orders (
    id bigint primary key,
    email text,
    address jsonb,
    status text,
    payment_status text,
    amount_captured numeric,
    delivery_slot text,
    slot_date date,
    slot_start time,
    slot_end time,
    delivered_at timestamptz,
    received_confirmed_at timestamptz,
    received_confirmed_by text
  );
  grant select, update on table public.orders to anon, authenticated, service_role;
`;

async function openDb() {
  const db = new PGlite();
  await db.exec(FIXTURE);
  return db;
}

async function apply(db) {
  await db.exec(sql);
}

async function insertOrder(db, row) {
  const order = {
    email: "customer@example.com",
    address: { email: "door@example.com" },
    status: "ordered",
    payment_status: "authorized",
    amount_captured: null,
    delivery_slot: "Thu 30 Oct 10:00–12:00",
    slot_date: "2026-10-30",
    slot_start: "10:00",
    slot_end: "12:00",
    received_confirmed_at: undefined,
    received_confirmed_by: undefined,
    ...row,
  };
  const receiptGiven = Object.prototype.hasOwnProperty.call(row, "received_confirmed_at");
  if (!receiptGiven && order.status === "delivered" && order.payment_status === "captured") {
    order.received_confirmed_at = "2026-10-28T12:00:00.000Z";
    order.received_confirmed_by = order.received_confirmed_by || "customer";
  } else if (!receiptGiven) {
    order.received_confirmed_at = null;
    order.received_confirmed_by = null;
  }
  await db.query(
    `insert into public.orders
      (id, email, address, status, payment_status, amount_captured, delivery_slot, slot_date, slot_start, slot_end, received_confirmed_at, received_confirmed_by)
     values ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      order.id,
      order.email,
      order.address == null ? null : JSON.stringify(order.address),
      order.status,
      order.payment_status,
      order.amount_captured,
      order.delivery_slot,
      order.slot_date,
      order.slot_start,
      order.slot_end,
      order.received_confirmed_at,
      order.received_confirmed_by,
    ],
  );
}

async function claim(db, id) {
  const { rows } = await db.query("select * from public.claim_completion_email($1)", [id]);
  return rows;
}

async function emailState(db, id) {
  const { rows } = await db.query(
    `select completion_email_status as status,
            completion_email_attempts as attempts,
            completion_email_error as error,
            status as order_status
     from public.orders where id = $1`,
    [id],
  );
  const row = rows[0];
  return {
    status: row.status,
    attempts: Number(row.attempts),
    error: row.error,
    orderStatus: row.order_status,
  };
}

async function mark(db, id, ok, messageId, error, skipped = false) {
  await db.query("select public.mark_completion_email($1, $2, $3, $4, $5)", [id, ok, messageId, error, skipped]);
}

async function posts(db) {
  const { rows } = await db.query("select url, headers, body from public.net_calls order by id");
  return rows.map((row) => ({
    url: row.url,
    headers: typeof row.headers === "string" ? JSON.parse(row.headers) : row.headers,
    body: typeof row.body === "string" ? JSON.parse(row.body) : row.body,
  }));
}

async function raises(db, statement, pattern) {
  try {
    await db.query(statement);
  } catch (error) {
    assert.match(error.message, pattern);
    return;
  }
  assert.fail(`expected error: ${statement}`);
}

async function privilege(db, statement) {
  const { rows } = await db.query(statement);
  return rows[0].ok === true || rows[0].ok === "t";
}

describe("I-O20 order completion email (PGlite, SQL not applied)", () => {
  it("I-O20 only a confirmed captured order with a non-null amount claims, and only once", async () => {
    const db = await openDb();
    await apply(db);
    await insertOrder(db, { id: 1, status: "ordered", payment_status: "captured", amount_captured: 12.5 });
    await insertOrder(db, {
      id: 2,
      status: "delivered",
      payment_status: "authorized",
      amount_captured: 12.5,
      received_confirmed_at: "2026-10-28T12:00:00.000Z",
      received_confirmed_by: "customer",
    });
    await insertOrder(db, {
      id: 3,
      status: "delivered",
      payment_status: "captured",
      amount_captured: 12.5,
      email: null,
      address: { email: "from-address@example.com" },
    });
    assert.equal((await claim(db, 1)).length, 0);
    assert.equal((await claim(db, 2)).length, 0);
    const won = await claim(db, 3);
    assert.equal(won.length, 1);
    assert.equal(Number(won[0].id), 3);
    assert.equal(won[0].email, null);
    assert.equal(won[0].address.email || won[0].address["email"], "from-address@example.com");
    assert.equal(Number(won[0].amount_captured), 12.5);
    assert.equal(Number(won[0].completion_email_attempts), 1);
    assert.equal((await claim(db, 3)).length, 0);
    const state = await emailState(db, 3);
    assert.equal(state.status, "sending");
    assert.equal(state.attempts, 1);
    await db.close();
  });

  it("I-O20 two concurrent claims give one winner", async () => {
    const db = await openDb();
    await apply(db);
    await insertOrder(db, { id: 7, status: "delivered", payment_status: "captured", amount_captured: 4 });
    const [a, b] = await Promise.all([
      db.query("select id from public.claim_completion_email($1)", [7]),
      db.query("select id from public.claim_completion_email($1)", [7]),
    ]);
    const winners = [a, b].filter((result) => result.rows.length === 1);
    assert.equal(winners.length, 1);
    assert.equal(Number(winners[0].rows[0].id), 7);
    const state = await emailState(db, 7);
    assert.equal(state.status, "sending");
    assert.equal(state.attempts, 1);
    await db.close();
  });

  it("I-O20 after sent, a later receipt stamp posts and does not re-claim", async () => {
    const db = await openDb();
    await apply(db);
    await insertOrder(db, { id: 4, status: "delivered", payment_status: "captured", amount_captured: 9 });
    assert.equal((await claim(db, 4)).length, 1);
    await mark(db, 4, true, "re_sent", null, false);
    let state = await emailState(db, 4);
    assert.equal(state.status, "sent");
    await db.exec("delete from public.net_calls");
    await db.query("update public.orders set status = 'ordered' where id = 4");
    await db.query("update public.orders set status = 'delivered' where id = 4");
    assert.equal((await posts(db)).length, 0, "status cycle does not fire");
    await db.query("update public.orders set received_confirmed_at = null, received_confirmed_by = null where id = 4");
    assert.equal((await posts(db)).length, 0, "clearing the receipt does not fire");
    await db.query("update public.orders set received_confirmed_at = now(), received_confirmed_by = 'ops' where id = 4");
    const fired = await posts(db);
    assert.equal(fired.length, 1);
    assert.equal(Number(fired[0].body.order_id), 4);
    assert.equal((await claim(db, 4)).length, 0);
    state = await emailState(db, 4);
    assert.equal(state.status, "sent");
    assert.equal(state.orderStatus, "delivered");
    await db.close();
  });

  it("I-O20 failed can be re-claimed up to 5 attempts", async () => {
    const db = await openDb();
    await apply(db);
    await insertOrder(db, { id: 5, status: "delivered", payment_status: "captured", amount_captured: 3 });
    for (let attempt = 1; attempt <= 5; attempt++) {
      const rows = await claim(db, 5);
      assert.equal(rows.length, 1, `attempt ${attempt}`);
      assert.equal(Number(rows[0].completion_email_attempts), attempt);
      await mark(db, 5, false, null, "resend down", false);
      const state = await emailState(db, 5);
      assert.equal(state.status, "failed");
      assert.equal(state.attempts, attempt);
    }
    assert.equal((await claim(db, 5)).length, 0);
    const done = await emailState(db, 5);
    assert.equal(done.status, "failed");
    assert.equal(done.attempts, 5);
    await db.close();
  });

  it("I-O20 a stale sending is re-claimed and a fresh one is not", async () => {
    const db = await openDb();
    await apply(db);
    await insertOrder(db, { id: 6, status: "delivered", payment_status: "captured", amount_captured: 8 });
    assert.equal((await claim(db, 6)).length, 1);
    assert.equal((await claim(db, 6)).length, 0);
    await db.query(
      "update public.orders set completion_email_claimed_at = now() - interval '16 minutes' where id = 6",
    );
    const stale = await claim(db, 6);
    assert.equal(stale.length, 1);
    assert.equal(Number(stale[0].completion_email_attempts), 2);
    assert.equal((await claim(db, 6)).length, 0);
    const state = await emailState(db, 6);
    assert.equal(state.status, "sending");
    assert.equal(state.attempts, 2);
    await db.close();
  });

  it("I-O20 a null amount_captured does not claim, and no recipient is skipped", async () => {
    const db = await openDb();
    await apply(db);
    await insertOrder(db, { id: 8, status: "delivered", payment_status: "captured", amount_captured: null });
    await insertOrder(db, {
      id: 9,
      status: "delivered",
      payment_status: "captured",
      amount_captured: 1,
      email: "   ",
      address: { email: "" },
    });
    assert.equal((await claim(db, 8)).length, 0);
    assert.equal((await emailState(db, 8)).status, null);
    assert.equal((await claim(db, 9)).length, 0);
    const skipped = await emailState(db, 9);
    assert.equal(skipped.status, "skipped");
    assert.equal(skipped.error, "no recipient");
    await db.close();
  });

  it("I-O20 the guard blocks non-service roles from the email columns, and a status update still works", async () => {
    const db = await openDb();
    await apply(db);
    await insertOrder(db, { id: 10, status: "delivered", payment_status: "captured", amount_captured: 2 });
    assert.equal((await claim(db, 10)).length, 1);
    await mark(db, 10, true, "re_ok", null, false);

    assert.equal(
      await privilege(db, "select has_function_privilege('service_role', 'public.claim_completion_email(bigint)', 'execute') as ok"),
      true,
    );
    assert.equal(
      await privilege(db, "select has_function_privilege('authenticated', 'public.claim_completion_email(bigint)', 'execute') as ok"),
      false,
    );
    assert.equal(
      await privilege(db, "select has_function_privilege('anon', 'public.mark_completion_email(bigint, boolean, text, text, boolean, boolean)', 'execute') as ok"),
      false,
    );

    await db.exec("set role authenticated");
    await raises(
      db,
      "update public.orders set completion_email_status = 'failed' where id = 10",
      /service-owned/,
    );
    await db.query("update public.orders set status = 'ordered' where id = 10");
    await db.exec("reset role");
    let state = await emailState(db, 10);
    assert.equal(state.orderStatus, "ordered");
    assert.equal(state.status, "sent");

    await db.exec("set role service_role");
    await db.query("update public.orders set completion_email_error = 'service write' where id = 10");
    await db.exec("reset role");
    state = await emailState(db, 10);
    assert.equal(state.error, "service write");
    assert.equal(state.status, "sent");
    await db.close();
  });

  it("I-O20 the backfill skips a captured receipt, a backfill row is never emailed, and a re-run keeps sent", async () => {
    const db = await openDb();
    await insertOrder(db, {
      id: 1,
      status: "delivered",
      payment_status: "captured",
      amount_captured: 5,
      received_confirmed_at: "2026-10-01T12:00:00.000Z",
      received_confirmed_by: "backfill",
    });
    await insertOrder(db, { id: 2, status: "ordered", payment_status: "captured", amount_captured: 5 });
    await insertOrder(db, {
      id: 3,
      status: "delivered",
      payment_status: "authorized",
      amount_captured: null,
      received_confirmed_at: "2026-10-01T12:00:00.000Z",
      received_confirmed_by: "backfill",
    });
    await insertOrder(db, {
      id: 16,
      status: "delivered",
      payment_status: "captured",
      amount_captured: 5,
      received_confirmed_at: "2026-10-02T12:00:00.000Z",
      received_confirmed_by: "customer",
    });
    await apply(db);
    assert.equal((await emailState(db, 1)).status, "skipped");
    assert.match((await emailState(db, 1)).error, /backfill/);
    assert.equal((await emailState(db, 2)).status, null);
    assert.equal((await emailState(db, 3)).status, null, "a backfill row that is not captured is not skipped yet");
    assert.equal((await emailState(db, 16)).status, "skipped");
    assert.equal((await posts(db)).length, 0, "backfill does not post");
    assert.equal((await claim(db, 1)).length, 0, "a backfill row is not claimed");

    await insertOrder(db, {
      id: 17,
      status: "delivered",
      payment_status: "captured",
      amount_captured: 5,
      received_confirmed_at: null,
      received_confirmed_by: null,
    });
    await db.exec("delete from public.net_calls");
    await db.query(`
      update public.orders
      set received_confirmed_at = now(), received_confirmed_by = 'backfill'
      where id = 17
    `);
    assert.equal((await claim(db, 17)).length, 0);
    await db.exec("delete from public.net_calls");
    await db.query("select public.sweep_completion_emails()");
    assert.equal((await posts(db)).filter((row) => Number(row.body.order_id) === 17).length, 0);
    assert.equal((await emailState(db, 17)).status, "skipped");
    assert.match((await emailState(db, 17)).error, /backfill/);

    await db.query(`
      update public.orders
      set status = 'delivered', payment_status = 'captured', amount_captured = 5,
          received_confirmed_at = now(), received_confirmed_by = 'customer',
          completion_email_status = null, completion_email_error = null
      where id = 2
    `);
    assert.equal((await claim(db, 2)).length, 1);
    await mark(db, 2, true, "re_live", null, false);
    await apply(db);
    assert.equal((await emailState(db, 2)).status, "sent");
    assert.equal((await emailState(db, 1)).status, "skipped");
    await db.close();
  });

  it("I-O20 the trigger fires when receipt is confirmed on a captured order, auto sends, and a non-captured order does not", async () => {
    const db = await openDb();
    await apply(db);
    await insertOrder(db, { id: 11, status: "delivered", payment_status: "authorized", amount_captured: null });
    await db.query("update public.orders set status = 'ordered' where id = 11");
    await db.query("update public.orders set status = 'delivered' where id = 11");
    assert.equal((await posts(db)).length, 0, "status delivered does not fire");
    await db.query(`
      update public.orders
      set received_confirmed_at = now(), received_confirmed_by = 'customer'
      where id = 11
    `);
    assert.equal((await posts(db)).length, 0, "receipt while not captured does not fire");
    assert.equal((await claim(db, 11)).length, 0, "a non-captured order is not claimed");

    await db.query("update public.orders set payment_status = 'captured', amount_captured = 6 where id = 11");
    assert.equal((await posts(db)).length, 0, "capture after receipt does not fire the receipt trigger");
    await db.query("select public.sweep_completion_emails()");
    let fired = await posts(db);
    assert.equal(fired.length, 1, "the sweep sends a receipt that was captured later");
    assert.equal(fired[0].url, "https://ucciqthwxnlkjalwlhvh.supabase.co/functions/v1/order-email");
    assert.equal(fired[0].headers["x-webhook-secret"], "test-webhook-secret");
    assert.equal(fired[0].headers["Content-Type"], "application/json");
    assert.equal(Number(fired[0].body.order_id), 11);

    await db.exec("delete from public.net_calls");
    await insertOrder(db, {
      id: 12,
      status: "delivered",
      payment_status: "captured",
      amount_captured: 6,
      received_confirmed_at: null,
      received_confirmed_by: null,
    });
    await db.query(`
      update public.orders
      set received_confirmed_at = now(), received_confirmed_by = 'auto'
      where id = 12
    `);
    fired = await posts(db);
    assert.equal(fired.length, 1, "auto-complete sends");
    assert.equal(Number(fired[0].body.order_id), 12);
    assert.equal((await claim(db, 12)).length, 1);

    await db.exec("delete from public.net_calls");
    await db.query("update public.orders set delivery_slot = 'booked later' where id = 12");
    assert.equal((await posts(db)).length, 0, "an unrelated update does not fire");

    await db.exec("delete from public.net_calls");
    await insertOrder(db, {
      id: 13,
      status: "delivered",
      payment_status: "captured",
      amount_captured: 6,
      received_confirmed_at: null,
      received_confirmed_by: null,
    });
    await db.query("update public.orders set payment_status = 'authorized', amount_captured = null where id = 13");
    await db.query(`
      update public.orders
      set received_confirmed_at = now(), received_confirmed_by = 'ops'
      where id = 13
    `);
    assert.equal((await posts(db)).length, 0, "ops receipt on a non-captured order does not fire");
    assert.equal((await claim(db, 13)).length, 0);
    await db.close();
  });

  it("I-O20 a stale sending at 5 attempts is not reclaimed and the sweep skips it", async () => {
    const db = await openDb();
    await apply(db);
    await insertOrder(db, { id: 14, status: "delivered", payment_status: "captured", amount_captured: 4 });
    await insertOrder(db, { id: 15, status: "delivered", payment_status: "captured", amount_captured: 4 });
    await db.exec("set role service_role");
    await db.query(`
      update public.orders
      set completion_email_status = 'sending',
          completion_email_attempts = 5,
          completion_email_claimed_at = now() - interval '16 minutes'
      where id = 14
    `);
    await db.query(`
      update public.orders
      set completion_email_status = 'sending',
          completion_email_attempts = 4,
          completion_email_claimed_at = now() - interval '16 minutes'
      where id = 15
    `);
    await db.exec("reset role");
    assert.equal((await claim(db, 14)).length, 0);
    assert.equal((await emailState(db, 14)).attempts, 5);
    const reclaimed = await claim(db, 15);
    assert.equal(reclaimed.length, 1);
    assert.equal(Number(reclaimed[0].completion_email_attempts), 5);

    await db.exec("set role service_role");
    await db.query(`
      update public.orders
      set completion_email_status = 'sending',
          completion_email_attempts = 4,
          completion_email_claimed_at = now() - interval '16 minutes'
      where id = 15
    `);
    await db.exec("reset role");
    await db.exec("delete from public.net_calls");
    await db.query("select public.sweep_completion_emails()");
    const fired = (await posts(db)).map((row) => Number(row.body.order_id));
    assert.equal(fired.includes(14), false);
    assert.equal(fired.filter((id) => id === 15).length, 1);
    await db.close();
  });

  it("I-O20 a non-service insert resets the email columns and a service insert keeps them", async () => {
    const db = await openDb();
    await apply(db);
    await db.exec("grant insert on table public.orders to authenticated, service_role");
    await db.exec("set role authenticated");
    await db.query(`
      insert into public.orders (
        id, email, status, payment_status, amount_captured,
        completion_email_status, completion_email_attempts, completion_email_error,
        completion_email_claimed_at, completion_email_message_id
      ) values (
        20, 'a@b.co', 'new', 'unpaid', null,
        'sent', 3, 'forged', now(), 're_forged'
      )
    `);
    await db.exec("reset role");
    let state = await emailState(db, 20);
    assert.equal(state.status, null);
    assert.equal(state.attempts, 0);
    assert.equal(state.error, null);
    const wiped = await db.query("select completion_email_message_id as message_id from public.orders where id = 20");
    assert.equal(wiped.rows[0].message_id, null);

    await db.exec("set role service_role");
    await db.query(`
      insert into public.orders (
        id, email, status, payment_status, amount_captured,
        completion_email_status, completion_email_error
      ) values (
        21, 'b@b.co', 'delivered', 'captured', 1,
        'skipped', 'kept'
      )
    `);
    await db.exec("reset role");
    state = await emailState(db, 21);
    assert.equal(state.status, "skipped");
    assert.equal(state.error, "kept");
    await db.close();
  });

  it("I-O20 release undoes an attempt, and a terminal failure is not retried", async () => {
    const db = await openDb();
    await apply(db);
    await insertOrder(db, { id: 30, status: "delivered", payment_status: "captured", amount_captured: 9 });
    await insertOrder(db, { id: 31, status: "delivered", payment_status: "captured", amount_captured: 9 });
    assert.equal((await claim(db, 30)).length, 1);
    await db.query("select public.release_completion_email(30)");
    let state = await emailState(db, 30);
    assert.equal(state.status, null);
    assert.equal(state.attempts, 0);
    assert.equal(state.error, null);
    const again = await claim(db, 30);
    assert.equal(again.length, 1);
    assert.equal(Number(again[0].completion_email_attempts), 1);

    assert.equal((await claim(db, 31)).length, 1);
    await db.query(
      "select public.mark_completion_email($1, false, null, 'invalid_idempotent_request: not retrying', false, true)",
      [31],
    );
    state = await emailState(db, 31);
    assert.equal(state.status, "failed");
    assert.equal(state.attempts, 5);
    assert.match(state.error, /invalid_idempotent_request/);
    assert.equal((await claim(db, 31)).length, 0);

    assert.equal(
      await privilege(db, "select has_function_privilege('authenticated', 'public.release_completion_email(bigint)', 'execute') as ok"),
      false,
    );
    assert.equal(
      await privilege(db, "select has_function_privilege('service_role', 'public.release_completion_email(bigint)', 'execute') as ok"),
      true,
    );
    await db.close();
  });

  it("I-O20 config failures alert once at 3, not again at 4, and re-arm after a success", async () => {
    const db = await openDb();
    await apply(db);
    async function note() {
      const { rows } = await db.query("select streak, alert from public.note_completion_email_config_failure()");
      return { streak: Number(rows[0].streak), alert: rows[0].alert === true };
    }
    assert.deepEqual(await note(), { streak: 1, alert: false });
    assert.deepEqual(await note(), { streak: 2, alert: false });
    assert.deepEqual(await note(), { streak: 3, alert: true });
    assert.deepEqual(await note(), { streak: 4, alert: false });
    assert.deepEqual(await note(), { streak: 5, alert: false });

    await db.query("select public.rearm_completion_email_config_alert()");
    assert.deepEqual(await note(), { streak: 6, alert: true });
    assert.equal((await note()).alert, false);

    await db.query("select public.note_completion_email_config_success()");
    const reset = await db.query("select fail_streak, alerted from public.completion_email_config where id = 1");
    assert.equal(Number(reset.rows[0].fail_streak), 0);
    assert.equal(reset.rows[0].alerted, false);
    assert.equal((await note()).alert, false);
    assert.equal((await note()).alert, false);
    assert.equal((await note()).alert, true);

    assert.equal(
      await privilege(db, "select has_function_privilege('authenticated', 'public.note_completion_email_config_failure()', 'execute') as ok"),
      false,
    );
    assert.equal(
      await privilege(db, "select has_function_privilege('service_role', 'public.note_completion_email_config_failure()', 'execute') as ok"),
      true,
    );
    assert.equal(
      await privilege(db, "select has_function_privilege('authenticated', 'public.note_completion_email_config_success()', 'execute') as ok"),
      false,
    );
    assert.equal(
      await privilege(db, "select has_table_privilege('authenticated', 'public.completion_email_config', 'select') as ok"),
      false,
    );
    assert.equal(
      await privilege(db, "select has_table_privilege('anon', 'public.completion_email_config', 'select') as ok"),
      false,
    );
    assert.equal(
      await privilege(db, "select has_table_privilege('service_role', 'public.completion_email_config', 'select') as ok"),
      true,
    );
    assert.equal(
      await privilege(db, "select has_table_privilege('service_role', 'public.completion_email_config', 'update') as ok"),
      true,
    );
    await db.close();
  });
});
