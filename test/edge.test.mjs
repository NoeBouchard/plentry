// Unit tests for edge-function helpers that have no `npm:` imports, so Node can
// load the .ts files directly (Node >= 22.18 strips types). The functions
// themselves (`pay`, `ai`, …) import `npm:@supabase/server` and stay covered by
// source contracts in contracts.test.mjs.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { allow, clientIdent, clientIp } from "../supabase/functions/_shared/ratelimit.ts";
import {
  CATALOG,
  basketTotal,
  cleanMeals,
  cleanRecipes,
  rebuildBasket,
  searchUrl,
  ukPostcode,
} from "../supabase/functions/_shared/orders.ts";
import {
  PACKS,
  basketFor,
  normServings,
  scalePortion,
  servingsFromHousehold,
} from "../supabase/functions/_shared/portions.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const req = (headers) => new Request("https://x.test/fn", { headers });

describe("S-04 server-built basket", () => {
  const rows = [
    { meal_key: "eggs", product_name: "Tesco Free Range Eggs", pack_size: "6 pk", price_gbp: "1.55" },
    { meal_key: "rice", product_name: "Tesco Basmati", pack_size: "1kg", price_gbp: 1.45 },
    { meal_key: null, display_name: "Soy Sauce", product_name: "Tesco Soy", pack_size: "150ml", price_gbp: 0.55 },
  ];

  it("keeps only catalog keys and rejects anything else (no £2.50 fallback for unknown items)", () => {
    const bad = rebuildBasket([{ i: "eggs", q: 1 }, { i: "caviar 1kg", q: 50 }], rows, "Tesco");
    assert.ok("error" in bad);
    assert.match(bad.error, /unknown item: caviar 1kg/);
    assert.ok("error" in rebuildBasket([], rows, "Tesco"));
    assert.ok("error" in rebuildBasket("nope", rows, "Tesco"));
    assert.ok("error" in rebuildBasket(Array.from({ length: 61 }, () => ({ i: "eggs", q: 1 })), rows, "Tesco"));
  });

  it("discards client-written product / search / price and rebuilds them from the store data", () => {
    const out = rebuildBasket(
      [{ i: "eggs", q: 2, product: "Bottle of Dom Pérignon", search: "https://evil.example/tesco-login", shelf_price: 0.01, pack: "<img>" }],
      rows,
      "Tesco",
    );
    assert.ok("basket" in out);
    const [line] = out.basket;
    assert.equal(line.product, "Tesco Free Range Eggs");
    assert.equal(line.pack, "6 pk");
    assert.equal(line.shelf_price, 1.55);
    assert.equal(line.search, "https://www.tesco.com/groceries/en-GB/search?query=Tesco%20Free%20Range%20Eggs");
    assert.equal(JSON.stringify(out.basket).includes("evil.example"), false);
    assert.equal(JSON.stringify(out.basket).includes("Dom"), false);
  });

  it("clamps quantities 1..50, merges duplicates, prices with shelf rows and a catalog-only fallback", () => {
    const out = rebuildBasket(
      [{ i: "eggs", q: 0 }, { i: "EGGS ", q: 99 }, { i: "butter", q: "2" }, { i: "soy sauce", q: 1 }],
      rows,
      "Tesco",
    );
    assert.ok("basket" in out);
    assert.deepEqual(out.basket.map((b) => [b.i, b.q]), [["eggs", 50], ["butter", 2], ["soy sauce", 1]]);
    assert.equal(out.basket[1].shelf_price, null, "no shelf row for butter at this store");
    assert.equal(out.basket[2].product, "Tesco Soy", "display_name rows still match");
    assert.equal(basketTotal(out.basket), Math.round((50 * 1.55 + 2 * 2.5 + 0.55) * 100) / 100);
  });

  it("search links only exist for the four whitelisted stores", () => {
    assert.equal(searchUrl("Lidl", "eggs"), null);
    assert.equal(searchUrl("Tesco", ""), null);
    assert.match(searchUrl("Sainsbury's", "free range eggs"), /^https:\/\/www\.sainsburys\.co\.uk\/gol-ui\/SearchResults\/free%20range%20eggs$/);
    assert.match(searchUrl("Asda", "a<b"), /^https:\/\/groceries\.asda\.com\/search\/a%3Cb$/);
    const out = rebuildBasket([{ i: "eggs", q: 1 }], rows, "Lidl");
    assert.equal(out.basket[0].search, null);
  });

  it("meal names are bounded and markup-free", () => {
    assert.equal(cleanMeals(Array(20).fill("more")).length, 7);
    // blanks drop out after the cap: 7 kept, 1 blank removed
    assert.equal(cleanMeals(["Shakshuka", "<b>x</b>", 42, "", ...Array(10).fill("more")]).length, 6);
    assert.deepEqual(cleanMeals(["Shakshuka", "<script>alert(1)</script>"]), ["Shakshuka", "scriptalert(1)/script"]);
    assert.deepEqual(cleanMeals(null), []);
  });

  it("cleanRecipes snapshots methods, prefers catalog rows, strips markup, and drops unknown ingredients", () => {
    const catalog = [{
      name: "Shakshuka",
      emoji: "🍳",
      time: 25,
      ing: ["eggs", "passata", "caviar"],
      recipe: { steps: ["<b>Make wells</b>", "Crack the eggs."], tip: 'Keep "yolks" soft.' },
    }];
    const client = [{
      name: "Shakshuka",
      recipe: { steps: ["IGNORE ME"], tip: "phishing" },
    }, {
      name: "Gone dinner",
      emoji: "🔥",
      time: 40,
      ing: ["eggs"],
      recipe: { steps: ["A".repeat(500)], tip: "x" },
    }];
    const out = cleanRecipes([...catalog, ...client], ["Shakshuka", "<b>Gone dinner</b>", ""]);
    assert.equal(out.length, 2);
    assert.equal(out[0].name, "Shakshuka");
    assert.deepEqual(out[0].recipe.steps, ["bMake wells/b", "Crack the eggs."]);
    assert.equal(out[0].recipe.tip, "Keep yolks soft.");
    assert.ok(!out[0].ing.includes("caviar"));
    assert.ok(out[0].ing.includes("eggs"));
    assert.equal(out[1].name, "bGone dinner/b");
    assert.equal(out[1].recipe, null, "name mismatch after clean → no client method");
    const gone = cleanRecipes(client, ["Gone dinner"]);
    assert.equal(gone[0].recipe.steps[0].length, 400);
    assert.deepEqual(cleanRecipes(null, null), []);
  });

  it("CATALOG matches ai/index.ts and the INGREDIENTS keys in index.html", () => {
    const ai = readFileSync(path.join(ROOT, "supabase/functions/ai/index.ts"), "utf8");
    const html = readFileSync(path.join(ROOT, "index.html"), "utf8");
    const aiBlock = ai.match(/const CATALOG = \[([\s\S]*?)\n\]/)[1];
    const aiKeys = [...aiBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    const ingBlock = html.match(/const INGREDIENTS=\{([\s\S]*?)\n\};/)[1];
    const htmlKeys = [...ingBlock.matchAll(/"([^"]+)":\{unit/g)].map((m) => m[1]);
    assert.deepEqual([...CATALOG].sort(), [...aiKeys].sort());
    assert.deepEqual([...CATALOG].sort(), [...htmlKeys].sort());
    assert.equal(CATALOG.length, 46);
    const packRe = /"([^"]+)":\{unit:"[^"]*",pack:(null|\d+),pu:"([^"]*)"/g;
    const htmlPacks = {};
    for (const m of ingBlock.matchAll(packRe)) htmlPacks[m[1]] = { pack: m[2] === "null" ? null : Number(m[2]), pu: m[3] };
    assert.deepEqual(htmlPacks, PACKS);
  });

  it("I-P02 / I-P03 / I-P04 Beef ragù for 4 is whole packs, not a price multiplier", () => {
    const ragu = {
      name: "Beef ragù spaghetti",
      ing: ["black pepper", "garlic", "minced beef", "mixed herbs", "olive oil", "onions", "parmesan", "passata", "salt", "soy sauce", "spaghetti", "stock cubes"],
      portions: {
        "black pepper": [0.25, "tsp"],
        garlic: [2, "clove"],
        "minced beef": [400, "g"],
        "mixed herbs": [1, "tsp"],
        "olive oil": [1, "tbsp"],
        onions: [1, "pc"],
        parmesan: [30, "g"],
        passata: [400, "g"],
        salt: [0.5, "tsp"],
        "soy sauce": [1, "tsp"],
        spaghetti: [180, "g"],
        "stock cubes": [1, "pc"],
      },
    };
    assert.equal(scalePortion(2, "clove", "garlic", 6), 5, "garlic at 6 is 0.75 × the factor, rounded up");
    assert.equal(scalePortion(1, "pc", "onions", 4), 2);
    const packs = basketFor([ragu], 4, [], PACKS, true);
    assert.equal(packs["minced beef"], 2);
    assert.equal(packs.passata, 2);
    assert.equal(packs.spaghetti, 1);
    assert.equal(packs.parmesan, 1);
    assert.equal(packs.onions, 1);
    assert.equal(packs.garlic, 1);
    assert.equal(packs["olive oil"], 1);
    assert.equal(packs["stock cubes"], 1);
    assert.equal(packs.salt, 1);
    assert.ok(Object.values(packs).every((q) => Number.isInteger(q) && q >= 1));
    const ticked = basketFor([ragu], 4, ["salt", "stock cubes", "olive oil"], PACKS, true);
    assert.equal(ticked.salt, undefined);
    assert.equal(ticked["stock cubes"], undefined);
    assert.equal(ticked["olive oil"], undefined);
    assert.equal(ticked["minced beef"], 2, "cupboard ticks do not scale groceries");
    const doubled = basketFor([ragu, ragu], 4, [], PACKS, true);
    assert.equal(doubled["minced beef"], 4, "portioned meals add, they are not a flat ×2 of the pack price");
    const legacy = { name: "Old dinner", ing: ["eggs", "onions", "salt"] };
    assert.deepEqual(
      basketFor([legacy, { name: "Another", ing: ["eggs", "onions"] }], 6, [], PACKS, true),
      { eggs: 1, onions: 1, salt: 1 },
      "a meal without portions contributes 1 pack, shared keys stay at 1",
    );
    assert.throws(() => basketFor([{ ing: [], portions: { "minced beef": [400, "pc"] } }], 2, [], PACKS, true), /unit mismatch/);
    const soft = basketFor([{ ing: [], portions: { "minced beef": [400, "pc"] } }], 2, [], PACKS, false);
    assert.equal(soft["minced beef"], 1, "a bad unit falls back to 1 pack");
    assert.equal(normServings(3), 4);
    assert.equal(normServings(5), 6);
    assert.equal(servingsFromHousehold("1"), 2);
    assert.equal(servingsFromHousehold("3"), 4);
    assert.equal(servingsFromHousehold("4+"), 4);
    assert.equal(servingsFromHousehold("6"), 6);
    const html = readFileSync(path.join(ROOT, "index.html"), "utf8");
    const ts = readFileSync(path.join(ROOT, "supabase/functions/_shared/portions.ts"), "utf8");
    const grab = (s) => {
      const a = s.indexOf("/* portions:start */");
      const b = s.indexOf("/* portions:end */");
      return s.slice(a, b + "/* portions:end */".length);
    };
    assert.equal(grab(html), grab(ts), "client and server basketFor are the same source");
  });
});

