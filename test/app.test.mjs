import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extraMeals, loadApp, mockMfa } from "./harness.mjs";

function weekState() {
  const menuOptions = extraMeals();
  return {
    user: null,
    prefs: { meals: 5, size: "2", budget: 60, postcode: "E2 8AA", preferredStore: "tesco", goals: [] },
    pantry: {},
    menuOptions,
    selected: menuOptions.slice(0, 5).map((m) => m.name),
    recipes: {},
    orders: [],
    onboarded: true,
  };
}

describe("app load", () => {
  it("boots without throwing and exposes helpers", async () => {
    const { window } = await loadApp();
    assert.equal(typeof window.esc, "function");
    assert.equal(typeof window.customerTotal, "function");
    assert.equal(typeof window.hydrateOrdersFromDb, "function");
    assert.equal(typeof window.applyModify, "function");
    assert.equal(window.__plentry.COMMISSION, 0.05);
    assert.equal(window.__plentry.HOLD_BUFFER, 0.30);
  });
});

describe("money", () => {
  it("adds 5% then a 30% hold buffer", async () => {
    const { window } = await loadApp();
    assert.equal(window.plentryFee(20), 1);
    assert.equal(window.customerTotal(20), 21);
    assert.equal(window.holdAmount(20), 27.3);
    assert.equal(window.gbp(10.456), 10.46);
    assert.equal(window.customerTotal(0), 0);
  });

  it("matches pay-function pence rounding on a typical shop", async () => {
    const { window } = await loadApp();
    const shop = 47.4;
    const charged = shop * (1 + window.__plentry.COMMISSION);
    const clientHold = window.holdAmount(shop);
    const serverPence = Math.round(charged * (1 + window.__plentry.HOLD_BUFFER) * 100);
    assert.equal(serverPence, Math.round(clientHold * 100));
  });
});

describe("xss and urls", () => {
  it("escapes HTML in untrusted strings", async () => {
    const { window } = await loadApp();
    const out = window.esc(`<img src=x onerror="alert(1)">`);
    assert.ok(out.includes("&lt;img"));
    assert.ok(!out.includes("<img"));
    assert.equal(window.esc(`a&b"'`), "a&amp;b&quot;&#39;");
    assert.equal(window.esc(null), "");
  });

  it("safeUrl only allows http(s)", async () => {
    const { window } = await loadApp();
    assert.equal(window.safeUrl("https://images.unsplash.com/photo-1"), "https://images.unsplash.com/photo-1");
    assert.equal(window.safeUrl("javascript:alert(1)"), "#");
    assert.equal(window.safeUrl("data:text/html,x"), "#");
    assert.equal(window.safeUrl(""), "#");
  });

  it("I-X02 stripeCheckoutUrl only follows https://checkout.stripe.com", async () => {
    const { window } = await loadApp();
    const ok = "https://checkout.stripe.com/c/pay/cs_test_a1B2#fidkdWxOYHwnPyd1blpxYHZxWjA0";
    assert.equal(window.stripeCheckoutUrl(ok), ok);
    assert.equal(window.stripeCheckoutUrl("http://checkout.stripe.com/c/pay/x"), null, "https only");
    assert.equal(window.stripeCheckoutUrl("https://checkout.stripe.com.evil.tld/c/pay/x"), null);
    assert.equal(window.stripeCheckoutUrl("https://evil.tld/checkout.stripe.com/"), null);
    assert.equal(window.stripeCheckoutUrl("https://evil.tld/?u=https://checkout.stripe.com"), null);
    assert.equal(window.stripeCheckoutUrl("javascript:alert(1)"), null);
    assert.equal(window.stripeCheckoutUrl(""), null);
    assert.equal(window.stripeCheckoutUrl(null), null);
  });

  it("I-X03 a hostile cloud prefs.budget is coerced to a number before it reaches renderMenu", async () => {
    const st = weekState();
    st.prefs.budget = `<img src=x onerror="alert(1)">`;
    const { window, document } = await loadApp({
      session: { id: "u1", email: "u1@example.com" },
      tables: { meals: [], orders: [], ingredient_prices: [], profiles: [{ id: "u1", state: st }] },
    });
    const S = window.__plentry.state();
    assert.equal(S.prefs.budget, 60, "normBudget fallback replaces junk from the profiles blob");
    window.renderMenu();
    assert.equal(document.getElementById("menu-week").querySelector('img[src="x"]'), null);
    assert.ok(document.body.innerHTML.includes("your £60 budget"));
  });

  it("renderMenu does not execute meal-name markup", async () => {
    const { window, document } = await loadApp({ localState: weekState() });
    const S = window.__plentry.state();
    S.menuOptions = [
      {
        name: `<img src=x onerror="alert(1)">`,
        emoji: "🍛",
        time: 20,
        ing: ["eggs", "passata", "onions", "garlic", "feta"],
      },
    ];
    S.selected = [S.menuOptions[0].name];
    S.prefs.meals = 1;
    window.renderMenu();
    const week = document.getElementById("menu-week");
    const nm = week.querySelector(".nm");
    assert.ok(nm);
    assert.equal(nm.children.length, 0, "meal name must be a text node, not HTML");
    assert.equal(week.querySelector('img[src="x"]'), null);
    assert.equal(week.querySelector("script"), null);
  });
});

describe("postcode and budget", () => {
  it("normalises UK postcodes and rejects junk", async () => {
    const { window } = await loadApp();
    assert.equal(window.normPostcode("e28aa"), "E2 8AA");
    assert.equal(window.normPostcode("E2 8AA"), "E2 8AA");
    assert.equal(window.normPostcode("not a postcode"), null);
    assert.equal(window.normPostcode(""), null);
  });

  it("clamps budget to 1–500", async () => {
    const { window } = await loadApp();
    assert.equal(window.normBudget(60, 40), 60);
    assert.equal(window.normBudget(9999, 40), 500);
    assert.equal(window.normBudget("nope", 40), 40);
  });

  it("I-A07 submitAuth rejects passwords under 8 characters before calling Supabase", async () => {
    const { window, document } = await loadApp();
    let called = 0;
    window.__mockSb.auth.signUp = async () => { called++; return { data: { user: null, session: null }, error: { message: "unit-test" } }; };
    window.openAuth();
    document.getElementById("su-name").value = "Noe";
    document.getElementById("su-email").value = "noe@example.com";
    document.getElementById("su-pass").value = "1234567";
    await window.submitAuth();
    assert.equal(document.getElementById("auth-err").textContent, "Password must be at least 8 characters.");
    assert.equal(called, 0);
    document.getElementById("su-pass").value = "12345678";
    await window.submitAuth();
    assert.equal(called, 1, "8 characters reaches signUp");
  });
});

