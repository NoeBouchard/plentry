import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extraMeals, loadApp } from "./harness.mjs";

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
    assert.equal(window.__plentry.HOLD_BUFFER, 0.15);
  });
});

describe("money", () => {
  it("adds 5% then a 15% hold buffer", async () => {
    const { window } = await loadApp();
    assert.equal(window.plentryFee(20), 1);
    assert.equal(window.customerTotal(20), 21);
    assert.equal(window.holdAmount(20), 24.15);
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
    assert.ok(meat.includes("high_protein"));
    assert.ok(meat.includes("meal_prep"));
    assert.ok(meat.includes("gym"));
    assert.ok(!meat.includes("vegan"));
    assert.ok(!meat.includes("vegetarian"));
    const vegan = window.__plentry.tagsFor({
      name: "Chickpea & spinach curry",
      time: 25,
      ing: ["chickpeas", "curry paste", "coconut milk", "spinach", "onions", "rice", "chopped tomatoes"],
    });
    assert.ok(vegan.includes("vegan"));
    assert.ok(vegan.includes("comfort_food"));
    assert.ok(!vegan.includes("meat"));
    const quick = window.__plentry.tagsFor({
      name: "Halloumi fajitas",
      time: 20,
      ing: ["halloumi", "tortillas", "bell peppers", "onions", "yoghurt", "lemons"],
    });
    assert.ok(quick.includes("vegetarian"));
    assert.ok(quick.includes("quick"));
    assert.ok(quick.includes("lunch"));
    assert.ok(window.__plentry.MEAL_TAGS.includes("comfort_food"));
    const stored = window.__plentry.mealTags({
      name: "Anything",
      time: 40,
      ing: ["chicken thighs", "rice"],
      tags: ["dinner", "meat", "gym", "not_a_real_tag"],
    });
    assert.deepEqual(stored, ["dinner", "meat", "gym"]);
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
    assert.ok(document.getElementById("basket-panel").textContent.includes("Cupboard"));
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
    window.showObStep(6);
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
    assert.equal(window.orderStatusCopy({ payment_status: "unpaid", status: 1 }).title, "Awaiting payment");
    assert.equal(window.orderStatusCopy({ payment_status: "authorized", status: 1 }).title, "Confirmed");
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
    assert.ok(html.includes("Capture +5%"));
    assert.ok(!html.includes("Mark ordered"));
    await window.adminSetStatus(4, "delivered");
    assert.equal(window.__sbTables.orders[0].status, "delivered");
    await window.adminSetStatus(4, "new");
    assert.equal(window.__sbTables.orders[0].status, "new");
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
});
