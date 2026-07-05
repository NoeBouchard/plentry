# Plentry — Product Spec

Goal: get a handful of friends using Plentry *instead of HelloFresh* and paying for it, as fast as honestly possible. This is the working spec the team/agents build against. It is deliberately blunt about what's real vs. simulated.

Status date: 5 July 2026 · Owner: Noe (solo technical founder)

---

## 1. The product in one paragraph

Tell Plentry what's in your fridge. It proposes a week of dinners (AI + a verified dish catalog), builds the shopping basket of only what you're missing, prices that basket **live at Tesco, Sainsbury's, Asda and Waitrose**, and — on confirm — **fills your basket at the store you picked**. You pay the supermarket directly at their checkout; delivery is theirs. No boxes, no packing, no markup. Plentry's pantry then auto-restocks on delivery, closing the loop for next week.

---

## 2. Checkout architecture (decided 5 Jul 2026)

**Decision: buy, don't build.** Basket creation is powered by **Pepesto** (pepesto.com) behind our own edge function, after comparing:

| Option | Verdict |
|---|---|
| **Pepesto API** | ✅ Self-serve (Stripe → instant key), covers our exact 4 stores (+Morrisons), does ingredient→product matching, live prices incl. promotions, and a white-label checkout loop that signs the user into *their own* store account. €0.04/store quote, €0.60/bag. |
| Whisk / Samsung Food | Partnership-gated, UK coverage misses Asda & Waitrose. Keep as fallback vendor. |
| Build our own driver | Months of solo work maintaining automation against 4 changing retailer sites + the ToS exposure we already rejected in June. Only revisit if per-order API cost exceeds ~5% of the service fee at scale (see Phase 3). |
| Retailer APIs | None public in the UK. Tesco is shipping its *own* in-app AI basket assistant (The Grocer, 2026) — confirms demand, raises urgency. |

**Flow:**

1. Basket screen calls `checkout` edge fn `task:quote` → parallel Pepesto `/products` per store → real matched products + totals per store (6h cache). UI shows **LIVE** badge; falls back to reference prices (`mult`) when unavailable.
2. Confirm calls `task:bag` → `/mcheckout` → user gets "Open my bag": **mobile** deep-links into Pepesto's white-label app (restricted to checkout-only, returns to us via `redirect_url`); **desktop** opens the `adjustments_url` web flow. Either way the user reviews the filled basket **at the supermarket** and pays them directly.
3. Every order still writes an `orders` row (`items.mode = self_checkout | manual`) so ops, status sync and pantry restock keep working.
4. **Keyless mode:** without `PEPESTO_API_KEY` the fn returns `{live:false}`; the app degrades to reference prices + a manual handoff (copy list + per-item store search links). The product demos end-to-end without spending a cent.

**Money never touches Plentry.** Payment happens at the supermarket. We are not in the payments path, hold no card data, and automate no purchase.

**Unit cost per order:** quote 4 stores (€0.16) + bag (€0.60) ≈ **€0.76** ≈ 1.3–1.9% of a £35–55 basket. Starter pack (€29.90) ≈ 40 orders. Vendor is isolated in `supabase/functions/checkout/` — swappable without touching the front-end.