describe("week and modify", () => {
  it("autoPickWeek keeps exactly prefs.meals dinners", async () => {
    const { window } = await loadApp({ localState: weekState() });
    const S = window.__plentry.state();
    S.prefs.meals = 5;
    S.menuOptions = extraMeals();
    window.autoPickWeek();
    assert.equal(S.selected.length, 5);
    assert.equal(new Set(S.selected).size, 5);
  });

  it("omnivore autoPick prefers meat/fish and does not fill the week with veg", async () => {
    const { window } = await loadApp({ localState: weekState() });
    const S = window.__plentry.state();
    S.prefs.diet = "omnivore";
    S.prefs.meals = 5;
    S.menuOptions = extraMeals();
    window.autoPickWeek();
    const diets = S.selected.map((n) => window.__plentry.mealDiet(window.mealByName(n)));
    const veg = diets.filter((d) => d === "vegetarian" || d === "vegan").length;
    const animal = diets.filter((d) => d === "meat" || d === "fish").length;
    assert.ok(animal >= 3, `expected mostly meat/fish, got ${diets.join(",")}`);
    assert.ok(veg <= 2, `expected at most two veg dinners, got ${diets.join(",")}`);
    const meat = extraMeals().find((m) => m.name.includes("Beef"));
    const vegan = extraMeals().find((m) => m.name.includes("Chickpea"));
    assert.ok(window.__plentry.scoreMeal(meat) > window.__plentry.scoreMeal(vegan));
  });

  it("autoPickWeek ignores unverified catalog meals when live ones exist", async () => {
    const { window } = await loadApp({ localState: weekState() });
    const S = window.__plentry.state();
    S.prefs.meals = 3;
    const live = extraMeals().map((m, i) => ({
      ...m,
      id: 200 + i,
      reviewed_at: "2026-09-01T00:00:00.000Z",
      tags: m.name.includes("Chickpea") || m.name.includes("Veggie") ? ["dinner", "vegan"] : ["dinner", "meat"],
    }));
    const draft = {
      name: "UNVERIFIED draft stew",
      emoji: "🍲",
      time: 25,
      ing: ["minced beef", "onions", "garlic", "passata", "salt", "black pepper"],
      id: 999,
      reviewed_at: null,
      tags: ["dinner", "meat"],
    };
    S.menuOptions = live.concat([draft]);
    window.autoPickWeek();
    assert.equal(S.selected.includes("UNVERIFIED draft stew"), false);
    assert.equal(S.selected.length, 3);
    assert.equal(window.__plentry.isPublished(draft), false);
    assert.ok(window.__plentry.publishedPool(S.menuOptions).every((m) => m.name !== draft.name));
  });

  it("applyModify swaps one dinner and does not grow the week", async () => {
    const { window, document } = await loadApp({ localState: weekState() });
    const S = window.__plentry.state();
    const n = S.prefs.meals;
    const replacement = S.menuOptions.find((m) => !S.selected.includes(m.name));
    assert.ok(replacement);
    const previous = S.selected[0];
    window.__plentry.setModifyPicks([replacement]);
    window.applyModify(0, 0);
    assert.equal(S.selected.length, n);
    assert.equal(S.selected[0], replacement.name);
    assert.notEqual(S.selected[0], previous);
    window.renderMenu();
    const days = document.getElementById("menu-week").querySelectorAll(".day-card");
    assert.equal(days.length, n);
    assert.ok(document.getElementById("menu-week").textContent.includes("Modify"));
  });

  it("addAdvisorMeals cannot grow the week past prefs.meals", async () => {
    const { window } = await loadApp({ localState: weekState() });
    const S = window.__plentry.state();
    const n = S.prefs.meals;
    assert.equal(S.selected.length, n);
    const extras = extraMeals().filter((m) => !S.selected.includes(m.name)).slice(0, 3);
    assert.ok(extras.length >= 2);
    window.__plentry.setAdvisor(extras, extras.map((_, i) => i));
    window.addAdvisorMeals();
    assert.equal(S.selected.length, n);
    assert.ok(S.selected.includes(extras[0].name));
  });

  it("openModify offers 5 catalog dinners and does not call the AI", async () => {
    const dbMeals = extraMeals().concat([
      { name: "Lemon chicken & parmesan rice", emoji: "🍋", time: 30, ing: ["chicken thighs", "rice", "lemons", "garlic", "parmesan"] },
      { name: "Crispy salmon & smashed potatoes", emoji: "🐟", time: 25, ing: ["salmon fillet", "potatoes", "broccoli", "olive oil", "lemons"] },
      { name: "Beef stuffed peppers", emoji: "🫑", time: 35, ing: ["minced beef", "bell peppers", "rice", "onions", "passata"] },
      { name: "Tomato & parmesan baked rice", emoji: "🍚", time: 30, ing: ["rice", "passata", "tomatoes", "garlic", "parmesan"] },
      { name: "Halloumi & broccoli grain bowls", emoji: "🥗", time: 25, ing: ["halloumi", "broccoli", "rice", "lemons", "yoghurt"] },
    ]);
    const { window } = await loadApp({
      localState: weekState(),
      tables: { meals: dbMeals, orders: [], profiles: [], ingredient_prices: [] },
    });
    const calls = [];
    window.fetch = async (url, init) => {
      calls.push({ url: String(url), body: init && init.body });
      return { ok: false, status: 503, json: async () => ({}) };
    };
    await window.openModify(0);
    const aiCalls = calls.filter((c) => c.url.includes("/functions/v1/ai"));
    assert.equal(aiCalls.length, 0);
    const picks = window.__plentry.modifyPicks();
    assert.equal(picks.length, 5);
    const S = window.__plentry.state();
    picks.forEach((m) => {
      assert.ok(!S.selected.includes(m.name));
      assert.notEqual(m.name, S.selected[0]);
    });
  });

  it("validMeal rejects unknown ingredients", async () => {
    const { window } = await loadApp();
    assert.equal(window.__plentry.validMeal({ name: "ok", ing: ["eggs", "rice"] }), true);
    assert.equal(window.__plentry.validMeal({ name: "bad", ing: ["eggs", "uranium"] }), false);
    assert.ok(!window.__plentry.validMeal({ name: "empty", ing: [] }));
    assert.ok(!window.__plentry.validMeal(null));
  });

  it("tagsFor assigns the closed set from ingredients and name", async () => {
    const { window } = await loadApp();
    const meat = window.__plentry.tagsFor({
      name: "Chicken & chickpea curry",
      time: 30,
      ing: ["chicken thighs", "chickpeas", "curry paste", "coconut milk", "rice", "spinach", "salt"],
    });
    assert.ok(meat.includes("meat"));
    assert.ok(meat.includes("dinner"));
    assert.ok(!meat.includes("vegan"));
    assert.ok(!meat.includes("vegetarian"));
    const vegan = window.__plentry.tagsFor({
      name: "Chickpea & spinach curry",
      time: 25,
      ing: ["chickpeas", "curry paste", "coconut milk", "spinach", "onions", "rice", "chopped tomatoes"],
    });
    assert.ok(vegan.includes("vegan"));
    assert.ok(vegan.includes("vegetarian"));
    assert.ok(!vegan.includes("meat"));
    const quick = window.__plentry.tagsFor({
      name: "Halloumi fajitas",
      time: 20,
      ing: ["halloumi", "tortillas", "bell peppers", "onions", "yoghurt", "lemons"],
    });
    assert.ok(quick.includes("vegetarian"));
    assert.ok(quick.includes("quick"));
    assert.ok(!quick.includes("meat"));
    assert.ok(window.__plentry.MEAL_TAGS.includes("comfort_food"));
    const stored = window.__plentry.mealTags({
      name: "Anything",
      time: 40,
      ing: ["chicken thighs", "rice"],
      tags: ["dinner", "meat", "high_protein", "not_a_real_tag"],
    });
    assert.deepEqual(stored, ["dinner", "meat", "high_protein"]);
  });

  it("meal count bar covers 1–7 dinners on onboarding and Profile", async () => {
    const { window, document } = await loadApp({ localState: weekState() });
    window.showObStep(6);
    window.pickMealCount(1);
    assert.equal(window.__plentry.state().prefs.meals, 1);
    assert.equal(window.__plentry.clampMeals(0), 5);
    assert.equal(window.__plentry.clampMeals(9), 5);
    window.pickMealCount(7);
    assert.equal(window.__plentry.state().prefs.meals, 7);
    assert.equal(document.querySelectorAll("#ob-meals-picks .meal-seg").length, 7);
    window.nav("profile");
    assert.equal(document.querySelectorAll("#pr-meals-bar .meal-seg").length, 7);
    assert.equal(document.getElementById("pr-meals").value, "7");
  });

  it("wantedTags prefers dinner tags over onboarding goals", async () => {
    const { window, document } = await loadApp({ localState: weekState() });
    const S = window.__plentry.state();
    S.prefs.goals = ["decide"];
    S.prefs.tags = [];
    assert.equal(window.__plentry.wantedTags().join(","), "quick");
    window.toggleUserTag("high_protein");
    assert.equal(window.__plentry.wantedTags().join(","), "high_protein");
    window.showObStep(2);
    assert.ok(document.getElementById("ob-tags").textContent.includes("High protein"));
    assert.ok(document.getElementById("ob-diet").textContent.includes("Everything"));
    window.nav("profile");
    assert.ok(document.getElementById("pr-tags").textContent.includes("High protein"));
  });
});

describe("basket and cupboard", () => {
  it("already-have on a staple skips it and marks pantry", async () => {
    const { window, document } = await loadApp({ localState: weekState() });
    window.syncBasketFromMeals();
    let idx = window.__plentry.getBasket().findIndex((b) => b.i === "olive oil");
    if (idx < 0) {
      window.__plentry.getBasket().push({ i: "olive oil", q: 1 });
      window.commitBasket();
      idx = window.__plentry.getBasket().findIndex((b) => b.i === "olive oil");
    }
    assert.ok(idx >= 0);
    window.alreadyHaveAt(idx);
    const S = window.__plentry.state();
    assert.equal(S.pantry["olive oil"], 1);
    assert.ok(!window.__plentry.getBasket().some((b) => b.i === "olive oil"));
    window.openBasket();
    const panel = document.getElementById("basket-panel").textContent;
    assert.ok(panel.includes("Cupboard"));
    assert.ok(panel.includes("Do NOT keep spices you already have") || panel.includes("skipped what you already have"));
    assert.ok(panel.includes("I already have — skip") || panel.includes("skipped"));
  });

  it("qty and add persist until confirm, then confirm lists the edited items", async () => {
    const { window, document } = await loadApp({
      localState: { ...weekState(), user: { id: "u1", email: "t@t.com", name: "T" } },
    });
    const S = window.__plentry.state();
    S.user = { id: "u1", email: "t@t.com", name: "T" };
    window.pickStore("tesco");
    window.syncBasketFromMeals();
    const n = window.__plentry.getBasket().length;
    assert.ok(n > 0);
    window.removeBasketAt(0);
    assert.equal(window.__plentry.getBasket().length, n - 1);
    assert.ok(Array.isArray(S.basketEdit));
    const sel = document.createElement("select");
    sel.id = "bk-add";
    sel.innerHTML = `<option value="eggs" selected>eggs</option>`;
    sel.value = "eggs";
    document.body.appendChild(sel);
    if (!window.__plentry.getBasket().some((b) => b.i === "eggs")) window.addBasketFromSelect();
    window.confirmOrder();
    const modal = document.getElementById("modal").textContent;
    assert.ok(modal.includes("Confirm this shop"));
    assert.ok(modal.includes("Pay hold & send order"));
    assert.ok(modal.includes("Address line 1") || modal.includes("Deliver to this address"));
    if (window.__plentry.getBasket().some((b) => window.__plentry.STAPLES.includes(b.i))) {
      assert.ok(modal.includes("Do NOT keep spices you already have"));
    }
  });

  it("Order this week rebuilds the basket from meals after a stale empty edit", async () => {
    const { window, document } = await loadApp({ localState: weekState() });
    const S = window.__plentry.state();
    S.basketEdit = [];
    S.basketFor = '["old"]';
    window.openBasket();
    const basket = window.__plentry.getBasket();
    assert.ok(basket.length > 0);
    assert.ok(basket.every((b) => b.q >= 1 && window.ingInfo(b.i).price > 0));
    const panel = document.getElementById("basket-panel").textContent;
    assert.ok(/£\d/.test(panel), panel);
    assert.equal(window.__plentry.basketEditsThisWeek(), false);
    window.renderMenu();
    const week = document.getElementById("menu-week").textContent;
    assert.ok(!week.includes("£0.00"));
    assert.ok(/£\d/.test(week));
  });
});

