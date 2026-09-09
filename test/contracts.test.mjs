import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(path.join(ROOT, "index.html"), "utf8");
const pay = readFileSync(path.join(ROOT, "supabase/functions/pay/index.ts"), "utf8");
const ai = readFileSync(path.join(ROOT, "supabase/functions/ai/index.ts"), "utf8");
const checkout = readFileSync(path.join(ROOT, "supabase/functions/checkout/index.ts"), "utf8");
const harden = readFileSync(path.join(ROOT, "supabase/security_hardening_v2.sql"), "utf8");

describe("source contracts", () => {
  it("keeps 5% commission in the client and pay function", () => {
    assert.match(html, /const COMMISSION=0\.05/);
    assert.match(pay, /const COMMISSION = 0\.05/);
    assert.match(html, /const HOLD_BUFFER=0\.15/);
    assert.match(pay, /const HOLD_MULTIPLIER = 1\.15/);
    assert.match(pay, /storePence \* \(1 \+ COMMISSION\)/);
    assert.match(pay, /amount exceeds hold/);
  });

  it("never trusts client orders.total for the Stripe hold", () => {
    assert.match(pay, /NEVER trust the client-written orders\.total/);
    assert.match(pay, /async function serverTotal/);
    assert.match(pay, /capture_method.*manual/);
  });

  it("admin capture is email-gated on the server", () => {
    assert.match(pay, /noyouchka\.bouchard@gmail\.com/);
    assert.match(html, /noyouchka\.bouchard@gmail\.com/);
    assert.match(pay, /ctx\.userClaims\?\.email !== ADMIN_EMAIL/);
  });

  it("new AI meals search TheMealDB by dish name once", () => {
    assert.match(ai, /themealdb\.com\/api\/json\/v1\/1\/search\.php/);
    assert.match(ai, /async function photoForMeal/);
    assert.match(ai, /ignoreDuplicates: true/);
  });

  it("AI meals persist a closed tag set and leave newcoming unreviewed", () => {
    assert.match(ai, /const MEAL_TAGS = \[/);
    assert.match(ai, /function sanitizeTags/);
    assert.match(ai, /tags: sanitizeTags\(m\)/);
    assert.match(ai, /reviewed_at NULL/);
    assert.match(html, /const MEAL_TAGS=/);
    assert.match(html, /function tagsFor\(/);
    assert.match(html, /adminMarkMealReviewed/);
    assert.match(html, /id="admin-newcoming"/);
    assert.match(html, /ai\("advisor",\{messages:advisorMsgs,goals:/);
    assert.equal(html.includes("vegetarian"), true);
    assert.match(html, /"comfort_food"/);
    assert.match(ai, /'comfort_food'/);
  });

  it("order status whitelist is reversible new|ordered|delivered", () => {
    assert.match(harden, /new\.status not in \('new','ordered','delivered'\)/);
    assert.match(html, /adminSetStatus\(\$\{o\.id\},'new'\)/);
    assert.match(html, /adminSetStatus\(\$\{o\.id\},'ordered'\)/);
    assert.match(html, /adminSetStatus\(\$\{o\.id\},'delivered'\)/);
    assert.equal(html.includes("Mark ordered"), false);
    assert.match(html, /Capture \+5%/);
  });

  it("checkout bag redirect stays on plentry.vercel.app", () => {
    assert.match(checkout, /startsWith\('https:\/\/plentry\.vercel\.app'\)/);
  });

  it("XSS helpers exist and meal onclick uses indexes not names", () => {
    assert.match(html, /function esc\(s\)/);
    assert.match(html, /function safeUrl\(u\)/);
    assert.match(html, /onclick="toggleMealAt\(\$\{idx\}\)"/);
    assert.doesNotMatch(html, /onclick="toggleMeal\(\$\{/);
  });

  it("orders hydrate from the table after Stripe return", () => {
    assert.match(html, /async function hydrateOrdersFromDb/);
    assert.match(html, /await handlePaymentReturn\(\)/);
    assert.match(html, /await hydrateOrdersFromDb\(\)/);
  });

  it("advisor add keeps week at prefs.meals", () => {
    assert.match(html, /S\.selected=next\.slice\(0,n\)/);
    assert.match(html, /function addAdvisorMeals/);
  });

  it("Modify and New week load the meals catalog, not meal_options AI", () => {
    assert.match(html, /async function openModify/);
    assert.match(html, /await loadCatalogMeals\(\)/);
    assert.doesNotMatch(html, /ai\("meal_options"/);
    assert.match(html, /ai\("advisor"/);
    assert.match(html, /const STAPLES=/);
    assert.match(html, /function alreadyHaveAt/);
    assert.match(html, /function addBasketFromSelect/);
    assert.match(html, /Confirm this shop/);
  });

  it("pantry is a cupboard have-list of oils and spices, not groceries or AI", () => {
    assert.match(html, /function toggleHaveAt/);
    assert.match(html, /id="pantry-q"/);
    assert.match(html, /id="ob-have-q"/);
    assert.match(html, /"chopped tomatoes"/);
    assert.match(html, /"fresh coriander"/);
    assert.match(html, /function storedRecipe/);
    assert.match(ai, /'chopped tomatoes', 'butter', 'fresh coriander'/);
    assert.match(ai, /ing: m\.ing\.slice\(0, 20\)/);
    assert.doesNotMatch(ai, /plus salt, pepper, basic spices/);
    assert.match(html, /"paprika"/);
    assert.match(html, /"black pepper"/);
    assert.doesNotMatch(html, /Update with AI/);
    assert.doesNotMatch(html, /Scan with AI/);
    assert.doesNotMatch(html, /ai\("parse_pantry"/);
    assert.match(ai, /parse_pantry/);
  });
});
