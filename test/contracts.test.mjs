import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(path.join(ROOT, "index.html"), "utf8");
const pay = readFileSync(path.join(ROOT, "supabase/functions/pay/index.ts"), "utf8");
const ai = readFileSync(path.join(ROOT, "supabase/functions/ai/index.ts"), "utf8");
const checkout = readFileSync(path.join(ROOT, "supabase/functions/checkout/index.ts"), "utf8");
const webhook = readFileSync(path.join(ROOT, "supabase/functions/stripe-webhook/index.ts"), "utf8");
const notify = readFileSync(path.join(ROOT, "supabase/functions/notify-order/index.ts"), "utf8");
const harden1 = readFileSync(path.join(ROOT, "supabase/security_hardening.sql"), "utf8");
const harden = readFileSync(path.join(ROOT, "supabase/security_hardening_v2.sql"), "utf8");
const harden3 = readFileSync(path.join(ROOT, "supabase/security_hardening_v3.sql"), "utf8");
const ratelimit = readFileSync(path.join(ROOT, "supabase/functions/_shared/ratelimit.ts"), "utf8");
const adminPol = readFileSync(path.join(ROOT, "supabase/admin_policies.sql"), "utf8");
const ordersPay = readFileSync(path.join(ROOT, "supabase/orders_payment.sql"), "utf8");
const revokeNotify = readFileSync(path.join(ROOT, "supabase/revoke_notify_rpc.sql"), "utf8");