describe("pantry have-list", () => {
  it("lists cupboard staples only and search filters them", async () => {
    const { window, document } = await loadApp({ localState: weekState() });
    assert.ok(window.__plentry.STAPLES.includes("paprika"));
    assert.ok(window.__plentry.STAPLES.includes("salt"));
    assert.ok(window.__plentry.STAPLES.includes("butter"));
    assert.ok(!window.__plentry.STAPLES.includes("rice"));
    assert.ok(!window.__plentry.STAPLES.includes("chopped tomatoes"));
    window.nav("pantry");
    const list = document.getElementById("pantry-list").textContent;
    assert.ok(list.includes("olive oil"));
    assert.ok(list.includes("paprika"));
    assert.ok(list.includes("salt"));
    assert.ok(!list.includes("rice"));
    assert.ok(!list.includes("Groceries"));
    const q = document.getElementById("pantry-q");
    q.value = "paprika";
    window.renderPantry();
    const filtered = document.getElementById("pantry-list").textContent;
    assert.ok(filtered.includes("paprika"));
    assert.ok(!filtered.includes("olive oil"));
    q.value = "zzzz";
    window.renderPantry();
    assert.ok(document.getElementById("pantry-list").textContent.includes("No match"));
  });

  it("toggleHaveAt skips that cupboard item on the derived basket", async () => {
    const { window, document } = await loadApp({ localState: weekState() });
    window.syncBasketFromMeals();
    assert.ok(window.__plentry.getBasket().some((b) => b.i === "salt"));
    assert.ok(window.__plentry.getBasket().some((b) => b.i === "paprika"));
    const onions = window.__plentry.STAPLES.indexOf("onions");
    assert.ok(window.__plentry.getBasket().some((b) => b.i === "onions"));
    window.toggleHaveAt(onions);
    const S = window.__plentry.state();
    assert.equal(S.pantry.onions, 1);
    assert.ok(window.__plentry.haveItem("onions"));
    assert.ok(!window.__plentry.getBasket().some((b) => b.i === "onions"));
    window.nav("pantry");
    assert.ok(document.getElementById("pantry-list").textContent.includes("skipped on the shop"));
    window.showObStep(7);
    assert.ok(document.getElementById("ob-have-list").textContent.includes("onions"));
    assert.ok(!document.getElementById("ob-have-list").textContent.includes("rice"));
  });

  it("completeIng fills spices on stale lists and keeps a complete list intact", async () => {
    const { window } = await loadApp({ localState: weekState() });
    const curry = window.completeIng({
      name: "Chicken & chickpea curry",
      ing: ["chicken thighs", "chickpeas", "curry paste", "coconut milk", "onions", "garlic", "rice", "spinach"],
    });
    assert.ok(curry.includes("salt"));
    assert.ok(curry.includes("black pepper"));
    assert.ok(curry.includes("cumin"));
    assert.ok(curry.includes("chicken thighs"));
    const pasta = window.completeIng({
      name: "Beef ragù spaghetti",
      ing: ["minced beef", "spaghetti", "passata", "onions", "garlic", "parmesan"],
    });
    assert.ok(pasta.includes("mixed herbs"));
    assert.ok(!pasta.includes("soy sauce"));
    const reviewed = window.completeIng({
      name: "Chicken & chickpea curry",
      ing: ["chicken thighs", "chickpeas", "curry paste", "coconut milk", "onions", "garlic", "rice", "spinach", "salt", "black pepper"],
    });
    assert.ok(reviewed.includes("salt"));
    assert.ok(!reviewed.includes("cumin"));
    window.syncBasketFromMeals();
    const meal = window.mealByName(window.__plentry.state().selected[0]);
    assert.ok(meal.ing.includes("salt"));
    assert.ok(window.__plentry.getBasket().some((b) => b.i === "salt"));
  });

  it("showRecipe uses the catalog method without calling AI", async () => {
    const { window, document } = await loadApp({ localState: weekState() });
    const S = window.__plentry.state();
    S.menuOptions = [
      {
        name: "Shakshuka",
        emoji: "🍳",
        time: 25,
        ing: ["eggs", "passata", "onions", "garlic", "feta", "salt", "black pepper"],
        recipe: { steps: ["Make wells and crack in the eggs.", "Cover until the whites are set."], tip: "Keep the yolks soft." },
      },
    ];
    S.selected = ["Shakshuka"];
    const calls = [];
    window.fetch = async (url, init) => {
      calls.push(String(url));
      return { ok: false, status: 503, json: async () => ({}) };
    };
    await window.showRecipe("Shakshuka");
    assert.equal(calls.filter((u) => u.includes("/functions/v1/ai")).length, 0);
    const modal = document.getElementById("modal").textContent;
    assert.ok(modal.includes("Make wells and crack in the eggs."));
    assert.ok(modal.includes("Keep the yolks soft."));
    assert.ok(modal.includes("quantities for 2"));
  });

  it("parseStepWithHeading extracts known section labels from step text", async () => {
    const { window } = await loadApp();
    const labels = ["Sauce", "Meatballs", "Pasta", "To serve", "Base", "Topping", "Filling", "Assembly", "Garnish"];
    for (const label of labels) {
      const parsed = window.parseStepWithHeading(`${label}: Put a large pan on medium heat.`);
      assert.equal(parsed.heading, label, `detects ${label}: prefix`);
      assert.equal(parsed.text, "Put a large pan on medium heat.", `strips ${label}: from body`);
    }
    const noLabel = window.parseStepWithHeading("Just a regular step without a prefix.");
    assert.equal(noLabel.heading, undefined, "no heading for regular step");
    assert.equal(noLabel.text, "Just a regular step without a prefix.", "text unchanged when no prefix");
  });

  it("showRecipe renders section headings for labeled steps and numbers continuously", async () => {
    const { window, document } = await loadApp({ localState: weekState() });
    const S = window.__plentry.state();
    S.menuOptions = [
      {
        name: "Spaghetti & meatballs",
        emoji: "🍝",
        time: 40,
        ing: ["minced beef", "spaghetti", "passata", "onions", "garlic"],
        recipe: {
          steps: [
            "Sauce: Heat oil in a pan and cook diced onions for 5 minutes.",
            "Sauce: Add passata and simmer for 15 minutes.",
            "Meatballs: Roll beef into balls and fry until browned.",
            "Pasta: Cook spaghetti in salted water for 10 minutes.",
            "To serve: Toss pasta with sauce and top with meatballs.",
          ],
          tip: "Brown the meatballs properly.",
        },
      },
    ];
    S.selected = ["Spaghetti & meatballs"];
    window.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
    await window.showRecipe("Spaghetti & meatballs");
    const html = document.getElementById("modal").innerHTML;
    assert.ok(html.includes('class="recipe-heading">Sauce</div>'), "Sauce heading rendered");
    assert.ok(html.includes('class="recipe-heading">Meatballs</div>'), "Meatballs heading rendered");
    assert.ok(html.includes('class="recipe-heading">Pasta</div>'), "Pasta heading rendered");
    assert.ok(html.includes('class="recipe-heading">To serve</div>'), "To serve heading rendered");
    assert.ok(html.includes("Heat oil in a pan"), "step text shown without the label prefix");
    assert.ok(!html.includes("Sauce: Heat oil"), "step text does not include the stripped label");
    const stepNumbers = html.match(/<span class="n">(\d+)<\/span>/g) || [];
    assert.equal(stepNumbers.length, 5, "five numbered steps total (continuous across sections)");
    assert.ok(html.includes('<span class="n">1</span>'), "step 1 present");
    assert.ok(html.includes('<span class="n">5</span>'), "step 5 present (numbering is continuous)");
  });
});

