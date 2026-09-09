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
    upsert() {
      return Promise.resolve({ data: null, error: null });
    },
    update(v) {
      q._update = v;
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
    let rows = [...(tables[table] || [])];
    for (const [k, v] of Object.entries(q._eq)) rows = rows.filter((r) => r[k] === v);
    if (q._update) rows.forEach((r) => Object.assign(r, q._update));
    return { data: rows, error: null };
  }
  return q;
}

function createMockSb(tables, session) {
  return {
    from(table) {
      return makeQuery(tables, table);
    },
    auth: {
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
    },
  };
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
 */
export async function loadApp(opts = {}) {
  const tables = opts.tables || {
    meals: [],
    orders: [],
    profiles: [],
    ingredient_prices: [],
  };
  let html = readFileSync(INDEX, "utf8");
  html = html.replace(
    /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2\/dist\/umd\/supabase\.min\.js"><\/script>\s*/,
    "",
  );

  const virtualConsole = new VirtualConsole();
  virtualConsole.sendTo(console, { omitJSDOMErrors: true });

  const dom = new JSDOM(html, {
    url: opts.url || "https://plentry.vercel.app/",
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
      window.__mockSb = createMockSb(tables, opts.session || null);
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
