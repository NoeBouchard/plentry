# Flows

Step-by-step so agents do not invent a second checkout or a second Ops path. Screens live in `plentry/index.html`.

## 1. First customer — hold

1. Onboarding: goals → diet + tags → shop → household (1–6; cooking for becomes 2, 4, or 6) → budget → dinners 1–7 → cupboard ticks.
2. Menu shows exactly N verified dinners, each **serves** the week’s locked servings. Time is the 2-serving minutes, plus 5 for 4 and plus 10 for 6. **Modify** offers other **verified** catalog meals (no AI wait).
3. **Order this week** / Basket: skip cupboard spices already ticked; quantities from pack math; a line shows packs (`2 × 500g`). Optional qty edits stay on the confirm screen.
4. Confirm: **door address + UK phone** (not card billing) and a **2-hour delivery window** (day ≥ today+3 Europe/London, 08:00–22:00). After they pick a window, warn: **be in** — the driver will call. Saved onto `prefs.delivery` and `orders.address.delivery`; slot onto `slot_date` / `slot_start` / `slot_end`.
5. `pay` `checkout`: when the order names meals, **replaces quantities** with `basketFor` (database `meals.portions`, `items.servings`, `items.cupboard`, and that store's `pack_qty` / `pack_unit` when the unit matches) and then **rebuilds the basket server-side** (catalog keys, shelf product names/prices, whitelisted store search links). An order with no meal names keeps the stored basket. Writes `total` + `items` (including `servings`) back; expires any earlier Stripe session for this order; then Stripe Checkout (manual capture, cards only). Billing address is Stripe’s. Hold ≈ (basket + 5%) × 1.30. The client only follows a `https://checkout.stripe.com` URL.
6. Webhook `checkout.session.completed` → `payment_status=authorized` **only if** the row is still `unpaid`/`none`/`canceled` (keeps in-app delivery; records the real hold + session id; DB errors are 5xx so Stripe retries). Telegram fires **once**, list built from the row `pay` wrote, **PHONE:** first, **MUST book:** the promised window.
7. Customer lands on **Orders** (`?paid=1`). Timeline: hollow until done. Copy: **We'll deliver {window}**. **Issue** on any paid order. Each dinner has a **Cooking instructions** button (method snapshotted on the order).

The row itself is born `unpaid` / `new` with no hold — the DB trigger forces those on INSERT whatever the client sends.

## 2. Returning customer — same door?

Confirm shows **Deliver to this address?** (name, address, **phone**) when Profile has a complete door address including a UK phone. Missing phone (or any required door field) skips the reuse card and shows the form. **Use a different address** edits the form (pre-filled) and can **Use the saved address** to go back. Paying writes the chosen address to the profile again. The slot picker is always on Confirm.

## 3. Ops — shop and capture

1. Founder email only (`noyouchka.bouchard@gmail.com`). Once 2-step verification is on (Profile → **Security**), each login asks for the 6-digit code **before** Ops / Meals appear. The code sheet stays up until the code succeeds (tapping the dimmed area does not close it). Nav **Ops**.
2. Unpaid: faded, status locked, **do not shop**.
3. Authorized: **Phone** (the number the driver will call) then **Deliver to** the door address. Copy list / Open {store}. Shop with the **Wise (or other) float** — Stripe balance is not a Tesco card. Start a **new** supermarket checkout for this row; paste **this order’s** name, address, and **customer phone**. Do not rewrite the account-default home address.
4. Type till £ → preview customer charge (till + 5%) → **Charge £X** → **Confirm £X**.
5. Captured: **Money received — £X is in Stripe**. If the supermarket has the **promised window**, **Confirm this window** (marks **Ordered**; customer sees “{store} delivers {window}”). If it does not, **Message customer** (Inbox thread, `issue_status=open`) and wait — do not book a different slot. Later tap **Delivered**.
6. Never type a till whose +5% is above `amount_held` unless you mean to — in that case Ops charges the **hold** and Plentry covers the rest from the float.

£1.00 in Ops is a **money test** (charges £1.05). Do not place a supermarket order for that test.

## 4. Issue + Inbox

Customer **Issue** on a paid order opens the thread. Founder nav **Inbox** (open-count badge) lists open threads; **Message customer** on an Ops card starts one. Poll while the modal is open. Customer messages also Telegram-ping. Founder can **Resolve**.

## 5. Meals — publish a dinner

**Meals** tab (an admin: a row in `public.admins`, at aal2). **New meal** = `reviewed_at` null. Add is blocked until the dinner has a name, catalog ingredients, and at least one instruction step. **Verify & publish** also needs a category and sets `reviewed_at`. Customers can pick it on New week / Modify with no deploy. Unpublish returns it to New meal. Remove deletes the row; orders already store the method. The live list is grouped by the 7 categories. An expanded card shows the 2, 4, and 6 serving lists the customer sees. Seasoning keys already on the meal stay on save.

**Ingredients** tab (same admin gate). Prices and per-shop pack quantity/unit for Tesco, Sainsbury's, Asda, and Waitrose. Each shop that already has a row is updated on its own. A shop with no row is inserted as a full row, reusing that group's slug and category (including `grocery` and `fresh`). The client sends those as separate statements, not one transaction. Add is blocked until shop, category, price, and a meal key are set. Editing an existing row does not require a meal key. The shelf product name changes only when that shop's name was edited to a non-empty value; a blank field leaves the stored name. The pack label is written only when it changed. A new shop row needs a shelf product name. A key that is not in the code catalog is saved and marked not yet usable in baskets.

## 6. Advisor

Advisor chat is the only meal-generation AI. It may insert drafts (`reviewed_at` null). Adding proposals fills empty days then replaces from Monday, **still capped at N**. It must not call `meal_options` for Modify.

## 7. What not to “fix”

- Do not send the customer to pay Tesco themselves.
- Do not take the Stripe payout as the Tesco float (first payout is days later; Instant Payouts do not skip that).
- Do not use Stripe shipping as the door address when `address.delivery` exists.
- Do not grow the week past `prefs.meals`.
- Do not verify meals by editing SQL in chat when the Meals tab exists.
