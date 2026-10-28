# Changelog

Vault history of **functional** product changes. Newest first. Agents append here when staging.

## 2026-10-28 — Order receipt and orders DELETE/TRUNCATE revoke: SQL applied

- **Applied (GMT, 28 Oct 2026).** `supabase/order_received.sql` at ~15:35:50 (applied file sha256 `210864e66cee43103ad55510a8283db333074d95fcfbe68e33babfddad4d6c4c`). `supabase/orders_revoke_delete_truncate.sql` at ~15:41:55 (applied file sha256 `49295eb80d24589386c628ab9eda8f89c376b8949756ff563da2f019b23e13a2`). Both with `execute_sql`, not migrations.
- **Files.** Only the header comment of each `.sql` changed (PENDING → APPLIED), so the repo file sha256 no longer equals the applied one. The SQL statements are unchanged. Source contracts now assert the APPLIED header and no PENDING. No new tests; `npm test` stays **240**.
- **Not in this change.** No static or function deploy.

## 2026-10-28 — Revoke DELETE and TRUNCATE on orders (SQL written; not applied)

- **Open.** After the 28 Oct capture-split ship, anon and authenticated hold table privileges `rdDxtm` on `public.orders`, plus column-level INSERT and UPDATE. DELETE and TRUNCATE remain. TRUNCATE bypasses RLS.
- **App.** No delete of an order. `index.html` inserts, selects, and updates `orders`. `pay` and `stripe-webhook` select and update through the service role. Nothing in the app deletes an order.
- **SQL.** `supabase/orders_revoke_delete_truncate.sql` revokes DELETE and TRUNCATE from anon and authenticated in one transaction. Header says `PENDING, not applied`. sha256 `49295eb80d24589386c628ab9eda8f89c376b8949756ff563da2f019b23e13a2`. Apply with Supabase SQL (`execute_sql`), not a migration. Commented rollback: `grant delete, truncate on table public.orders to anon, authenticated`. A commented `has_table_privilege` query checks both roles and both privileges. Other privileges and column grants stay. Independent of PR #34 (`feat/order-completion-email`). Whichever of this change and #34 merges second will have a trivial doc and test-count conflict.
- **Tests.** One source contract: the file exists, the revoke names both roles, the active SQL has no GRANT of DELETE or TRUNCATE, the rollback is commented, and `supabase/migrations/` does not exist. `npm test` **215** (main `ea90a314` is **214**).

## 2026-10-28 — Order receipt (not applied)

- **Complete.** An order is complete when `received_confirmed_at` is set. Status values stay `new | ordered | delivered`. `delivered_at` is stamped when status becomes `delivered`. Moving status away before anyone confirms clears `delivered_at`. Moving status away after `received_confirmed_at` is set raises `cannot change status after the order is received`.
- **Customer.** The Orders badge and the **Did it all arrive?** card show only for that customer's own delivered, unconfirmed orders. **Yes, complete** calls `confirm_order_received` (`user_id = auth.uid()`, `received_confirmed_by = 'customer'`). The button disables while that request is in flight. If it fails, the card says **We couldn't confirm this just now, please try again**, the button enables again, and the order list reloads. **Something's wrong** opens the existing issue thread. The card says auto-completes in X hours, from `delivered_at` plus 48, unless `issue_status` is `open`, in which case it says **Paused while an issue is open**. The timeline step is **Complete**. At 320px the four labels stay on one line.
- **Ops.** Badges are **Awaiting receipt (Xh left)** and **Complete ✓ (customer/auto/ops/backfill)**. An open issue replaces the hours with **Paused while an issue is open**. Chips are All, Awaiting receipt, and Complete. **Mark complete** calls `admin_mark_received` (`received_confirmed_by = 'ops'`), and the function checks `is_admin_aal2()`. A failed status change, including moving a complete order away from `delivered`, shows the error to Ops.
- **Auto.** `auto_complete_orders()` sets `received_confirmed_by = 'auto'` where status is `delivered`, `received_confirmed_at` is null, `delivered_at` is at least 48 hours ago, and `issue_status is distinct from 'open'`. An open issue pauses auto-complete. Resolving it does not restart the 48 hour clock and does not add a timestamp. pg_cron job `plentry_auto_complete` runs `*/15 * * * *`. EXECUTE is revoked from public, anon, and authenticated.
- **Guard.** A direct write to `delivered_at`, `received_confirmed_at`, or `received_confirmed_by` raises unless the transaction-local flag `plentry.receipt_write` is `'1'`. This file grants no table or column privileges. Until `orders_capture_split.sql` revokes table UPDATE, that guard is what stops a client write, because a table-level UPDATE covers columns added later.
- **Backfill.** At apply time, a delivered row is marked `received_confirmed_by = 'backfill'` only when `received_confirmed_at` is null, `delivered_at` is null, and `issue_status` is not `open`. The first apply still covers historic deliveries with no `delivered_at`, including #31 and #38, and #39 when its issue is not open. A re-apply does not confirm a live delivery that already has `delivered_at`; `auto_complete_orders()` does that at 48 hours. An open issue, including #39 while it is open, stays awaiting receipt so Ops can mark it complete. PR #34's completion-email backfill must treat `backfill` rows as already emailed or skipped, so applying that file does not send a surprise email.
- **Open issue.** The only open value is `issue_status = 'open'` (`orders_issue_status_sane` allows null, `open`, and `resolved`). null and `resolved` do not pause auto-complete.
- **SQL.** `supabase/order_received.sql` is **PENDING, not applied**. sha256 `210864e66cee43103ad55510a8283db333074d95fcfbe68e33babfddad4d6c4c`. Loose file. Paste it into the Supabase SQL editor, or run it with `execute_sql`. Do not create `supabase/migrations/`. No edge function changes.
- **Not live.** No SQL applied. Static not promoted. `npm test` **239** on main after the servings, delivery-window, and hidden-meals changes (**229**); this adds 10 I-O19 tests: 3 jsdom, 2 source contracts, 5 PGlite.

## 2026-10-28 — Hidden meals stay off the week

- **Catalog.** Customer reads, including the two fallbacks, select `id` and `reviewed_at` (and `category`). `isPublished` is the visibility rule: `reviewed_at` set, or a built-in fallback with no id. A catalog id with no `reviewed_at` is hidden. `loadCatalogMeals` returns visible meals only. An unpublished database row still blocks the built-in dinner of the same name. Admin Meals is unchanged and still lists unpublished rows.
- **Week load.** `ensureWeek` drops a saved dinner that is hidden or not in that catalog and swaps in a visible meal for that slot. Same category when the dropped dinner had one, otherwise the usual ranked pick (diet and the omnivore veg cap). The customer sees “We swapped N meals that are no longer available.” The cleaned week is saved. A second load does not swap those replacements again.
- **Checkout.** `placeOrder` checks the week against the visible catalog. A hidden or unknown dinner does not insert the order. The customer is asked to refresh the week.
- **Advisor.** A dinner the advisor just created stays unpublished in the review queue and is not added to the week. The customer sees “We've sent this idea to our kitchen to review.” A proposal that is already a published catalog dinner can still be added.
- **Checkout.** When `placeOrder` refuses a hidden or unknown dinner, it runs the same `ensureWeek` swap immediately. The “We swapped N meals…” notice shows without a reload, and the customer can retry.
- **Built-ins.** A successful database read does not merge the built-in dinner list back in. An unpublished or removed built-in stays hidden. Built-ins are only the fallback when the read fails. Admin Meals is unchanged.
- **Not live.** No SQL. No meal rows edited. No `supabase/migrations/`. Static and edge functions are not deployed. `npm test` **229** on main after the servings and delivery-window changes (**223**); I-W09 adds 6 tests.

## 2026-10-28 — A stale delivery day is not a choice

- **Checkout.** A chosen day that is no longer in the window (left open past midnight, or inside the 3-day lead) is cleared, with its time. Time buttons stay off and pay stays off. The disabled pay button shows “Choose a delivery day and time to continue” (`aria-describedby="slot-prompt"`). That line is hidden once both are chosen. Day and time buttons set `aria-pressed`. Money, SQL, and edge functions are unchanged.
- **Tests.** `npm test` **223** on main after the servings change (main `5e12e97` is **220**). This adds 1 jsdom test.

## 2026-10-28 — Delivery window is a required day, then a time

- **History.** `git log -S` / `-G` on `slotPickerHtml`, `id="slot-days"`, and `Delivery window` finds one commit: `b8d1b248b6f2d11e83dc443ae6e726440631cd72` (21 Sep 2026, 15:20:54 Europe/London), which added the picker. That commit is in the pilot work merged as PR #1. No later commit removes those strings. PRs #28–#35 do not change the confirm slot UI (`index.html` is the same from PR #32 `89c84c1b` through main `ea90a314`). Live getplentry.com matches that file. Orders since the picker shipped have `slot_date`, `slot_start`, and `slot_end`, including customer order #39 (25 Oct, window 28 Oct 08:00–10:00). There is no commit that deleted or hid the picker.
- **Checkout.** Confirm still asks for the 2-hour window. A time tap does not select the earliest day. Time buttons stay off until a day is chosen. Pay stays off until both are chosen, and the window says so. Choosing a day or a time re-renders the modal and keeps a half-typed door address. The insert still sends `slot_date`, `slot_start`, and `slot_end`. `delivery_slot` is still the Ops snapshot (`adminConfirmSlot` / `adminSaveSlot`). Money, SQL grants, and edge functions are unchanged.
- **Tests.** This adds 1 jsdom test and 1 source contract (2 of the 3 tests the delivery-window fix adds).

## 2026-10-28 — Servings follow household size, this week, the recipe, and checkout

- **Household.** Cooking for stays 2, 4, or 6. A stored number is kept only when the customer chose it (`prefs.servingsChosen`, or a stored value other than the implicit default of 2). A missing key, or a stored 2 on a household that maps to 4 or 6, follows household size: 1–2 → 2, 3–4 and legacy `4+` → 4, 5–6 → 6. Hydrate, boot, and Profile save all use that. A profile from before servings shipped, household `4+`, no longer stays at 2.
- **This week.** Changing cooking for, or household size, asks before applying the new number to the week on screen. The prompt says the basket will be rescaled and any changes made to it will be reset. Accepting re-locks `weekServings` and rebuilds the basket. Declining leaves this week as it is; the next week you build uses the new number. A past order is not repriced. Boot or login shows that same prompt once when an implicit 2 becomes 4 or 6 and this week is still locked at the old number. Confirm re-locks the week and rebuilds the basket. Cancel leaves the week. Either answer sets `prefs.servingsWeekAsked`, so it is not asked again. It does not ask when nothing changed, the week already matches, or the stored number was a real choice.
- **Recipe.** The cooking-instructions view lists each scaled amount for the chosen servings above the steps. The note says step amounts are written for 2, and the factor (×2 for 4, ×3 for 6). A meal with no portions still lists ingredient names. Catalog methods are unchanged. The AI fallback, only when a dinner has no method, asks for the actual servings. A stored AI method written for a different number says so, for example “Written for 2, multiply by 2.”
- **Checkout.** The local order object stores `servings` immediately, so cooking instructions match the week before the row is reloaded.
- **Not live.** No SQL. No meal-content edits. No money change. `npm test` **220** (main `ea90a31` is **214**; this adds 6 tests: 5 jsdom, 1 source contract).

