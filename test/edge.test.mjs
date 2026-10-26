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
  CAPTURE_DB_ATTEMPTS,
  captureSplit,
  runCapture,
  runReconcile,
  splitAssertOk,
} from "../supabase/functions/_shared/capture.ts";
import { sendTelegram } from "../supabase/functions/_shared/telegram.ts";
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
  firstShelfRow,
  storePacksFromPrices,
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
    const ingBlock = html.match(/const INGREDIENTS_FALLBACK=\{([\s\S]*?)\n\};/)[1];
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

  it("meal order invariance: basket is the same regardless of meal order (Bug 1 fix)", () => {
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
    const pomodoroNoPorts = {
      name: "Veggie spaghetti pomodoro",
      ing: ["fresh basil", "garlic", "olive oil", "onions", "parmesan", "passata", "salt", "spaghetti", "black pepper"],
    };
    const order1 = basketFor([ragu, pomodoroNoPorts], 2, [], PACKS, true);
    const order2 = basketFor([pomodoroNoPorts, ragu], 2, [], PACKS, true);
    assert.deepEqual(order1, order2, "ragù then no-portions pomodoro equals reversed");
    assert.equal(order1.passata, 2, "400g leaves 100g spare in a 500g pack, under half, so +1");
    assert.equal(order1.spaghetti, 1, "180g leaves 320g spare in a 500g pack, so no extra");
    const salmon = { name: "Salmon traybake", ing: ["broccoli", "lemons", "olive oil", "salmon fillet", "soy sauce"] };
    const mix1 = basketFor([ragu, salmon], 4, [], PACKS, true);
    const mix2 = basketFor([salmon, ragu], 4, [], PACKS, true);
    assert.deepEqual(mix1, mix2, "portioned meal + non-portioned meal is order-independent");
  });

  it("half-pack spare: Tesco week at 2 servings does not add a pack when spare is at least half", () => {
    const ragu = {
      name: "Beef ragù spaghetti",
      ing: ["black pepper", "garlic", "minced beef", "mixed herbs", "olive oil", "onions", "parmesan", "passata", "salt", "soy sauce", "spaghetti", "stock cubes"],
      portions: { salt: [0.5, "tsp"], garlic: [2, "clove"], onions: [1, "pc"], passata: [400, "g"], parmesan: [30, "g"], "olive oil": [1, "tbsp"], "soy sauce": [1, "tsp"], spaghetti: [180, "g"], "minced beef": [400, "g"], "mixed herbs": [1, "tsp"], "stock cubes": [1, "pc"], "black pepper": [0.25, "tsp"] },
    };
    const shakshuka = {
      name: "Shakshuka",
      ing: ["bell peppers", "black pepper", "chilli flakes", "cumin", "eggs", "feta", "garlic", "olive oil", "onions", "paprika", "passata", "salt", "tortillas"],
      portions: { eggs: [4, "pc"], feta: [80, "g"], salt: [0.75, "tsp"], cumin: [1, "tsp"], garlic: [4, "clove"], onions: [1, "pc"], paprika: [1, "tsp"], passata: [400, "g"], "olive oil": [2, "tbsp"], tortillas: [4, "pc"], "bell peppers": [2, "pc"], "chilli flakes": [0.5, "tsp"] },
    };
    const tortilla = {
      name: "Spanish tortilla with tomato salad",
      ing: ["black pepper", "eggs", "olive oil", "onions", "potatoes", "salt", "tomatoes"],
      portions: { eggs: [5, "pc"], salt: [0.5, "tsp"], onions: [1, "pc"], potatoes: [400, "g"], tomatoes: [3, "pc"], "olive oil": [5, "tbsp"] },
    };
    const salmon = { name: "Salmon traybake", ing: ["black pepper", "broccoli", "garlic", "lemons", "olive oil", "paprika", "potatoes", "salmon fillet", "salt"] };
    const forward = basketFor([ragu, shakshuka, tortilla, salmon], 2, [], PACKS, true);
    const reverse = basketFor([salmon, tortilla, shakshuka, ragu], 2, [], PACKS, true);
    assert.deepEqual(forward, reverse);
    assert.equal(forward.garlic, 1);
    assert.equal(forward["olive oil"], 1);
    assert.equal(forward.potatoes, 1);
  });

  it("potatoes are a 2kg bag: the Tesco week at 4 servings is 1 pack", () => {
    assert.equal(PACKS.potatoes.pack, 2000);
    assert.equal(PACKS.potatoes.pu, "g");
    const ragu = {
      name: "Beef ragù spaghetti",
      ing: ["black pepper", "garlic", "minced beef", "mixed herbs", "olive oil", "onions", "parmesan", "passata", "salt", "soy sauce", "spaghetti", "stock cubes"],
      portions: { salt: [0.5, "tsp"], garlic: [2, "clove"], onions: [1, "pc"], passata: [400, "g"], parmesan: [30, "g"], "olive oil": [1, "tbsp"], "soy sauce": [1, "tsp"], spaghetti: [180, "g"], "minced beef": [400, "g"], "mixed herbs": [1, "tsp"], "stock cubes": [1, "pc"], "black pepper": [0.25, "tsp"] },
    };
    const shakshuka = {
      name: "Shakshuka",
      ing: ["bell peppers", "black pepper", "chilli flakes", "cumin", "eggs", "feta", "garlic", "olive oil", "onions", "paprika", "passata", "salt", "tortillas"],
      portions: { eggs: [4, "pc"], feta: [80, "g"], salt: [0.75, "tsp"], cumin: [1, "tsp"], garlic: [4, "clove"], onions: [1, "pc"], paprika: [1, "tsp"], passata: [400, "g"], "olive oil": [2, "tbsp"], tortillas: [4, "pc"], "bell peppers": [2, "pc"], "chilli flakes": [0.5, "tsp"] },
    };
    const tortilla = {
      name: "Spanish tortilla with tomato salad",
      ing: ["black pepper", "eggs", "olive oil", "onions", "potatoes", "salt", "tomatoes"],
      portions: { eggs: [5, "pc"], salt: [0.5, "tsp"], onions: [1, "pc"], potatoes: [400, "g"], tomatoes: [3, "pc"], "olive oil": [5, "tbsp"] },
    };
    const salmon = { name: "Salmon traybake", ing: ["black pepper", "broccoli", "garlic", "lemons", "olive oil", "paprika", "potatoes", "salmon fillet", "salt"] };
    const packs = basketFor([ragu, shakshuka, tortilla, salmon], 4, [], PACKS, true);
    assert.equal(packs.potatoes, 1, "800g from the tortilla, spare 1200g of a 2kg bag, so salmon does not add a bag");
  });

  it("Spanish tortilla alone at 6 servings is 1 potato pack (1200g into a 2kg bag)", () => {
    const tortilla = {
      name: "Spanish tortilla with tomato salad",
      ing: ["black pepper", "eggs", "olive oil", "onions", "potatoes", "salt", "tomatoes"],
      portions: { potatoes: [400, "g"] },
    };
    assert.equal(basketFor([tortilla], 6, [], PACKS, true).potatoes, 1);
  });

  it("I-P02 store packs: garlic 10 at Sainsbury's and Waitrose, 40 at Tesco; parmesan 200g at Tesco and Asda, 80g at Sainsbury's and Waitrose", () => {
    const ragu = {
      name: "Beef ragù spaghetti",
      ing: ["black pepper", "garlic", "minced beef", "mixed herbs", "olive oil", "onions", "parmesan", "passata", "salt", "soy sauce", "spaghetti", "stock cubes"],
      portions: { salt: [0.5, "tsp"], garlic: [2, "clove"], onions: [1, "pc"], passata: [400, "g"], parmesan: [30, "g"], "olive oil": [1, "tbsp"], "soy sauce": [1, "tsp"], spaghetti: [180, "g"], "minced beef": [400, "g"], "mixed herbs": [1, "tsp"], "stock cubes": [1, "pc"], "black pepper": [0.25, "tsp"] },
    };
    const shakshuka = {
      name: "Shakshuka",
      ing: ["bell peppers", "black pepper", "chilli flakes", "cumin", "eggs", "feta", "garlic", "olive oil", "onions", "paprika", "passata", "salt", "tortillas"],
      portions: { eggs: [4, "pc"], feta: [80, "g"], salt: [0.75, "tsp"], cumin: [1, "tsp"], garlic: [4, "clove"], onions: [1, "pc"], paprika: [1, "tsp"], passata: [400, "g"], "olive oil": [2, "tbsp"], tortillas: [4, "pc"], "bell peppers": [2, "pc"], "chilli flakes": [0.5, "tsp"] },
    };
    const tortilla = {
      name: "Spanish tortilla with tomato salad",
      ing: ["black pepper", "eggs", "olive oil", "onions", "potatoes", "salt", "tomatoes"],
      portions: { eggs: [5, "pc"], salt: [0.5, "tsp"], onions: [1, "pc"], potatoes: [400, "g"], tomatoes: [3, "pc"], "olive oil": [5, "tbsp"] },
    };
    const salmon = { name: "Salmon traybake", ing: ["black pepper", "broccoli", "garlic", "lemons", "olive oil", "paprika", "potatoes", "salmon fillet", "salt"] };
    const week = [ragu, shakshuka, tortilla, salmon];
    const garlic = (pack) => basketFor(week, 4, [], PACKS, true, { garlic: { pack, pu: "clove" } }).garlic;
    assert.equal(garlic(40), 1, "Tesco 40-clove pack");
    assert.equal(garlic(10), 2, "Sainsbury's and Waitrose 10-clove bulb");
    const parm = (pack) => basketFor([ragu], 6, [], PACKS, true, { parmesan: { pack, pu: "g" } }).parmesan;
    assert.equal(parm(200), 1, "Tesco and Asda 200g");
    assert.equal(parm(80), 2, "Sainsbury's and Waitrose 80g, 90g need at 6 servings");
    assert.equal(basketFor(week, 4, ["garlic"], PACKS, true, { garlic: { pack: 10, pu: "clove" } }).garlic, undefined);
    assert.equal(basketFor([{ ing: ["salt"], portions: { salt: [2, "tsp"] } }], 6, [], PACKS, true, { salt: { pack: 750, pu: "g" } }).salt, 1);
  });

  it("I-P02 Waitrose potatoes are 2500g, and a unit mismatch keeps the code pack", () => {
    const heavy = { name: "Potato pot", ing: ["potatoes"], portions: { potatoes: [2200, "g"] } };
    assert.equal(basketFor([heavy], 2, [], PACKS, true).potatoes, 2, "2200g needs two 2kg bags");
    assert.equal(basketFor([heavy], 2, [], PACKS, true, { potatoes: { pack: 2500, pu: "g" } }).potatoes, 1);
    assert.equal(basketFor([heavy], 2, [], PACKS, true, { potatoes: { pack: 2.5, pu: "kg" } }).potatoes, 1, "kg converts exactly to g");
    const week = [
      { name: "Spanish tortilla with tomato salad", ing: ["potatoes"], portions: { potatoes: [400, "g"] } },
      { name: "Salmon traybake", ing: ["potatoes", "salmon fillet"] },
    ];
    assert.equal(basketFor(week, 4, [], PACKS, true, { potatoes: { pack: 2500, pu: "g" } }).potatoes, 1);
    const masala = { name: "Masala", ing: ["garam masala"], portions: { "garam masala": [25, "tsp"] } };
    assert.equal(basketFor([masala], 2, [], PACKS, true)["garam masala"], 1, "I-P03 garam masala is 1 pack, not ceil(25 tsp / 20)");
    assert.equal(basketFor([masala], 2, [], PACKS, true, { "garam masala": { pack: 38, pu: "g" } })["garam masala"], 1, "a 38g shelf row does not scale a seasoning");
    const onions = { name: "Onions", ing: ["red onions"], portions: { "red onions": [4, "pc"] } };
    assert.equal(basketFor([onions], 2, [], PACKS, true, { "red onions": { pack: 1000, pu: "g" } })["red onions"], 2, "1000g does not replace a 3pc pack");
  });

  it("I-P04 the same store rows give the client and pay the same pack counts and the same hold", () => {
    const ragu = {
      name: "Beef ragù spaghetti",
      ing: ["garlic", "parmesan", "minced beef", "salt"],
      portions: { garlic: [2, "clove"], parmesan: [30, "g"], "minced beef": [400, "g"], salt: [0.5, "tsp"] },
    };
    const rows = [
      { meal_key: "garlic", pack_qty: "10", pack_unit: "clove", price_gbp: 0.5 },
      { meal_key: "parmesan", pack_qty: 80, pack_unit: "g", price_gbp: 2.9 },
      { meal_key: "minced beef", pack_qty: 500, pack_unit: "g", price_gbp: 3.95 },
      { meal_key: null, display_name: "Garlic", pack_qty: 1, pack_unit: "pc", price_gbp: 9 },
    ];
    const fromPay = storePacksFromPrices(rows);
    const fromClient = { garlic: { pack: 10, pu: "clove" }, parmesan: { pack: 80, pu: "g" }, "minced beef": { pack: 500, pu: "g" } };
    assert.deepEqual(fromPay, fromClient);
    const payPacks = basketFor([ragu], 4, [], PACKS, false, fromPay);
    const clientPacks = basketFor([ragu], 4, [], PACKS, false, fromClient);
    assert.deepEqual(payPacks, clientPacks);
    assert.equal(payPacks.garlic, 1);
    assert.equal(payPacks.parmesan, 1);
    assert.equal(payPacks["minced beef"], 2);
    assert.equal(payPacks.salt, 1);
    const price = { garlic: 0.5, parmesan: 2.9, "minced beef": 3.95, salt: 2.5 };
    let groceries = 0;
    for (const [k, q] of Object.entries(payPacks)) groceries += q * price[k];
    groceries = Math.round(groceries * 100) / 100;
    assert.equal(groceries, Math.round((0.5 + 2.9 + 3.95 * 2 + 2.5) * 100) / 100);
    const fee = 3.5;
    const est = Math.round((groceries + fee) * 100) / 100;
    const hold = Math.round(est * 1.05 * 1.30 * 100);
    assert.equal(hold, Math.round(17.3 * 1.05 * 1.30 * 100));
    assert.equal(hold, 2361);
  });

  it("duplicate meal_key rows use the lowest id, or the first row when there is no id", () => {
    const later = { id: 2, meal_key: "garlic", pack_qty: 40, pack_unit: "clove" };
    const earlier = { id: 1, meal_key: "garlic", pack_qty: 10, pack_unit: "clove" };
    assert.equal(firstShelfRow([later, earlier]), earlier);
    assert.deepEqual(storePacksFromPrices([later, earlier]).garlic, { pack: 10, pu: "clove" });
    const first = { meal_key: "garlic", pack_qty: 40, pack_unit: "clove" };
    const second = { meal_key: "garlic", pack_qty: 10, pack_unit: "clove" };
    assert.equal(firstShelfRow([first, second]), first);
    assert.deepEqual(storePacksFromPrices([first, second]).garlic, { pack: 40, pu: "clove" });
    const blank = { id: 1, meal_key: "garlic", pack_qty: null, pack_unit: "" };
    const other = { id: 4, meal_key: "garlic", pack_qty: 10, pack_unit: "clove" };
    assert.equal(storePacksFromPrices([other, blank]).garlic, undefined);
  });

  it("I-P03 garam masala is 1 pack at 2, 4 and 6 servings, skipped when ticked, and the hold moves only by that line", () => {
    // Live portions (2-serving base). Chicken & chickpea curry is 1 tsp.
    // A 20 tsp jar used to be ceil(tsp × servings/2 / 20): 1 pack at 2, 4 and 6 for that one meal.
    // A week that sums past 20 tsp (8 tsp base → 24 tsp at 6 servings) used to be 2 packs.
    assert.deepEqual(PACKS["garam masala"], { pack: null, pu: "" });
    const meal = (name, tsp) => ({
      name,
      ing: ["garam masala", "chicken thighs", "rice", "salt"],
      portions: { "garam masala": [tsp, "tsp"], "chicken thighs": [4, "pc"], rice: [150, "g"], salt: [0.5, "tsp"] },
    });
    const one = meal("Chicken & chickpea curry", 1);
    const week = [
      meal("Chicken & chickpea curry", 1),
      meal("Beef & potato curry", 1),
      meal("Beef keema with rice", 1),
      meal("Chicken saag-style curry", 2),
      meal("Curried Chickpea & Tomato Coconut Soup", 1),
      meal("Chicken tikka-style wraps", 1),
      meal("Tandoori-style yoghurt chicken with rice", 1),
    ];
    const priceOf = (k) => (k === "garam masala" ? 1.1 : 1);
    const grocery = (packs) => {
      let t = 0;
      for (const [k, q] of Object.entries(packs)) t += q * priceOf(k);
      return Math.round(t * 100) / 100;
    };
    // Tesco delivery £3, then the same hold as pay: (groceries + fee) × 1.05 × 1.30, in pence.
    const holdPence = (groceries) => {
      const est = Math.round((groceries + 3) * 100) / 100;
      return Math.round(est * 1.05 * 1.30 * 100);
    };
    for (const servings of [2, 4, 6]) {
      assert.equal(basketFor([one], servings, [], PACKS, true)["garam masala"], 1, "one curry meal");
      const packs = basketFor(week, servings, [], PACKS, true);
      const ticked = basketFor(week, servings, ["garam masala"], PACKS, true);
      assert.equal(packs["garam masala"], 1, "curry week stays 1 pack at " + servings);
      assert.equal(ticked["garam masala"], undefined);
      const rest = { ...packs };
      delete rest["garam masala"];
      assert.deepEqual(ticked, rest, "cupboard tick removes only garam masala");
      const on = grocery(packs);
      const off = grocery(ticked);
      assert.equal(Math.round((on - off) * 100) / 100, 1.1);
      assert.equal(holdPence(on), holdPence(off + 1.1), "hold changes only by the 1-pack line");
    }
    assert.equal(basketFor([one], 4, ["garam masala"], PACKS, true)["garam masala"], undefined);
    assert.equal(basketFor(week, 6, [], PACKS, true, { "garam masala": { pack: 38, pu: "g" } })["garam masala"], 1);
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

describe("I-M10 capture split", () => {
  function pence(n) {
    return Math.round(Number(n) * 100);
  }

  it("normal, overrun, till above the hold, and pence rounding", () => {
    const normal = captureSplit(25, 40);
    assert.equal(pence(normal.store_total), 2500);
    assert.equal(pence(normal.amount_captured), 2625);
    assert.equal(pence(normal.fee_amount), 125);
    assert.equal(pence(normal.overrun_amount), 0);
    assert.equal(splitAssertOk(normal), true);

    const overrun = captureSplit(10, 10.2);
    assert.equal(pence(overrun.amount_captured), 1020);
    assert.equal(pence(overrun.fee_amount), 20);
    assert.equal(pence(overrun.overrun_amount), 30);
    assert.equal(splitAssertOk(overrun), true);

    const above = captureSplit(10, 4.58);
    assert.equal(pence(above.amount_captured), 458);
    assert.equal(pence(above.store_total), 1000);
    assert.equal(pence(above.fee_amount), -542);
    assert.equal(pence(above.overrun_amount), 592);
    assert.equal(splitAssertOk(above), true);

    const penny = captureSplit(19.99, 100);
    assert.equal(pence(penny.amount_captured), 2099);
    assert.equal(pence(penny.fee_amount), 100);
    assert.equal(pence(captureSplit(0.1, 10).amount_captured), 11);
    assert.equal(pence(captureSplit(1, 10).amount_captured), 105);
    assert.equal(splitAssertOk(penny), true);
  });

  function captureCalls(over = {}) {
    const calls = { gets: 0, captures: [], updates: [], alerts: [], logs: [], sleeps: [] };
    const opts = {
      order: { id: 42, payment_intent: "pi_test_42", amount_held: 40, payment_status: "authorized" },
      amountGbp: 25,
      stripeGet: async () => {
        calls.gets += 1;
        return { ok: true, j: { id: "pi_test_42", status: "requires_capture" } };
      },
      stripeCapture: async (pi, amountToCapturePence) => {
        calls.captures.push({ pi, amountToCapturePence });
        return { ok: true, j: { status: "succeeded", amount_received: amountToCapturePence } };
      },
      updateOrder: async (id, patch) => {
        calls.updates.push({ id, patch });
        return { error: null, rows: 1 };
      },
      alert: async (text) => {
        calls.alerts.push(text);
      },
      log: (message, fields) => {
        calls.logs.push({ message, fields });
      },
      sleep: async (ms) => {
        calls.sleeps.push(ms);
      },
      ...over,
    };
    return { calls, opts };
  }

  it("retries an orders update that fails once, then succeeds, and does not capture twice", async () => {
    let n = 0;
    const { calls, opts } = captureCalls({
      updateOrder: async (id, patch) => {
        n += 1;
        calls.updates.push({ id, patch });
        if (n === 1) return { error: { code: "40P01", message: "deadlock" }, rows: 0 };
        return { error: null, rows: 1 };
      },
    });
    const res = await runCapture(opts);
    assert.equal(res.status, 200);
    assert.equal(res.body.live, true);
    assert.equal(n, 2);
    assert.equal(calls.captures.length, 1);
    assert.equal(calls.captures[0].amountToCapturePence, 2625);
    assert.deepEqual(Object.keys(calls.updates[1].patch).sort(), [
      "amount_captured",
      "fee_amount",
      "overrun_amount",
      "payment_status",
      "store_total",
    ]);
    assert.equal(pence(calls.updates[1].patch.store_total), 2500);
    assert.equal(pence(calls.updates[1].patch.amount_captured), 2625);
    assert.equal(pence(calls.updates[1].patch.fee_amount), 125);
    assert.equal(pence(calls.updates[1].patch.overrun_amount), 0);
    assert.equal(calls.updates[1].patch.payment_status, "captured");
    assert.equal(calls.alerts.length, 0);
    assert.equal(calls.sleeps.length, 1);
  });

  it("alerts and returns non-2xx when the orders update never succeeds", async () => {
    const { calls, opts } = captureCalls({
      updateOrder: async (id, patch) => {
        calls.updates.push({ id, patch });
        return { error: { code: "42703", message: "column store_total does not exist" }, rows: 0 };
      },
    });
    const res = await runCapture(opts);
    assert.equal(res.status, 500);
    assert.equal(res.body.error, "capture_not_recorded");
    assert.equal(res.body.live, undefined);
    assert.equal(calls.updates.length, CAPTURE_DB_ATTEMPTS);
    assert.equal(calls.captures.length, 1);
    assert.equal(calls.sleeps.length, CAPTURE_DB_ATTEMPTS - 1);
    assert.equal(calls.alerts.length, 1);
    assert.match(calls.alerts[0], /order #42/);
    assert.match(calls.alerts[0], /pi_test_42/);
    assert.match(calls.alerts[0], /£26\.25/);
    assert.equal(calls.logs.length, 1);
    assert.equal(calls.logs[0].fields.order_id, "42");
    assert.equal(calls.logs[0].fields.payment_intent, "pi_test_42");
    const dumped = JSON.stringify(calls.logs) + calls.alerts.join("\n");
    assert.doesNotMatch(dumped, /sk_live|sk_test|bot/);
  });

  it("does not capture a PaymentIntent that already succeeded, and writes amount_received", async () => {
    const { calls, opts } = captureCalls({
      amountGbp: undefined,
      stripeGet: async () => {
        calls.gets += 1;
        return { ok: true, j: { status: "succeeded", amount_received: 2625 } };
      },
    });
    const res = await runCapture(opts);
    assert.equal(res.status, 200);
    assert.equal(res.body.already_captured, true);
    assert.equal(pence(res.body.captured_gbp), 2625);
    assert.equal(calls.captures.length, 0);
    assert.equal(calls.updates.length, 1);
    assert.deepEqual(Object.keys(calls.updates[0].patch).sort(), ["amount_captured", "payment_status"]);
    assert.equal(pence(calls.updates[0].patch.amount_captured), 2625);
    assert.equal(calls.updates[0].patch.payment_status, "captured");
    assert.equal(calls.alerts.length, 0);
  });

  it("writes the split on an already-succeeded PaymentIntent when the till is supplied", async () => {
    const { calls, opts } = captureCalls({
      stripeGet: async () => ({ ok: true, j: { status: "succeeded", amount_received: 2625 } }),
    });
    const res = await runCapture(opts);
    assert.equal(res.status, 200);
    assert.equal(calls.captures.length, 0);
    assert.equal(pence(calls.updates[0].patch.amount_captured), 2625);
    assert.equal(pence(calls.updates[0].patch.store_total), 2500);
    assert.equal(pence(calls.updates[0].patch.fee_amount), 125);
    assert.equal(pence(calls.updates[0].patch.overrun_amount), 0);
  });

  it("alerts on an assertion mismatch and still captures", async () => {
    const { calls, opts } = captureCalls({
      computeSplit: () => ({
        store_total: 25,
        amount_captured: 26.26,
        fee_amount: 1.26,
        overrun_amount: 0,
        gross: 26.25,
        hold: 40,
      }),
    });
    const res = await runCapture(opts);
    assert.equal(res.status, 200);
    assert.equal(calls.captures.length, 1);
    assert.equal(calls.captures[0].amountToCapturePence, 2626);
    assert.equal(calls.alerts.length, 1);
    assert.match(calls.alerts[0], /does not match min\(store/);
    assert.match(calls.alerts[0], /pi_test_42/);
    assert.match(calls.alerts[0], /order #42/);
  });

  it("alerts when the fee is negative and still captures the hold", async () => {
    const { calls, opts } = captureCalls({
      order: { id: 42, payment_intent: "pi_test_42", amount_held: 4.58, payment_status: "authorized" },
      amountGbp: 10,
    });
    const res = await runCapture(opts);
    assert.equal(res.status, 200);
    assert.equal(calls.captures[0].amountToCapturePence, 458);
    assert.equal(pence(calls.updates[0].patch.fee_amount), -542);
    assert.match(calls.alerts.join("\n"), /fee is negative/);
  });

  it("keeps the status guard and does not retrieve Stripe for a non-authorized row", async () => {
    const { calls, opts } = captureCalls({
      order: { id: 42, payment_intent: "pi_test_42", amount_held: 40, payment_status: "captured" },
    });
    const res = await runCapture(opts);
    assert.equal(res.status, 400);
    assert.match(res.body.error, /status is captured/);
    assert.equal(calls.gets, 0);
    assert.equal(calls.captures.length, 0);
  });

  it("reconcile reports a succeeded PaymentIntent and writes only when dryRun is false", async () => {
    const rows = [
      { id: 7, payment_intent: "pi_ok", amount_captured: null, payment_status: "authorized" },
      { id: 8, payment_intent: "pi_open", amount_captured: null, payment_status: "authorized" },
    ];
    const updates = [];
    const stripeGet = async (pi) => ({
      ok: true,
      j: pi === "pi_ok"
        ? { status: "succeeded", amount_received: 1050 }
        : { status: "requires_capture" },
    });
    const dry = await runReconcile({
      rows,
      dryRun: true,
      stripeGet,
      updateOrder: async (id, patch) => {
        updates.push({ id, patch });
        return { error: null, rows: 1 };
      },
    });
    assert.equal(dry.body.dryRun, true);
    assert.equal(updates.length, 0);
    assert.equal(dry.body.updates.length, 1);
    assert.equal(dry.body.updates[0].id, 7);
    assert.equal(pence(dry.body.updates[0].amount_captured), 1050);
    assert.equal(dry.body.updates[0].wrote, false);

    const wrote = await runReconcile({
      rows,
      dryRun: false,
      stripeGet,
      updateOrder: async (id, patch) => {
        updates.push({ id, patch });
        return { error: null, rows: 1 };
      },
    });
    assert.equal(wrote.body.dryRun, false);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].id, 7);
    assert.equal(pence(updates[0].patch.amount_captured), 1050);
    assert.equal(updates[0].patch.payment_status, "captured");
    assert.equal(updates[0].patch.store_total, undefined);
  });
});

describe("telegram send", () => {
  it("uses the bot token and chat id and does not send when they are missing", async () => {
    let called = 0;
    const missing = await sendTelegram("hi", { get: () => undefined }, async () => {
      called += 1;
      return new Response("no");
    });
    assert.equal(missing.status, 500);
    assert.equal(called, 0);
    let seen = null;
    const ok = await sendTelegram("x".repeat(5000), {
      get: (name) => (name === "TELEGRAM_BOT_TOKEN" ? "123:ABC" : "99"),
    }, async (url, init) => {
      seen = { url, body: JSON.parse(init.body) };
      return new Response("{}", { status: 200 });
    });
    assert.equal(ok.ok, true);
    assert.equal(seen.url, "https://api.telegram.org/bot123:ABC/sendMessage");
    assert.equal(seen.body.chat_id, "99");
    assert.equal(seen.body.disable_web_page_preview, true);
    assert.equal(seen.body.text.length, 4000);
    const bad = await sendTelegram("hi", {
      get: (name) => (name === "TELEGRAM_BOT_TOKEN" ? "123:ABC" : "99"),
    }, async () => new Response("y".repeat(400), { status: 500 }));
    assert.equal(bad.status, 502);
    assert.equal(bad.detail.length, 200);
  });
});
