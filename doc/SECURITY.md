# Security (audit brief)

For a security-review agent. Read this file plus [CURRENT-STATE.md](CURRENT-STATE.md) and [ARCHITECTURE.md](ARCHITECTURE.md) before touching code. Not an invitation to exploit. Prefer patches and tests. After any hardening patch: `npm test` in the app directory, then update this file and [CHANGELOG.md](CHANGELOG.md).

## Trust boundaries

- **Browser:** `index.html` holds the **publishable** Supabase key. Anyone can read it. Authorization is RLS + edge `auth: 'user'` + service role only on the server.
- **Admin:** email string in JWT (`noyouchka.bouchard@gmail.com`). Hiding the Ops nav is UX only. Capture is checked again in `pay`.
- **Stripe:** webhook signature (`STRIPE_WEBHOOK_SECRET`), manual capture, hold cap. Client must not set the charged amount; Ops sends **store** £, server adds 5%.
- **AI:** catalog whitelist; payload clamps; meals INSERT only via service role (`security_hardening_v2.sql`). Tags whitelist + diet/dinner CHECK (`meals_tags.sql`). Rate limit 40/min (fails open on DB errors — known).
- **Telegram notify:** `notify_order_webhook_fn` is trigger-only. `EXECUTE` revoked from `anon` / `authenticated` / `PUBLIC`. Telegram fires only when `payment_status` becomes `authorized`. `newcoming` uses the same webhook secret; `invoke_newcoming_review` is not granted to `anon`/`authenticated`.
- **XSS:** `esc()` / `safeUrl()` on AI text, meal names, tags, order fields, Pepesto product names. Do not concatenate untrusted strings into `onclick`.

## Secrets (never in git / never in `index.html`)

`ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ORDER_WEBHOOK_SECRET`, `PEPESTO_API_KEY` (optional).

Webhook compare should be constant-time (`notify-order`, `stripe-webhook`).

## SQL / RLS to re-read

- `plentry/supabase/schema.sql`
- `plentry/supabase/security_hardening.sql`
- `plentry/supabase/security_hardening_v2.sql` (order trigger: totals, postcode, store whitelist, status enum, state size)
- `plentry/supabase/admin_policies.sql`
- `plentry/supabase/meals_tags.sql` (tags CHECK, newcoming index, founder UPDATE on meals, cron)
- `plentry/supabase/orders_payment.sql` (notify triggers)
- `plentry/supabase/revoke_notify_rpc.sql` (RPC revoke + drop free-beta triggers)

## Closed on 9 Sep 2026

- `meals.tags` CHECK (closed set, exactly one diet tag, always `dinner`).
- `meal_tags_for` `search_path` pinned to `public`.
- `newcoming` gated like `notify-order` (`ORDER_WEBHOOK_SECRET`); `invoke_newcoming_review` not granted to `anon`/`authenticated`. Founder UPDATE on meals is Ops-only (JWT email).

## Closed on 8 Sep 2026

- Leftover `orders` edge function: not in the deployed function list.
- `notify_order_webhook_fn` was callable via PostgREST; `EXECUTE` revoked from `anon` / `authenticated` / `PUBLIC`.
- Free-beta Telegram triggers (insert `none`, unpaid→none) dropped. Only `notify_order_paid_webhook` remains.

## Known accepted risks (do not “fix” without product sign-off)

- `ai` callable logged-out (publishable) with IP rate limit.
- Rate limits fail open.
- Postcode format-only, not existence.
- No CAPTCHA on signup.
- Admin email in JWT (user_metadata vs app_metadata — verify which claim `auth.jwt()->>'email'` uses).
- `pg_net` installed in `public` (Supabase advisor). Do not move without checking the notify trigger.
- Leaked-password protection is off in Auth (enable HaveIBeenPwned in the dashboard).

## Checkout open-redirect

`checkout` bag `redirect_url` must start with `https://plentry.vercel.app`.

## Audit output wanted

Issue, severity, file/function, whether it is already mitigated, suggested patch. No exploit payloads in the repo.
