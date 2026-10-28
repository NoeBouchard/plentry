// Recipe-step placeholders (plan of 28 Oct 2026, Meal Planner's
// step-placeholders-renderer-plan). One pure renderer in the portions block of
// _shared/portions.ts, copied byte-for-byte into index.html, used by
// showRecipe, the order view and the order email helper.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  normServings,
  scalePortion,
  portionFactor,
  roundStepAmount,
  hasStepTokens,
  stripStepTokens,
  renderStep,
  renderSteps,
  renderRecipeText,
  orderRecipesText,
} from "../supabase/functions/_shared/portions.ts";
import { MAX_RECIPE_STEP, cleanRecipes, clipStep } from "../supabase/functions/_shared/orders.ts";
import { loadApp } from "./harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Steps parsed from Meal Planner's draft patch steps_placeholders_2026-10-28_DRAFT.sql
// (sha256 aaad7317…, the re-cut with meal 160's coriander bunch), portions from
// the 15:14:59 GMT live snapshot. The fixture is id, name, steps and portions
// only. The expected file holds the text: at 2 and 4 from
// steps_placeholders_review_2026-10-28.md, at 6 from Meal Planner's golden
// renders (Python reference), spot_renders.txt for five meals, and today's live
// steps.
const FIX = JSON.parse(readFileSync(path.join(ROOT, "test/fixtures/step-placeholders-2026-10-28.json"), "utf8"));
const EXP = JSON.parse(readFileSync(path.join(ROOT, "test/fixtures/step-placeholders-2026-10-28.expected.json"), "utf8"));
const EXPECT = new Map(EXP.meals.map((e) => [e.id, e]));
const SIZES = [2, 4, 6];
const BRACE = /[{}]/;

const POR = {
  "minced beef": [400, "g"], garlic: [2, "clove"], onions: [1, "pc"], lemons: [0.5, "pc"], eggs: [3, "pc"],
  "olive oil": [1.5, "tbsp"], chickpeas: [400, "g"], "coconut milk": [200, "ml"], halloumi: [225, "g"], "stock cubes": [1, "pc"],
};