## 2026-10-26 — Capture integrity and the store/fee split (not deployed)

- **Capture.** After Stripe captures, `pay` checks the `orders` update and retries it three times (four tries, short backoff). If it still fails, it logs the order id, PaymentIntent id, and amount with no secrets, sends a Telegram ops alert (`TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`, shared `_shared/telegram.ts`), and returns 500 `capture_not_recorded`. Ops already shows `detail` from a non-2xx `payApi` response, so the card does not flip to Money received. A PaymentIntent that is already `succeeded` is not captured again; `amount_received` (pence → pounds) is written so a retry repairs the row. Status guards are unchanged. Admin MFA (aal2) is enforced only when `REQUIRE_ADMIN_MFA=1`. A missing split column (PostgREST `PGRST204` or Postgres `42703`) retries the write without `store_total`, `fee_amount`, and `overrun_amount`, so `amount_captured` and `payment_status` still save, and Telegram says the split wasn't recorded because the columns are missing.
- **Split.** Pure helper `_shared/capture.ts`. `store_total` is the till total. `amount_captured` is min(`Math.round(storePence * 105 / 100)`, hold). `overrun_amount` is the part above the hold. `fee_amount` is `amount_captured − store_total` (the 5% when there is no overrun, smaller under an overrun, negative when the till itself is above the hold — allowed, and Telegram is told). The same update writes all four. The penny check uses that same integer rounding. A mismatch alerts and does not block. On the already-succeeded path with no till total, the split stays null. £4.30 is 452 pence; the old pound float expected 451 and would have alerted.
- **Reconcile.** Founder-email task `reconcile`. Admin MFA (aal2) only when `REQUIRE_ADMIN_MFA=1`. `dryRun` defaults to true and only reports. `dryRun: false` fills `amount_captured` and `payment_status` from a succeeded PaymentIntent when `amount_captured` is null. It does not invent the split. Limited to 50 authorized or captured rows.
- **SQL.** `supabase/orders_capture_split.sql` is **PENDING, not applied**. sha256 `15146e29c11c273cf5a3d2bc653091e4a243aa36f96a4bb18b6abca78636a022`. Not a migration. Apply it, then hand-deploy `pay` and `notify-order` in the same GO. `notify-order` behaviour is unchanged. Rollback: redeploy the previous `pay` and `notify-order`, then restore `validate_order` from `security_hardening_v3.sql`, restore table INSERT/UPDATE for anon and authenticated, then drop the three columns. That table GRANT reopens client writes to later columns such as PR #34's `completion_email_*` until that PR's BEFORE INSERT reset and guard are in. The SQL header says to skip the GRANT in that case.
- **Grants.** Live today, anon and authenticated have table UPDATE, including `amount_captured`. Customers still cannot update `orders` (no customer UPDATE policy). The pending file revokes table INSERT and UPDATE from anon and authenticated and grants back only the columns the browser writes (`status`, `delivery_slot`, `issue_status`, and the checkout INSERT list). Money columns stay on `service_role`. A negative `fee_amount` is allowed down to -1000.
- **Not live.** No SQL applied. `pay` and `notify-order` not deployed. `npm test` **214** (main `985a451` is **196**; this adds 18 I-M10 tests).

## 2026-10-26 — Revoke MAINTAIN on meals (SQL written; not applied)

- **Open.** Anon and authenticated still hold `MAINTAIN` on `public.meals`.
- **SQL.** `supabase/meals_revoke_maintain.sql` revokes that privilege in one transaction: `revoke maintain on table public.meals from anon, authenticated`. The header says `PENDING, not applied`. The commented rollback is `grant maintain on table public.meals to anon, authenticated`. Loose file, not a migration. Not applied. Do not move it into `supabase/migrations/`. It does not change the 11-column SELECT grants.
- **Tests.** The contract test parses the revoke and the commented rollback. PGlite is Postgres 18, so it also runs the file: afterwards anon and authenticated lack `MAINTAIN` and still have the 11-column SELECT.

## 2026-10-26 15:34 GMT — production ship (PR #31, #30, #32)

- **Merged:** all squash, on 26 Oct 2026. PR #31 `4425f41134532850f5ef00d022955f7d77fa22b4` at 15:10:57 GMT. PR #30 `df0c53e00f8e9af8a734fae5daeb4944a6dec3b6` at 15:18:29 GMT. PR #32 `89c84c1beb26aec0453e76dd06aae8b0b7a85894` at 15:26:07 GMT.
- **Deploy to production:** Noé turned the Supabase GitHub integration setting off on 25/26 Oct 2026. After these three merges all 6 edge functions were unchanged and the Supabase Preview check was skipped.
- **Static:** `dpl_4DarVmBySV9ujJq3Lrdn7MJgDx93` from `89c84c1b`. Promoted at 15:34:52 GMT.
- **Rollback:** `dpl_E3gKjdssEyFx6NXbaNsLQo5Zvrbp`.
- **SQL:** `supabase/fix_meal_photos.sql` was applied to prod at about 15:42 GMT (8 rows). Applied file sha256 `199130acc9e977f7f068adbd6538509b67b50be723ce4c8d8964d7b9fc2e2729`. `supabase/meals_followups.sql` was applied to prod at about 15:42 GMT. Applied file sha256 `af014769bf7444bb464a7fb37448f278c67ea5872fa6801aa5bc818e05907fb8`. Both are loose files, not migrations. This vault stamps each header `APPLIED to prod 26 Oct 2026 ~15:42 GMT`. SQL statements are byte-identical to the applied files. Stamped sha256 `2f8957c2bee8e0b0d343b7aa5f8a5403a653b38e71436ff1cfe2388ec3139f78` (`fix_meal_photos.sql`) and `9d0b16af6e63c43e9ef4d26d4a662155800c7b56dd3332bfc6892ca04761be15` (`meals_followups.sql`).
- **Checks:** 52 of 52 photos return 200. Grants were as reviewed. Anon and authenticated each see 52 published meals and 0 drafts. The aal2 admin path is untested.
- **Open:** anon and authenticated still hold `MAINTAIN` on `public.meals`.
- **Edge functions:** `ai` was hand-deployed from v51 to v52 at 15:44:08 GMT on 26 Oct 2026 (`supabase functions deploy ai`, under a GO). `pay` v52, `checkout` v44, `notify-order` v45, `stripe-webhook` v43, and `newcoming` v37 are unchanged. These merges did not redeploy functions.
- **Vault only.** This entry records the ship. It does not deploy.

## 2026-10-25 — Meals column follow-ups (SQL written; applied 26 Oct 2026)

