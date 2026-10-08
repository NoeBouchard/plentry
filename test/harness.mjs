import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(ROOT, "index.html");

function makeQuery(tables, table) {
  const q = {
    _eq: {},
    _update: null,
    select() {
      return q;
    },
    eq(k, v) {
      q._eq[k] = v;
      return q;
    },
    order() {
      return q;
    },
    limit() {
      return q;
    },
    upsert(v, opts) {
      q._upsert = Array.isArray(v) ? v : [v];
      q._onConflict = (opts && opts.onConflict) || "id";
      return q;
    },
    insert(v) {
      q._insert = Array.isArray(v) ? v : [v];
      return q;
    },
    update(v) {
      q._update = v;
      return q;
    },
    delete() {
      q._delete = true;
      return q;
    },
    async maybeSingle() {
      const { data, error } = await run();
      return { data: (data && data[0]) || null, error };
    },
    async single() {
      return q.maybeSingle();
    },
    then(onFulfilled, onRejected) {
      return run().then(onFulfilled, onRejected);
    },
  };
  async function run() {
    if (!tables[table]) tables[table] = [];
    if (q._insert) {
      const rows = q._insert.map((row, i) => {
        const next = Object.assign({ id: tables[table].length + 1 + i }, row);
        tables[table].push(next);
        return next;
      });
      return { data: rows, error: null };
    }
    if (q._upsert) {
      const keys = String(q._onConflict || "id").split(",").map((s) => s.trim()).filter(Boolean);
      const rows = q._upsert.map((row) => {
        const idx = tables[table].findIndex((r) => keys.every((k) => r[k] === row[k]));
        if (idx >= 0) {
          Object.assign(tables[table][idx], row);
          return tables[table][idx];
        }
        const next = Object.assign({ id: tables[table].length + 1 }, row);
        tables[table].push(next);
        return next;
      });
      return { data: rows, error: null };
    }
    let rows = [...tables[table]];
    for (const [k, v] of Object.entries(q._eq)) rows = rows.filter((r) => r[k] === v);
    if (q._delete) {
      const ids = new Set(rows.map((r) => r.id));
      tables[table] = tables[table].filter((r) => !ids.has(r.id));
      return { data: rows, error: null };
    }
    if (q._update) rows.forEach((r) => Object.assign(r, q._update));
    return { data: rows, error: null };
  }
  return q;
}

function createMockSb(tables, session, mfa) {
  const auth = {
    getSession: async () =>
      session
        ? { data: { session: { access_token: "test-token", user: session } } }
        : { data: { session: null } },
    signUp: async () => ({ data: { user: null, session: null }, error: { message: "unit-test" } }),
    signInWithPassword: async () => ({
      data: { user: null, session: null },
      error: { message: "unit-test" },
    }),
    signOut: async () => ({ error: null }),
  };
  // Supabase MFA surface is opt-in per test (absent = no 2-step configured).
  if (mfa) auth.mfa = mfa;
  return {
    from(table) {
      return makeQuery(tables, table);
    },
    auth,
  };
}

/**
 * Fake `sb.auth.mfa` with one optional verified TOTP factor.
 * `state.level` flips to aal2 when challengeAndVerify gets `goodCode`.
 */