describe("edge functions parse", () => {
  // Node strips the types and parses each module before resolving imports, so a
  // syntax error surfaces as SyntaxError while a healthy file fails only on the
  // `npm:` specifier Node cannot load. Cheap pre-deploy guard (no Deno locally).
  for (const fn of ["pay", "stripe-webhook", "notify-order", "ai", "checkout", "newcoming"]) {
    it(`${fn}/index.ts is syntactically valid TypeScript`, async () => {
      const url = new URL(`../supabase/functions/${fn}/index.ts`, import.meta.url);
      try {
        await import(url.href);
      } catch (e) {
        assert.notEqual(e.name, "SyntaxError", String(e.message).split("\n")[0]);
        assert.match(String(e.message), /npm:|ERR_UNSUPPORTED_ESM_URL_SCHEME/, "only the npm: import may fail under Node");
      }
    });
  }
});

describe("S-05 webhook postcode guard", () => {
  it("normalises UK postcodes and returns null for anything else", () => {
    assert.equal(ukPostcode("e2 8aa"), "E2 8AA");
    assert.equal(ukPostcode("SW1A1AA"), "SW1A 1AA");
    assert.equal(ukPostcode("  ec1a  1bb "), "EC1A 1BB");
    assert.equal(ukPostcode("90210"), null);
    assert.equal(ukPostcode("75008 Paris"), null);
    assert.equal(ukPostcode(""), null);
    assert.equal(ukPostcode(null), null);
  });
});

