# Security (audit brief)

For a security-review agent. Read this file plus [CURRENT-STATE.md](CURRENT-STATE.md) and [ARCHITECTURE.md](ARCHITECTURE.md) before touching code. Not an invitation to exploit. Prefer patches and tests. After any hardening patch: `npm test` in the app directory, then update this file and [CHANGELOG.md](CHANGELOG.md).

## Audit 17 Sep 2026 — status

Full backend → frontend pass (Edge Functions, SQL/RLS as written **and as live**, `index.html`, git hygiene, HTTP headers, Vercel upload). Every finding below has a shipped fix and a test named with its invariant ID (`npm test` 97/97).

**Live now — all 17 findings closed (S-16 accepted).** Postgres (17 Sep, `security_hardening.sql` + `v2` + `v3`, `webhook_secret_vault.sql`, each probed live inside rolled-back blocks): S-01, S-02, S-09 column, S-13. Edge functions: `pay` **v19** (19 Sep — capture reads `jwtClaims.aal`); others 17 Sep (`ai` v22, `checkout` v15, `stripe-webhook` v15, `notify-order` v17). Static (19 Sep, `plentry-11vcbs682`): S-07, S-08, S-10 client, S-12, S-14 client, S-17, S-06 UI. Post-deploy checks all passed (RUNBOOK): `/doc/SECURITY.md`, function sources, SQL, tests → 404; CSP + HSTS + nosniff + DENY + Referrer-Policy + Permissions-Policy on `/`; vendored bundle 200.

**18 Sep 13:25 BST:** founder enrolled TOTP (factor verified 12:19 UTC), then migration `admin_mfa_aal2_policies` applied and `REQUIRE_ADMIN_MFA=1` set. Live RLS probe as the founder JWT: aal1 → 5 own orders, 0 other customers, `is_founder_aal2()` false; aal2 → 30 orders, 25 other customers, true. Dashboard minimum password length raised to 8 by the founder. Nothing outstanding except one live money test of the new checkout path (RUNBOOK).


