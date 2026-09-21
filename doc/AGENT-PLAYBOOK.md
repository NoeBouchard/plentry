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

**Production:** `npm test` must exit 0 **before** `vercel deploy --prod` or `supabase functions deploy`. A red suite means stop. Do not ship, do not “deploy anyway and fix later”. Merge is not live.

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

Never deploy from a PR branch. After merge, only if the founder asks:

```bash
cd plentry
npm test                                # MUST be 0. Stop if not.
vercel deploy --prod --yes --scope team_QHpJBQejbrxZ2PhEZQlmbuhj
supabase functions deploy pay ai newcoming        # if those functions changed
```

Never run the Vercel or functions deploy if `npm test` failed. Vercel is not git-connected. `git push` / merge does not ship the site.

Money, XSS, RLS, `pay/`, `stripe-webhook`, or capture PRs: `/review-bugbot` and `/review-security` before merge.

## Security agents

Use `doc/SECURITY.md` + this playbook. Report findings; do not add exploit PoCs to the repo. Prefer hardening patches and tests.

## Never

- Force-push, skip hooks, or commit `.env`.
- Disable RLS or service-role in the browser.
- Capture more than the Stripe hold.
- Add a second front-end framework.
- Deploy to production while `npm test` is red.
- Push product changes straight to `main`, or treat merge as production.
