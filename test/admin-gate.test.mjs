// I-A15 and I-M07: who is admin is the server's answer, and served files hold no address.
// admin_roles.sql runs on PGlite, only inside this process. adminDenied runs from pay's source.
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");
const isBinary = (buf) => buf.includes(0);

// Failure messages name the file and a count, never the match: CI logs are public.
describe("I-A15 no address in what the repo serves", () => {
  // .vercelignore is an allow-list: `/*`, then `!/path` for each thing that ships.
  function servedFiles() {
    const entries = read(".vercelignore")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("!/"))
      .map((line) => line.slice(2));
    const files = [];
    for (const entry of entries) {
      if (!statSync(path.join(ROOT, entry)).isDirectory()) {
        files.push(entry);
        continue;
      }
      for (const name of readdirSync(path.join(ROOT, entry), { recursive: true })) {
        const file = path.join(entry, String(name));
        if (statSync(path.join(ROOT, file)).isFile()) files.push(file);
      }
    }
    return files;
  }

  it("I-A15 no served file holds an email address, apart from the sign-in placeholder", () => {
    const files = servedFiles();
    assert.ok(files.includes("index.html") && files.includes("sw.js"), "read the allow-list");
    const placeholders = new Set(["you@example.com"]);
    for (const file of files) {
      const buf = readFileSync(path.join(ROOT, file));
      if (isBinary(buf)) continue;
      const found = buf.toString("utf8").match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
      const real = found.filter((address) => !placeholders.has(address));
      assert.equal(real.length, 0, `${file} holds ${real.length} email address(es)`);
    }
  });
});

describe("I-A15 admin_roles.sql on PGlite: the server decides", () => {
  const rolesSql = read("supabase/admin_roles.sql");
  // The seed insert picks the founder row by address. Read it from the file so this test holds none.
  const FOUNDER_EMAIL = rolesSql.match(/where email = '([^']+)'/)[1];
  const FOUNDER = "00000000-0000-4000-8000-000000000001";
  const CUSTOMER = "00000000-0000-4000-8000-000000000002";

  const FIXTURE = `
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
    $$;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(auth.jwt()->>'sub', '')::uuid
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on all functions in schema auth to anon, authenticated;
    -- Supabase grants every table to the API roles, so RLS is what refuses.
    alter default privileges in schema public grant all on tables to anon, authenticated;
    create table public.orders (id bigint primary key, user_id uuid, status text);
    alter table public.orders enable row level security;
    create policy "select own orders" on public.orders
      for select using (auth.uid() = user_id);
    create table public.meals (
      id bigint primary key, name text, recipe jsonb, portions jsonb, reviewed_at timestamptz
    );
    alter table public.meals enable row level security;
    create table public.ingredient_prices (
      id bigint primary key, slug text, display_name text, meal_key text, category text,
      store text, product_name text, price_gbp numeric
    );
    alter table public.ingredient_prices enable row level security;
  `;

  let db;

  async function signIn(claims) {
    await db.exec("reset role");
    await db.exec(`select set_config('request.jwt.claims', '${JSON.stringify(claims)}', false)`);
    await db.exec("set role authenticated");
  }
  async function signOut() {
    await db.exec("reset role");
    await db.exec(`select set_config('request.jwt.claims', '', false)`);
    await db.exec("set role anon");
  }
  const ask = async (fn) => (await db.query(`select public.${fn}() as ok`)).rows[0].ok;
  const count = async (table) => (await db.query(`select count(*)::int as n from public.${table}`)).rows[0].n;
  const touched = async (sql) => (await db.query(sql)).affectedRows;
  const refused = (sql, reason) =>
    assert.rejects(db.query(sql), (error) => error.code === "42501" && reason.test(error.message), sql);
  const POLICY = /row-level security policy/i;
  // No RETURNING: it would also need a read policy, and only the write policy should refuse here.
  const insertMeal = (id) => `insert into public.meals (id, name) values (${id}, 'Test stew')`;
  const insertPrice = (id) =>
    `insert into public.ingredient_prices (id, slug, display_name, category, store, product_name, price_gbp)
     values (${id}, 'rice', 'Rice', 'carbs', 'tesco', 'Rice', 1.5)`;

  before(async () => {
    db = new PGlite();
    await db.exec(FIXTURE);
    await db.query("insert into auth.users (id, email) values ($1, $2), ($3, $4)", [
      FOUNDER, FOUNDER_EMAIL, CUSTOMER, "customer@example.test",
    ]);
    await db.exec(`insert into public.orders (id, user_id, status) values
      (1, '${FOUNDER}', 'new'), (2, '${CUSTOMER}', 'new')`);
    await db.exec(rolesSql);
    await db.exec(rolesSql); // the header says safe to re-run
  });

  it("I-A15 the file seeds one admin row, the founder", async () => {
    await db.exec("reset role");
    const { rows } = await db.query("select user_id from public.admins");
    assert.deepEqual(rows.map((row) => row.user_id), [FOUNDER]);
  });

  it("I-A15 founder at aal2 gets in: reads every order, updates orders, writes meals and prices", async () => {
    await signIn({ sub: FOUNDER, email: FOUNDER_EMAIL, role: "authenticated", aal: "aal2" });
    assert.equal(await ask("is_admin"), true);
    assert.equal(await ask("is_admin_aal2"), true);
    assert.equal(await count("orders"), 2);
    assert.equal(await touched("update public.orders set status = 'ordered' where id = 2"), 1);
    assert.equal(await touched(insertMeal(1)), 1);
    assert.equal(await touched(insertPrice(1)), 1);
  });

  it("I-A15 founder at aal1 is a member but gets no other customer's rows and no writes", async () => {
    await signIn({ sub: FOUNDER, email: FOUNDER_EMAIL, role: "authenticated", aal: "aal1" });
    assert.equal(await ask("is_admin"), true, "the app learns to ask for the code");
    assert.equal(await ask("is_admin_aal2"), false);
    assert.equal(await count("orders"), 1, "own order only");
    assert.equal(await count("admins"), 1, "own row, the app's fallback read");
    assert.equal(await touched("update public.orders set status = 'delivered' where id = 2"), 0);
    await refused(insertMeal(2), POLICY);
    await refused(insertPrice(2), POLICY);
  });

  it("I-A15 a customer at aal2 is refused and cannot read public.admins", async () => {
    await signIn({ sub: CUSTOMER, email: "customer@example.test", role: "authenticated", aal: "aal2" });
    assert.equal(await ask("is_admin"), false);
    assert.equal(await ask("is_admin_aal2"), false);
    assert.equal(await count("orders"), 1, "own order only");
    assert.equal(await count("admins"), 0, "the founder row and its email stay hidden");
    assert.equal(await touched("update public.orders set status = 'delivered' where id = 1"), 0);
    await refused(insertMeal(3), POLICY);
    await refused(insertPrice(3), POLICY);
  });

  it("I-A15 another account carrying the founder's email claim opens nothing", async () => {
    await signIn({ sub: CUSTOMER, email: FOUNDER_EMAIL, role: "authenticated", aal: "aal2" });
    assert.equal(await ask("is_admin"), false);
    assert.equal(await ask("is_admin_aal2"), false);
    assert.equal(await count("orders"), 1, "own order only");
    assert.equal(await count("admins"), 0);
  });

  it("I-A15 anon cannot call is_admin() or read admins and orders", async () => {
    await signOut();
    await assert.rejects(db.query("select public.is_admin()"), (error) => error.code === "42501");
    await assert.rejects(db.query("select public.is_admin_aal2()"), (error) => error.code === "42501");
    assert.equal(await count("admins"), 0);
    assert.equal(await count("orders"), 0);
  });

  it("I-A12 no signed-in session can add an admin, even the founder at aal2", async () => {
    await signIn({ sub: FOUNDER, email: FOUNDER_EMAIL, role: "authenticated", aal: "aal2" });
    await refused(
      `insert into public.admins (user_id, email) values ('${CUSTOMER}', 'customer@example.test')`,
      POLICY,
    );
  });
});