describe("step placeholders: shared vectors (plan §7 and §9)", () => {
  const cases = [
    ["{{qty:minced beef=400g}}", ["400g", "800g", "1.2kg"]],
    ["{{qty:garlic=2}}", ["2", "4", "5"]],
    ["{{qty:onions=1}} {{pl:onions|onion|onions=onion}}", ["1 onion", "2 onions", "2½ onions"]],
    ["{{qty:lemons=½}} {{pl:lemons|lemon|lemons=lemon}}", ["½ lemon", "1 lemon", "1½ lemons"]],
    ["{{qty:eggs=3}} eggs", ["3 eggs", "6 eggs", "9 eggs"]],
    ["{{qty:olive oil=1.5 tbsp}}", ["1.5 tbsp", "3 tbsp", "4½ tbsp"]],
    ["{{qty:chickpeas|tin=a 400g tin}}", ["a 400g tin", "2 × 400g tins", "3 × 400g tins"]],
    ["{{qty:coconut milk=200ml}}", ["200ml", "400ml", "600ml"]],
    ["{{qty:halloumi=225g}}", ["225g", "450g", "675g"]],
    ["{{qty:stock cubes=1}} crumbled {{pl:stock cubes|stock cube|stock cubes=stock cube}}", ["1 crumbled stock cube", "2 crumbled stock cubes", "3 crumbled stock cubes"]],
    ["{{x:150 ml=150ml}} water", ["150ml water", "300ml water", "450ml water"]],
    ["{{taste:½ tsp=½ tsp}} salt", ["½ tsp salt", "1 tsp salt", "1¼ tsp salt"]],
    ["{{taste:2 tsp=2 tsp}} cumin", ["2 tsp cumin", "1 tbsp cumin", "1½ tbsp cumin"]],
    ["{{n:20|small ball|small balls=about 20 small balls}}", ["about 20 small balls", "40 small balls", "60 small balls"]],
    ["Build {{n:2|stack|stacks=two stacks}}", ["Build two stacks", "Build 4 stacks", "Build 6 stacks"]],
    ["Cook.{{at46: Use 2 pans.=}}", ["Cook.", "Cook. Use 2 pans.", "Cook. Use 2 pans."]],
    ["{{qty:spinach=100g}} spinach", ["100g spinach", "100g spinach", "100g spinach"]],
    // §9 amendments
    ["Use {{per:omelette=3 eggs}} per omelette", ["Use 3 eggs per omelette", "Use 3 eggs per omelette", "Use 3 eggs per omelette"]],
    ["mix {{qty:minced beef:100|ref=100g}}", ["mix 100g", "mix 200g", "mix 300g"]],
    ["{{x:2 tsp=2 tsp}} water", ["2 tsp water", "4 tsp water", "6 tsp water"]],
    ["{{x:1.5 tsp=1½ tsp}} vinegar", ["1½ tsp vinegar", "3 tsp vinegar", "4½ tsp vinegar"]],
  ];
  for (const [tok, want] of cases) {
    it(tok, () => {
      SIZES.forEach((s, i) => assert.equal(renderStep(tok, POR, s), want[i], `@${s}`));
    });
  }

  it("tins count from the unrounded amount; adjectives move before the size; pl follows a sub-amount", () => {
    assert.equal(renderStep("Add {{qty:halloumi|tin=a 225g block}} of halloumi.", { halloumi: [225, "g"] }, 6), "Add 3 × 225g blocks of halloumi.");
    assert.equal(renderStep("Stir in {{qty:chickpeas|tin=a drained 400g tin}} of chickpeas.", { chickpeas: [400, "g"] }, 4), "Stir in 2 drained 400g tins of chickpeas.");
    assert.equal(renderStep("Stir in {{qty:chickpeas|tin=a drained 400g tin}} of chickpeas.", { chickpeas: [400, "g"] }, 6), "Stir in 3 drained 400g tins of chickpeas.");
    // Not a whole number of packs: the rounded weight instead.
    assert.equal(renderStep("{{qty:chickpeas:200|tin=a 200g tin}}", { chickpeas: [400, "g"] }, 6), "600g");
    assert.equal(renderStep("{{qty:chickpeas:300|tin=a 300g tin}}", { chickpeas: [400, "g"] }, 4), "600g");
    // §9: an exact pack multiple is not rounded past the basket (675g, not 680g).
    assert.equal(renderStep("Add {{qty:halloumi=225g}} halloumi.", { halloumi: [225, "g"] }, 6), "Add 675g halloumi.");
    assert.equal(renderStep("{{qty:feta=100g}}", { feta: [100, "g"] }, 4), "200g", "one feta pack");
    assert.equal(renderStep("{{qty:feta=70g}}", { feta: [70, "g"] }, 6), "210g", "not a pack multiple: rounded");
    const limes = "juice of {{qty:limes:0.5=½}} {{pl:limes:0.5|lime|limes=lime}}";
    assert.equal(renderStep(limes, { limes: [1, "pc"] }, 2), "juice of ½ lime");
    assert.equal(renderStep(limes, { limes: [1, "pc"] }, 4), "juice of 1 lime");
    assert.equal(renderStep(limes, { limes: [1, "pc"] }, 6), "juice of 1½ limes");
  });

  it("strip (old clients, old snapshots) and missing portions", () => {
    const s = "Add {{qty:minced beef=400g}} beef and {{taste:1 tsp=1 tsp}} cumin.{{at46: Brown in batches.=}}";
    assert.equal(stripStepTokens(s), "Add 400g beef and 1 tsp cumin.");
    assert.equal(s.replace(/\{\{[a-z0-9]+:[^{}=]*=([^{}]*)\}\}/g, "$1"), "Add 400g beef and 1 tsp cumin.", "the plan's strip regex");
    assert.equal(renderStep(s, null, 2), "Add 400g beef and 1 tsp cumin.");
    assert.equal(renderStep(s, null, 6), "Add 400g beef and 2½ tsp cumin. Brown in batches.", "qty falls back, n/x/taste still scale");
    assert.equal(renderStep("{{qty:onions=1}} {{pl:onions|onion|onions=onion}}", {}, 6), "1 onion");
  });

  it("per-unit rounding: kg, litres, ½ pc, ceil cloves, tbsp floor, taste in tbsp, n ceil", () => {
    assert.equal(renderStep("{{qty:potatoes=700g}}", { potatoes: [700, "g"] }, 4), "1.4kg");
    assert.equal(renderStep("{{qty:potatoes=30g}}", { potatoes: [30, "g"] }, 6), "90g");
    assert.equal(renderStep("{{x:400 ml=400ml}} stock", null, 6), "1.2 litres stock");
    assert.equal(renderStep("{{x:30 ml=30ml}} water", null, 6), "90ml water");
    assert.equal(renderStep("{{qty:garlic=3}}", { garlic: [3, "clove"] }, 6), "7", "3 × 2.25 = 6.75 → ceil");
    assert.equal(renderStep("{{qty:tomatoes=3}}", { tomatoes: [3, "pc"] }, 6), "9");
    assert.equal(renderStep("{{qty:red onions=½}}", { "red onions": [0.5, "pc"] }, 6), "1½");
    assert.equal(renderStep("{{qty:onions=½}}", { onions: [0.5, "pc"] }, 6), "1½", "0.5 × 2.25 = 1.125 → up to ½");
    assert.equal(renderStep("{{qty:eggs=1}}", { eggs: [1, "pc"] }, 6), "3");
    assert.equal(renderStep("{{taste:1 tbsp=1 tbsp}} soy", null, 6), "2½ tbsp soy");
    assert.equal(renderStep("{{taste:¼ tsp=¼ tsp}} chilli", null, 4), "½ tsp chilli");
    assert.equal(renderStep("{{n:3|wrap|wraps=3 wraps}}", null, 6), "9 wraps");
    assert.equal(renderStep("{{n:1|omelette|omelettes=one omelette}}", null, 4), "2 omelettes");
    assert.equal(renderStep("{{n:1=one}}", null, 6), "3");
    assert.equal(roundStepAmount(0.1, "tbsp"), 0.5, "tbsp minimum ½");
    assert.equal(roundStepAmount(0.01, "tsp"), 0.25, "tsp minimum ¼");
  });

  it("onions and garlic share one 0.75 factor at 6 with the basket (scalePortion)", () => {
    assert.equal(portionFactor("onions", 6), 2.25);
    assert.equal(portionFactor("garlic", 6), 2.25);
    assert.equal(portionFactor("onions", 4), 2);
    assert.equal(portionFactor("eggs", 6), 3);
    assert.equal(portionFactor("eggs", "5"), 3);
    for (const [key, amount, unit] of [["onions", 1, "pc"], ["garlic", 3, "clove"], ["onions", 2, "pc"], ["eggs", 3, "pc"]]) {
      for (const s of SIZES) assert.equal(scalePortion(amount, unit, key, s), Math.ceil(amount * portionFactor(key, s)), `${key} @${s}`);
    }
    const src = readFileSync(path.join(ROOT, "supabase/functions/_shared/portions.ts"), "utf8");
    assert.match(src, /function scalePortion[\s\S]*?portionFactor\(key,servings\)/, "scalePortion uses portionFactor");
  });
});

