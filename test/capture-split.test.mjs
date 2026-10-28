// I-M10 — orders_capture_split.sql on PGlite. Not applied to any database.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const sql = readFileSync(new URL("../supabase/orders_capture_split.sql", import.meta.url), "utf8");

const FIXTURE = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema if not exists auth;
  create function auth.jwt() returns jsonb
    language sql stable
    as $$ select null::jsonb $$;
  create table public.orders (
    id bigint generated always as identity primary key,
    user_id uuid,
    email text,
    name text,
    postcode text,
    store text,
    total numeric,
    items jsonb,
    status text,
    payment_status text,
    payment_intent text,
    checkout_session text,
    amount_held numeric,
    amount_captured numeric,
    address jsonb,
    slot_date date,
    slot_start time,
    slot_end time,
    delivery_slot text,
    issue_status text
  );
  alter table public.orders enable row level security;
  grant all on table public.orders to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  create policy "insert own orders" on public.orders
    for insert to authenticated with check (true);
  create policy "select own orders" on public.orders
    for select to authenticated using (true);
  create policy "admin update all orders" on public.orders
    for update to authenticated using (true);
`;

async function privilege(db, statement) {
  const { rows } = await db.query(statement);
  return rows[0].ok === true || rows[0].ok === "t";
}

async function denied(db, statement) {
  try {
    await db.query(statement);
  } catch (error) {
    assert.equal(error.code, "42501", error.message);
    assert.match(error.message, /permission denied/i);
    return;
  }
  assert.fail(`expected permission denied: ${statement}`);
}

describe("I-M10 capture split columns (PGlite, SQL not applied)", () => {
  it("I-M10 old rows stay null, INSERT forces the split null, and a negative fee is allowed", async () => {
    const db = new PGlite();
    await db.exec(FIXTURE);
    await db.exec(`
      insert into public.orders (email, name, postcode, store, total, items, payment_status, amount_captured)
      values ('old@x.com', 'Old', 'E2 8AA', 'Tesco', 10, '{"basket":[{"i":"eggs","q":1}]}'::jsonb, 'authorized', 5)
    `);
    await db.exec(sql);
    const legacy = await db.query(`
      select store_total, fee_amount, overrun_amount from public.orders where email = 'old@x.com'
    `);
    assert.equal(legacy.rows[0].store_total, null);
    assert.equal(legacy.rows[0].fee_amount, null);
    assert.equal(legacy.rows[0].overrun_amount, null);

    await db.exec(`
      insert into public.orders (
        email, name, postcode, store, total, items, payment_status,
        amount_captured, store_total, fee_amount, overrun_amount
      ) values (
        'new@x.com', 'New', 'E2 8AA', 'Tesco', 10, '{"basket":[{"i":"eggs","q":1}]}'::jsonb,
        'authorized', 5, 9, 1, 0
      )
    `);
    const born = await db.query(`
      select payment_status, status, amount_captured, store_total, fee_amount, overrun_amount
      from public.orders where email = 'new@x.com'
    `);
    assert.equal(born.rows[0].payment_status, "unpaid");
    assert.equal(born.rows[0].status, "new");
    assert.equal(born.rows[0].amount_captured, null);
    assert.equal(born.rows[0].store_total, null);
    assert.equal(born.rows[0].fee_amount, null);
    assert.equal(born.rows[0].overrun_amount, null);

    await db.exec(`
      update public.orders
      set payment_status = 'captured', amount_captured = 4.58,
          store_total = 10, fee_amount = -5.42, overrun_amount = 5.92
      where email = 'new@x.com'
    `);
    const saved = await db.query(`
      select amount_captured, store_total, fee_amount, overrun_amount
      from public.orders where email = 'new@x.com'
    `);
    assert.equal(Number(saved.rows[0].amount_captured), 4.58);
    assert.equal(Number(saved.rows[0].store_total), 10);
    assert.equal(Number(saved.rows[0].fee_amount), -5.42);
    assert.equal(Number(saved.rows[0].overrun_amount), 5.92);

    for (const statement of [
      "update public.orders set fee_amount = -1000.01 where email = 'new@x.com'",
      "update public.orders set store_total = -1 where email = 'new@x.com'",
      "update public.orders set overrun_amount = -0.01 where email = 'new@x.com'",
    ]) {
      await assert.rejects(() => db.query(statement), /invalid (fee_amount|store_total|overrun_amount)/);
    }
    await db.exec(sql);
    await db.close();
  });

  it("I-M10 authenticated cannot write the split or amount_captured; status updates still work", async () => {
    const db = new PGlite();
    await db.exec(FIXTURE);
    await db.exec(sql);
    for (const col of ["store_total", "fee_amount", "overrun_amount", "amount_captured"]) {
      assert.equal(
        await privilege(db, `select has_column_privilege('authenticated','public.orders','${col}','UPDATE') as ok`),
        false,
        col,
      );
      assert.equal(
        await privilege(db, `select has_column_privilege('authenticated','public.orders','${col}','INSERT') as ok`),
        false,
        `insert ${col}`,
      );
      assert.equal(
        await privilege(db, `select has_column_privilege('anon','public.orders','${col}','UPDATE') as ok`),
        false,
        `anon ${col}`,
      );
    }
    assert.equal(await privilege(db, `select has_column_privilege('authenticated','public.orders','status','UPDATE') as ok`), true);
    assert.equal(await privilege(db, `select has_column_privilege('authenticated','public.orders','delivery_slot','UPDATE') as ok`), true);
    assert.equal(await privilege(db, `select has_column_privilege('authenticated','public.orders','issue_status','UPDATE') as ok`), true);
    assert.equal(await privilege(db, `select has_column_privilege('authenticated','public.orders','total','INSERT') as ok`), true);
    assert.equal(await privilege(db, `select has_column_privilege('service_role','public.orders','store_total','UPDATE') as ok`), true);
    assert.equal(await privilege(db, `select has_table_privilege('anon','public.orders','UPDATE') as ok`), false);
    assert.equal(await privilege(db, `select has_table_privilege('service_role','public.orders','UPDATE') as ok`), true);

    await db.exec("set role authenticated");
    const inserted = await db.query(`
      insert into public.orders (email, name, postcode, store, total, payment_status, items)
      values ('c@x.com', 'C', 'E2 8AA', 'Tesco', 12, 'authorized', '{"basket":[{"i":"eggs","q":1}]}'::jsonb)
      returning id, payment_status, store_total, amount_captured, status
    `);
    assert.equal(inserted.rows[0].payment_status, "unpaid");
    assert.equal(inserted.rows[0].status, "new");
    assert.equal(inserted.rows[0].store_total, null);
    assert.equal(inserted.rows[0].amount_captured, null);
    const id = inserted.rows[0].id;
    await denied(db, `insert into public.orders (email, name, postcode, store, total, items, store_total) values ('d@x.com', 'D', 'E2 8AA', 'Tesco', 12, '{"basket":[{"i":"eggs","q":1}]}'::jsonb, 4)`);
    await denied(db, `update public.orders set store_total = 4 where id = ${id}`);
    await denied(db, `update public.orders set amount_captured = 4 where id = ${id}`);
    await denied(db, `update public.orders set fee_amount = -1 where id = ${id}`);
    await db.exec(`update public.orders set status = 'ordered', delivery_slot = 'Tue 10:00', issue_status = 'open' where id = ${id}`);
    await db.exec("reset role");
    const row = await db.query(`select status, delivery_slot, issue_status, store_total from public.orders where id = ${id}`);
    assert.equal(row.rows[0].status, "ordered");
    assert.equal(row.rows[0].delivery_slot, "Tue 10:00");
    assert.equal(row.rows[0].issue_status, "open");
    assert.equal(row.rows[0].store_total, null);

    await db.exec("set role service_role");
    await db.exec(`update public.orders set payment_status = 'captured', amount_captured = 4.58, store_total = 10, fee_amount = -5.42, overrun_amount = 5.92 where id = ${id}`);
    await db.exec("reset role");
    const money = await db.query(`select amount_captured, fee_amount from public.orders where id = ${id}`);
    assert.equal(Number(money.rows[0].amount_captured), 4.58);
    assert.equal(Number(money.rows[0].fee_amount), -5.42);
    await db.close();
  });
});
