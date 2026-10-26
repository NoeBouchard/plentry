// I-A14 — meals_read_published.sql plus meals_followups.sql, on PGlite.
// The SQL files run only inside this process.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const publishedSql = readFileSync(new URL("../supabase/meals_read_published.sql", import.meta.url), "utf8");
const followupsSql = readFileSync(new URL("../supabase/meals_followups.sql", import.meta.url), "utf8");
const maintainSql = readFileSync(new URL("../supabase/meals_revoke_maintain.sql", import.meta.url), "utf8");

const CATALOGUE = [
  "id", "name", "emoji", "time", "ing", "image_url", "recipe", "tags",
  "reviewed_at", "portions", "category",
];

async function privilege(db, sql) {
  const { rows } = await db.query(sql);
  return rows[0].ok === true || rows[0].ok === "t";
}

async function denied(db, sql) {
  try {
    await db.query(sql);
  } catch (error) {
    assert.equal(error.code, "42501", error.message);
    assert.match(error.message, /permission denied/i);
    return;
  }
  assert.fail(`expected permission denied: ${sql}`);
}

async function rejectedByPolicy(db, sql) {
  try {
    await db.query(sql);
  } catch (error) {
    assert.equal(error.code, "42501", error.message);
    assert.match(error.message, /row-level security policy/i);
    return;
  }
  assert.fail(`expected row-level security policy refusal: ${sql}`);
}

// The flag stands in for public.is_admin() membership. auth.jwt() reads the
// session claim the way is_admin_aal2() does on production, so aal1 is not enough.
const MEALS_FIXTURE = `
  create role anon nologin;
  create role authenticated nologin;
  create schema if not exists auth;
  create function auth.jwt() returns jsonb
  language sql stable
  as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  create table public.meals (
    id bigint primary key,
    name text,
    emoji text,
    time int,
    ing jsonb,
    image_url text,
    recipe jsonb,
    tags jsonb,
    reviewed_at timestamptz,
    portions jsonb,
    category text,
    source text,
    created_by uuid,
    created_at timestamptz
  );
  alter table public.meals enable row level security;
  -- Supabase grants every table privilege to the API roles. RLS is not a
  -- substitute for TRUNCATE, which ignores policies.
  grant all on table public.meals to anon, authenticated;
  grant usage, create on schema public to authenticated;
  create policy "read meals" on public.meals
    for select using (true);
  create table public._test_admin (flag boolean not null);
  insert into public._test_admin values (false);
  create function public.is_admin_aal2() returns boolean
  language sql stable security definer set search_path = public
  as $$
    select flag and (auth.jwt()->>'aal') = 'aal2'
    from public._test_admin
  $$;
  create policy "admin insert meals" on public.meals
    for insert to authenticated
    with check (public.is_admin_aal2());
  create policy "admin update meals review" on public.meals
    for update to authenticated
    using (public.is_admin_aal2())
    with check (public.is_admin_aal2());
`;

const SEED_MEALS = `
  insert into public.meals (
    id, name, emoji, time, ing, image_url, recipe, tags, reviewed_at,
    portions, category, source, created_by, created_at
  ) values
    (1, 'Published stew', '🍲', 20, '["rice"]'::jsonb, 'https://example.test/a.jpg',
     '{"steps":["Cook"]}'::jsonb, '["dinner"]'::jsonb, '2026-10-01T00:00:00Z',
     '{"rice":[100,"g"]}'::jsonb, 'rice_bowl', 'seed',
     '11111111-1111-4111-8111-111111111111', '2026-09-01T00:00:00Z'),
    (2, 'Draft stew', '🍛', 30, '["rice"]'::jsonb, null, null, '["dinner"]'::jsonb,
     null, null, null, 'advisor',
     '22222222-2222-4222-8222-222222222222', '2026-10-02T00:00:00Z');
`;

async function openMealsDb() {
  const db = new PGlite();
  await db.exec(MEALS_FIXTURE);
  return db;
}

async function setMealSession(db, { admin, aal }) {
  await db.exec("reset role");
  await db.exec(`update public._test_admin set flag = ${admin ? "true" : "false"}`);
  const claims = JSON.stringify({ aal, role: "authenticated" });
  await db.exec(`select set_config('request.jwt.claims', '${claims}', false)`);
  await db.exec("set role authenticated");
}

