# Security hardening v2 — deploy checklist (7 Jul 2026)

Order matters: deploy the functions BEFORE running the SQL, otherwise meal
persistence pauses (the ai fn must be on service-role writes before the client
INSERT policy on `meals` is dropped).

## 1. Deploy the updated edge functions
```
supabase functions deploy ai checkout pay stripe-webhook notify-order
```

## 2. Run the SQL (Supabase SQL Editor)
- `supabase/security_hardening.sql` — if not already applied (rate limiting + meals CHECK constraints, from 6 Jul)
- `supabase/security_hardening_v2.sql` — NEW: meals INSERT lockdown, orders validation trigger, profiles state cap

## 3. Remove the deployed example function (if it was ever deployed)
```
supabase functions delete orders
```
(The source was deleted from the repo; it was an unvalidated write path.)

## 4. Redeploy the site
```
vercel deploy --prod --yes --token <token>
```

## 5. Early-adopter SQL (run in SQL Editor before inviting anyone)
- `supabase/ingredient_prices_tesco.sql` — Tesco fallback prices for the 24 catalog keys
- `supabase/meals_images.sql` — `image_url` column + 40 seed hero photos

## 6. Secrets (do not ship without these)
```
supabase secrets set PEPESTO_API_KEY=...
supabase secrets set STRIPE_SECRET_KEY=sk_test_...   # then sk_live_ before real users
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
# Telegram + ORDER_WEBHOOK_SECRET should already be set — confirm they still are
supabase functions deploy checkout pay stripe-webhook notify-order
```

## 7. Post-deploy smoke test
- Sign up / log in; onboarding rejects a garbage postcode, accepts a real one.
- Step 2 shows Tesco, Sainsbury's, Asda, Waitrose with a sample-week total (LIVE if Pepesto is keyed, otherwise SHELF/estimate). Picking a store enables Continue.
- Pantry skip is the primary path and lands on photo meal cards. Tapping a meal updates the floating basket.
- Basket drawer: items appear immediately; Place my order starts Stripe Checkout (address + phone). If Stripe is missing, the app says payments aren't ready and does **not** Telegram-ping.
- Pay with a test card; Telegram arrives with address, phone, meal names, and per-item store search URLs.
- Ops tab: mark ordered, capture the exact store total.
- Profile: budget still clamps £1–£500; preferred supermarket persists.
- In SQL Editor, both of these must FAIL:
  - `insert into meals(name) values ('hacked');` — run while impersonating `authenticated` role (Table Editor → RLS enabled)
  - `insert into orders(user_id,store,total,postcode) values (auth.uid(),'Asda',-5,'E2 8AA');`

## What changed (summary)

| Area | Before | After |
|---|---|---|
| meals table | any signed-in user could INSERT | only the `ai` edge fn (service role); content validated + created_by from JWT |
| order total | client-supplied, used for the Stripe hold | recomputed server-side from `ingredient_prices` in the `pay` fn; DB trigger rejects ≤0 or >£500 |
| postcode / address | free text | UK-format validated in UI + DB trigger (normalised to upper case); Stripe still collects the authoritative GB address |
| budget | any value, injected raw into the AI prompt | clamped 1–500 in UI and in the ai fn; all other AI payload fields clamped/whitelisted too |
| order email/name | client-supplied | email overwritten from the verified JWT by the trigger |
| order items | unbounded JSON | ≤60 items, qty 1–50, ≤40 KB; store whitelisted; status/payment_status whitelisted |
| profiles.state | unbounded | ≤256 KB per row |
| capture | UI-only "≤ hold" check | enforced server-side in the pay fn |
| Pepesto URLs | rendered into href unsanitised | `safeUrl()` — http(s) only, escaped |
| checkout redirect_url | any URL (open redirect) | must start with https://plentry.vercel.app |
| webhook secrets | `===` compare (timing leak) | constant-time compare in notify-order + stripe-webhook |
| `orders` example fn | extra unvalidated write path | deleted |

## Still open (accepted risks / next steps)
- Rate limits fail OPEN on DB errors (availability over strictness) — revisit at scale.
- `ai` fn remains callable logged-out by design (40/min/IP cap is the only gate on Anthropic spend).
- Postcode is format-valid, not existence-checked — a real-but-wrong postcode passes. If it matters, add an address-lookup API (e.g. getaddress.io) before fulfilment; Stripe's collected address is the one to trust for paid orders.
- No CAPTCHA on signup — disposable-email signups can each get 40 AI calls/min. Consider Supabase Auth's built-in CAPTCHA if abuse appears.
