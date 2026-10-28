# Runbook

## Claude review gate

GitHub Actions job **claude-review** (`.github/workflows/claude-review.yml`) runs `anthropics/claude-code-action@v1` only when someone adds the `claude-review` label to a pull request. The trigger is `pull_request` with `types: [labeled]`. The job runs only when `github.event.label.name == 'claude-review'`. That run reviews the pull request's current head once. It does not run on `opened`, `synchronize`, or `reopened`. A pull request that never receives the label does not get a `claude-review` check. If some other label is added, the job is skipped, and a skip is not a failure. The job posts one pull-request comment and **fails unless the structured verdict is `APPROVE`**. Production stays as it is. `npm test` stays a separate check.

**It is not a required check.** The `main` ruleset lists **`test` only**. Do not wait for `claude-review` after a push. A run costs about $0.50, which is why it stays off every pull request.

**How to run it.** The repository label `claude-review` has to exist first (Issues → Labels → New label, name `claude-review`). On the pull request, add that label. To run it again after more commits, remove that label and add it again. The workflow leaves the label in place. Removing a label does not start a run.

The plan is to run this once as a full check after onboarding, cupboard pictures, and Modify are done. Until that pass, leave it off the ruleset.

The review model is `--model opus` in `claude_args`. [Model configuration](https://code.claude.com/docs/en/model-config) says the `opus` alias is the latest Opus, and on the Anthropic API that alias is Opus 5.5, full name `claude-opus-5-5`. The job authenticates with a pay-per-use API key: input `anthropic_api_key`, repository secret `ANTHROPIC_API_KEY` ([GitHub Actions](https://code.claude.com/docs/en/github-actions)). `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` failed with a known 401 ([issue 1613](https://github.com/anthropics/claude-code-action/issues/1613), [issue 1614](https://github.com/anthropics/claude-code-action/issues/1614)). On PR #15, run [38736528055](https://github.com/NoeBouchard/plentry/actions/runs/38736528055), the job requested `--model claude-opus-5-5`. The call errored in 297ms with 0 cost and empty `modelUsage`, so that full id is most likely invalid or not available to the subscription token. This gate names the `opus` alias. The action tag `v1` installs Claude Code 2.1.300 ([base-action/action.yml](https://github.com/anthropics/claude-code-action/blob/v1/base-action/action.yml)). Opus 5.5 needs Claude Code 2.1.280 or later, so this install can select it. `--model` and `--fallback-model` are [CLI flags](https://code.claude.com/docs/en/cli-reference). The action takes them through `claude_args`, and `v1` copies `--model` and `--max-turns` onto the SDK options ([configuration](https://github.com/anthropics/claude-code-action/blob/main/docs/configuration.md), [parse-sdk-options.ts](https://github.com/anthropics/claude-code-action/blob/v1/base-action/src/parse-sdk-options.ts)). Fable 5.1 is the most capable model in the model-configuration docs. It sits outside the plan default and can bill usage credits, including on a non-interactive run, so this gate stays on `opus`.

`--fallback-model sonnet` is the availability chain. When `opus` is overloaded, unavailable, or retired, that turn tries Sonnet. The next turn tries `opus` again ([Fallback model chains](https://code.claude.com/docs/en/model-config)). `opus` is already `--model`, so the fallback list does not repeat it. Authentication, billing, rate-limit, and transport errors stay failed, so a key that cannot run Opus fails this job. Opus 5.5 also has a separate safety fallback: a cybersecurity-flagged request re-runs on Opus 4.8, and a biology-flagged request re-runs on Opus 5 (Automatic model fallback, same page).

`--max-turns 100` is the turn budget. The [CLI reference](https://code.claude.com/docs/en/cli-reference) says `--max-turns` applies in print mode and that there is no limit unless the flag is set. The action's examples use 5 or 10 turns ([configuration](https://github.com/anthropics/claude-code-action/blob/main/docs/configuration.md)). 100 is the budget for reading the whole app before the diff. The job timeout is 120 minutes. Read, Grep, and Glob may run on the whole repository. Bash is limited to `gh pr comment`, `gh pr diff`, and `gh pr view`.

The prompt reads these first, in order: [AGENTS.md](../AGENTS.md), [ARCHITECTURE.md](ARCHITECTURE.md), [INVARIANTS.md](INVARIANTS.md), [CURRENT-STATE.md](CURRENT-STATE.md), [REQUIREMENTS.md](REQUIREMENTS.md). It then reads `index.html` in full (onboarding, week, Modify, basket, checkout, orders, Ops, Meals, Ingredients, Inbox, Profile), every file under `supabase/functions/` (pay, checkout, ai, stripe-webhook, notify-order, newcoming, and `_shared`), every SQL file under `supabase/`, and the tests in `test/`. After that it reads the diff and callers. It judges the change against every feature it could affect, not only the lines that changed. It checks the card hold (shop × 1.05 × 1.30), the 5% fee, and capture; that the `/* portions:start */` … `/* portions:end */` block is byte-identical in `index.html` and `supabase/functions/_shared/portions.ts`; RLS and admin rules; XSS; and drift between those docs and the tests. The comment lists the features it checked.

The comment ends with exactly one line, `VERDICT: APPROVE` or `VERDICT: CHANGES_REQUESTED`. The next step reads the action output `structured_output` (JSON from `--json-schema`) and **fails the job unless `verdict` is `APPROVE`**.

`allowed_bots` is `cursor`. The input on `anthropics/claude-code-action@v1` is named `allowed_bots`: a comma-separated list of bot usernames, empty by default (no bots), or `*` for every bot ([action.yml](https://github.com/anthropics/claude-code-action/blob/v1/action.yml)). Cursor cloud-agent pull requests are pushed by the `cursor` bot. On PR #15 the action failed with `Workflow initiated by non-human actor: cursor (type: Bot). Add bot to allowed_bots list`. The list is only `cursor`. `*` is not set. Matching lowercases the name and strips a trailing `[bot]` ([actor.ts](https://github.com/anthropics/claude-code-action/blob/v1/src/github/validation/actor.ts)), so `cursor` and `cursor[bot]` are the same entry. Other bots stay blocked.

The action skips the review when this workflow file is missing from the default branch or its bytes differ from that branch. It logs that the file must match the default branch, and this job then fails for lack of `APPROVE`. The pull request that adds or edits the workflow cannot review itself. After that change is on `main`, a later pull request is reviewed when the `claude-review` label is added. A later push does not run the review again.

**Noé, once:**

1. Install the [Claude GitHub app](https://github.com/apps/claude) on this repo (repository admin). In Claude Code, `/install-github-app` does the same install. Create the repository label `claude-review` once (Issues → Labels). The review runs when that label is added to a pull request.
2. In the Anthropic Console, create a pay-per-use API key. Do not use `claude setup-token`.
3. Repo → **Settings → Secrets and variables → Actions → New repository secret**. Name: `ANTHROPIC_API_KEY`. Value: the key from step 2. Never commit it.
4. Leave **`claude-review` off** the `main` ruleset (`require-test`). **Require status checks to pass** stays **`test` only**. Leave Supabase Preview and Vercel off that list. `claude-review` is not a required check.

The plan is to run `claude-review` once as a full check after onboarding, cupboard pictures, and Modify are done, on a pull request that does not change this workflow file. Until then, do not require the check, and do not wait for it after every push.

The repository is public. Pull requests from forks do not receive `ANTHROPIC_API_KEY`, so `claude-review` fails on them. That is by design.

## Local UI

No build. From `plentry/`, `python3 -m http.server 8766` or open `index.html`. Edge functions are the **deployed** ones unless you `supabase functions serve`.

## Tests

```bash
cd plentry && npm test
```

Must exit 0 before any production deploy below.

## Production static

```bash
cd plentry
npm test
URL=$(vercel deploy --prod --yes --skip-domain --scope team_QHpJBQejbrxZ2PhEZQlmbuhj | tail -n 1)
vercel inspect "$URL" --scope team_QHpJBQejbrxZ2PhEZQlmbuhj   # READY before any promote
# shared basket: deploy pay, then promote. Static-only: promote now. See Shipping pay and static together.
vercel promote "$URL" --yes --scope team_QHpJBQejbrxZ2PhEZQlmbuhj
```

**`VERCEL_TOKEN`.** Team `noebouchards-projects`, team id `team_QHpJBQejbrxZ2PhEZQlmbuhj`. Created 15 Oct 2026, with a 90-day expiry (about 13 Jan 2027). Stored as a box secret for the Plentry Engineering bot. Never print it and never commit it. This runbook has no token value. The REST calls read `$VERCEL_TOKEN` from the environment and send it as `Authorization: Bearer`.

Vercel CLI 63.1.0 returns `User not found (404)` on this team-scoped token. The REST API accepts the same token when `teamId` is set. A logged-in founder session still uses the CLI above (`vercel whoami` → `noebouchard`). The bot uses the REST calls below. Every call includes `teamId=team_QHpJBQejbrxZ2PhEZQlmbuhj`.

**Create a production build without assigning domains** — `POST /v13/deployments`. This is `vercel deploy --prod --yes --skip-domain`. Query `skipAutoDetectionConfirmation=1` is `--yes`. Body `name` is `plentry` (required). `project` is `plentry`. `target` is `production`. `gitSource` is the GitHub shape: `type` `github`, `org` `NoeBouchard`, `repo` `plentry`, `ref` `main`, and `sha` set to the merge SHA (the commit that gets built). `autoAssignCustomDomains` set to `false` is the skip-domain flag. The [create-deployment](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment) response documents that field as applying to custom domains only, default `true`. The published request schema does not list it (`additionalProperties` is false on [the OpenAPI document](https://vercel.com/openapi.json)). CLI `--skip-domain` posts `false` on this same body, and that is what leaves getplentry.com on the previous deployment until promote. Leave the field out and the default assigns the custom domains.

```bash
curl -sS -X POST \
  'https://api.vercel.com/v13/deployments?teamId=team_QHpJBQejbrxZ2PhEZQlmbuhj&skipAutoDetectionConfirmation=1' \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H 'Content-Type: application/json' \
  -d @- <<'JSON'
{
  "name": "plentry",
  "project": "plentry",
  "target": "production",
  "autoAssignCustomDomains": false,
  "gitSource": {
    "type": "github",
    "org": "NoeBouchard",
    "repo": "plentry",
    "ref": "main",
    "sha": "<merge-sha>"
  }
}
JSON
```

The response `id` is the deployment id (`dpl_…`). Poll `GET /v13/deployments/{id}` until `readyState` is `READY`. That is `vercel inspect`. Before promote, `readySubstate` is `STAGED` (the deployment has not taken production traffic).

```bash
curl -sS \
  "https://api.vercel.com/v13/deployments/$DEPLOYMENT_ID?teamId=team_QHpJBQejbrxZ2PhEZQlmbuhj" \
  -H "Authorization: Bearer $VERCEL_TOKEN"
```

**Promote** — `POST /v10/projects/prj_lf6RxDIun7rFk6NDUagt8Ve0lme0/promote/$DEPLOYMENT_ID`. This is `vercel promote`. Project id `prj_lf6RxDIun7rFk6NDUagt8Ve0lme0` is the `plentry` project. [Point production traffic to a given deployment](https://vercel.com/docs/rest-api/projects/point-production-traffic-to-a-given-deployment): no request body, and the call does not rebuild. `201` or `202`.

```bash
curl -sS -X POST \
  "https://api.vercel.com/v10/projects/prj_lf6RxDIun7rFk6NDUagt8Ve0lme0/promote/$DEPLOYMENT_ID?teamId=team_QHpJBQejbrxZ2PhEZQlmbuhj" \
  -H "Authorization: Bearer $VERCEL_TOKEN"
```

**Read prod** — `GET /v13/deployments/getplentry.com`. [Get a deployment by ID or URL](https://vercel.com/docs/rest-api/deployments/get-a-deployment-by-id-or-url): path `idOrUrl` is the deployment id or the hostname. This returns the deployment that hostname currently serves. After promote, `id` is `$DEPLOYMENT_ID`. Before promote, `id` is the previous deployment.

```bash
curl -sS \
  'https://api.vercel.com/v13/deployments/getplentry.com?teamId=team_QHpJBQejbrxZ2PhEZQlmbuhj' \
  -H "Authorization: Bearer $VERCEL_TOKEN"
```

Bare `vercel deploy --prod --yes` can return **Not authorized**; the team scope is required. A one-shot `vercel deploy --prod` without `--skip-domain` aliases getplentry.com as soon as the upload finishes. Do not use it when `pay` also changes. From 13 Oct 2026 until PR #12 (`4699353a`, 15 Oct 2026), a merge to `main` auto-deployed static to production through Vercel's Git integration. Production ships after that are the REST create and promote in this section. `vercel.json` now sets `git.deploymentEnabled` to `{ "main": false }`, so a merge does not deploy static from `main`. Other branches still get preview deployments. Edge functions do not deploy on that merge. Deploy to production is OFF. See [Functions](#functions). Shared-basket, static, and docs-only merges are in [Shipping pay and static together](#shipping-pay-and-static-together). `--skip-domain` is the current flag (it must be used with `--prod`). It builds the production deployment and leaves the domains on the previous one until `vercel promote`.

**Logged out?** Vercel CLI 59 keeps its session in `~/Library/Application Support/com.vercel.cli/auth.json`; when it is missing, `vercel whoami` prints *Logged out* and the scoped deploy fails with *You do not have access to the specified account*. Fix: `vercel login` (device flow — opens vercel.com, approve, back to the terminal), confirm `vercel whoami` → `noebouchard`, re-run the deploy. Never run `vercel teams list` / `vercel login` from an unattended agent: it blocks on the browser step.

Only `index.html`, `sw.js`, `manifest.json`, `icons/`, `vendor/`, `vercel.json` are uploaded (`.vercelignore` allow-list, S-17). `vercel.json` carries the CSP and security headers (S-08). If you add a new remote origin to `index.html` (fetch, image host, font), add it to the CSP first or the browser blocks it silently — the contracts test checks `connect-src` against every `fetch(` host.

**Post-deploy checks (static):**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://getplentry.com/doc/SECURITY.md            # 404
curl -s -o /dev/null -w '%{http_code}\n' https://getplentry.com/supabase/functions/pay/index.ts   # 404
curl -sI https://getplentry.com/ | grep -i -E 'content-security-policy|x-frame-options'  # both present
curl -s -o /dev/null -w '%{http_code}\n' https://getplentry.com/vendor/supabase-js-2.116.0.js  # 200
```

Then open the app, DevTools console: no `Refused to …` CSP lines while loading a week and opening a meal.

Workspace: `/Users/noebouchard/work/EVERYTHING/Claude/Projects/Kitchen planner` (then `cd plentry`).

## Capture split (applied)

Applied and deployed on 28 Oct 2026. PR #35 squash-merged to main as `ea90a314bbe55af000e41d3bc0f34bd9569ad151` at 12:02:45 GMT. `supabase/orders_capture_split.sql` was applied to prod at about 12:04 GMT. The header says **APPLIED to prod 28 Oct 2026 ~12:04 GMT**. SQL statements are unchanged from the pending file (sha256 `15146e29c11c273cf5a3d2bc653091e4a243aa36f96a4bb18b6abca78636a022`). Stamped sha256 `e7f214da066d0205bfa6ea734e62b157cadbfd0c3207e7c3773a4ffead96b139`. Loose file, not a migration. Do not put it in `supabase/migrations/`. Do not apply it again.

`notify-order` was hand-deployed as v46 at 12:04 GMT. `pay` was hand-deployed as v53 at 12:05 GMT. No static deploy. Other functions were unchanged: `ai` v52, `checkout` v44, `stripe-webhook` v43, `newcoming` v37. `notify-order` behaviour is unchanged. It imports `_shared/telegram.ts`. `pay` writes `store_total`, `fee_amount`, and `overrun_amount` in the same update as `amount_captured`. If those columns are missing, `pay` retries the write without them so `amount_captured` and `payment_status` still save, and Telegram says the split wasn't recorded because the columns are missing. supabase-js reports that as PostgREST `PGRST204` (HTTP 400, schema cache: could not find the column) before Postgres `42703`. Both codes take that fallback.

Deploy to production is off, so this ship was a hand apply and two hand deploys. The merge itself did not deploy the functions.

**Rollback.** Redeploy `pay` v52 and `notify-order` v45 (code from `985a4511`, full `985a451199b74c30e904fb607a6c03cfb70a098f`), then roll back the SQL. In the SQL editor: re-run `supabase/security_hardening_v3.sql` (restores `validate_order`), then drop `overrun_amount`, `fee_amount`, and `store_total`. Once `guard_completion_email_columns` exists, skip re-granting table-wide INSERT and UPDATE on `public.orders` (`grant insert, update on table public.orders to anon, authenticated`) and leave the column grants (browser columns only). That table GRANT would reopen client writes to `completion_email_*`. Dropping the split columns while `pay` v53 is still live breaks capture writes. The SQL file's rollback comment still says to skip that GRANT when the email columns exist and the guard is not in. Follow this note.

`reconcile` is a founder-email task on `pay`. Admin MFA (aal2) is enforced only when `REQUIRE_ADMIN_MFA=1`. Omit `dryRun` or pass `true` to report only. Pass `dryRun: false` to write `amount_captured` and `payment_status` from a succeeded PaymentIntent. It does not fill the split.

## Order receipt (pending)

Not applied. Not a function deploy. `supabase/order_received.sql` is a loose file (sha256 `1928d917b970240aa6255da5b40362ac6a8e741286b30e0b96ca558a12719b9e`). Header says **PENDING, not applied**. Paste it into the Supabase SQL editor, or run it with `execute_sql`. Do not put it in `supabase/migrations/`.

The static that shows the Orders badge, **Did it all arrive?**, and the Ops chips is a separate promote. Until the columns exist, the client select fails and retries without them, so the badge and the card stay hidden. Apply the SQL before promoting that static if both should go live together. This PR does not promote static.

**Open issues.** The only open value is `issue_status = 'open'` (`orders_issue_status_sane` allows null, `open`, and `resolved`). `auto_complete_orders()` requires `issue_status is distinct from 'open'`. null and `resolved` do not pause the sweep. Resolving an issue does not change `delivered_at` and does not restart the 48 hour clock. There is no issue-resolved timestamp.

**Backfill.** In the same transaction, every row with `status = 'delivered'` and `received_confirmed_at` null is set to `received_confirmed_by = 'backfill'` and `received_confirmed_at = now()`. That includes historic #31, #38, and #39 when they are still delivered and unconfirmed. Ids are not hardcoded. PR #34's completion-email backfill must treat these rows as already emailed or skipped, so that file does not send a surprise email.

**Who can write.** `confirm_order_received` and `admin_mark_received` are EXECUTE for `authenticated` only. The customer function also requires `user_id = auth.uid()`, status `delivered`, and a null confirmation. The ops function checks `is_admin_aal2()` inside the body. `auto_complete_orders()` is revoked from `public`, `anon`, and `authenticated`. pg_cron job `plentry_auto_complete` (`*/15 * * * *`) calls it as the role that scheduled the job. This file grants no table or column privileges. A BEFORE UPDATE trigger on the three new columns raises unless `plentry.receipt_write` is `'1'` in that transaction. Until `orders_capture_split.sql` revokes table UPDATE, a table-level UPDATE would include the new columns; the guard still rejects the write.

```bash
cd plentry
npm test   # must be 0
# Paste supabase/order_received.sql into the Supabase SQL editor and run it.
# No supabase functions deploy for this file.
```

**Rollback.** The commented block at the bottom of the file: `cron.unschedule('plentry_auto_complete')`, drop the three triggers, drop the six functions, drop the two checks, then drop `received_confirmed_by`, `received_confirmed_at`, and `delivered_at`. Dropping the columns while a static build still selects them makes that select fail; the client then loads orders without the receipt columns and hides the card.

## Functions

**Deploy to production is OFF.** Noé turned the Supabase GitHub integration setting off on 25/26 Oct 2026 (project `ucciqthwxnlkjalwlhvh`, production branch `main`). A merge to `main` does not deploy edge functions. After the #31, #30, and #32 merges, all 6 functions were unchanged and the Supabase Preview check was skipped. Functions deploy only by hand with `supabase functions deploy <name>` or MCP, under a GO. If Deploy to production is ever re-enabled, every merge to `main` redeploys all `supabase/functions/*`. Never create `supabase/migrations/`: files there auto-apply to prod on merge. Loose `supabase/*.sql` files are not auto-applied. Static does not ride along: `git.deploymentEnabled.main` is false.

From 13 Oct 2026 until that setting was turned off, the integration redeployed all functions about 40s after any push to `main`, even when the commit did not touch those files. GitHub showed it as the **Supabase Preview** check. `pay` was v33 after PR #10 on 13 Oct 2026. Nineteen merges to `main` in that period, each with one auto-deploy, left `pay` at v52 (25 Oct 2026, 13:10:17 GMT, the deploy after #29). The 26 Oct merges did not move it.

A hand deploy is the only deploy while the setting is off. `npm test` has to exit 0 first. The same command is the rollback path. Capture split shipped on 28 Oct 2026: SQL at about 12:04 GMT, `notify-order` v46, `pay` v53. See [Capture split (applied)](#capture-split-applied).

```bash
cd plentry
npm test && supabase functions deploy <name>
```

CLI needs `supabase-go` on PATH if the shim complains. `_shared/ratelimit.ts` and `_shared/orders.ts` are bundled into every function that imports them — redeploy **all** importers when a shared file changes (`ai`, `checkout`, `pay`, `stripe-webhook`, `notify-order`). `_shared/capture.ts` is imported by `pay`. `_shared/telegram.ts` is imported by `pay` and `notify-order`. The CLI bundles those imports. A dashboard upload has to pass each file.

**17 Sep 2026 security batch:** functions shipped 17 Sep 16:20 BST (`ai` v21, `checkout` v14, `pay` v17, `stripe-webhook` v14, `notify-order` v16); static shipped 18 Sep 13:04 BST (`plentry-p1413liv3`), all static checks above green. Still to do once: one Stripe **test** hold end-to-end on the new build: checkout → 4242 → Orders shows the hold → Telegram (server-built list, store search links) → Ops capture.

**Post-deploy checks (functions), no side effects:**

```bash
B=https://ucciqthwxnlkjalwlhvh.supabase.co/functions/v1
for f in ai checkout pay stripe-webhook notify-order; do curl -s -o /dev/null -w "$f %{http_code}\n" -X OPTIONS -H 'Origin: https://getplentry.com' -H 'Access-Control-Request-Method: POST' $B/$f; done   # 204 ×5
curl -s -X POST -H 'Content-Type: application/json' -H "apikey: $PUBLISHABLE" -d '{"task":"parse_pantry"}' $B/ai      # {"error":"retired task"} 400
curl -s -o /dev/null -w '%{http_code}\n' -X POST -d '{}' $B/pay              # 401 (platform JWT gate)
curl -s -o /dev/null -w '%{http_code}\n' -X POST -d '{}' $B/stripe-webhook   # 401 bad signature
curl -s -o /dev/null -w '%{http_code}\n' -X POST -d '{}' $B/notify-order     # 401 unauthorized
```

Then `supabase functions list --project-ref ucciqthwxnlkjalwlhvh` (versions bumped, ACTIVE, `verify_jwt` only true for `pay`) and the dashboard logs: only `booted (time: …ms)` lines, no `Uncaught`.

## Order completion email (step 1) — not live

`order-email` is deployed by hand under a GO. Deploy to production is off, so a merge does not deploy it. Loose SQL is not applied by a merge, and static is a separate promote. `_shared/email.ts` is imported only by `order-email`. `pay` and `notify-order` are not part of this change. The admin Orders list retries without `completion_email_*` if those columns are missing, and then hides the badge and the test button. Deploy static after the SQL so that fallback is only the rollback path.

The loose file is `supabase/order_completion_email.sql`. Header: `PENDING, not applied`. It requires `supabase/order_received.sql` applied first (`delivered_at`, `received_confirmed_at`, `received_confirmed_by`). This file does not add those columns. One transaction, commented rollback at the bottom. Paste it in the SQL editor after the receipt file. Do not use the Supabase CLI, the GitHub integration, or `supabase/migrations/`. Never create that folder. File sha256 `37e603b6b8f6bbd6e479439047ab7e25341e35c3857bb3a901d3221fae58b4a2` (not applied).

**Ship order under a GO**, after `npm test` exits 0:

1. **Noé, verify the Resend domain.** Create the Resend account and add `getplentry.com`. Resend shows the records. It puts MX and SPF on `send.getplentry.com`, and DKIM on `resend._domainkey`. Copy those values from the Resend dashboard into Cloudflare DNS. Do not invent the record contents here. Wait until Resend says the domain is verified. `_dmarc.getplentry.com` is the one hostname Email Routing shares with Resend, so keep a single DMARC record there.
2. **Noé, turn on Cloudflare Email Routing** for the root domain `getplentry.com`, before the secrets. Replies to order emails land at `hello@getplentry.com` and are then forwarded.

   a. In Cloudflare: Email → Email Routing → enable it, and let Cloudflare add its root MX records (`route1.mx.cloudflare.net`, `route2.mx.cloudflare.net`, `route3.mx.cloudflare.net`) and the root SPF TXT `v=spf1 include:_spf.mx.cloudflare.net ~all`. If a root SPF TXT already exists, merge that `include:` into that one record. Do not add a second SPF TXT on the root.
   b. Destination addresses: add Noé's Gmail and click the verification link in the email Cloudflare sends.
   c. Routing rules: create the custom address `hello@getplentry.com` that forwards to that Gmail.
   d. Test it by sending an email to `hello@getplentry.com` from another account.

   This does not clash with Resend. Resend's MX and SPF records live on the `send.getplentry.com` subdomain, and its DKIM on `resend._domainkey`. Routing uses the root `getplentry.com` MX and SPF. Those are different hostnames, so both work. The only shared hostname is `_dmarc.getplentry.com`, so keep a single DMARC record.
3. **Noé, set the secrets.** From `plentry/`, Noé himself runs:

```bash
supabase secrets set RESEND_API_KEY=re_... ORDER_EMAIL_FROM='Plentry <orders@getplentry.com>'
supabase secrets set ORDER_EMAIL_REPLY_TO=hello@getplentry.com
```

`RESEND_API_KEY` is required. `ORDER_EMAIL_FROM` may be omitted; the function then uses `Plentry <orders@getplentry.com>`. A blank resolved From, or a missing key, returns 503 and does not claim a row. `ORDER_EMAIL_REPLY_TO` is `hello@getplentry.com`. The function stays env-driven: if that secret is unset, the send has no `reply_to`. Replies to order emails land at `hello@getplentry.com` and are then forwarded. Never put these values in git or in `doc/`. Do not put a Gmail address in the repo. The function does not log the key. `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are the same secrets `notify-order` already uses. After three Resend 401/403 releases in a row, across any orders, `order-email` sends one Telegram saying the email config looks wrong. It does not send that again until a customer mail or a test mail succeeds. There is no 24-hour cooldown. The message names no secret. If Telegram does not accept it, the next 401/403 tries once more.
4. **Deploy `order-email`.** `supabase functions deploy order-email` (project `ucciqthwxnlkjalwlhvh`). `verify_jwt` is false. Confirm a POST with no `x-webhook-secret` returns 401.
5. **Apply the SQL.** `order_received.sql` first, if it is not already applied. Then paste `order_completion_email.sql` and run it. The trigger is `AFTER UPDATE OF received_confirmed_at` WHEN that timestamp goes from null to set, and only when `payment_status = 'captured'`. The first run sets every order that is already received and captured to `completion_email_status=skipped`. A `received_confirmed_by = 'backfill'` row is skipped with `backfill: receipt backfill is not emailed` and is never emailed. Confirm one `cron.job` row named `plentry-order-email-sweep`. A second paste does not add another job and does not change a row that already has a status. It does skip a captured, already-received row that is still null. Do not re-run after the first real completion email unless that is intended.
6. **Deploy static after the SQL.** The admin badge and **Send test email** button ship with the static promote. Customers do not see them. The button needs an aal2 admin session. It sends a labelled TEST mail to that admin’s login address and does not write `orders`.

**Roll back in reverse.** Roll the static back first, while the columns still exist. Then roll the SQL back (the commented block at the bottom of the file). Then remove or redeploy `order-email` if that function should go away. Rolling the SQL back before the static makes the admin select miss the columns; the page falls back and hides the badge, which is why static comes off first.

**Stuck `sending` at 5 attempts.** The admin badge says **email sending** for every row with `completion_email_status = 'sending'`, including one whose `completion_email_attempts` is already 5. That row is not reclaimed. The claim and the 15-minute sweep both require attempts under 5, so the Resend idempotency key expiring after 24 hours does not send it again. The badge stays until the status changes.

Clearing it is manual SQL on production. That needs Noé's GO. Run it in the SQL editor. The column guard allows `postgres` and `supabase_admin`. Replace `<id>` with the order id.

See the row:

```sql
select id, completion_email_status, completion_email_attempts,
       completion_email_claimed_at, completion_email_error
from public.orders
where id = <id>;
```

Record it as failed. The badge becomes **email failed** and the error is the tooltip. Attempts stay at 5, so it is still not retried:

```sql
update public.orders
set completion_email_status = 'failed',
    completion_email_error = 'stuck sending at attempt cap; cleared by hand'
where id = <id>
  and completion_email_status = 'sending'
  and completion_email_attempts >= 5;
```

Or allow exactly one more try. The next claim increments attempts from 4 to 5:

```sql
update public.orders
set completion_email_status = null,
    completion_email_claimed_at = null,
    completion_email_error = null,
    completion_email_attempts = 4
where id = <id>
  and completion_email_status = 'sending'
  and completion_email_attempts >= 5;
```

The sweep, or the next delivered and captured update, claims that one retry. Do not set attempts back to 0 unless five new tries are intended.

Manual checks after the paste: [TESTING.md](TESTING.md).

## Shipping pay and static together

Use the full sequence when a change edits the shared basket: `supabase/functions/_shared/portions.ts`, or the basket block in `index.html` (the region between the portion markers, kept byte-identical with `portions.ts`). `pay` is the function that imports `portions.ts`. It rebuilds the basket and holds `round(shop × 1.05 × 1.30)`. The Confirm screen uses the same formula on the client's basket. Those two copies have to be the same code, or the figure on the screen and the Stripe hold diverge.

From 13 Oct 2026 until PR #12 (`4699353a`, 15 Oct 2026), a merge to `main` auto-deployed static immediately through Vercel's Git integration, and `pay` was a separate `supabase functions deploy pay`. The new static was already on https://getplentry.com while `pay` was still the previous version. On 13 Oct 2026 that gap was about 37 seconds. `vercel.json` now sets `git.deploymentEnabled` to `{ "main": false }`. A merge does not deploy static from `main`. Branches left out of that object stay enabled, so pull-request and other-branch previews still deploy. A boolean `false` would stop every branch. `github.enabled` is the deprecated switch; do not use it.

The Supabase GitHub integration is a different switch, and Deploy to production is OFF (Noé, 25/26 Oct 2026). A merge does not redeploy edge functions. See [Functions](#functions). `pay` was v33 after the 13 Oct ship and v52 from the 25 Oct #29 deploy (13:10:17 GMT). Live `pay` is v53, hand-deployed at 12:05 GMT on 28 Oct 2026. `ai` was hand-deployed from v51 to v52 at 15:44:08 GMT on 26 Oct 2026.

The default ship is below. Merge on GO. When a function changed, deploy that function by hand (`supabase functions deploy <name>` or MCP) under a GO, after `npm test` on the merge SHA. Do not deploy functions that did not change. Build static from the merge SHA without moving the domains, confirm the hand deploy, then promote straight away. When the functions changed, the customer-facing gap is new functions with the previous static, from the hand deploy until the promote.

### What a mismatch does

Confirm shows a hold. `pay` ignores that figure and recomputes the hold.

- **New static, previous `pay`.** The screen uses the new basket. The card is held from the previous basket. When the new basket is the cheaper one, the card hold is larger than the figure on the screen. When the new basket is the dearer one, the card hold is smaller than the figure on the screen.
- **New `pay`, previous static.** The screen uses the previous basket. The card is held from the new basket. When the new basket is the cheaper one, the card hold is smaller than the figure on the screen. When the new basket is the dearer one, the card hold is larger than the figure on the screen.

The case to avoid is a card authorisation larger than the figure the customer was shown.

### Default ship (shared basket)

Merge on GO. Do not deploy from the PR branch. A squash merge changes the SHA and keeps the file bytes when that PR was the tree that landed. Check out that merge SHA with a clean tree so the upload is that commit. `npm test` has to exit 0 on it.

```bash
cd plentry
git fetch origin main
git checkout <merge-sha>
npm test
URL=$(vercel deploy --prod --yes --skip-domain --scope team_QHpJBQejbrxZ2PhEZQlmbuhj | tail -n 1)
vercel inspect "$URL" --scope team_QHpJBQejbrxZ2PhEZQlmbuhj
# status READY, and a deployment id (dpl_…). getplentry.com and www still point at the previous deployment.
```

`--skip-domain` is the current flag. It has to be used with `--prod`. It creates the production deployment and does not alias the custom domains. `vercel promote` assigns them later. Do not pass `--no-wait`. Stdout's last line is the deployment URL (`*.vercel.app`). The team scope is required.

With `VERCEL_TOKEN`, CLI 63.1.0 returns `User not found (404)`. Send the create from [Production static](#production-static): `POST /v13/deployments?teamId=team_QHpJBQejbrxZ2PhEZQlmbuhj&skipAutoDetectionConfirmation=1`, body `target` `production`, `autoAssignCustomDomains` `false`, `gitSource.sha` this merge SHA. Save the response `id` as `DEPLOYMENT_ID`. Poll until `readyState` is `READY` and `readySubstate` is `STAGED`.

```bash
curl -sS \
  "https://api.vercel.com/v13/deployments/$DEPLOYMENT_ID?teamId=team_QHpJBQejbrxZ2PhEZQlmbuhj" \
  -H "Authorization: Bearer $VERCEL_TOKEN"
# readyState READY, readySubstate STAGED. getplentry.com still points at the previous deployment.
```

When `pay` changed, deploy it by hand from that same SHA before you promote. `supabase functions deploy pay` or MCP, under a GO. `npm test` has to be green. A deploy bumps the version. `deploy_edge_function` is that same hand path, and the rollback path:

- project `ucciqthwxnlkjalwlhvh`
- name `pay`
- entrypoint `index.ts`
- `verify_jwt` **true**. The platform JWT gate stays on. A POST with no JWT must stay 401.
- files: `supabase/functions/pay/index.ts`, plus the `_shared` modules it imports: `_shared/ratelimit.ts`, `_shared/orders.ts`, `_shared/portions.ts`, `_shared/capture.ts`, `_shared/telegram.ts`. The call uploads only the files you pass. Leave one out and the new version fails to boot. `notify-order` also imports `_shared/telegram.ts`; include that file when that function is deployed by hand.

```bash
supabase functions list --project-ref ucciqthwxnlkjalwlhvh
# pay: ACTIVE, verify_jwt true. Read the version. Do not invent it.
# v52 is the 25 Oct 2026 13:10:17 GMT deploy. The 26 Oct merges did not move it.
# ai was hand-deployed from v51 to v52 at 15:44:08 GMT on 26 Oct 2026.
```

Straight away:

```bash
vercel promote "$URL" --yes --scope team_QHpJBQejbrxZ2PhEZQlmbuhj
vercel inspect "$URL" --scope team_QHpJBQejbrxZ2PhEZQlmbuhj
# aliases include getplentry.com and www.getplentry.com
```

REST promote, then read prod. Promote does not rebuild. `201` or `202`. The GET `id` is `$DEPLOYMENT_ID`.

```bash
curl -sS -X POST \
  "https://api.vercel.com/v10/projects/prj_lf6RxDIun7rFk6NDUagt8Ve0lme0/promote/$DEPLOYMENT_ID?teamId=team_QHpJBQejbrxZ2PhEZQlmbuhj" \
  -H "Authorization: Bearer $VERCEL_TOKEN"
curl -sS \
  'https://api.vercel.com/v13/deployments/getplentry.com?teamId=team_QHpJBQejbrxZ2PhEZQlmbuhj' \
  -H "Authorization: Bearer $VERCEL_TOKEN"
```

Then the smoke checks below. Until the promote, the live site is the previous static. When `pay` changed, the hand deploy is this SHA. Promote as soon as the version check passes.

### Static-only

The change is `index.html` outside the shared basket block, `sw.js`, `manifest.json`, `icons/`, `vendor/`, or the security headers in `vercel.json`, and `pay` and `_shared` did not change. Merge on GO. Do not deploy functions when they did not change. Deploy to production is OFF, so the merge does not redeploy them. From the merge SHA: `npm test`, then the REST create (`autoAssignCustomDomains: false`) or the founder CLI `vercel deploy --prod --yes --skip-domain`, confirm READY, then promote and confirm the aliases. With `VERCEL_TOKEN`, use the REST create, READY poll, promote, and `GET /v13/deployments/getplentry.com` from [Production static](#production-static). There is no pay/static code mismatch. The 15 Oct 2026 PR #15 ship is that REST path. See [Ship log](#ship-log).

### Docs-only

The merge only changes `doc/`, the README, or other files `.vercelignore` already excludes, and it does not change `pay`, `_shared`, or the static allow-list (`index.html`, `sw.js`, `manifest.json`, `icons/`, `vendor/`, `vercel.json`). Nothing to build, promote, or deploy. Deploy to production is OFF, so the merge does not redeploy edge functions. Loose SQL is not applied. Never create `supabase/migrations/`.

### Rollback

Before you ship, note the deployment id getplentry.com already points at, and the SHA of the `pay` source that is live.

**Promote has not run.** Do not promote. The domains stay on the previous static. Redeploy `pay` from the previous SHA with `deploy_edge_function` (`verify_jwt` true, and that SHA's `index.ts` plus the `_shared` files it imports) so production `pay` matches the live site.

**Both are already live.** Move them back straight away. Pick the order where, during the gap, the amount held is at most the amount shown. Compare the new hold with the old hold on a week the change can affect.

- The new hold is lower or equal. Roll static back first: `vercel rollback` or `vercel promote <previous-deployment-id> --yes --scope team_QHpJBQejbrxZ2PhEZQlmbuhj`. REST: `POST /v10/projects/prj_lf6RxDIun7rFk6NDUagt8Ve0lme0/promote/<previous-deployment-id>?teamId=team_QHpJBQejbrxZ2PhEZQlmbuhj` with `Authorization: Bearer $VERCEL_TOKEN`. Then redeploy `pay` from the previous SHA. During the gap the screen is the old figure and the card is held for the new figure, which is smaller or the same.
- The new hold is higher. Redeploy `pay` from the previous SHA first. Then roll static back the same way. During the gap the screen still shows the higher figure and the card is held for the old, smaller figure.

`vercel rollback` with no id rolls back to the previous production deployment. Passing an older id than that previous one needs a Pro plan; promoting the recorded previous deployment id works on either plan. Confirm `vercel inspect` aliases and `supabase functions list` (`pay` version, ACTIVE, `verify_jwt` true), then the smoke checks.

A static ship whose function source did not change has nothing to roll back on the functions: they were not deployed. If you have not promoted, do nothing to the domains. If you have, `vercel rollback` or promote the previous deployment id. A docs-only merge changes no function behaviour and deploys nothing, so there is nothing to roll back.

While Vercel auto-deploy of static was on, the interim orders were: deploy `pay` from the PR head and then merge, when the new hold was lower or equal; or merge first and then deploy `pay`, when the new hold was higher. The 13 Oct garam masala ship was the second of those (about 37s). Those orders are not the ship anymore. Deploy to production is OFF. A function moves only when someone runs `supabase functions deploy <name>` or MCP under a GO. If that setting is re-enabled, every merge redeploys all functions.

### Post-ship checks

```bash
supabase functions list --project-ref ucciqthwxnlkjalwlhvh
# pay: new version, ACTIVE, verify_jwt true

vercel inspect "$URL" --scope team_QHpJBQejbrxZ2PhEZQlmbuhj
# deployment id (dpl_…) ; aliases include getplentry.com and www.getplentry.com

curl -sS \
  'https://api.vercel.com/v13/deployments/getplentry.com?teamId=team_QHpJBQejbrxZ2PhEZQlmbuhj' \
  -H "Authorization: Bearer $VERCEL_TOKEN"
# id is the deployment you promoted

curl -fsSL https://getplentry.com/ -o /tmp/plentry-apex.html
curl -fsSL https://www.getplentry.com/ -o /tmp/plentry-www.html
cmp /tmp/plentry-apex.html /tmp/plentry-www.html && echo 'apex and www serve the same body'

B=https://ucciqthwxnlkjalwlhvh.supabase.co/functions/v1
curl -s -o /dev/null -w 'pay OPTIONS %{http_code}\n' -X OPTIONS \
  -H 'Origin: https://getplentry.com' -H 'Access-Control-Request-Method: POST' "$B/pay"   # 204
curl -s -o /dev/null -w 'pay POST %{http_code}\n' -X POST \
  -H 'Content-Type: application/json' -d '{}' "$B/pay"   # 401
```

`www` 308s to the apex. `curl -fsSL` follows that redirect, so matching bodies means both names end on the deployment you just aliased. `vercel inspect` is the check that the deployment id carries both aliases.

## Ship log

Newest first. The same ships are in [CHANGELOG.md](CHANGELOG.md) and under Last production ship in [CURRENT-STATE.md](CURRENT-STATE.md).

### 2026-10-28 12:02 GMT — PR #35, capture split (SQL + pay + notify-order)

PR #35 squash-merged to main as `ea90a314bbe55af000e41d3bc0f34bd9569ad151` at 12:02:45 GMT. `supabase/orders_capture_split.sql` was applied to prod at about 12:04 GMT. Loose file, not a migration. The header says `APPLIED to prod 28 Oct 2026 ~12:04 GMT`. SQL statements are byte-identical to the applied file. Pending-file sha256 `15146e29c11c273cf5a3d2bc653091e4a243aa36f96a4bb18b6abca78636a022`. Stamped sha256 `e7f214da066d0205bfa6ea734e62b157cadbfd0c3207e7c3773a4ffead96b139`.

- **Functions.** `notify-order` hand-deployed as v46 at 12:04 GMT. `pay` hand-deployed as v53 at 12:05 GMT. No static deploy. `ai` v52, `checkout` v44, `stripe-webhook` v43, and `newcoming` v37 are unchanged.
- **Rollback.** `pay` v52 and `notify-order` v45 (code from `985a4511`), then `security_hardening_v3.sql`, then drop `overrun_amount`, `fee_amount`, and `store_total`. Once `guard_completion_email_columns` exists, skip the table-wide INSERT/UPDATE re-grant on `public.orders`.

### 2026-10-27 ~22:42 GMT — PR #33, meals MAINTAIN revoke (SQL only)

PR #33 squash-merged to main as `985a451199b74c30e904fb607a6c03cfb70a098f` at 22:41:32 GMT. `supabase/meals_revoke_maintain.sql` was applied to prod at about 22:42 GMT. Loose file, not a migration. The header says `APPLIED to prod 27 Oct 2026 ~22:42 GMT`. SQL statements are byte-identical to the applied file. Stamped sha256 `5fe758a5783713fc38b50f81a332a2a400e1154dbabda779dce275a157305bff`.

- **Checks:** anon and authenticated have no `MAINTAIN` on `public.meals`. Each still has the same 11 SELECT columns: `category`, `emoji`, `id`, `image_url`, `ing`, `name`, `portions`, `recipe`, `reviewed_at`, `tags`, `time`.
- **No deploy.** No edge function and no static promote. The 26 Oct ship below still records that `MAINTAIN` was open at that ship.

### 2026-10-26 15:34 GMT — PR #31, #30, #32, static + SQL + ai

All squash, on 26 Oct 2026. PR #31 `4425f41134532850f5ef00d022955f7d77fa22b4` at 15:10:57 GMT. PR #30 `df0c53e00f8e9af8a734fae5daeb4944a6dec3b6` at 15:18:29 GMT. PR #32 `89c84c1beb26aec0453e76dd06aae8b0b7a85894` at 15:26:07 GMT. Deploy to production is OFF. After these three merges all 6 edge functions were unchanged and the Supabase Preview check was skipped.

- **Static:** `dpl_4DarVmBySV9ujJq3Lrdn7MJgDx93` from `89c84c1b`. Promoted at 15:34:52 GMT.
- **Rollback:** `dpl_E3gKjdssEyFx6NXbaNsLQo5Zvrbp`.
- **SQL:** `supabase/fix_meal_photos.sql` applied to prod at about 15:42 GMT (8 rows). Applied file sha256 `199130acc9e977f7f068adbd6538509b67b50be723ce4c8d8964d7b9fc2e2729`. `supabase/meals_followups.sql` applied to prod at about 15:42 GMT. Applied file sha256 `af014769bf7444bb464a7fb37448f278c67ea5872fa6801aa5bc818e05907fb8`. Both are loose files, not migrations. The repo headers say `APPLIED to prod 26 Oct 2026 ~15:42 GMT`. SQL statements are byte-identical to the applied files. Stamped sha256 `2f8957c2bee8e0b0d343b7aa5f8a5403a653b38e71436ff1cfe2388ec3139f78` (`fix_meal_photos.sql`) and `9d0b16af6e63c43e9ef4d26d4a662155800c7b56dd3332bfc6892ca04761be15` (`meals_followups.sql`).
- **Checks:** 52 of 52 photos return 200. Grants were as reviewed. Anon and authenticated each see 52 published meals and 0 drafts. The aal2 admin path is untested.
- **Open:** anon and authenticated still hold `MAINTAIN` on `public.meals`.
- **Edge functions:** `ai` was hand-deployed from v51 to v52 at 15:44:08 GMT (`supabase functions deploy ai`, under a GO). `pay` v52, `checkout` v44, `notify-order` v45, `stripe-webhook` v43, and `newcoming` v37 are unchanged. These merges did not redeploy functions.

### 2026-10-25 13:14 GMT — PR #27, #28, #29, static + SQL + edge functions

All squash, on 25 Oct 2026. PR #27 `fix/review-followups` `ca43eb1749a349804cb2845d639d9967e781f46e`. PR #28 `fix/meals-read-published` `31a864f2005b5a9f92ceec8b380bdbc750692a07`. PR #29 `fix/seeded-tiebreak` `7d1d53ace5ec9883802c4ca5f3bb92b7470699ec`. A 0p share that still owns a basket line shows the price. **From your cupboard** stays for a dinner with no basket line. New week and Modify break equal scores with the week's seed. Anon and a signed-in non-admin read published meals only.

- **SQL:** `supabase/meals_read_published.sql` applied to prod Supabase at 12:59 GMT. Applied file sha256 `3efbb68ce7adc1f613a5251d412da0a1a31b8cbe4cb93858ac4eb5f4a701ac59`. Loose file, not a migration. Post-apply checks passed: `pg_policies` shows `read published meals` plus the 3 admin policies; anon has no table-level SELECT and exactly 11 columns granted; anon and authenticated each see 52 published meals and 0 drafts; anon REST `select=*` and `select=created_by` return permission denied. The admin-with-MFA draft visibility check is untested. The repo header now says `APPLIED to prod 25 Oct 2026 12:59 GMT`. SQL statements and the commented rollback are byte-identical to the applied file. Stamped file sha256 `fe56606436014f837d6513d725c524e9bdb1a2ed5a02033cab3f7a35d51162b4`.
- **Static:** `dpl_E3gKjdssEyFx6NXbaNsLQo5Zvrbp` from `7d1d53ac`. READY at 13:09:49 GMT, promoted at 13:14:43 GMT. `index.html` sha256 went from `d81025a6f85e6f23cb89bc0190fc8726773e5052ffe80e27bd4d66ca06281241` to `14fea34d522c3dbd74cbc30fdc138d1592e1b01360ccd239ea6c0a7197439c6c`.
- **Edge functions.** Each of PR #27, #28, and #29 also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. `pay` was v33 after PR #10 on 13 Oct. Nineteen merges to `main` since then, one auto-deploy each, left `pay` at v52. v52 is the deploy at 13:10:17 GMT on 25 Oct 2026, about 40s after #29 (`7d1d53ac`) merged.
- **Rollback:** `dpl_BARhEjagaW5Lbn4f4y22CheQ85Kh`.
- **Smoke:** passed before the promote, on the deployment, through a temporary Vercel share link (the deployment URL is SSO-protected), and after the promote on getplentry.com. A non-admin smoke test account exists for prod smoke tests. Its credentials live in box env vars `PLENTRY_SMOKE_EMAIL` and `PLENTRY_SMOKE_PASSWORD`.
- **Known:** the checkout quote returns `{live:false}` on prod, before and after this ship, so baskets use shelf prices. It is under review.

### 2026-10-23 — PR #26, static

Squash `7f1453ea4722de15b4bdf0aae07a2f2ff681d859`. Dinner prices are each dinner’s share of the whole-pack basket. Production deployment `dpl_BARhEjagaW5Lbn4f4y22CheQ85Kh`. The merge also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. `supabase/meal_ingredient_prices.sql` was not applied. No SQL.

### 2026-10-23 — PR #25, static

Squash `f1f37b0e0bad5eff14912e9097b9d59e69b37e37`. Header **Log in** opens the login form. Production deployment `dpl_69A69HuoPVqFbH22V1GggvgR9rdX`. The merge also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. No SQL. The 26 Oct ship is the current static.

### 2026-10-19 — PR #19, CI and docs

Squash `1599a417fc564fe5368fad53c96da77eeab2cd5f`. `claude-review` uses the repository secret `ANTHROPIC_API_KEY`, `--model opus`, `--fallback-model sonnet`. CI and docs only. No static build. The merge also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit.

### 2026-10-15 15:52 BST — PR #15, static

Squash `e35b087b6a7f64e6cb50e0cc8dfde10ade247ca9`. Per-meal price split on the day cards. `pay` source was unchanged. The merge also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. A merge to `main` does not auto-deploy static since PR #12 (`4699353a689e861491c056517a823a39cc15b7fe`, 15 Oct 2026). This ship was the REST create (`POST /v13/deployments`, `autoAssignCustomDomains: false`, `gitSource.sha` the merge SHA) and the promote (`POST /v10/projects/prj_lf6RxDIun7rFk6NDUagt8Ve0lme0/promote/{id}`), `teamId=team_QHpJBQejbrxZ2PhEZQlmbuhj`.

- Production deployment `dpl_ByazVmgr1eDffUFhqEwwWRDdTVea`, promoted 15:52 BST on 15 Oct.
- The apex and www `index.html` sha256 begins `f529f335`.
- Rollback target: `dpl_5sz1cse98dHJ5op3sx4JH6Nino8E` (SHA `ad12a33c63d841ee8cbeaa1e6e28603038dfd8ec`).
- Verified totals: 2 servings £32.93 groceries / £37.73 total; 4 servings £43.53 / £48.86; 6 servings £54.89 / £60.78.
- The headline price is based on the meal basket, not a basket the user has edited.

### Other merges after 13 Oct

Each merge below also auto-redeployed all edge functions through the Supabase GitHub integration, with code identical to `main` at that commit. Static was not promoted by these merges. No version numbers are recorded for them. `pay` v33 is the 13 Oct PR #10 deploy. `pay` v52 is the 25 Oct #29 deploy at 13:10:17 GMT.

- 14 Oct, PR #11, `ad12a33c63d841ee8cbeaa1e6e28603038dfd8ec`. Docs: record the 13 Oct ship.
- 15 Oct, PR #12, `4699353a689e861491c056517a823a39cc15b7fe`. Stop Vercel Git auto-deploy of static on `main`.
- 15 Oct, PR #13, `6631fe5366e1d24b448dd7a2f843dddc0dad3b45`. Claude review gate.
- 15 Oct, PR #14, `674469da15adefd67df2a5eea17ce490bd9a9991`. REST ship path.
- 15 Oct, PR #16, `e037e15527b002a805ecee11e54ffaa257b7c571`. Claude review on Opus 5.5.
- 15 Oct, PR #17, `bc0578a303a4c00f6f77ebe755dbf89b790411f0`. Opus alias.
- 15 Oct, PR #18, `0e829049312830cc9df75c3430d3a0ec303b0601`. Sonnet diagnostic.
- 19 Oct, PR #20, `6833beb9de908c7b517ba77d43c09ac0d8f734c3`. Docs: record the 15 Oct ship.
- 21 Oct, PR #21, `76acd71c61bc88d6bb1ae04eded0c7e27b52a550`. Claude review only when labeled.
- 21 Oct, PR #22, `6b7e9f1be68a2a0c2f5e716f4ff4b891c609f2b9`. Onboarding reorder, including the Profile budget clear and the unset budget.
- 21 Oct, PR #23, `4a4295c8ed5be72530f7846436b048b85c609894`. Empty household postcode.
- 21 Oct, PR #24, `a3c5dca8062384eefb519b9cd94fb34acefaefda`. Cupboard pictures.

### 2026-10-13 14:09 BST — PR #10, static + pay

Squash `711f059d9087e65406d3004c7d29aa1d3efd0e9c`. Git auto-deploy `dpl_FjLuhYS8QSV28DcxmqnPzdGWjdWL` at 14:09:28 BST. `pay` v33 at 14:10:05 BST. Static and `pay` were mismatched for about 37 seconds. That was the last ship while Vercel auto-deploy of static for `main` was on.

## Live schema check (after any project reset or before trusting the rate limits)

```sql
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and proname in ('check_rate_limit','validate_order','order_webhook_secret');   -- 3 rows
select tgname from pg_trigger where tgname = 'validate_order';                                             -- 1 row
select column_name from information_schema.columns where table_name = 'orders' and column_name = 'checkout_session';
select column_name from information_schema.columns where table_name = 'orders' and column_name = 'delivery_slot'; -- 1 row
select column_name from information_schema.columns where table_name = 'orders' and column_name in ('slot_date','slot_start','slot_end','issue_status'); -- 4 rows
select tgname from pg_trigger where tgname in ('validate_order','orders_clear_slot_on_insert');                   -- 2 rows
select tgname from pg_trigger where tgname in ('order_messages_open_issue','notify_issue_webhook');               -- 2 rows
select name from vault.secrets;                                                                            -- order_webhook_secret
select grantee, routine_name from information_schema.routine_privileges
 where specific_schema = 'public' and grantee in ('anon','authenticated','PUBLIC');                        -- 0 rows
```

If anything is missing, re-run in order: `security_hardening.sql`, `security_hardening_v2.sql`, `security_hardening_v3.sql`, `webhook_secret_vault.sql`, `orders_slot_issue.sql` (all SAFE TO RE-RUN). Before 17 Sep 2026 the first two had never been applied — every rate limit failed open.

## Supermarket checkout — per order (pilot)

No special Waitrose/Tesco concierge account. For **each** Plentry order, start a **new** supermarket checkout and paste **that row** (Ops Copy list / Telegram):

1. **PHONE** first — the driver's callback. Never your number.
2. Name, line 1/2, city, postcode from **Deliver to**.
3. Book **MUST book:** `{weekday} {date} {start}–{end}` only. If that window is not offered, stop and **Message customer** in Inbox.
4. Two orders in flight = two checkouts. Do not edit address A while order B is already booked.

Leave your account billing/login as-is. A saved second address is enough; guest checkout is optional.

## Founder 2-step verification (S-06) — switch-on order

**Done 18 Sep 2026** (factor verified, `admin_mfa_aal2_policies` migration, `REQUIRE_ADMIN_MFA=1`). Kept for a fresh project or after a roll-back:

1. Deploy static + `pay` (above).
2. Log in as the founder → **Profile → Security → Turn on 2-step verification**. Scan the QR (Google Authenticator / 1Password / Authy), enter the first code.
3. Sign out, sign in, enter the code when asked — Ops and Meals come back.
4. SQL Editor: run `supabase/admin_mfa.sql` (founder RLS now needs `aal2`).
5. `cd plentry && supabase secrets set REQUIRE_ADMIN_MFA=1` (capture needs `aal2`).

Lost device: Supabase Dashboard → Authentication → Users → founder → remove the TOTP factor, then re-enrol. Roll back the server side with `admin_policies.sql` + `supabase secrets unset REQUIRE_ADMIN_MFA`. Quick live check that the gate holds (read-only, run in the SQL Editor as postgres): `create temp table f as select id from auth.users where email='noyouchka.bouchard@gmail.com'; grant select on f to authenticated; select set_config('request.jwt.claims', json_build_object('sub',(select id from f),'email','noyouchka.bouchard@gmail.com','role','authenticated','aal','aal1')::text, true); set local role authenticated; select public.is_founder_aal2(), count(*) from public.orders;` → `false`, own orders only; with `'aal2'` → `true`, every order.

## Live money test (live Stripe — test cards do not work)

Do this once after any change to `pay`, `stripe-webhook`, `notify-order` or the checkout UI. The founder is the customer, with their own real card.

1. Log in as a **customer account** (or the founder account — either works; the founder gets the code prompt), pick a small week, **Order this week** → Confirm → Stripe Checkout with the real card. Hold ≈ (basket + 5%) × 1.30.
2. Expect: redirect back to **Orders** with *hold placed*; the DB row has `payment_status=authorized`, `checkout_session=cs_…`, `amount_held`, server-built `items.basket` (`product`, `shelf_price`, whitelisted `search`); Telegram message with the list + store search links; `stripe-webhook` log shows 200.
3. **Ops** (founder, after the 6-digit code): the order shows *Deliver to*; type store £ **1.00** → *Charge £1.05* → *Confirm £1.05* → *Money received — £1.05 is in Stripe*. Stripe releases the rest of the hold automatically (partial capture). This is the **money test** in FLOWS — do **not** shop for it; leave status New or tap Delivered to tidy.
4. Stripe Dashboard → Payments → that £1.05 → **Refund**. Stripe keeps its fee (≈ 1.5% + 20p ≈ £0.22); the customer gets £1.05 back in a few days.
5. Zero-cost variant: stop after step 2 and in Stripe Dashboard → Payments → the *Uncaptured* payment → **Cancel**. Note the app row stays `authorized` (the webhook handles `checkout.session.expired`, not `payment_intent.canceled`); set `payment_status='canceled'` by hand in the SQL Editor.

Test mode (4242 cards) is possible but means swapping `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` to test keys, adding a **test-mode** webhook endpoint in Stripe for `checkout.session.completed` / `checkout.session.expired`, and swapping back afterwards — production takes fake payments meanwhile. Not worth it for a single check.

## Auth settings (dashboard)

Auth → Providers → Email → **Minimum password length: 8** (client already enforces 8, S-14). Leaked-password protection stays off (Pro-only).

## Vendored supabase-js (S-07)

`index.html` loads `/vendor/supabase-js-<version>.js`, copied from the npm package (not jsDelivr). To update:

```bash
cd /tmp && npm pack @supabase/supabase-js@<version> && tar -xzf supabase-supabase-js-<version>.tgz
cp package/dist/umd/supabase.js "<workspace>/plentry/vendor/supabase-js-<version>.js"
shasum -a 384 "<workspace>/plentry/vendor/supabase-js-<version>.js"
```

Then change the `<script src>` in `index.html`, delete the old file, and update the version + sha384 in `test/contracts.test.mjs` (I-A04) **in the same change**. `npm test` fails until all three agree.

## Rotating the DB webhook secret (S-13)

```sql
select vault.update_secret((select id from vault.secrets where name = 'order_webhook_secret'), '<new value>');
```

then `supabase secrets set ORDER_WEBHOOK_SECRET=<new value>`. No function redeploy or SQL redefinition needed; both trigger functions read the Vault at call time.

## Auth dashboard

Site URL: `https://getplentry.com`  
Redirects: `https://getplentry.com/**` and `https://plentry.vercel.app/**` (keep the old one for a week so reset mail already sent still opens)

## Stripe

Test first. Webhook (same URL in **test** and **live**; each mode has its own `whsec_`):

`https://ucciqthwxnlkjalwlhvh.supabase.co/functions/v1/stripe-webhook`

Events: `checkout.session.completed`, `checkout.session.expired`.

Then `STRIPE_WEBHOOK_SECRET`. After 4242 works (done 13 Sep, order #31 captured):

1. Capture any open **test** authorized orders in Ops (store £ + 5%). Test PaymentIntents cannot be captured with `sk_live_`.
2. Stripe Dashboard → **Live** mode → [API keys](https://dashboard.stripe.com/apikeys) → secret `sk_live_…`.
3. **New** live webhook (do not reuse the test signing secret) with the URL and events above.
4. Set both on the project (never in git / `doc/` / `index.html`):

```bash
cd plentry
supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_...
```

Secrets apply on the next function invoke; redeploy `pay` / `stripe-webhook` only if the code changed. Keep the test-mode webhook if you still want 4242 in the Stripe sandbox.

**Float:** capture is money in Stripe, not Tesco. First live payout is 7–14 days. Shop from a dedicated Wise (or other) debit balance. Instant Payouts do not skip the first wait. See [REQUIREMENTS.md](REQUIREMENTS.md).

## Telegram

`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ORDER_WEBHOOK_SECRET` must match the DB-side value in `vault.secrets.order_webhook_secret` (the trigger functions read it from Vault since 17 Sep 2026; see “Rotating the DB webhook secret”). Messages are capped at 4000 chars and every store link is rebuilt server-side.

## Meals catalog

New week asks for N dinners (`prefs.meals`, 1–7) and stops when no more **published** meals fit the diet, so the week can be shorter than N. On 21 Oct 2026 the reviewed catalog is 52 of 77 rows: 21 meat, 8 fish, 17 vegetarian, 6 vegan. Vegan can fill at most 6. Vegetarian includes those 6 vegan dinners (23). Pescatarian drops the 21 meat dinners (31). Omnivore can use all 52. Unpublished rows stay off New week and Modify.

After changing the catalog, apply `catalog_review_2026_09_08.sql` (or an equivalent name-keyed update) so `ing`, `time`, and `recipe` match the review file. `meals_full_ingredients.sql` only adds missing salt/pepper — it does not invent dish spices. Deploy **static + `ai`** together when catalog keys change, or meals using new keys disappear from the client.

Meal **tags** and the unverified queue: apply `meals_tags.sql` (SAFE TO RE-RUN). It backfills empty tags, marks pre-2026-09-09 rows reviewed, and enables the fortnight cron. Founder add/verify/delete: `admin_meals_write.sql`. Closed tag list: [TAGS.md](TAGS.md). Queue: [NEWCOMING-MEALS.md](NEWCOMING-MEALS.md). Deploy `ai` and `newcoming` with the static app.

Log in as `noyouchka.bouchard@gmail.com`. Ops status bar is reversible. Capture box = **exact supermarket charge**; 5% is added in `pay`. Catalog: **Meals** tab → New meal → Verify & publish (or `update meals set reviewed_at = now() where id = …`).