describe("I-A14 meals follow-ups (PGlite)", () => {
  it("I-A14 anon is denied created_by, sees 0 drafts, and can read the catalogue columns", async () => {
    const db = await openMealsDb();

    assert.equal(await privilege(db, `select has_table_privilege('anon','public.meals','INSERT') as ok`), true);
    assert.equal(await privilege(db, `select has_table_privilege('anon','public.meals','TRUNCATE') as ok`), true);
    assert.equal(await privilege(db, `select has_column_privilege('authenticated','public.meals','created_by','SELECT') as ok`), true);

    await db.exec(publishedSql);
    assert.equal(await privilege(db, `select has_column_privilege('anon','public.meals','created_by','SELECT') as ok`), false);
    assert.equal(await privilege(db, `select has_column_privilege('authenticated','public.meals','created_by','SELECT') as ok`), true);
    assert.equal(await privilege(db, `select has_table_privilege('anon','public.meals','INSERT') as ok`), true);

    await db.exec(followupsSql);
    await db.exec(SEED_MEALS);

    for (const role of ["anon", "authenticated"]) {
      for (const col of ["created_by", "source", "created_at"]) {
        assert.equal(
          await privilege(db, `select has_column_privilege('${role}','public.meals','${col}','SELECT') as ok`),
          false,
          `${role} ${col}`,
        );
      }
      for (const col of CATALOGUE) {
        assert.equal(
          await privilege(db, `select has_column_privilege('${role}','public.meals','${col}','SELECT') as ok`),
          true,
          `${role} ${col}`,
        );
      }
    }
    for (const priv of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "SELECT"]) {
      assert.equal(
        await privilege(db, `select has_table_privilege('anon','public.meals','${priv}') as ok`),
        false,
        priv,
      );
    }
    assert.equal(await privilege(db, `select has_table_privilege('authenticated','public.meals','INSERT') as ok`), true);
    assert.equal(await privilege(db, `select has_table_privilege('authenticated','public.meals','UPDATE') as ok`), true);
    assert.equal(await privilege(db, `select has_table_privilege('authenticated','public.meals','SELECT') as ok`), false);
    for (const priv of ["DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
      assert.equal(
        await privilege(db, `select has_table_privilege('authenticated','public.meals','${priv}') as ok`),
        false,
        priv,
      );
    }

    await db.exec("set role anon");
    await denied(db, "select created_by from public.meals");
    await denied(db, "select source from public.meals");
    await denied(db, "select * from public.meals");
    const published = await db.query(`
      select id, name, emoji, time, ing, image_url, recipe, tags, reviewed_at, portions, category
      from public.meals
    `);
    assert.equal(published.rows.length, 1);
    assert.equal(published.rows[0].name, "Published stew");
    assert.equal(published.rows[0].emoji, "🍲");
    assert.equal(Number(published.rows[0].time), 20);
    assert.equal(published.rows[0].category, "rice_bowl");
    assert.ok(published.rows[0].ing);
    assert.equal(published.rows[0].image_url, "https://example.test/a.jpg");
    assert.ok(published.rows[0].recipe);
    assert.ok(published.rows[0].tags);
    assert.ok(published.rows[0].reviewed_at);
    assert.ok(published.rows[0].portions);
    const drafts = await db.query("select count(*)::int as n from public.meals where reviewed_at is null");
    assert.equal(Number(drafts.rows[0].n), 0);
    const names = await db.query("select name from public.meals");
    assert.deepEqual(names.rows.map((row) => row.name), ["Published stew"]);
    await denied(db, "insert into public.meals (id, name) values (9, 'x')");
    await denied(db, "update public.meals set name = 'z' where id = 1");
    await denied(db, "delete from public.meals where id = 1");
    await denied(db, "truncate public.meals");
    await denied(db, "select * from public.admin_read_meals()");

    await db.exec("reset role");
    await db.exec("set role authenticated");
    await denied(db, "select created_by from public.meals");
    await denied(db, "select source from public.meals");
    const signedIn = await db.query("select name from public.meals order by id");
    assert.deepEqual(signedIn.rows.map((row) => row.name), ["Published stew"]);
    const signedInDrafts = await db.query("select count(*)::int as n from public.meals where reviewed_at is null");
    assert.equal(Number(signedInDrafts.rows[0].n), 0);
    const hidden = await db.query("select id, source, created_by::text as created_by from public.admin_read_meals()");
    assert.deepEqual(hidden.rows, []);
    const visibleBefore = await db.query("select count(*)::int as n from public.meals");
    await denied(db, "delete from public.meals where id = 1");
    await denied(db, "truncate public.meals");
    await denied(db, "create table public.meal_ref_probe (meal_id bigint references public.meals(id))");
    await db.exec("create function public.meal_trg() returns trigger language plpgsql as $$ begin return new; end $$");
    await denied(db, "create trigger meal_trg before update on public.meals for each row execute function public.meal_trg()");
    const visibleAfter = await db.query("select count(*)::int as n from public.meals");
    assert.equal(Number(visibleAfter.rows[0].n), Number(visibleBefore.rows[0].n));
    await db.exec("reset role");
    const stored = await db.query("select count(*)::int as n from public.meals");
    assert.equal(Number(stored.rows[0].n), 2);

    await setMealSession(db, { admin: true, aal: "aal2" });
    await denied(db, "select created_by from public.meals");
    const admin = await db.query(`
      select id, name, source, created_by::text as created_by, (reviewed_at is null) as draft
      from public.admin_read_meals()
      order by id
    `);
    assert.equal(admin.rows.length, 2);
    assert.equal(admin.rows[0].name, "Published stew");
    assert.equal(admin.rows[0].source, "seed");
    assert.equal(admin.rows[0].created_by, "11111111-1111-4111-8111-111111111111");
    assert.equal(admin.rows[0].draft === true || admin.rows[0].draft === "t", false);
    assert.equal(admin.rows[1].name, "Draft stew");
    assert.equal(admin.rows[1].source, "advisor");
    assert.equal(admin.rows[1].created_by, "22222222-2222-4222-8222-222222222222");
    assert.equal(admin.rows[1].draft === true || admin.rows[1].draft === "t", true);

    await db.exec("reset role");
    const kept = await db.query("select id from public.meals order by id");
    assert.deepEqual(kept.rows.map((row) => Number(row.id)), [1, 2]);

    await db.exec(followupsSql);
    await db.exec("set role anon");
    await denied(db, "select created_by from public.meals");
    const again = await db.query("select name from public.meals");
    assert.deepEqual(again.rows.map((row) => row.name), ["Published stew"]);
    const againDrafts = await db.query("select count(*)::int as n from public.meals where reviewed_at is null");
    assert.equal(Number(againDrafts.rows[0].n), 0);
    await db.close();
  });

  it("I-A14 an aal2 admin can insert and update after table SELECT is revoked", async () => {
    const db = await openMealsDb();
    await db.exec(publishedSql);
    await db.exec(followupsSql);
    await db.exec(SEED_MEALS);

    await setMealSession(db, { admin: false, aal: "aal2" });
    const hidden = await db.query("select id from public.admin_read_meals()");
    assert.deepEqual(hidden.rows, []);
    await rejectedByPolicy(db, "insert into public.meals (id, name) values (9, 'Nope')");

    await setMealSession(db, { admin: true, aal: "aal1" });
    const aal1 = await db.query("select id from public.admin_read_meals()");
    assert.deepEqual(aal1.rows, []);
    await rejectedByPolicy(db, "insert into public.meals (id, name) values (8, 'Aal1')");

    await setMealSession(db, { admin: true, aal: "aal2" });
    await db.exec("insert into public.meals (id, name, source) values (3, 'Admin stew', 'ops')");
    await db.exec("update public.meals set name = 'Renamed stew' where id = 1");
    await denied(db, "select created_by from public.meals");
    const admin = await db.query(`
      select id, name, source
      from public.admin_read_meals()
      order by id
    `);
    assert.deepEqual(admin.rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      source: row.source,
    })), [
      { id: 1, name: "Renamed stew", source: "seed" },
      { id: 2, name: "Draft stew", source: "advisor" },
      { id: 3, name: "Admin stew", source: "ops" },
    ]);

    await db.exec("reset role");
    const stored = await db.query("select id, name from public.meals order by id");
    assert.deepEqual(stored.rows.map((row) => ({ id: Number(row.id), name: row.name })), [
      { id: 1, name: "Renamed stew" },
      { id: 2, name: "Draft stew" },
      { id: 3, name: "Admin stew" },
    ]);
    await db.close();
  });

  it("anon and authenticated lack MAINTAIN after meals_revoke_maintain.sql and keep the 11 catalogue columns", async () => {
    const db = await openMealsDb();
    await db.exec(publishedSql);
    await db.exec(followupsSql);
    await db.exec(SEED_MEALS);
    for (const role of ["anon", "authenticated"]) {
      assert.equal(
        await privilege(db, `select has_table_privilege('${role}','public.meals','MAINTAIN') as ok`),
        true,
        `${role} starts with MAINTAIN`,
      );
    }

    await db.exec(maintainSql);

    for (const role of ["anon", "authenticated"]) {
      assert.equal(
        await privilege(db, `select has_table_privilege('${role}','public.meals','MAINTAIN') as ok`),
        false,
        role,
      );
      for (const col of CATALOGUE) {
        assert.equal(
          await privilege(db, `select has_column_privilege('${role}','public.meals','${col}','SELECT') as ok`),
          true,
          `${role} ${col}`,
        );
      }
    }

    await db.exec("set role anon");
    const published = await db.query(`
      select id, name, emoji, time, ing, image_url, recipe, tags, reviewed_at, portions, category
      from public.meals
    `);
    assert.equal(published.rows.length, 1);
    assert.equal(published.rows[0].name, "Published stew");
    await db.close();
  });
});