describe("S-03 rate-limit identity", () => {
  it("uses the LAST x-forwarded-for entry (proxy-appended), not the client-supplied first one", () => {
    assert.equal(clientIp(req({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" })), "203.0.113.9");
    assert.equal(clientIp(req({ "x-forwarded-for": "spoofed, 10.0.0.1 , 203.0.113.9" })), "203.0.113.9");
    assert.equal(clientIp(req({ "x-forwarded-for": "203.0.113.9" })), "203.0.113.9");
  });

  it("a rotating spoofed prefix maps to the same bucket", () => {
    const a = clientIdent(req({ "x-forwarded-for": "9.9.9.1, 203.0.113.9" }), {});
    const b = clientIdent(req({ "x-forwarded-for": "9.9.9.2, 203.0.113.9" }), {});
    assert.equal(a, b);
    assert.equal(a, "ip:203.0.113.9");
  });

  it("strips non-address characters and bounds the key", () => {
    const ip = clientIp(req({ "x-forwarded-for": "<script>alert(1)</script>" + "f".repeat(200) }));
    assert.ok(ip.length <= 45, "bounded");
    assert.doesNotMatch(ip, /[<>()]/);
    assert.equal(clientIp(req({})), "unknown");
    assert.equal(clientIp(req({ "x-real-ip": "2001:db8::1" })), "2001:db8::1");
  });

  it("prefers the verified user id over any header", () => {
    const id = clientIdent(req({ "x-forwarded-for": "1.1.1.1" }), { userClaims: { sub: "user-123" } });
    assert.equal(id, "user-123");
  });
});

describe("S-01/S-03 rate-limit fail policy", () => {
  const rpcError = { rpc: async () => ({ data: null, error: { message: "function does not exist" } }) };
  const rpcThrows = { rpc: async () => { throw new Error("network"); } };
  const rpcOver = { rpc: async () => ({ data: false, error: null }) };
  const rpcOk = { rpc: async () => ({ data: true, error: null }) };

  it("signed-in callers fail open on a limiter error", async () => {
    assert.equal(await allow(rpcError, "ai", "user-1", 40, 60, true), true);
    assert.equal(await allow(rpcThrows, "ai", "user-1", 40, 60, true), true);
  });

  it("anonymous callers fail CLOSED on a limiter error", async () => {
    assert.equal(await allow(rpcError, "ai", "ip:203.0.113.9", 40, 60, false), false);
    assert.equal(await allow(rpcThrows, "ai", "ip:203.0.113.9", 40, 60, false), false);
  });

  it("respects the RPC verdict and calls check_rate_limit with the bucket args", async () => {
    let seen = null;
    const spy = { rpc: async (fn, args) => { seen = { fn, args }; return { data: true, error: null }; } };
    assert.equal(await allow(spy, "pay", "user-1", 15, 60), true);
    assert.equal(seen.fn, "check_rate_limit");
    assert.deepEqual(seen.args, { p_bucket: "pay", p_ident: "user-1", p_max: 15, p_window_seconds: 60 });
    assert.equal(await allow(rpcOver, "ai", "ip:1", 40, 60), false);
    assert.equal(await allow(rpcOk, "ai", "ip:1", 40, 60), true);
  });
});