| ID | Sev | Where | Finding | Status | Fix / test |
|---|---|---|---|---|---|
| ~~S-01~~ | **Critical** | live Postgres | Hardening SQL (`rate_limits`, `check_rate_limit`, `validate_order`, meals/profile CHECKs) had **never been applied**; every rate limit failed open and `orders` accepted anything. | **Closed — live** | v1 + v2 applied via migration 17 Sep. Live probe: limiter `true,true,false` at max 2; negative total / unknown store / `payed` rejected. `I-S01`. RUNBOOK “Live schema check”. |
| ~~S-02~~ | **High** | `validate_order`, `pay` capture | Customer could INSERT `payment_status='authorized'` + `amount_held` and get the founder to shop an order Stripe never held; capture skipped the hold check when `amount_held` was null. | **Closed — live** | `security_hardening_v3.sql`: INSERT forces `unpaid / null intent / null session / null hold / null captured / new`; UPDATE re-validates total/postcode/store/items only when they change (legacy null-total rows still move status). `pay`: `no hold recorded on order`. Live probe: fake-paid insert came back `unpaid/null/new`. `I-O11`. |
| ~~S-03~~ | **High** | `_shared/ratelimit.ts` | Anonymous bucket keyed on the **first** `x-forwarded-for` entry (caller-controlled) → fresh bucket per request. | **Closed — live (functions 17 Sep)** | Last XFF entry, address chars only, ≤ 45; anonymous `ai` fails **closed** on limiter errors, signed-in fails open. Unit tests on the real `.ts`. |
| ~~S-04~~ | Medium | `pay` `serverTotal`, `notify-order` | Ops/Telegram trusted client-written `product` / `pack` / `search` (phishing link to the founder); unknown `i` priced at £2.50 instead of rejected. | **Closed — live (functions 17 Sep)** | `_shared/orders.ts`: `rebuildBasket` — catalog keys only, product/pack/price from `ingredient_prices`, search URL from a 4-store whitelist; `pay` writes the rebuilt `items` back before the hold; `notify-order` rebuilds every link and caps the message at 4000 chars. Cards only (`payment_method_types=card`). `I-O12` + unit tests. |
| ~~S-05~~ | Medium | `stripe-webhook` | DB errors returned 200 (no Stripe retry → held payment stuck `unpaid`); `completed` re-authorised captured orders; a non-UK Stripe postcode would now trip the trigger. | **Closed — live (functions 17 Sep)** | `dbFail` → 500; `.in('payment_status',['unpaid','none','canceled'])`; `ukPostcode()` guard keeps the row's postcode otherwise; records `amount_held` from `amount_total` and `checkout_session`. `I-O13`. |
| ~~S-06~~ | Medium | founder account, `admin_policies.sql`, `pay` capture | One password-only account holds every customer's PII and every hold. | **Closed — live 18 Sep (UI + `admin_mfa.sql` + `REQUIRE_ADMIN_MFA=1`); capture `aal` read fixed 19 Sep** | Profile → **Security** (founder only): TOTP enrol (QR is only rendered from an SVG `data:` URL), code challenge at login, `isAdmin()` false while a code is pending. `pay` capture requires `ctx.jwtClaims.aal === 'aal2'` once `REQUIRE_ADMIN_MFA=1` (`userClaims` does not include `aal`). `admin_mfa.sql` (**applied 18 Sep**, probed: founder aal1 sees 5 own orders, aal2 sees all 30) gates all five founder policies on `is_founder_aal2()`. `I-A10` + 4 jsdom tests. |
| ~~S-07~~ | Medium | `index.html` | supabase-js from jsDelivr, floating `@2`, no SRI. | **Closed — live (static 18 Sep)** | Vendored `vendor/supabase-js-2.116.0.js` (npm tarball, sha384 pinned in the test); no third-party script tag; harness updated. `I-A04`. |
| ~~S-08~~ | Medium | Vercel headers | Only HSTS; no CSP / frame-ancestors / nosniff / Referrer-Policy / Permissions-Policy. | **Closed — live (static 18 Sep)** | `vercel.json`: CSP (`default-src 'self'`, no remote scripts, no eval, `connect-src` = Supabase only, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`), `X-Frame-Options DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, immutable cache for `/vendor/`. Smoke-tested in a real browser with the exact headers: zero violations, Supabase REST / images / `data:` QR / SW all work. `I-A05`. |
| ~~S-09~~ | Low | `pay` checkout | Repeated checkout opened several Stripe sessions → double holds, only the last PI recorded. | **Closed — live (column + functions 17 Sep)** | `orders.checkout_session`; `pay` expires the previous session before creating one; webhook `expired` only cancels when it is the current session (or legacy null); `completed` records the real session + hold. `I-O14`. |
| ~~S-10~~ | Low | `checkout` bag, `index.html` | `startsWith('https://plentry.vercel.app')` matched `plentry.vercel.app.evil.tld`; client followed `pay.url` blindly. | **Closed — live (functions 17 Sep, static 18 Sep)** | `appRedirect()` exact `origin ===`; client `stripeCheckoutUrl()` navigates only to `https://checkout.stripe.com`. `I-X02`. |
| ~~S-11~~ | Low | `ai` | `parse_pantry` / `meal_options` still callable (`meal_options` wrote `meals`); advisor context included unreviewed drafts; unbounded drafts per user. | **Closed — live (functions 17 Sep)** | Retired tasks → 400 (prompts deleted); advisor catalog `.not('reviewed_at','is',null)`; 20 **new** drafts / user / day via `check_rate_limit('ai_drafts')`, fail closed. `I-A08`. |
| ~~S-12~~ | Low | `index.html` | `prefs.budget` from the cloud blob rendered raw. | **Closed — live (static 18 Sep)** | `normBudget` in `loadCloudState` + `esc()` at render. `I-X03` jsdom. |
| ~~S-13~~ | Low | `orders_payment.sql`, `meals_tags.sql` | Webhook secret in plaintext in a function body, scraped with `pg_get_functiondef`; new `public` functions RPC-callable by default. | **Closed — live** | `webhook_secret_vault.sql`: seeded `vault.secrets.order_webhook_secret` server-side (value never left Postgres), both functions read `public.order_webhook_secret()` (definer, no app-role EXECUTE), `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE` for `public`/`anon`/`authenticated`. Verified: cron function hit `newcoming` → HTTP 200. `I-A11`. |
| ~~S-14~~ | Low | Auth settings, `submitAuth` | Password min 6; no CAPTCHA; leaked-password check Pro-only. | **Closed — live 18 Sep (client + dashboard min 8)** | `PASSWORD_MIN=8` (`I-A07` jsdom). Dashboard Auth → Email → minimum length **8** set by the founder 18 Sep. CAPTCHA stays accepted until abuse appears. |
| ~~S-15~~ | Info | `ai`, `checkout` | Upstream/internal error text returned to anonymous callers. | **Closed — live (functions 17 Sep)** | `detail` only when signed in; full text goes to function logs. `I-A09`. |
| S-16 | Info | Supabase advisor | `pg_net` in `public`. | Accepted | Do not move without re-testing the notify trigger. |
| ~~S-17~~ | Medium | Vercel upload (found during S-08) | **No `.vercelignore` → the whole folder was deployed.** `plentry.vercel.app/doc/SECURITY.md`, `/supabase/functions/pay/index.ts`, `/supabase/security_hardening_v2.sql`, `/test/harness.mjs`, `/SPEC.md` all returned 200 (checked live). No secrets in them, but function source, RLS/trigger logic and this findings table were public. | **Closed — live (static 18 Sep)** | `.vercelignore` allow-list: `/*` then `!/index.html !/sw.js !/manifest.json !/icons !/vendor !/vercel.json`. Post-deploy check in RUNBOOK (`/doc/SECURITY.md` → 404). `I-A06`. |

**Verified good (17 Sep 2026):** RLS enabled on all four tables; no user UPDATE/DELETE on `orders`; `meals` writes are founder JWT or service role only; `pay` recomputes totals and caps capture at the hold; Stripe HMAC + timing-safe compare + 10-min replay window; webhook-secret functions timing-safe; `esc()` / `safeUrl()` applied consistently (Ops renders other users' fields safely, onclick uses indexes); no `public` function is executable by anon/authenticated (live check after S-13); no `.env` or secrets in git or history; only the six expected Edge Functions deployed. **21 Sep:** `order_messages` added with RLS (own-order vs founder aal2); issue bodies stripped + `esc()`.

## Trust boundaries

- **Browser:** `index.html` holds the **publishable** Supabase key. Anyone can read it. Authorization is RLS + edge `auth: 'user'` + service role only on the server.
- **Admin:** membership of `public.admins` **and** `aal2` once `admin_roles.sql` is applied (until that table has a row, the founder email still counts so the migration cannot lock the account out). The file inserts the founder only. RLS stays enabled on `admins`, with a select policy and no insert, update, or delete policy for authenticated users. A further admin is a hand insert in the SQL editor. There is no add-admin control. Client `isAdmin()` is false while a code is pending. Other admin policies are `to authenticated`, so anon does not call `is_admin_aal2()`. `admin_roles.sql` drops `admin delete meals` and does not recreate it, so after a re-run authenticated users cannot delete a meal (prod today still has that delete via `is_founder_aal2()` until this file is applied). Unpublish is the path in the Meals UI. A deleted dinner stays named on a customer's current week, and `pay` then builds it with `ing []`, so the hold is short. Meal and price triggers check the admin session only (`auth.uid()` is not null); the advisor and SQL editor keep today's writes. Live today, before that SQL: `admin_mfa.sql` uses `is_founder_aal2()` and `pay` capture is still the founder email plus `ctx.jwtClaims.aal` when `REQUIRE_ADMIN_MFA=1` (I-M07). Hiding the Ops nav is UX only. Capture is checked again in `pay`. A key outside the 46-key catalog is still rejected by `pay`.
- **Orders row:** the client may only describe a basket. `validate_order` forces `payment_status/payment_intent/checkout_session/amount_held/amount_captured/status` on INSERT; `pay` rebuilds `items` from the catalog before any hold. Ops and Telegram never read client-written product text or links.
- **Stripe:** webhook signature (`STRIPE_WEBHOOK_SECRET`), manual capture, cards only, hold cap, one open Checkout Session per order. Client must not set the charged amount; Ops sends **store** £, server adds 5%. Webhook DB errors are 5xx (Stripe retries).
- **AI:** catalog whitelist; payload clamps; meals INSERT via service role (`ai` advisor only) or founder JWT (`admin insert meals`). Retired tasks return 400. Tags whitelist + diet/dinner CHECK (`meals_tags.sql`). Rate limit 40/min keyed on user id or the proxy-appended client IP; anonymous callers fail closed. 20 new drafts / user / day.
- **Telegram notify:** `notify_order_webhook_fn` is trigger-only, reads the header secret from **Vault** (`public.order_webhook_secret()`, definer-only). `EXECUTE` revoked from `anon` / `authenticated` / `PUBLIC`; new `public` functions are closed by default. Telegram fires only when `payment_status` becomes `authorized`, plus customer inserts on `order_messages`. `newcoming` uses the same Vault secret.
- **Static origin:** `vercel.json` CSP (`connect-src` = Supabase only, no remote scripts, `frame-ancestors 'none'`) + security headers; supabase-js is vendored (`/vendor/…`, hash-pinned by test); `.vercelignore` allow-lists the five app assets — nothing else from the repo is served.
- **XSS:** `esc()` / `safeUrl()` on AI text, meal names, tags, order fields, Pepesto product names, cloud `prefs`, **issue bodies**. MFA QR is rendered only from an SVG `data:` URL. Do not concatenate untrusted strings into `onclick`. `order_messages` CHECKs no `<>` and ≤1000 chars; customer RLS is own-order only.

## Secrets (never in git / never in `index.html`)

`ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ORDER_WEBHOOK_SECRET` (edge side; the DB side is `vault.secrets.order_webhook_secret` — rotate both together), `PEPESTO_API_KEY` (optional), `REQUIRE_ADMIN_MFA` (flag, set to `1` after the founder enrols TOTP).

Webhook compare should be constant-time (`notify-order`, `stripe-webhook`).

## SQL / RLS to re-read

Apply order on a fresh project: schema → hardening v1 → v2 → v3 → admin policies → meals_tags → orders_payment → revoke_notify_rpc → webhook_secret_vault → (after founder enrols) admin_mfa.

- `plentry/supabase/schema.sql`
- `plentry/supabase/security_hardening.sql` (rate limiter, meals content CHECKs) — **live 17 Sep 2026**
- `plentry/supabase/security_hardening_v2.sql` (order trigger, meals shape CHECKs, profile state cap) — **live 17 Sep 2026**
- `plentry/supabase/security_hardening_v3.sql` (INSERT forces server-owned columns; change-aware UPDATE validation; `checkout_session`) — **live 17 Sep 2026**
- `plentry/supabase/admin_policies.sql`
- `plentry/supabase/admin_meals_write.sql` (founder INSERT/UPDATE/DELETE on meals; drops leftover public insert)
- `plentry/supabase/admin_mfa.sql` (founder policies require `aal2`) — **live 18 Sep 2026** (after TOTP enrolment; never re-apply on a project where the founder has no verified factor)
- `plentry/supabase/meals_tags.sql` (tags CHECK, newcoming index, founder UPDATE on meals, cron)
- `plentry/supabase/orders_payment.sql` (notify triggers — the secret literal in this file is superseded by the Vault version)
- `plentry/supabase/revoke_notify_rpc.sql` (RPC revoke + drop free-beta triggers)
- `plentry/supabase/webhook_secret_vault.sql` (Vault-backed secret, default privileges) — **live 17 Sep 2026**

## Closed on 17 Sep 2026

See the status table above. Live (DB 17 Sep, functions 17 Sep, static 18 Sep): S-01, S-02, S-03, S-04, S-05, S-07, S-08, S-09, S-10, S-11, S-12, S-13, S-15, S-17, S-14 client, S-06 UI. S-06 and S-14 closed 18 Sep 13:25 BST (enrolment, `admin_mfa_aal2_policies`, `REQUIRE_ADMIN_MFA=1`, dashboard min 8). All findings closed; S-16 accepted.

## Closed on 14 Sep 2026

- Leftover `insert meals` RLS (`auth.uid() = created_by`) was still on live Postgres after v2 hardening. Dropped. Catalog writes: founder email JWT (Meals tab) or service role (`ai`). Founder also has DELETE.

## Closed on 13 Sep 2026

- JWT admin email: `auth.jwt()->>'email'` and `ctx.userClaims.email` are GoTrue’s top-level **`email`** from `auth.users`, not `user_metadata`. Users cannot set that claim from the client. Capture is still re-checked in `pay`.
- Leftover `orders` edge function: still absent from the deployed list (`ai`, `checkout`, `pay`, `stripe-webhook`, `notify-order`, `newcoming` only).
- Stripe **test** hold path: checkout → `unpaid` → webhook `authorized` → Ops capture (order #31 store £25 → £26.25, under hold £31.52). Safe to rotate `STRIPE_SECRET_KEY` to live.

## Closed on 9 Sep 2026

- `meals.tags` CHECK (closed set, exactly one diet tag, always `dinner`).
- `meal_tags_for` `search_path` pinned to `public`.
- `newcoming` gated like `notify-order` (`ORDER_WEBHOOK_SECRET`); `invoke_newcoming_review` not granted to `anon`/`authenticated`. Founder INSERT/UPDATE/DELETE on meals is Meals-tab-only (JWT email). Other clients cannot INSERT.

## Closed on 8 Sep 2026

- Leftover `orders` edge function: not in the deployed function list.
- `notify_order_webhook_fn` was callable via PostgREST; `EXECUTE` revoked from `anon` / `authenticated` / `PUBLIC`.
- Free-beta Telegram triggers (insert `none`, unpaid→none) dropped. Only `notify_order_paid_webhook` remains.

## Known accepted risks (do not “fix” without product sign-off)

- `ai` callable logged-out (publishable) with IP rate limit (live since 17 Sep; key = proxy-appended IP; anonymous fails closed).
- Rate limits fail open for **signed-in** callers on a DB error (availability over strictness); anonymous `ai` and the drafts quota fail closed.
- Postcode format-only, not existence.
- No CAPTCHA on signup.
- `pg_net` installed in `public` (Supabase advisor). Do not move without checking the notify trigger.
- Leaked-password protection is off. HaveIBeenPwned is **Pro Plan and above**; org is **Free**, so this stays off until a plan upgrade. Dashboard: Auth → Providers → Email.
- Admin is the founder email string (verified as `auth.users` email, not `user_metadata`) plus TOTP once enrolled. `app_metadata.role` would be stricter later if more than one operator exists.
- CSP keeps `'unsafe-inline'` for `script-src` (inline app script + `onclick=` handlers). It still blocks remote scripts, `eval`, framing and non-Supabase `connect-src`. Nonces would need a build step (forbidden by I-A01).

## Redirects

`checkout` bag `redirect_url` must have **exactly** the origin `https://getplentry.com` (`appRedirect()`). The client only follows `pay.url` when its host is `checkout.stripe.com` over https (`stripeCheckoutUrl()`).

## Audit output wanted

Issue, severity, file/function, whether it is already mitigated, suggested patch. No exploit payloads in the repo.