describe("source contracts", () => {
  it("keeps 5% commission in the client and pay function", () => {
    assert.match(html, /const COMMISSION=0\.05/);
    assert.match(pay, /const COMMISSION = 0\.05/);
    assert.match(html, /const HOLD_BUFFER=0\.30/);
    assert.match(pay, /const HOLD_MULTIPLIER = 1\.30/);
    assert.match(pay, /storePence \* \(1 \+ COMMISSION\)/);
    assert.match(pay, /if \(amt > heldPence\) amt = heldPence/);
    assert.doesNotMatch(pay, /error: 'amount exceeds hold'/);
    assert.match(pay, /const MAX_ORDER_GBP = 500/);
    assert.match(harden, /new\.total > 500/);
  });

  it("I-S01 hardening SQL defines the limiter RPC and the orders trigger the functions rely on", () => {
    assert.match(harden1, /create table if not exists public\.rate_limits/);
    assert.match(harden1, /create or replace function public\.check_rate_limit/);
    assert.match(harden1, /grant execute on function public\.check_rate_limit\(text, text, int, int\) to service_role/);
    assert.match(harden1, /revoke all on function public\.check_rate_limit\(text, text, int, int\) from public, anon, authenticated/);
    assert.match(ratelimit, /rpc\('check_rate_limit'/);
    assert.match(harden, /create trigger validate_order/);
    assert.match(harden3, /create trigger validate_order/);
    assert.match(harden3, /before insert or update on public\.orders/);
    assert.match(harden3, /revoke all on function public\.validate_order\(\) from public, anon, authenticated/);
  });

  it("I-O11 orders INSERT forces server-owned money/fulfilment columns; pay refuses to capture without a recorded hold", () => {
    assert.match(harden3, /new\.payment_status := 'unpaid';/);
    assert.match(harden3, /new\.payment_intent := null;/);
    assert.match(harden3, /new\.checkout_session := null;/);
    assert.match(harden3, /new\.amount_held := null;/);
    assert.match(harden3, /new\.amount_captured := null;/);
    assert.match(harden3, /new\.status := 'new';/);
    // The forcing sits inside the INSERT branch, before any value whitelist.
    const insertIdx = harden3.indexOf("if is_insert then");
    const forceIdx = harden3.indexOf("new.payment_status := 'unpaid';");
    const whitelistIdx = harden3.indexOf("new.payment_status not in ('none','unpaid','authorized','captured','canceled')");
    assert.ok(insertIdx > 0 && forceIdx > insertIdx && whitelistIdx > forceIdx);
    // Legacy rows: total/postcode/store/items only re-validated when they change.
    assert.match(harden3, /check_total := is_insert or new\.total is distinct from old\.total/);
    assert.match(harden3, /check_items := is_insert or new\.items is distinct from old\.items/);
    assert.match(pay, /no hold recorded on order/);
    assert.match(pay, /if \(amt > heldPence\)/);
    assert.doesNotMatch(pay, /if \(o\.amount_held && amt >/);
  });

  it("I-O12 pay rebuilds items.basket server-side and Telegram links come from the store whitelist", () => {
    assert.match(pay, /import \{ basketTotal, clean, cleanMeals, cleanRecipes, rebuildBasket \} from '\.\.\/_shared\/orders\.ts'/);
    assert.match(pay, /const rebuilt = rebuildBasket\(items\?\.basket, data \|\| \[\], store\)/);
    assert.match(pay, /update\(\{ total: est, items: priced\.items \}\)/);
    assert.match(pay, /meals: names/);
    assert.match(pay, /recipes: cleanRecipes\(\[\.\.\.catalogRows, \.\.\.clientRecipes\], names\)/);
    assert.match(pay, /\.from\('meals'\)\.select\('name,emoji,time,ing,recipe'\)\.in\('name', names\)/);
    assert.doesNotMatch(pay, /FALLBACK_ITEM_GBP = 2\.50/);
    assert.match(pay, /payment_method_types\[0\]', 'card'/);
    assert.match(notify, /import \{ clean, searchUrl \} from '\.\.\/_shared\/orders\.ts'/);
    assert.match(notify, /const link = searchUrl\(r\.store, label\)/);
    assert.doesNotMatch(notify, /b\.search/);
    assert.match(notify, /\.slice\(0, TELEGRAM_MAX\)/);
  });

  it("I-O13 stripe-webhook surfaces DB errors as 5xx, never regresses a paid order, guards the postcode", () => {
    assert.match(webhook, /import \{ ukPostcode \} from '\.\.\/_shared\/orders\.ts'/);
    assert.match(webhook, /return Response\.json\(\{ error: 'db', what \}, \{ status: 500 \}\)/);
    assert.match(webhook, /if \(readErr\) return dbFail\('read', readErr\)/);
    assert.match(webhook, /if \(error\) return dbFail\('authorize', error\)/);
    assert.match(webhook, /if \(error\) return dbFail\('cancel', error\)/);
    assert.match(webhook, /\.in\('payment_status', \['unpaid', 'none', 'canceled'\]\)/);
    assert.match(webhook, /const postcode = ukPostcode\(delivery && delivery\.postcode\) \|\| row\.postcode/);
    assert.match(webhook, /if \(heldGbp\) update\.amount_held = heldGbp/);
    // Unsigned or malformed events never reach the DB.
    const verifyIdx = webhook.indexOf("verifySignature(");
    const parseIdx = webhook.indexOf("JSON.parse(payload)");
    assert.ok(verifyIdx > 0 && parseIdx > verifyIdx);
  });

  it("I-O14 one open Checkout Session per order (S-09)", () => {
    assert.match(harden3, /add column if not exists checkout_session text/);
    assert.match(pay, /checkout\/sessions\/\$\{encodeURIComponent\(String\(o\.checkout_session\)\)\}\/expire/);
    assert.match(pay, /checkout_session: j\.id \? String\(j\.id\)\.slice\(0, 120\) : null/);
    assert.match(webhook, /checkout_session: sessionId/);
    assert.match(webhook, /checkout_session\.eq\.\$\{sessionId\},checkout_session\.is\.null/);
    assert.match(webhook, /\^cs_\[A-Za-z0-9_\]\+\$/);
  });

  it("I-O15 / I-O16 / I-O18 order tracking: promised slot columns, hollow timeline, issue threads", () => {
    const slotSql = readFileSync(path.join(ROOT, "supabase/orders_delivery_slot.sql"), "utf8");
    assert.match(slotSql, /alter table public\.orders add column if not exists delivery_slot text/);
    assert.match(slotSql, /length\(delivery_slot\) between 1 and 80 and delivery_slot !~ '\[<>\]'/);
    const slotIssue = readFileSync(path.join(ROOT, "supabase/orders_slot_issue.sql"), "utf8");
    assert.match(slotIssue, /alter table public\.orders add column if not exists slot_date date/);
    assert.match(slotIssue, /slot_end = slot_start \+ interval '2 hours'/);
    assert.match(slotIssue, /extract\(hour from slot_start\) in \(8, 10, 12, 14, 16, 18, 20\)/);
    assert.match(slotIssue, /Europe\/London/);
    assert.match(slotIssue, /create table if not exists public\.order_messages/);
    assert.match(slotIssue, /author_role = 'customer'/);
    assert.match(slotIssue, /is_founder_aal2\(\)/);
    assert.match(slotIssue, /issue_status = 'open'/);
    // Customer + Ops both read slot + issue columns; the client bound matches the CHECK.
    assert.match(html, /delivery_slot,slot_date,slot_start,slot_end,issue_status"/);
    assert.match(html, /address,delivery_slot,slot_date,slot_start,slot_end,issue_status"/);
    assert.match(html, /const ETA_DAYS=4;/);
    assert.match(html, /const SLOT_MAX=80;/);
    assert.match(html, /function isUkPhone/);
    assert.match(html, /function validSlot/);
    assert.match(html, /function normSlot\(s\)\{return String\(s==null\?"":s\)\.replace\(\/\[<>\]\/g,""\)/);
    assert.match(html, /function cleanMsg\(s\)\{return String\(s==null\?"":s\)\.replace\(\/\[<>\]\/g,""\)/);
    assert.match(html, /\.tstep::before\{[^}]*background:#fff/);
    assert.match(html, /\.tstep\.done::before\{[^}]*background:var\(--green\)/);
    assert.doesNotMatch(html, /\.tstep\.active::before/);
    // Only the Ops handlers write delivery_slot; edge functions never touch it.
    assert.match(html, /async function adminSaveSlot\(id\)\{\s*if\(!sb\|\|!isAdmin\(\)\)return;/);
    assert.match(html, /async function adminConfirmSlot\(id\)\{\s*if\(!sb\|\|!isAdmin\(\)\)return;/);
    assert.match(html, /const patch=\{delivery_slot:slot\|\|null\};/);
    assert.match(html, /function openIssueThread/);
    assert.match(html, /id="nav-inbox"/);
    assert.match(html, /inboxNav\.style\.display=isAdmin\(\)\?"":"none"/);
    assert.doesNotMatch(pay, /delivery_slot/);
    assert.doesNotMatch(webhook, /delivery_slot/);
    const slotGuard = readFileSync(path.join(ROOT, "supabase/orders_slot_insert_guard.sql"), "utf8");
    assert.match(slotGuard, /new\.delivery_slot := null;/);
    // The store's marketing ETA ("Tomorrow 12:00–13:00") no longer poses as the order ETA anywhere the customer decides or waits.
    assert.match(html, /placed \$\{esc\(o\.date\)\}<\/div>/);
    assert.doesNotMatch(html, /placed \$\{esc\(o\.date\)\}\$\{o\.eta/);
    assert.doesNotMatch(html, /\+5% fee · \$\{s\.eta\}/);
    assert.doesNotMatch(html, /typical \$\{esc\(chosenStore\.eta\)\}/);
    assert.match(html, /arrives in about \$\{ETA_DAYS\} days/);
    // Every ordered dinner gets a recipe button; the method lives on items.recipes (pay snapshots from the catalog).
    assert.match(html, /meals\.map\(\(n,j\)=>`<button class="btn ghost sm" onclick="showRecipeFromOrder\(\$\{oid\},\$\{j\}\)"/);
    assert.match(html, /function orderRecipesPayload\(\)/);
    assert.match(html, /recipes:orderRecipesPayload\(\)/);
    assert.match(html, /showRecipe\(name, recipeFromOrder\(o, name\)\)/);
    assert.match(html, /sb\.from\("meals"\)\.select\([^)]*\)\.eq\("name",key\)\.limit\(1\)/);
    assert.match(notify, /PHONE:/);
    assert.match(notify, /MUST book/);
    assert.match(notify, /order_messages/);
    assert.match(notify, /function fmtIssue/);
  });

  it("I-A04 supabase-js is vendored and pinned; no third-party script at runtime (S-07)", () => {
    const tag = html.match(/<script src="(\/vendor\/supabase-js-([0-9.]+)\.js)"><\/script>/);
    assert.ok(tag, "vendored script tag present");
    const file = path.join(ROOT, tag[1].slice(1));
    assert.ok(existsSync(file), `${tag[1]} exists`);
    // Same-change rule: bumping the bundle means bumping this hash on purpose.
    const sha384 = createHash("sha384").update(readFileSync(file)).digest("hex");
    assert.equal(tag[2], "2.116.0");
    assert.equal(sha384, "88b75d1d32e892987a3a6c28ca27785cac476966bac38d419e8123d2ae683abce660fa4720ab75c328d1780eecfffa4f");
    assert.doesNotMatch(html, /cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/);
    // Every <script src> is same-origin.
    for (const m of html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) assert.match(m[1], /^\/(?!\/)/, m[1]);
  });

  it("I-A05 vercel.json ships CSP + security headers that cover every origin index.html uses (S-08)", () => {
    const cfg = JSON.parse(readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
    const all = cfg.headers.find((h) => h.source === "/(.*)");
    assert.ok(all, "catch-all header rule");
    const get = (k) => all.headers.find((h) => h.key === k)?.value;
    const csp = get("Content-Security-Policy");
    assert.ok(csp, "CSP present");
    const dir = Object.fromEntries(csp.split(";").map((s) => s.trim()).filter(Boolean).map((s) => {
      const [name, ...vals] = s.split(/\s+/);
      return [name, vals];
    }));
    assert.deepEqual(dir["frame-ancestors"], ["'none'"]);
    assert.deepEqual(dir["object-src"], ["'none'"]);
    assert.deepEqual(dir["base-uri"], ["'self'"]);
    assert.ok(dir["script-src"].includes("'self'") && !dir["script-src"].some((v) => /^https?:/.test(v)), "no remote script hosts");
    assert.ok(dir["script-src"].includes("'unsafe-inline'"), "inline app script + onclick handlers");
    assert.ok(!dir["script-src"].includes("'unsafe-eval'"), "no eval");
    assert.ok(dir["img-src"].includes("https:") && dir["img-src"].includes("data:"), "meal photos + MFA QR");
    // Every host the client talks to over fetch/XHR is allowed by connect-src.
    const supa = html.match(/const SUPABASE_URL="([^"]+)"/)[1];
    assert.ok(dir["connect-src"].includes(supa), `connect-src allows ${supa}`);
    const fetched = [...html.matchAll(/fetch\(\s*[`"'](https?:\/\/[^/`"'$]+)/g)].map((m) => m[1]);
    for (const h of fetched) assert.ok(dir["connect-src"].includes(h), `connect-src allows ${h}`);
    assert.equal(get("X-Frame-Options"), "DENY");
    assert.equal(get("X-Content-Type-Options"), "nosniff");
    assert.match(get("Strict-Transport-Security"), /max-age=\d{7,}/);
    assert.match(get("Referrer-Policy"), /strict-origin/);
    assert.match(get("Permissions-Policy"), /camera=\(\)/);
  });

  it("I-A06 static deploy is an allow-list: no source, SQL, tests or vault on plentry.vercel.app (S-17)", () => {
    const ignore = readFileSync(path.join(ROOT, ".vercelignore"), "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
    assert.equal(ignore[0], "/*", "everything excluded first");
    for (const keep of ["!/index.html", "!/sw.js", "!/manifest.json", "!/icons", "!/vendor", "!/vercel.json"]) assert.ok(ignore.includes(keep), keep);
    for (const never of ["!/supabase", "!/doc", "!/test", "!/SPEC.md", "!/README.md", "!/.env.example"]) assert.ok(!ignore.includes(never), `must not ship ${never}`);
    // Every asset index.html / manifest.json reference lives in an allowed path.
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
    for (const ic of manifest.icons) assert.match(ic.src, /^\/icons\//);
    for (const m of html.matchAll(/(?:href|src)="(\/[^"]+)"/g)) assert.match(m[1], /^\/(icons|vendor)\/|^\/(sw\.js|manifest\.json)$/, m[1]);
  });

  it("I-A08 ai: retired tasks 400, advisor sees only published meals, drafts are quota'd per user (S-11)", () => {
    assert.match(ai, /const RETIRED_TASKS = \['parse_pantry', 'meal_options'\]/);
    assert.match(ai, /if \(RETIRED_TASKS\.includes\(task\)\) return Response\.json\(\{ error: 'retired task' \}, \{ status: 400 \}\)/);
    assert.doesNotMatch(ai, /if \(task === 'meal_options'\)/);
    assert.doesNotMatch(ai, /if \(task === 'parse_pantry'\)/);
    assert.doesNotMatch(ai, /You convert a user's free-text description/);
    assert.doesNotMatch(ai, /async function readMealNames/);
    assert.match(ai, /\.not\('reviewed_at', 'is', null\)\.limit\(80\)/);
    assert.match(ai, /const DRAFTS_PER_USER_PER_DAY = 20/);
    assert.match(ai, /allow\(ctx\.supabaseAdmin, 'ai_drafts', String\(uid\), DRAFTS_PER_USER_PER_DAY, 86400, false\)/);
    assert.match(ai, /if \(have\.has\(clean\(m\.name, 60\)\)\) continue/);
    // Only the advisor path persists; recipe never writes.
    assert.match(ai, /if \(task === 'advisor' && signedIn && Array\.isArray\(out\.meals\)\)/);
    assert.equal((ai.match(/writeMeals\(ctx\.supabaseAdmin/g) || []).length, 1);
  });

  it("I-A09 upstream / internal error detail only for signed-in callers (S-15)", () => {
    assert.match(ai, /\.\.\.\(signedIn \? \{ detail: t\.slice\(0, 300\) \} : \{\}\)/);
    assert.match(ai, /\.\.\.\(signedIn \? \{ detail: String\(e\)\.slice\(0, 200\) \} : \{\}\)/);
    assert.match(checkout, /\.\.\.\(ctx\.userClaims \? \{ detail: String\(e\)\.slice\(0, 200\) \} : \{\}\)/);
    assert.doesNotMatch(ai, /detail: t\.slice\(0, 300\) \}, \{ status: 502 \}\)/);
    // anon limiter fails closed
    assert.match(ai, /allow\(ctx\.supabaseAdmin, 'ai', clientIdent\(req, ctx\), 40, 60, signedIn\)/);
  });

  it("I-A10 founder MFA: pay capture can require aal2; admin_mfa.sql gates every founder policy on aal2 (S-06)", () => {
    assert.match(pay, /Deno\.env\.get\('REQUIRE_ADMIN_MFA'\) === '1' && ctx\.jwtClaims\?\.aal !== 'aal2'/);
    assert.doesNotMatch(pay, /userClaims\?\.aal/, "aal is on jwtClaims, not the mapped userClaims");
    assert.match(pay, /error: 'mfa_required'/);
    const emailIdx = pay.indexOf("ctx.userClaims?.email !== ADMIN_EMAIL");
    const mfaIdx = pay.indexOf("REQUIRE_ADMIN_MFA");
    const captureIdx = pay.indexOf("payment_intents/${o.payment_intent}/capture");
    assert.ok(emailIdx > 0 && mfaIdx > emailIdx && captureIdx > mfaIdx, "email, then MFA, then Stripe");
    const mfaSql = readFileSync(path.join(ROOT, "supabase/admin_mfa.sql"), "utf8");
    assert.match(mfaSql, /\(auth\.jwt\(\)->>'aal'\) = 'aal2'/);
    for (const pol of ["admin select all orders", "admin update all orders", "admin update meals review", "admin insert meals", "admin delete meals"]) {
      assert.match(mfaSql, new RegExp(`create policy "${pol}"[\\s\\S]*?is_founder_aal2\\(\\)`), pol);
    }
    // Applied 18 Sep 2026; the header must keep the date and the lock-out warning so nobody re-runs it blind.
    assert.match(mfaSql, /APPLIED 18 Sep 2026/);
    assert.match(mfaSql, /lock yourself out of Ops/);
    assert.match(mfaSql, /supabase secrets unset REQUIRE_ADMIN_MFA/, "roll-back path documented");
    assert.match(html, /function isAdmin\(\)\{return !!\(S\.user&&S\.user\.email===ADMIN_EMAIL\)&&!mfaPending\(\);\}/);
    assert.match(html, /if\(mfaPending\(\)\)openMfaChallenge\(\);/);
    assert.match(html, /r&&r\.error==="mfa_required"/);
    assert.match(html, /window\.__pendingCapture=\{id,storeAmt\}/);
    assert.match(html, /if\(task==="capture"\)/);
    assert.match(html, /sb\.auth\.refreshSession\(\)/);
    assert.match(html, /\/\^data:image\\\/svg\\\+xml\[;,\]\/i\.test\(qr\)/);
    assert.match(html, /id="pr-security"/);
  });

  it("I-A11 the DB-webhook secret lives in Vault, not in function bodies (S-13)", () => {
    const vaultSql = readFileSync(path.join(ROOT, "supabase/webhook_secret_vault.sql"), "utf8");
    assert.match(vaultSql, /vault\.create_secret\(secret, 'order_webhook_secret'/);
    assert.match(vaultSql, /create or replace function public\.order_webhook_secret\(\)/);
    assert.match(vaultSql, /revoke all on function public\.order_webhook_secret\(\) from public, anon, authenticated, service_role/);
    assert.equal((vaultSql.match(/secret text := public\.order_webhook_secret\(\)/g) || []).length, 2, "both trigger fns read from vault");
    assert.doesNotMatch(vaultSql, /substring\(src from 'x-webhook-secret'',''\(\[\^''\]\+\)'\)\s*;\s*perform net\.http_post/);
    assert.match(vaultSql, /alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated/);
  });

  it("I-M08 payApi parses JSON on HTTP errors", () => {
    assert.match(html, /if\(!r\.ok\)return j\|\|\{error:"http",detail:"HTTP "\+r\.status\}/);
  });

  it("I-O03 Telegram fires only when payment_status becomes authorized", () => {
    assert.match(ordersPay, /new\.payment_status = 'authorized'/);
    assert.match(revokeNotify, /drop trigger if exists notify_order_webhook on public\.orders/);
    assert.match(revokeNotify, /drop trigger if exists notify_order_freebeta_webhook on public\.orders/);
    assert.match(notify, /do not shop until paid/);
    assert.match(notify, /Waiting for card hold — do not place this yet/);
    assert.match(html, /Waiting for the customer to pay — do not shop yet/);
  });

  it("I-O07 webhook keeps in-app delivery when line1 exists", () => {
    assert.match(webhook, /prev\.delivery && prev\.delivery\.line1 \? prev\.delivery : fromStripe/);
    assert.match(webhook, /shipping: stripeShip/);
  });

  it("I-O08 pay checkout uses door shipping and Stripe collection only as fallback", () => {
    assert.match(pay, /payment_intent_data\[shipping\]\[address\]\[line1\]/);
    assert.match(pay, /const del = o\.address && o\.address\.delivery/);
    assert.match(pay, /shipping_address_collection\[allowed_countries\]\[0\]/);
    const shippingIdx = pay.indexOf("payment_intent_data[shipping][address][line1]");
    const collectIdx = pay.indexOf("shipping_address_collection[allowed_countries][0]");
    assert.ok(shippingIdx > 0 && collectIdx > shippingIdx);
    assert.match(pay, /\} else \{\s*p\.set\('shipping_address_collection/);
    assert.match(html, /address:\{delivery:d,name:d\.name,phone:d\.phone\}/);
  });

  it("never trusts client orders.total for the Stripe hold", () => {
    assert.match(pay, /NEVER trust the client-written orders\.total/);
    assert.match(pay, /async function serverTotal/);
    assert.match(pay, /capture_method.*manual/);
    assert.match(pay, /billing_address_collection/);
    assert.match(pay, /payment_intent_data\[shipping\]\[address\]\[line1\]/);
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
    assert.match(html, /id="meals-new"/);
    assert.match(html, /id="meals-live"/);
    assert.match(html, /function openMealEditor/);
    assert.match(html, /function toggleMealDetails/);
    assert.match(html, /id="nav-meals"/);
    assert.match(html, /id="scr-meals"/);
    assert.match(html, /function publishedPool\(/);
    assert.match(adminPol, /admin insert meals/);
    assert.match(adminPol, /admin delete meals/);
    assert.match(adminPol, /drop policy if exists "insert meals"/);
    assert.match(html, /function dietPref\(/);
    assert.match(html, /function basketEditsThisWeek\(/);
    assert.doesNotMatch(html, /rankCatalog\(catalog\)\.slice\(0,16\)/);
    assert.doesNotMatch(html, /id="admin-newcoming"/);
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
    assert.match(html, /Charge customer/);
    assert.match(html, /function adminCapPreview/);
    assert.match(html, /Deliver to this address/);
    assert.match(html, /Money received/);
    assert.match(html, /Use a different address/);
  });

  it("I-X02 redirects are exact-origin: checkout bounce == app origin, client only follows checkout.stripe.com (S-10)", () => {
    assert.match(checkout, /const APP_ORIGIN = 'https:\/\/getplentry\.com'/);
    assert.match(checkout, /return x\.origin === APP_ORIGIN \? x\.href\.slice\(0, 300\) : null/);
    assert.doesNotMatch(checkout, /startsWith\('https:\/\/plentry\.vercel\.app'\)/);
    assert.match(html, /function stripeCheckoutUrl\(u\)/);
    assert.match(html, /x\.hostname==="checkout\.stripe\.com"/);
    // Both navigation sites go through the check; nothing else assigns location.href.
    const hrefs = [...html.matchAll(/location\.href=([^;]+);/g)].map((m) => m[1]);
    assert.deepEqual(hrefs, ["payUrl", "payUrl"]);
    assert.doesNotMatch(html, /location\.href=pay\.url/);
  });

  it("I-X03 cloud prefs.budget is normalised on load and escaped at render (S-12)", () => {
    assert.match(html, /S\.prefs\.budget=normBudget\(S\.prefs\.budget,60\);/);
    assert.match(html, /under your £\$\{esc\(S\.prefs\.budget\)\} budget/);
  });

  it("I-A07 password minimum is 8 in the client (S-14; mirror in Supabase Auth settings)", () => {
    assert.match(html, /const PASSWORD_MIN=8;/);
    assert.match(html, /if\(pass\.length<PASSWORD_MIN\)/);
    assert.doesNotMatch(html, /pass\.length<6/);
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
    assert.match(html, /Do NOT keep spices you already have/);
    assert.match(html, /I already have — skip/);
    assert.match(html, /class="meal-bar"/);
    assert.match(html, /id="ob-7"/);
    assert.match(html, /id="pr-tags"/);
    assert.match(html, /const USER_MEAL_TAGS=/);
    assert.match(html, /function toggleUserTag/);
    assert.match(html, /function clampMeals/);
    assert.match(html, /function deliveryFrom/);
    assert.match(html, /Deliver to this address/);
    assert.match(html, /id="pr-del-line1"/);
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

  it("MEAL_TAGS: 11-tag closed set is identical in index.html, ai/index.ts, and meals_tags_shape CHECK", () => {
    const htmlMatch = html.match(/const MEAL_TAGS=\[([^\]]+)\]/);
    assert.ok(htmlMatch, "MEAL_TAGS found in index.html");
    const htmlTags = JSON.parse("[" + htmlMatch[1] + "]").sort();
    
    const aiMatch = ai.match(/const MEAL_TAGS = \[([\s\S]*?)\] as const/);
    assert.ok(aiMatch, "MEAL_TAGS found in ai/index.ts");
    const aiTags = aiMatch[1].split(",").map((s) => s.trim().replace(/^['"]/g, "").replace(/['"]$/g, "")).filter(Boolean).sort();
    
    const migration = readFileSync(path.join(ROOT, "supabase/meals_categories_tags_ingredients_v2.sql"), "utf8");
    const checkMatch = migration.match(/tags <@ '\[([^\]]+)\]'/s);
    assert.ok(checkMatch, "tags CHECK constraint found in migration");
    const checkTags = JSON.parse("[" + checkMatch[1] + "]").sort();
    
    const expected = ["comfort_food", "dinner", "fish", "high_protein", "low_calorie", "low_carb", "meal_prep", "meat", "quick", "vegan", "vegetarian"];
    assert.deepEqual(htmlTags, expected, "index.html MEAL_TAGS matches expected");
    assert.deepEqual(aiTags, expected, "ai/index.ts MEAL_TAGS matches expected");
    assert.deepEqual(checkTags, expected, "CHECK constraint tags match expected");
  });

  it("MEAL_CATEGORIES: 7 categories are identical in index.html, ai/index.ts, and meals_category_check CHECK", () => {
    const htmlMatch = html.match(/const MEAL_CATEGORIES=\[([^\]]+)\]/);
    assert.ok(htmlMatch, "MEAL_CATEGORIES found in index.html");
    const htmlCats = JSON.parse("[" + htmlMatch[1] + "]").sort();
    
    const aiMatch = ai.match(/const MEAL_CATEGORIES = \[([\s\S]*?)\] as const/);
    assert.ok(aiMatch, "MEAL_CATEGORIES found in ai/index.ts");
    const aiCats = aiMatch[1].split(",").map((s) => s.trim().replace(/^['"]/g, "").replace(/['"]$/g, "")).filter(Boolean).sort();
    
    const migration = readFileSync(path.join(ROOT, "supabase/meals_categories_tags_ingredients_v2.sql"), "utf8");
    const checkMatch = migration.match(/category in \(([^)]+)\)/);
    assert.ok(checkMatch, "category CHECK constraint found in migration");
    const checkCats = checkMatch[1].split(",").map((s) => s.trim().replace(/^['"]/g, "").replace(/['"]$/g, "")).filter(Boolean).sort();
    
    const expected = ["curry_stew", "eggs", "oven_bake", "pasta", "rice_bowl", "salad", "tacos_wraps"];
    assert.deepEqual(htmlCats, expected, "index.html MEAL_CATEGORIES matches expected");
    assert.deepEqual(aiCats, expected, "ai/index.ts MEAL_CATEGORIES matches expected");
    assert.deepEqual(checkCats, expected, "CHECK constraint categories match expected");
  });

  it("CATALOG: 46 ingredient keys are identical in index.html INGREDIENTS, ai/index.ts, and _shared/orders.ts", () => {
    const htmlMatch = html.match(/const INGREDIENTS=\{([\s\S]*?)\};/);
    assert.ok(htmlMatch, "INGREDIENTS found in index.html");
    const htmlKeys = [...htmlMatch[1].matchAll(/"([^"]+)":/g)].map((m) => m[1]).sort();
    
    const aiMatch = ai.match(/const CATALOG = \[([\s\S]*?)\]/);
    assert.ok(aiMatch, "CATALOG found in ai/index.ts");
    const aiKeys = aiMatch[1].split(",").map((s) => s.trim().replace(/^['"]/g, "").replace(/['"]$/g, "")).filter(Boolean).sort();
    
    const orders = readFileSync(path.join(ROOT, "supabase/functions/_shared/orders.ts"), "utf8");
    const ordersMatch = orders.match(/export const CATALOG = \[([\s\S]*?)\]/);
    assert.ok(ordersMatch, "CATALOG found in _shared/orders.ts");
    const ordersKeys = ordersMatch[1].split(",").map((s) => s.trim().replace(/^['"]/g, "").replace(/['"]$/g, "")).filter(Boolean).sort();
    
    assert.equal(htmlKeys.length, 46, "index.html has 46 ingredient keys");
    assert.equal(aiKeys.length, 46, "ai/index.ts has 46 catalog keys");
    assert.equal(ordersKeys.length, 46, "_shared/orders.ts has 46 catalog keys");
    assert.deepEqual(htmlKeys, aiKeys, "index.html INGREDIENTS keys match ai CATALOG");
    assert.deepEqual(aiKeys, ordersKeys, "ai CATALOG matches _shared/orders CATALOG");
  });
});