export function mockMfa({ enrolled = false, goodCode = "123456", qr = "data:image/svg+xml;utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3C%2Fsvg%3E" } = {}) {
  const state = { level: "aal1", factors: enrolled ? [{ id: "11111111-2222-4333-8444-555555555555", status: "verified" }] : [], calls: [] };
  const api = {
    state,
    getAuthenticatorAssuranceLevel: async () => ({
      data: { currentLevel: state.level, nextLevel: state.factors.some((f) => f.status === "verified") ? "aal2" : "aal1" },
      error: null,
    }),
    listFactors: async () => ({ data: { totp: state.factors.filter((f) => f.status === "verified"), all: state.factors }, error: null }),
    enroll: async (args) => {
      state.calls.push(["enroll", args]);
      const f = { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", status: "unverified" };
      state.factors.push(f);
      return { data: { id: f.id, type: "totp", totp: { qr_code: qr, secret: "JBSWY3DPEHPK3PXP", uri: "otpauth://totp/x" } }, error: null };
    },
    challengeAndVerify: async ({ factorId, code }) => {
      state.calls.push(["challengeAndVerify", { factorId, code }]);
      const f = state.factors.find((x) => x.id === factorId);
      if (!f || code !== goodCode) return { data: null, error: { message: "Invalid TOTP code" } };
      f.status = "verified";
      state.level = "aal2";
      return { data: { access_token: "aal2-token" }, error: null };
    },
    unenroll: async ({ factorId }) => {
      state.calls.push(["unenroll", { factorId }]);
      state.factors = state.factors.filter((x) => x.id !== factorId);
      state.level = "aal1";
      return { data: { id: factorId }, error: null };
    },
  };
  return api;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Load index.html in jsdom with a fake Supabase client and no network.
 * @param {object} [opts]
 * @param {object} [opts.tables] mutable { meals, orders, profiles, ingredient_prices }
 * @param {object|null} [opts.session] Supabase user if logged in
 * @param {object} [opts.localState] written to localStorage before the app script runs
 * @param {string} [opts.url]
 * @param {object} [opts.mfa] fake `sb.auth.mfa` (see mockMfa); omitted = no MFA surface
 */
export async function loadApp(opts = {}) {
  const tables = opts.tables || {
    meals: [],
    orders: [],
    profiles: [],
    ingredient_prices: [],
  };
  let html = readFileSync(INDEX, "utf8");
  // Drop the vendored supabase-js tag; the fake client is injected in beforeParse.
  html = html.replace(/<script src="\/vendor\/supabase-js-[0-9.]+\.js"><\/script>\s*/, "");

  const virtualConsole = new VirtualConsole();
  virtualConsole.sendTo(console, { omitJSDOMErrors: true });

  const dom = new JSDOM(html, {
    url: opts.url || "https://getplentry.com/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.fetch = async () => ({
        ok: false,
        status: 503,
        json: async () => ({ error: "offline" }),
      });
      if (opts.localState) {
        window.localStorage.setItem("plentry_v1", JSON.stringify(opts.localState));
      }
      window.__sbTables = tables;
      window.__mockSb = createMockSb(tables, opts.session || null, opts.mfa || null);
      window.supabase = { createClient: () => window.__mockSb };
    },
  });

  const w = dom.window;
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    if (typeof w.renderMenu === "function" && w.__plentry) break;
    await sleep(15);
  }
  if (typeof w.renderMenu !== "function") {
    throw new Error("App script did not load (renderMenu missing)");
  }
  // Let the async init IIFE finish (getSession + enterApp / onboarding).
  await sleep(40);
  return { window: w, document: w.document, tables, dom };
}

export const VALID_MEAL = {
  name: "Chicken & chickpea curry",
  emoji: "🍛",
  time: 30,
  ing: ["chicken thighs", "chickpeas", "curry paste", "coconut milk", "onions", "garlic", "rice", "spinach"],
};

export function extraMeals() {
  return [
    { name: "Salmon traybake", emoji: "🐟", time: 25, ing: ["salmon fillet", "potatoes", "broccoli", "lemons", "olive oil", "garlic"] },
    { name: "Beef ragù spaghetti", emoji: "🍝", time: 35, ing: ["minced beef", "spaghetti", "passata", "onions", "garlic", "parmesan"] },
    { name: "Halloumi fajitas", emoji: "🌮", time: 20, ing: ["halloumi", "tortillas", "bell peppers", "onions", "yoghurt", "lemons"] },
    { name: "Shakshuka", emoji: "🍳", time: 25, ing: ["eggs", "passata", "bell peppers", "onions", "garlic", "feta"] },
    { name: "Chickpea & spinach curry", emoji: "🥘", time: 20, ing: ["chickpeas", "curry paste", "coconut milk", "spinach", "onions", "rice", "tomatoes"] },
    { name: "Greek chicken bowls", emoji: "🥗", time: 30, ing: ["chicken thighs", "rice", "tomatoes", "feta", "yoghurt", "lemons", "garlic"] },
    { name: "Veggie spaghetti pomodoro", emoji: "🍅", time: 20, ing: ["spaghetti", "passata", "tomatoes", "garlic", "olive oil", "parmesan"] },
    { name: "Egg fried rice with broccoli", emoji: "🍚", time: 20, ing: ["eggs", "rice", "broccoli", "onions", "garlic"] },
    { name: "Baked feta pasta", emoji: "🧀", time: 30, ing: ["feta", "passata", "tomatoes", "garlic", "olive oil", "spaghetti"] },
  ];
}