describe("step placeholders: graceful fallbacks, never braces", () => {
  const bad = [
    ["{{foo:bar=baz}}", "baz", "unknown type prints its fallback"],
    ["{{qty:onions:abc=1}} onion", "1 onion", "bad sub-amount"],
    ["{{n:abc|x|y=two}} wraps", "two wraps", "bad count"],
    ["{{x:2 cups=2 cups}} water", "2 cups water", "x unit outside g/ml/tbsp/tsp"],
    ["{{x:2=2}} water", "2 water", "x without a unit"],
    ["{{taste:1 g=1 g}} salt", "1 g salt", "taste unit outside tsp/tbsp"],
    ["{{pl:onions|onion=onion}}", "onion", "pl without a plural"],
    ["{{qty:onions=1}} {{pl:spinach|leaf|leaves=leaf}}", null, "pl of a missing key"],
    ["Add {{qty:onions}} onions", "Add onions", "no fallback at all"],
    ["Add {{QTY:onions=1}} onion", "Add 1 onion", "uppercase type"],
    ["Add {{qty:onions=1} onion", "Add 1 onion", "half-closed token"],
    ["Add 1 onion and {{qty:garlic=2", "Add 1 onion and 2", "token cut at the end of the text"],
    ["Add }}2 onions{{", "Add 2 onions", "stray braces"],
    ["Add {{qty:{{qty:onions=1}}=1}} onion", null, "nested"],
    ["{{}}", "", "empty token"],
  ];
  for (const [text, want, why] of bad) {
    it(why, () => {
      for (const s of SIZES) {
        const out = renderStep(text, { onions: [1, "pc"] }, s);
        assert.doesNotMatch(out, BRACE, `${why} @${s}: ${out}`);
        assert.doesNotMatch(out, / {2}/, `no double spaces @${s}`);
        if (want != null && s === 2) assert.equal(out, want);
      }
      assert.doesNotMatch(stripStepTokens(text), BRACE);
    });
  }

  it("broken portions print the fallback", () => {
    for (const por of [{ onions: "1 pc" }, { onions: [] }, { onions: [-1, "pc"] }, { onions: ["x", "pc"] }, [["onions", 1]], "onions", 7]) {
      assert.equal(renderStep("{{qty:onions=1}} {{pl:onions|onion|onions=onion}}", por, 4), "1 onion", JSON.stringify(por));
    }
  });

  it("plain steps (no tokens) come back byte-for-byte at every size", () => {
    const plain = ["Dice 1 onion  and fry .", "Use {curly} braces", "Cook 400g beef; ½ tsp salt.", "", "Pasta: boil 180g."];
    for (const t of plain) for (const s of [2, 3, 4, 5, 6, null, undefined, "4"]) assert.equal(renderStep(t, POR, s), t);
    assert.equal(renderStep(null, POR, 4), "");
    assert.deepEqual(renderSteps(plain, POR, 6), plain);
    assert.equal(hasStepTokens("Dice 1 onion"), false);
    assert.equal(hasStepTokens("Dice {{qty:onions=1}} onion"), true);
  });
});