describe("orders", () => {
  it("hydrateOrdersFromDb overwrites stale local cache from Postgres", async () => {
    const tables = {
      meals: [],
      profiles: [],
      ingredient_prices: [],
      orders: [
        {
          id: 7,
          user_id: "u1",
          store: "Tesco",
          total: 32.5,
          items: { basket: [{ i: "eggs", q: 1 }], meals: ["Shakshuka"], eta: "Today" },
          status: "ordered",
          created_at: "2026-09-07T12:00:00.000Z",
          payment_status: "authorized",
          amount_held: 39.2,
          amount_captured: null,
        },
      ],
    };
    const { window, document } = await loadApp({
      localState: { ...weekState(), user: { id: "u1", email: "t@t.com", name: "T" }, orders: [{ id: 1, store: "STALE", total: 1, status: 1, items: [], meals: [] }] },
      tables,
    });
    const S = window.__plentry.state();
    S.user = { id: "u1", email: "t@t.com", name: "T" };
    await window.hydrateOrdersFromDb();
    assert.equal(S.orders.length, 1);
    assert.equal(S.orders[0].store, "Tesco");
    assert.equal(S.orders[0].status, 2);
    assert.equal(S.orders[0].payment_status, "authorized");
    window.renderOrders();
    const html = document.getElementById("orders-list").innerHTML;
    assert.ok(html.includes("Paid (hold)") || html.includes("Ordered"));
    assert.ok(!html.includes("STALE"));
    window.renderProfileOrders();
    assert.ok(document.getElementById("pr-orders").innerHTML.includes("Tesco"));
  });

  it("orderStatusCopy and payLabel cover the customer timeline", async () => {
    const { window } = await loadApp();
    assert.equal(window.payLabel({ payment_status: "authorized" }), "Paid (hold)");
    assert.equal(window.payLabel({ payment_status: "captured" }), "Charged");
    // I-O05 customer copy includes the captured amount when present
    assert.equal(window.payLabel({ payment_status: "captured", amount_captured: 1.05 }), "Charged £1.05");
    assert.equal(window.orderStatusCopy({ payment_status: "unpaid", status: 1 }).title, "Awaiting payment");
    assert.equal(window.orderStatusCopy({ payment_status: "authorized", status: 1 }).title, "Hold placed");
    assert.equal(window.orderStatusCopy({ payment_status: "captured", status: 1 }).title, "Charged");
    assert.match(window.orderStatusCopy({ payment_status: "captured", status: 1, amount_captured: 1.05, store: "Tesco" }).sub, /£1\.05/);
    assert.equal(window.orderStatusCopy({ payment_status: "authorized", status: 2 }).title, "Ordered");
    assert.equal(window.orderStatusCopy({ payment_status: "captured", status: 3 }).title, "Delivered");
  });

  it("restocks pantry when an order first becomes delivered", async () => {
    const { window } = await loadApp({ localState: weekState() });
    const S = window.__plentry.state();
    S.pantry = { eggs: 0 };
    const next = window.orderFromRow(
      {
        id: 3,
        store: "Tesco",
        total: 10,
        items: { basket: [{ i: "eggs", q: 1 }], meals: [] },
        status: "delivered",
        created_at: "2026-09-07T12:00:00.000Z",
        payment_status: "captured",
      },
      { status: 2, pantrySynced: false, items: [{ i: "eggs", q: 1 }] },
    );
    assert.equal(next.status, 3);
    assert.equal(next.pantrySynced, true);
    assert.ok(S.pantry.eggs >= 1);
  });

  it("I-O15 cooking instructions are snapshotted on the order; catalog is only a fallback; gone dinners stay honest", async () => {
    const tables = {
      meals: [
        {
          id: 9,
          name: "Test traybake",
          emoji: "🍲",
          time: 25,
          ing: ["eggs", "passata", "onions", "garlic", "olive oil", "salt", "black pepper"],
          recipe: { steps: ["Roast the onions and garlic.", "Add passata, crack in the eggs."], tip: "Keep the yolks runny." },
          tags: ["dinner", "vegetarian"],
          reviewed_at: "2026-09-01T00:00:00.000Z",
        },
      ],
      profiles: [],
      ingredient_prices: [],
      orders: [
        {
          id: 7,
          user_id: "u1",
          store: "Waitrose",
          total: 32.5,
          items: {
            basket: [{ i: "eggs", q: 1 }],
            meals: ["Snapshotted chilli", "Test traybake", "Gone dinner"],
            recipes: [
              { name: "Snapshotted chilli", emoji: "🌶️", time: 30, ing: ["minced beef", "rice"], recipe: { steps: ["Brown the beef.", "Simmer with rice."], tip: "Toast the paste." } },
            ],
            eta: "Tomorrow 12:00–13:00",
          },
          status: "new",
          created_at: "2026-09-19T10:00:00.000Z",
          payment_status: "captured",
          amount_held: 39.2,
          amount_captured: 33.6,
        },
      ],
    };
    const { window, document } = await loadApp({ localState: { ...weekState(), user: { id: "u1", email: "t@t.com", name: "T" } }, tables });
    const S = window.__plentry.state();
    S.user = { id: "u1", email: "t@t.com", name: "T" };
    S.menuOptions = S.menuOptions.filter((m) => m.name !== "Test traybake" && m.name !== "Snapshotted chilli");
    S.recipes = {};
    assert.ok(!S.menuOptions.some((m) => m.name === "Snapshotted chilli"));
    await window.hydrateOrdersFromDb();
    window.renderOrders();
    const html = document.getElementById("orders-list").innerHTML;
    assert.ok(html.includes("Cooking instructions"));
    for (let j = 0; j < 3; j++) assert.ok(html.includes(`showRecipeFromOrder(7,${j})`), `recipe button for meal ${j}`);
    assert.ok(!html.includes("Tomorrow 12:00"), "store marketing slot is not shown as the order ETA");
    assert.equal(S.orders[0].recipes[0].name, "Snapshotted chilli");

    const calls = [];
    window.fetch = async (u) => {
      calls.push(String(u));
      return { ok: false, status: 503, json: async () => ({}) };
    };
    // Snapshot wins even if the dinner is gone from this week's pool and from the catalog.
    await window.showRecipeFromOrder(7, 0);
    let modal = document.getElementById("modal").textContent;
    assert.ok(modal.includes("Brown the beef."));
    assert.ok(modal.includes("Toast the paste."));
    assert.equal(calls.length, 0, "snapshot must not hit the catalog or AI");

    // No snapshot → catalog row by name → stored steps, no AI.
    await window.showRecipeFromOrder(7, 1);
    modal = document.getElementById("modal").textContent;
    assert.ok(modal.includes("Roast the onions and garlic."));
    assert.equal(calls.filter((u) => u.includes("/functions/v1/ai")).length, 0);

    // Deleted from the catalog and not on the order → explicit message, still no AI.
    await window.showRecipeFromOrder(7, 2);
    modal = document.getElementById("modal").textContent;
    assert.ok(modal.includes("no longer in the catalog"));
    assert.equal(calls.filter((u) => u.includes("/functions/v1/ai")).length, 0);
  });

  it("I-O16 customer sees the promised window after checkout, else the 4-day estimate; Delivered stays hollow until done", async () => {
    const { window, document } = await loadApp({ localState: weekState() });
    const P = window.__plentry;
    assert.equal(P.ETA_DAYS, 4);
    assert.equal(P.isUkPhone("07123456789"), true);
    assert.equal(P.isUkPhone("07111"), false);
    assert.equal(P.isUkPhone("+447123456789"), true);
    assert.equal(P.deliveryFrom({ name: "A", line1: "1 St", city: "London", postcode: "E2 8AA", phone: "07111" }), null);
    const base = { payment_status: "authorized", status: 1, store: "Waitrose", created_at: "2026-09-19T10:00:00.000Z" };
    const est = P.deliveryCopy(base);
    assert.match(est, /^Expected by \w{3} 23 Sept? — about 4 days from your order/);
    assert.match(est, /Waitrose slot/);
    assert.equal(P.deliveryCopy({ ...base, payment_status: "captured" }).startsWith("Expected by"), true);
    assert.match(P.deliveryCopy({ ...base, slot_date: "2099-06-15", slot_start: "08:00", slot_end: "10:00" }), /We'll deliver Mon 15 Jun, 08:00–10:00/);
    assert.match(P.deliveryCopy({ ...base, status: 2, slot_date: "2099-06-15", slot_start: "08:00", slot_end: "10:00" }), /Waitrose delivers Mon 15 Jun, 08:00–10:00/);
    assert.equal(P.deliveryCopy({ ...base, status: 2, delivery_slot: "Tue 23 Sep 14:00–16:00" }), "Waitrose delivers Tue 23 Sep 14:00–16:00");
    assert.equal(P.deliveryCopy({ ...base, status: 3 }), "Delivered");
    assert.match(P.deliveryCopy({ ...base, status: 2, slot_date: "2000-01-01", slot_start: "08:00", slot_end: "10:00" }), /Should have arrived/);
    assert.equal(P.deliveredDone({ status: 2, slot_date: "2000-01-01", slot_start: "08:00", slot_end: "10:00" }), true);
    assert.equal(P.deliveredDone({ status: 2, slot_date: "2099-01-01", slot_start: "08:00", slot_end: "10:00" }), false);
    assert.equal(P.deliveryCopy({ ...base, payment_status: "unpaid" }), "");
    assert.equal(P.deliveryCopy({ ...base, payment_status: "canceled" }), "");
    assert.equal(P.deliveryCopy({ ...base, created_at: undefined }), "", "no date → no guess");
    assert.equal(P.normSlot("  <b>Tue</b>   23 Sep\n14:00 "), "bTue/b 23 Sep 14:00");
    assert.equal(P.normSlot("x".repeat(200)).length, P.SLOT_MAX);
    assert.equal(P.cleanMsg("  hi <b>x</b> "), "hi bx/b");
    const day = P.slotDays()[0];
    assert.ok(P.validSlot(day, "08:00"));
    assert.equal(P.validSlot(day, "09:00"), null);

    const S = P.state();
    S.orders = [
      window.orderFromRow({
        id: 12,
        store: "Waitrose",
        total: 30,
        items: { basket: [{ i: "eggs", q: 1 }], meals: ["Shakshuka"] },
        status: "ordered",
        created_at: "2026-09-19T10:00:00.000Z",
        payment_status: "captured",
        amount_captured: 31.5,
        delivery_slot: '<img src=x onerror=alert(1)>Tue 23 Sep 14:00–16:00',
        slot_date: "2099-06-15",
        slot_start: "08:00",
        slot_end: "10:00",
      }),
      window.orderFromRow({
        id: 11,
        store: "Tesco",
        total: 20,
        items: { basket: [{ i: "eggs", q: 1 }], meals: [] },
        status: "new",
        created_at: "2026-09-19T10:00:00.000Z",
        payment_status: "authorized",
        amount_held: 24,
      }),
      window.orderFromRow({
        id: 10,
        store: "Asda",
        total: 10,
        items: { basket: [{ i: "eggs", q: 1 }], meals: [] },
        status: "new",
        created_at: "2026-09-19T10:00:00.000Z",
        payment_status: "unpaid",
      }),
    ];
    window.renderOrders();
    const list = document.getElementById("orders-list");
    const html = list.innerHTML;
    assert.equal(list.querySelector("img"), null, "hostile slot never becomes markup");
    assert.match(html, /Waitrose delivers Mon 15 Jun, 08:00–10:00/);
    assert.match(html, /🚚 Expected by \w{3} 23 Sept?/);
    const cards = list.querySelectorAll(".meal");
    const waitroseSteps = cards[0].querySelectorAll(".tstep");
    assert.equal(waitroseSteps[0].classList.contains("done"), true, "Paid fills after capture");
    assert.equal(waitroseSteps[1].classList.contains("done"), true, "Ordered fills when booked");
    assert.equal(waitroseSteps[2].classList.contains("done"), false, "Delivered stays hollow while Ordered");
    assert.ok(cards[0].textContent.includes("Issue") || cards[0].textContent.includes("View issue"));
    assert.ok(cards[1].textContent.includes("Issue"));
    assert.ok(!cards[2].textContent.includes("Issue"), "I-O18 Issue hidden when unpaid");
    assert.ok(!cards[2].textContent.includes("View issue"));
  });
});

describe("photos", () => {
  it("uses image_url, then named photo, then ingredient fallback", async () => {
    const { window } = await loadApp();
    const named = window.mealPhoto({ name: "Shakshuka", ing: ["eggs"] });
    assert.ok(named.startsWith("https://"));
    const unique = window.mealPhoto({
      name: "Brand new dish",
      image_url: "https://www.themealdb.com/images/media/meals/x.jpg",
      ing: ["eggs"],
    });
    assert.equal(unique, "https://www.themealdb.com/images/media/meals/x.jpg");
    const byIng = window.mealPhoto({ name: "Unknown curry", ing: ["curry paste", "coconut milk"] });
    assert.ok(byIng.includes("unsplash.com"));
    assert.equal(window.safeUrl("http://evil"), "http://evil");
  });
});

describe("founder 2-step verification (S-06)", () => {
  const admin = { id: "admin", email: "noyouchka.bouchard@gmail.com" };
  const tables = () => ({ meals: [], profiles: [], ingredient_prices: [], orders: [] });

  it("with a verified factor, login is aal1: Ops hidden and a code is demanded until verified", async () => {
    const mfa = mockMfa({ enrolled: true });
    const { window, document } = await loadApp({ localState: weekState(), session: admin, tables: tables(), mfa });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(window.mfaPending(), true);
    assert.equal(window.isAdmin(), false, "email alone is not admin while a code is pending");
    assert.equal(document.getElementById("nav-admin").style.display, "none");
    assert.equal(document.getElementById("nav-meals").style.display, "none");
    assert.equal(document.getElementById("nav-inbox").style.display, "none");
    assert.ok(document.getElementById("modal").innerHTML.includes("Enter your 6-digit code"));
    assert.ok(document.getElementById("mfa-banner").classList.contains("show"));

    document.getElementById("modal-bg").click();
    window.closeModal();
    assert.ok(document.getElementById("modal-bg").classList.contains("open"), "tapping outside must not dismiss the code");
    assert.ok(document.getElementById("modal").innerHTML.includes("Enter your 6-digit code"));
    assert.equal(document.getElementById("nav-admin").style.display, "none");

    document.getElementById("mfa-code").value = "000000";
    await window.submitMfaChallenge();
    assert.equal(document.getElementById("mfa-err").textContent, "Invalid TOTP code");
    assert.equal(window.isAdmin(), false);

    document.getElementById("mfa-code").value = "12 34 56";
    await window.submitMfaChallenge();
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(window.mfaPending(), false);
    assert.equal(window.isAdmin(), true);
    assert.equal(document.getElementById("nav-admin").style.display, "");
    assert.equal(document.getElementById("nav-inbox").style.display, "");
    assert.ok(!document.getElementById("mfa-banner").classList.contains("show"));
    assert.deepEqual(mfa.state.calls.at(-1), ["challengeAndVerify", { factorId: "11111111-2222-4333-8444-555555555555", code: "123456" }]);
  });

  it("still demands a code when the assurance helper reports aal1 but a verified totp is listed", async () => {
    const factor = { id: "11111111-2222-4333-8444-555555555555", status: "verified", factor_type: "totp" };
    const mfa = {
      getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }),
      listFactors: async () => ({ data: { all: [factor] }, error: null }),
      challengeAndVerify: async () => ({ data: null, error: { message: "Invalid TOTP code" } }),
    };
    const { window, document } = await loadApp({ localState: weekState(), session: admin, tables: tables(), mfa });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(window.mfaPending(), true);
    assert.equal(window.isAdmin(), false);
    assert.equal(document.getElementById("nav-admin").style.display, "none");
    assert.ok(document.getElementById("modal").innerHTML.includes("Enter your 6-digit code"));
    assert.ok(document.getElementById("mfa-banner").classList.contains("show"));
  });

  it("without a factor nothing changes; the founder can enrol from Profile with a QR data URL", async () => {
    const mfa = mockMfa({ enrolled: false });
    const { window, document } = await loadApp({ localState: weekState(), session: admin, tables: tables(), mfa });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(window.mfaPending(), false);
    assert.equal(window.isAdmin(), true);
    assert.ok(!document.getElementById("modal").innerHTML.includes("6-digit code"));

    window.nav("profile");
    const card = document.getElementById("pr-security");
    assert.equal(card.style.display, "");
    assert.ok(card.innerHTML.includes("Turn on 2-step verification"));

    await window.startMfaEnrol();
    const modal = document.getElementById("modal");
    const img = modal.querySelector("img[alt='QR code']");
    assert.ok(img && img.getAttribute("src").startsWith("data:image/svg+xml"), "QR rendered from the SVG data URL");
    assert.ok(modal.innerHTML.includes("JBSWY3DPEHPK3PXP"), "manual key shown");

    document.getElementById("mfa-code").value = "123456";
    await window.finishMfaEnrol("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(document.getElementById("pr-saved").textContent.includes("2-step verification is on"));
    assert.ok(document.getElementById("pr-security").innerHTML.includes("Turn off 2-step verification"));
    assert.equal(window.isAdmin(), true, "the enrolling session is aal2 already");
  });

  it("a hostile qr_code is never injected as an image src and bad factor ids are refused", async () => {
    const mfa = mockMfa({ enrolled: false, qr: "javascript:alert(1)" });
    const { window, document } = await loadApp({ localState: weekState(), session: admin, tables: tables(), mfa });
    await new Promise((r) => setTimeout(r, 30));
    await window.startMfaEnrol();
    const modal = document.getElementById("modal");
    assert.equal(modal.querySelector("img"), null);
    assert.ok(!modal.innerHTML.includes("javascript:"));
    document.getElementById("mfa-code").value = "123456";
    await window.finishMfaEnrol("'); alert(1); ('");
    assert.ok(document.getElementById("mfa-err").textContent.includes("Setup expired"));
  });

  it("I-A10 capture that needs aal2 opens the 6-digit code modal instead of a dead-end alert", async () => {
    const mfa = mockMfa({ enrolled: true });
    mfa.state.level = "aal2";
    const { window, document } = await loadApp({
      localState: weekState(),
      session: admin,
      tables: {
        meals: [],
        profiles: [],
        ingredient_prices: [],
        orders: [
          {
            id: 38,
            email: "c@x.com",
            name: "A",
            postcode: "E2 8AA",
            store: "Waitrose",
            total: 46.21,
            items: { basket: [{ i: "eggs", q: 1, product: "eggs" }], meals: [] },
            status: "new",
            created_at: "2026-09-18T19:00:00.000Z",
            payment_status: "authorized",
            amount_held: 55.8,
            address: {},
          },
        ],
      },
      mfa,
    });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(window.isAdmin(), true);
    await window.renderAdmin();
    document.getElementById("cap-38").value = "53.10";
    await window.adminCapture(38);
    mfa.state.level = "aal1";
    window.fetch = async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: "mfa_required", detail: "Enter your 2-step verification code, then try again." }),
    });
    const alerts = [];
    window.alert = (m) => alerts.push(String(m));
    await window.adminCapture(38);
    assert.equal(alerts.length, 0, "must not dead-end on an alert");
    assert.ok(document.getElementById("modal").innerHTML.includes("6-digit code"));
    assert.equal(window.__pendingCapture.id, 38);
    assert.equal(window.__pendingCapture.storeAmt, 53.1);
  });

  it("customers never see the Security card", async () => {
    const { window, document } = await loadApp({
      localState: weekState(),
      session: { id: "u1", email: "u1@example.com" },
      tables: tables(),
      mfa: mockMfa({ enrolled: false }),
    });
    await new Promise((r) => setTimeout(r, 30));
    window.nav("profile");
    assert.equal(document.getElementById("pr-security").style.display, "none");
    assert.equal(window.isAdmin(), false);
  });
});

