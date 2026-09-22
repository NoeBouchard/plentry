# MVP requirements (locked)

This is the product contract. Agents implement **inside** it. They do not replace it with a new stack, a new fee model, or a new fulfilment path unless the founder changes this file.

**Locked:** 17 Sep 2026. Live: https://plentry.vercel.app  
**Code shape:** `plentry/index.html` (vanilla) + `plentry/supabase/functions/`. No React, Next, or bundler.

If a chat, `README.md`, or anything in [archive/](archive/README.md) disagrees, **this file + [INVARIANTS.md](INVARIANTS.md) + [CURRENT-STATE.md](CURRENT-STATE.md) win**.

---

## In (pilot)

1. A UK household can sign up, pick diet + optional dinner tags, a supermarket, household size, budget, **1–7 dinners**, and tick cupboard oils/spices they already have.
2. The app builds **exactly N dinners** from the **verified** catalog (`reviewed_at` set). Default diet is **omnivore**. Modify swaps one dinner from that catalog. The advisor may fill/replace slots but **never grows the week past N**. Unverified meals stay off New week / Modify.
3. The basket is the missing groceries at Tesco / Sainsbury’s / Asda / Waitrose (shelf prices). Cupboard staples already ticked are skipped. The customer can edit the basket; **Order this week** rebuilds from this week’s meals unless they edited *this same week*.
4. Checkout takes a **door address** in the app (saved on Profile). Stripe takes the **card hold** and **card billing** only. Hold = (groceries + **5%**) × **1.30**. Unpaid rows do not ping Telegram.
5. After the hold, Ops sees the order. Founder shops at the customer’s store with **Plentry’s own float** (Stripe payouts are delayed). Ops types the till total, confirms **till + 5%**, never above the hold. The customer chose a **2-hour window** at checkout (day ≥ order+3, 08:00–22:00). Ops books **that** supermarket slot, or messages them in the order thread first — never a different window. Confirming the window marks **Ordered** → later **Delivered**. Timeline dots stay hollow until each step is done. The customer sees that timeline from **Postgres**, not only localStorage.
6. Founder **Meals** tab: add / edit / verify / unpublish catalog dinners. Verify sets `reviewed_at`; customers can pick it without a deploy.
7. Each order **snapshots** that week’s cooking methods onto `orders.items.recipes`. The customer reads them from **Orders** (not email, not a live catalog lookup).

## Out (do not build yet)

- Customer paying the supermarket directly, subscriptions, split-store baskets, live Pepesto quotes (unless the key is set), photo pantry scan in the UI, geolocated stores, a second front end, Instant Stripe → Tesco (impossible; capture is not spendable at the shop).

## Money (do not “simplify”)

| Rule | Value |
|---|---|
| Customer pays | Plentry via Stripe (manual capture) |
| Plentry fee | **5% of store total** (client `COMMISSION` and `pay/index.ts` together) |
| Hold | fee already included, then × **1.30** (raised 19 Sep; shelf estimates were low) |
| Capture | Ops types **store £**; server adds 5%; never more than the hold. If till + 5% is over, capture the hold — Plentry covers the rest from the float. |
| Orders truth | `public.orders` + `hydrateOrdersFromDb` |

Working capital: Tesco is paid from the founder’s card (e.g. Wise). Stripe reimburses on the payout schedule. See [RUNBOOK.md](RUNBOOK.md).

## Agent rules

- Read [INVARIANTS.md](INVARIANTS.md) before coding. Every invariant has or **must get** a test. Do not delete assertions to go green.
- Smallest diff. Do not split `index.html` into a build pipeline to “clean up”.
- After a behaviour change: `cd plentry && npm test`, then vault (`CURRENT-STATE`, `CHANGELOG`, this file if the contract moved).
- **Do not ship to production** (`vercel deploy --prod` or `supabase functions deploy`) unless `npm test` exited 0.
