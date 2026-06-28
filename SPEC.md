# Plentry — Spec & Path to First Paying Customers

Goal: get a handful of friends using Plentry *instead of HelloFresh* and paying for it, as fast as honestly possible. This document is the working spec the team/agents build against. It is deliberately blunt about what's real vs. simulated.

Status date: 28 June 2026 · Owner: Noe (solo technical founder)

---

## 1. The honest current state

What works end-to-end today (live at plentry.vercel.app):
- Signup/login, fridge-scan onboarding, AI menu, meal advisor chat, pick-your-meals, pantry tracking, basket build, store price comparison, order confirmation written to the backend, AI recipes.
- The meals catalog grows automatically as the AI proposes dishes.

What is **simulated or manual** (and therefore blocks a paid promise):
- **Prices are estimates** — fixed per-ingredient reference prices × a per-store multiplier. Not live.
- **Stores are hard-coded**, not geolocated from the user's postcode.
- **Ordering is done by hand** from the `orders` table.
- **No payment** is collected.

The strategy below turns these from blockers into a deliberate, chargeable "concierge" service, then automates them in order of leverage.

---

## 2. Monetization (decided)

**Phase A — Free pilot (now → first ~5–10 friends).** No charge. The only goal is proving the loop is genuinely better than HelloFresh: more flexible, cheaper, less waste, zero packaging. Instrument everything (see metrics).

**Phase B — Flat concierge fee (introduce with the first happy users).** User pays the **actual grocery cost + a flat Plentry fee per order** (target **£4–5**, validate against willingness-to-pay). Rationale:
- A **flat fee**, not a basket markup — a markup silently contradicts the "we find you the cheapest basket" promise, which is the entire pitch. The fee is for *planning + doing the shopping for you*.
- **Per-order**, not subscription yet — a subscription is too big an ask before trust is built. Move to an optional weekly plan once retention is proven.

**Collection — manual Stripe Payment Links.** Zero code, no PCI scope, works immediately: after the user confirms an order you send a Stripe link for `grocery total + fee`; you place the order once paid. In-app Stripe Checkout is a Phase-2 build, only after the fee model is validated.

This keeps the app honest during the pilot: prices shown are estimates, and the *real* price is confirmed at the moment you do the manual shop — which is exactly when the payment link is sent.

---

## 3. What blocks revenue, ranked

| # | Blocker | Why it matters for paying | Fix (MVP-level) |
|---|---|---|---|
| R1 | Price shown isn't the price paid | Trust + the core value prop | Frame in-app prices as "estimate, confirmed at checkout"; you verify the real total when shopping and put it on the Stripe link. Later: live price data. |
| R2 | No way to take money | Can't be paid | Manual Stripe Payment Links + a per-order fee field surfaced in the order. |
| R3 | Ordering is fully manual & ad-hoc | Won't scale past a few users; errors | A proper **ops runbook** + an internal "orders to fulfil" view (status `new`→`ordered`→`delivered`). |
| R4 | Thin catalog (24 ingredients) | Menus feel repetitive; churn | Expand `CATALOG` to ~80–120 common UK items with reference prices. |
| R5 | Stores hard-coded, not by postcode | "near you" is a half-truth | Map a few postcode areas to plausible store sets; later geolocate. |

R1–R3 are enough to charge. R4–R5 are quality/scale and can follow.

---

## 4. Build plan (phased, with acceptance criteria)

### Phase 1 — "Chargeable concierge" (this is the paid MVP)
Make the manual service legitimate and payable.

1. **Order = clear ops record.** Each `orders` row already has email, postcode, store, items, total. Add a **`fee`** and **`grocery_total`** convention and an explicit **delivery slot** captured at confirm time.
   - *Done when:* you can open the Supabase `orders` table and fulfil an order start-to-finish without asking the user anything.
2. **Honest pricing copy.** Label the basket total "estimated — final price confirmed when we shop". Show the flat fee line.
   - *Done when:* no screen implies the displayed price is guaranteed.
3. **Payment link flow (manual).** On confirm, the user sees "We'll send a secure payment link for groceries + £X service fee." You send a Stripe Payment Link; on payment you place the order and set `status='ordered'`.
   - *Done when:* one real order is paid via Stripe and delivered.
4. **Internal fulfilment view.** A minimal `/ops` page (or a saved Supabase view) listing `status='new'` orders with everything needed to shop.
   - *Done when:* fulfilling doesn't require reading raw JSON.

### Phase 2 — Reduce the manual load
5. **Expand catalog** to ~100 items + reference prices (R4).
6. **Postcode → store set** mapping for the top pilot areas (R5).
7. **In-app Stripe Checkout** (serverless `api/checkout`), replacing the manual link once volume justifies it.
8. **Order notifications** — email/Slack to Noe the instant an order is confirmed, so fulfilment is timely.

### Phase 3 — Real automation (the moat)
9. **Live price data** via retailer/aggregator sources (Trolley/MySupermarket-style feeds, or partner APIs).
10. **Assisted/automated ordering** via aggregator partners (Everli, Uber Eats grocery, retailer APIs). No ToS-violating checkout bots.
11. **Smart replenishment** — predict pantry depletion, prompt reorders.
12. **Optional weekly subscription** tier once retention is shown.

---

## 5. Ops runbook — fulfilling an order (Phase 1)

1. Supabase → Table Editor → `orders`, filter `status = new`.
2. Read `postcode`, `store`, `items` (basket + chosen `meals`).
3. Do the shop on the chosen store's site for that postcode; note the **real** total.
4. Send the customer a **Stripe Payment Link** for `real grocery total + £fee`.
5. On payment, place/confirm the delivery; set `status = 'ordered'`.
6. On delivery, set `status = 'delivered'` (this restocks their in-app pantry automatically).

Keep a simple log (orders fulfilled, real vs. estimated price delta, time spent) — it feeds both pricing and the case for automation.

---

## 6. Success metrics

- **Activation:** % of signups who confirm a first order.
- **Core value:** estimated vs. actual basket savings; £ saved per order vs. single-store / vs. HelloFresh per-serving.
- **Retention:** repeat orders per user per week (the real signal a friend switched from HelloFresh).
- **Willingness to pay:** % who pay the fee once introduced; comfortable fee level.
- **Ops cost:** minutes to fulfil an order (must trend down or automation is overdue).

Target before scaling spend: **5 users placing ≥2 paid orders/week, with positive unit economics on the flat fee.**

---

## 7. Out of scope for the paid MVP
Native mobile apps, real-time inventory at stores, multi-basket split-optimization, loyalty-card integration, nutrition tracking. All deferred until the paid loop retains users.