describe("ops", () => {
  it("isAdmin is email-gated; status bar can set new, ordered, delivered", async () => {
    const { window, document } = await loadApp({
      localState: weekState(),
      session: { id: "admin", email: "noyouchka.bouchard@gmail.com" },
      tables: {
        meals: [],
        profiles: [],
        ingredient_prices: [],
        orders: [
          {
            id: 4,
            email: "c@x.com",
            name: "A",
            postcode: "E2 8AA",
            store: "Tesco",
            total: 20,
            items: { basket: [{ i: "eggs", q: 1, product: "eggs" }], meals: [] },
            status: "new",
            created_at: "2026-09-07T12:00:00.000Z",
            payment_status: "authorized",
            amount_held: 24,
            address: {},
          },
        ],
      },
    });
    const S = window.__plentry.state();
    S.user = { id: "admin", email: "noyouchka.bouchard@gmail.com", name: "Noe" };
    assert.equal(window.isAdmin(), true);
    await window.renderAdmin();
    const html = document.getElementById("admin-list").innerHTML;
    assert.ok(html.includes("adminSetStatus(4,'new')"));
    assert.ok(html.includes("adminSetStatus(4,'ordered')"));
    assert.ok(html.includes("adminSetStatus(4,'delivered')"));
    assert.ok(html.includes("Charge customer"));
    assert.ok(html.includes("Hold"));
    assert.ok(!html.includes("Mark ordered"));
    await window.adminSetStatus(4, "delivered");
    assert.equal(window.__sbTables.orders[0].status, "delivered");
    await window.adminSetStatus(4, "new");
    assert.equal(window.__sbTables.orders[0].status, "new");
  });

  it("Ops capture preview shows store plus 5% and delivery prefers profile address", async () => {
    const { window, document } = await loadApp({
      localState: weekState(),
      session: { id: "admin", email: "noyouchka.bouchard@gmail.com" },
      tables: {
        meals: [],
        profiles: [],
        ingredient_prices: [],
        orders: [
          {
            id: 33,
            email: "c@x.com",
            name: "A",
            postcode: "E2 8AA",
            store: "Tesco",
            total: 3.79,
            items: { basket: [{ i: "eggs", q: 1, product: "eggs" }], meals: [] },
            status: "new",
            created_at: "2026-09-16T12:00:00.000Z",
            payment_status: "authorized",
            amount_held: 4.58,
            address: {
              delivery: { name: "Noe", line1: "1 Test Street", city: "London", postcode: "E2 8AA", phone: "07123456789" },
              shipping: { name: "Card", address: { line1: "Billing Rd", city: "Exeter", postal_code: "EX1 2FW" } },
            },
          },
        ],
      },
    });
    window.__plentry.state().user = { id: "admin", email: "noyouchka.bouchard@gmail.com", name: "Noe" };
    assert.equal(window.__plentry.captureChargePence(1), 105);
    await window.renderAdmin();
    const html = document.getElementById("admin-list").innerHTML;
    assert.ok(html.includes("1 Test Street"));
    assert.ok(!html.includes("Billing Rd"));
    assert.ok(html.includes("07123456789"));
    assert.ok(html.includes("Charge customer"));
    document.getElementById("cap-33").value = "1.00";
    window.adminCapPreview(33);
    assert.ok(document.getElementById("cap-prev-33").textContent.includes("£1.05"));
    assert.equal(document.getElementById("cap-btn-33").textContent, "Charge £1.05");
    let payCalls = 0;
    window.fetch = async () => {
      payCalls += 1;
      return { ok: true, json: async () => ({ live: true }) };
    };
    await window.adminCapture(33);
    assert.equal(payCalls, 0, "I-O04 first tap must not call Stripe");
    assert.equal(document.getElementById("cap-btn-33").textContent, "Confirm £1.05");
    assert.ok(document.getElementById("cap-prev-33").textContent.includes("Tap Confirm"));
    window.__sbTables.orders[0].payment_status = "captured";
    window.__sbTables.orders[0].amount_captured = 1.05;
    await window.renderAdmin();
    const after = document.getElementById("admin-list").innerHTML;
    assert.ok(after.includes("Money received"));
    assert.ok(after.includes("Open Tesco"));
    assert.ok(!after.includes("Charge customer"));
  });

  it("checkout asks to reuse the saved delivery address", async () => {
    const { window, document } = await loadApp({
      localState: { ...weekState(), user: { id: "u1", email: "t@t.com", name: "T" } },
    });
    const S = window.__plentry.state();
    S.user = { id: "u1", email: "t@t.com", name: "T" };
    S.prefs.delivery = {
      name: "Noe",
      phone: "07123456789",
      line1: "1 Test Street",
      line2: "",
      city: "London",
      postcode: "E2 8AA",
    };
    window.pickStore("tesco");
    window.syncBasketFromMeals();
    window.confirmOrder();
    const modal = document.getElementById("modal").textContent;
    assert.ok(modal.includes("Deliver to this address"));
    assert.ok(modal.includes("1 Test Street"));
    assert.ok(modal.includes("07123456789"));
    assert.ok(modal.includes("Use a different address"));
    assert.ok(modal.includes("Yes — pay hold & send"));
    assert.ok(modal.includes("Delivery window"));
    assert.ok(!modal.includes("Be in for this window"));
    window.pickSlot(window.slotDays()[0], "08:00");
    const after = document.getElementById("modal").textContent;
    assert.ok(after.includes("Be in for this window"));
    assert.ok(after.includes("driver will call"));
    window.__deliveryReplace = true;
    window.confirmOrder();
    const form = document.getElementById("modal").textContent;
    assert.ok(form.includes("Where should this shop be delivered"));
    assert.ok(form.includes("Use the saved address"));
    assert.ok(form.includes("Address line 1"));
  });

  it("I-O09 first checkout with no saved address shows the door form only", async () => {
    const { window, document } = await loadApp({
      localState: { ...weekState(), user: { id: "u1", email: "t@t.com", name: "T" } },
    });
    const S = window.__plentry.state();
    S.user = { id: "u1", email: "t@t.com", name: "T" };
    S.prefs.delivery = null;
    window.pickStore("tesco");
    window.syncBasketFromMeals();
    window.confirmOrder();
    const modal = document.getElementById("modal").textContent;
    assert.ok(modal.includes("Where should this shop be delivered"));
    assert.ok(modal.includes("Address line 1"));
    assert.ok(modal.includes("not the card billing address"));
    assert.ok(!modal.includes("Deliver to this address"));
    assert.ok(!modal.includes("Use a different address"));
    assert.ok(!modal.includes("Use the saved address"));
    assert.ok(modal.includes("so the driver can call you") || modal.includes("Phone is for the driver"));
    assert.ok(modal.includes("Delivery window"));

    S.prefs.delivery = {
      name: "Noe",
      phone: "",
      line1: "1 Test Street",
      line2: "",
      city: "London",
      postcode: "E2 8AA",
    };
    window.confirmOrder();
    const noPhone = document.getElementById("modal").textContent;
    assert.ok(noPhone.includes("Where should this shop be delivered"), "I-O09 reuse card hidden without phone");
    assert.ok(!noPhone.includes("Deliver to this address"));
  });

  it("I-M04 Ops warns when store plus 5% is above the hold, then charges the hold (Plentry covers the rest)", async () => {
    const { window, document } = await loadApp({
      localState: weekState(),
      session: { id: "admin", email: "noyouchka.bouchard@gmail.com" },
      tables: {
        meals: [],
        profiles: [],
        ingredient_prices: [],
        orders: [
          {
            id: 33,
            email: "c@x.com",
            name: "A",
            postcode: "E2 8AA",
            store: "Tesco",
            total: 3.79,
            items: { basket: [{ i: "eggs", q: 1, product: "eggs" }], meals: [] },
            status: "new",
            created_at: "2026-09-16T12:00:00.000Z",
            payment_status: "authorized",
            amount_held: 4.58,
            address: {},
          },
        ],
      },
    });
    window.__plentry.state().user = { id: "admin", email: "noyouchka.bouchard@gmail.com", name: "Noe" };
    await window.renderAdmin();
    const alerts = [];
    window.alert = (m) => alerts.push(String(m));
    let payCalls = 0;
    window.fetch = async () => {
      payCalls += 1;
      return { ok: true, json: async () => ({ live: true }) };
    };
    document.getElementById("cap-33").value = "10.00";
    window.adminCapPreview(33);
    const prev = document.getElementById("cap-prev-33").textContent;
    assert.ok(prev.includes("above the"));
    assert.ok(prev.includes("Plentry covers"));
    assert.equal(document.getElementById("cap-btn-33").disabled, false);
    assert.match(document.getElementById("cap-btn-33").textContent, /hold £4\.58/);
    await window.adminCapture(33);
    assert.equal(payCalls, 0, "first tap still does not call Stripe");
    assert.equal(document.getElementById("cap-btn-33").textContent, "Confirm £4.58");
    assert.equal(window.__sbTables.orders[0].payment_status, "authorized");
  });

  it("I-M08 payApi returns Stripe error JSON instead of null", async () => {
    const { window } = await loadApp({
      session: { id: "admin", email: "noyouchka.bouchard@gmail.com" },
    });
    window.fetch = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: "amount exceeds hold", detail: "too much" }),
    });
    const r = await window.payApi("capture", { order_id: 33, amount_gbp: 10 });
    assert.equal(r.error, "amount exceeds hold");
    assert.equal(r.detail, "too much");
    window.fetch = async () => ({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("empty");
      },
    });
    const fallback = await window.payApi("capture", { order_id: 33, amount_gbp: 1 });
    assert.equal(fallback.error, "http");
    assert.equal(fallback.detail, "HTTP 502");
  });

  it("I-O02 unpaid orders lock the status bar and hide capture", async () => {
    const { window, document } = await loadApp({
      localState: weekState(),
      session: { id: "admin", email: "noyouchka.bouchard@gmail.com" },
      tables: {
        meals: [],
        profiles: [],
        ingredient_prices: [],
        orders: [
          {
            id: 32,
            email: "c@x.com",
            name: "A",
            postcode: "E2 8AA",
            store: "Tesco",
            total: 41.52,
            items: { basket: [{ i: "eggs", q: 1, product: "eggs" }], meals: [] },
            status: "new",
            created_at: "2026-09-16T12:00:00.000Z",
            payment_status: "unpaid",
            amount_held: 50.14,
            address: {},
          },
        ],
      },
    });
    window.__plentry.state().user = { id: "admin", email: "noyouchka.bouchard@gmail.com", name: "Noe" };
    await window.renderAdmin();
    const html = document.getElementById("admin-list").innerHTML;
    assert.ok(html.includes("Waiting for the customer to pay"));
    assert.ok(html.includes("do not shop yet"));
    assert.ok(!html.includes("Charge customer"));
    assert.equal(document.getElementById("cap-32"), null);
    assert.equal(document.querySelectorAll("#admin-list .status-seg[disabled]").length, 3);
  });

  it("I-O08 placeOrder inserts address.delivery and a UK postcode", async () => {
    const { window, document } = await loadApp({
      localState: { ...weekState(), user: { id: "u1", email: "t@t.com", name: "T" } },
      session: { id: "u1", email: "t@t.com", name: "T" },
    });
    const S = window.__plentry.state();
    S.user = { id: "u1", email: "t@t.com", name: "T" };
    S.prefs.delivery = null;
    window.pickStore("tesco");
    window.syncBasketFromMeals();
    window.confirmOrder();
    window.__chosenSlot = { date: window.slotDays()[0], start: "08:00" };
    document.getElementById("del-name").value = "Noe";
    document.getElementById("del-phone").value = "07111";
    document.getElementById("del-line1").value = "1 Test Street";
    document.getElementById("del-city").value = "London";
    document.getElementById("del-postcode").value = "E2 8AA";
    await window.placeOrder();
    assert.equal(window.__sbTables.orders.length, 0, "I-O08 insert without a UK phone fails");
    assert.match(document.getElementById("del-err").textContent, /phone/i);

    document.getElementById("del-phone").value = "07123456789";
    window.__chosenSlot = null;
    await window.placeOrder();
    assert.equal(window.__sbTables.orders.length, 0, "I-O16 insert without a slot fails");
    assert.match((document.getElementById("slot-err") || document.getElementById("del-err")).textContent, /window/i);

    window.__chosenSlot = { date: window.slotDays()[0], start: "08:00" };
    await window.placeOrder();
    const row = window.__sbTables.orders[0];
    assert.ok(row);
    assert.equal(row.payment_status, "unpaid");
    assert.equal(row.postcode, "E2 8AA");
    assert.equal(row.address.delivery.line1, "1 Test Street");
    assert.equal(row.address.delivery.city, "London");
    assert.equal(row.address.delivery.name, "Noe");
    assert.equal(row.address.phone, "07123456789");
    assert.equal(row.address.delivery.phone, "07123456789");
    assert.equal(row.slot_date, window.slotDays()[0]);
    assert.equal(row.slot_start, "08:00");
    assert.equal(row.slot_end, "10:00");
    assert.equal(S.prefs.delivery.line1, "1 Test Street");
    assert.equal(S.prefs.postcode, "E2 8AA");
    const recs = row.items.recipes;
    assert.ok(Array.isArray(recs) && recs.length === S.selected.length, "I-O15 every ordered dinner is snapshotted");
    const salmon = recs.find((r) => r.name === "Salmon traybake");
    assert.ok(salmon && salmon.recipe && salmon.recipe.steps[0].includes("Preheat the oven"));
  });

  it("I-O10 Profile delivery fields persist on prefs.delivery", async () => {
    const { window, document } = await loadApp({
      localState: { ...weekState(), user: { id: "u1", email: "t@t.com", name: "T" } },
      session: { id: "u1", email: "t@t.com", name: "T" },
    });
    const S = window.__plentry.state();
    S.user = { id: "u1", email: "t@t.com", name: "T" };
    window.renderProfile();
    document.getElementById("pr-del-name").value = "Noe";
    document.getElementById("pr-del-phone").value = "07123456789";
    document.getElementById("pr-del-line1").value = "1 Test Street";
    document.getElementById("pr-del-line2").value = "Flat 2";
    document.getElementById("pr-del-city").value = "London";
    document.getElementById("pr-del-postcode").value = "e28aa";
    window.saveProfile();
    const d = S.prefs.delivery;
    assert.equal(d.name, "Noe");
    assert.equal(d.line1, "1 Test Street");
    assert.equal(d.line2, "Flat 2");
    assert.equal(d.city, "London");
    assert.equal(d.postcode, "E2 8AA");
    assert.equal(d.phone, "07123456789");
    assert.equal(S.prefs.postcode, "E2 8AA");
    document.getElementById("pr-del-phone").value = "";
    window.saveProfile();
    assert.match(document.getElementById("pr-saved").textContent, /phone/i);
    assert.equal(S.prefs.delivery.phone, "07123456789");
    window.renderProfile();
    assert.equal(document.getElementById("pr-del-line1").value, "1 Test Street");
    assert.equal(document.getElementById("pr-del-postcode").value, "E2 8AA");
  });

  it("Meals screen splits new vs live and can add then verify", async () => {
    const draft = {
      id: 11,
      name: "Draft keema",
      emoji: "🍛",
      time: 30,
      ing: ["minced beef", "rice", "onions", "garlic", "curry paste", "salt", "black pepper"],
      recipe: { steps: ["Brown the beef.", "Simmer with curry paste and rice."], tip: "Toast the paste." },
      tags: ["dinner", "meat", "comfort_food"],
      category: "curry_stew",
      source: "advisor",
      created_at: "2026-09-14T10:00:00.000Z",
      reviewed_at: null,
    };
    const live = {
      id: 12,
      name: "Live salmon traybake",
      emoji: "🐟",
      time: 30,
      ing: ["salmon fillet", "potatoes", "broccoli", "lemons", "olive oil", "garlic", "salt", "black pepper"],
      recipe: { steps: ["Roast potatoes.", "Add salmon."], tip: "Hot oven." },
      tags: ["dinner", "fish"],
      category: "oven_bake",
      source: "seed",
      created_at: "2026-09-01T10:00:00.000Z",
      reviewed_at: "2026-09-08T12:00:00.000Z",
    };
    const { window, document } = await loadApp({
      localState: weekState(),
      session: { id: "admin", email: "noyouchka.bouchard@gmail.com" },
      tables: { meals: [draft, live], profiles: [], ingredient_prices: [], orders: [] },
    });
    const S = window.__plentry.state();
    S.user = { id: "admin", email: "noyouchka.bouchard@gmail.com", name: "Noe" };
    await window.showMealsScreen();
    const neu = document.getElementById("meals-new").textContent;
    const pub = document.getElementById("meals-live").textContent;
    assert.ok(neu.includes("Draft keema"));
    assert.ok(neu.includes("Brown the beef"));
    assert.ok(neu.includes("minced beef"));
    assert.ok(!neu.includes("Live salmon traybake"));
    assert.ok(pub.includes("Live salmon traybake"));
    assert.ok(pub.includes("Roast potatoes"));
    const det=document.getElementById("me-det-12");
    assert.ok(det);
    assert.equal(det.hidden, true);
    window.toggleMealDetails("12");
    assert.equal(det.hidden, false);
    assert.equal(document.getElementById("me-det-btn-12").textContent, "Hide recipe");
    assert.equal(window.__plentry.isPublished(draft), false);
    assert.equal(window.__plentry.isPublished(live), true);
    assert.equal(window.__plentry.adminMealReady(draft), true);
    await window.adminVerifyMeal(11);
    assert.ok(window.__sbTables.meals[0].reviewed_at);
    await window.showMealsScreen();
    assert.ok(document.getElementById("meals-live").textContent.includes("Draft keema"));
    window.openMealEditor(null);
    document.getElementById("me-name").value = "Ops test chilli";
    document.getElementById("me-emoji").value = "🌶️";
    document.getElementById("me-time").value = "25";
    document.getElementById("me-steps").value = "Fry onions.\nAdd beef and spices.";
    document.getElementById("me-tip").value = "Keep it moving.";
    window.__mealIng = new Set(["minced beef", "onions", "garlic", "rice", "salt", "black pepper", "chilli flakes"]);
    await window.saveMealEditor(false);
    const added = window.__sbTables.meals.find((m) => m.name === "Ops test chilli");
    assert.ok(added);
    assert.equal(added.reviewed_at, null);
    assert.ok(added.ing.includes("minced beef"));
    assert.equal(JSON.stringify(Array.from(added.recipe.steps).slice(0, 2)), JSON.stringify(["Fry onions.", "Add beef and spices."]));
  });

  it("Live catalog lists every verified dinner from the week if the admin fetch is empty", async () => {
    const liveRows = extraMeals().map((m, i) => ({
      ...m,
      id: 300 + i,
      reviewed_at: "2026-09-01T00:00:00.000Z",
      recipe: { steps: ["Cook it."], tip: "" },
      tags: m.name.includes("Salmon") ? ["dinner", "fish"] : m.name.includes("Chickpea") || m.name.includes("Veggie") ? ["dinner", "vegan"] : ["dinner", "meat"],
    }));
    const { window, document } = await loadApp({
      localState: weekState(),
      session: { id: "admin", email: "noyouchka.bouchard@gmail.com" },
      tables: { meals: [], profiles: [], ingredient_prices: [], orders: [] },
    });
    const S = window.__plentry.state();
    S.user = { id: "admin", email: "noyouchka.bouchard@gmail.com", name: "Noe" };
    S.menuOptions = liveRows;
    await window.showMealsScreen();
    const pub = document.getElementById("meals-live").textContent;
    assert.ok(pub.includes("live"));
    liveRows.forEach((m) => {
      assert.ok(pub.includes(m.name), `missing ${m.name}`);
    });
    assert.ok(!pub.includes("None in this filter"));
    assert.ok(!pub.includes("No live dinners loaded"));
  });

  it("I-O16 Ops: slot field appears once money is received, saving it stores delivery_slot and marks the order Ordered", async () => {
    const { window, document } = await loadApp({
      localState: weekState(),
      session: { id: "admin", email: "noyouchka.bouchard@gmail.com" },
      tables: {
        meals: [],
        profiles: [],
        ingredient_prices: [],
        orders: [
          {
            id: 4,
            email: "c@x.com",
            name: "A",
            postcode: "E2 8AA",
            store: "Waitrose",
            total: 20,
            items: { basket: [{ i: "eggs", q: 1, product: "eggs" }], meals: [] },
            status: "new",
            created_at: "2026-09-19T10:00:00.000Z",
            payment_status: "authorized",
            amount_held: 24,
            address: {},
            delivery_slot: null,
          },
          {
            id: 5,
            email: "d@x.com",
            name: "B",
            postcode: "E2 8AA",
            store: "Waitrose",
            total: 40,
            items: { basket: [{ i: "eggs", q: 2, product: "eggs" }], meals: ["Shakshuka"] },
            status: "new",
            created_at: "2026-09-19T10:00:00.000Z",
            payment_status: "captured",
            amount_held: 48,
            amount_captured: 42,
            address: {},
            delivery_slot: null,
          },
          {
            id: 6,
            email: "e@x.com",
            name: "C",
            postcode: "E2 8AA",
            store: "Tesco",
            total: 22,
            items: { basket: [{ i: "eggs", q: 1, product: "eggs" }], meals: [] },
            status: "new",
            created_at: "2026-09-19T10:00:00.000Z",
            payment_status: "captured",
            amount_held: 28,
            amount_captured: 23,
            address: { delivery: { name: "C", line1: "2 Lane", city: "London", postcode: "E2 8AA", phone: "07123456789" } },
            slot_date: "2026-09-24",
            slot_start: "08:00",
            slot_end: "10:00",
            delivery_slot: null,
          },
        ],
      },
    });
    window.__plentry.state().user = { id: "admin", email: "noyouchka.bouchard@gmail.com", name: "Noe" };
    await window.renderAdmin();
    let html = document.getElementById("admin-list").innerHTML;
    assert.ok(!html.includes('id="slot-4"'), "hold only → no slot field yet (shop first)");
    assert.ok(html.includes('id="slot-5"'), "money received → slot field");
    assert.ok(html.includes("customer expects it by"));
    assert.match(html, /order \+ 4 days/);
    assert.ok(html.includes("Confirm this window"));
    assert.ok(html.includes("MUST book"));
    assert.ok(html.includes("Message customer"));
    assert.ok(!html.includes('id="slot-6"'), "promised window uses confirm, not free text");

    document.getElementById("slot-5").value = "  Tue 23 Sep   14:00–16:00 <script>x</script>";
    await window.adminSaveSlot(5);
    const row = window.__sbTables.orders.find((o) => o.id === 5);
    assert.equal(row.delivery_slot, "Tue 23 Sep 14:00–16:00 scriptx/script");
    assert.equal(row.status, "ordered", "saving a slot moves New → Ordered");
    assert.equal(window.__sbTables.orders.find((o) => o.id === 4).delivery_slot, null, "other rows untouched");

    await window.adminConfirmSlot(6);
    const booked = window.__sbTables.orders.find((o) => o.id === 6);
    assert.equal(booked.status, "ordered");
    assert.match(booked.delivery_slot, /24 Sep/);
    assert.match(booked.delivery_slot, /08:00/);

    await window.renderAdmin();
    html = document.getElementById("admin-list").innerHTML;
    assert.ok(html.includes("Update slot"));
    assert.ok(html.includes("Waitrose slot</b> Tue 23 Sep 14:00–16:00 scriptx/script"));
    assert.equal(document.getElementById("admin-list").querySelector("script"), null);
    assert.ok(html.includes("Window already confirmed"));

    // Clearing the field removes the slot but never rewinds the status.
    document.getElementById("slot-5").value = "   ";
    await window.adminSaveSlot(5);
    assert.equal(row.delivery_slot, null);
    assert.equal(row.status, "ordered");
  });

  it("I-O18 Issue is on paid orders, strips markup, and Inbox is founder-only", async () => {
    const { window, document } = await loadApp({
      localState: { ...weekState(), user: { id: "u1", email: "t@t.com", name: "T" } },
      session: { id: "u1", email: "t@t.com", name: "T" },
      tables: {
        meals: [],
        profiles: [],
        ingredient_prices: [],
        orders: [
          {
            id: 21,
            user_id: "u1",
            store: "Tesco",
            total: 12,
            items: { basket: [{ i: "eggs", q: 1 }], meals: [] },
            status: "new",
            created_at: "2026-09-19T10:00:00.000Z",
            payment_status: "authorized",
            amount_held: 15,
            issue_status: null,
          },
        ],
        order_messages: [],
      },
    });
    const S = window.__plentry.state();
    S.user = { id: "u1", email: "t@t.com", name: "T" };
    S.orders = [
      window.orderFromRow(window.__sbTables.orders[0]),
    ];
    window.renderOrders();
    assert.ok(document.getElementById("orders-list").textContent.includes("Issue"));
    await window.openIssueThread(21);
    document.getElementById("issue-body").value = "Driver missed us <b>hi</b>";
    await window.sendIssue();
    const msg = window.__sbTables.order_messages[0];
    assert.ok(msg);
    assert.equal(msg.author_role, "customer");
    assert.equal(msg.body, "Driver missed us bhi/b");
    assert.equal(S.orders[0].issue_status, "open");
    window.closeModal();
    window.renderOrders();
    assert.ok(document.getElementById("orders-list").textContent.includes("View issue"));
    window.nav("inbox");
    assert.ok(document.getElementById("inbox-list").textContent.includes("Admin only"));
    assert.equal(document.getElementById("nav-inbox").style.display, "none");
  });

  it("I-O18 founder Inbox lists open threads and can start one", async () => {
    const { window, document } = await loadApp({
      localState: weekState(),
      session: { id: "admin", email: "noyouchka.bouchard@gmail.com" },
      tables: {
        meals: [],
        profiles: [],
        ingredient_prices: [],
        orders: [
          {
            id: 22,
            email: "c@x.com",
            name: "Guillaume",
            postcode: "E2 8AA",
            store: "Waitrose",
            total: 40,
            items: { basket: [{ i: "eggs", q: 1 }], meals: [] },
            status: "new",
            created_at: "2026-09-19T10:00:00.000Z",
            payment_status: "captured",
            amount_captured: 42,
            slot_date: "2026-09-24",
            slot_start: "08:00",
            slot_end: "10:00",
            issue_status: null,
          },
        ],
        order_messages: [],
      },
    });
    window.__plentry.state().user = { id: "admin", email: "noyouchka.bouchard@gmail.com", name: "Noe" };
    await window.enterApp();
    assert.equal(document.getElementById("nav-inbox").style.display, "");
    await window.openIssueThread(22, true);
    assert.equal(window.__sbTables.orders[0].issue_status, "open");
    document.getElementById("issue-body").value = "Waitrose cannot do 08:00–10:00. 10:00–12:00 instead?";
    await window.sendIssue();
    assert.equal(window.__sbTables.order_messages[0].author_role, "ops");
    assert.ok(!window.__sbTables.order_messages[0].body.includes("<"));
    window.closeModal();
    await window.renderInbox();
    const inbox = document.getElementById("inbox-list").textContent;
    assert.ok(inbox.includes("#22"));
    assert.ok(inbox.includes("Guillaume"));
    assert.equal(document.getElementById("inbox-badge").textContent, "1");
    assert.equal(document.getElementById("inbox-badge").style.display, "flex");
  });
});