**Setup (one-time, Noe):** buy Starter pack on pepesto.com/pricing (their Stripe) → `POST /link` with the purchase email → `supabase secrets set PEPESTO_API_KEY=...` → `supabase functions deploy checkout` → confirm the 4 UK domain strings via `GET https://api.pepesto.com/supermarkets` (the fn's `STORE_DOMAINS` map holds them).

---

## 3. Dish catalog policy (decided 5 Jul 2026)

The shared `meals` table is the single catalog. Three sources, one contract:

- **`seed`** — 40 hand-verified dishes (`supabase/seed_meals.sql`), the trustworthy base. Idempotent, never overwritten.
- **`ai` / `advisor`** — dishes the AI writes back as users generate menus. Validity is enforced at write time by the `ai` edge fn (every ingredient ∈ 24-item catalog).
- **Verification** — `seed_meals.sql` §2 ships health checks (invalid ingredients, silly times, near-dupe names, counts by source). Run them whenever the catalog is touched. Audit 5 Jul 2026: 10 AI rows, all valid, zero fixes.

Catalog expansion (more ingredients → richer dishes) stays Phase 2: the 24-ingredient cap is what makes pantry math and price comparison tractable during the pilot.

---

## 4. The honest current state

Works end-to-end today (live at plentry.vercel.app):
signup/login, fridge-scan onboarding, AI menu + meal advisor chat, pick-your-meals, pantry tracking, basket build, store comparison, order records, AI recipes, pantry restock on delivery.

Real once `PEPESTO_API_KEY` is set: live store prices with promotions, real product matching, one-tap bag creation at the user's store.

Still simulated or manual:
- **Delivery fees & slots** (`fee`, `eta`) are hard-coded per store, not fetched.
- **Stores are hard-coded**, not geolocated from postcode.
- **No payment to Plentry** — the service fee isn't collected yet (see §5).
- Keyless mode shows estimate prices (labelled as such).

---

## 5. Monetization

**Phase A — free pilot (now → ~5–10 friends).** Goal: prove the loop beats HelloFresh (flexibility, price, waste, packaging). Instrument everything (§8).

**Phase B — flat service fee.** Groceries stay at store price (that's the pitch — we *find* the cheapest basket, we don't mark it up). Plentry charges a **flat per-order fee, target £2–3** for planning + bag-building. Note this is lower than the old £4–5 concierge fee: with self-checkout we no longer do the shopping, and the fee must clear the ~€0.76 API cost with healthy margin (~70%+). Collection: manual Stripe Payment Links first, in-app Stripe Checkout only after the fee is validated. Weekly subscription tier once retention is proven.

---

## 6. What blocks revenue, ranked

| # | Blocker | Why it matters | Fix (MVP-level) |
|---|---|---|---|
| R1 | Pepesto key not live | The headline feature ("we fill your basket") is in fallback mode | Buy pack, set secret, deploy `checkout`, run a real order end-to-end |
| R2 | No way to take money | Can't be paid | Stripe Payment Links + fee line in the order flow |
| R3 | Delivery fee/slots hard-coded | Total shown ≠ total paid at store | Short-term: label as "typical fee"; later pull from store at handoff |
| R4 | Thin catalog (24 ingredients) | Menus repeat; churn | Expand to ~80–120 UK staples + reference prices; regen seed dishes |
| R5 | Stores not postcode-aware | "near you" is a half-truth | Map pilot postcodes → store sets; later geolocate |

R1–R2 are enough to charge. R3 is honesty polish. R4–R5 are quality/scale.

---

## 7. Build plan

### Phase 1 — "Real bag" MVP *(code done 5 Jul 2026 — needs key + deploy)*
1. ✅ `checkout` edge fn (quote/bag, cache, keyless fallback) — `supabase/functions/checkout/`
2. ✅ Live store comparison + matched-product basket UI + LIVE badges
3. ✅ Bag modal (mobile deep link / desktop web flow) + manual handoff (copy list, per-item store links)
4. ✅ Seed catalog + health checks — `supabase/seed_meals.sql`
5. ☐ Noe: Pepesto key, deploy fn, run seed SQL, one real end-to-end order at each store
   - *Done when:* a real Tesco/Sainsbury's/Asda/Waitrose basket was filled by Plentry and paid at the store.

### Phase 2 — chargeable + smoother
6. Fee line + Stripe Payment Link flow (R2) · order email/Slack ping to Noe
7. Delivery fee/slot honesty (R3) · catalog expansion (R4) · postcode→stores (R5)
8. `/ops` fulfilment view for the manual-mode safety net

### Phase 3 — moat
9. Smart replenishment (predict pantry depletion, prompt reorders)
10. Multi-store split baskets when savings > extra delivery fee
11. Own checkout driver (browser extension running Pepesto's `/checkout` loop, or direct retailer deals) — **only if** volume makes the per-order API cost material, or Pepesto wobbles
12. Weekly subscription tier

---

## 8. Success metrics

- **Activation:** % of signups who create a first bag.
- **Handoff completion:** % of created bags that end in a store checkout (proxy: user marks Arrived / returns via redirect).
- **Core value:** live-price savings per basket vs priciest store; £/serving vs HelloFresh.
- **Retention:** repeat bags per user per week.
- **Willingness to pay:** fee acceptance once introduced.
- **Unit economics:** API cost per order vs fee (must stay <30% of fee).

Target before scaling spend: **5 users placing ≥2 bags/week, fee validated, positive unit economics.**

---

## 9. Ops runbook

Self-checkout orders need no ops. For `items.mode='manual'` rows (keyless fallback or Pepesto outage):
1. Supabase → `orders`, filter `status='new'` and `items->>'mode'='manual'`.
2. Shop the list at the chosen store for the postcode; note the real total.
3. If Phase-B fees are live, send the Stripe link; set `status='ordered'` when placed, `'delivered'` on arrival (auto-restocks the user's pantry).

---

## 10. Out of scope for the paid MVP

Native mobile apps, real-time store inventory, loyalty-card integration, nutrition tracking, multi-basket optimization (Phase 3 has the simple version). Deferred until the paid loop retains users.
