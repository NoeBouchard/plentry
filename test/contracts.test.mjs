import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(path.join(ROOT, "index.html"), "utf8");
const pay = readFileSync(path.join(ROOT, "supabase/functions/pay/index.ts"), "utf8");
const capture = readFileSync(path.join(ROOT, "supabase/functions/_shared/capture.ts"), "utf8");
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
    assert.match(capture, /export const COMMISSION = 0\.05/);
    assert.match(pay, /import \{ COMMISSION, runCapture, runReconcile \} from '\.\.\/_shared\/capture\.ts'/);
    assert.match(html, /const HOLD_BUFFER=0\.30/);
    assert.match(pay, /const HOLD_MULTIPLIER = 1\.30/);
    assert.match(capture, /storePence \* 105 \/ 100/);
    assert.match(capture, /Math\.min\(grossPence, holdPence\)/);
    assert.doesNotMatch(pay, /error: 'amount exceeds hold'/);
    assert.doesNotMatch(capture, /error: 'amount exceeds hold'/);
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
    assert.match(capture, /no hold recorded on order/);
    assert.match(capture, /Math\.min\(grossPence, holdPence\)/);
    assert.doesNotMatch(capture, /if \(o\.amount_held && amt >/);
  });

  it("I-O12 pay rebuilds items.basket server-side and Telegram links come from the store whitelist", () => {
    assert.match(pay, /import \{ basketTotal, clean, cleanMeals, cleanRecipes, rebuildBasket \} from '\.\.\/_shared\/orders\.ts'/);
    assert.match(pay, /import \{ PACKS, SEASONINGS, basketFor, normServings, storePacksFromPrices \} from '\.\.\/_shared\/portions\.ts'/);
    assert.match(pay, /const packs = basketFor\(weekMeals, servings, ticks, PACKS, false, storePacksFromPrices\(data \|\| \[\]\)\)/);
    assert.match(pay, /const rebuilt = rebuildBasket\(rawBasket, data \|\| \[\], store\)/);
    assert.match(pay, /update\(\{ total: est, items: priced\.items \}\)/);
    assert.match(pay, /meals: names/);
    assert.match(pay, /recipes: cleanRecipes\(\[\.\.\.catalogRows, \.\.\.clientRecipes\], names\)/);
    assert.match(pay, /\.from\('meals'\)\.select\('name,emoji,time,ing,recipe,portions'\)\.in\('name', names\)/);
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
    assert.match(html, /cols\+","\+receipt/);
    assert.match(html, /delivered_at,received_confirmed_at,received_confirmed_by/);
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
    assert.match(html, /showRecipe\(name, recipeFromOrder\(o, name\), normServings\(o\.servings\|\|2\)\)/);
    assert.match(html, /sb\.from\("meals"\)\.select\([^)]*\)\.eq\("name",key\)\.limit\(1\)/);
    assert.match(notify, /PHONE:/);
    assert.match(notify, /MUST book/);
    assert.match(notify, /order_messages/);
    assert.match(notify, /function fmtIssue/);
  });

  it("I-O16 the slot step, its render, and the insert payload stay, with no default day", () => {
    assert.match(html, /id="slot-days"/);
    assert.match(html, /id="slot-wins"/);
    assert.match(html, /class="slot-step"/);
    assert.match(html, /\$\{slotPickerHtml\(\)\}/);
    assert.match(html, /from\("orders"\)\.insert\(\{[\s\S]*?slot_date:slot\.slot_date,slot_start:slot\.slot_start,slot_end:slot\.slot_end,/);
    assert.doesNotMatch(html, /chosen\.date\|\|days\[0\]/);
    assert.match(html, /id="confirm-btn" \$\{slotReady\?"":"disabled"\}/);
    assert.match(html, /if\(startNorm&&!date\)/);
    assert.match(html, /aria-describedby="slot-prompt"/);
    assert.match(html, /Choose a delivery day and time to continue/);
    assert.match(html, /aria-pressed="\$\{day===ymd\?"true":"false"\}"/);
    assert.match(html, /aria-pressed="\$\{on\?"true":"false"\}"/);
    assert.match(html, /if\(date&&!slotDays\(\)\.includes\(date\)\)window\.__chosenSlot=null/);
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
    const mfaIdx = pay.indexOf("Deno.env.get('REQUIRE_ADMIN_MFA') === '1'");
    const captureIdx = pay.indexOf("payment_intents/${encodeURIComponent(pi)}/capture");
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
    assert.match(html, /const ADMIN_EMAIL="noyouchka.bouchard@gmail.com"/);
    assert.match(html, /function isAdmin\(\)\{return !!\(S\.user&&adminStatus\)&&!mfaPending\(\);\}/);
    assert.match(html, /S\.user\.email===ADMIN_EMAIL/);
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
    assert.match(html, /S\.prefs\.budget=normBudget\(S\.prefs\.budget,null\);/);
    assert.doesNotMatch(html, /normBudget\(S\.prefs\.budget,60\)/);
    assert.match(html, /budget==null\?"":/);
    assert.match(html, /under your £\$\{esc\(budget\)\} budget/);
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

  it("meal ingredient prices are stored by the migration and not written onto ingredient_prices", () => {
    const sql = readFileSync(path.join(ROOT, "supabase/meal_ingredient_prices.sql"), "utf8");
    assert.match(sql, /create table if not exists public\.meal_ingredient_prices/);
    assert.match(sql, /servings in \(2, 4, 6\)/);
    assert.match(sql, /private\.refresh_meal_ingredient_prices/);
    assert.match(sql, /incomplete/);
    assert.match(sql, /NOT APPLIED to production/);
    assert.doesNotMatch(sql, /update public\.ingredient_prices/i);
    assert.match(html, /function mealIngredientQuote/);
    assert.match(html, /function splitMealPence/);
    assert.match(html, /largest remainder/);
    assert.doesNotMatch(html, /id="week-ingredients"/);
    assert.doesNotMatch(html, /id="week-price-note"/);
    assert.doesNotMatch(html, /Dinner prices are the ingredients used/);
    assert.doesNotMatch(html, /Ingredients ~£/);
    assert.match(html, /Price soon/);
    assert.match(html, /From your cupboard/);
    assert.match(html, /Basket £/);
  });

  it("advisor add keeps week at prefs.meals", () => {
    assert.match(html, /S\.selected=next\.slice\(0,n\)/);
    assert.match(html, /function addAdvisorMeals/);
  });

  function sourceFn(src, name) {
    const start = src.indexOf("function " + name + "(");
    assert.ok(start >= 0, name);
    let i = src.indexOf("{", start);
    let depth = 0;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) return src.slice(start, i + 1);
      }
    }
    assert.fail("unclosed " + name);
  }

  it("I-W08 rankCatalog sorts by score, seeded key, then id, with no Math.random in the comparator", () => {
    const rank = sourceFn(html, "rankCatalog");
    const cmp = sourceFn(html, "compareRankedMeals");
    assert.doesNotMatch(rank, /Math\.random/);
    assert.doesNotMatch(cmp, /Math\.random/);
    assert.match(rank, /rows\.sort\(compareRankedMeals\)/);
    assert.match(rank, /mealTieKey\(seed,m\)/);
    assert.match(cmp, /a\.s!==b\.s/);
    assert.match(cmp, /a\.k<b\.k/);
    assert.match(cmp, /a\.id<b\.id/);
    assert.match(html, /function mulberry32\(/);
    assert.match(html, /function setWeekSeed\(/);
    assert.match(html, /function weekSeed\(/);
    assert.match(html, /function advanceWeekSeed\(/);
    assert.match(html, /const WEEK_SEED_KEY="plentry_week_seed"/);
    assert.match(html, /new URLSearchParams\(location\.search\)\.get\("seed"\)/);
    assert.match(html, /setWeekSeed,weekSeed,rankCatalog/);
    assert.doesNotMatch(rank, /Math\.random/);
    assert.doesNotMatch(html, /Math\.random\(\)/);
    assert.doesNotMatch(html, /const shuffle=/);
    assert.match(sourceFn(html, "loadMenuOptions"), /advanceWeekSeed\(\);\s*autoPickWeek\(\)/);
    assert.match(html, /const MODIFY_FIRST=6;/);
    assert.match(html, /const MODIFY_MORE=4;/);
  });

  it("Modify and New week load the meals catalog, not meal_options AI", () => {
    assert.match(html, /async function openModify/);
    assert.match(html, /await loadCatalogMeals\(\)/);
    assert.match(html, /const MODIFY_FIRST=6;/);
    assert.match(html, /const MODIFY_MORE=4;/);
    assert.match(html, /function refreshModify/);
    assert.match(html, /function modifyCandidates/);
    assert.match(html, /function mealIngredientQuote/);
    assert.doesNotMatch(html, /ai\("meal_options"/);
    assert.match(html, /ai\("advisor"/);
    assert.match(html, /const STAPLES=/);
    assert.match(html, /function alreadyHaveAt/);
    assert.match(html, /function addBasketFromSelect/);
    assert.match(html, /Confirm this shop/);
    assert.match(html, /Do NOT keep spices you already have/);
    assert.match(html, /I already have — skip/);
    assert.match(html, /class="meal-bar"/);
    assert.match(html, /id="ob-6"/);
    assert.doesNotMatch(html, /id="ob-7"/);
    assert.doesNotMatch(html, /What's your budget/);
    assert.doesNotMatch(html, /What do you need help with/);
    assert.match(html, /What you eat/);
    assert.match(html, /mealFitsDiet\(m\)/);
    assert.match(html, /id="pr-tags"/);
    assert.match(html, /const USER_MEAL_TAGS=/);
    assert.match(html, /function toggleUserTag/);
    assert.match(html, /function clampMeals/);
    assert.match(html, /function deliveryFrom/);
    assert.match(html, /Deliver to this address/);
    assert.match(html, /id="pr-del-line1"/);
  });

  it("I-C04 every cupboard item maps to a same-origin SVG or the fallback", () => {
    const mapMatch = html.match(/const CUPBOARD_ICONS=\{([^}]+)\}/);
    assert.ok(mapMatch, "CUPBOARD_ICONS");
    const map = {};
    for (const m of mapMatch[1].matchAll(/"([^"]+)":"([^"]+)"/g)) map[m[1]] = m[2];
    const staples = [...html.match(/const STAPLES=\[([^\]]+)\]/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const seasonings = [...html.match(/const SEASONINGS=\[([^\]]+)\]/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const dir = path.join(ROOT, "vendor/cupboard");
    const fallback = "fallback.svg";
    assert.equal(html.match(/const CUPBOARD_ICON_FALLBACK="([^"]+)"/)[1], fallback);
    assert.match(html, /const CUPBOARD_ICON_DIR="\/vendor\/cupboard\/"/);
    assert.ok(existsSync(path.join(dir, fallback)), fallback);
    const names = [...new Set([...staples, ...seasonings])];
    assert.ok(names.length >= 15, "staples plus garam masala");
    const used = new Set([fallback]);
    for (const name of names) {
      const file = map[name];
      assert.ok(file, `${name} has a picture`);
      assert.match(file, /^[a-z0-9-]+\.svg$/, file);
      assert.notEqual(file, fallback, `${name} is not the generic jar`);
      const svg = readFileSync(path.join(dir, file), "utf8");
      assert.match(svg, /<svg\b/);
      assert.doesNotMatch(svg.replaceAll("http://www.w3.org/2000/svg", ""), /https?:\/\//, file);
      assert.doesNotMatch(svg, /url\s*\(\s*['"]?https?:/i, file);
      used.add(file);
    }
    assert.equal(map.rice, undefined, "a grocery with no picture is not in the map");
    const onDisk = readdirSync(dir).filter((f) => f.endsWith(".svg"));
    assert.deepEqual(onDisk.slice().sort(), [...used].sort());
    let bytes = 0;
    for (const file of onDisk) {
      const svg = readFileSync(path.join(dir, file), "utf8");
      assert.doesNotMatch(svg.replaceAll("http://www.w3.org/2000/svg", ""), /https?:\/\//, file);
      bytes += statSync(path.join(dir, file)).size;
    }
    assert.ok(bytes < 32 * 1024, `cupboard SVGs are ${bytes} bytes`);
    const helper = html.slice(html.indexOf("function cupboardIconSrc"), html.indexOf("function cupboardIconHtml"));
    assert.match(helper, /CUPBOARD_ICON_DIR\+cupboardIconFile\(name\)/);
    assert.doesNotMatch(helper, /https?:\/\//);
    assert.match(html, /alt="" aria-hidden="true"/);
    assert.match(html, /cupboardIconHtml\(n,40\)/);
    assert.match(html, /width="\$\{n\}" height="\$\{n\}"/);
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

  it("CATALOG: 46 ingredient keys in INGREDIENTS_FALLBACK match ai/index.ts and _shared/orders.ts", () => {
    const htmlMatch = html.match(/const INGREDIENTS_FALLBACK=\{([\s\S]*?)\};/);
    assert.ok(htmlMatch, "INGREDIENTS_FALLBACK found in index.html");
    const htmlKeys = [...htmlMatch[1].matchAll(/"([^"]+)":/g)].map((m) => m[1]).sort();
    
    const aiMatch = ai.match(/const CATALOG = \[([\s\S]*?)\]/);
    assert.ok(aiMatch, "CATALOG found in ai/index.ts");
    const aiKeys = aiMatch[1].split(",").map((s) => s.trim().replace(/^['"]/g, "").replace(/['"]$/g, "")).filter(Boolean).sort();
    
    const orders = readFileSync(path.join(ROOT, "supabase/functions/_shared/orders.ts"), "utf8");
    const ordersMatch = orders.match(/export const CATALOG = \[([\s\S]*?)\]/);
    assert.ok(ordersMatch, "CATALOG found in _shared/orders.ts");
    const ordersKeys = ordersMatch[1].split(",").map((s) => s.trim().replace(/^['"]/g, "").replace(/['"]$/g, "")).filter(Boolean).sort();
    
    assert.equal(htmlKeys.length, 46, "index.html has 46 ingredient keys in fallback");
    assert.equal(aiKeys.length, 46, "ai/index.ts has 46 catalog keys");
    assert.equal(ordersKeys.length, 46, "_shared/orders.ts has 46 catalog keys");
    assert.deepEqual(htmlKeys, aiKeys, "index.html INGREDIENTS_FALLBACK keys match ai CATALOG");
    assert.deepEqual(aiKeys, ordersKeys, "ai CATALOG matches _shared/orders CATALOG");
  });

  it("I-A12 admins table + aal2 gates orders, meals, and ingredient prices; non-admin and aal1 cannot write", () => {
    const sql = readFileSync(path.join(ROOT, "supabase/admin_roles.sql"), "utf8");
    assert.match(sql, /create table if not exists public\.admins/);
    assert.match(sql, /create or replace function public\.is_admin\(\) returns boolean/);
    assert.match(sql, /security definer set search_path = public/);
    assert.match(sql, /create or replace function public\.is_admin_aal2\(\) returns boolean/);
    assert.match(sql, /select public\.is_admin\(\)\s+and \(auth\.jwt\(\)->>'aal'\) = 'aal2'/);
    assert.match(sql, /grant execute on function public\.is_admin_aal2\(\) to authenticated/);
    assert.match(sql, /revoke all on function public\.is_admin_aal2\(\) from public, anon, authenticated/);
    for (const pol of ["admin select all orders", "admin update all orders", "admin update meals review", "admin insert meals"]) {
      assert.match(sql, new RegExp(`create policy "${pol}"[\\s\\S]*?is_admin_aal2\\(\\)`), pol);
    }
    assert.match(sql, /drop policy if exists "admins insert admins" on public\.admins/);
    assert.doesNotMatch(sql, /create policy "admins insert admins"/);
    assert.doesNotMatch(sql, /create policy "admins update admins"/);
    assert.doesNotMatch(sql, /create policy "admins delete admins"/);
    const adminsRls = sql.slice(sql.indexOf("alter table public.admins enable row level security"), sql.indexOf("-- Orders / meals writes"));
    assert.doesNotMatch(adminsRls, /for insert|for update|for delete/);
    assert.match(sql, /drop policy if exists "admin delete meals" on public\.meals/);
    assert.doesNotMatch(sql, /create policy "admin delete meals"/);
    const mealsPol = sql.slice(sql.indexOf("-- Orders / meals writes"), sql.indexOf("-- Prices stay world-readable"));
    assert.doesNotMatch(mealsPol, /for delete/);
    assert.doesNotMatch(html, /function adminDeleteMeal/);
    assert.doesNotMatch(html, /adminDeleteMeal\(/);
    assert.doesNotMatch(html, /from\("meals"\)\.delete\(/);
    assert.doesNotMatch(html, /from\("admins"\)\.insert\(/);
    assert.doesNotMatch(html, /Add admin/);
    assert.match(html, /saveMealEditor\('unpublish'\)/);
    assert.doesNotMatch(sql, /drop policy if exists "read meals"/);
    assert.match(sql, /create policy "admin read meals" on public\.meals[\s\S]*for select to authenticated[\s\S]*is_admin_aal2\(\)/);
    assert.match(sql, /for select to authenticated\s+using \(public\.is_admin_aal2\(\)\)/);
    assert.match(sql, /create policy "admin insert ingredient_prices"/);
    assert.match(sql, /create policy "admin update ingredient_prices"/);
    assert.match(sql, /create policy "admin delete ingredient_prices"/);
    assert.match(sql, /for insert to authenticated\s+with check \(public\.is_admin_aal2\(\)\)/);
    // Required fields and invariant checks live in the database, not only the client.
    assert.match(sql, /create or replace function public\.validate_meal_write\(\)/);
    const mealFn = sql.slice(sql.indexOf("function public.validate_meal_write"), sql.indexOf("function public.validate_ingredient_price"));
    const priceFn = sql.slice(sql.indexOf("function public.validate_ingredient_price"));
    // Service role and postgres (auth.uid() is null) skip both triggers. Regex only — not run against a database.
    assert.match(mealFn, /if auth\.uid\(\) is null then\s+return new;/);
    assert.match(priceFn, /if auth\.uid\(\) is null then\s+return new;/);
    assert.match(mealFn, /expect = '' then\s+continue;/);
    assert.doesNotMatch(mealFn, /seasonings stay 1 pack/);
    assert.doesNotMatch(priceFn, /seasonings stay 1 pack/);
    assert.match(sql, /portion unit for % must be %/);
    assert.match(sql, /a published meal needs at least one instruction step/);
    assert.match(sql, /create or replace function public\.validate_ingredient_price\(\)/);
    assert.match(sql, /shop must be tesco, sainsburys, asda, or waitrose/);
    assert.match(priceFn, /tg_op = 'INSERT'[\s\S]*category is required/);
    assert.match(priceFn, /p\.slug = new\.slug and p\.category = new\.category/);
    assert.match(sql, /price is required/);
    assert.match(sql, /add column if not exists pack_qty numeric/);
    assert.match(sql, /add column if not exists pack_unit text/);
    assert.match(html, /sb\.rpc\("is_admin"\)/);
    assert.match(html, /function isAdmin\(\)\{return !!\(S\.user&&adminStatus\)&&!mfaPending\(\);\}/);
    assert.match(html, /function ingredientAddError/);
    assert.match(html, /return "Pick a shop\."/);
    assert.match(html, /return "Pick a category\."/);
    assert.match(html, /return "Enter a price\."/);
    assert.match(html, /Portion unit for "/);
    assert.match(html, /not yet usable in baskets/);
    assert.match(html, /id="nav-ingredients"/);
    assert.match(html, /update\(patch\)\.eq\("id",fields\.existing\.id\)/);
    assert.match(html, /slug:groupSlug/);
    assert.doesNotMatch(html, /onConflict:"slug,store"/);
    assert.doesNotMatch(html, /product_name:g\.name/);
  });

  it("I-A12 new ingredient keys stay out of the code catalog until pay and basketFor read the database", () => {
    assert.match(html, /const INGREDIENTS_FALLBACK=/);
    assert.match(html, /let INGREDIENTS=\{\.\.\.INGREDIENTS_FALLBACK\}/);
    assert.match(html, /function catalogKeyUsable\(key\)/);
    assert.doesNotMatch(html, /INGREDIENTS\[key\]=\{unit:row\.pack_size/);
    assert.doesNotMatch(html, /async function loadIngredientPrices\(\)/);
  });
});

function stripSqlComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

function sqlBody(name) {
  return readFileSync(path.join(ROOT, "supabase", name), "utf8");
}

describe("I-A13 published meals read (applied on prod 25 Oct 2026)", () => {
  const raw = sqlBody("meals_read_published.sql");
  const active = stripSqlComments(raw);
  const schema = sqlBody("schema.sql");
  const adminRoles = sqlBody("admin_roles.sql");

  function anonColumns() {
    const grants = [...active.matchAll(/grant select\s*\(([^)]+)\)\s*on\s+public\.meals\s+to\s+anon/gi)];
    assert.equal(grants.length, 1);
    return grants[0][1].split(",").map((s) => s.trim().replace(/"/g, "")).filter(Boolean);
  }

  it("I-A13 policy is published-only for anon and authenticated, in a transaction, and not a migration", () => {
    assert.equal(existsSync(path.join(ROOT, "supabase/migrations")), false);
    assert.equal(existsSync(path.join(ROOT, "supabase/meals_read_published.sql")), true);
    assert.match(raw, /APPLIED to prod 25 Oct 2026 12:59 GMT/);
    assert.doesNotMatch(raw, /Not applied/);
    const begin = active.indexOf("begin;");
    const commit = active.lastIndexOf("commit;");
    assert.ok(begin >= 0 && commit > begin);
    const body = active.slice(begin, commit);
    assert.match(body, /drop policy if exists "read meals" on public\.meals/);
    assert.match(body, /drop policy if exists "read published meals" on public\.meals/);
    assert.match(body, /create policy "read published meals"\s+on public\.meals\s+for select\s+to anon,\s*authenticated\s+using \(reviewed_at is not null\)/);
    assert.equal([...active.matchAll(/create policy/gi)].length, 1);
    assert.doesNotMatch(active, /create policy "read meals"/);
    assert.match(raw, /Rollback/);
    assert.match(raw, /create policy "read meals" on public\.meals/);
    assert.match(raw, /using \(auth\.role\(\) = 'authenticated'\)/);
    assert.match(raw, /grant select on public\.meals to anon;/);
    assert.match(schema, /applied in the SQL editor after PR #28/);
    assert.match(schema, /Any new public catalogue column on public\.meals must be added to the anon/);
    assert.match(schema, /APPLIED to prod 26 Oct 2026 ~15:42 GMT: supabase\/meals_followups\.sql/);
    assert.doesNotMatch(schema, /PENDING, NOT APPLIED: supabase\/meals_followups\.sql/);
    assert.doesNotMatch(schema, /PENDING, NOT APPLIED: supabase\/meals_read_published\.sql/);
    assert.match(schema, /APPLIED to prod 25 Oct 2026 12:59 GMT/);
    assert.match(schema, /supabase\/meals_read_published\.sql/);
    assert.match(schema, /create policy "read meals" on public\.meals/);
  });

  it("I-A13 anon column allow-list excludes created_by, source, and created_at", () => {
    const cols = anonColumns();
    assert.deepEqual(cols, [
      "id",
      "name",
      "emoji",
      "time",
      "ing",
      "image_url",
      "recipe",
      "tags",
      "reviewed_at",
      "portions",
      "category",
    ]);
    for (const banned of ["created_by", "source", "created_at"]) {
      assert.equal(cols.includes(banned), false, banned);
    }
    assert.match(active, /revoke select on public\.meals from anon/);
    assert.doesNotMatch(active, /grant select on public\.meals to anon/);
  });

  it("I-A13 leaves admin read, insert, and update policies untouched", () => {
    const drops = [...active.matchAll(/drop policy if exists "([^"]+)"/gi)].map((m) => m[1]);
    assert.deepEqual(drops.sort(), ["read meals", "read published meals"]);
    assert.doesNotMatch(active, /admin read meals|admin insert meals|admin update meals|admin delete meals|is_admin_aal2/);
    assert.match(adminRoles, /create policy "admin read meals" on public\.meals\s+for select to authenticated\s+using \(public\.is_admin_aal2\(\)\)/);
    assert.match(adminRoles, /create policy "admin insert meals" on public\.meals/);
    assert.match(adminRoles, /create policy "admin update meals review" on public\.meals/);
    assert.doesNotMatch(adminRoles, /drop policy if exists "read meals"/);
  });

  it("I-A13 anon meals queries in index.html only reference the anon allow-list", () => {
    const allow = new Set(anonColumns());
    const banned = new Set(["created_by", "source", "created_at"]);
    const adminStart = html.indexOf("async function loadAdminMeals(");
    const adminEnd = html.indexOf("function renderMeals(");
    assert.ok(adminStart >= 0 && adminEnd > adminStart);
    const direct = [...html.matchAll(/\.from\("meals"\)\.select\("([^"]*)"\)/g)];
    assert.ok(direct.length >= 4);
    for (const hit of direct) {
      const inAdmin = hit.index > adminStart && hit.index < adminEnd;
      assert.equal(inAdmin, false);
      const cols = hit[1].split(",").map((s) => s.trim()).filter(Boolean);
      assert.ok(cols.length > 0);
      assert.equal(cols.includes("*"), false);
      for (const col of cols) {
        assert.equal(allow.has(col), true, col);
        assert.equal(banned.has(col), false, col);
      }
    }
    assert.doesNotMatch(html, /\.from\("meals"\)\.select\(\s*["']\*["']\s*\)/);
    assert.doesNotMatch(html, /\.from\('meals'\)/);

    function between(start, end) {
      const i = html.indexOf(start);
      const j = html.indexOf(end, i + start.length);
      assert.ok(i >= 0 && j > i, start);
      return html.slice(i, j);
    }
    const catalog = between("async function loadCatalogMeals()", "function itemUnitPrice(");
    const byName = between("async function catalogMealByName(", "function parseStepWithHeading(");
    for (const src of [catalog, byName]) {
      const lists = [...src.matchAll(/\.select\("([^"]*)"\)/g)];
      assert.ok(lists.length >= 1);
      for (const list of lists) {
        for (const col of list[1].split(",").map((s) => s.trim()).filter(Boolean)) {
          assert.equal(allow.has(col), true, col);
          assert.equal(banned.has(col), false, col);
        }
      }
    }
    assert.match(catalog, /\.from\("meals"\)\.select\("id,name,emoji,time,ing,image_url,recipe,tags,reviewed_at,portions,category"\)/);
    assert.match(catalog, /\.from\("meals"\)\.select\("id,name,emoji,time,ing,image_url,reviewed_at,category"\)/);
    assert.match(catalog, /\.from\("meals"\)\.select\("id,name,emoji,time,ing,reviewed_at,category"\)/);
    assert.match(byName, /\.from\("meals"\)\.select\("id,name,emoji,time,ing,image_url,recipe,tags,reviewed_at,portions,category"\)/);

    const adminFn = html.slice(adminStart, adminEnd);
    assert.match(adminFn, /if\(!isAdmin\(\)\)/);
    assert.match(adminFn, /source,created_at/);
    assert.match(adminFn, /\.from\("meals"\)\.select\(cols\)/);
  });
});

describe("I-W09 hidden meals stay off the customer catalog", () => {
  it("I-W09 catalog fallbacks select id and reviewed_at", () => {
    const start = html.indexOf("async function loadCatalogMeals()");
    const end = html.indexOf("function itemUnitPrice(", start);
    assert.ok(start >= 0 && end > start);
    const catalog = html.slice(start, end);
    const lists = [...catalog.matchAll(/\.select\("([^"]*)"\)/g)];
    assert.equal(lists.length, 3);
    for (const list of lists) {
      const cols = list[1].split(",").map((s) => s.trim());
      assert.equal(cols.includes("id"), true, list[1]);
      assert.equal(cols.includes("reviewed_at"), true, list[1]);
    }
    assert.match(lists[1][1], /^id,/);
    assert.match(lists[2][1], /^id,/);
    assert.match(lists[1][1], /reviewed_at/);
    assert.match(lists[2][1], /reviewed_at/);
    assert.match(catalog, /return merged\.filter\(isPublished\)/);
    assert.match(catalog, /const merged=catalogFromDb\?dbMeals:seed/);
    assert.doesNotMatch(catalog, /dbMeals\.concat\(seed/);
    assert.match(html, /We've sent this idea to our kitchen to review\./);
    assert.match(html, /id="advisor-review-notice"/);
    assert.match(html, /We swapped "\+n\+" meals that are no longer available\./);
    assert.match(html, /id="week-swap-notice"/);
    assert.match(html, /Refresh your week\. A dinner in it is no longer available\./);
  });
});

describe("I-A14 meals follow-ups (applied on prod 26 Oct 2026)", () => {
  const raw = sqlBody("meals_followups.sql");
  const published = sqlBody("meals_read_published.sql");
  const active = stripSqlComments(raw);
  const aiSrc = readFileSync(path.join(ROOT, "supabase/functions/ai/index.ts"), "utf8");
  const paySrc = readFileSync(path.join(ROOT, "supabase/functions/pay/index.ts"), "utf8");
  const newcoming = readFileSync(path.join(ROOT, "supabase/functions/newcoming/index.ts"), "utf8");

  function grantColumns(src) {
    const grants = [...src.matchAll(/grant select\s*\(([^)]+)\)\s*on table public\.meals\s+to anon,\s*authenticated/gi)];
    assert.equal(grants.length, 1);
    return grants[0][1].split(",").map((s) => s.trim().replace(/"/g, "")).filter(Boolean);
  }

  it("I-A14 is one transaction, not a migration, and does not edit the published-read file", () => {
    assert.equal(existsSync(path.join(ROOT, "supabase/migrations")), false);
    assert.equal(existsSync(path.join(ROOT, "supabase/meals_followups.sql")), true);
    assert.match(raw, /APPLIED to prod 26 Oct 2026 ~15:42 GMT/);
    assert.doesNotMatch(raw, /PENDING/);
    assert.doesNotMatch(raw, /Not applied/);
    assert.match(raw, /Rollback/);
    const begin = active.indexOf("begin;");
    const commit = active.lastIndexOf("commit;");
    assert.ok(begin >= 0 && commit > begin);
    assert.equal(active.slice(commit + "commit;".length).trim(), "");
    assert.doesNotMatch(active, /grant select on (table )?public\.meals to (anon|authenticated)/i);
    assert.match(published, /grant select \(/);
    assert.doesNotMatch(published, /admin_read_meals/);
  });

  it("I-A14 grants anon and authenticated the same 11 columns and revokes anon writes", () => {
    const cols = grantColumns(active);
    assert.deepEqual(cols, [
      "id", "name", "emoji", "time", "ing", "image_url", "recipe", "tags",
      "reviewed_at", "portions", "category",
    ]);
    const publishedCols = [...stripSqlComments(published).matchAll(/grant select\s*\(([^)]+)\)\s*on\s+public\.meals\s+to\s+anon/gi)];
    assert.equal(publishedCols.length, 1);
    const anonPublished = publishedCols[0][1].split(",").map((s) => s.trim()).filter(Boolean);
    assert.deepEqual(cols, anonPublished);
    assert.match(active, /revoke select on table public\.meals from anon, authenticated/);
    assert.match(active, /revoke select \(created_by, source, created_at\) on table public\.meals from anon, authenticated/);
    assert.match(active, /revoke insert, update, delete, truncate, references, trigger on table public\.meals from anon/);
    assert.match(active, /revoke delete, truncate, references, trigger on table public\.meals from authenticated/);
    assert.match(raw, /grant delete, truncate, references, trigger on table public\.meals to authenticated/);
    assert.doesNotMatch(active, /revoke (insert|update)[^;]* from authenticated/);
    assert.match(raw, /Any new public catalogue column/);
    assert.doesNotMatch(active, /drop policy if exists "admin read meals"|drop policy if exists "admin insert meals"|drop policy if exists "admin update meals review"/);
  });

  it("I-A14 admin_read_meals is security definer and the client uses it only for admins", () => {
    const begin = active.indexOf("begin;");
    const commit = active.lastIndexOf("commit;");
    const body = active.slice(begin, commit);
    assert.match(body, /create function public\.admin_read_meals\(\)/);
    assert.match(body, /security definer/);
    assert.match(body, /set row_security = off/);
    assert.match(body, /where public\.is_admin_aal2\(\)/);
    assert.match(body, /created_by/);
    assert.match(body, /revoke all on function public\.admin_read_meals\(\) from public/);
    assert.match(body, /revoke all on function public\.admin_read_meals\(\) from anon, authenticated/);
    assert.match(body, /grant execute on function public\.admin_read_meals\(\) to authenticated/);
    assert.doesNotMatch(body, /grant execute on function public\.admin_read_meals\(\) to anon/);
    const adminStart = html.indexOf("async function loadAdminMeals(");
    const adminEnd = html.indexOf("function renderMeals(");
    const adminFn = html.slice(adminStart, adminEnd);
    assert.match(adminFn, /sb\.rpc\("admin_read_meals"\)/);
    assert.match(adminFn, /if\(!isAdmin\(\)\)/);
    const cardStart = html.indexOf("function mealCardOpsHtml(");
    const card = html.slice(cardStart, adminStart);
    assert.doesNotMatch(card, /created_by/);
    assert.match(aiSrc, /ctx\.supabase\.from\('meals'\)\.select\('name,emoji,time,ing,tags'\)/);
    assert.match(aiSrc, /ctx\.supabaseAdmin\.from\('meals'\)/);
    assert.match(paySrc, /admin\.from\('meals'\)\.select\('name,emoji,time,ing,recipe,portions'\)/);
    assert.match(newcoming, /ctx\.supabaseAdmin[\s\S]*\.from\('meals'\)[\s\S]*source,created_at/);
  });
});

describe("I-M10 capture split SQL (pending, not applied)", () => {
  const raw = sqlBody("orders_capture_split.sql");
  const active = stripSqlComments(raw);

  it("I-M10 is a loose pending file, not a migration, and keeps the orders guard", () => {
    assert.equal(existsSync(path.join(ROOT, "supabase/migrations")), false);
    assert.equal(existsSync(path.join(ROOT, "supabase/orders_capture_split.sql")), true);
    assert.match(raw, /PENDING, not applied/);
    assert.match(raw, /Rollback/);
    assert.match(raw, /security_hardening_v3\.sql/);
    assert.match(raw, /drop column if exists store_total/);
    assert.match(raw, /drop column if exists fee_amount/);
    assert.match(raw, /drop column if exists overrun_amount/);
    assert.match(active, /add column if not exists store_total numeric/);
    assert.match(active, /add column if not exists fee_amount numeric/);
    assert.match(active, /add column if not exists overrun_amount numeric/);
    assert.match(active, /new\.store_total := null;/);
    assert.match(active, /new\.fee_amount := null;/);
    assert.match(active, /new\.overrun_amount := null;/);
    assert.match(active, /new\.amount_captured := null;/);
    assert.match(active, /invalid fee_amount/);
    assert.match(active, /new\.fee_amount < -1000 or new\.fee_amount > 1000/);
    assert.doesNotMatch(active, /new\.fee_amount < 0/);
    assert.match(active, /revoke insert, update on table public\.orders from anon/);
    assert.match(active, /revoke insert, update on table public\.orders from authenticated/);
    assert.match(active, /grant update \(\s*status,\s*delivery_slot,\s*issue_status\s*\) on table public\.orders to authenticated/);
    assert.doesNotMatch(active, /grant update \([^)]*store_total/);
    assert.doesNotMatch(active, /grant insert \([^)]*fee_amount/);
    assert.match(pay, /runCapture/);
    assert.match(pay, /alertOps/);
    assert.match(pay, /sendTelegram/);
    assert.match(pay, /payload\?\.dryRun !== false/);
    assert.match(pay, /task === 'reconcile'/);
    assert.match(capture, /CAPTURE_DB_ATTEMPTS = 4/);
    assert.match(capture, /status === 'succeeded'/);
    assert.match(capture, /amount_received/);
    assert.match(capture, /capture_not_recorded/);
    assert.match(capture, /code === '42703'/);
    assert.match(capture, /code === 'PGRST204'/);
    assert.match(capture, /split wasn't recorded because the columns are missing/);
    assert.match(raw, /notify-order/);
    assert.match(raw, /reopens client writes/);
    assert.match(raw, /completion_email_status/);
    assert.match(raw, /PGRST204/);
    assert.match(raw, /42703/);
    assert.match(notify, /sendTelegram\(text,/);
    assert.match(notify, /\.slice\(0, TELEGRAM_MAX\)/);
  });
});

describe("meals MAINTAIN revoke (pending, not applied)", () => {
  const raw = sqlBody("meals_revoke_maintain.sql");
  const active = stripSqlComments(raw);

  it("revokes MAINTAIN from anon and authenticated in one transaction, with a commented rollback, and is not a migration", () => {
    assert.equal(existsSync(path.join(ROOT, "supabase/migrations")), false);
    assert.equal(existsSync(path.join(ROOT, "supabase/meals_revoke_maintain.sql")), true);
    assert.match(raw, /PENDING, not applied/);
    assert.match(raw, /^-- grant maintain on table public\.meals to anon, authenticated;$/m);
    assert.doesNotMatch(active, /grant maintain on table public\.meals to anon, authenticated/);
    const begin = active.indexOf("begin;");
    const commit = active.lastIndexOf("commit;");
    assert.ok(begin >= 0 && commit > begin);
    const body = active.slice(begin, commit);
    assert.match(body, /revoke maintain on table public\.meals from anon, authenticated;/);
    assert.equal(active.slice(commit + "commit;".length).trim(), "");
  });
});

describe("servings scaling (I-P01 / I-P05)", () => {
  it("resolves an unchosen household, prompts before this week, lists scaled ingredients, and snapshots servings on the local order", () => {
    assert.equal(html.match(/S\.prefs\.servings=resolveServings\(S\.prefs\)/g).length, 3);
    assert.match(html, /function resolveServings\(prefs\)/);
    assert.match(html, /p\.servingsChosen===true&&has\)return normServings\(p\.servings\)/);
    assert.match(html, /if\(!has\)return servingsFromHousehold\(p\.size\)/);
    assert.match(html, /if\(stored===2&&fromHouse!==2\)return fromHouse/);
    assert.match(html, /Apply cooking for "/);
    assert.match(html, /Your basket will be rescaled and any changes you made to it will be reset/);
    assert.match(html, /servingsWeekAsked===true/);
    assert.match(html, /function promptResolvedServingsOnce\(\)/);
    assert.match(html, /function applyServingsToCurrentWeek\(\)/);
    assert.match(html, /S\.basketEdit=null/);
    assert.match(html, /class="ing-scaled"/);
    assert.match(html, /Step amounts are written for 2\. Multiply by /);
    assert.match(html, /ai\("recipe",\{name,ing:meal\.ing,servings:n\}\)/);
    assert.match(html, /servings:n\}/);
    assert.match(html, /meals:\[\.\.\.S\.selected\],servings:weekServings\(\)/);
    assert.doesNotMatch(html, /ai\("recipe",\{name,ing:meal\.ing,servings:2\}\)/);
  });
});

describe("I-O19 order receipt (applied 28 Oct 2026)", () => {
  const raw = sqlBody("order_received.sql");
  const active = stripSqlComments(raw);

  it("I-O19 is one loose applied file, not a migration, and does not grant the new columns", () => {
    assert.equal(existsSync(path.join(ROOT, "supabase/migrations")), false);
    assert.equal(existsSync(path.join(ROOT, "supabase/order_received.sql")), true);
    assert.match(raw, /APPLIED to prod 28 Oct 2026 ~15:35:50 GMT/);
    assert.doesNotMatch(raw, /PENDING/);
    assert.match(raw, /execute_sql/);
    assert.match(raw, /emailed or skipped/);
    assert.match(raw, /#31, #38, and #39/);
    assert.doesNotMatch(active, /where id in\s*\(\s*31/);
    const begin = active.indexOf("begin;");
    const commit = active.lastIndexOf("commit;");
    assert.ok(begin >= 0 && commit > begin);
    assert.equal(active.slice(commit + "commit;".length).trim(), "");
    const body = active.slice(begin, commit);
    assert.match(body, /add column if not exists delivered_at timestamptz/);
    assert.match(body, /add column if not exists received_confirmed_at timestamptz/);
    assert.match(body, /add column if not exists received_confirmed_by text/);
    assert.match(body, /'customer', 'auto', 'ops', 'backfill'/);
    assert.match(body, /create trigger orders_receipt_insert/);
    assert.match(body, /before insert on public\.orders/);
    assert.match(body, /new\.delivered_at := null;/);
    assert.match(body, /new\.received_confirmed_at := null;/);
    assert.match(body, /new\.received_confirmed_by := null;/);
    assert.match(body, /create trigger orders_receipt_stamp/);
    assert.match(body, /new\.delivered_at := now\(\);/);
    assert.match(body, /cannot change status after the order is received/);
    assert.match(body, /create trigger orders_receipt_guard/);
    assert.match(body, /before update of delivered_at, received_confirmed_at, received_confirmed_by/);
    assert.match(body, /plentry\.receipt_write/);
    assert.match(body, /set_config\('plentry\.receipt_write', '1', true\)/);
    assert.match(body, /interval '48 hours'/);
    assert.match(body, /issue_status is distinct from 'open'/);
    assert.match(body, /received_confirmed_by = 'backfill'/);
    assert.match(body, /and delivered_at is null/);
    assert.match(body, /and issue_status is distinct from 'open'/);
    assert.match(body, /cron\.unschedule\('plentry_auto_complete'\)/);
    assert.match(body, /'plentry_auto_complete'/);
    assert.match(body, /'\*\/15 \* \* \* \*'/);
    assert.doesNotMatch(body, /create or replace function public\.validate_order/);
    assert.doesNotMatch(body, /grant\s+(select|insert|update|delete|all)\b/i);
    assert.doesNotMatch(body, /on table public\.orders to (anon|authenticated)/);
    for (const name of ["confirm_order_received", "admin_mark_received", "auto_complete_orders", "orders_receipt_reset", "orders_receipt_stamp", "orders_receipt_guard"]) {
      const at = body.indexOf(`function public.${name}`);
      assert.ok(at > 0, name);
      const chunk = body.slice(at, at + 220);
      assert.match(chunk, /security definer/, name);
      assert.match(chunk, /set search_path = public, pg_temp/, name);
    }
    assert.match(body, /revoke all on function public\.confirm_order_received\(bigint\) from public, anon, authenticated/);
    assert.match(body, /grant execute on function public\.confirm_order_received\(bigint\) to authenticated/);
    assert.match(body, /revoke all on function public\.admin_mark_received\(bigint\) from public, anon, authenticated/);
    assert.match(body, /grant execute on function public\.admin_mark_received\(bigint\) to authenticated/);
    assert.match(body, /revoke all on function public\.auto_complete_orders\(\) from public, anon, authenticated/);
    assert.doesNotMatch(body, /grant execute on function public\.auto_complete_orders/);
    assert.doesNotMatch(body, /grant execute on function public\.confirm_order_received\(bigint\) to (anon|public)/);
    assert.doesNotMatch(body, /grant execute on function public\.admin_mark_received\(bigint\) to (anon|public)/);
    assert.match(body, /auth\.uid\(\)/);
    assert.match(body, /is_admin_aal2\(\)/);
    assert.match(raw, /^--\s+select cron\.unschedule\('plentry_auto_complete'\);/m);
    assert.match(raw, /^--\s+drop function if exists public\.confirm_order_received\(bigint\);/m);
    assert.match(raw, /^--\s+alter table public\.orders drop column if exists delivered_at;/m);
  });

  it("I-O19 customer and Ops receipt UI calls the RPCs and wraps at a narrow width", () => {
    assert.match(html, /id="orders-receipt-badge"/);
    assert.match(html, /class="inbox-badge" id="orders-receipt-badge"/);
    assert.match(html, /Did it all arrive\?/);
    assert.match(html, /Yes, complete/);
    assert.match(html, /We couldn't confirm this just now, please try again/);
    assert.match(html, /Paused while an issue is open/);
    assert.match(html, /Something's wrong/);
    assert.match(html, /Auto-completes in \$\{receiptHoursLeft\(o\)\}h/);
    assert.match(html, /sb\.rpc\("confirm_order_received",\{p_order_id:id\}\)/);
    assert.match(html, /sb\.rpc\("admin_mark_received",\{p_order_id:id\}\)/);
    assert.match(html, /Awaiting receipt \(\$\{receiptHoursLeft\(o\)\}h left\)/);
    assert.match(html, /Complete ✓/);
    assert.match(html, /Mark complete/);
    assert.match(html, /alert\(error\.message\|\|"Could not update the status\."\)/);
    assert.match(html, /@media \(max-width:320px\)/);
    assert.match(html, /setOpsReceiptFilter\('all'\)/);
    assert.match(html, /setOpsReceiptFilter\('awaiting'\)/);
    assert.match(html, /setOpsReceiptFilter\('complete'\)/);
    assert.match(html, />Complete<\/div>/);
    assert.match(html, /function awaitingOwnReceipt/);
    assert.match(html, /\.receipt-actions\{display:flex;flex-wrap:wrap/);
    assert.match(html, /\.receipt-chips\{display:flex;flex-wrap:wrap/);
    assert.match(html, /nav button\{[^}]*min-width:0/);
    assert.match(html, /const RECEIPT_HOURS=48;/);
    assert.doesNotMatch(html, /reminder email/i);
    const ask = html.slice(html.indexOf("function receiptAskHtml"), html.indexOf("function adminReceiptHtml"));
    assert.match(ask, /awaitingOwnReceipt\(o\)/);
    assert.doesNotMatch(ask, /openIssueThread\(\$\{oid\},true\)/);
  });
});

describe("orders DELETE/TRUNCATE revoke (applied 28 Oct 2026)", () => {
  const raw = sqlBody("orders_revoke_delete_truncate.sql");
  const active = stripSqlComments(raw);

  it("revokes DELETE and TRUNCATE from anon and authenticated in one transaction, with a commented rollback, and is not a migration", () => {
    assert.equal(existsSync(path.join(ROOT, "supabase/migrations")), false);
    assert.equal(existsSync(path.join(ROOT, "supabase/orders_revoke_delete_truncate.sql")), true);
    assert.match(raw, /APPLIED to prod 28 Oct 2026 ~15:41:55 GMT/);
    assert.doesNotMatch(raw, /PENDING/);
    assert.match(raw, /execute_sql/);
    assert.match(raw, /has_table_privilege\(rolname, 'public\.orders', 'DELETE'\)/);
    assert.match(raw, /has_table_privilege\(rolname, 'public\.orders', 'TRUNCATE'\)/);
    assert.match(raw, /'anon'/);
    assert.match(raw, /'authenticated'/);
    assert.match(raw, /^-- grant delete, truncate on table public\.orders to anon, authenticated;$/m);
    assert.doesNotMatch(active, /\bgrant\b/i);
    const begin = active.indexOf("begin;");
    const commit = active.lastIndexOf("commit;");
    assert.ok(begin >= 0 && commit > begin);
    const body = active.slice(begin, commit);
    assert.match(body, /revoke delete, truncate on table public\.orders from anon, authenticated;/);
    assert.doesNotMatch(body, /\bgrant\b/i);
    assert.equal(active.slice(commit + "commit;".length).trim(), "");
  });
});