- **Grants.** `supabase/meals_followups.sql` revokes table SELECT from authenticated and grants the same 11 catalogue columns as anon: `id, name, emoji, time, ing, image_url, recipe, tags, reviewed_at, portions, category`. `created_by`, `source`, and `created_at` stay off both grants. A column revoke does not stick while table SELECT remains, so the table grant is revoked.
- **Admin read.** The Meals card shows `source` and `created_at`. `created_by` on advisor drafts is a customer id. Column grants are per role, so an aal2 admin cannot be given extra columns on `authenticated`. `admin_read_meals()` is security definer, checks `is_admin_aal2()`, and returns those columns plus the catalogue, including drafts. The Meals screen calls it when the function exists and otherwise keeps the table select. The card does not print `created_by`. `pay`, `newcoming`, and advisor writes use the service role and are unchanged. `ai`'s user-scoped read is `name, emoji, time, ing, tags`.
- **Anon writes.** The file revokes anon INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, and TRIGGER. Supabase grants those by default. TRUNCATE ignores row level security.
- **Authenticated writes.** The same file revokes DELETE, TRUNCATE, REFERENCES, and TRIGGER from authenticated, and the commented rollback grants them back. INSERT and UPDATE stay, because admin insert and unpublish need them. Nothing in `index.html` or `supabase/functions` deletes a meal. Unpublish is an update of `reviewed_at`. `ai`, `pay`, and `newcoming` use the service role.
- **Columns.** Any new public catalogue column on `meals` must be added to both grants in this file and to the anon grant in `meals_read_published.sql`.
- **Why.** `meals_read_published.sql` is applied to prod (25 Oct 2026 12:59 GMT, after PR #28). Signed-in non-admins could still read `created_by` and `source` on published rows until this file was applied.
- **Applied** 26 Oct 2026 at about 15:42 GMT. See the production-ship entry above. Loose file under `supabase/`, not `supabase/migrations/`. This follow-up does not change the SQL statements in `meals_read_published.sql`. Do not apply this from GitHub. The header says APPLIED. PGlite still runs both files in `npm test`. Grants were as reviewed. Anon and authenticated each see 52 published meals and 0 drafts. The aal2 admin path is untested. Anon and authenticated still hold `MAINTAIN` on `public.meals`.

## 2026-10-25 — Four more dinner photos that 404

- **Photos.** Spanish tortilla with tomato salad, Beef stuffed peppers, Tomato & parmesan baked rice, and Tandoori-style yoghurt chicken with rice used Unsplash IDs that return 404 HTML. The potatoes ingredient fallback used the tortilla ID. Each now has its own working `images.unsplash.com` crop: potato omelette (`photo-1639669794539-952631b44515`, also the potatoes fallback), baked stuffed peppers in tomato sauce (`photo-1592119747782-d8c12c2ea267`), parmesan risotto (`photo-1633964913295-ceb43826e7c9`), and tandoori chicken (`photo-1617692855027-33b14f061079`). Updated in `index.html`, `supabase/meals_images.sql`, and `ai` (potatoes).
- **Database.** A read-only check found the old URLs on Spanish tortilla with tomato salad, Creamy Spinach & Feta Baked Potatoes, Beef stuffed peppers, Tandoori-style yoghurt chicken with rice, and Baked tomato & basil risotto. No row is named Tomato & parmesan baked rice. `supabase/fix_meal_photos.sql` adds one update per name, including that seed name, and keeps the old URLs in the commented rollback. Applied to prod 26 Oct 2026 at about 15:42 GMT (8 rows). See the production-ship entry.
- **Shipped** 26 Oct 2026. Static `dpl_4DarVmBySV9ujJq3Lrdn7MJgDx93` from `89c84c1b`, promoted 15:34:52 GMT. No `pay` change.

## 2026-10-25 — Three dinner photos that 404

- **Photos.** Chicken parm-style bake, Beef & bell pepper tacos, and Salmon tacos with lemon yoghurt used Unsplash IDs that return 404 HTML. Chrome blocks that response, so the cards failed. Each dinner now has its own working `images.unsplash.com` crop: chicken parm (`photo-1632778149955-e80f8ceca2e8`), beef tacos (`photo-1599974579688-8dbdd335c77f`), fish tacos with a white sauce and lime (`photo-1696935191484-7677e929b0dc`). The two taco dinners no longer share a photo. The tortillas ingredient fallback used the dead taco ID, so it now uses the beef taco photo (`index.html`, `supabase/meals_images.sql`, `ai`).
- **Database.** `supabase/fix_meal_photos.sql` is one update per meal inside a transaction, with a commented rollback. It is not under `migrations/`. Applied to prod 26 Oct 2026 at about 15:42 GMT (8 rows). See the production-ship entry.
- **Left at this commit.** Four other seed photo IDs still 404. The next entry replaces them.
- **Shipped** 26 Oct 2026 in the production-ship entry above. No `pay` change.

## 2026-10-25 13:14 GMT — production ship (PR #27, #28, #29)

- **Merged:** all squash, on 25 Oct 2026. PR #27 `fix/review-followups` `ca43eb1749a349804cb2845d639d9967e781f46e`. PR #28 `fix/meals-read-published` `31a864f2005b5a9f92ceec8b380bdbc750692a07`. PR #29 `fix/seeded-tiebreak` `7d1d53ace5ec9883802c4ca5f3bb92b7470699ec`.
- **Live:** A share that rounds to 0p while the dinner still owns a basket line shows the price, including £0.00. **From your cupboard** stays for a dinner that owns no basket line. Equal scores on New week and Modify break with a mulberry32 key from the week's seed and the meal id, then the id. Each New week tap mints a new seed. A `?seed=` link or `setWeekSeed` pins the sequence (`seed`, `seed+1`, `seed+2`). Modify stays on the seed of the week on screen. Anon and a signed-in non-admin read published meals only (`reviewed_at` set). Anon cannot read `created_by`, `source`, or `created_at`.
- **SQL:** `supabase/meals_read_published.sql` was applied to prod Supabase at 12:59 GMT on 25 Oct 2026. The applied file sha256 is `3efbb68ce7adc1f613a5251d412da0a1a31b8cbe4cb93858ac4eb5f4a701ac59`. Loose file, not a migration. Post-apply checks passed: `pg_policies` shows `read published meals` plus the 3 admin policies; anon has no table-level SELECT and exactly 11 columns granted; anon and authenticated each see 52 published meals and 0 drafts; anon REST `select=*` and `select=created_by` return permission denied. The admin-with-MFA draft visibility check is untested. This vault stamps the file header `APPLIED to prod 25 Oct 2026 12:59 GMT`. SQL statements and the commented rollback are byte-identical to the applied file. The stamped file sha256 is `fe56606436014f837d6513d725c524e9bdb1a2ed5a02033cab3f7a35d51162b4`.
- **Static:** `dpl_E3gKjdssEyFx6NXbaNsLQo5Zvrbp` from `7d1d53ac`. READY at 13:09:49 GMT, promoted at 13:14:43 GMT. `index.html` sha256 went from `d81025a6f85e6f23cb89bc0190fc8726773e5052ffe80e27bd4d66ca06281241` to `14fea34d522c3dbd74cbc30fdc138d1592e1b01360ccd239ea6c0a7197439c6c`.
- **Edge functions.** Each of PR #27, #28, and #29 also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. `pay` was v33 after PR #10 on 13 Oct. Nineteen merges to `main` since then, one auto-deploy each, left `pay` at v52. v52 is the deploy at 13:10:17 GMT on 25 Oct 2026, about 40s after #29 (`7d1d53ac`) merged.
- **Rollback:** `dpl_BARhEjagaW5Lbn4f4y22CheQ85Kh`.
- **Smoke:** passed before the promote, on the deployment, through a temporary Vercel share link (the deployment URL is SSO-protected), and after the promote on getplentry.com. A non-admin smoke test account exists for prod smoke tests. Its credentials live in box env vars `PLENTRY_SMOKE_EMAIL` and `PLENTRY_SMOKE_PASSWORD`.
- **Known:** the checkout quote returns `{live:false}` on prod, before and after this ship, so baskets use shelf prices. It is under review.
- **Vault only.** This entry records the ship. It does not deploy.

## 2026-10-23 — Seeded tie-break for New week and Modify

- **Order.** When two dinners have the same score, New week and Modify order them with a mulberry32 key from the week's seed and the meal id, then the id. A dinner with no id uses its name for that key. The key is computed once per dinner before the sort. Ordering does not call `Math.random`.
- **New week.** Each tap mints a new seed, so the next week usually changes. A shared `?seed=` link pins the sequence: the first New week uses that seed, and each further tap uses the next number (`seed`, `seed+1`, `seed+2`, wrapping at 2³²). `window.__plentry.setWeekSeed(4242)` (also `window.setWeekSeed`) does the same from the console. Modify, including Show 4 more, stays on the seed of the week on screen.
- **Smoke.** Open `https://getplentry.com/?seed=4242`. A whole number is used as-is; any other text is hashed. The value is stored for the tab (`plentry_week_seed`, plus the pin and the step). Tap **New week** to walk the sequence. `window.__plentry.weekSeed()` reads the seed of the week on screen.
- **Unchanged.** Score weights. Modify still lists 6, then up to 4, and still stops with the same message when the pool runs out. Prices, the shared basket block, and the hold stay as they are.
- **Shipped** 25 Oct 2026 at 13:14:43 GMT in the production-ship entry above. Static `dpl_E3gKjdssEyFx6NXbaNsLQo5Zvrbp` from `7d1d53ac`. This merge also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. `pay` v52 is that deploy, at 13:10:17 GMT on 25 Oct 2026. No SQL in this change.

## 2026-10-23 — Published meals read (SQL written; applied 25 Oct 2026)

- **Policy.** `supabase/meals_read_published.sql` drops `read meals` and creates `read published meals` FOR SELECT TO anon, authenticated USING (`reviewed_at is not null`). Anon loses table SELECT and is granted only `id, name, emoji, time, ing, image_url, recipe, tags, reviewed_at, portions, category`. `created_by`, `source`, and `created_at` stay off that list. `admin read meals`, admin insert, and admin update are not changed.
- **Why.** Before this file, production `read meals` let any signed-in user read the unpublished drafts, including `created_by` and `source`. Anon matched no row, so the site fell back to the 8 `FALLBACK_MEALS`.
- **Columns.** Names match `schema.sql`, `servings.sql` (`portions`), and `meals_categories_tags_ingredients_v2.sql` (`category`). No rename.
- **Client.** `loadCatalogMeals` and `catalogMealByName` already select a subset of that allow-list (they omit `category`). No query change. `loadAdminMeals` still selects `source` and `created_at` behind `isAdmin()`.
- **Applied** 25 Oct 2026 at 12:59 GMT. See the production-ship entry above. Loose file under `supabase/`, not `supabase/migrations/`. Do not apply it from GitHub. The header says APPLIED. `schema.sql` still recreates `read meals` if that file is re-run; run `meals_read_published.sql` again after that. Manual check: [TESTING.md](TESTING.md).
- **Edge functions.** Merge `31a864f2005b5a9f92ceec8b380bdbc750692a07` (PR #28) also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. The integration does not apply this loose SQL file.

## 2026-10-23 — From your cupboard means no basket line

- **Label.** A day card and a Modify option say **From your cupboard** only when that dinner owns no basket line: every ingredient it uses is ticked, so the basket has nothing left for it. A share that rounds to 0p while the dinner still owns a line shows the price, including **£0.00**.
- **Why.** A sliver of a shared jar can round to 0p without the cupboard covering that dinner.
- **Unchanged.** The shared `basketFor` block is byte-identical. `pay` is not in this change. `supabase/meal_ingredient_prices.sql` is not applied.
- **Shipped** 25 Oct 2026 at 13:14:43 GMT in the production-ship entry above (PR #27, inside the static from PR #29). This merge (`ca43eb1749a349804cb2845d639d9967e781f46e`) also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. No SQL in this change. `pay` v52 is the later #29 deploy, recorded in the production-ship entry.

## 2026-10-23 — Dinner prices sum to the basket (PR #26)

- **Merged:** squash commit `7f1453ea4722de15b4bdf0aae07a2f2ff681d859` on `main`. PR #26.
- **Live:** Modify lists 4–6 other verified dinners (6 when at least 6 fit), then up to 4 more that skip the week and meals already shown. A day card is that dinner’s penny share of this week’s whole-pack basket at 2, 4, or 6 servings. The cards sum to **Basket £**. A pack only one dinner uses is that dinner’s, including what is left in the pack. A shared pack is split by ingredient-cost weight: scaled portion ÷ pack × the shop’s first priced row (lowest id with a price). Seasonings are not inside the weight. A dinner with no usable ingredient cost counts as one average-cost dinner on that pack. Leftover pennies use largest remainder, and a tie goes to the earlier day. Modify simulates the swap and shows that share. When every ingredient of a dinner is ticked, so its share is £0.00, the day card and the Modify option say **From your cupboard**. A missing shop price on a loaded shelf says **Price soon** to a customer and **incomplete** to an admin. No shop, or a shelf that has not loaded, uses the catalogue price the way the basket does. The footer is Basket £ + delivery + 5%.
- **Pinned.** Tesco week (beef ragù, shakshuka, Spanish tortilla, salmon traybake, no cupboard ticks): basket £47.83 / £59.68 / £84.04 at 2 / 4 / 6. Shares at 2: ragù £18.52, shakshuka £13.77, tortilla £4.63, salmon £10.91. At 4: £25.96, £17.49, £5.32, £10.91. At 6: £36.20, £25.36, £9.47, £13.01. Pomodoro (meal 28) swapped in for salmon is £4.07 / £4.71 / £5.83. Its ingredient-cost weight stays £1.93 / £3.87 / £5.78.
- **SQL.** `supabase/meal_ingredient_prices.sql` stores that ingredient-cost weight. It stayed outside `supabase/migrations/` and was not applied. No ingredient price was changed.
- **Static:** `dpl_BARhEjagaW5Lbn4f4y22CheQ85Kh`. The merge also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. The shared `basketFor` block is byte-identical.

## 2026-10-23 — Log in opens the login form (PR #25)

- **Merged:** squash commit `f1f37b0e0bad5eff14912e9097b9d59e69b37e37` on `main`. PR #25.
- **Log in.** The header **Log in** opens email and password. Under that form, **Don't have an account?** opens the existing sign-up form (name, email, password). Sign-up still offers **Already have an account? Log in**.
- **Sign up stays sign up.** New week, choosing or swapping a dinner, meal details, the meal advisor, and checkout confirm without an account still open sign-up (**Create an account…**). The later guard **Log in so we can take the card hold** opens login. Onboarding does not ask for an account.
- **Why.** Log in was opening the sign-up form, with only a small Log in link underneath.
- **Static:** `dpl_69A69HuoPVqFbH22V1GggvgR9rdX`. Same Supabase email/password calls. No auth config, no SQL, and this change does not edit edge-function source. The merge also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. PR #26 shipped after this. The 26 Oct ship is the current static.

## 2026-10-21 — Cupboard pictures

- **Pictures.** Every cupboard row on onboarding (“What’s in the cupboard?”) and the Pantry tab has an in-house SVG: olive oil, butter, garlic, onions, lemons, curry paste, salt, black pepper, paprika, cumin, chilli flakes, mixed herbs, soy sauce, stock cubes. Garam masala (a seasoning a cupboard tick can skip; still not on the checklist) has one too. A name with no picture, including one added later, uses `vendor/cupboard/fallback.svg`. The basket’s cupboard lines use the same pictures at 28×28. The label sits next to the image, so the image is `alt=""` and `aria-hidden`. Width and height are fixed.
- **Files.** Sixteen SVGs under `/vendor/cupboard/`, 10,849 bytes together, served from our own domain. `/vendor/` already has an immutable cache. Drawn for this app. No third-party art and no hotlink.
- **Lemon.** The lemon picture is the fruit and its leaf. A stray orange dot on `lemons.svg` was removed. That file is 395 bytes (was 443).
- **Why.** The cupboard step was names only. A picture makes each oil and spice easier to scan on a phone.
- **Unchanged.** The shared `basketFor` block is byte-identical. `pay` is not in this change.
- **Edge functions.** The merge also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. Static was not promoted by this merge. No SQL.

## 2026-10-21 — Household postcode starts empty

- **Postcode.** Onboarding and Profile start with an empty postcode and the placeholder `e.g. E2 8AA`. Continue and Save still require a valid UK postcode. A postcode already stored on the profile, including a previously saved `E2 8AA`, still shows. Load does not fill one in.
- **Short week.** New week asks for N dinners and stops when no more published meals fit the diet. On 21 Oct 2026 the reviewed catalog is 52 of 77 rows: 21 meat, 8 fish, 17 vegetarian, 6 vegan. Vegan can fill at most 6, so a 7-dinner week is 6 dinners. Vegetarian can use those 6 as well (23). Pescatarian drops the 21 meat dinners (31). Omnivore can use all 52. The other 25 rows are unpublished and stay off New week.
- **Edge functions.** The merge also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. Static was not promoted by this merge. No SQL.

## 2026-10-19 — Clearing the Profile budget turns it off

- **Clear.** An empty or whitespace-only weekly budget on Profile saves `prefs.budget` as null. New week then has no ×1.2 cap, and the week screen has no under/over line. The household postcode shown in the delivery postcode box does not block that save. A real delivery edit still has to be complete.
- **Junk.** A non-numeric value, or a number below 1, is not stored. The saved budget stays as it was. A number above 500 is still clamped to 500.
- **Edge functions.** The merge also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. Static was not promoted by this merge. No SQL.

## 2026-10-19 — New accounts have no default budget

- **Unset.** `prefs.budget` is null for a new account. Loading local or cloud state does not fill £60 when the blob has no number. A stored number, including a previously saved £60, stays. Junk in the blob becomes null and is not rendered.
- **No budget.** New week fills without the ×1.2 first-pass cap. The week screen omits the under/over line, so it never shows £0 or NaN. Profile shows an empty field.
- **Set later.** Typing a whole-pound budget on Profile (1–500) stores it. The cap and the line then apply.
- **Edge functions.** The merge also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. Static was not promoted by this merge. No SQL.

## 2026-10-19 — Onboarding drops goals and budget

- **Steps.** Onboarding is shop → what you eat (everything / vegetarian / vegan / pescatarian, stored as `prefs.diet`) → dinner tags → household and UK postcode → dinners per week → cupboard. The goals step and the budget slider are gone. The postcode field moved onto household; that was the only place it was collected.
- **Diet.** Vegetarian, vegan, and pescatarian filter New week and Modify. Vegetarian keeps vegetarian and vegan. Vegan keeps vegan. Pescatarian drops meat. Omnivore still prefers meat and fish and does not hide meals.
- **Tags.** Meal prep is not offered as a new chip on onboarding or Profile. A saved `meal_prep` tag still shows, so it can be turned off, and it still weights the week until then.
- **Legacy prefs.** `prefs.goals` and `prefs.budget` stay on the profile blob. No schema change. New accounts have `goals: []`, so goal weighting adds nothing. If dinner tags are empty, saved goals still map (`decide` / `shop` / `waste` → quick / meal_prep). The budget goal still does not map to a tag. A stored numeric budget still soft-caps the first New week pass and the under/over line. New accounts have no budget until Profile sets one. `pay` does not read either field.
- **Edge functions.** The merge also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. Static was not promoted by this merge. No SQL.

## 2026-10-19 — Claude review runs only when asked

- **CI.** `.github/workflows/claude-review.yml` no longer runs on pull_request opened, synchronize, or reopened. It runs on `pull_request` `labeled`, and the job runs only when the label name is `claude-review`. Adding that label reviews the pull request's current head once. Remove the label and add it again to run another review. The prompt, `claude_args` (`--model opus`, `--fallback-model sonnet`, `--max-turns 100`, `--json-schema`, allowed tools), `allowed_bots`, the `ANTHROPIC_API_KEY` secret, and the `APPROVE` step are unchanged. A pull request that never gets the label has no `claude-review` check. Another label skips the job. It is not a required check.
- **Why.** A run costs about $0.50, which is too much to pay on every push. The plan is to run it once as a full check after onboarding, cupboard pictures, and Modify are done. See [RUNBOOK.md](RUNBOOK.md).
- **Edge functions.** The merge also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. Static was not promoted. This pull request changes the workflow file, so `claude-review` cannot approve it.

## 2026-10-19 — Docs: record the 15 Oct production ship (PR #20)

- **Merged:** squash commit `6833beb9de908c7b517ba77d43c09ac0d8f734c3` on `main`. PR #20.
- **Vault.** Records the 15 Oct static ship. The merge also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. Static was not promoted by this merge. No SQL.

## 2026-10-19 — Claude review uses a pay-per-use API key

- **Merged:** squash commit `1599a417fc564fe5368fad53c96da77eeab2cd5f` on `main`. PR #19.
- **CI.** `.github/workflows/claude-review.yml` sets `anthropic_api_key` to the `ANTHROPIC_API_KEY` secret. `--model opus` and `--fallback-model sonnet` stay. `CLAUDE_CODE_OAUTH_TOKEN` failed with a known 401 ([issue 1613](https://github.com/anthropics/claude-code-action/issues/1613), [issue 1614](https://github.com/anthropics/claude-code-action/issues/1614)). Fork pull requests still do not receive the secret, so `claude-review` fails on them by design. See [RUNBOOK.md](RUNBOOK.md).
- **Edge functions.** The merge also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. CI and docs only: no static build. This pull request changed the workflow file, so `claude-review` could not approve it.

## 2026-10-15 15:52 BST — production ship (PR #15)

- **Merged:** squash commit `e35b087b6a7f64e6cb50e0cc8dfde10ade247ca9` on `main`. PR #15.
- **Live:** a day card is that dinner’s penny share of the week basket (per-meal price split). The footer is groceries + delivery + 5%.
- **Static:** `pay` source did not change. Since PR #12 (`4699353a689e861491c056517a823a39cc15b7fe`, 15 Oct 2026) a merge to `main` does not auto-deploy static. This ship used the Vercel REST API: create with `autoAssignCustomDomains: false` and `gitSource.sha` that merge SHA, then promote. Production deployment `dpl_ByazVmgr1eDffUFhqEwwWRDdTVea`, promoted 15:52 BST on 15 Oct. The apex and www `index.html` sha256 begins `f529f335`. The merge also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit.
- **Rollback:** `dpl_5sz1cse98dHJ5op3sx4JH6Nino8E` (SHA `ad12a33c63d841ee8cbeaa1e6e28603038dfd8ec`).
- **Verified totals:** 2 servings £32.93 groceries / £37.73 total; 4 servings £43.53 / £48.86; 6 servings £54.89 / £60.78.
- **Known:** the headline price is based on the meal basket, not a basket the user has edited.
- **Vault only.** This entry records the ship. It does not deploy.

## 2026-10-15 — Day cards share the week basket

- **Prices.** A day card is that dinner’s penny share of the real week basket (selected meals, locked servings, shop, cupboard ticks). Shared packs split by the quantity each dinner uses. Seasonings and portion-less items split evenly across the dinners that use them. A cupboard tick costs 0. The cards add up to the groceries total; leftover pennies sit on the last dinner. Pricing each dinner with its own `basketFor([meal])` had been charging a full bottle of oil, a net of onions, and a seasoning jar on every card.
- **Footer.** Under the cards: groceries + delivery + 5% = the total, the same split `pay` uses for the hold. One line says the card hold adds a 30% buffer and only the actual amount is captured. **This shop** shows that total to the penny.
- **Unchanged.** The shared `basketFor` block is byte-identical. `pay` is not in this change.
- **Shipped** 15 Oct 2026 at 15:52 BST in the production-ship entry above. Static through the REST create and promote. The merge also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit.

## 2026-10-15 — Claude review config is valid; Opus is restored

- **CI.** `.github/workflows/claude-review.yml` sets `--model opus` and `--fallback-model sonnet` again. The Sonnet-only diagnostic reached the same instant `$0` `is_error` result, so the model flag was not the failure. Read, Grep, Glob, the `Bash(gh pr comment:*)` / `diff` / `view` rules, `allowed_bots: cursor`, and the `APPROVE` gate stay as they are.
- **Why.** Claude Code 2.1.300 (the version `anthropics/claude-code-action@v1` installs) accepts this prompt, `--json-schema`, `--allowedTools`, and `--max-turns`. With a dummy `ANTHROPIC_API_KEY` the first error is API auth (`authentication_failed`, HTTP 401), not an args, schema, or tool-spec error. An invalid `--json-schema` fails earlier, on stderr, with `--json-schema is not valid JSON`. The action then reports `--json-schema was provided but Claude did not return structured_output` and hides the result text unless `show_full_output` is on. This public repo does not turn that on. See [RUNBOOK.md](RUNBOOK.md).
- **Edge functions.** The merge also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. Static was not promoted. This pull request changes the workflow file, so `claude-review` cannot approve it.

## 2026-10-15 — Claude review uses the opus alias

- **CI.** `.github/workflows/claude-review.yml` sets `--model opus` and `--fallback-model sonnet`. On PR #15, run 38736528055, `--model claude-opus-5-5` errored in 297ms with 0 cost and empty `modelUsage`, so that id is most likely invalid or not available to the subscription token. Sonnet stays the only fallback. `opus` is not repeated on that list.
- **Why.** The full model id failed before any tokens. The `opus` alias is what the subscription token runs. See [RUNBOOK.md](RUNBOOK.md).
- **Edge functions.** The merge also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. Static was not promoted. This pull request changes the workflow file, so `claude-review` cannot approve it.

## 2026-10-15 — Claude review reads the whole app on Opus 5.5

- **CI.** `.github/workflows/claude-review.yml` sets `--model claude-opus-5-5` (Opus 5.5 on a Claude subscription OAuth token), `--fallback-model opus,sonnet`, `--max-turns 100`, and `allowed_bots: cursor` (that bot only; not `*`). PR #15 failed with `Workflow initiated by non-human actor: cursor (type: Bot)` because Cursor cloud-agent pull requests are pushed by that bot. Before the diff, the prompt reads AGENTS.md, `doc/ARCHITECTURE.md`, `doc/INVARIANTS.md`, `doc/CURRENT-STATE.md`, `doc/REQUIREMENTS.md`, all of `index.html`, every file under `supabase/functions/`, every SQL file under `supabase/`, and the tests. It judges the change against every feature it could affect. It checks the ×1.30 hold, the 5% fee, capture, the byte-identical `/* portions:start */`…`/* portions:end */` basket block, RLS and admin rules, XSS, and drift between those docs and the tests. The comment lists the features checked. Read, Grep, and Glob may run on the whole repo. Bash stays `gh pr comment` / `diff` / `view`. The structured `APPROVE` gate is unchanged. Job timeout is 120 minutes.
- **Why.** A short diff-only review can miss a feature the change still reaches. `claude-opus-5-5` is the Opus 5.5 id the `opus` alias resolves to on a subscription. The `opus` alias, then Sonnet, is the documented fallback when that id is overloaded or unavailable. The CLI sets no turn limit unless `--max-turns` is passed; 100 covers a whole-app read. See [RUNBOOK.md](RUNBOOK.md).
- **Edge functions.** The merge also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. Static was not promoted. This pull request changes the workflow file, so `claude-review` cannot approve it.

## 2026-10-15 — REST ship path for the team Vercel token

- **Runbook.** `VERCEL_TOKEN` is a team `noebouchards-projects` token, stored as a box secret for the Plentry Engineering bot, created 15 Oct 2026, 90-day expiry (about 13 Jan 2027). The value is not in git. CLI 63.1.0 returns `User not found (404)` on that token. [RUNBOOK.md](RUNBOOK.md) gives the REST create (`POST /v13/deployments`, `autoAssignCustomDomains: false`, `gitSource.sha` the merge SHA), promote (`POST /v10/projects/prj_lf6RxDIun7rFk6NDUagt8Ve0lme0/promote/{deploymentId}`), and read-prod (`GET /v13/deployments/getplentry.com`), all with `teamId=team_QHpJBQejbrxZ2PhEZQlmbuhj`.
- **Claude review gate.** The repo is public, so fork PRs do not receive `CLAUDE_CODE_OAUTH_TOKEN` and `claude-review` fails. That is intended. `claude-review` becomes a required check only after it has gone green on a real pull request.
- **Edge functions.** The merge also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. Docs only: static was not promoted.

## 2026-10-15 — Claude review gate

- **CI.** `.github/workflows/claude-review.yml` runs `anthropics/claude-code-action@v1` on pull_request opened, synchronize, and reopened. The job `claude-review` reviews the diff for bugs, security, and AGENTS.md, posts a comment ending in `VERDICT: APPROVE` or `VERDICT: CHANGES_REQUESTED`, and fails unless the action's `structured_output.verdict` is `APPROVE`.
- **Why.** `npm test` does not read a diff for security or AGENTS.md. The verdict is a required check once Noé installs the Claude GitHub app, runs `claude setup-token`, sets `CLAUDE_CODE_OAUTH_TOKEN`, and adds `claude-review` next to `test` on the main ruleset. See [RUNBOOK.md](RUNBOOK.md).
- **Edge functions.** The merge also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. Workflow and docs only: static was not promoted. The action does not review a PR whose workflow file differs from `main`, so this change cannot approve itself.

## 2026-10-15 — main no longer auto-deploys static

- **Git.** `vercel.json` `git.deploymentEnabled` is `{ "main": false }`. `github.enabled` is the deprecated key; this uses the current one. Any branch left out stays enabled, so pull-request and other-branch previews still deploy. A boolean `false` would stop every branch.
- **Why.** From 13 Oct 2026 a merge to `main` auto-deployed static while `pay` was treated as a separate step. The 13 Oct ship was mismatched for about 37 seconds. Vercel static after this commit is the REST create (`autoAssignCustomDomains: false`; a logged-in founder CLI is `vercel deploy --prod --yes --skip-domain`) and a promote. From 15 Oct until 25/26 Oct the Supabase GitHub integration redeployed every edge function on a merge to `main`. Deploy to production is now off. Functions deploy by hand with `supabase functions deploy <name>` or MCP, under a GO. If that setting is re-enabled, every merge redeploys all functions. A docs-only merge does not promote static and does not apply loose SQL. Never create `supabase/migrations/`.
- **Edge functions.** The merge also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. This commit turns the Vercel Git hook off once it is on `main`. It does not alias getplentry.com. Production static at that moment was still the 13 Oct deployment. The PR #15 ship the same day (entry above) is the later static. Production static after this commit is the REST create (`autoAssignCustomDomains: false`) and a promote.

## 2026-10-14 — Docs: record the 13 Oct production ship (PR #11)

- **Merged:** squash commit `ad12a33c63d841ee8cbeaa1e6e28603038dfd8ec` on `main`. PR #11.
- **Vault.** Records the 13 Oct ship (PR #10, `pay` v33). The merge also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. Static was not promoted by this merge. No SQL. The 13 Oct entry below stays the record of v33.

## 2026-10-13 14:09 BST — production ship (PR #10)

- **Merged:** squash commit `711f059d9087e65406d3004c7d29aa1d3efd0e9c` on `main`. PR #10.
- **Live:** garam masala is one jar per week at any servings (2, 4, or 6).
- **Static:** Vercel's Git integration auto-deployed production on that merge as `dpl_FjLuhYS8QSV28DcxmqnPzdGWjdWL`, created at 14:09:28 BST, aliased to getplentry.com and www.
- **Edge:** `pay` went from v31 to v33 at 14:10:05 BST. The deployed files are byte-identical to the merge SHA, and `verify_jwt` is true. A v32 probably existed between v31 and v33. Its contents, and who deployed it, are unclear.
- **Gap:** static and `pay` were mismatched for about 37 seconds (14:09:28 to 14:10:05 BST).
- **Vault only.** This entry records the ship. It does not deploy.

## 2026-10-13 — Garam masala is 1 pack

- **Seasoning.** The catalog key `garam masala` is on the shared `SEASONINGS` list in `index.html` and `supabase/functions/_shared/portions.ts` (the block between the portion markers, kept byte-identical). It is 1 pack at 2, 4 and 6 servings. A cupboard tick removes that line and leaves the other lines as they are. `PACKS` and `INGREDIENTS` use `pack: null` (display unit still `jar`, £1.10), the same as salt. A shelf row in grams does not scale it.
- **Why.** It was a 20 tsp jar, so `basketFor` did `ceil(tsp × servings / 2 / 20)`. Chicken & chickpea curry stores 1 tsp, which was already 1 pack at 2, 4 and 6 (1, 2 and 3 tsp). A week that sums past 20 tsp was more than one jar: 8 tsp across seven dinners is 24 tsp at 6 servings, which was 2 packs and is now 1. The hold moves only by that one £1.10 line.
- **SQL.** `validate_meal_write` in `admin_roles.sql` keeps its own unit map. `garam masala` is still `"tsp"` there. Empty string is the seasoning skip (salt and the other spices). The trigger checks an admin portion write; it does not scale the shop. Existing curry rows store 1–2 tsp, which still pass. No database change.
- **Shipped** 13 Oct 2026 in the production-ship entry above. `pay` imports `portions.ts`, so static and `pay` went out on the same merge. They were mismatched for about 37 seconds.

## 2026-10-08 16:16 BST — production ship (PR #8)

- **Merged:** squash commit `330700587d11735cf229d7622099f44fc10203ac` on `main` at 16:16 BST. PR #7 was closed unmerged because #8 supersedes it.
- **Live:** the half-pack basket rule (shared pack, from PR #7), per-shop pack sizes from `ingredient_prices` with a fallback to code `PACKS`, and the Admin Meals and Ingredients areas.
- **SQL:** `supabase/admin_roles.sql` applied on production project `ucciqthwxnlkjalwlhvh`. `public.admins` has exactly 1 row (Noé, the founder), with only a SELECT policy for authenticated users. Further admins are added by hand in the SQL editor. `public.meals` has no DELETE policy, so meals are unpublish-only.
- **Static:** Vercel production `dpl_GK8zziUE3CyJT3QaoKSCEoogNdHn`, aliased to getplentry.com and www. It replaces `dpl_FYr7g7rS4RyU2jNEeUt3pzNkbFg1`.
- **Edge:** `pay` is v31. Before this ship, production was running `pay` v30. `pay` v29 was the 6 Oct servings ship. No other edge function was redeployed.
- **Vault only.** This entry records the founder deploy. It does not deploy.

## 2026-10-08 — Admins stay Noé; meals are unpublished, not deleted

- **Admins.** `public.admins` keeps RLS. Authenticated users have a select policy and no insert, update, or delete policy. `admin_roles.sql` drops `admins insert admins` (and the update and delete names) and does not recreate them. A new admin is inserted by hand in the SQL editor. There is no add-admin control in the app. The founder row in that file is still the migration-role insert.
- **Capture.** `pay` task `capture` is still the founder email plus aal2 (I-M07). Unchanged.
- **New keys.** A meal key outside the 46-key code catalog is still stored on the shelf and flagged not usable in baskets. `pay` still rejects it. Unchanged.
- **Meals.** `admin_roles.sql` drops `admin delete meals` and does not recreate it, including the live policy that uses `is_founder_aal2()`. After a re-run, `meals` has no DELETE policy for authenticated users. The Meals editor has Unpublish and no Remove button. A customer's current week names dinners; if a row is deleted, `pay` builds that dinner with `ing []` and the hold is short.
- **Shipped** later the same day in the production-ship entry above. `admin_roles.sql` is applied.

## 2026-10-08 — Switching shop uses that shop's packs

- **Comparison.** Each supermarket card is priced with that shop's own pack map. It does not reuse the basket that was built for the shop selected at build time.
- **Shop change.** `pickStore` rebuilds an unedited basket for the new shop. An edited basket keeps lines the user added and leaves removed lines off; counts the meals derive are recomputed for the new shop. The confirm hold is that shop's derived grocery total plus delivery, the same number `pay` holds. A hand edit does not change the hold: `pay` still rebuilds from the meals.
- **Duplicate shelf rows.** The same `meal_key` and store uses the lowest numeric `id`, or the first row when there is no id. `firstShelfRow` lives in the shared block. The client and `storePacksFromPrices` both call it. `pay` selects `id` with the price row.
- **Shipped** later the same day in the production-ship entry above.

## 2026-10-08 — Per-shop packs on the basket

- **Folded in** `cursor/fix-basket-order-dependency-cd89` at `141594fa` (the half-pack rule, `holdAmount` matching `pay`, potatoes **2000 g**, lemons **4**, tomato purée **200 g**). That branch is not merged on its own. Its changelog section below stays.
- **Store pack.** `basketFor` takes a pack map for the order's store, built from `ingredient_prices.pack_qty` / `pack_unit` matched by `meal_key`. The row is used when `pack_unit` matches the code unit, or converts exactly (`g`/`kg`, `ml`/`l`). Any other unit keeps the code `PACKS` entry (garam masala 38 g does not replace 20 tsp; Sainsbury's red onions 1000 g do not replace 3 pc). A matching unit with a different quantity is used (Sainsbury's onions are 3 pc, not the code 6). Seasonings stay 1 pack. Cupboard ticks still skip the line. The half-pack spare is computed with that store pack. The block does not fetch; `index.html` passes `storePackMap` and `pay` passes `storePacksFromPrices`. No new SQL. The columns are already on `ingredient_prices`.
- **Shipped** later the same day in the production-ship entry above.

## 2026-10-08 — Admin meals and ingredients

- **Admins list.** `supabase/admin_roles.sql` adds `public.admins` and `is_admin()` / `is_admin_aal2()`. The five Ops/Meals policies, ingredient price writes, inbox, and unpublished meals use that instead of the founder email. The founder row is inserted by the script. Until the table has any row, the founder email still counts, so the account is not locked out between this file and the static ship. **Applied 8 Oct 2026** on production (`ucciqthwxnlkjalwlhvh`). `public.admins` has exactly 1 row (Noé).
- **Meals tab** groups the live catalog by the 7 categories. Each card shows the customer view: scaled lists for 2, 4, and 6, the extra minutes, the "Written for 2" note, and the method. Add is blocked until name, at least three catalog ingredients, and one instruction step. Publish also needs a category. Portion units must match the catalog pack unit. Seasoning keys already stored are kept. Remove is a hard delete after a confirm that says past orders keep their snapshotted method — Unpublish is the reversible path. `validate_meal_write` checks admin sessions only (`auth.uid()` is not null), so the advisor and SQL editor keep writing as they do today.
- **Ingredients tab** groups `ingredient_prices` by category, including live `grocery` and `fresh` rows. Save updates each existing shop by row id (`price_gbp`, `pack_qty`, `pack_unit`, `pack_size` when the pack label was edited, and `product_name` only when that shop's name was edited to a non-empty value). Clearing the shelf name leaves the stored product name. A shop with no row is a separate full insert that needs a shelf product name and reuses the group's slug and category, so `grocery` and `fresh` can gain a missing shop. These statements are not one transaction. A partial upsert cannot do this: Postgres checks NOT NULL and the BEFORE INSERT trigger before it resolves the conflict. Remove deletes by row id, so pantry rows with no `meal_key` can be removed. Add is blocked until shop, a known category, a price, and a meal key are set. A key that is not in the code catalog is saved and flagged **not yet usable in baskets**. `validate_ingredient_price` is also admin-session only, and it does not reject seasoning pack sizes on the shelf. A brand-new slug still needs one of the six catalog categories.
- **Catalog decision.** The hardcoded lists stay. Copying new keys into `INGREDIENTS` would not make `pay` accept them (`rebuildBasket` still uses `CATALOG`), and reading `pack_size` text as the basket pack would change quantities. Shelf prices for keys that already exist still flow through `loadShelfPrices`. `basketFor` now takes per-shop `pack_qty` / `pack_unit` when the unit matches. A meal key that is not in the code catalog is still rejected by `pay`.
- **Shipped** later the same day in the production-ship entry above. Admin Meals and Ingredients are live.

## 2026-10-08 — Basket order no longer changes the shop; hold display matches pay

**Bug fixes:**

1. **Meal order dependency removed** — Mixing a portioned dinner with a dinner that has no portions used `max`, so the pack count depended on which meal was seen first. The basket is now order-independent. Portioned meals sum a scaled need and round up to whole packs. If any no-portions dinner (or a unit mismatch) uses that ingredient, add one extra pack only when the spare in the last pack is under half a pack. Several no-portions dinners share at most that one extra pack. An ingredient used only by no-portions dinners stays at 1 pack. Same block in `index.html` and `supabase/functions/_shared/portions.ts`.

2. **Client hold display now matches pay exactly** — The client was rounding the 5% fee to pence before ×1.30, so some holds showed 1p under Stripe (Tesco 4 servings: modal £85.55, charge £85.56). `holdAmount()` is now `Math.round(shop * 1.05 * 1.30 * 100) / 100`, the same formula as `pay`.

3. **Stripe description** — Checkout copy said "~15% buffer". The multiplier is 1.30, so the text now says "~30% buffer".

**Shelf packs:** one pack size per key, taken from live `ingredient_prices` where Tesco, Asda and Sainsbury’s agree (or all four). Potatoes **2000g** (was 1000g; the £1.32 line is a 2kg bag). Lemons **4** (was 3). Tomato purée **200g** (was 65g). Waitrose potatoes are 2.5kg and are not a separate size. Prices unchanged.

**Tests:** `npm test` on `main` is **114/114** (the vault line that said 109 was stale). This change is **119/119**: ragù + no-portions pomodoro is 2 passata and 1 spaghetti at 2 servings in both orders; the Tesco week at 2 servings keeps garlic, olive oil and potatoes at 1 pack, and at 4 servings potatoes stay 1 pack; tortilla alone at 6 servings is 1200g of potato, 1 × 2kg bag; two no-portions dinners sharing an ingredient stay at 1 pack; client hold matches pay. Beef ragù alone at 4 servings is still 2×500g mince, 2×500g passata, 1×500g spaghetti.

**Why:** Found in the 8 Oct internal dry-run smoke. PR branch `cursor/fix-basket-order-dependency-cd89`. Folded into PR #8. PR #7 was closed unmerged. Live 8 Oct 2026 with the production ship above.

## 2026-10-06 16:06 BST — meal categories, new tag structure, 11 new ingredient keys (PR #4)

- **Merged:** commit `0ef39e9`, GitHub Actions test passed.
- **Categories:** every verified meal has exactly one category from 7 values (`pasta`, `rice_bowl`, `oven_bake`, `tacos_wraps`, `curry_stew`, `eggs`, `salad`). Stored in `meals.category` (CHECK constraint). Category is allowed null when `reviewed_at` is null (draft meals). The Meals admin UI requires a category to Verify & publish. The advisor/AI function whitelists category. All 77 current meals backfilled with categories per the proposal.
- **Tags (11-tag closed set):** `dinner` (hidden constant), `quick` (< 30 min), `high_protein`, `low_carb`, `low_calorie`, `meal_prep`, `comfort_food`, plus diet tags (`meat`, `fish`, `vegetarian`, `vegan`). Removed: `gym`, `breakfast`, `lunch`, `snack`. Users' saved `gym` pref migrated to `high_protein`; old meal/snack/lunch tags dropped. **Vegan dishes now carry BOTH `vegan` AND `vegetarian` tags** (changed from "vegan is not also vegetarian"). Tags are stored data; the DB only derives diet, `quick`, and `dinner` via `meal_tags_for` + trigger. `meal_prep`, `comfort_food`, and nutrition tags are curated, so catalog patches must not wipe them. `low_carb` and `low_calorie` are hidden from onboarding/prefs chips until each has ≥ 8 live meals, but kept for users who already selected them. Onboarding goals no longer steer to `low_calorie`.
    10|- **New ingredient keys (46 total, was 35):** `tomato puree`, `fresh ginger`, `garam masala`, `limes`, `spring onions`, `penne`, `arborio rice`, `fresh basil`, `cucumber`, `red onions`, `cheddar`. Added to all three catalog lists (`index.html` `INGREDIENTS`, `ai/index.ts` `CATALOG`, `_shared/orders.ts` `CATALOG`) and `ingredient_prices` rows for the 4 stores. `cheddar` added to `ANIMAL_ING`.
- **SQL migration:** `meals_categories_tags_ingredients_v2.sql` adds `category` column, backfills all 77 meals with categories and curated tags, updates CHECK constraints, rewrites `meal_tags_for` to derive only diet/quick/dinner, adds `meals_tags_derive` trigger (SECURITY DEFINER), migrates `profiles.state` (`gym` → `high_protein`), inserts `ingredient_prices` for 11 new keys. Applied to production.
- **Tests:** `npm test` **89** passing (updated tag/category/ingredient assertions, added `--experimental-strip-types` flag for Node TypeScript support).
- **Docs updated:** `TAGS.md`, `INVARIANTS.md` (I-W05, I-W06), `CURRENT-STATE.md`, `CHANGELOG.md`.
- **Deployed:** Vercel production `dpl_yGDeo3wMVyD9PxDduTCBB6efsvkC`. Edge functions `pay`, `ai`, `newcoming` redeployed.

## 2026-10-06 16:35 BST — method section headings (PR #5)

- **Merged:** commit `af3c7946`, GitHub Actions test passed.
- Cooking instructions now parse and display section headings for labeled steps. When a step starts with a known label + colon (Sauce:, Meatballs:, Pasta:, To serve:, Base:, Topping:, Filling:, Assembly:, Garnish:), the label renders as a visual heading and is stripped from the step text. Step numbering continues across sections. Display-time parsing only — no database or schema changes. Helper function `parseStepWithHeading()` detects the allowlist. CSS for `.recipe-heading`. Tests cover parsing, rendering, and continuous numbering. Storage unchanged — orders still snapshot plain strings. Closed allowlist prevents false-positives on steps like "Tip:" mixed into body text.
- **Deployed:** Vercel production `dpl_5XNkkEa7G31hzUK2KQNKYhEoaC6C`. No SQL or edge function changes.

    20|## 2026-10-06 17:10 BST — cooking for 2, 4, or 6 (PR #3)

- **Rebased** `feat/servings` onto latest `main` (includes PR #4 categories/tags + PR #5 method section headings). Conflicts resolved in `index.html`, docs, tests. Servings + section headings both work.
- **Pack sizes aligned:** Garlic **40 cloves** (4-pack, was 10), Onions **6 pc** (6-pack, was 3) per live Catalog. Updated `INGREDIENTS`, `PACKS`, tests.
- **Merged:** commit `b1cdb320`, GitHub Actions test passed.
- Household size sets `prefs.servings` to 2, 4, or 6 (3 people cook for 4; a home of 5–6 cooks for 6). The week locks that number, and each order stores `items.servings`. Profile can change cooking-for for next week only. The basket is whole packs from the verified 2-serving portions (`ceil(need / pack)`), not a price multiplier. Seasonings stay one pack unless ticked off. A dinner with no portions still contributes one pack per grocery. Recipe steps stay written for 2; the modal shows the scaled list and a larger-pan note at 4 and 6. Recipe modal parses section headings (Sauce:, Meatballs:, etc.). `pay` recomputes the hold from database portions. SQL `plentry/supabase/servings.sql` applied to production. All 46 keys. `npm test` **114/114**.
- **Deployed:** Vercel production `dpl_FYr7g7rS4RyU2jNEeUt3pzNkbFg1`. Edge function `pay` v29.

## 2026-10-06 — founder login keeps the authenticator code up

- A password login with a verified TOTP factor is `aal1`, so Ops / Meals / Inbox stay hidden until the 6-digit code. The code sheet was a normal modal: tapping the dimmed area closed it and nothing asked again. It now stays open until the code succeeds, and a banner on the page repeats the ask. The client also treats a verified factor as needing `aal2` when the assurance helper only saw an empty `session.user.factors`. Static deployed to https://getplentry.com (`npm test` 106/106). Edge functions unchanged.

## 2026-10-05 — public site is getplentry.com
    30|
- Customer origin is `https://getplentry.com`. Stripe return URLs (`pay` v21 `APP_URL`) and the exact-origin check (`checkout` v17 `APP_ORIGIN`, I-X02) use that host. `www.getplentry.com` and `plentry.vercel.app` redirect to the apex. Supabase Site URL is the new origin; the old redirect stays on the allow list for a week. Auth mail and the Stripe webhook URL are unchanged. The promised-window test uses a date in 2099 so it still expects "We'll deliver" after 24 Sep 2026.

## 2026-09-24 — phone, slot, Issue + Inbox on production

- Founder deployed static and edge functions (including `notify-order`) after PR #1 merged. Live site confirmed 26 Sep: UK phone, promised window, Issue, Inbox. Vault had still said "not yet deployed".

## 2026-10-06 — portions per meal + servings plan

- Verification records now carry a **Portions (2 servings)** table (amount + unit per catalog key); `verify.py check` enforces it, `verify.py sql` writes `meals.portions jsonb` (column added by the patch). Backfilled on the 8 source-matched records; current patch is `patches/catalog_patch_2026-10-06.sql` (supersedes 10-05). `SERVINGS-PLAN.md`: step-by-step for 2/4/6 servings in the app — numeric packs, `prefs.servings`, pack-rounded basket on client + server, scaled ingredient list on recipes; explicitly not a price multiplier. No app change yet.
    40|
## 2026-10-05 — verification batch 1 + cooking-time check

- `verify.py sql` (batch catalog patch for the Supabase SQL editor, replaces per-dish Meals-tab edits) and `verify.py catalog-add` (new key → 3 code lists + `ingredient_prices` estimate SQL). `prices.py status|sql`: catalog × 4-store price grid (`PRICES.md`), checklist with links, observed.csv → upsert SQL. First run: 0 of 140 cells observed in the last 90 days; the 8 seasonings have **no** `ingredient_prices` rows at any store (basket uses the `INGREDIENTS` fallback).
- `meal-ingredient verification/`: Batch 1 (eggs & shakshuka, 6 records) source-matched against Ottolenghi / delicious. / RecipeTin Eats; one Remove proposed (Baked Eggs with Chickpea Tomato Sauce, duplicate). `verify.py check` now tracks `time` per record (catalog → record, >45 min flagged, bucket summary in STATUS.md). Flags Curried Chicken Thigh & Potato Traybake at 50 min for Batch 4. PLAN.md + LOG.md added. No DB change yet.

## 2026-09-21 — meal / ingredient verification workflow

- New `doc/meal-ingredient verification/`: README (3-stage workflow against chef sources), generated `1-INGREDIENTS.md` / `2-MEALS.md` / `3-INSTRUCTIONS.md`, `CANDIDATES.md`, `STATUS.md`, 77 `meals/*.md` records, `verify.py build|check` (0 problems). Worked examples: Shakshuka (Ottolenghi), Beef ragù spaghetti (RecipeTin Eats). No app or DB change yet — each record proposes its own DB patch.

    50|## 2026-09-21 — be-in warning on the chosen delivery window

- Confirm: after the customer picks a day + 2-hour slot, an amber note **Be in for this window** — someone at the door, the driver will call the phone on the order.

## 2026-09-21 — small-team checks (CI + PR)

- GitHub Actions **test** (Node 22, `npm test`) on pull_request and `main`. PR template: requirements, invariants, security, tests, vault, no deploy.
- Loop: branch → PR → CI → Bugbot/security on money/XSS → merge → founder deploy. See [ENGINEERING.md](ENGINEERING.md). Vercel stays disconnected. Merge is not live.

## 2026-09-21 — UK phone, promised 2-hour slot, hollow timeline, Issue + Inbox
    60|
- **Phone (I-O08–10):** UK number required on Profile and checkout (`isUkPhone`). Reuse card only if the saved address includes a phone. Ops copy-list and Telegram lead with **PHONE:** so the supermarket driver calls the customer, not the founder.
- **Slot (I-O16):** customer picks a day ≥ order+3 (Europe/London) and a 2-hour block 08:00–22:00. Written on INSERT as `slot_date` / `slot_start` / `slot_end` (CHECKs live). After the hold: **We'll deliver {window}**. Ops **Confirm this window** (marks Ordered, snapshots `delivery_slot`) or **Message customer** — do not shop a different slot. Legacy rows without slot columns keep the 4-day estimate + free-text field.
- **Timeline:** incomplete dots are hollow white; complete is green fill. **Delivered** is not filled while status is Ordered. Delivered also greens after `slot_end`; pantry restock still only on `status=delivered`.
- **Issue + Inbox (I-O18):** `order_messages` + `issue_status`. Customer **Issue** on paid orders; founder **Inbox** (aal2) can start a thread when the slot is unavailable. Bodies stripped, `esc()` at render. SQL applied live (`orders_slot_issue`). Static + `notify-order` not deployed yet.
- Tests: `npm test` **105**.

## 2026-09-21 — vault tidy + one-file Word review

- All hanging markdown at the Kitchen planner root and in `plentry/` (`PLAN.md`, `SPEC.md`, `SECURITY-DEPLOY.md`, `user-acquisition-playbook.md`) plus the June `mvp.html` prototype moved to [`archive/`](archive/README.md). `plentry/README.md` is now a short pointer.
    70|- Live contract files stay at the top of `doc/` (same names agents already read). Reading order is in [`README.md`](README.md). Founder pack: **`Plentry-review.docx`** (regenerate with `python3 doc/build-review.py`).
- `npm run vault` copies live markdown and `archive/*.md` into `plentry/doc/`. The `.docx` stays in workspace `doc/` only.

## 2026-09-19 later — hold 30%, capture MFA prompt, over-hold charges the hold

- Hold buffer **15% → 30%** (`HOLD_BUFFER` / `HOLD_MULTIPLIER` in `index.html` and `pay`). Shelf estimates were coming in ~15% low (order **#38** Waitrose: est. £46.21, till £53.10). New holds need a `pay` deploy; existing holds stay at the amount already on the card.
- Capture `mfa_required`: Ops opens the 6-digit modal and retries after verify (no dead-end alert). `mfaPending()` is true whenever the founder has a verified TOTP factor and the session is not `aal2`.
- **Bug:** live capture always 403'd `mfa_required` even after a TOTP login. `@supabase/server` `userClaims` has no `aal`; the claim is `ctx.jwtClaims.aal`. Capture now reads that. `payApi('capture')` refreshes the session so the JWT sent is current.
- If till + 5% exceeds the hold, `pay` captures the hold (never more). Ops warns "Plentry covers £X". Stripe cannot charge past the authorised amount — the shortfall is the float.
- Tests: `npm test` **103**. **Shipped:** static `plentry-11vcbs682` + `pay` **v19**.
    80|
## 2026-09-19 — cooking methods on the order + 4-day then slot tracking

- **I-O15:** `placeOrder` writes `items.recipes` (name, emoji, time, ing, steps/tip). `pay` checkout looks up those names in `meals` and writes a cleaned snapshot (`cleanRecipes`, catalog rows win over the client) so a later catalog edit cannot blank the customer's method. Orders tab: one **Cooking instructions** button per dinner; snapshot first, catalog-by-name fallback, honest copy if gone — no live AI. Friend order **#38** (Waitrose, 4 dinners) backfilled from the catalog.
- **I-O16:** after the hold the customer sees **Expected by {created_at + 4 days}** (~3 supermarket + ~1 Ops). After capture, Ops types the shop's delivery window into `orders.delivery_slot` (≤80, no `<>`; INSERT forced null by `orders_clear_slot_on_insert`). Saving the slot marks **Ordered**; the customer then sees **{store} delivers {slot}**, then **Delivered**. Store marketing ETAs are no longer shown as the order ETA.
- Tests: `npm test` **102**. Needs static + `pay` deploy before customers see it.

## 2026-09-18 13:25 BST — S-06 / S-14 closed; audit complete

- Founder enrolled TOTP in Profile → Security (factor `verified` 12:19 UTC) and re-logged in with the code. Agent then applied `supabase/admin_mfa.sql` as migration `admin_mfa_aal2_policies` (five founder policies on `orders`/`meals` now `using/with check (public.is_founder_aal2())`; function executable by `authenticated` only) and ran `supabase secrets set REQUIRE_ADMIN_MFA=1` (`pay` capture returns `mfa_required` 403 for an `aal1` founder session).
    90|- Verified live, read-only: RLS probe with a founder JWT — `aal1` → 5 own orders, 0 other customers, `is_founder_aal2()` false; `aal2` → 30 orders, 25 other customers, true. Rolled-back probe: a 60-line worst-case server-built basket at £249.99 passes `validate_order` (so `pay`'s write-back cannot trip the trigger on real orders; the £500 total cap stays).
- Founder raised the dashboard minimum password length to 8 (S-14). `admin_mfa.sql` header now says APPLIED; contract test `I-A10` asserts the date, the lock-out warning and the roll-back path instead of "NOT APPLIED YET". All 17 findings closed (S-16 accepted). Remaining: one live money test on the new checkout path.

## 2026-09-18 13:04 BST — static shipped (batch complete bar founder steps)

- Founder ran `vercel login` then `npm test && vercel deploy --prod --yes --scope team_…` → `plentry-p1413liv3` is production. Agent ran the RUNBOOK post-deploy checks: sensitive paths 404, app assets 200, all six security headers present, vendor immutable / `sw.js` no-cache, bundle hash matches the repo; in a real browser on production: vendored supabase-js loaded, no third-party script, `eval` blocked by CSP, Supabase REST reachable, SW active. **S-07, S-08, S-10 client, S-12, S-14 client, S-17 and the S-06 UI are live.** S-17 is closed in production (the vault, function sources and SQL are no longer served).
- Still open: S-06 founder enrol (then `admin_mfa.sql` + `REQUIRE_ADMIN_MFA=1`) and S-14 dashboard minimum password length. Vault: SECURITY status cells, CURRENT-STATE, ROADMAP, RUNBOOK.

## 2026-09-17 16:20 BST — functions shipped, static blocked

   100|- **Deployed** (`npm test` 97/97 first): `supabase functions deploy ai checkout pay stripe-webhook notify-order` → `ai` v21, `checkout` v14, `pay` v17, `stripe-webhook` v14, `notify-order` v16 (`_shared/ratelimit.ts` + `_shared/orders.ts` bundled). `verify_jwt` flags unchanged. Smoke: all booted 30–56 ms, no error lines; OPTIONS 204 ×5; `ai` `parse_pantry` → 400 `retired task`; `pay`/webhook/`notify-order` still refuse unauthenticated calls with 401. S-03, S-04, S-05, S-09, S-10 (server), S-11, S-15 are therefore live.
- **Not deployed:** static. `vercel deploy --prod --yes --scope team_…` returned *You do not have access to the specified account*, then `vercel whoami` → *Logged out* (no `auth.json` in `~/Library/Application Support/com.vercel.cli/`). Needs the founder's `vercel login` (browser device flow), then the RUNBOOK static deploy + checks. Compatibility of old static + new functions was checked before shipping the functions alone (same `{i,q}` basket lines; retired `ai` tasks were never called by the client; redirect check falls back to the app origin).
- Why functions alone: every function-side fix is client-transparent, and S-03/S-05 were the highest-risk open items that did not need the static build.

## 2026-09-17 (later) — security fixes S-01…S-17

- **Live Postgres (applied via migrations, each probed in a rolled-back block):** `security_hardening.sql` + `security_hardening_v2.sql` (S-01 — first time ever on production: `rate_limits`, `check_rate_limit()`, `validate_order`, meals/profile CHECKs); new `security_hardening_v3.sql` (S-02/S-09: INSERT forces `payment_status='unpaid'`, null `payment_intent`/`checkout_session`/`amount_held`/`amount_captured`, `status='new'`; total/postcode/store/items re-validated on UPDATE only when they change so 15 legacy null-total rows still move status; `orders.checkout_session` column); new `webhook_secret_vault.sql` (S-13: header secret seeded into `vault.secrets` server-side, `notify_order_webhook_fn` / `invoke_newcoming_review` read `public.order_webhook_secret()`, `ALTER DEFAULT PRIVILEGES` closes new functions to anon/authenticated; cron function fired once → `newcoming` 200, queue empty so no Telegram).
- **Edge functions (staged, not deployed):** `_shared/ratelimit.ts` last-XFF key, bounded, anonymous fail-closed (S-03); new `_shared/orders.ts` (`CATALOG`, `rebuildBasket`, `searchUrl`, `ukPostcode`, `cleanMeals`); `pay` rebuilds and writes back `items` before the hold, rejects unknown keys, refuses capture without a recorded hold, expires the previous Checkout Session, records `checkout_session`, cards only, `REQUIRE_ADMIN_MFA` aal2 gate on capture (S-02/S-04/S-06/S-09); `stripe-webhook` 5xx on DB errors, `completed` only from `unpaid|none|canceled`, UK-postcode guard, records real hold + session, `expired` matches the current session (S-05/S-09); `notify-order` rebuilds every link from the store whitelist, bounded fields, 4000-char cap (S-04); `ai` retires `parse_pantry`/`meal_options` (400), advisor context reviewed-only, 20 new drafts/user/day, error detail only when signed in (S-11/S-15); `checkout` exact-origin `appRedirect`, detail only when signed in (S-10/S-15).
- **Static app (staged, not deployed):** supabase-js **vendored** `vendor/supabase-js-2.116.0.js` from the npm tarball, no CDN (S-07); `vercel.json` CSP + HSTS/nosniff/DENY/Referrer/Permissions headers, smoke-tested in a real browser with the exact headers — zero violations (S-08); `.vercelignore` allow-list after finding `plentry.vercel.app/doc/SECURITY.md`, `/supabase/functions/pay/index.ts`, SQL and tests were publicly served (**new S-17**); `stripeCheckoutUrl()` — `location.href` only to `https://checkout.stripe.com` (S-10); cloud `prefs.budget` normalised + escaped (S-12); `PASSWORD_MIN=8` (S-14); **Profile → Security** founder TOTP enrol (QR from SVG `data:` URL only) + login code challenge, `isAdmin()` false while a code is pending (S-06 UI). `admin_mfa.sql` prepared, **not applied** (enrol first).
- **Tests:** `npm test` **97** passing (was 56). New `test/edge.test.mjs` loads the shared `.ts` helpers directly in Node (rate-limit identity/fail policy, basket rebuild, postcode, store links, catalog equality across `index.html`/`ai`/`orders.ts`) and parse-checks all six functions. Harness: vendored-script strip, `mockMfa()` MFA surface. Invariants added: I-S01, I-O11–14, I-X02–03, I-A04–11.
   110|- **Not done here (founder):** deploy (`vercel deploy --prod` + functions), enrol TOTP then `admin_mfa.sql` + `supabase secrets set REQUIRE_ADMIN_MFA=1`, Auth minimum password length 8. Until the deploy, production functions/static are the 16 Sep build.

## 2026-09-17

- **Security audit (no app code change):** backend → frontend pass recorded in [SECURITY.md](SECURITY.md) "Open findings" (S-01…S-16). Headline: `security_hardening.sql` / `security_hardening_v2.sql` were never applied to live Postgres — no `rate_limits` / `check_rate_limit()` (all edge rate limits fail open) and no `validate_order` trigger (orders unvalidated). Also: customers can insert orders that look `authorized`; XFF-spoofable anonymous rate key; webhook swallows DB errors; no CSP/frame headers; CDN script without SRI. `CURRENT-STATE.md` money table corrected. `npm test` 56 passing.
- Vault lock for agents: [REQUIREMENTS.md](REQUIREMENTS.md) (MVP in/out), [INVARIANTS.md](INVARIANTS.md) (test IDs + gaps), [FLOWS.md](FLOWS.md) (checkout / Ops / Meals). Playbook, `AGENTS.md`, and Cursor rule now start there. **No app rewrite** — `index.html` stays the front end.
- Invariant tests closed: over-hold capture, `payApi` error JSON, unpaid Ops lock, Telegram only on authorized, webhook keeps door address, `placeOrder` writes `address.delivery`, first-time vs saved checkout, Profile delivery persist. `npm test` **56** passing.
- Production gate spelled out for agents: `npm test` must exit 0 before `vercel deploy --prod` or `supabase functions deploy` (`I-A03`).

## 2026-09-16
   120|
- Ops capture: type store £ → preview **customer charge (store + 5%)** → **Charge £X** → **Confirm £X**. After capture: **Money received — £X is in Stripe** and **Open {store}**. Delivery line prefers the in-app door address, not card billing. Checkout asks for a door address every time (reuse saved, or a new one); saved on Profile. Stripe billing stays on Stripe. `payApi` surfaces Stripe error text. `npm test` **46** passing.

## 2026-09-14

- Onboarding: dinners/week is a **1–7** bar (same control on Profile). New step for **diet + dinner tags** (`prefs.tags`); Profile has the same tag chips. Week ranking uses those tags when set, else the old goals map. Basket / shop / confirm show a noticeable **Do NOT keep spices you already have** warning and **I already have — skip**. Client-only until the next static ship. `npm test` **44** passing.
- **Meals tab (founder only):** catalog work moved off Ops. **New meal** holds unverified rows (`reviewed_at` null) with ingredients + method visible; **Live catalog** lists every verified dinner grouped by diet, with ingredients and instructions behind **Ingredients & method**. Add → save/verify/tags in one editor; Verify & publish is live from Postgres (no extra deploy). If the admin fetch is empty, Live catalog falls back to the week catalog so the list is never blank. New week / Modify ignore unverified rows when a live pool exists. Founder INSERT/UPDATE/DELETE via JWT email; leftover public `insert meals` (`created_by = auth.uid()`) dropped on live Postgres. `npm test` **42** passing. SQL: `admin_meals_write.sql` (also in `admin_policies.sql`). Production static: https://plentry.vercel.app (`49a7697`).
- Basket: **Order this week** / login rebuilds from this week's meals. Stale or empty `basketEdit` no longer leaves a £0 week with only "add a product". Manual add/remove still works for the same week; Reset restores meal prices. Meal cards price ingredients even if the store is missing.
- Weeks default to **omnivore** (meat/fish first, at most one vegetarian/vegan dinner) unless Profile → What we eat is vegetarian / vegan / pescatarian. New week uses the **full catalog**, not a 16-meal veggie-heavy slice. `npm test` was **39** before the Meals tab.

   130|## 2026-09-13

- Founder verify: Auth Site URL + `https://plentry.vercel.app/**`; Stripe **test** order **#31** Tesco — hold £31.52 `authorized`, then **captured £26.25** (store £25 + 5% £1.25), Ops **ordered**. Safe to rotate to live `sk_live_` + **new** live webhook `whsec_`. Security pass: JWT `email` is `auth.users` (not `user_metadata`); leftover `orders` fn confirmed gone; leaked-password left off (org **Free**, feature is Pro). No app code change.

## 2026-09-09

- Live MCP verify (no code change): project healthy; `ai` `checkout` `pay` `stripe-webhook` `notify-order` `newcoming` ACTIVE; **77** meals / **0** newcoming; cron `plentry-newcoming-fortnight` `0 9 1,15 * *` UTC; `invoke_newcoming_review` not executable by anon/authenticated. Auth Site URL still dashboard-only.
- Closed meal **tags** on `public.meals` (diet, nutrition, context, use case). Backfill: **77** dinners, all marked reviewed (33 meat, 11 fish, 28 vegetarian, 5 vegan). Advisor/`ai` must return tags; the server whitelists and fills from `ing`. New rows stay **newcoming** (`reviewed_at` null) until Ops **Mark reviewed**. Fortnight Telegram via `newcoming` + pg_cron `plentry-newcoming-fortnight` (1st and 15th 09:00 UTC). New week / Modify weight by onboarding goals vs tags. Ops shows the newcoming queue. `npm test` **37** passing. Production: static + `ai` + `newcoming`. SQL: `meals_tags.sql`.
- Cursor workspace moved to `/Users/noebouchard/work/EVERYTHING/Claude/Projects/Kitchen planner`. Agents should open that folder, not the deleted Documents path.

   140|## 2026-09-08

- Vault created at workspace-root `doc/` (copied to `plentry/doc/` for GitHub) as source of truth for agents and security audit.
- Automated jsdom unit suite + source contracts (`plentry/test`, `npm test`, 30 passing).
- Meal photos: new AI dishes search TheMealDB by name once at insert (`ai` function). Client still falls back by ingredient.
- Documented concierge model: Stripe hold, 5% fee, Ops capture.
- Advisor add no longer grows the week past `prefs.meals`.
- Revoked public RPC on `notify_order_webhook_fn`; Telegram only on authorized hold.
- Production static + `ai`/`pay` deployed.
- Modify / New week use the meals catalog only; AI is meal advisor (plus recipes). Pantry parse is not in the UI.
   150|- Cupboard section (oil & aromatics) plus editable basket before confirm-and-send.
- Pantry is a searchable Have list of all 24 ingredients (onboarding + Pantry tab). "Update with AI" / "Scan with AI" removed until photo scan. Ticked items are skipped entirely on the shop.
- Pantry / onboarding cupboard is oils & spices only (salt, pepper, paprika, cumin, chilli, mixed herbs, soy, stock cubes). Groceries stay in the basket. Meals still omit salt/pepper from `ing`; the shop adds implied seasoning unless ticked.
- Recipes now carry a **full ingredient list** (salt, pepper, and dish spices on `ing`). Shop and cooking instructions use that list. Run `supabase/meals_full_ingredients.sql` on Postgres; deploy `ai` so new dinners include spices.
- Ran `meals_full_ingredients.sql` on production Postgres (8 Sep 2026): all **77** meals now include salt and black pepper; dish spices (cumin, herbs, soy, …) match the recipe type.
- Catalog review file now includes a **method + tip** for all 77 dinners (live `ai("recipe")`, 2 servings), alongside ingredients.
- Applied the founder catalog review: 62 meals' `ing`/`time` corrected; three new keys (`chopped tomatoes`, `butter`, `fresh coriander`); reviewed methods stored on `meals.recipe`. Butter is a cupboard staple. `npm test` 35 passing.

## 2026-09-07

   160|- Production static deploy path: `vercel deploy --prod --yes` from `plentry/` (Vercel not git-connected).
- Customer **Orders** + **Profile history** load from `orders` table (`hydrateOrdersFromDb`). Stripe return opens Orders.
- Ops status **bar** New / Ordered / Delivered (reversible; unpaid locked).
- **Modify** on each dinner: replace with 5 other meals; week size unchanged.
- **5% Plentry fee** on displayed totals; hold includes fee × 1.15; capture adds 5% server-side.
- Ingredient-level photo fallback for meals missing `image_url`.

## 2026-07 (prior)

- Concierge Stripe Checkout (manual capture), webhook, Telegram on authorized hold.
   170|- Security hardening v1/v2 (rate limits, meals INSERT lockdown, order validation trigger).
- Pepesto checkout function (keyless fallback to shelf prices).
- Seed catalog (40) + `ingredient_prices`; Tesco estimates added later.
- Vanilla SPA + Supabase Auth/Postgres; Vercel static hosting.