describe("I-M07 pay's adminDenied, run from the source", () => {
  const src = read("supabase/functions/pay/index.ts");
  // Read the constant from the source so this test holds no address.
  const founder = src.match(/const ADMIN_EMAIL = '([^']+)'/)[1];
  const body = src.match(/function adminDenied\(ctx[^\n]*\{\n([\s\S]*?)\n\}\n/)[1];
  const denied = (ctx) => {
    const Deno = { env: { get: (name) => (name === "REQUIRE_ADMIN_MFA" ? "1" : undefined) } };
    return new Function("ctx", "ADMIN_EMAIL", "Deno", body)(ctx, founder, Deno);
  };
  const refusal = async (ctx) => {
    const response = denied(ctx);
    assert.equal(response.status, 403);
    return (await response.json()).error;
  };

  it("I-M07 a customer, a missing email claim and an empty context are forbidden", async () => {
    assert.equal(await refusal({ userClaims: { email: "customer@example.test" }, jwtClaims: { aal: "aal2" } }), "forbidden");
    assert.equal(await refusal({ userClaims: {}, jwtClaims: { aal: "aal2" } }), "forbidden");
    assert.equal(await refusal({}), "forbidden");
  });

  it("I-A10 the founder at aal1 needs the code; at aal2 the gate opens", async () => {
    assert.equal(await refusal({ userClaims: { email: founder }, jwtClaims: { aal: "aal1" } }), "mfa_required");
    assert.equal(denied({ userClaims: { email: founder }, jwtClaims: { aal: "aal2" } }), null);
  });

  it("I-M07 capture and reconcile both run the gate before anything else", () => {
    for (const task of ["capture", "reconcile"]) {
      assert.match(src, new RegExp(`task === '${task}'\\) \\{\\s+const denied = adminDenied\\(ctx\\)\\s+if \\(denied\\) return denied`), task);
    }
  });
});
