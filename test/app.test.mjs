import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extraMeals, ingredientPriceWriteError, loadApp, makeQuery, mockMfa } from "./harness.mjs";

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

  it("client hold matches pay hold exactly, no 1p difference (Bug 2 fix)", async () => {
    const { window } = await loadApp();
    const testCases = [
      { shop: 62.68, desc: "Tesco 4 servings from bug report" },
      { shop: 20, desc: "round number" },
      { shop: 47.83, desc: "typical fractional" },
      { shop: 100.01, desc: "edge case" },
    ];
    testCases.forEach(({ shop, desc }) => {
      const clientHold = window.holdAmount(shop);
      const charged = shop * 1.05;
      const payHoldPence = Math.round(charged * 1.30 * 100);
      const payHold = payHoldPence / 100;
      assert.equal(clientHold, payHold, `${desc}: client ${clientHold} should equal pay ${payHold}`);
    });
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

  it("I-X03 a hostile cloud prefs.budget becomes null and is not rendered", async () => {
    const st = weekState();
    st.prefs.budget = `<img src=x onerror="alert(1)">`;
    const { window, document } = await loadApp({
      session: { id: "u1", email: "u1@example.com" },
      tables: { meals: [], orders: [], ingredient_prices: [], profiles: [{ id: "u1", state: st }] },
    });
    const S = window.__plentry.state();
    assert.equal(S.prefs.budget, null, "junk from the profiles blob is unset, not replaced with £60");
    window.renderMenu();
    const week = document.getElementById("menu-week");
    assert.equal(week.querySelector('img[src="x"]'), null);
    assert.equal(week.querySelector(".week-under"), null);
    assert.equal(week.innerHTML.includes("NaN"), false);
    assert.equal(week.innerHTML.includes("£0 budget"), false);
    assert.equal(week.innerHTML.includes("under your"), false);
    assert.equal(week.innerHTML.includes("over your"), false);
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
  it("starts with an empty postcode, blocks a blank one, and keeps a saved one", async () => {
    const { window, document } = await loadApp();
    const field = document.getElementById("ob-postcode");
    const profile = document.getElementById("pr-postcode");
    assert.equal(field.value, "");
    assert.equal(field.placeholder, "e.g. E2 8AA");
    assert.equal(profile.placeholder, "e.g. E2 8AA");
    assert.equal(window.__plentry.state().prefs.postcode, "");
    window.renderProfile();
    assert.equal(profile.value, "");

    window.pickPreferredStore("tesco");
    window.obNext(2);
    window.obNext(3);
    window.obNext(4);
    assert.equal(document.getElementById("ob-4").style.display, "block");
    assert.equal(field.value, "");
    window.obNext(5);
    assert.equal(document.getElementById("ob-4").style.display, "block");
    assert.equal(document.getElementById("ob-5").style.display, "none");
    assert.match(document.getElementById("ob-err").textContent, /postcode/i);
    assert.equal(window.__plentry.state().prefs.postcode, "");

    const saved = weekState();
    saved.prefs.postcode = "SW1A 1AA";
    const kept = await loadApp({ localState: saved });
    assert.equal(kept.window.__plentry.state().prefs.postcode, "SW1A 1AA");
    kept.window.showObStep(4);
    assert.equal(kept.document.getElementById("ob-postcode").value, "SW1A 1AA");
    kept.window.renderProfile();
    assert.equal(kept.document.getElementById("pr-postcode").value, "SW1A 1AA");

    const legacy = weekState();
    legacy.prefs.postcode = "E2 8AA";
    const still = await loadApp({ localState: legacy });
    assert.equal(still.window.__plentry.state().prefs.postcode, "E2 8AA");
    still.window.renderProfile();
    assert.equal(still.document.getElementById("pr-postcode").value, "E2 8AA");

    const cloud = weekState();
    delete cloud.prefs.postcode;
    const blank = await loadApp({
      session: { id: "u-pc", email: "pc@example.com" },
      tables: { meals: [], orders: [], ingredient_prices: [], profiles: [{ id: "u-pc", state: cloud }] },
    });
    assert.equal(blank.window.__plentry.state().prefs.postcode, "");
  });

  it("normalises UK postcodes and rejects junk", async () => {
    const { window } = await loadApp();
    assert.equal(window.normPostcode("e28aa"), "E2 8AA");
    assert.equal(window.normPostcode("E2 8AA"), "E2 8AA");
    assert.equal(window.normPostcode("not a postcode"), null);
    assert.equal(window.normPostcode(""), null);
  });

  it("clamps budget to 1–500 and leaves an unset budget null", async () => {
    const { window } = await loadApp();
    assert.equal(window.normBudget(60, 40), 60);
    assert.equal(window.normBudget(9999, 40), 500);
    assert.equal(window.normBudget("nope", 40), 40);
    assert.equal(window.normBudget(null, null), null);
    assert.equal(window.normBudget(undefined, null), null);
    assert.equal(window.normBudget("", null), null);
    assert.equal(window.normBudget("80", null), 80);
    assert.equal(window.normBudget(0, null), null);
  });

  it("I-A07 submitAuth rejects passwords under 8 characters before calling Supabase", async () => {
    const { window, document } = await loadApp();
    let called = 0;
    window.__mockSb.auth.signUp = async () => { called++; return { data: { user: null, session: null }, error: { message: "unit-test" } }; };
    window.openSignup();
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

describe("login opens login", () => {
  function assertLogin(document) {
    assert.equal(document.getElementById("auth-title").textContent, "Welcome back");
    assert.equal(document.getElementById("auth-sub").textContent, "Log in to your kitchen.");
    assert.equal(document.getElementById("auth-btn").textContent, "Log in →");
    assert.equal(document.getElementById("f-name").style.display, "none");
    assert.ok(document.getElementById("su-email"));
    assert.equal(document.getElementById("su-pass").type, "password");
    const sw = document.getElementById("auth-switch");
    assert.equal(sw.tagName, "BUTTON");
    assert.equal(sw.textContent, "Don't have an account?");
  }

  function assertSignup(document) {
    assert.equal(document.getElementById("auth-title").textContent, "Create your account");
    assert.equal(document.getElementById("auth-btn").textContent, "Sign up →");
    assert.notEqual(document.getElementById("f-name").style.display, "none");
    assert.ok(document.getElementById("su-name"));
    assert.equal(document.getElementById("auth-switch-label").textContent, "Already have an account?");
    assert.equal(document.getElementById("auth-switch").textContent, "Log in");
  }

  it("Log in opens the login form", async () => {
    const { document } = await loadApp();
    const pill = document.getElementById("hdr-pill");
    assert.equal(pill.textContent, "Log in");
    pill.click();
    assertLogin(document);
  });

  it('the "Don\'t have an account?" button switches to sign-up, which can return to log in', async () => {
    const { document } = await loadApp();
    document.getElementById("hdr-pill").click();
    assertLogin(document);
    document.getElementById("auth-switch").click();
    assertSignup(document);
    assert.equal(document.getElementById("auth-sub").textContent, "Card hold at checkout — we order to your door from your supermarket.");
    document.getElementById("auth-switch").click();
    assertLogin(document);
  });

  it("sign-up entry points still open sign-up", async () => {
    const { window, document } = await loadApp({ localState: weekState() });
    document.getElementById("hdr-pill").click();
    assertLogin(document);

    assert.equal(window.requireAccount(), false);
    assertSignup(document);
    assert.match(document.getElementById("auth-sub").textContent, /Create an account/);

    document.getElementById("hdr-pill").click();
    assertLogin(document);
    window.openAdvisor();
    assertSignup(document);
    assert.match(document.getElementById("auth-sub").textContent, /meal advisor/);

    document.getElementById("hdr-pill").click();
    assertLogin(document);
    window.showMealDetails(0);
    assertSignup(document);

    document.getElementById("hdr-pill").click();
    assertLogin(document);
    window.toggleMealAt(0);
    assertSignup(document);

    document.getElementById("hdr-pill").click();
    assertLogin(document);
    await window.loadMenuOptions(true);
    assertSignup(document);
    assert.match(document.getElementById("auth-sub").textContent, /new week/);

    document.getElementById("hdr-pill").click();
    assertLogin(document);
    window.pickStore("tesco");
    window.syncBasketFromMeals();
    assert.ok(window.__plentry.getBasket().length > 0);
    window.confirmOrder();
    assertSignup(document);
    assert.match(document.getElementById("auth-sub").textContent, /card hold/);
  });
});

describe("unset budget", () => {
  function budgetMeals() {
    return [
      { name: "Cheap meat", emoji: "🥩", time: 30, ing: ["chickpeas", "onions", "garlic"], tags: ["dinner", "meat"] },
      { name: "Dear fish", emoji: "🐟", time: 30, ing: ["salmon fillet", "olive oil", "parmesan", "potatoes", "lemons"], tags: ["dinner", "fish"] },
      { name: "Cheap veg", emoji: "🥗", time: 30, ing: ["chickpeas", "rice", "onions"], tags: ["dinner", "vegetarian"] },
    ];
  }

  function arm(window, meals) {
    const S = window.__plentry.state();
    S.prefs.preferredStore = "tesco";
    S.prefs.diet = "omnivore";
    S.prefs.tags = [];
    S.prefs.goals = [];
    S.prefs.meals = 2;
    S.prefs.servings = 2;
    S.weekServings = 2;
    S.menuOptions = meals;
    S.selected = [];
    return S;
  }

  function tightBudget(window, meals) {
    const store = window.preferredStoreObj();
    const cost = (name) => window.mealNeedCost(meals.find((m) => m.name === name), store);
    const first = cost("Cheap meat");
    const skip = cost("Dear fish");
    const fit = cost("Cheap veg");
    const lo = (store.fee + first + fit) / 1.2;
    const hi = (store.fee + first + skip) / 1.2;
    assert.ok(skip > fit, `fish ${skip} should cost more than veg ${fit}`);
    assert.ok(hi - lo > 1, `no whole-pound gap between ${lo} and ${hi}`);
    const budget = Math.ceil(lo);
    assert.ok(budget * 1.2 >= store.fee + first + fit, String(budget));
    assert.ok(budget * 1.2 < store.fee + first + skip, String(budget));
    return budget;
  }

  function assertNoBudgetLine(document) {
    const week = document.getElementById("menu-week");
    assert.equal(week.querySelector(".week-under"), null);
    assert.equal(week.innerHTML.includes("NaN"), false);
    assert.equal(week.innerHTML.includes("£0 budget"), false);
    assert.equal(week.innerHTML.includes("under your"), false);
    assert.equal(week.innerHTML.includes("over your"), false);
  }

  it("a new account has no budget, so New week has no cap and the week has no line", async () => {
    const fresh = await loadApp();
    assert.equal(fresh.window.__plentry.state().prefs.budget, null);

    const local = weekState();
    delete local.prefs.budget;
    const missingLocal = await loadApp({ localState: local });
    assert.equal(missingLocal.window.__plentry.state().prefs.budget, null);

    const cloud = weekState();
    delete cloud.prefs.budget;
    cloud.menuOptions = budgetMeals();
    cloud.selected = [];
    cloud.prefs.meals = 2;
    const { window, document } = await loadApp({
      session: { id: "u-new", email: "new@example.com" },
      tables: { meals: [], orders: [], ingredient_prices: [], profiles: [{ id: "u-new", state: cloud }] },
    });
    const S = arm(window, budgetMeals());
    assert.equal(S.prefs.budget, null);
    const open = tightBudget(window, S.menuOptions);
    window.autoPickWeek();
    assert.deepEqual(Array.from(S.selected), ["Cheap meat", "Dear fish"]);
    window.renderMenu();
    assertNoBudgetLine(document);

    S.prefs.budget = open;
    window.autoPickWeek();
    assert.deepEqual(Array.from(S.selected), ["Cheap meat", "Cheap veg"], "the same pool is capped once a number is set");
    S.prefs.budget = null;
  });

  it("a stored numeric budget still caps New week and shows the line", async () => {
    const probe = await loadApp({ localState: weekState() });
    const meals = budgetMeals();
    arm(probe.window, meals);
    const open = tightBudget(probe.window, meals);

    const saved = weekState();
    saved.prefs.budget = open;
    saved.prefs.meals = 2;
    saved.menuOptions = meals;
    saved.selected = [];
    const { window, document } = await loadApp({
      session: { id: "u-old", email: "old@example.com" },
      tables: { meals: [], orders: [], ingredient_prices: [], profiles: [{ id: "u-old", state: saved }] },
    });
    const S = window.__plentry.state();
    assert.equal(S.prefs.budget, open);
    S.menuOptions = meals;
    S.prefs.meals = 2;
    S.prefs.tags = [];
    S.prefs.goals = [];
    S.prefs.diet = "omnivore";
    window.autoPickWeek();
    assert.deepEqual(Array.from(S.selected), ["Cheap meat", "Cheap veg"]);
    window.renderMenu();
    const week = document.getElementById("menu-week");
    assert.ok(week.querySelector(".week-under"));
    assert.ok(week.innerHTML.includes(`your £${open} budget`));
    assert.equal(week.innerHTML.includes("NaN"), false);

    const legacyDefault = weekState();
    legacyDefault.prefs.budget = 60;
    const kept = await loadApp({
      session: { id: "u-60", email: "sixty@example.com" },
      tables: { meals: [], orders: [], ingredient_prices: [], profiles: [{ id: "u-60", state: legacyDefault }] },
    });
    assert.equal(kept.window.__plentry.state().prefs.budget, 60);
    kept.window.renderMenu();
    assert.ok(kept.document.getElementById("menu-week").innerHTML.includes("your £60 budget"));

    const asString = weekState();
    asString.prefs.budget = "80";
    const numeric = await loadApp({
      session: { id: "u-80", email: "eighty@example.com" },
      tables: { meals: [], orders: [], ingredient_prices: [], profiles: [{ id: "u-80", state: asString }] },
    });
    assert.equal(numeric.window.__plentry.state().prefs.budget, 80);
    numeric.window.renderMenu();
    assert.ok(numeric.document.getElementById("menu-week").innerHTML.includes("your £80 budget"));
  });

  it("Profile can set a budget, and then the cap and the line apply", async () => {
    const { window, document } = await loadApp({ localState: weekState() });
    const meals = budgetMeals();
    const S = arm(window, meals);
    S.prefs.budget = null;
    const open = tightBudget(window, meals);
    window.renderProfile();
    assert.equal(document.getElementById("pr-budget").value, "");
    window.saveProfile();
    assert.equal(S.prefs.budget, null);
    window.autoPickWeek();
    assert.deepEqual(Array.from(S.selected), ["Cheap meat", "Dear fish"]);
    window.renderMenu();
    assertNoBudgetLine(document);

    document.getElementById("pr-budget").value = String(open);
    window.saveProfile();
    assert.equal(S.prefs.budget, open);
    window.autoPickWeek();
    assert.deepEqual(Array.from(S.selected), ["Cheap meat", "Cheap veg"]);
    window.renderMenu();
    const week = document.getElementById("menu-week");
    assert.ok(week.querySelector(".week-under"));
    assert.ok(week.innerHTML.includes(`your £${open} budget`));
    assert.equal(week.innerHTML.includes("NaN"), false);
    assert.equal(document.getElementById("pr-budget").value, String(open));
  });

  it("emptying the Profile budget clears it, so the cap and the line turn off", async () => {
    const { window, document } = await loadApp({ localState: weekState() });
    const meals = budgetMeals();
    const S = arm(window, meals);
    const open = tightBudget(window, meals);
    S.prefs.budget = open;
    window.renderProfile();
    const field = document.getElementById("pr-budget");
    assert.equal(field.value, String(open));

    field.value = "";
    window.saveProfile();
    assert.equal(S.prefs.budget, null);
    assert.match(document.getElementById("pr-saved").textContent, /Saved/);
    window.autoPickWeek();
    assert.deepEqual(Array.from(S.selected), ["Cheap meat", "Dear fish"]);
    window.renderMenu();
    assertNoBudgetLine(document);

    S.prefs.budget = open;
    window.renderProfile();
    field.type = "text";
    field.value = "   ";
    window.saveProfile();
    assert.equal(S.prefs.budget, null, "whitespace-only clears the budget");

    S.prefs.budget = open;
    window.renderProfile();
    field.type = "text";
    field.value = "nope";
    window.saveProfile();
    assert.equal(S.prefs.budget, open, "non-numeric input keeps the saved budget");
    field.value = "0";
    window.saveProfile();
    assert.equal(S.prefs.budget, open, "below £1 keeps the saved budget");
    field.value = "9999";
    window.saveProfile();
    assert.equal(S.prefs.budget, 500, "above £500 still clamps to 500");

    S.prefs.budget = open;
    window.renderProfile();
    field.value = "";
    Object.defineProperty(field, "validity", { configurable: true, get() { return { badInput: true }; } });
    window.saveProfile();
    assert.equal(S.prefs.budget, open, "a number field that rejected typed junk keeps the saved budget");
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
    const published = extraMeals().map((m, i) => ({
      ...m,
      id: 300 + i,
      reviewed_at: "2026-09-01T00:00:00.000Z",
      tags: ["dinner", "meat"],
    }));
    const { window } = await loadApp({
      localState: weekState(),
      tables: { meals: published, orders: [], profiles: [], ingredient_prices: [] },
    });
    const S = window.__plentry.state();
    const n = S.prefs.meals;
    assert.equal(S.selected.length, n);
    const extras = extraMeals().filter((m) => !S.selected.includes(m.name)).slice(0, 3);
    assert.ok(extras.length >= 2);
    window.__plentry.setAdvisor(extras, extras.map((_, i) => i));
    await window.addAdvisorMeals();
    assert.equal(S.selected.length, n);
    assert.ok(S.selected.includes(extras[0].name));
  });

  it("I-W07 vegetarian, vegan and pescatarian filter New week and Modify", async () => {
    const veganA = { name: "Vegan one", emoji: "🥗", time: 20, ing: ["chickpeas", "rice", "spinach", "onions", "garlic"], tags: ["dinner", "vegan", "vegetarian"], id: 1, reviewed_at: "2026-09-01" };
    const veganB = { name: "Vegan two", emoji: "🥗", time: 25, ing: ["chickpeas", "tomatoes", "rice", "onions"], tags: ["dinner", "vegan", "vegetarian"], id: 2, reviewed_at: "2026-09-01" };
    const veg = { name: "Veg eggs", emoji: "🍳", time: 20, ing: ["eggs", "passata", "onions", "feta"], tags: ["dinner", "vegetarian"], id: 3, reviewed_at: "2026-09-01" };
    const fish = { name: "Fish supper", emoji: "🐟", time: 25, ing: ["salmon fillet", "potatoes", "lemons"], tags: ["dinner", "fish"], id: 4, reviewed_at: "2026-09-01" };
    const meat = { name: "Meat supper", emoji: "🍝", time: 30, ing: ["minced beef", "spaghetti", "onions", "garlic"], tags: ["dinner", "meat"], id: 5, reviewed_at: "2026-09-01" };
    const pool = [veganA, veganB, veg, fish, meat];
    const { window } = await loadApp({
      localState: weekState(),
      tables: { meals: pool, orders: [], profiles: [], ingredient_prices: [] },
    });
    const S = window.__plentry.state();
    S.menuOptions = pool;
    S.prefs.budget = 500;
    S.prefs.tags = [];
    S.prefs.goals = [];

    S.prefs.diet = "vegetarian";
    S.prefs.meals = 3;
    window.autoPickWeek();
    assert.equal(S.selected.length, 3);
    S.selected.forEach((n) => {
      const d = window.__plentry.mealDiet(window.mealByName(n));
      assert.ok(d === "vegetarian" || d === "vegan", `${n} ${d}`);
    });

    S.prefs.diet = "vegan";
    S.prefs.meals = 2;
    window.autoPickWeek();
    assert.deepEqual(Array.from(S.selected).sort(), ["Vegan one", "Vegan two"]);

    S.prefs.diet = "pescatarian";
    S.prefs.meals = 4;
    window.autoPickWeek();
    assert.equal(S.selected.length, 4);
    assert.equal(S.selected.includes("Meat supper"), false);
    assert.ok(S.selected.includes("Fish supper"));

    S.prefs.diet = "vegetarian";
    S.selected = ["Veg eggs"];
    await window.openModify(0);
    window.__plentry.modifyPicks().forEach((m) => {
      const d = window.__plentry.mealDiet(m);
      assert.ok(d === "vegetarian" || d === "vegan", m.name);
    });

    S.prefs.diet = "vegan";
    S.selected = ["Vegan one"];
    await window.openModify(0);
    const veganPicks = window.__plentry.modifyPicks();
    assert.ok(veganPicks.length >= 1);
    veganPicks.forEach((m) => assert.equal(window.__plentry.mealDiet(m), "vegan", m.name));

    S.prefs.diet = "pescatarian";
    S.selected = ["Fish supper"];
    await window.openModify(0);
    const fishPicks = window.__plentry.modifyPicks();
    assert.ok(fishPicks.some((m) => window.__plentry.mealDiet(m) === "fish" || window.__plentry.mealDiet(m) === "vegetarian" || window.__plentry.mealDiet(m) === "vegan"));
    fishPicks.forEach((m) => assert.notEqual(window.__plentry.mealDiet(m), "meat", m.name));
  });

  it("saved goals and budget still apply, and missing goals add no weight", async () => {
    const { window } = await loadApp({ localState: weekState() });
    const S = window.__plentry.state();
    const quick = { name: "Quick bowl", time: 20, ing: ["chickpeas", "rice", "onions"], tags: ["dinner", "vegan", "vegetarian", "quick"] };
    const plain = { name: "Plain bowl", time: 40, ing: ["chickpeas", "rice", "onions"], tags: ["dinner", "vegan", "vegetarian"] };
    S.prefs.diet = "vegan";
    S.prefs.tags = [];
    S.prefs.goals = ["decide", "budget", "variety"];
    S.prefs.budget = 80;
    assert.deepEqual(Array.from(window.__plentry.wantedTags()), ["quick"]);
    assert.ok(window.__plentry.scoreMeal(quick) > window.__plentry.scoreMeal(plain));
    S.prefs.goals = [];
    assert.deepEqual(Array.from(window.__plentry.wantedTags()), []);
    assert.equal(window.__plentry.scoreMeal(quick), window.__plentry.scoreMeal(plain));
    S.prefs.goals = ["shop", "waste"];
    S.prefs.tags = ["meal_prep"];
    assert.deepEqual(Array.from(window.__plentry.wantedTags()), ["meal_prep"]);
    S.menuOptions = [quick, plain, { name: "Meat supper", time: 30, ing: ["minced beef", "onions", "garlic"], tags: ["dinner", "meat"] }];
    S.prefs.meals = 2;
    window.autoPickWeek();
    assert.deepEqual(Array.from(S.selected).sort(), ["Plain bowl", "Quick bowl"]);
    assert.equal(S.prefs.budget, 80);
    assert.deepEqual(Array.from(S.prefs.goals), ["shop", "waste"]);
    S.prefs.tags = [];
    S.prefs.goals = null;
    assert.deepEqual(Array.from(window.__plentry.wantedTags()), []);
    window.autoPickWeek();
    assert.equal(S.selected.length, 2);
    assert.equal(S.prefs.budget, 80);
  });

  it("openModify offers 6 catalog dinners when enough fit and does not call the AI", async () => {
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
    assert.equal(picks.length, 6);
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
    window.showObStep(5);
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
    window.showObStep(3);
    assert.ok(document.getElementById("ob-tags").textContent.includes("High protein"));
    assert.ok(!document.getElementById("ob-tags").textContent.includes("Meal prep"));
    window.showObStep(2);
    assert.ok(document.getElementById("ob-diet").textContent.includes("Everything"));
    window.nav("profile");
    assert.ok(document.getElementById("pr-tags").textContent.includes("High protein"));
    assert.ok(!document.getElementById("pr-tags").textContent.includes("Meal prep"));
  });
});

describe("I-W09 hidden meals", () => {
  const ING = ["chicken thighs", "rice", "onions", "garlic"];
  function row(id, name, category, reviewed) {
    return {
      id,
      name,
      emoji: "🍽️",
      time: 30,
      ing: ING.slice(),
      tags: ["dinner", "meat"],
      category,
      reviewed_at: reviewed,
    };
  }

  it("I-W09 ensureWeek swaps hidden and unknown dinners and shows the notice", async () => {
    const liveCurry = row(20, "Live curry", "curry_stew", "2026-09-08T12:00:00.000Z");
    const livePasta = row(21, "Live pasta", "pasta", "2026-09-08T12:00:00.000Z");
    const liveBake = row(22, "Live bake", "oven_bake", "2026-09-08T12:00:00.000Z");
    const hiddenCurry = row(151, "Hidden curry", "curry_stew", null);
    const hiddenTray = row(162, "Hidden traybake", "oven_bake", null);
    const meals = [liveCurry, livePasta, liveBake, hiddenCurry, hiddenTray];
    const state = weekState();
    state.selected = ["Live bake"];
    state.menuOptions = [liveBake];
    state.prefs.diet = "omnivore";
    state.prefs.tags = [];
    state.prefs.goals = [];
    const { window } = await loadApp({
      localState: state,
      tables: { meals, orders: [], profiles: [], ingredient_prices: [] },
    });
    await window.ensureWeek();
    const S = window.__plentry.state();
    assert.deepEqual(Array.from(S.selected), ["Live bake"]);
    assert.equal(S.menuOptions.some((m) => m.name === "Hidden curry"), false);
    assert.equal(S.menuOptions.some((m) => m.name === "Hidden traybake"), false);
    assert.equal(window.__plentry.isPublished(hiddenCurry), false);
    assert.deepEqual(Array.from(window.__plentry.publishedPool([hiddenCurry]).map((m) => m.name)), []);

    const selects = [];
    const orig = window.__mockSb.from.bind(window.__mockSb);
    window.__mockSb.from = (table) => {
      if (table !== "meals") return orig(table);
      const q = {
        _cols: "",
        select(cols) { this._cols = String(cols); selects.push(this._cols); return this; },
        eq() { return this; },
        order() { return this; },
        limit() { return this; },
        then(ok, err) {
          const cols = this._cols;
          if (cols.includes("recipe")) {
            return Promise.resolve({ data: null, error: { message: "column recipe does not exist" } }).then(ok, err);
          }
          const keep = cols.split(",").map((s) => s.trim());
          const data = meals.map((meal) => {
            const out = {};
            for (const c of keep) if (Object.prototype.hasOwnProperty.call(meal, c)) out[c] = meal[c];
            return out;
          });
          return Promise.resolve({ data, error: null }).then(ok, err);
        },
      };
      return q;
    };

    S.selected = ["Hidden curry", "Lemon chicken & parmesan rice", "Live bake"];
    await window.ensureWeek();
    const fallback = selects.find((cols) => !cols.includes("recipe"));
    assert.ok(fallback, "fallback catalog query ran");
    assert.equal(fallback.includes("id"), true, fallback);
    assert.equal(fallback.includes("reviewed_at"), true, fallback);
    assert.equal(S.selected[0], "Live curry");
    assert.equal(S.selected[2], "Live bake");
    assert.equal(S.selected.length, 3);
    assert.equal(S.selected.includes("Hidden curry"), false);
    assert.equal(S.selected.includes("Hidden traybake"), false);
    assert.equal(S.selected.includes("Lemon chicken & parmesan rice"), false);
    S.selected.forEach((name) => {
      const meal = S.menuOptions.find((m) => m.name === name);
      assert.ok(meal, name);
      assert.equal(window.__plentry.isPublished(meal), true, name);
    });
    assert.equal(S.menuOptions.some((m) => m.id === 151 || m.id === 162), false);
    const notice = window.document.getElementById("week-swap-notice");
    assert.ok(notice);
    assert.equal(notice.textContent, "We swapped 2 meals that are no longer available.");
    const saved = JSON.parse(window.localStorage.getItem("plentry_v1"));
    assert.deepEqual(saved.selected, Array.from(S.selected));
    assert.equal(saved.selected.includes("Hidden curry"), false);
    assert.equal(saved.selected.includes("Lemon chicken & parmesan rice"), false);

    const kept = Array.from(S.selected);
    await window.ensureWeek();
    assert.deepEqual(Array.from(S.selected), kept);
    assert.equal(window.document.getElementById("week-swap-notice").textContent, "We swapped 2 meals that are no longer available.");
  });

  it("I-W09 placeOrder refuses a hidden or unknown dinner and does not insert", async () => {
    const liveBake = row(22, "Live bake", "oven_bake", "2026-09-08T12:00:00.000Z");
    const hiddenCurry = row(151, "Hidden curry", "curry_stew", null);
    const state = weekState();
    state.user = { id: "u1", email: "t@t.com", name: "T" };
    state.selected = ["Live bake"];
    state.menuOptions = [liveBake];
    state.prefs.delivery = null;
    const { window, document } = await loadApp({
      localState: state,
      session: { id: "u1", email: "t@t.com", name: "T" },
      tables: {
        meals: [liveBake, hiddenCurry, row(162, "Hidden traybake", "oven_bake", null)],
        orders: [],
        profiles: [],
        ingredient_prices: [],
      },
    });
    const S = window.__plentry.state();
    S.user = { id: "u1", email: "t@t.com", name: "T" };
    S.selected = ["Hidden curry", "Lemon chicken & parmesan rice", "Live bake"];
    window.pickStore("tesco");
    window.syncBasketFromMeals();
    assert.ok(window.__plentry.getBasket().length > 0);
    window.confirmOrder();
    window.__chosenSlot = { date: window.slotDays()[0], start: "08:00" };
    document.getElementById("del-name").value = "Noe";
    document.getElementById("del-phone").value = "07123456789";
    document.getElementById("del-line1").value = "1 Test Street";
    document.getElementById("del-city").value = "London";
    document.getElementById("del-postcode").value = "E2 8AA";
    await window.placeOrder();
    assert.equal(window.__sbTables.orders.length, 0);
    assert.match(document.getElementById("del-err").textContent, /Refresh your week/);
    assert.match(document.getElementById("del-err").textContent, /no longer available/);

    S.selected = ["Live bake"];
    window.syncBasketFromMeals();
    await window.placeOrder();
    assert.equal(window.__sbTables.orders.length, 1);
    assert.deepEqual(Array.from(window.__sbTables.orders[0].items.meals), ["Live bake"]);
  });

  it("I-W09 an advisor draft stays off the week and shows the review message", async () => {
    const liveBake = row(22, "Live bake", "oven_bake", "2026-09-08T12:00:00.000Z");
    const liveCurry = row(20, "Live curry", "curry_stew", "2026-09-08T12:00:00.000Z");
    const draft = row(401, "Advisor chilli", "curry_stew", null);
    const state = weekState();
    state.selected = ["Live bake"];
    state.menuOptions = [liveBake];
    state.prefs.meals = 3;
    state.prefs.diet = "omnivore";
    state.prefs.tags = [];
    state.prefs.goals = [];
    const { window, document } = await loadApp({
      localState: state,
      tables: { meals: [liveBake, liveCurry, draft], orders: [], profiles: [], ingredient_prices: [] },
    });
    await window.ensureWeek();
    const S = window.__plentry.state();
    assert.deepEqual(Array.from(S.selected), ["Live bake"]);
    const idea = { name: "Advisor chilli", emoji: "🌶️", time: 30, ing: ING.slice(), tags: ["dinner", "meat"] };
    const known = { name: "Live curry", emoji: "🍛", time: 30, ing: ING.slice(), tags: ["dinner", "meat"] };
    window.__plentry.setAdvisor([idea, known], [0, 1]);
    await window.addAdvisorMeals();
    assert.equal(S.selected.includes("Advisor chilli"), false);
    assert.equal(S.menuOptions.some((m) => m.name === "Advisor chilli"), false);
    assert.equal(S.selected.includes("Live curry"), true);
    assert.equal(S.selected.includes("Live bake"), true);
    const notice = document.getElementById("advisor-review-notice");
    assert.ok(notice);
    assert.equal(notice.textContent, "We've sent this idea to our kitchen to review.");
  });

  it("I-W09 placeOrder refusal swaps the week and shows the notice", async () => {
    const liveCurry = row(20, "Live curry", "curry_stew", "2026-09-08T12:00:00.000Z");
    const livePasta = row(21, "Live pasta", "pasta", "2026-09-08T12:00:00.000Z");
    const liveBake = row(22, "Live bake", "oven_bake", "2026-09-08T12:00:00.000Z");
    const hiddenCurry = row(151, "Hidden curry", "curry_stew", null);
    const state = weekState();
    state.user = { id: "u1", email: "t@t.com", name: "T" };
    state.selected = ["Live bake"];
    state.menuOptions = [liveBake];
    state.prefs.delivery = null;
    state.prefs.diet = "omnivore";
    state.prefs.tags = [];
    state.prefs.goals = [];
    const { window, document } = await loadApp({
      localState: state,
      session: { id: "u1", email: "t@t.com", name: "T" },
      tables: {
        meals: [liveCurry, livePasta, liveBake, hiddenCurry],
        orders: [],
        profiles: [],
        ingredient_prices: [],
      },
    });
    const S = window.__plentry.state();
    await window.ensureWeek();
    S.user = { id: "u1", email: "t@t.com", name: "T" };
    S.selected = ["Hidden curry", "Lemon chicken & parmesan rice", "Live bake"];
    window.pickStore("tesco");
    window.syncBasketFromMeals();
    window.confirmOrder();
    window.__chosenSlot = { date: window.slotDays()[0], start: "08:00" };
    document.getElementById("del-name").value = "Noe";
    document.getElementById("del-phone").value = "07123456789";
    document.getElementById("del-line1").value = "1 Test Street";
    document.getElementById("del-city").value = "London";
    document.getElementById("del-postcode").value = "E2 8AA";
    await window.placeOrder();
    assert.equal(window.__sbTables.orders.length, 0);
    assert.equal(S.selected.includes("Hidden curry"), false);
    assert.equal(S.selected.includes("Lemon chicken & parmesan rice"), false);
    assert.equal(S.selected.includes("Live bake"), true);
    assert.equal(S.selected[0], "Live curry");
    assert.equal(S.selected.length, 3);
    const notice = document.getElementById("week-swap-notice");
    assert.ok(notice);
    assert.equal(notice.textContent, "We swapped 2 meals that are no longer available.");
    window.syncBasketFromMeals();
    window.confirmOrder();
    window.__chosenSlot = { date: window.slotDays()[0], start: "08:00" };
    document.getElementById("del-name").value = "Noe";
    document.getElementById("del-phone").value = "07123456789";
    document.getElementById("del-line1").value = "1 Test Street";
    document.getElementById("del-city").value = "London";
    document.getElementById("del-postcode").value = "E2 8AA";
    await window.placeOrder();
    assert.equal(window.__sbTables.orders.length, 1);
    assert.equal(window.__sbTables.orders[0].items.meals.includes("Hidden curry"), false);
    assert.equal(window.__sbTables.orders[0].items.meals.includes("Lemon chicken & parmesan rice"), false);
  });

  it("I-W09 a successful catalog read leaves out built-ins that are not in the database", async () => {
    const liveBake = row(22, "Live bake", "oven_bake", "2026-09-08T12:00:00.000Z");
    const hiddenSalmon = row(151, "Salmon traybake", "oven_bake", null);
    const state = weekState();
    state.selected = ["Live bake"];
    state.menuOptions = [liveBake];
    state.prefs.diet = "omnivore";
    state.prefs.tags = [];
    state.prefs.goals = [];
    const { window } = await loadApp({
      localState: state,
      tables: { meals: [liveBake, hiddenSalmon], orders: [], profiles: [], ingredient_prices: [] },
    });
    await window.ensureWeek();
    const S = window.__plentry.state();
    const names = S.menuOptions.map((m) => m.name);
    assert.equal(names.includes("Live bake"), true);
    assert.equal(names.includes("Salmon traybake"), false);
    assert.equal(names.includes("Chicken & chickpea curry"), false);
    assert.equal(names.includes("Shakshuka"), false);
    assert.equal(window.mealByName("Chicken & chickpea curry"), null);
    assert.equal(window.mealByName("Salmon traybake"), null);
    assert.deepEqual(Array.from(S.selected), ["Live bake"]);
  });
});

describe("seeded tie-break", () => {
  const ING = ["minced beef", "spaghetti", "onions", "garlic", "passata"];
  function tied(id, tags) {
    return {
      name: "Tied " + id,
      emoji: "🍝",
      time: 30,
      ing: ING.slice(),
      tags: tags || ["dinner", "meat"],
      id,
      reviewed_at: "2026-10-23",
    };
  }
  function names(list) {
    return list.map((m) => m.name);
  }
  function armWeek(window, pool) {
    const S = window.__plentry.state();
    S.menuOptions = pool.map((m) => ({ ...m, ing: m.ing.slice(), tags: m.tags.slice() }));
    S.prefs.meals = 4;
    S.prefs.budget = null;
    S.prefs.diet = "omnivore";
    S.prefs.tags = [];
    S.prefs.goals = [];
    S.selected = [];
    return S;
  }

  function signIn(window) {
    const S = window.__plentry.state();
    S.user = { id: "u-seed", email: "seed@example.com" };
    S.prefs.meals = 4;
    S.prefs.budget = null;
    S.prefs.diet = "omnivore";
    S.prefs.tags = [];
    S.prefs.goals = [];
    return S;
  }

  async function newWeekSequence(window, n) {
    const S = window.__plentry.state();
    const out = [];
    for (let i = 0; i < n; i++) {
      await window.loadMenuOptions(true);
      const seed = window.__plentry.weekSeed();
      const week = Array.from(S.selected);
      await window.openModify(0);
      const modify = window.__plentry.modifyPicks().map((m) => m.name);
      window.closeModal();
      await window.openModify(0);
      assert.deepEqual(window.__plentry.modifyPicks().map((m) => m.name), modify, "Modify stays on this week's seed");
      assert.equal(window.__plentry.weekSeed(), seed);
      window.closeModal();
      out.push({ seed, week, modify });
    }
    return out;
  }

  it("I-W08 a pinned seed repeats the New week sequence, and Modify stays on that week", async () => {
    const pool = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((id) => tied(id));
    async function run(seed, how) {
      const state = weekState();
      state.menuOptions = pool.map((m) => ({ ...m, ing: m.ing.slice(), tags: m.tags.slice() }));
      state.selected = state.menuOptions.slice(0, state.prefs.meals).map((m) => m.name);
      const { window } = await loadApp({
        url: how === "query" ? "https://getplentry.com/?seed=" + seed : "https://getplentry.com/",
        localState: state,
        tables: { meals: pool, orders: [], profiles: [], ingredient_prices: [] },
      });
      signIn(window);
      if (how === "setter") window.__plentry.setWeekSeed(seed);
      return newWeekSequence(window, 3);
    }
    const queryA = await run(4242, "query");
    const queryB = await run(4242, "query");
    assert.deepEqual(queryB, queryA);
    assert.deepEqual(queryA.map((row) => row.seed), [4242, 4243, 4244]);
    assert.equal(new Set(queryA.map((row) => row.week.join("|"))).size, 3);
    queryA.forEach((row) => {
      assert.equal(row.week.length, 4);
      assert.equal(row.modify.length, 6);
      row.modify.forEach((name) => assert.equal(row.week.includes(name), false, name));
    });

    const setA = await run(50, "setter");
    const setB = await run(50, "setter");
    assert.deepEqual(setB, setA);
    assert.deepEqual(setA.map((row) => row.seed), [50, 51, 52]);

    const wrap = await run(0xffffffff, "setter");
    assert.deepEqual(wrap.map((row) => row.seed), [0xffffffff, 0, 1]);
  });

  it("I-W08 consecutive unpinned New week taps mint a new seed and usually differ", async () => {
    const pool = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((id) => tied(id));
    const { window } = await loadApp({
      localState: weekState(),
      tables: { meals: pool, orders: [], profiles: [], ingredient_prices: [] },
    });
    signIn(window);
    const seeds = [];
    const weeks = [];
    for (let i = 0; i < 6; i++) {
      await window.loadMenuOptions(true);
      const seed = window.__plentry.weekSeed();
      seeds.push(seed);
      weeks.push(Array.from(window.__plentry.state().selected).join("|"));
      await window.openModify(0);
      const page = window.__plentry.modifyPicks().map((m) => m.name);
      window.closeModal();
      await window.openModify(0);
      assert.deepEqual(window.__plentry.modifyPicks().map((m) => m.name), page);
      assert.equal(window.__plentry.weekSeed(), seed);
      window.closeModal();
    }
    assert.equal(new Set(seeds).size, seeds.length, "each tap mints a seed");
    let changes = 0;
    for (let i = 1; i < weeks.length; i++) if (weeks[i] !== weeks[i - 1]) changes += 1;
    assert.ok(changes >= 4, weeks.join(" / "));
  });

  it("I-W08 a different seed can change the week and the Modify order", async () => {
    const pool = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => tied(id));
    const { window } = await loadApp({
      localState: weekState(),
      tables: { meals: pool, orders: [], profiles: [], ingredient_prices: [] },
    });
    const S = armWeek(window, pool);
    const weeks = new Set();
    const pages = new Set();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      window.__plentry.setWeekSeed(seed);
      S.menuOptions = pool.map((m) => ({ ...m, ing: m.ing.slice(), tags: m.tags.slice() }));
      S.selected = [];
      S.prefs.meals = 4;
      S.prefs.budget = null;
      window.autoPickWeek();
      weeks.add(Array.from(S.selected).join("|"));
      S.selected = ["Tied 1"];
      await window.openModify(0);
      pages.add(window.__plentry.modifyPicks().map((m) => m.name).join("|"));
    }
    assert.ok(weeks.size > 1, [...weeks].slice(0, 4).join(" / "));
    assert.ok(pages.size > 1, [...pages].slice(0, 4).join(" / "));
  });

  it("I-W08 a higher score stays ahead of the tie-break", async () => {
    const { window } = await loadApp();
    const meat = tied(1, ["dinner", "meat"]);
    const fish = tied(2, ["dinner", "fish"]);
    fish.name = "Tied fish";
    const veg = tied(3, ["dinner", "vegetarian"]);
    veg.name = "Tied veg";
    veg.ing = ["chickpeas", "rice", "onions", "garlic"];
    const input = [veg, fish, meat];
    for (const seed of [0, 1, 7, 99, 4242]) {
      window.__plentry.setWeekSeed(seed);
      const forward = names(window.rankCatalog(input));
      const backward = names(window.rankCatalog(input.slice().reverse()));
      assert.deepEqual(forward, ["Tied 1", "Tied fish", "Tied veg"], "seed " + seed);
      assert.deepEqual(backward, forward);
      const scores = window.rankCatalog(input).map((m) => window.__plentry.scoreMeal(m));
      for (let i = 1; i < scores.length; i++) assert.ok(scores[i - 1] >= scores[i]);
    }
  });

  it("I-W08 the tie-break key follows the meal id, including when the id is missing", async () => {
    const { window } = await loadApp();
    window.__plentry.setWeekSeed(42);
    const a = tied(10);
    const b = tied(20);
    const c = tied(30);
    const pair = names(window.rankCatalog([b, a]));
    const withC = names(window.rankCatalog([c, a, b])).filter((n) => n !== c.name);
    assert.deepEqual(withC, pair);

    const x = tied(1);
    const y = tied(2);
    delete x.id;
    delete y.id;
    x.name = "No id A";
    y.name = "No id B";
    assert.deepEqual(names(window.rankCatalog([y, x])), names(window.rankCatalog([x, y])));
  });

  it("I-W08 rankCatalog does not call Math.random", async () => {
    const { window } = await loadApp();
    window.__plentry.setWeekSeed(3);
    const meals = [1, 2, 3, 4, 5].map((id) => tied(id));
    let calls = 0;
    const orig = window.Math.random;
    window.Math.random = function () {
      calls += 1;
      return orig.call(this);
    };
    window.rankCatalog(meals);
    window.rankCatalog(meals.slice().reverse());
    window.autoPickWeek();
    window.Math.random = orig;
    assert.equal(calls, 0);
  });

  it("I-W08 tie-break order across seeds is roughly uniform", async () => {
    const { window } = await loadApp();
    const meals = [1, 2, 3, 4].map((id) => tied(id));
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const n = 800;
    for (let s = 1; s <= n; s++) {
      window.__plentry.setWeekSeed(s);
      const first = window.rankCatalog(meals)[0];
      counts[first.id] += 1;
    }
    const expected = n / 4;
    let chi = 0;
    for (const id of [1, 2, 3, 4]) {
      assert.ok(counts[id] > expected * 0.7 && counts[id] < expected * 1.3, JSON.stringify(counts));
      chi += ((counts[id] - expected) ** 2) / expected;
    }
    assert.ok(chi < 25, "chi " + chi + " " + JSON.stringify(counts));
  });

  it("I-W08 ?seed= and setWeekSeed pin the session seed", async () => {
    const stored = await loadApp();
    stored.window.sessionStorage.setItem("plentry_week_seed", "99");
    assert.equal(stored.window.__plentry.weekSeed(), 99);
    assert.equal(stored.window.__plentry.weekSeed(), 99);
    assert.equal(stored.window.sessionStorage.getItem("plentry_week_seed"), "99");

    const minted = await loadApp();
    const a = minted.window.__plentry.weekSeed();
    assert.equal(minted.window.__plentry.weekSeed(), a);
    assert.equal(minted.window.sessionStorage.getItem("plentry_week_seed"), String(a));
    assert.equal(a >>> 0, a);

    const queried = await loadApp({ url: "https://getplentry.com/?seed=15" });
    queried.window.sessionStorage.setItem("plentry_week_seed", "99");
    assert.equal(queried.window.__plentry.weekSeed(), 15);
    assert.equal(queried.window.sessionStorage.getItem("plentry_week_seed"), "15");
    assert.equal(queried.window.__plentry.setWeekSeed(8), 8);
    assert.equal(queried.window.__plentry.weekSeed(), 8);
    assert.equal(queried.window.setWeekSeed("8"), 8);
    assert.equal(queried.window.sessionStorage.getItem("plentry_week_seed"), "8");

    const text = await loadApp({ url: "https://getplentry.com/?seed=smoke" });
    const hashed = text.window.__plentry.weekSeed();
    assert.equal(typeof hashed, "number");
    assert.equal(hashed >>> 0, hashed);
    const again = await loadApp({ url: "https://getplentry.com/?seed=smoke" });
    assert.equal(again.window.__plentry.weekSeed(), hashed);
  });
});

describe("Modify alternatives", () => {
  const FALLBACK_WEEK = [
    "Chicken & chickpea curry",
    "Salmon traybake",
    "Beef ragù spaghetti",
    "Halloumi fajitas",
    "Shakshuka",
    "Chickpea & spinach curry",
    "Greek chicken bowls",
    "Veggie spaghetti pomodoro",
  ];
  const VEGAN_ING = ["chickpeas", "rice", "spinach", "onions", "garlic"];
  let seq = 1;
  function reviewed(name, tags, ing) {
    seq += 1;
    return {
      name,
      emoji: "🍽️",
      time: 30,
      ing: ing || ["minced beef", "spaghetti", "onions", "garlic", "passata"],
      tags,
      id: seq,
      reviewed_at: "2026-10-22",
    };
  }
  function meat(name, tags) {
    return reviewed(name, tags || ["dinner", "meat"]);
  }
  async function boot() {
    return loadApp({
      localState: weekState(),
      tables: { meals: [], orders: [], profiles: [], ingredient_prices: [] },
    });
  }
  function arm(window, tables, meals, opts = {}) {
    const S = window.__plentry.state();
    tables.meals = meals;
    S.prefs.diet = opts.diet || "omnivore";
    S.prefs.tags = opts.tags || [];
    S.prefs.goals = [];
    if (opts.meals) S.prefs.meals = opts.meals;
    S.selected = (opts.selected || FALLBACK_WEEK).slice();
    if (opts.menuOptions) S.menuOptions = opts.menuOptions;
    else {
      const have = new Set((S.menuOptions || []).map((m) => m.name));
      S.selected.forEach((name) => {
        if (!name || have.has(name)) return;
        S.menuOptions.push({
          name,
          emoji: "🍽️",
          time: 30,
          ing: ["chicken thighs", "rice", "onions", "garlic"],
          tags: ["dinner", "meat"],
        });
        have.add(name);
      });
    }
    return S;
  }
  function pickNames(window) {
    return window.__plentry.modifyPicks().map((m) => m.name);
  }

  it("I-W02 shows 6 alternatives when at least 6 fit, and 4 or 5 when that is all", async () => {
    const { window, document, tables } = await boot();
    for (const n of [6, 5, 4, 10]) {
      const meals = Array.from({ length: n === 10 ? 10 : n }, (_, i) => meat(`Count ${n}-${i + 1}`));
      arm(window, tables, meals);
      await window.openModify(0);
      const want = n >= 6 ? 6 : n;
      assert.equal(pickNames(window).length, want, `pool ${n}`);
      assert.equal(document.querySelectorAll("#modify-alts .day-card").length, want);
      const refresh = document.getElementById("modify-refresh");
      assert.ok(refresh);
      if (n > 6) assert.equal(refresh.disabled, false);
      else assert.equal(refresh.disabled, true);
    }
  });

  it("I-W02 excludes this week, the dinner being replaced, and alternatives already shown", async () => {
    const { window, document, tables } = await boot();
    const meals = Array.from({ length: 12 }, (_, i) => meat(`Page ${i + 1}`));
    const S = arm(window, tables, meals, { selected: FALLBACK_WEEK.concat(["Page 1"]) });
    await window.openModify(0);
    const first = pickNames(window);
    assert.equal(first.length, 6);
    assert.equal(first.includes("Page 1"), false);
    assert.equal(first.includes(S.selected[0]), false);
    first.forEach((name) => assert.equal(S.selected.includes(name), false, name));
    assert.deepEqual([...window.__plentry.modifySeen()].sort(), [...first].sort());
    assert.equal(document.getElementById("modify-refresh").textContent, "Show 4 more");

    document.getElementById("modify-refresh").click();
    const second = pickNames(window);
    assert.equal(second.length, 4);
    second.forEach((name) => {
      assert.equal(first.includes(name), false, name);
      assert.equal(S.selected.includes(name), false, name);
    });
    assert.equal(document.getElementById("modify-refresh").textContent, "Show 1 more");

    document.getElementById("modify-refresh").click();
    const third = pickNames(window);
    assert.equal(third.length, 1);
    third.concat(second).forEach((name) => assert.equal(first.includes(name), false));
    const shown = first.concat(second, third).sort();
    const eligible = meals.map((m) => m.name).filter((name) => name !== "Page 1").sort();
    assert.deepEqual(shown, eligible);
    assert.equal(document.querySelectorAll("#modify-alts .day-card").length, 1);
    assert.equal(document.getElementById("modify-refresh").disabled, true);
    assert.ok(document.getElementById("modify-end"));
    assert.equal(document.getElementById("modify-empty"), null);

    window.refreshModify();
    assert.deepEqual(pickNames(window), third);
    assert.equal(document.querySelectorAll("#modify-alts .day-card").length, 1);
    assert.ok(document.getElementById("modify-end"));
    assert.equal(document.getElementById("modify-refresh").disabled, true);

    document.getElementById("modify-restart").click();
    assert.equal(pickNames(window).length, 6);
    assert.equal(window.__plentry.modifySeen().length, 6);
    assert.equal(document.getElementById("modify-refresh").disabled, false);
    assert.equal(document.getElementById("modify-end"), null);
    pickNames(window).forEach((name) => assert.equal(S.selected.includes(name), false));
  });

  it("I-W02 diet filter drops meals that do not fit, including unpublished rows", async () => {
    const { window, document, tables } = await boot();
    const vegan = reviewed("Alt vegan bowl", ["dinner", "vegan", "vegetarian"], VEGAN_ING);
    const veg = reviewed("Alt veg eggs", ["dinner", "vegetarian"], ["eggs", "passata", "onions", "feta", "garlic"]);
    const fish = reviewed("Alt fish supper", ["dinner", "fish"], ["salmon fillet", "potatoes", "lemons", "garlic"]);
    const meatMeal = meat("Alt meat supper");
    const draft = reviewed("Alt draft vegan", ["dinner", "vegan", "vegetarian"], VEGAN_ING);
    draft.reviewed_at = null;
    const meals = [vegan, veg, fish, meatMeal, draft];

    arm(window, tables, meals, { diet: "vegan" });
    await window.openModify(0);
    assert.deepEqual(pickNames(window), ["Alt vegan bowl"]);
    assert.equal(document.getElementById("modal").textContent.includes("Alt draft vegan"), false);
    assert.equal(document.getElementById("modal").textContent.includes("Alt meat supper"), false);

    arm(window, tables, meals, { diet: "vegetarian" });
    await window.openModify(0);
    const vegPicks = pickNames(window).sort();
    assert.deepEqual(vegPicks, ["Alt veg eggs", "Alt vegan bowl"]);
    vegPicks.forEach((name) => {
      const diet = window.__plentry.mealDiet(window.__plentry.modifyPicks().find((m) => m.name === name));
      assert.ok(diet === "vegetarian" || diet === "vegan", name);
    });

    arm(window, tables, meals, { diet: "pescatarian" });
    await window.openModify(0);
    const fishPicks = pickNames(window);
    assert.equal(fishPicks.includes("Alt meat supper"), false);
    assert.equal(fishPicks.includes("Alt draft vegan"), false);
    assert.ok(fishPicks.includes("Alt fish supper"));
    fishPicks.forEach((name) => assert.notEqual(window.__plentry.mealDiet(window.mealByName(name)), "meat"));
  });

  it("I-W02 preferred dinner tags rank above the same diet", async () => {
    const { window, tables } = await boot();
    const quick = [1, 2, 3].map((i) => meat(`Quick meat ${i}`, ["dinner", "meat", "quick"]));
    const plain = [1, 2, 3, 4, 5, 6].map((i) => meat(`Plain meat ${i}`, ["dinner", "meat"]));
    arm(window, tables, quick.concat(plain), { tags: ["quick"] });
    await window.openModify(0);
    const picks = window.__plentry.modifyPicks();
    assert.equal(picks.length, 6);
    const scores = picks.map((m) => window.__plentry.scoreMeal(m));
    for (let i = 1; i < scores.length; i++) assert.ok(scores[i - 1] >= scores[i]);
    const quickNames = quick.map((m) => m.name).sort();
    assert.deepEqual(picks.slice(0, 3).map((m) => m.name).sort(), quickNames);
    picks.slice(3).forEach((m) => assert.equal(m.tags.includes("quick"), false, m.name));
    assert.ok(scores[0] > scores[3]);
  });

  it("I-W02 shows a short list when fewer than 4 alternatives remain", async () => {
    const { window, document, tables } = await boot();
    const meals = [meat("Left one"), meat("Left two")];
    arm(window, tables, meals);
    await window.openModify(0);
    assert.deepEqual(pickNames(window).sort(), ["Left one", "Left two"]);
    assert.equal(document.querySelectorAll("#modify-alts .day-card").length, 2);
    assert.equal(document.getElementById("modify-refresh").disabled, true);
    assert.ok(document.getElementById("modify-end").textContent.includes("That's every other dinner"));
    assert.equal(document.getElementById("modify-empty"), null);
    assert.equal(document.getElementById("modify-restart"), null);
    window.refreshModify();
    assert.equal(document.querySelectorAll("#modify-alts .day-card").length, 2);
    assert.equal(document.getElementById("modify-empty"), null);
  });

  it("I-W02 vegan week that already holds every vegan dinner shows a message, not an empty grid", async () => {
    const { window, document, tables } = await boot();
    const vegans = [0, 1, 2, 3, 4, 5].map((i) => reviewed(
      i === 0 ? "Chickpea & spinach curry" : `Vegan supper ${i}`,
      ["dinner", "vegan", "vegetarian"],
      VEGAN_ING,
    ));
    const S = arm(window, tables, vegans, {
      diet: "vegan",
      meals: 6,
      selected: vegans.map((m) => m.name),
      menuOptions: vegans,
    });
    assert.equal(S.selected.length, 6);
    await window.openModify(0);
    assert.equal(window.__plentry.modifyPicks().length, 0);
    assert.equal(document.getElementById("modify-alts"), null);
    assert.equal(document.querySelectorAll("#modal .day-card").length, 0);
    const empty = document.getElementById("modify-empty");
    assert.ok(empty);
    assert.match(empty.textContent, /already in this week/);
    assert.equal(document.getElementById("modify-refresh").disabled, true);
    assert.equal(document.getElementById("modify-restart"), null);
    assert.equal(document.getElementById("modal").textContent.toLowerCase().includes("error"), false);
    window.refreshModify();
    assert.equal(document.getElementById("modify-alts"), null);
    assert.equal(document.querySelectorAll("#modal .day-card").length, 0);
    assert.ok(document.getElementById("modify-empty"));
    assert.equal(document.getElementById("modify-refresh").disabled, true);
  });

  it("picking an alternative swaps that slot and rebuilds the basket and week price", async () => {
    const { window, document } = await boot();
    const S = window.__plentry.state();
    window.renderMenu();
    const n = S.selected.length;
    const beforeName = S.selected[0];
    const beforeSum = document.getElementById("week-price-sum").textContent;
    assert.match(beforeSum, /Basket £/);
    S.basketEdit = [{ i: "rice", q: 9 }];
    S.basketFor = JSON.stringify(S.selected);
    window.syncBasketFromMeals();
    assert.deepEqual(window.__plentry.getBasket().map((b) => ({ i: b.i, q: b.q })), [{ i: "rice", q: 9 }]);
    await window.openModify(0);
    const replacement = reviewed("Plain rice bowl", ["dinner", "vegan", "vegetarian"], ["rice", "onions", "garlic"]);
    S.menuOptions.push(replacement);
    window.__plentry.setModifyPicks([replacement]);
    document.querySelector("#modify-alts .day-card").click();
    assert.equal(S.selected[0], "Plain rice bowl");
    assert.notEqual(S.selected[0], beforeName);
    assert.equal(S.selected.length, n);
    assert.equal(S.basketEdit, null);
    const basket = window.__plentry.getBasket();
    assert.equal(basket.some((b) => b.i === "rice" && b.q === 9), false);
    assert.equal(basket.some((b) => b.i === "salmon fillet"), false);
    assert.ok(basket.length > 1);
    assert.equal(document.getElementById("modal-bg").classList.contains("open"), false);
    const week = document.getElementById("menu-week");
    assert.ok(week.textContent.includes("Plain rice bowl"));
    assert.ok(week.textContent.includes("Modify"));
    const afterSum = document.getElementById("week-price-sum").textContent;
    assert.match(afterSum, /Basket £/);
    assert.notEqual(afterSum, beforeSum);
    const card = week.querySelector(".day-card");
    assert.ok(card.textContent.includes("Plain rice bowl"));
    assert.match(card.querySelector(".mp").textContent, /£|incomplete|Price soon/);
  });
});

describe("one meal price", () => {
  const pomodoro = {
    id: 28,
    name: "Veggie spaghetti pomodoro",
    emoji: "🍅",
    time: 20,
    ing: ["black pepper", "chilli flakes", "chopped tomatoes", "fresh basil", "garlic", "olive oil", "red onions", "salt", "spaghetti", "tomato puree"],
    portions: {
      salt: [0.5, "tsp"], garlic: [2, "clove"], "olive oil": [3, "tbsp"], spaghetti: [180, "g"],
      "red onions": [1, "pc"], "fresh basil": [15, "g"], "black pepper": [0.25, "tsp"],
      "tomato puree": [15, "g"], "chilli flakes": [0.5, "tsp"], "chopped tomatoes": [400, "g"],
    },
    reviewed_at: "2026-10-01T00:00:00Z",
    tags: ["vegetarian", "dinner", "quick"],
  };
  const rice = {
    id: 29,
    name: "Plain rice bowl",
    emoji: "🍚",
    time: 20,
    ing: ["rice", "salt"],
    portions: { rice: [150, "g"], salt: [0.5, "tsp"] },
    reviewed_at: "2026-10-01T00:00:00Z",
    tags: ["vegan", "vegetarian", "dinner"],
  };
  const shelf = [
    ["garlic", 0.87, 40, "clove"],
    ["olive oil", 5.75, 33, "tbsp"],
    ["spaghetti", 0.75, 500, "g"],
    ["red onions", 1, 3, "pc"],
    ["fresh basil", 0.5, 30, "g"],
    ["tomato puree", 0.59, 200, "g"],
    ["chopped tomatoes", 0.47, 400, "g"],
    ["salt", 1.9, 1500, "g"],
    ["black pepper", 1.2, 25, "g"],
    ["chilli flakes", 1, 32, "g"],
    ["rice", 1.79, 1000, "g"],
  ].map(([meal_key, price_gbp, pack_qty, pack_unit], i) => ({
    id: i + 1, meal_key, store: "tesco", price_gbp, pack_qty, pack_unit, product_name: meal_key, display_name: meal_key,
  }));

  async function bootPrice(servings, prices) {
    const { window, document } = await loadApp({
      localState: weekState(),
      tables: { meals: [pomodoro, rice], orders: [], profiles: [], ingredient_prices: prices || shelf },
    });
    const S = window.__plentry.state();
    S.prefs.diet = "omnivore";
    S.prefs.servings = servings;
    S.weekServings = servings;
    S.menuOptions = [rice, pomodoro];
    S.selected = [rice.name];
    S.pantry = {};
    await window.loadShelfPrices();
    window.pickStore("tesco");
    window.renderMenu();
    return { window, document, S };
  }

  it("prices Veggie spaghetti pomodoro from Tesco portions at 2, 4 and 6", async () => {
    const { window } = await bootPrice(2);
    const store = { id: "tesco" };
    const q2 = window.__plentry.mealIngredientQuote(pomodoro, 2, store);
    const q4 = window.__plentry.mealIngredientQuote(pomodoro, 4, store);
    const q6 = window.__plentry.mealIngredientQuote(pomodoro, 6, store);
    assert.equal(q2.incomplete, false);
    assert.equal(q2.pence, 193);
    assert.equal(q4.pence, 387);
    assert.equal(q6.pence, 578);
    assert.equal(window.mealPriceLabel(q2), "~£1.93");
    assert.ok(q2.pence > 100 && q2.pence < 800);
    assert.notEqual(q2.pence, 355);
    assert.notEqual(q2.pence, 1403);
  });

  it("I-P06 Modify share equals the day card after the swap at 2, 4 and 6", async () => {
    const oil = {
      name: "Oil supper",
      ing: ["olive oil", "salt"],
      portions: { "olive oil": [2, "tbsp"], salt: [0.5, "tsp"] },
      reviewed_at: "2026-10-01T00:00:00Z",
    };
    for (const servings of [2, 4, 6]) {
      const { window, document, S } = await bootPrice(servings);
      const store = { id: "tesco" };
      S.menuOptions = [rice, oil, pomodoro];
      S.selected = [oil.name, rice.name];
      window.renderMenu();
      const beforeBasket = document.getElementById("week-price-sum").textContent;
      const beforeRice = [...document.querySelectorAll("#menu-week .day-card")]
        .find((el) => el.textContent.includes("Plain rice bowl"))
        .querySelector(".mp").textContent;
      await window.openModify(0);
      const alts = [0, 1, 2, 3, 4, 5].map((n) => ({
        name: `Rice plate ${n}`,
        ing: ["rice", "salt"],
        portions: { rice: [80 + n * 20, "g"], salt: [0.5, "tsp"] },
        reviewed_at: "2026-10-01T00:00:00Z",
      }));
      window.__plentry.setModifyPicks(alts);
      const started = performance.now();
      window.renderModifySheet();
      const elapsed = performance.now() - started;
      assert.ok(elapsed < 250, `six Modify prices took ${elapsed.toFixed(0)}ms`);
      assert.equal(document.querySelectorAll("#modify-alts .day-card").length, 6);
      window.__plentry.setModifyPicks([pomodoro]);
      window.renderModifySheet();
      const btn = [...document.querySelectorAll("#modify-alts .day-card")]
        .find((el) => el.textContent.includes("Veggie spaghetti pomodoro"));
      assert.ok(btn, `servings ${servings}`);
      const listed = btn.querySelector(".mp").textContent;
      assert.match(listed, /^£\d+\.\d{2}$/, `servings ${servings}`);
      const simulatedWeek = [pomodoro.name, rice.name].map((name) => window.mealByName(name));
      assert.equal(listed, window.__plentry.dinnerShownLabel(simulatedWeek, 0, servings, [], window.preferredStoreObj()), `servings ${servings}`);
      btn.click();
      const cards = [...document.querySelectorAll("#menu-week .day-card")];
      const card = cards.find((el) => el.textContent.includes("Veggie spaghetti pomodoro"));
      const riceCard = cards.find((el) => el.textContent.includes("Plain rice bowl"));
      assert.equal(card.querySelector(".mp").textContent, listed, `servings ${servings}`);
      assert.notEqual(riceCard.querySelector(".mp").textContent, beforeRice, `servings ${servings}`);
      assert.notEqual(document.getElementById("week-price-sum").textContent, beforeBasket, `servings ${servings}`);
      assert.match(document.getElementById("week-price-sum").textContent, /Basket £/);
      assert.equal(document.getElementById("week-ingredients"), null);
      assert.equal(document.getElementById("week-price-note"), null);
      const shown = cards.map((el) => el.querySelector(".mp").textContent);
      const pence = shown.map((text) => Math.round(Number(text.slice(1)) * 100));
      const groceries = window.__plentry.basketGroceryPence(
        window.__plentry.weekPacks([pomodoro, rice], servings, [], store),
        store,
      );
      assert.equal(pence.reduce((a, b) => a + b, 0), groceries, `servings ${servings}`);
    }
  });

  it("flags a meal with a missing ingredient price instead of a partial sum", async () => {
    const prices = shelf.filter((r) => r.meal_key !== "chopped tomatoes");
    const { window, document } = await bootPrice(2, prices);
    const quote = window.__plentry.mealIngredientQuote(pomodoro, 2, { id: "tesco" });
    assert.equal(quote.incomplete, true);
    assert.equal(quote.pence, null);
    assert.ok(quote.missing.includes("chopped tomatoes"));
    assert.equal(window.isAdmin(), false);
    assert.equal(window.mealPriceLabel(quote), "Price soon");
    await window.openModify(0);
    window.__plentry.setModifyPicks([pomodoro]);
    window.renderModifySheet();
    const btn = [...document.querySelectorAll("#modify-alts .day-card")]
      .find((el) => el.textContent.includes("Veggie spaghetti pomodoro"));
    assert.equal(btn.querySelector(".mp").textContent, "Price soon");
    assert.equal(btn.querySelector(".mp").textContent.includes("£"), false);
    btn.click();
    const card = [...document.querySelectorAll("#menu-week .day-card")]
      .find((el) => el.textContent.includes("Veggie spaghetti pomodoro"));
    assert.equal(card.querySelector(".mp").textContent, "Price soon");
    assert.equal(card.querySelector(".mp").textContent.includes("£"), false);
    window.__plentry.state().user = { id: "admin", email: "noyouchka.bouchard@gmail.com" };
    await window.checkAdminStatus();
    assert.equal(window.isAdmin(), true);
    window.renderMenu();
    const adminCard = [...document.querySelectorAll("#menu-week .day-card")]
      .find((el) => el.textContent.includes("Veggie spaghetti pomodoro"));
    assert.equal(adminCard.querySelector(".mp").textContent, "incomplete");
    assert.equal(window.mealPriceLabel(quote), "incomplete");
  });

  it("flags a published meal with no portions", async () => {
    const { window } = await bootPrice(2);
    const bare = {
      name: "Beef & Tomato Tortilla Casserole",
      ing: ["bell peppers", "chopped tomatoes", "minced beef", "olive oil", "onions", "parmesan", "tortillas", "salt"],
      reviewed_at: "2026-10-01T00:00:00Z",
    };
    const quote = window.__plentry.mealIngredientQuote(bare, 2, { id: "tesco" });
    assert.equal(quote.incomplete, true);
    assert.equal(quote.pence, null);
    assert.equal(window.mealPriceLabel(quote), "Price soon");
    window.__plentry.state().user = { id: "admin", email: "noyouchka.bouchard@gmail.com" };
    await window.checkAdminStatus();
    assert.equal(window.mealPriceLabel(quote), "incomplete");
  });

  it("uses catalogue prices when the shelf has not loaded or no shop is picked", async () => {
    const state = weekState();
    state.prefs.preferredStore = "";
    const { window, document } = await loadApp({
      localState: state,
      tables: { meals: [pomodoro], orders: [], profiles: [], ingredient_prices: [] },
    });
    const S = window.__plentry.state();
    S.menuOptions = [pomodoro];
    S.selected = [pomodoro.name];
    S.weekServings = 2;
    S.pantry = {};
    window.renderMenu();
    const none = window.__plentry.mealIngredientQuote(pomodoro, 2, null);
    assert.equal(none.incomplete, false);
    assert.equal(none.pence, 182);
    const share = window.__plentry.splitMealPence([pomodoro], 2, [], null);
    assert.equal(document.querySelector("#menu-week .day-side .mp").textContent, "£" + (share[0] / 100).toFixed(2));
    assert.ok(share[0] > none.pence);
    assert.equal(document.querySelector("#menu-week .day-side .mp").textContent.includes("Price soon"), false);
    const tesco = window.__plentry.mealIngredientQuote(pomodoro, 2, { id: "tesco", mult: 1 });
    assert.equal(tesco.pence, 182);
    const sains = window.__plentry.mealIngredientQuote(pomodoro, 2, { id: "sains", mult: 1.07 });
    assert.equal(sains.pence, 195);
  });

  it("prices from the first shop row that has a price, skipping an earlier blank", async () => {
    const prices = shelf.map((r) => ({ ...r }));
    prices.unshift({
      id: 0,
      meal_key: "spaghetti",
      store: "tesco",
      price_gbp: null,
      pack_qty: 100,
      pack_unit: "g",
      product_name: "blank",
      display_name: "spaghetti",
    });
    const { window } = await bootPrice(2, prices);
    assert.equal(window.shelfRow("spaghetti", { id: "tesco" }).price_gbp, null);
    const quote = window.__plentry.mealIngredientQuote(pomodoro, 2, { id: "tesco" });
    assert.equal(quote.incomplete, false);
    assert.equal(quote.pence, 193);
  });

  it("matches supabase/meal_ingredient_prices.sql at 2, 4 and 6, including live pomodoro", async () => {
    const ragu = {
      id: 23,
      name: "Beef ragù spaghetti",
      ing: ["black pepper", "garlic", "minced beef", "mixed herbs", "olive oil", "onions", "parmesan", "passata", "salt", "soy sauce", "spaghetti", "stock cubes"],
      portions: {
        salt: [0.5, "tsp"], garlic: [2, "clove"], onions: [1, "pc"], passata: [400, "g"],
        parmesan: [30, "g"], "olive oil": [1, "tbsp"], "soy sauce": [1, "tsp"], spaghetti: [180, "g"],
        "minced beef": [400, "g"], "mixed herbs": [1, "tsp"], "stock cubes": [1, "pc"], "black pepper": [0.25, "tsp"],
      },
    };
    const meals = [pomodoro, ragu, rice];
    const prices = [
      { id: 0, meal_key: "spaghetti", store: "tesco", price_gbp: null, pack_qty: 100, pack_unit: "g" },
      { id: 1, meal_key: "garlic", store: "tesco", price_gbp: 0.87, pack_qty: 40, pack_unit: "clove" },
      { id: 2, meal_key: "olive oil", store: "tesco", price_gbp: 5.75, pack_qty: 33, pack_unit: "tbsp" },
      { id: 3, meal_key: "spaghetti", store: "tesco", price_gbp: 0.75, pack_qty: 500, pack_unit: "g" },
      { id: 4, meal_key: "red onions", store: "tesco", price_gbp: 1, pack_qty: 3, pack_unit: "pc" },
      { id: 5, meal_key: "fresh basil", store: "tesco", price_gbp: 0.5, pack_qty: 30, pack_unit: "g" },
      { id: 6, meal_key: "tomato puree", store: "tesco", price_gbp: 0.59, pack_qty: 200, pack_unit: "g" },
      { id: 7, meal_key: "chopped tomatoes", store: "tesco", price_gbp: 0.47, pack_qty: 400, pack_unit: "g" },
      { id: 8, meal_key: "onions", store: "tesco", price_gbp: 0.95, pack_qty: 7, pack_unit: "pc" },
      { id: 9, meal_key: "parmesan", store: "tesco", price_gbp: 4, pack_qty: 200, pack_unit: "g" },
      { id: 10, meal_key: "passata", store: "tesco", price_gbp: 0.6, pack_qty: 500, pack_unit: "g" },
      { id: 11, meal_key: "minced beef", store: "tesco", price_gbp: 6.75, pack_qty: 500, pack_unit: "g" },
      { id: 12, meal_key: "rice", store: "tesco", price_gbp: 1.79, pack_qty: 1000, pack_unit: "g" },
      { id: 13, meal_key: "salt", store: "tesco", price_gbp: 1.9, pack_qty: 1500, pack_unit: "g" },
      { id: 14, meal_key: "black pepper", store: "tesco", price_gbp: 1.2, pack_qty: 25, pack_unit: "g" },
      { id: 15, meal_key: "chilli flakes", store: "tesco", price_gbp: 1, pack_qty: 32, pack_unit: "g" },
      { id: 16, meal_key: "mixed herbs", store: "tesco", price_gbp: 1, pack_qty: 18, pack_unit: "g" },
      { id: 17, meal_key: "soy sauce", store: "tesco", price_gbp: 0.55, pack_qty: 150, pack_unit: "ml" },
      { id: 18, meal_key: "stock cubes", store: "tesco", price_gbp: 1, pack_qty: 10, pack_unit: "pc" },
    ];
    const { window } = await bootPrice(2, prices.map((r) => ({
      ...r, product_name: r.meal_key, display_name: r.meal_key,
    })));
    const { readFileSync } = await import("node:fs");
    const { PGlite } = await import("@electric-sql/pglite");
    const db = new PGlite();
    await db.exec(`
      create role anon;
      create role authenticated;
      create table public.meals (
        id bigint primary key,
        ing jsonb,
        portions jsonb
      );
      create table public.ingredient_prices (
        id bigint primary key,
        meal_key text,
        store text,
        price_gbp numeric,
        pack_qty numeric,
        pack_unit text
      );
    `);
    await db.exec(readFileSync(new URL("../supabase/meal_ingredient_prices.sql", import.meta.url), "utf8"));
    for (const row of prices) {
      await db.query(
        "insert into public.ingredient_prices (id, meal_key, store, price_gbp, pack_qty, pack_unit) values ($1,$2,$3,$4,$5,$6)",
        [row.id, row.meal_key, row.store, row.price_gbp, row.pack_qty, row.pack_unit],
      );
    }
    for (const meal of meals) {
      await db.query(
        "insert into public.meals (id, ing, portions) values ($1, $2::jsonb, $3::jsonb)",
        [meal.id, JSON.stringify(meal.ing), JSON.stringify(meal.portions)],
      );
    }
    const { rows } = await db.query(
      "select meal_id, servings, price_gbp, incomplete from public.meal_ingredient_prices where store = 'tesco' order by meal_id, servings",
    );
    assert.equal(rows.length, meals.length * 3);
    const store = { id: "tesco" };
    for (const meal of meals) {
      for (const servings of [2, 4, 6]) {
        const sql = rows.find((r) => Number(r.meal_id) === meal.id && Number(r.servings) === servings);
        const quote = window.__plentry.mealIngredientQuote(meal, servings, store);
        const sqlPence = sql.price_gbp == null ? null : Math.round(Number(sql.price_gbp) * 100);
        assert.equal(quote.incomplete, sql.incomplete === true || sql.incomplete === "t", `${meal.name} ${servings}`);
        assert.equal(quote.pence, sqlPence, `${meal.name} ${servings}`);
      }
    }
    const pom = rows.find((r) => Number(r.meal_id) === 28 && Number(r.servings) === 2);
    assert.equal(Math.round(Number(pom.price_gbp) * 100), 193);
    await db.close();
  });
});

describe("onboarding order", () => {
  function shown(document) {
    return ["ob-1", "ob-2", "ob-3", "ob-4", "ob-5", "ob-6"].filter((id) => {
      const el = document.getElementById(id);
      return el && el.style.display !== "none";
    });
  }

  it("steps are shop, what you eat, dinner tags, household, dinners, cupboard", async () => {
    const { window, document } = await loadApp();
    assert.deepEqual(shown(document), ["ob-1"]);
    assert.ok(document.getElementById("ob-1").textContent.includes("Choose your shop"));
    assert.equal(document.getElementById("ob-7"), null);
    assert.equal(document.getElementById("ob-goals"), null);
    assert.equal(document.getElementById("ob-budget"), null);
    const onboard = document.getElementById("scr-onboard").textContent;
    assert.ok(!onboard.includes("What's your budget"));
    assert.ok(!onboard.includes("What do you need help with"));
    assert.equal(document.querySelectorAll("#scr-onboard .steps i").length, 6);

    window.obNext(2);
    assert.deepEqual(shown(document), ["ob-1"]);
    assert.ok(document.getElementById("ob-store-err").textContent.includes("supermarket"));
    window.pickPreferredStore("tesco");
    window.obNext(2);
    assert.deepEqual(shown(document), ["ob-2"]);
    const diet = document.getElementById("ob-diet").textContent;
    assert.ok(diet.includes("Everything"));
    assert.ok(diet.includes("Vegetarian"));
    assert.ok(diet.includes("Vegan"));
    assert.ok(diet.includes("Pescatarian"));
    const buttons = [...document.querySelectorAll("#ob-diet .choice.sel")];
    assert.equal(buttons.length, 1);
    assert.equal(window.__plentry.state().prefs.diet, "omnivore");
    window.pickDiet("vegan");
    window.pickDiet("vegetarian");
    assert.equal(window.__plentry.state().prefs.diet, "vegetarian");
    assert.equal(document.querySelectorAll("#ob-diet .choice.sel").length, 1);

    window.obNext(3);
    assert.deepEqual(shown(document), ["ob-3"]);
    const tags = document.getElementById("ob-tags").textContent;
    assert.ok(tags.includes("Quick"));
    assert.ok(tags.includes("Comfort"));
    assert.ok(!tags.includes("Meal prep"));

    window.obNext(4);
    assert.deepEqual(shown(document), ["ob-4"]);
    assert.ok(document.getElementById("ob-servings-note").textContent.includes("Cooking for"));
    document.getElementById("ob-postcode").value = "e28aa";
    window.obNext(5);
    assert.deepEqual(shown(document), ["ob-5"]);
    assert.equal(window.__plentry.state().prefs.postcode, "E2 8AA");
    assert.equal(window.__plentry.state().prefs.servings, 2);
    assert.equal(window.__plentry.state().prefs.budget, null);
    assert.equal(document.querySelectorAll("#ob-meals-picks .meal-seg").length, 7);

    window.pickMealCount(4);
    window.obNext(6);
    assert.deepEqual(shown(document), ["ob-6"]);
    assert.equal(window.__plentry.state().prefs.meals, 4);
    assert.ok(document.getElementById("ob-have-list").textContent.includes("olive oil"));
    assert.ok(!document.getElementById("ob-have-list").textContent.includes("rice"));
  });

  it("dinner tag chips never offer meal_prep, and a saved meal_prep tag still weights", async () => {
    const { window, document } = await loadApp({ localState: weekState() });
    const S = window.__plentry.state();
    S.prefs.tags = [];
    S.prefs.goals = ["decide"];
    window.showObStep(3);
    assert.ok(!document.getElementById("ob-tags").textContent.includes("Meal prep"));
    S.prefs.tags = ["meal_prep", "quick"];
    window.showObStep(3);
    assert.ok(document.getElementById("ob-tags").textContent.includes("Meal prep"));
    assert.ok(document.getElementById("ob-tags").textContent.includes("Quick"));
    assert.deepEqual(Array.from(S.prefs.tags), ["meal_prep", "quick"]);
    assert.equal(window.__plentry.wantedTags().join(","), "meal_prep,quick");
    window.nav("profile");
    assert.ok(document.getElementById("pr-tags").textContent.includes("Meal prep"));
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

describe("servings (I-P01 / I-P02 / I-P05)", () => {
  it("I-P01 cooking for is only 2, 4 or 6, and this week keeps its snapshot", async () => {
    const { window, document } = await loadApp({ localState: weekState() });
    assert.equal(window.servingsFromHousehold("1"), 2);
    assert.equal(window.servingsFromHousehold("3"), 4);
    assert.equal(window.servingsFromHousehold("6"), 6);
    assert.equal(window.normServings(5), 6);
    assert.equal(window.weekServings(), 2);
    window.nav("profile");
    const buttons = [...document.getElementById("pr-servings").querySelectorAll("button")].map((b) => b.textContent);
    assert.deepEqual(buttons, ["2", "4", "6"]);
    window.confirm = () => false;
    window.setServings(4);
    assert.equal(window.__plentry.state().prefs.servings, 4);
    assert.equal(window.weekServings(), 2);
    window.__plentry.state().weekServings = 4;
    window.renderMenu();
    const week = document.getElementById("menu-week").textContent;
    assert.ok(week.includes("serves 4"));
    assert.ok(!week.includes("serves 3") && !week.includes("serves 5"));
  });

  it("I-P02 / I-P05 a portioned dinner buys whole packs, and the order keeps that servings number", async () => {
    const { window, document } = await loadApp({ localState: weekState() });
    const S = window.__plentry.state();
    S.weekServings = 4;
    S.prefs.servings = 2;
    S.menuOptions = [{
      name: "Beef ragù spaghetti",
      emoji: "🍝",
      time: 35,
      ing: ["minced beef", "passata", "spaghetti", "parmesan", "onions", "garlic", "olive oil", "salt", "stock cubes"],
      portions: {
        "minced beef": [400, "g"],
        passata: [400, "g"],
        spaghetti: [180, "g"],
        parmesan: [30, "g"],
        onions: [1, "pc"],
        garlic: [2, "clove"],
        "olive oil": [1, "tbsp"],
      },
      recipe: { steps: ["Brown the mince."], tip: "Don't rush it." },
    }];
    S.selected = ["Beef ragù spaghetti"];
    S.basketEdit = null;
    window.syncBasketFromMeals();
    const beef = window.__plentry.getBasket().find((b) => b.i === "minced beef");
    assert.equal(beef.q, 2);
    assert.equal(window.__plentry.getBasket().find((b) => b.i === "spaghetti").q, 1);
    window.openBasket();
    assert.ok(document.getElementById("basket-panel").textContent.includes("2 × 500g"));
    await window.showRecipe("Beef ragù spaghetti");
    const modal = document.getElementById("modal").textContent;
    assert.ok(modal.includes("800g minced beef"));
    assert.ok(modal.includes("2 onions"));
    assert.ok(modal.includes("Step amounts are written for 2. Multiply by 2 (×2 for 4, ×3 for 6)."));
    const lines = [...document.querySelectorAll("#modal .ing-scaled li")].map((li) => li.textContent);
    assert.ok(lines.includes("800g minced beef"));
    assert.ok(lines.length > 1);
    const html = document.getElementById("modal").innerHTML;
    assert.ok(html.indexOf("ing-scaled") < html.indexOf("recipe-step"));
    assert.ok(modal.includes("Brown the mince."));
    assert.ok(!modal.includes("{{"));
    const order = window.orderFromRow({
      id: 9,
      store: "Tesco",
      total: 12,
      items: { servings: 4, basket: [{ i: "minced beef", q: 2 }], meals: ["Beef ragù spaghetti"] },
      status: "new",
      created_at: "2026-10-06T12:00:00.000Z",
      payment_status: "authorized",
    });
    S.prefs.servings = 6;
    S.weekServings = 2;
    assert.equal(order.servings, 4);
    assert.equal(window.weekServings(), 2);
  });

  it("I-P01 a household of 4+ with no explicit cooking-for choice resolves to 4", async () => {
    const { window } = await loadApp();
    assert.equal(window.resolveServings({ size: "4+" }), 4);
    assert.equal(window.resolveServings({ size: "1" }), 2);
    assert.equal(window.resolveServings({ size: "4+", servings: 2 }), 4);
    assert.equal(window.resolveServings({ size: "4+", servings: 2, servingsChosen: true }), 2);
    assert.equal(window.resolveServings({ size: "4+", servings: 6 }), 6);
    assert.equal(window.servingsFromHousehold("4+"), 4);

    const local = weekState();
    local.prefs.size = "4+";
    delete local.prefs.servings;
    local.weekServings = 2;
    const booted = await loadApp({ localState: local });
    assert.equal(booted.window.__plentry.state().prefs.servings, 4);
    assert.equal(booted.window.weekServings(), 2);

    const poisoned = weekState();
    poisoned.prefs.size = "4+";
    poisoned.prefs.servings = 2;
    poisoned.weekServings = 2;
    const kept = await loadApp({ localState: poisoned });
    assert.equal(kept.window.__plentry.state().prefs.servings, 4, "stored default 2 is not a choice");
    assert.equal(kept.window.weekServings(), 2);

    const chosen = weekState();
    chosen.prefs.size = "4+";
    chosen.prefs.servings = 2;
    chosen.prefs.servingsChosen = true;
    chosen.weekServings = 2;
    const explicit = await loadApp({ localState: chosen });
    assert.equal(explicit.window.__plentry.state().prefs.servings, 2);
    assert.equal(explicit.window.__plentry.state().prefs.servingsChosen, true);

    const cloud = weekState();
    cloud.prefs.size = "4+";
    delete cloud.prefs.servings;
    cloud.weekServings = 2;
    const hydrated = await loadApp({
      session: { id: "u-4plus", email: "four@example.com" },
      tables: { meals: [], orders: [], ingredient_prices: [], profiles: [{ id: "u-4plus", state: cloud }] },
    });
    assert.equal(hydrated.window.__plentry.state().prefs.servings, 4);
    assert.equal(hydrated.window.weekServings(), 2);

    const { window: profileWin, document } = await loadApp({ localState: weekState() });
    const S = profileWin.__plentry.state();
    S.prefs.size = "4+";
    S.prefs.servings = 2;
    delete S.prefs.servingsChosen;
    S.weekServings = 2;
    profileWin.confirm = () => { throw new Error("Save should not prompt"); };
    profileWin.renderProfile();
    profileWin.saveProfile();
    assert.equal(S.prefs.servings, 4);
    assert.equal(profileWin.weekServings(), 2);
    assert.match(document.getElementById("pr-saved").textContent, /Saved/);
  });

  it("I-P05 applying cooking-for to this week re-locks and rescales; declining leaves the week and past orders", async () => {
    const { window, document } = await loadApp({ localState: weekState() });
    const S = window.__plentry.state();
    S.menuOptions = [{
      name: "Beef ragù spaghetti",
      emoji: "🍝",
      time: 35,
      ing: ["minced beef", "passata", "spaghetti", "parmesan", "onions", "garlic", "olive oil", "salt", "stock cubes"],
      portions: {
        "minced beef": [400, "g"],
        passata: [400, "g"],
        spaghetti: [180, "g"],
        parmesan: [30, "g"],
        onions: [1, "pc"],
        garlic: [2, "clove"],
        "olive oil": [1, "tbsp"],
      },
      recipe: { steps: ["Brown the mince."], tip: "Don't rush it." },
    }];
    S.selected = ["Beef ragù spaghetti"];
    S.prefs.servings = 2;
    S.weekServings = 2;
    S.basketEdit = null;
    S.orders = [{ id: 3, servings: 2, meals: ["Beef ragù spaghetti"], items: [{ i: "minced beef", q: 1 }], store: "Tesco", total: 10, status: 1, date: "06/10/2026" }];
    window.syncBasketFromMeals();
    assert.equal(window.__plentry.getBasket().find((b) => b.i === "minced beef").q, 1);

    let asked = "";
    window.confirm = (q) => { asked = String(q); return false; };
    window.nav("profile");
    window.setServings(4);
    assert.match(asked, /Apply cooking for 4 to this week too/);
    assert.match(asked, /Your basket will be rescaled and any changes you made to it will be reset/);
    assert.match(asked, /Cancel keeps this week at 2/);
    assert.equal(S.prefs.servings, 4);
    assert.equal(S.prefs.servingsChosen, true);
    assert.equal(window.weekServings(), 2);
    assert.equal(window.__plentry.getBasket().find((b) => b.i === "minced beef").q, 1);
    assert.equal(S.orders[0].servings, 2);
    assert.match(document.getElementById("pr-servings-note").textContent, /This week stays serves 2/);

    window.confirm = () => true;
    window.setServings(4);
    assert.equal(window.weekServings(), 4);
    assert.equal(window.__plentry.getBasket().find((b) => b.i === "minced beef").q, 2);
    assert.equal(S.orders[0].servings, 2);
    window.renderMenu();
    assert.match(document.getElementById("menu-week").textContent, /serves 4/);

    document.getElementById("pr-size").value = "6";
    window.confirm = () => false;
    window.onProfileSize();
    assert.equal(S.prefs.size, "6");
    assert.equal(S.prefs.servings, 6);
    assert.equal(S.prefs.servingsChosen, false);
    assert.equal(window.weekServings(), 4);
    assert.equal(S.orders[0].servings, 2);
  });

  it("recipe view lists scaled amounts above the steps, and leaves names when a meal has no portions", async () => {
    const { window, document } = await loadApp({ localState: weekState() });
    const S = window.__plentry.state();
    S.weekServings = 4;
    S.menuOptions = [{
      name: "Named stew",
      emoji: "🍲",
      time: 20,
      ing: ["chickpeas", "onions", "salt"],
      recipe: { steps: ["Simmer the chickpeas."], tip: "" },
    }];
    S.selected = ["Named stew"];
    await window.showRecipe("Named stew");
    const plain = document.getElementById("modal");
    assert.equal(plain.querySelector(".ing-scaled"), null);
    assert.match(plain.textContent, /chickpeas, onions, salt/);
    assert.match(plain.textContent, /Step amounts are written for 2\. Multiply by 2/);
    assert.match(plain.textContent, /Simmer the chickpeas/);

    let sent = null;
    window.fetch = async (_url, opts) => {
      sent = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ steps: ["Cook it for six."], tip: "Hot pan." }) };
    };
    S.weekServings = 6;
    S.recipes = {};
    S.menuOptions = [{ name: "Unwritten stew", emoji: "🍲", time: 20, ing: ["rice", "onions"] }];
    S.selected = ["Unwritten stew"];
    await window.showRecipe("Unwritten stew");
    assert.equal(sent.task, "recipe");
    assert.equal(sent.payload.servings, 6);
    const aiModal = document.getElementById("modal");
    assert.match(aiModal.textContent, /Steps are written for 6/);
    assert.doesNotMatch(aiModal.textContent, /Multiply by/);
    assert.match(aiModal.textContent, /rice, onions/);
    assert.match(aiModal.textContent, /Cook it for six/);

    S.recipes["Unwritten stew"] = { steps: ["Cook for two."], tip: "", servings: 2 };
    S.weekServings = 4;
    await window.showRecipe("Unwritten stew", null, 4);
    assert.match(document.getElementById("modal").textContent, /Written for 2, multiply by 2/);
  });

  it("I-P05 asks once at load when a resolved household changes servings and this week is still on the old number", async () => {
    const beef = {
      name: "Beef ragù spaghetti",
      emoji: "🍝",
      time: 35,
      ing: ["minced beef", "passata", "spaghetti", "onions", "garlic", "olive oil"],
      portions: { "minced beef": [400, "g"], spaghetti: [180, "g"], onions: [1, "pc"] },
      recipe: { steps: ["Brown the mince."], tip: "" },
    };
    function oldWeek(size) {
      const st = weekState();
      st.menuOptions = [beef];
      st.selected = [beef.name];
      st.prefs.size = size;
      st.prefs.servings = 2;
      delete st.prefs.servingsChosen;
      delete st.prefs.servingsWeekAsked;
      st.weekServings = 2;
      st.onboarded = true;
      return st;
    }
    const catalog = {
      meals: [{
        id: 1,
        name: beef.name,
        emoji: beef.emoji,
        time: beef.time,
        ing: beef.ing,
        recipe: beef.recipe,
        portions: beef.portions,
        reviewed_at: "2026-10-01T00:00:00.000Z",
      }],
      orders: [],
      ingredient_prices: [],
      profiles: [],
    };
    let asked = 0;
    const declined = await loadApp({
      localState: oldWeek("4+"),
      tables: catalog,
      confirm: (q) => { asked += 1; assert.match(String(q), /Your basket will be rescaled and any changes you made to it will be reset/); return false; },
    });
    assert.equal(asked, 1);
    assert.equal(declined.window.__plentry.state().prefs.servings, 4);
    assert.equal(declined.window.weekServings(), 2);
    assert.equal(declined.window.__plentry.getBasket().find((b) => b.i === "minced beef").q, 1);
    assert.equal(declined.window.__plentry.state().prefs.servingsWeekAsked, true);
    const again = JSON.parse(declined.window.localStorage.getItem("plentry_v1"));
    again.prefs.servings = 2;
    again.prefs.size = "4+";
    again.weekServings = 2;
    let askedAgain = 0;
    const second = await loadApp({
      localState: again,
      confirm: () => { askedAgain += 1; return true; },
    });
    assert.equal(askedAgain, 0);
    assert.equal(second.window.weekServings(), 2);

    let accepted = 0;
    const yes = await loadApp({
      localState: oldWeek("4+"),
      tables: catalog,
      confirm: () => { accepted += 1; return true; },
    });
    assert.equal(accepted, 1);
    assert.equal(yes.window.__plentry.state().prefs.servings, 4);
    assert.equal(yes.window.weekServings(), 4);
    assert.equal(yes.window.__plentry.getBasket().find((b) => b.i === "minced beef").q, 2);
    assert.equal(yes.window.__plentry.state().prefs.servingsWeekAsked, true);
    const afterYes = JSON.parse(yes.window.localStorage.getItem("plentry_v1"));
    afterYes.prefs.servings = 2;
    afterYes.prefs.size = "4+";
    afterYes.weekServings = 2;
    let acceptedAgain = 0;
    await loadApp({
      localState: afterYes,
      confirm: () => { acceptedAgain += 1; return true; },
    });
    assert.equal(acceptedAgain, 0);

    let chosenAsks = 0;
    const chosen = oldWeek("4+");
    chosen.prefs.servingsChosen = true;
    const keptChoice = await loadApp({
      localState: chosen,
      confirm: () => { chosenAsks += 1; return true; },
    });
    assert.equal(chosenAsks, 0);
    assert.equal(keptChoice.window.__plentry.state().prefs.servings, 2);
    assert.equal(keptChoice.window.weekServings(), 2);

    let matchAsks = 0;
    const matching = oldWeek("4+");
    matching.weekServings = 4;
    const matched = await loadApp({
      localState: matching,
      confirm: () => { matchAsks += 1; return true; },
    });
    assert.equal(matchAsks, 0);
    assert.equal(matched.window.__plentry.state().prefs.servings, 4);
    assert.equal(matched.window.weekServings(), 4);
    assert.notEqual(matched.window.__plentry.state().prefs.servingsWeekAsked, true);

    let loginAsks = 0;
    const cloud = oldWeek("6");
    const loggedIn = await loadApp({
      localState: weekState(),
      session: { id: "u-load", email: "load@example.com" },
      tables: { meals: [], orders: [], ingredient_prices: [], profiles: [{ id: "u-load", state: cloud }] },
      confirm: () => { loginAsks += 1; return false; },
    });
    assert.equal(loginAsks, 1);
    assert.equal(loggedIn.window.__plentry.state().prefs.servings, 6);
    assert.equal(loggedIn.window.weekServings(), 2);
    assert.equal(loggedIn.window.__plentry.state().prefs.servingsWeekAsked, true);
  });
});

describe("checkout servings", () => {
  it("I-P05 the local order keeps this week's servings before a reload", async () => {
    const { window, document } = await loadApp({
      localState: { ...weekState(), user: { id: "u1", email: "t@t.com", name: "T" } },
      session: { id: "u1", email: "t@t.com", name: "T" },
    });
    const S = window.__plentry.state();
    S.user = { id: "u1", email: "t@t.com", name: "T" };
    S.menuOptions = [{
      name: "Beef ragù spaghetti",
      emoji: "🍝",
      time: 35,
      ing: ["minced beef", "passata", "spaghetti", "onions", "garlic", "olive oil"],
      portions: { "minced beef": [400, "g"], spaghetti: [180, "g"], onions: [1, "pc"] },
      recipe: { steps: ["Brown the mince."], tip: "" },
    }];
    S.selected = ["Beef ragù spaghetti"];
    S.weekServings = 4;
    S.prefs.servings = 2;
    S.prefs.delivery = { name: "Noe", phone: "07123456789", line1: "1 Test Street", line2: "", city: "London", postcode: "E2 8AA" };
    S.basketEdit = null;
    window.pickStore("tesco");
    window.syncBasketFromMeals();
    window.confirmOrder();
    window.__chosenSlot = { date: window.slotDays()[0], start: "10:00" };
    await window.placeOrder();
    const row = window.__sbTables.orders[0];
    assert.equal(row.items.servings, 4);
    assert.equal(S.orders[0].servings, 4);
    assert.notEqual(S.orders[0].servings, 2);
    await window.showRecipeFromOrder(S.orders[0].backendId || S.orders[0].id, 0);
    const modal = document.getElementById("modal").textContent;
    assert.match(modal, /800g minced beef/);
    assert.match(modal, /Multiply by 2 \(×2 for 4, ×3 for 6\)/);
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
    window.showObStep(6);
    assert.ok(document.getElementById("ob-have-list").textContent.includes("onions"));
    assert.ok(!document.getElementById("ob-have-list").textContent.includes("rice"));
  });

  it("I-C04 cupboard rows use a same-origin picture, and unknown names use the fallback", async () => {
    const { window, document } = await loadApp({ localState: weekState() });
    const staples = window.__plentry.STAPLES;
    window.nav("pantry");
    const pantryImgs = [...document.querySelectorAll("#pantry-list img.cupboard-ico")];
    assert.equal(pantryImgs.length, staples.length);
    const srcs = new Set();
    for (const img of pantryImgs) {
      const src = img.getAttribute("src");
      assert.match(src, /^\/vendor\/cupboard\/[a-z0-9-]+\.svg$/);
      assert.doesNotMatch(src, /^https?:/);
      assert.equal(img.getAttribute("width"), "40");
      assert.equal(img.getAttribute("height"), "40");
      assert.equal(img.getAttribute("alt"), "");
      assert.equal(img.getAttribute("aria-hidden"), "true");
      srcs.add(src);
    }
    assert.equal(srcs.size, staples.length);
    assert.doesNotMatch(document.getElementById("pantry-list").innerHTML, /https?:\/\//);
    const q = document.getElementById("pantry-q");
    q.value = "paprika";
    window.renderPantry();
    const filtered = [...document.querySelectorAll("#pantry-list img.cupboard-ico")];
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].getAttribute("src"), "/vendor/cupboard/paprika.svg");
    window.showObStep(6);
    const ob = [...document.querySelectorAll("#ob-have-list img.cupboard-ico")];
    assert.equal(ob.length, staples.length);
    assert.doesNotMatch(document.getElementById("ob-have-list").innerHTML, /https?:\/\//);
    window.toggleHaveAt(staples.indexOf("olive oil"));
    const oil = [...document.querySelectorAll("#ob-have-list .choice")].find((b) => b.querySelector("b")?.textContent === "olive oil");
    assert.ok(oil);
    assert.equal(oil.querySelector("img.cupboard-ico").getAttribute("src"), "/vendor/cupboard/olive-oil.svg");
    assert.equal(oil.querySelector("img.cupboard-ico").getAttribute("width"), "40");
    assert.ok(oil.querySelector(".c-tick"));
    assert.equal(window.cupboardIconSrc("garam masala"), "/vendor/cupboard/garam-masala.svg");
    assert.equal(window.cupboardIconSrc("  Olive Oil "), "/vendor/cupboard/olive-oil.svg");
    assert.equal(window.cupboardIconSrc("rice"), "/vendor/cupboard/fallback.svg");
    assert.equal(window.cupboardIconSrc("not a spice yet"), "/vendor/cupboard/fallback.svg");
    assert.equal(window.__plentry.CUPBOARD_ICON_FALLBACK, "fallback.svg");
    window.syncBasketFromMeals();
    window.openBasket();
    const basketImgs = [...document.querySelectorAll("#basket-panel .bk-line.staple img.cupboard-ico")];
    assert.ok(basketImgs.length > 0);
    for (const img of basketImgs) {
      assert.match(img.getAttribute("src"), /^\/vendor\/cupboard\/[a-z0-9-]+\.svg$/);
      assert.doesNotMatch(img.getAttribute("src"), /^https?:/);
      assert.equal(img.getAttribute("width"), "28");
      assert.equal(img.getAttribute("height"), "28");
      assert.equal(img.getAttribute("alt"), "");
      assert.equal(img.getAttribute("aria-hidden"), "true");
    }
    const oilLine = [...document.querySelectorAll("#basket-panel .bk-line.staple")].find((row) => row.textContent.includes("olive oil"));
    assert.equal(oilLine, undefined);
    const saltLine = [...document.querySelectorAll("#basket-panel .bk-line.staple")].find((row) => row.textContent.includes("salt"));
    assert.ok(saltLine);
    assert.equal(saltLine.querySelector("img.cupboard-ico").getAttribute("src"), "/vendor/cupboard/salt.svg");
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
    assert.equal(document.getElementById("nav-ingredients").style.display, "none");
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
    assert.equal(document.getElementById("nav-ingredients").style.display, "");
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

  it("I-O16 a time tap does not invent a day, and a day tap keeps the typed address", async () => {
    const { window, document } = await loadApp({
      localState: { ...weekState(), user: { id: "u1", email: "t@t.com", name: "T" } },
    });
    const S = window.__plentry.state();
    S.user = { id: "u1", email: "t@t.com", name: "T" };
    S.prefs.delivery = null;
    window.__chosenSlot = null;
    window.pickStore("tesco");
    window.syncBasketFromMeals();
    window.confirmOrder();
    assert.equal(document.getElementById("confirm-btn").disabled, true);
    assert.equal(document.getElementById("confirm-btn").getAttribute("aria-describedby"), "slot-prompt");
    assert.equal(document.getElementById("slot-prompt").textContent, "Choose a delivery day and time to continue");
    assert.match(document.getElementById("slot-hint").textContent, /day/i);
    assert.ok(document.getElementById("slot-days"));
    assert.ok(document.getElementById("slot-wins"));
    const timeBtn = document.querySelector("#slot-wins button");
    assert.equal(timeBtn.disabled, true);
    assert.doesNotMatch(timeBtn.getAttribute("onclick") || "", new RegExp(window.slotDays()[0]));
    timeBtn.click();
    window.pickSlot("", "08:00");
    const invented = window.__chosenSlot || {};
    assert.notEqual(invented.date, window.slotDays()[0]);
    assert.ok(!invented.date, "a time without a day must not store a date");
    assert.equal(document.getElementById("confirm-btn").disabled, true);
    assert.match(document.getElementById("slot-hint").textContent, /does not pick a day/);
    assert.equal(document.getElementById("slot-prompt").textContent, "Choose a delivery day and time to continue");

    document.getElementById("del-line1").value = "99 Half Typed Road";
    document.getElementById("del-phone").value = "07123";
    window.pickSlot(window.slotDays()[0], "");
    assert.equal(document.getElementById("del-line1").value, "99 Half Typed Road");
    assert.equal(document.getElementById("del-phone").value, "07123");
    assert.equal(document.getElementById("confirm-btn").disabled, true, "a day alone is not a window");
    assert.equal(document.getElementById("slot-prompt").textContent, "Choose a delivery day and time to continue");
    assert.equal(document.querySelector("#slot-days button.sel").getAttribute("aria-pressed"), "true");
    assert.equal(document.querySelector("#slot-wins button").disabled, false);
    assert.equal(document.querySelector("#slot-wins button").getAttribute("aria-pressed"), "false");
    window.pickSlot(window.slotDays()[0], "10:00");
    assert.equal(document.getElementById("del-line1").value, "99 Half Typed Road");
    assert.equal(document.getElementById("del-phone").value, "07123");
    assert.equal(document.getElementById("confirm-btn").disabled, false);
    assert.equal(document.getElementById("confirm-btn").getAttribute("aria-describedby"), null);
    assert.equal(document.getElementById("slot-prompt"), null);
    assert.equal(document.querySelector("#slot-wins button.sel").getAttribute("aria-pressed"), "true");
    assert.match(document.getElementById("modal").textContent, /Be in for this window/);
    assert.equal(window.__chosenSlot.date, window.slotDays()[0]);
    assert.equal(window.__chosenSlot.start, "10:00");
  });

  it("I-O16 a day outside the window is cleared, with its time", async () => {
    const { window, document } = await loadApp({
      localState: { ...weekState(), user: { id: "u1", email: "t@t.com", name: "T" } },
    });
    const S = window.__plentry.state();
    S.user = { id: "u1", email: "t@t.com", name: "T" };
    S.prefs.delivery = null;
    window.pickStore("tesco");
    window.syncBasketFromMeals();
    const live = window.slotDays()[0];
    window.__chosenSlot = { date: live, start: "10:00" };
    window.confirmOrder();
    assert.equal(window.__chosenSlot.date, live);
    assert.equal(window.__chosenSlot.start, "10:00");
    assert.equal(document.getElementById("confirm-btn").disabled, false);

    const stale = window.addYmd(live, -1);
    assert.ok(!window.slotDays().includes(stale));
    window.__chosenSlot = { date: stale, start: "08:00" };
    window.confirmOrder();
    assert.equal(window.__chosenSlot, null);
    assert.equal(document.querySelector("#slot-days button.sel"), null);
    assert.equal(document.querySelector("#slot-days button[aria-pressed='true']"), null);
    assert.equal(document.querySelector("#slot-wins button").disabled, true);
    assert.equal(document.querySelector("#slot-wins button[aria-pressed='true']"), null);
    assert.equal(document.getElementById("confirm-btn").disabled, true);
    assert.equal(document.getElementById("slot-prompt").textContent, "Choose a delivery day and time to continue");
    window.pickSlot(stale, "10:00");
    assert.equal(window.__chosenSlot, null);
    assert.equal(document.querySelector("#slot-wins button").disabled, true);
    assert.equal(document.getElementById("confirm-btn").disabled, true);
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

  it("I-M10 a capture the server did not record is an error, not money received", async () => {
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
    window.fetch = async () => ({
      ok: false,
      status: 500,
      json: async () => ({
        error: "capture_not_recorded",
        detail: "Stripe captured £1.05 but the order row did not save. Try again — a retry repairs the row.",
      }),
    });
    document.getElementById("cap-33").value = "1.00";
    await window.adminCapture(33);
    assert.equal(alerts.length, 0, "the first tap only confirms");
    await window.adminCapture(33);
    assert.equal(alerts.length, 1);
    assert.match(alerts[0], /order row did not save/);
    assert.match(document.getElementById("cap-prev-33").textContent, /order row did not save/);
    assert.equal(document.getElementById("admin-list").textContent.includes("Money received"), false);
    assert.equal(window.__sbTables.orders[0].payment_status, "authorized");
    assert.equal(document.getElementById("cap-btn-33").disabled, false);
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

  it("I-A14 admin meals use admin_read_meals when it returns rows", async () => {
    const secret = "22222222-2222-4222-8222-222222222222";
    const { window, document } = await loadApp({
      localState: weekState(),
      session: { id: "admin", email: "noyouchka.bouchard@gmail.com" },
      tables: {
        meals: [{ id: 99, name: "Table only dinner", emoji: "🍲", time: 20, source: "seed", reviewed_at: "2026-09-01T00:00:00.000Z", ing: ["rice"], tags: ["dinner", "vegetarian"], category: "rice_bowl", recipe: { steps: ["Boil."] } }],
        profiles: [],
        ingredient_prices: [],
        orders: [],
      },
    });
    window.__plentry.state().user = { id: "admin", email: "noyouchka.bouchard@gmail.com", name: "Noe" };
    window.__mockSb.rpc = async (fn) => {
      if (fn !== "admin_read_meals") return { data: null, error: { message: "missing" } };
      return {
        data: [{
          id: 11,
          name: "Draft keema",
          emoji: "🍛",
          time: 30,
          ing: ["minced beef", "rice", "onions", "garlic", "curry paste", "salt", "black pepper"],
          recipe: { steps: ["Brown the beef."], tip: "" },
          tags: ["dinner", "meat"],
          category: "curry_stew",
          source: "advisor",
          created_by: secret,
          created_at: "2026-09-14T10:00:00.000Z",
          reviewed_at: null,
        }],
        error: null,
      };
    };
    await window.showMealsScreen();
    const neu = document.getElementById("meals-new").textContent;
    assert.ok(neu.includes("Draft keema"));
    assert.ok(neu.includes("advisor"));
    assert.ok(neu.includes("2026-09-14"));
    assert.equal(neu.includes(secret), false);
    assert.equal(document.getElementById("scr-meals").textContent.includes(secret), false);
    assert.equal(document.getElementById("scr-meals").textContent.includes("Table only dinner"), false);
  });

  it("I-A14 admin meals still read the table when admin_read_meals is missing", async () => {
    const draft = {
      id: 11,
      name: "Draft keema",
      emoji: "🍛",
      time: 30,
      ing: ["minced beef", "rice", "onions", "garlic", "curry paste", "salt", "black pepper"],
      recipe: { steps: ["Brown the beef."], tip: "" },
      tags: ["dinner", "meat"],
      category: "curry_stew",
      source: "advisor",
      created_at: "2026-09-14T10:00:00.000Z",
      reviewed_at: null,
    };
    const { window, document } = await loadApp({
      localState: weekState(),
      session: { id: "admin", email: "noyouchka.bouchard@gmail.com" },
      tables: { meals: [draft], profiles: [], ingredient_prices: [], orders: [] },
    });
    window.__plentry.state().user = { id: "admin", email: "noyouchka.bouchard@gmail.com", name: "Noe" };
    window.__mockSb.rpc = async () => ({ data: null, error: { message: "function admin_read_meals() does not exist" } });
    await window.showMealsScreen();
    const neu = document.getElementById("meals-new").textContent;
    assert.ok(neu.includes("Draft keema"));
    assert.ok(neu.includes("advisor"));
    assert.ok(neu.includes("2026-09-14"));
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

describe("I-A12 admin meals and ingredients", () => {
  const founder = { id: "admin", email: "noyouchka.bouchard@gmail.com" };

  it("a non-member is not admin once public.admins has someone else; aal1 stays blocked", async () => {
    const mfa = mockMfa({ enrolled: true });
    const { window, document } = await loadApp({
      localState: weekState(),
      session: founder,
      tables: {
        meals: [],
        orders: [],
        profiles: [],
        ingredient_prices: [],
        admins: [{ id: 1, user_id: "other", email: "ops@example.com" }],
      },
      mfa,
    });
    await window.checkAdminStatus();
    assert.equal(window.isAdmin(), false, "founder email is not enough once the admins table has rows");
    assert.equal(document.getElementById("nav-meals").style.display, "none");
    await window.showIngredientsScreen();
    assert.equal(document.getElementById("ingredients-list").textContent, "Admin only.");

    window.__plentry.state().user = { id: "other", email: "ops@example.com" };
    await window.checkAdminStatus();
    assert.equal(window.isAdmin(), false, "listed admin at aal1 is blocked");
    mfa.state.level = "aal2";
    mfa.state.factors = [];
    await window.refreshMfa();
    assert.equal(window.isAdmin(), true, "listed admin at aal2");
  });

  it("adding a meal is blocked until name, catalog ingredients, and a step are filled; portion units must match", async () => {
    const { window, document } = await loadApp({
      localState: weekState(),
      session: founder,
      tables: { meals: [], orders: [], profiles: [], ingredient_prices: [], admins: [] },
    });
    window.__plentry.state().user = founder;
    await window.checkAdminStatus();
    assert.equal(window.isAdmin(), true);
    const before = window.__sbTables.meals.length;
    window.openMealEditor(null);
    document.getElementById("me-name").value = "";
    document.getElementById("me-steps").value = "Fry onions.";
    window.__mealIng = new Set(["minced beef", "onions", "garlic", "salt", "black pepper"]);
    await window.saveMealEditor(false);
    assert.match(document.getElementById("me-err").textContent, /Name/);
    assert.equal(window.__sbTables.meals.length, before);

    document.getElementById("me-name").value = "Ops test chilli";
    document.getElementById("me-steps").value = "";
    await window.saveMealEditor(false);
    assert.match(document.getElementById("me-err").textContent, /instruction step/);
    assert.equal(window.__sbTables.meals.length, before);

    document.getElementById("me-steps").value = "Fry onions.";
    window.__mealPortions = { "minced beef": [100, "ml"] };
    await window.saveMealEditor(false);
    assert.match(document.getElementById("me-err").textContent, /Portion unit for minced beef must be g/);
    assert.equal(window.__sbTables.meals.length, before);

    window.__mealPortions = { "minced beef": [200, "g"], salt: [1, "g"] };
    await window.saveMealEditor(true);
    assert.match(document.getElementById("me-err").textContent, /category/);
    assert.equal(window.__sbTables.meals.length, before);

    document.getElementById("me-category").value = "curry_stew";
    window.__mealPortions = { "minced beef": [200, "g"], salt: [1, "g"] };
    await window.saveMealEditor(false);
    const added = window.__sbTables.meals.find((m) => m.name === "Ops test chilli");
    assert.ok(added);
    assert.equal(added.reviewed_at, null);
    // Portion arrays are created inside the page, so copy them before deep-equal.
    assert.deepEqual([...(added.portions["minced beef"] || [])], [200, "g"]);
    assert.deepEqual([...(added.portions.salt || [])], [1, "g"]);
    const card = document.getElementById("meals-new").textContent;
    assert.match(card, /serves 4/);
    assert.match(card, /serves 6/);
    assert.match(card, /Written for 2/);
  });

  it("unpublish sends a live dinner back to New meal, and there is no delete or add-admin control", async () => {
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
      session: founder,
      tables: { meals: [live], orders: [], profiles: [], ingredient_prices: [], admins: [] },
    });
    window.__plentry.state().user = founder;
    await window.checkAdminStatus();
    await window.showMealsScreen();
    assert.equal(typeof window.adminDeleteMeal, "undefined");
    assert.ok(!document.body.innerHTML.includes("Add admin"));
    assert.ok(!document.body.innerHTML.includes("adminDeleteMeal"));
    window.openMealEditor(12);
    const modal = document.getElementById("modal").innerHTML;
    assert.ok(modal.includes("Unpublish"));
    assert.ok(!modal.includes("adminDeleteMeal"));
    assert.ok(!modal.includes(">Remove<"));
    await window.saveMealEditor("unpublish");
    assert.equal(window.__sbTables.meals.length, 1);
    assert.equal(window.__sbTables.meals[0].reviewed_at, null);
    assert.ok(document.getElementById("me-err").textContent.includes("Unpublished"));
    assert.ok(document.getElementById("meals-new").textContent.includes("Live salmon traybake"));
    assert.ok(!document.getElementById("meals-live").textContent.includes("Live salmon traybake"));
  });

  it("adding an ingredient is blocked until shop, category, and price are set", async () => {
    const { window, document } = await loadApp({
      localState: weekState(),
      session: founder,
      tables: { meals: [], orders: [], profiles: [], ingredient_prices: [], admins: [] },
    });
    window.__plentry.state().user = founder;
    await window.checkAdminStatus();
    assert.equal(window.ingredientAddError({}), "Pick a shop.");
    assert.equal(window.ingredientAddError({ shop: "tesco" }), "Pick a category.");
    assert.equal(window.ingredientAddError({ shop: "tesco", category: "fruit" }), "Enter a price.");
    assert.equal(window.ingredientAddError({ shop: "tesco", category: "pantry", price: 1, name: "Salt", meal_key: "salt", pack_qty: 2, pack_unit: "g" }), "");
    assert.equal(window.ingredientAddError({ shop: "tesco", category: "grocery", price: 1, name: "Penne", meal_key: "penne" }), "Pick a category.");
    assert.equal(window.ingredientAddError({ shop: "tesco", category: "grocery", price: 1, name: "Penne", updating: true }), "");
    assert.equal(window.ingredientAddError({ shop: "tesco", category: "pantry", price: 1, name: "Harissa" }), "Give it a meal key.");
    assert.equal(window.ingredientAddError({ shop: "tesco", category: "fruit", price: 1.2, name: "Limes", meal_key: "limes", pack_qty: 5, pack_unit: "pc" }), "");

    window.nav("ingredients");
    document.getElementById("ing-add-name").value = "Harissa";
    document.getElementById("ing-add-key").value = "harissa";
    document.getElementById("ing-add-cat").value = "pantry";
    document.getElementById("ing-add-shop").value = "tesco";
    await window.saveNewIngredient();
    assert.equal(document.getElementById("ing-add-err").textContent, "Enter a price.");
    assert.equal(window.__sbTables.ingredient_prices.length, 0);

    document.getElementById("ing-add-price").value = "1.40";
    document.getElementById("ing-add-qty").value = "180";
    document.getElementById("ing-add-unit").value = "g";
    await window.saveNewIngredient();
    const row = window.__sbTables.ingredient_prices[0];
    assert.ok(row);
    assert.equal(row.store, "tesco");
    assert.equal(row.meal_key, "harissa");
    assert.equal(row.category, "pantry");
    assert.equal(row.price_gbp, 1.4);
    assert.equal(row.slug, "harissa");
    assert.equal(row.pack_qty, 180);
    assert.equal(row.pack_unit, "g");
    const list = document.getElementById("ingredients-list").textContent;
    assert.ok(list.includes("Harissa"));
    assert.ok(list.includes("not yet usable in baskets"));
  });

  it("saves shelf prices by row without rewriting the product name, and removes rows that have no meal key", async () => {
    const prices = [
      { id: 9, slug: "penne", display_name: "Penne", category: "grocery", store: "tesco", meal_key: null, product_name: "Tesco Penne 500g", pack_size: "500g", price_gbp: 0.6, pack_qty: 500, pack_unit: "g" },
      { id: 10, slug: "penne", display_name: "Penne", category: "grocery", store: "sainsburys", meal_key: null, product_name: "Sainsbury's Penne", pack_size: "500g", price_gbp: 0.7, pack_qty: 500, pack_unit: "g" },
    ];
    const { window, document } = await loadApp({
      localState: weekState(),
      session: founder,
      tables: { meals: [], orders: [], profiles: [], ingredient_prices: prices, admins: [] },
    });
    window.__plentry.state().user = founder;
    await window.checkAdminStatus();
    await window.showIngredientsScreen();
    assert.match(document.getElementById("ingredients-list").textContent, /Grocery/);
    document.getElementById("ing-price-0-tesco").value = "0.85";
    document.getElementById("ing-product-0-sainsburys").value = "Sainsbury's Penne Rigate";
    await window.saveIngredientGroup(0);
    const rows = window.__sbTables.ingredient_prices;
    assert.equal(rows.length, 2);
    const tesco = rows.find((r) => r.id === 9);
    const sains = rows.find((r) => r.id === 10);
    assert.equal(tesco.price_gbp, 0.85);
    assert.equal(tesco.product_name, "Tesco Penne 500g");
    assert.equal(tesco.category, "grocery");
    assert.equal(sains.product_name, "Sainsbury's Penne Rigate");
    assert.equal(sains.price_gbp, 0.7);
    window.confirm = () => true;
    await window.deleteIngredient(0);
    assert.equal(window.__sbTables.ingredient_prices.length, 0);
  });

  it("edits the price of a group that already has all four shops", async () => {
    const prices = ["tesco", "sainsburys", "asda", "waitrose"].map((store, i) => ({
      id: i + 1,
      slug: "penne",
      display_name: "Penne",
      category: "grocery",
      store,
      meal_key: null,
      product_name: store + " penne",
      pack_size: "500g",
      price_gbp: 0.5 + i / 10,
      pack_qty: 500,
      pack_unit: "g",
    }));
    const { window, document } = await loadApp({
      localState: weekState(),
      session: founder,
      tables: { meals: [], orders: [], profiles: [], ingredient_prices: prices, admins: [] },
    });
    window.__plentry.state().user = founder;
    await window.checkAdminStatus();
    await window.showIngredientsScreen();
    const before = prices.map((r) => ({ ...r }));
    document.getElementById("ing-price-0-asda").value = "1.15";
    await window.saveIngredientGroup(0);
    const rows = window.__sbTables.ingredient_prices;
    assert.equal(rows.length, 4);
    const asda = rows.find((r) => r.store === "asda");
    assert.equal(asda.price_gbp, 1.15);
    assert.equal(asda.product_name, "asda penne");
    assert.equal(asda.display_name, "Penne");
    assert.equal(asda.category, "grocery");
    assert.equal(asda.slug, "penne");
    assert.equal(asda.pack_size, "500g");
    assert.equal(asda.pack_qty, 500);
    assert.equal(asda.pack_unit, "g");
    for (const store of ["tesco", "sainsburys", "waitrose"]) {
      const row = rows.find((r) => r.store === store);
      const prior = before.find((r) => r.store === store);
      assert.equal(row.price_gbp, prior.price_gbp);
      assert.equal(row.product_name, prior.product_name);
      assert.equal(row.display_name, prior.display_name);
      assert.equal(row.category, prior.category);
      assert.equal(row.slug, prior.slug);
    }
  });

  it("fills a missing shop on a grocery group and keeps the stored slug", async () => {
    const prices = ["tesco", "sainsburys", "asda"].map((store, i) => ({
      id: i + 1,
      slug: "chicken-breast",
      display_name: "Chicken breast fillets",
      category: "grocery",
      store,
      meal_key: null,
      product_name: store + " fillets",
      pack_size: "650g",
      price_gbp: 4 + i,
      pack_qty: 650,
      pack_unit: "g",
    }));
    const { window, document } = await loadApp({
      localState: weekState(),
      session: founder,
      tables: { meals: [], orders: [], profiles: [], ingredient_prices: prices, admins: [] },
    });
    window.__plentry.state().user = founder;
    await window.checkAdminStatus();
    await window.showIngredientsScreen();
    document.getElementById("ing-price-0-waitrose").value = "5.40";
    document.getElementById("ing-product-0-waitrose").value = "Waitrose chicken breast fillets";
    document.getElementById("ing-pack-0-waitrose").value = "600g";
    document.getElementById("ing-qty-0-waitrose").value = "600";
    document.getElementById("ing-unit-0-waitrose").value = "g";
    await window.saveIngredientGroup(0);
    const rows = window.__sbTables.ingredient_prices;
    assert.equal(rows.length, 4);
    const added = rows.find((r) => r.store === "waitrose");
    assert.ok(added);
    assert.equal(added.slug, "chicken-breast");
    assert.notEqual(added.slug, "chicken-breast-fillets");
    assert.equal(added.display_name, "Chicken breast fillets");
    assert.equal(added.category, "grocery");
    assert.equal(added.product_name, "Waitrose chicken breast fillets");
    assert.equal(added.meal_key, null);
    assert.equal(added.price_gbp, 5.4);
    assert.equal(added.pack_size, "600g");
    assert.equal(added.pack_qty, 600);
    assert.equal(added.pack_unit, "g");
    assert.equal(rows.find((r) => r.id === 1).price_gbp, 4);
    assert.equal(rows.find((r) => r.id === 1).product_name, "tesco fillets");
  });

  it("writes the pack label when it was edited and leaves the other shops' labels", async () => {
    const prices = [
      { id: 9, slug: "penne", display_name: "Penne", category: "grocery", store: "tesco", meal_key: null, product_name: "Tesco Penne 500g", pack_size: "500g", price_gbp: 0.6, pack_qty: 500, pack_unit: "g" },
      { id: 10, slug: "penne", display_name: "Penne", category: "grocery", store: "sainsburys", meal_key: null, product_name: "Sainsbury's Penne", pack_size: "500g", price_gbp: 0.7, pack_qty: 500, pack_unit: "g" },
    ];
    const { window, document } = await loadApp({
      localState: weekState(),
      session: founder,
      tables: { meals: [], orders: [], profiles: [], ingredient_prices: prices, admins: [] },
    });
    window.__plentry.state().user = founder;
    await window.checkAdminStatus();
    await window.showIngredientsScreen();
    document.getElementById("ing-pack-0-tesco").value = "1kg";
    await window.saveIngredientGroup(0);
    const rows = window.__sbTables.ingredient_prices;
    assert.equal(rows.find((r) => r.id === 9).pack_size, "1kg");
    assert.equal(rows.find((r) => r.id === 9).price_gbp, 0.6);
    assert.equal(rows.find((r) => r.id === 10).pack_size, "500g");
  });

  it("keeps the shelf product when the field is cleared, and a missing shop needs a product name", async () => {
    const prices = [
      { id: 9, slug: "penne", display_name: "Penne", category: "grocery", store: "tesco", meal_key: null, product_name: "Tesco Penne 500g", pack_size: "500g", price_gbp: 0.6, pack_qty: 500, pack_unit: "g" },
    ];
    const { window, document } = await loadApp({
      localState: weekState(),
      session: founder,
      tables: { meals: [], orders: [], profiles: [], ingredient_prices: prices, admins: [] },
    });
    window.__plentry.state().user = founder;
    await window.checkAdminStatus();
    await window.showIngredientsScreen();
    document.getElementById("ing-product-0-tesco").value = "";
    document.getElementById("ing-price-0-tesco").value = "0.99";
    await window.saveIngredientGroup(0);
    const tesco = window.__sbTables.ingredient_prices.find((r) => r.id === 9);
    assert.equal(tesco.product_name, "Tesco Penne 500g");
    assert.equal(tesco.price_gbp, 0.99);
    document.getElementById("ing-price-0-waitrose").value = "1.20";
    document.getElementById("ing-product-0-waitrose").value = "   ";
    await window.saveIngredientGroup(0);
    assert.equal(window.__sbTables.ingredient_prices.length, 1);
    assert.match(document.getElementById("ing-err-0").textContent, /Name the shelf product/);
  });

  it("rejects a partial ingredient_prices insert or upsert that omits a NOT NULL column", async () => {
    const tables = {
      ingredient_prices: [
        { id: 1, slug: "penne", display_name: "Penne", category: "grocery", store: "tesco", product_name: "Tesco Penne", price_gbp: 0.6 },
      ],
    };
    const before = structuredClone(tables.ingredient_prices);
    const partial = { slug: "penne", store: "tesco", price_gbp: 0.9 };
    assert.match(ingredientPriceWriteError(partial).message, /display_name/);
    const inserted = await makeQuery(tables, "ingredient_prices").insert(partial);
    assert.match(inserted.error.message, /not-null constraint/);
    assert.equal(tables.ingredient_prices.length, 1);
    assert.equal(tables.ingredient_prices[0].price_gbp, 0.6);
    const upserted = await makeQuery(tables, "ingredient_prices").upsert(partial, { onConflict: "slug,store" });
    assert.match(upserted.error.message, /not-null constraint/);
    assert.deepEqual(tables.ingredient_prices, before);
    const profiles = { profiles: [] };
    const kept = await makeQuery(profiles, "profiles").upsert({ id: "u1" }, { onConflict: "id" });
    assert.equal(kept.error, null);
    assert.equal(profiles.profiles.length, 1);
  });
});

describe("shop switch uses that shop's packs", () => {
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
  const weekPrices = [
    ["bell peppers", "sainsburys", 1.99, 3, "pc"], ["bell peppers", "tesco", 2.10, 3, "pc"],
    ["black pepper", "sainsburys", 0.87, 55, "g"], ["black pepper", "tesco", 1.20, 25, "g"],
    ["broccoli", "sainsburys", 1.40, 300, "g"], ["broccoli", "tesco", 0.90, 1, "pc"],
    ["chilli flakes", "sainsburys", 1.15, 32, "g"], ["chilli flakes", "tesco", 1.00, 32, "g"],
    ["cumin", "sainsburys", 1.15, 43, "g"], ["cumin", "tesco", 1.00, 43, "g"],
    ["eggs", "sainsburys", 1.80, 6, "pc"], ["eggs", "tesco", 1.80, 6, "pc"],
    ["feta", "sainsburys", 2.35, 200, "g"], ["feta", "tesco", 2.25, 200, "g"],
    ["garlic", "sainsburys", 0.50, 10, "clove"], ["garlic", "tesco", 0.87, 40, "clove"],
    ["lemons", "sainsburys", 0.89, 4, "pc"], ["lemons", "tesco", 1.45, 4, "pc"],
    ["minced beef", "sainsburys", 5.05, 500, "g"], ["minced beef", "tesco", 6.75, 500, "g"],
    ["mixed herbs", "sainsburys", 0.82, 18, "g"], ["mixed herbs", "tesco", 1.00, 18, "g"],
    ["olive oil", "sainsburys", 5.75, 33, "tbsp"], ["olive oil", "tesco", 5.75, 33, "tbsp"],
    ["onions", "sainsburys", 0.95, 3, "pc"], ["onions", "tesco", 0.95, 6, "pc"],
    ["paprika", "sainsburys", 1.15, 44, "g"], ["paprika", "tesco", 1.00, 50, "g"],
    ["parmesan", "sainsburys", 2.90, 80, "g"], ["parmesan", "tesco", 4.00, 200, "g"],
    ["passata", "sainsburys", 0.45, 500, "g"], ["passata", "tesco", 0.60, 500, "g"],
    ["potatoes", "sainsburys", 1.32, 2000, "g"], ["potatoes", "tesco", 1.32, 2000, "g"],
    ["salmon fillet", "sainsburys", 3.59, 2, "pc"], ["salmon fillet", "tesco", 4.90, 2, "pc"],
    ["salt", "sainsburys", 0.75, 750, "g"], ["salt", "tesco", 1.90, 1500, "g"],
    ["soy sauce", "sainsburys", 0.55, 150, "ml"], ["soy sauce", "tesco", 0.55, 150, "ml"],
    ["spaghetti", "sainsburys", 0.75, 500, "g"], ["spaghetti", "tesco", 0.75, 500, "g"],
    ["stock cubes", "sainsburys", 1.10, 10, "pc"], ["stock cubes", "tesco", 1.00, 10, "pc"],
    ["tomatoes", "sainsburys", 0.99, 6, "pc"], ["tomatoes", "tesco", 0.99, 6, "pc"],
    ["tortillas", "sainsburys", 0.99, 8, "pc"], ["tortillas", "tesco", 1.40, 8, "pc"],
    ["fresh basil", "tesco", 0.50, 30, "g"], ["tomato puree", "tesco", 0.59, 200, "g"],
    ["red onions", "tesco", 1.00, 3, "pc"], ["chopped tomatoes", "tesco", 0.47, 400, "g"],
  ].map(([meal_key, store, price_gbp, pack_qty, pack_unit], i) => ({
    id: i + 1, meal_key, store, price_gbp, pack_qty, pack_unit, product_name: meal_key, display_name: meal_key,
  }));

  async function loadWeek() {
    const { window, document } = await loadApp({
      localState: weekState(),
      tables: { meals: [], orders: [], profiles: [], ingredient_prices: weekPrices.map((r) => ({ ...r })) },
    });
    const S = window.__plentry.state();
    S.weekServings = 6;
    S.prefs.servings = 6;
    S.menuOptions = [ragu, shakshuka, tortilla, salmon];
    S.selected = [ragu.name, shakshuka.name, tortilla.name, salmon.name];
    S.basketEdit = null;
    S.pantry = {};
    await window.loadShelfPrices();
    window.pickStore("tesco");
    window.syncBasketFromMeals();
    window.renderShop();
    return { window, document, S };
  }

  it("Tesco then Sainsbury's at 6 servings shows each shop's total and pay's hold", async () => {
    const { window, document } = await loadWeek();
    const qty = (name) => window.__plentry.getBasket().find((b) => b.i === name).q;
    assert.equal(qty("garlic"), 1);
    assert.equal(qty("onions"), 2);
    const before = document.getElementById("store-compare").textContent;
    assert.ok(document.getElementById("store-tesco").textContent.includes("£91.39"), before);
    assert.ok(document.getElementById("store-sains").textContent.includes("£85.31"), before);
    assert.ok(!document.getElementById("store-sains").textContent.includes("£104.97"));
    window.pickStore("sains");
    assert.equal(qty("garlic"), 2);
    assert.equal(qty("onions"), 3);
    assert.ok(document.getElementById("store-tesco").textContent.includes("£91.39"));
    assert.ok(document.getElementById("store-sains").textContent.includes("£85.31"));
    assert.ok(document.getElementById("order-btn").textContent.includes("£85.31"));
    window.openBasket();
    const drawer = document.getElementById("drawer-stores").textContent;
    assert.ok(drawer.includes("£91.39"));
    assert.ok(drawer.includes("£85.31"));
    window.__plentry.state().user = { id: "u1", email: "t@t.com", name: "T" };
    window.confirmOrder();
    const modal = document.getElementById("modal").textContent;
    assert.ok(modal.includes("£110.91"), modal);
    assert.ok(!modal.includes("£104.97"));
    assert.ok(!modal.includes("£126.75"));
  });

  it("an edited basket keeps added and removed lines and refreshes derived counts", async () => {
    const { window, document, S } = await loadWeek();
    const lines = window.__plentry.getBasket()
      .filter((b) => b.i !== "parmesan")
      .map((b) => ({ i: b.i, q: b.i === "garlic" ? 7 : b.q }));
    lines.push({ i: "rice", q: 1 });
    S.basketEdit = lines;
    S.basketFor = JSON.stringify(S.selected);
    window.pickStore("sains");
    const names = window.__plentry.getBasket().map((b) => b.i);
    assert.ok(names.includes("rice"));
    assert.ok(!names.includes("parmesan"));
    assert.equal(window.__plentry.getBasket().find((b) => b.i === "garlic").q, 2);
    assert.equal(window.__plentry.getBasket().find((b) => b.i === "rice").q, 1);
    assert.ok(document.getElementById("store-sains").textContent.includes("£85.31"));
    S.user = { id: "u1", email: "t@t.com", name: "T" };
    window.confirmOrder();
    assert.ok(document.getElementById("modal").textContent.includes("£110.91"));
  });

  it("duplicate meal_key and store rows keep the lowest id on the shelf", async () => {
    const { window } = await loadApp({
      tables: {
        meals: [],
        orders: [],
        profiles: [],
        ingredient_prices: [
          { id: 3, meal_key: "garlic", store: "tesco", price_gbp: 0.5, pack_qty: 10, pack_unit: "clove", product_name: "low", display_name: "garlic" },
          { id: 8, meal_key: "garlic", store: "tesco", price_gbp: 9, pack_qty: 40, pack_unit: "clove", product_name: "high", display_name: "garlic" },
          { meal_key: "onions", store: "tesco", price_gbp: 0.95, pack_qty: 6, pack_unit: "pc", product_name: "first", display_name: "onions" },
          { meal_key: "onions", store: "tesco", price_gbp: 1.5, pack_qty: 3, pack_unit: "pc", product_name: "second", display_name: "onions" },
        ],
      },
    });
    await window.loadShelfPrices();
    assert.equal(window.storePackMap("tesco").garlic.pack, 10);
    const garlic = window.shelfRow("garlic", { id: "tesco" });
    assert.equal(Number(garlic.price_gbp), 0.5);
    assert.equal(garlic.product_name, "low");
    const onions = window.shelfRow("onions", { id: "tesco" });
    assert.equal(Number(onions.pack_qty), 6);
    assert.equal(onions.product_name, "first");
  });

  it("I-P06 day-card prices sum to Tesco groceries at 2, 4 and 6, with and without cupboard ticks", async () => {
    const { window, document, S } = await loadWeek();
    const store = window.preferredStoreObj();
    const meals = () => S.selected.map(window.mealByName);
    const modes = [
      { servings: 2, ticks: [] },
      { servings: 4, ticks: [] },
      { servings: 6, ticks: [] },
      { servings: 2, ticks: ["olive oil", "garlic", "onions", "salt"] },
      { servings: 4, ticks: ["olive oil", "garlic", "onions", "salt"] },
      { servings: 6, ticks: ["olive oil", "garlic", "onions", "salt"] },
    ];
    for (const mode of modes) {
      S.weekServings = mode.servings;
      S.pantry = {};
      mode.ticks.forEach((k) => { S.pantry[k] = 1; });
      const list = meals();
      const packs = window.__plentry.weekPacks(list, mode.servings, mode.ticks, store);
      const groceries = window.__plentry.basketGroceryPence(packs, store);
      const pence = window.__plentry.splitMealPence(list, mode.servings, mode.ticks, store);
      const label = `servings ${mode.servings} ticks ${mode.ticks.length}`;
      assert.equal(pence.reduce((a, b) => a + b, 0), groceries, label);
      assert.ok(pence.every((p) => p >= 0 && Number.isInteger(p)), label);
      window.renderMenu();
      const shown = [...document.querySelectorAll("#menu-week .day-side .mp")].map((el) => el.textContent);
      const labels = list.map((m, i) => window.__plentry.dinnerShownLabel(list, i, mode.servings, mode.ticks, store));
      assert.deepEqual(shown, labels, label);
      assert.equal(document.getElementById("week-ingredients"), null, label);
      assert.equal(document.getElementById("week-price-note"), null, label);
      const parsed = shown.map((text) => Math.round(Number(text.replace(/[^0-9.]/g, "")) * 100));
      assert.deepEqual(parsed, Array.from(pence), label);
      const quote = window.__plentry.weekPriceQuote(list, store);
      assert.equal(Math.round(quote.groceries * 100), groceries, label);
      assert.equal(quote.delivery, store.fee, label);
      assert.equal(quote.est, window.gbp(quote.groceries + quote.delivery), label);
      assert.equal(quote.fee, window.plentryFee(quote.est), label);
      assert.equal(quote.total, window.customerTotal(quote.est), label);
      assert.equal(quote.hold, window.holdAmount(quote.est), label);
      assert.equal(Math.round(quote.hold * 100), Math.round(quote.est * 1.05 * 1.30 * 100), label);
      const sumText = `Basket £${quote.groceries.toFixed(2)} + delivery £${quote.delivery.toFixed(2)} + 5% fee £${quote.fee.toFixed(2)} = £${quote.total.toFixed(2)}`;
      assert.equal(document.getElementById("week-price-sum").textContent, sumText, label);
      assert.equal(
        document.getElementById("week-hold").textContent,
        `The card hold is £${quote.hold.toFixed(2)} — a 30% buffer. Only the actual amount is captured, and the rest is released.`,
        label,
      );
      const shop = document.querySelector("#menu-week .week-card .v").textContent;
      assert.equal(shop, `£${quote.total.toFixed(2)}`, label);
      assert.match(shop, /^£\d+\.\d{2}$/);
      if (!mode.ticks.length) {
        const solo = list.reduce((t, m) => t + window.mealNeedCost(m, store), 0);
        assert.ok(solo > quote.groceries + 0.5, `${label}: solo £${solo.toFixed(2)} vs groceries £${quote.groceries.toFixed(2)}`);
      }
    }
  });

  it("I-P06 pomodoro's Tesco share stays under a whole private basket at 2, 4 and 6", async () => {
    const pomodoro = {
      id: 28,
      name: "Veggie spaghetti pomodoro",
      ing: ["black pepper", "chilli flakes", "chopped tomatoes", "fresh basil", "garlic", "olive oil", "red onions", "salt", "spaghetti", "tomato puree"],
      portions: {
        salt: [0.5, "tsp"], garlic: [2, "clove"], "olive oil": [3, "tbsp"], spaghetti: [180, "g"],
        "red onions": [1, "pc"], "fresh basil": [15, "g"], "black pepper": [0.25, "tsp"],
        "tomato puree": [15, "g"], "chilli flakes": [0.5, "tsp"], "chopped tomatoes": [400, "g"],
      },
    };
    for (const servings of [2, 4, 6]) {
      const { window, document, S } = await loadWeek();
      const store = window.preferredStoreObj();
      S.weekServings = servings;
      S.menuOptions = [pomodoro, shakshuka, tortilla, ragu];
      S.selected = [pomodoro.name, shakshuka.name, tortilla.name, ragu.name];
      window.renderMenu();
      const cards = [...document.querySelectorAll("#menu-week .day-side .mp")].map((el) => el.textContent);
      assert.ok(cards.every((text) => /^£\d+\.\d{2}$/.test(text)), cards.join(" | "));
      const shown = cards.map((text) => Math.round(Number(text.slice(1)) * 100));
      const list = S.selected.map(window.mealByName);
      const groceries = window.__plentry.basketGroceryPence(
        window.__plentry.weekPacks(list, servings, [], store),
        store,
      );
      assert.equal(shown.reduce((a, b) => a + b, 0), groceries, `servings ${servings}`);
      const share = shown[0];
      const quote = window.__plentry.mealIngredientQuote(pomodoro, servings, store);
      const solo = window.__plentry.basketGroceryPence(
        window.__plentry.weekPacks([pomodoro], servings, [], store),
        store,
      );
      assert.equal(quote.incomplete, false, `servings ${servings}`);
      assert.equal(quote.pence, [193, 387, 578][servings / 2 - 1], `servings ${servings}`);
      assert.ok(share > quote.pence, `share ${share} weight ${quote.pence}`);
      assert.ok(share < solo - 100, `share ${share} solo ${solo}`);
      const pair = window.__plentry.splitMealPence([pomodoro, shakshuka], servings, [], store)[0];
      assert.ok(Math.abs(pair - share) < 575, `pair ${pair} week ${share}`);
      await window.openModify(0);
      window.__plentry.setModifyPicks([pomodoro]);
      window.renderModifySheet();
      const listed = document.querySelector("#modify-alts .mp").textContent;
      assert.equal(listed, "£" + (share / 100).toFixed(2));
    }
  });

  it("I-P06 pins the Tesco week shares and pomodoro swapped in for salmon", async () => {
    const pounds = (pence) => "£" + (pence / 100).toFixed(2);
    // Locked. A change to the ingredient-cost weighting must fail this test.
    const pinned = {
      2: [1852, 1377, 463, 1091],
      4: [2596, 1749, 532, 1091],
      6: [3620, 2536, 947, 1301],
    };
    const baskets = { 2: 4783, 4: 5968, 6: 8404 };
    const pomodoroPence = { 2: 407, 4: 471, 6: 583 };
    const pomodoro = {
      id: 28,
      name: "Veggie spaghetti pomodoro",
      ing: ["black pepper", "chilli flakes", "chopped tomatoes", "fresh basil", "garlic", "olive oil", "red onions", "salt", "spaghetti", "tomato puree"],
      portions: {
        salt: [0.5, "tsp"], garlic: [2, "clove"], "olive oil": [3, "tbsp"], spaghetti: [180, "g"],
        "red onions": [1, "pc"], "fresh basil": [15, "g"], "black pepper": [0.25, "tsp"],
        "tomato puree": [15, "g"], "chilli flakes": [0.5, "tsp"], "chopped tomatoes": [400, "g"],
      },
    };
    const { window, document, S } = await loadWeek();
    const store = window.preferredStoreObj();
    for (const servings of [2, 4, 6]) {
      S.weekServings = servings;
      S.pantry = {};
      S.menuOptions = [ragu, shakshuka, tortilla, salmon];
      S.selected = [ragu.name, shakshuka.name, tortilla.name, salmon.name];
      const list = S.selected.map(window.mealByName);
      const pence = Array.from(window.__plentry.splitMealPence(list, servings, [], store));
      assert.deepEqual(pence, pinned[servings], `shares at ${servings}`);
      const groceries = window.__plentry.basketGroceryPence(
        window.__plentry.weekPacks(list, servings, [], store),
        store,
      );
      assert.equal(groceries, baskets[servings], `basket at ${servings}`);
      assert.equal(pence.reduce((a, b) => a + b, 0), baskets[servings], `sum at ${servings}`);
      window.renderMenu();
      const shown = [...document.querySelectorAll("#menu-week .day-side .mp")].map((el) => el.textContent);
      assert.deepEqual(shown, pinned[servings].map(pounds), `cards at ${servings}`);
      assert.ok(
        document.getElementById("week-price-sum").textContent.startsWith("Basket " + pounds(baskets[servings])),
        `footer at ${servings}`,
      );
    }
    for (const servings of [2, 4, 6]) {
      S.weekServings = servings;
      S.pantry = {};
      S.menuOptions = [ragu, shakshuka, tortilla, pomodoro];
      S.selected = [ragu.name, shakshuka.name, tortilla.name, pomodoro.name];
      const list = S.selected.map(window.mealByName);
      const pence = Array.from(window.__plentry.splitMealPence(list, servings, [], store));
      assert.equal(pence[3], pomodoroPence[servings], `pomodoro share at ${servings}: ${pence.join(",")}`);
      window.renderMenu();
      const card = [...document.querySelectorAll("#menu-week .day-card")]
        .find((el) => el.textContent.includes("Veggie spaghetti pomodoro"));
      assert.equal(card.querySelector(".day-side .mp").textContent, pounds(pomodoroPence[servings]));
    }
  });

  it("I-P06 a dinner with every ingredient ticked says From your cupboard", async () => {
    const { window, document, S } = await loadWeek();
    const store = window.preferredStoreObj();
    S.weekServings = 2;
    S.pantry = {};
    const ticks = window.__plentry.completeIng(window.mealByName(tortilla.name));
    ticks.forEach((k) => { S.pantry[k] = 1; });
    const list = S.selected.map(window.mealByName);
    const pence = Array.from(window.__plentry.splitMealPence(list, 2, ticks, store));
    assert.equal(pence[2], 0);
    assert.ok(pence.every((p, i) => i === 2 || p > 0), pence.join(","));
    assert.equal(window.__plentry.dinnerShownLabel(list, 2, 2, ticks, store), "From your cupboard");
    window.renderMenu();
    const cards = [...document.querySelectorAll("#menu-week .day-card")];
    const tortillaCard = cards.find((el) => el.textContent.includes("Spanish tortilla"));
    assert.equal(tortillaCard.querySelector(".day-side .mp").textContent, "From your cupboard");
    assert.equal(tortillaCard.textContent.includes("£0.00"), false);
    cards.forEach((el) => {
      if (el === tortillaCard) return;
      const text = el.querySelector(".day-side .mp").textContent;
      assert.match(text, /^£\d+\.\d{2}$/);
      assert.notEqual(text, "£0.00");
      assert.notEqual(text, "From your cupboard");
    });
    const groceries = window.__plentry.basketGroceryPence(
      window.__plentry.weekPacks(list, 2, ticks, store),
      store,
    );
    assert.equal(pence.reduce((a, b) => a + b, 0), groceries);
    const pantrySupper = {
      name: "Pantry supper",
      ing: ticks.slice(),
      portions: tortilla.portions,
    };
    S.menuOptions.push(pantrySupper);
    await window.openModify(2);
    window.__plentry.setModifyPicks([window.mealByName("Pantry supper")]);
    window.renderModifySheet();
    const alt = [...document.querySelectorAll("#modify-alts button")]
      .find((el) => el.textContent.includes("Pantry supper"));
    assert.equal(alt.querySelector(".mp").textContent, "From your cupboard");
    assert.equal(alt.textContent.includes("£0.00"), false);
    const mince = {
      name: "Mince on the side",
      ing: ["minced beef", "salt"],
      portions: { "minced beef": [200, "g"], salt: [0.5, "tsp"] },
    };
    window.__plentry.setModifyPicks([mince]);
    window.renderModifySheet();
    const minceLabel = document.querySelector("#modify-alts .mp").textContent;
    assert.match(minceLabel, /^£\d+\.\d{2}$/);
    assert.notEqual(minceLabel, "£0.00");
    assert.notEqual(minceLabel, "From your cupboard");
  });

  it("I-P06 a 0p share that still owns a basket line shows the price", async () => {
    const { window, document } = await loadApp({
      localState: weekState(),
      tables: { meals: [], orders: [], profiles: [], ingredient_prices: [] },
    });
    const S = window.__plentry.state();
    const heavy = {
      name: "Big rice",
      ing: ["rice", "salt", "black pepper"],
      portions: { rice: [1000, "g"], salt: [0.5, "tsp"], "black pepper": [0.25, "tsp"] },
    };
    const crumb = {
      name: "Rice crumb",
      ing: ["rice", "salt", "black pepper"],
      portions: { rice: [4, "g"], salt: [0.5, "tsp"], "black pepper": [0.25, "tsp"] },
    };
    S.weekServings = 2;
    S.prefs.servings = 2;
    S.prefs.preferredStore = "tesco";
    S.pantry = { rice: 1, "black pepper": 1 };
    S.menuOptions = [heavy, crumb];
    S.selected = [heavy.name, crumb.name];
    S.basketEdit = null;
    const store = window.preferredStoreObj();
    const ticks = ["rice", "black pepper"];
    const list = [heavy, crumb];
    const packs = window.__plentry.weekPacks(list, 2, ticks, store);
    assert.equal(packs.salt, 1);
    assert.equal(packs.rice, undefined);
    assert.equal(packs["black pepper"], undefined);
    const pence = Array.from(window.__plentry.splitMealPence(list, 2, ticks, store));
    assert.equal(pence[1], 0, pence.join(","));
    assert.ok(pence[0] > 0, pence.join(","));
    const groceries = window.__plentry.basketGroceryPence(packs, store);
    assert.equal(pence[0] + pence[1], groceries);
    assert.equal(window.__plentry.dinnerShownLabel(list, 1, 2, ticks, store), "£0.00");
    assert.equal(window.__plentry.dinnerShownLabel(list, 0, 2, ticks, store), "£" + (pence[0] / 100).toFixed(2));
    window.syncBasketFromMeals();
    window.renderMenu();
    const crumbCard = [...document.querySelectorAll("#menu-week .day-card")]
      .find((el) => el.textContent.includes("Rice crumb"));
    assert.equal(crumbCard.querySelector(".day-side .mp").textContent, "£0.00");
    assert.equal(crumbCard.textContent.includes("From your cupboard"), false);
    const saltCrumb = {
      name: "Salt crumb",
      ing: ["rice", "salt", "black pepper"],
      portions: { rice: [4, "g"], salt: [0.5, "tsp"], "black pepper": [0.25, "tsp"] },
    };
    S.menuOptions.push(saltCrumb);
    await window.openModify(1);
    window.__plentry.setModifyPicks([window.mealByName("Salt crumb")]);
    window.renderModifySheet();
    const alt = [...document.querySelectorAll("#modify-alts button")]
      .find((el) => el.textContent.includes("Salt crumb"));
    assert.equal(alt.querySelector(".mp").textContent, "£0.00");
    assert.equal(alt.textContent.includes("From your cupboard"), false);
    const covered = ["rice", "salt", "black pepper"];
    covered.forEach((k) => { S.pantry[k] = 1; });
    assert.equal(window.__plentry.dinnerShownLabel(list, 1, 2, covered, store), "From your cupboard");
    assert.equal(window.__plentry.dinnerShownLabel(list, 0, 2, covered, store), "From your cupboard");
    window.renderMenu();
    const coveredCards = [...document.querySelectorAll("#menu-week .day-card")];
    assert.equal(coveredCards.length, 2);
    coveredCards.forEach((el) => {
      assert.equal(el.querySelector(".day-side .mp").textContent, "From your cupboard");
      assert.equal(el.textContent.includes("£0.00"), false);
    });
  });
});

describe("per-meal price split (I-P06)", () => {
  it("splits shared packs by ingredient-cost weight, ties to the earlier day", async () => {
    const { window } = await loadApp();
    const saltRice = { name: "Rice", ing: ["salt", "rice"], portions: { rice: [100, "g"], salt: [0.5, "tsp"] } };
    const saltPasta = { name: "Pasta", ing: ["salt", "spaghetti"], portions: { spaghetti: [100, "g"], salt: [0.5, "tsp"] } };
    const open = window.__plentry.splitMealPence([saltRice, saltPasta], 2, [], null);
    assert.deepEqual(Array.from(open), [173, 132]);
    assert.equal(open[0] + open[1], 65 + 145 + 95);
    const ticked = window.__plentry.splitMealPence([saltRice, saltPasta], 2, ["salt"], null);
    assert.deepEqual(Array.from(ticked), [145, 95]);
    const onionA = { name: "One", ing: ["onions"], portions: { onions: [1, "pc"] } };
    const onionB = { name: "Two", ing: ["onions"], portions: { onions: [2, "pc"] } };
    const onions = window.__plentry.splitMealPence([onionA, onionB], 2, [], null);
    assert.deepEqual(Array.from(onions), [28, 57]);
    assert.equal(onions[0] + onions[1], 85);
    const eggsA = { name: "A", ing: ["eggs", "onions"] };
    const eggsB = { name: "B", ing: ["eggs"] };
    const eggs = window.__plentry.splitMealPence([eggsA, eggsB], 2, [], null);
    assert.deepEqual(Array.from(eggs), [163, 77]);
    assert.equal(eggs[0] + eggs[1], 155 + 85);
    for (const servings of [2, 4, 6]) {
      const list = [saltRice, saltPasta, onionA];
      for (const ticks of [[], ["salt"]]) {
        const packs = window.__plentry.weekPacks(list, servings, ticks, null);
        const groceries = window.__plentry.basketGroceryPence(packs, null);
        const pence = window.__plentry.splitMealPence(list, servings, ticks, null);
        assert.equal(pence.reduce((a, b) => a + b, 0), groceries, `servings ${servings} ticks ${ticks.join(",")}`);
        assert.ok(pence.every((n) => n >= 0 && Number.isInteger(n)));
      }
    }
  });
});

describe("I-O19 order receipt", () => {
  it("I-O19 the Orders badge and Did it all arrive are only the customer's own unconfirmed delivery", async () => {
    const deliveredAt = new Date().toISOString();
    const { window, document } = await loadApp({
      session: { id: "u1", email: "u1@example.com" },
      tables: {
        meals: [],
        profiles: [],
        ingredient_prices: [],
        orders: [
          {
            id: 31,
            user_id: "u1",
            store: "Tesco",
            total: 10,
            items: { basket: [{ i: "eggs", q: 1 }], meals: [] },
            status: "delivered",
            created_at: "2026-10-01T12:00:00.000Z",
            payment_status: "captured",
            amount_captured: 10,
            delivered_at: deliveredAt,
            received_confirmed_at: null,
            received_confirmed_by: null,
          },
          {
            id: 32,
            user_id: "u2",
            store: "Asda",
            total: 8,
            items: { basket: [], meals: [] },
            status: "delivered",
            created_at: "2026-10-01T12:00:00.000Z",
            payment_status: "captured",
            delivered_at: deliveredAt,
            received_confirmed_at: null,
            received_confirmed_by: null,
          },
          {
            id: 33,
            user_id: "u1",
            store: "Waitrose",
            total: 12,
            items: { basket: [], meals: [] },
            status: "ordered",
            created_at: "2026-10-02T12:00:00.000Z",
            payment_status: "authorized",
            delivered_at: null,
            received_confirmed_at: null,
            received_confirmed_by: null,
          },
          {
            id: 34,
            user_id: "u1",
            store: "Sainsbury's",
            total: 9,
            items: { basket: [], meals: [] },
            status: "delivered",
            created_at: "2026-10-03T12:00:00.000Z",
            payment_status: "captured",
            delivered_at: deliveredAt,
            received_confirmed_at: "2026-10-04T12:00:00.000Z",
            received_confirmed_by: "customer",
          },
        ],
        order_messages: [],
      },
    });
    const S = window.__plentry.state();
    S.user = { id: "u1", email: "u1@example.com", name: "U" };
    S.orders = window.__sbTables.orders.map((row) => window.orderFromRow(row));
    assert.equal(window.__plentry.RECEIPT_HOURS, 48);
    assert.equal(window.__plentry.receiptHoursLeft({ delivered_at: new Date(Date.now() - 49 * 3600000).toISOString() }), 0);
    window.renderOrders();
    const badge = document.getElementById("orders-receipt-badge");
    assert.equal(badge.classList.contains("inbox-badge"), true);
    assert.equal(badge.textContent, "1");
    assert.equal(badge.style.display, "flex");
    const cards = [...document.querySelectorAll("#orders-list .meal")];
    const card = (name) => cards.find((c) => c.textContent.includes(name));
    assert.ok(card("Tesco").textContent.includes("Did it all arrive?"));
    assert.ok(card("Tesco").textContent.includes("Yes, complete"));
    assert.ok(card("Tesco").textContent.includes("Something's wrong"));
    assert.match(card("Tesco").textContent, /Auto-completes in 48h/);
    assert.equal(card("Tesco").querySelectorAll(".tstep")[3].textContent, "Complete");
    assert.equal(card("Tesco").querySelectorAll(".tstep")[3].classList.contains("active"), true);
    assert.ok(!card("Asda").textContent.includes("Did it all arrive?"));
    assert.ok(!card("Waitrose").textContent.includes("Did it all arrive?"));
    assert.ok(!card("Sainsbury").textContent.includes("Did it all arrive?"));
    assert.equal(card("Sainsbury").querySelectorAll(".tstep")[3].classList.contains("done"), true);
    assert.equal(window.__sbTables.__rpc, undefined);
    await window.confirmOrderReceived(32);
    assert.equal(window.__sbTables.__rpc, undefined, "another customer's order does not call the RPC");
    const wrong = [...card("Tesco").querySelectorAll("button")].find((b) => b.textContent.includes("Something's wrong"));
    wrong.click();
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(document.getElementById("modal").textContent.includes("Issue"));
    window.closeModal();
    const yes = [...card("Tesco").querySelectorAll("button")].find((b) => b.textContent.includes("Yes, complete"));
    assert.match(yes.getAttribute("onclick"), /confirmOrderReceived\(31\)/);
    await window.confirmOrderReceived(31);
    assert.equal(window.__sbTables.__rpc.at(-1).fn, "confirm_order_received");
    assert.equal(window.__sbTables.__rpc.at(-1).args.p_order_id, 31);
    assert.equal(window.__sbTables.orders.find((o) => o.id === 31).received_confirmed_by, "customer");
    assert.equal(document.getElementById("orders-receipt-badge").style.display, "none");
    assert.ok(!document.getElementById("orders-list").textContent.includes("Did it all arrive?"));
    assert.equal(document.querySelector("#orders-list .meal").querySelectorAll(".tstep")[3].classList.contains("done"), true);
  });

  it("I-O19 Ops badges, filter chips, and Mark complete", async () => {
    const deliveredAt = new Date(Date.now() - 3 * 3600000).toISOString();
    const { window, document } = await loadApp({
      localState: weekState(),
      session: { id: "admin", email: "noyouchka.bouchard@gmail.com" },
      tables: {
        meals: [],
        profiles: [],
        ingredient_prices: [],
        orders: [
          {
            id: 40,
            user_id: "u1",
            email: "c@x.com",
            name: "A",
            postcode: "E2 8AA",
            store: "Tesco",
            total: 10,
            items: { basket: [{ i: "eggs", q: 1, product: "eggs" }], meals: [] },
            status: "delivered",
            created_at: "2026-10-20T12:00:00.000Z",
            payment_status: "captured",
            address: {},
            delivered_at: deliveredAt,
            received_confirmed_at: null,
            received_confirmed_by: null,
          },
          {
            id: 41,
            user_id: "u1",
            email: "c@x.com",
            name: "A",
            postcode: "E2 8AA",
            store: "Waitrose",
            total: 12,
            items: { basket: [], meals: [] },
            status: "delivered",
            created_at: "2026-10-18T12:00:00.000Z",
            payment_status: "captured",
            address: {},
            delivered_at: deliveredAt,
            received_confirmed_at: "2026-10-19T12:00:00.000Z",
            received_confirmed_by: "customer",
          },
          {
            id: 42,
            user_id: "u1",
            email: "c@x.com",
            name: "A",
            postcode: "E2 8AA",
            store: "Asda",
            total: 9,
            items: { basket: [], meals: [] },
            status: "delivered",
            created_at: "2026-09-01T12:00:00.000Z",
            payment_status: "captured",
            address: {},
            delivered_at: null,
            received_confirmed_at: "2026-09-02T12:00:00.000Z",
            received_confirmed_by: "backfill",
          },
        ],
      },
    });
    window.__plentry.state().user = { id: "admin", email: "noyouchka.bouchard@gmail.com", name: "Noe" };
    assert.equal(window.isAdmin(), true);
    await window.renderAdmin();
    const list = document.getElementById("admin-list");
    assert.match(list.textContent, /Awaiting receipt \(45h left\)/);
    assert.match(list.textContent, /Complete ✓ \(customer\)/);
    assert.match(list.textContent, /Complete ✓ \(backfill\)/);
    assert.equal(list.querySelectorAll(".receipt-chips button").length, 3);
    const mark = [...list.querySelectorAll("button")].filter((b) => b.textContent.includes("Mark complete"));
    assert.equal(mark.length, 1);
    assert.match(mark[0].getAttribute("onclick"), /adminMarkReceived\(40\)/);
    window.setOpsReceiptFilter("awaiting");
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(document.getElementById("admin-list").textContent.includes("#40"));
    assert.ok(!document.getElementById("admin-list").textContent.includes("#41"));
    window.setOpsReceiptFilter("complete");
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(!document.getElementById("admin-list").textContent.includes("Mark complete"));
    assert.ok(document.getElementById("admin-list").textContent.includes("#41"));
    assert.ok(document.getElementById("admin-list").textContent.includes("#42"));
    window.setOpsReceiptFilter("all");
    await new Promise((r) => setTimeout(r, 20));
    await window.adminMarkReceived(40);
    assert.equal(window.__sbTables.__rpc.at(-1).fn, "admin_mark_received");
    assert.equal(window.__sbTables.__rpc.at(-1).args.p_order_id, 40);
    assert.match(document.getElementById("admin-list").textContent, /Complete ✓ \(ops\)/);
    assert.equal(window.__sbTables.orders.find((o) => o.id === 40).received_confirmed_by, "ops");
    const alerts = [];
    window.alert = (msg) => alerts.push(String(msg));
    const from = window.__mockSb.from.bind(window.__mockSb);
    window.__mockSb.from = (table) => {
      const q = from(table);
      if (table !== "orders") return q;
      const update = q.update.bind(q);
      q.update = (patch) => {
        const next = update(patch);
        if (patch && patch.status && patch.status !== "delivered") {
          next.then = (ok, err) => Promise.resolve({
            data: null,
            error: { message: "cannot change status after the order is received" },
          }).then(ok, err);
        }
        return next;
      };
      return q;
    };
    await window.adminSetStatus(40, "ordered");
    assert.ok(alerts.some((m) => m.includes("cannot change status after the order is received")));
    assert.equal(window.__sbTables.orders.find((o) => o.id === 40).status, "delivered");
  });

  it("I-O19 an open issue pauses the countdown, and Yes stays disabled until the confirm error", async () => {
    const deliveredAt = new Date().toISOString();
    const { window, document } = await loadApp({
      session: { id: "u1", email: "u1@example.com" },
      tables: {
        meals: [],
        profiles: [],
        ingredient_prices: [],
        orders: [
          {
            id: 39,
            user_id: "u1",
            store: "Tesco",
            total: 10,
            items: { basket: [], meals: [] },
            status: "delivered",
            created_at: "2026-10-01T12:00:00.000Z",
            payment_status: "captured",
            issue_status: "open",
            delivered_at: deliveredAt,
            received_confirmed_at: null,
            received_confirmed_by: null,
          },
          {
            id: 44,
            user_id: "u1",
            email: "c@x.com",
            name: "A",
            postcode: "E2 8AA",
            store: "Waitrose",
            total: 11,
            items: { basket: [], meals: [] },
            status: "delivered",
            created_at: "2026-10-02T12:00:00.000Z",
            payment_status: "captured",
            address: {},
            issue_status: "open",
            delivered_at: deliveredAt,
            received_confirmed_at: null,
            received_confirmed_by: null,
          },
        ],
      },
    });
    const S = window.__plentry.state();
    S.user = { id: "u1", email: "u1@example.com", name: "U" };
    S.orders = window.__sbTables.orders.filter((row) => row.user_id === "u1").map((row) => window.orderFromRow(row));
    window.renderOrders();
    const tesco = [...document.querySelectorAll("#orders-list .meal")].find((c) => c.textContent.includes("Tesco"));
    assert.ok(tesco.textContent.includes("Paused while an issue is open"));
    assert.ok(!tesco.textContent.includes("Auto-completes"));
    assert.equal(tesco.querySelectorAll(".tstep")[3].textContent, "Complete");
    window.__sbTables.__receiptError = "order cannot be confirmed";
    const pending = window.confirmOrderReceived(39);
    assert.equal(document.getElementById("receipt-yes-39").disabled, true);
    await pending;
    const yes = document.getElementById("receipt-yes-39");
    assert.equal(yes.disabled, false);
    assert.ok(document.getElementById("orders-list").textContent.includes("We couldn't confirm this just now, please try again"));
    assert.equal(window.__sbTables.orders.find((o) => o.id === 39).received_confirmed_at, null);
    S.user = { id: "admin", email: "noyouchka.bouchard@gmail.com", name: "Noe" };
    const admins = window.__sbTables.admins;
    window.__sbTables.admins = [{ user_id: "admin" }];
    await window.checkAdminStatus();
    window.__sbTables.admins = admins;
    await window.renderAdmin();
    const admin = document.getElementById("admin-list");
    assert.ok(admin.textContent.includes("Paused while an issue is open"));
    assert.ok(!admin.textContent.includes("h left"));
  });
});