describe("step placeholders: the 52-meal draft patch (fixture)", () => {
  it("fixture is the aaad7317 draft: 52 meals, id, name, steps and portions only", () => {
    assert.equal(FIX.source.sha256, "aaad731720a3be16b7bb422800a88ae6a25f9e9a4baedc6d85bc2a7822897fa2");
    assert.equal(EXP.source.patch_sha256, FIX.source.sha256);
    assert.equal(FIX.meals.length, 52);
    assert.equal(new Set(FIX.meals.map((m) => m.id)).size, 52);
    assert.deepEqual(FIX.meals.map((m) => m.id).sort(), EXP.meals.map((e) => e.id).sort());
    const units = ["g", "ml", "pc", "clove", "tbsp", "tsp"];
    for (const m of FIX.meals) {
      assert.deepEqual(Object.keys(m).sort(), ["id", "name", "portions", "steps"], `${m.id} keys`);
      for (const [k, v] of Object.entries(m.portions)) {
        assert.ok(Array.isArray(v) && v.length === 2 && typeof v[0] === "number" && units.includes(v[1]), `${m.id} ${k}: amount and unit only`);
      }
    }
    assert.doesNotMatch(JSON.stringify(FIX), /price|cost|supplier|tesco|sainsbury|asda|waitrose|£/i, "no prices, costs or supplier data");
    assert.ok(FIX.meals.every((m) => m.steps.some(hasStepTokens)), "every meal is tokenised");
  });

  it("meal 160: the coriander bunch counts with n (2 bunches, 60g at 4)", () => {
    const m = FIX.meals.find((x) => x.id === 160);
    const at = (s) => renderSteps(m.steps, m.portions, s)[0];
    assert.match(at(2), /finely chop a bunch of fresh coriander \(30g\)/);
    assert.match(at(4), /finely chop 2 bunches of fresh coriander \(60g\)/);
    assert.match(at(6), /finely chop 3 bunches of fresh coriander \(90g\)/);
  });

  it("all 52 meals render at 2, 4 and 6 with no braces; 2 matches the review file exactly", () => {
    let n = 0;
    for (const m of FIX.meals) {
      for (const s of SIZES) {
        const out = renderSteps(m.steps, m.portions, s);
        out.forEach((t, i) => {
          n += 1;
          assert.doesNotMatch(t, BRACE, `${m.id} ${m.name} step ${i + 1} @${s}`);
          assert.equal(t, EXPECT.get(m.id).render[String(s)][i], `${m.id} ${m.name} step ${i + 1} @${s}`);
        });
      }
      assert.deepEqual(renderSteps(m.steps, m.portions, 2), m.steps.map(stripStepTokens), `${m.id} render@2 == strip`);
    }
    assert.equal(n, 909);
  });

  it("matches the spot renders at 2, 4 and 6", () => {
    const spot = FIX.meals.filter((m) => EXPECT.get(m.id).spot);
    assert.equal(spot.length, 5);
    for (const m of spot) for (const s of SIZES) assert.deepEqual(renderSteps(m.steps, m.portions, s), EXPECT.get(m.id).spot[String(s)], `${m.id} @${s}`);
  });

  it("today's live steps (before the patch) render unchanged at every size", () => {
    for (const m of FIX.meals) {
      const live = EXPECT.get(m.id).live;
      assert.equal(live.length, m.steps.length);
      for (const s of SIZES) assert.deepEqual(renderSteps(live, m.portions, s), live, `${m.id} @${s}`);
    }
  });

  it("text never asks for more pc or cloves than the basket buys", () => {
    const tok = /\{\{qty:([^{}=|:]+)(?::([^{}=|]+))?(\|[^{}=]*)?=[^{}]*\}\}/g;
    let checked = 0;
    for (const m of FIX.meals) {
      for (const st of m.steps) {
        for (const t of st.matchAll(tok)) {
          const p = m.portions[t[1]];
          if (!p || (p[1] !== "pc" && p[1] !== "clove")) continue;
          const base = t[2] ? Number(t[2].replace("½", "0.5")) : p[0];
          for (const s of [4, 6]) {
            const text = roundStepAmount(base * portionFactor(t[1], s), p[1], t[1]);
            assert.ok(text <= scalePortion(p[0], p[1], t[1], s) + 1e-9, `${m.id} ${t[0]} @${s}`);
            checked += 1;
          }
        }
      }
    }
    assert.ok(checked > 100, `checked ${checked}`);
  });

  it("an order snapshot of the longest tokenised steps survives cleanRecipes whole", () => {
    const longest = [...FIX.meals].sort((a, b) => Math.max(...b.steps.map((s) => s.length)) - Math.max(...a.steps.map((s) => s.length)))[0];
    assert.ok(Math.max(...longest.steps.map((s) => s.length)) > 400);
    const [row] = cleanRecipes([{ name: longest.name, ing: Object.keys(longest.portions), portions: longest.portions, recipe: { steps: longest.steps, tip: "" } }], [longest.name]);
    const strip = (s) => s.replace(/[<>"'`]/g, "");
    assert.deepEqual(row.recipe.steps, longest.steps.map(strip));
    for (const s of SIZES) for (const t of renderSteps(row.recipe.steps, row.portions, s)) assert.doesNotMatch(t, BRACE);
  });
});

describe("step placeholders: server helpers", () => {
  it("clipStep never cuts inside a token", () => {
    const long = "A".repeat(MAX_RECIPE_STEP - 5) + " {{qty:onions=1}} onion";
    const cut = clipStep(long, MAX_RECIPE_STEP);
    assert.ok(cut.length <= MAX_RECIPE_STEP);
    assert.doesNotMatch(cut, /\{\{/);
    assert.equal(clipStep("Dice {{qty:onions=1}} onion", 400), "Dice {{qty:onions=1}} onion");
    assert.equal(clipStep("<b>x</b>", 400), "bx/b");
    assert.equal(clipStep("A".repeat(900), MAX_RECIPE_STEP).length, MAX_RECIPE_STEP);
  });

  it("clipStep drops a lone '{' when the cut falls between the two opening braces", () => {
    const between = "A".repeat(MAX_RECIPE_STEP - 1) + "{{qty:onions=1}} onion";
    const cut = clipStep(between, MAX_RECIPE_STEP);
    assert.equal(cut, "A".repeat(MAX_RECIPE_STEP - 1));
    assert.equal(/[{}]/.test(cut), false);
    const afterToken = "Dice {{qty:onions=1}} " + "B".repeat(MAX_RECIPE_STEP - 23) + "{{qty:garlic=3}}";
    const kept = clipStep(afterToken, MAX_RECIPE_STEP);
    assert.ok(kept.startsWith("Dice {{qty:onions=1}} "), "a whole token before the cut stays");
    assert.equal(kept.endsWith("{"), false);
  });

  it("orderRecipesText renders each snapshot for the order's servings (order email path)", () => {
    const items = {
      servings: 4,
      recipes: [
        { name: "Tokenised", portions: { onions: [1, "pc"] }, recipe: { steps: ["Dice {{qty:onions=1}} {{pl:onions|onion|onions=onion}}."], tip: "Add {{taste:1 tsp=1 tsp}} salt." } },
        { name: "Old snapshot", recipe: { steps: ["Dice 1 onion."], tip: "Hot pan." } },
        { name: "No method", recipe: null },
        { name: "No portions", recipe: { steps: ["Dice {{qty:onions=1}} onion and {{n:2|wrap|wraps=2 wraps}}."], tip: "" } },
      ],
    };
    assert.deepEqual(orderRecipesText(items), [
      { name: "Tokenised", steps: ["Dice 2 onions."], tip: "Add 1¾ tsp salt.", servings: 4 },
      { name: "Old snapshot", steps: ["Dice 1 onion."], tip: "Hot pan.", servings: 2 },
      { name: "No portions", steps: ["Dice 1 onion and 2 wraps."], tip: "", servings: 2 },
    ]);
    assert.deepEqual(orderRecipesText({ recipes: items.recipes.slice(0, 1) })[0].steps, ["Dice 1 onion."], "no servings → 2");
    assert.deepEqual(orderRecipesText(null), []);
    assert.equal(normServings(undefined), 2);
  });

  it("renderRecipeText keeps tokenised text with no portions at 2 so qty and n never mix", () => {
    const r = { steps: ["Dice {{qty:onions=1}} onion, make {{n:2|wrap|wraps=2 wraps}}."], tip: "" };
    assert.deepEqual(renderRecipeText(r, null, 6), { steps: ["Dice 1 onion, make 2 wraps."], tip: "", tokens: true, servings: 2 });
    assert.deepEqual(renderRecipeText(r, { onions: [1, "pc"] }, 6), { steps: ["Dice 2½ onion, make 6 wraps."], tip: "", tokens: true, servings: 6 });
    assert.deepEqual(renderRecipeText({ steps: ["Plain."], tip: "Tip." }, { onions: [1, "pc"] }, 6), { steps: ["Plain."], tip: "Tip.", tokens: false, servings: 2 });
  });
});

describe("step placeholders: app hooks", () => {
  const tacos = {
    name: "Token tacos",
    emoji: "🌮",
    time: 30,
    ing: ["onions", "garlic", "minced beef", "tortillas", "cumin"],
    portions: { onions: [1, "pc"], garlic: [2, "clove"], "minced beef": [400, "g"], tortillas: [4, "pc"], cumin: [2, "tsp"] },
    recipe: {
      steps: [
        "Sauce: Dice {{qty:onions=1}} {{pl:onions|onion|onions=onion}} and crush {{qty:garlic=2}} garlic cloves.",
        "Brown {{qty:minced beef=400g}} minced beef with {{taste:2 tsp=2 tsp}} cumin.{{at46: Brown in batches.=}}",
        "Warm {{qty:tortillas=4}} tortillas.",
      ],
      tip: "Add {{x:150 ml=150ml}} water if dry.",
    },
  };
  const weekState = (extra = {}) => ({
    user: null,
    prefs: { meals: 5, size: "2", budget: 60, postcode: "E2 8AA", preferredStore: "tesco", goals: [] },
    pantry: {}, menuOptions: [tacos], selected: [tacos.name], recipes: {}, orders: [], onboarded: true, ...extra,
  });

  it("the app's renderer is the shared portions block", async () => {
    const { window } = await loadApp({ localState: weekState() });
    for (const m of FIX.meals.slice(0, 10)) {
      for (const s of SIZES) assert.deepEqual(Array.from(window.renderSteps(m.steps, m.portions, s)), renderSteps(m.steps, m.portions, s));
    }
  });

  it("showRecipe renders tokens for the week's servings and drops the multiply note", async () => {
    const { window, document } = await loadApp({ localState: weekState() });
    const S = window.__plentry.state();
    for (const [n, want] of [[2, ["Dice 1 onion", "crush 2 garlic", "Brown 400g minced beef with 2 tsp cumin.", "Warm 4 tortillas", "150ml water"]],
      [4, ["Dice 2 onions", "crush 4 garlic", "Brown 800g minced beef with 1 tbsp cumin. Brown in batches.", "Warm 8 tortillas", "300ml water"]],
      [6, ["Dice 2½ onions", "crush 5 garlic", "Brown 1.2kg minced beef with 1½ tbsp cumin. Brown in batches.", "Warm 12 tortillas", "450ml water"]]]) {
      S.weekServings = n;
      await window.showRecipe(tacos.name);
      const modal = document.getElementById("modal");
      const text = modal.textContent;
      for (const w of want) assert.ok(text.includes(w), `@${n}: ${w}`);
      assert.doesNotMatch(text, BRACE);
      assert.equal(modal.querySelector(".recipe-note").textContent, `Amounts in these steps are for ${n} people.`);
      assert.doesNotMatch(text, /Multiply by/);
      assert.equal(modal.querySelector(".recipe-heading").textContent, "Sauce");
    }
  });

  it("showRecipe keeps a tokenised meal with no portions at 2 with the multiply note", async () => {
    const bare = { ...tacos, name: "Bare tacos", portions: undefined };
    const { window, document } = await loadApp({ localState: weekState({ menuOptions: [bare], selected: [bare.name] }) });
    window.__plentry.state().weekServings = 4;
    await window.showRecipe(bare.name);
    const text = document.getElementById("modal").textContent;
    assert.ok(text.includes("Dice 1 onion and crush 2 garlic cloves."));
    assert.ok(text.includes("Brown 400g minced beef with 2 tsp cumin."));
    assert.doesNotMatch(text, BRACE);
    assert.match(text, /Step amounts are written for 2\. Multiply by 2/);
  });

  it("the order snapshot carries servings and portions straight away, and the order view renders with them", async () => {
    const { window, document } = await loadApp({
      localState: { ...weekState(), user: { id: "u1", email: "t@t.com", name: "T" } },
      session: { id: "u1", email: "t@t.com", name: "T" },
    });
    const S = window.__plentry.state();
    S.user = { id: "u1", email: "t@t.com", name: "T" };
    S.weekServings = 6;
    S.prefs.delivery = { name: "Noe", phone: "07123456789", line1: "1 Test Street", line2: "", city: "London", postcode: "E2 8AA" };
    S.basketEdit = null;
    window.pickStore("tesco");
    window.syncBasketFromMeals();
    window.confirmOrder();
    window.__chosenSlot = { date: window.slotDays()[0], start: "10:00" };
    await window.placeOrder();
    const row = JSON.parse(JSON.stringify(window.__sbTables.orders[0]));
    assert.equal(row.items.servings, 6);
    assert.deepEqual(row.items.recipes[0].portions, tacos.portions);
    assert.deepEqual(row.items.recipes[0].recipe.steps, tacos.recipe.steps, "snapshot keeps the tokens");
    const o = S.orders[0];
    assert.equal(o.servings, 6);
    assert.equal(o.recipes.length, 1, "local order has its recipes before hydrate");
    // The week moves on: the order view still renders for 6 from its own snapshot.
    S.weekServings = 2;
    S.menuOptions = [];
    S.selected = [];
    await window.showRecipeFromOrder(o.backendId || o.id, 0);
    const text = document.getElementById("modal").textContent;
    assert.ok(text.includes("Brown 1.2kg minced beef with 1½ tbsp cumin. Brown in batches."));
    assert.ok(text.includes("Warm 12 tortillas"));
    assert.match(text, /Amounts in these steps are for 6 people\./);
    assert.doesNotMatch(text, BRACE);
  });

  it("an order snapshot with tokens but no portions stays at 2 with the multiply note", async () => {
    const { window, document } = await loadApp({ localState: weekState({ orders: [{
      id: 8, backendId: 8, store: "Tesco", total: 10, meals: [tacos.name], servings: 6, status: 1, date: "1/10/2026",
      recipes: [{ name: tacos.name, emoji: "🌮", time: 30, ing: tacos.ing, recipe: tacos.recipe }],
    }] }) });
    await window.showRecipeFromOrder(8, 0);
    const modal = document.getElementById("modal");
    const steps = [...modal.querySelectorAll(".recipe-step span:last-child")].map((e) => e.textContent);
    assert.deepEqual(steps, [
      "Dice 1 onion and crush 2 garlic cloves.",
      "Brown 400g minced beef with 2 tsp cumin.",
      "Warm 4 tortillas.",
    ]);
    assert.equal(modal.querySelector(".recipe-note").textContent, "Step amounts are written for 2. Multiply by 3 (×2 for 4, ×3 for 6).");
    assert.match(modal.textContent, /Add 150ml water if dry\./);
    assert.doesNotMatch(modal.textContent, BRACE);
    assert.doesNotMatch(modal.textContent, /Amounts in these steps/);
  });

  it("an old order snapshot (no tokens) renders exactly as written", async () => {
    const { window, document } = await loadApp({ localState: weekState({ orders: [{
      id: 7, backendId: 7, store: "Tesco", total: 10, meals: ["Old stew"], servings: 4, status: 1, date: "1/10/2026",
      recipes: [{ name: "Old stew", emoji: "🍲", time: 20, ing: ["onions"], recipe: { steps: ["Dice 1 onion  ."], tip: "" } }],
    }] }) });
    await window.showRecipeFromOrder(7, 0);
    const steps = [...document.querySelectorAll("#modal .recipe-step span:last-child")].map((e) => e.textContent);
    assert.deepEqual(steps, ["Dice 1 onion  ."]);
    assert.match(document.getElementById("modal").textContent, /Multiply by 2/);
  });
});
