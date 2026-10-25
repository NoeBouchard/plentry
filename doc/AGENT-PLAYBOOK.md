# Agent playbook (SaaS rules)

Every agent (product, bugfix, security) follows this. Chat history is not the source of truth; **this vault is**.

## Before writing code

1. Read `doc/REQUIREMENTS.md`, `doc/INVARIANTS.md`, `doc/FLOWS.md`, then `CURRENT-STATE.md`. Security work: `SECURITY.md` first.
2. Work in the app directory (`plentry/` in the Cursor workspace `/Users/noebouchard/work/EVERYTHING/Claude/Projects/Kitchen planner`, or this repo root on GitHub).
3. Do not invent a React/Next app. The product is `index.html` + Supabase functions. Do not split `index.html` into a bundler to “clean up”.
4. Do not put secrets in the client. Publishable Supabase key is public; RLS and edge secrets do the real work.
5. Do not re-implement checkout, capture, or week-picking. Follow [FLOWS.md](FLOWS.md).
6. `doc/archive/` is historical. Never treat PLAN / Pepesto SPEC / old README as current.
7. Product changes: branch `feat/…` or `fix/…` off `main`, then a PR. See [ENGINEERING.md](ENGINEERING.md). Do not push product work straight to `main`.

## Making changes

- Smallest diff that matches CURRENT-STATE + the user request.
- Money, status, and XSS: keep `esc` / `safeUrl` on untrusted strings; never trust `orders.total` for Stripe (server recomputes).
- Commission is **5%** in **both** `index.html` and `pay/index.ts`. If you change one, change the other and the tests.
- Admin gating: JWT email `noyouchka.bouchard@gmail.com` — UI hide is not security; RLS + `pay` capture check are.

## Harness (do not skip)

```bash
npm test   # in the directory that contains index.html (plentry/)
```

That is the automated gate. It loads `index.html` in jsdom with a fake Supabase and asserts menu, Modify, orders hydration, commission, XSS helpers, and contracts with `pay` / `ai`.

**Merge gate:** GitHub Actions job **test** runs the same `npm test` on every PR and on `main`. Do not merge a red PR.

**Production:** `npm test` must exit 0 before a merge to `main`, and again on the merge SHA before a static ship. From 13 Oct 2026 until PR #12 (`4699353a`, 15 Oct 2026), merging to `main` auto-deployed static to production. Production static is the REST create and promote. `git.deploymentEnabled.main` is now false, so the merge does not deploy static. The merge does redeploy every edge function. A red suite means stop. Do not ship, do not “deploy anyway and fix later”. When `_shared/portions.ts` or the basket block changes, follow [Shipping pay and static together](RUNBOOK.md#shipping-pay-and-static-together).

If you change behaviour the tests encode, **update the tests in the same change**. If tests fail, you are not done.

Do not “fix” tests by deleting assertions to get a green run.

New money/order/XSS behaviour needs a new or extended test **named with the invariant ID** (`I-M04`…). Every automated invariant in [INVARIANTS.md](INVARIANTS.md) already has a test; do not delete them.

## After staging (required)

When the change is ready to keep (committed, or user said ship/stage):

1. Update `doc/CURRENT-STATE.md` (what is true now).
2. Append `doc/CHANGELOG.md` (date, what, why).
3. If the next action changed, update `ROADMAP.md`.
4. If you added a threat or control, update `SECURITY.md`.
5. If the MVP contract moved, update `REQUIREMENTS.md` / `INVARIANTS.md` / `FLOWS.md`.
6. Keep `plentry/doc/` identical — that copy ships with the GitHub repo. Edit workspace-root `doc/` then copy (`cd plentry && npm run vault`). `npm run vault` copies live `*.md` plus `archive/*.md`. It does not copy the Word pack (`.docx`).

Do not leave the vault describing the old product (e.g. “no payments”).

## Deploy (only if asked)

Never deploy from a PR branch. From 13 Oct 2026 until PR #12 (`4699353a`, 15 Oct 2026), merging to `main` auto-deployed static to production. `git.deploymentEnabled.main` is now false, so the merge does not deploy static. The merge does redeploy every edge function. After merge, only if the founder asks, ship static from the merge SHA as in [Shipping pay and static together](RUNBOOK.md#shipping-pay-and-static-together): REST create with `autoAssignCustomDomains: false` (founder CLI: `vercel deploy --prod --yes --skip-domain`), confirm READY, confirm the function redeploy, then promote. Do not run a second functions deploy for that SHA. A one-shot `vercel deploy --prod` aliases getplentry.com as soon as the upload finishes.

```bash
cd plentry
npm test                                # MUST be 0. Stop if not.
# Then the RUNBOOK sequence for this change (static-only, docs-only, or pay + static).
```

Never run a Vercel or functions deploy if `npm test` failed. A merge to `main` does not auto-deploy static. It does redeploy every edge function. A `git push` of a feature branch does not deploy either. Shared basket changes: [Shipping pay and static together](RUNBOOK.md#shipping-pay-and-static-together).

Money, XSS, RLS, `pay/`, `stripe-webhook`, or capture PRs: `/review-bugbot` and `/review-security` before merge.

## Security agents

Use `doc/SECURITY.md` + this playbook. Report findings; do not add exploit PoCs to the repo. Prefer hardening patches and tests.

## Never

- Force-push, skip hooks, or commit `.env`.
- Disable RLS or service-role in the browser.
- Capture more than the Stripe hold.
- Add a second front-end framework.
- Deploy to production while `npm test` is red.
- Never create `supabase/migrations/`. Files there would auto-apply to prod on merge via the Supabase GitHub integration.
- Push product changes straight to `main`. A merge to `main` is not the static production ship. It auto-deployed static from 13 Oct 2026 until `git.deploymentEnabled.main` was set false. See [Shipping pay and static together](RUNBOOK.md#shipping-pay-and-static-together).
