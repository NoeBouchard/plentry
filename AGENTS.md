# Plentry — agent instructions

You are working on **Plentry**, a concierge grocery + meal-planning app (HelloFresh alternative). Treat this like a SaaS product: do not ship untested behaviour, and keep the vault current.

This GitHub repo **is** the app (`index.html` + Supabase Edge Functions). In the Cursor workspace “Kitchen planner”, the same files live under `plentry/`.

## Read first

1. [`doc/REQUIREMENTS.md`](doc/REQUIREMENTS.md) — locked MVP  
2. [`doc/INVARIANTS.md`](doc/INVARIANTS.md) — test IDs  
3. [`doc/FLOWS.md`](doc/FLOWS.md) — checkout / Ops / Meals  
4. [`doc/CURRENT-STATE.md`](doc/CURRENT-STATE.md) — what is live  
5. [`doc/AGENT-PLAYBOOK.md`](doc/AGENT-PLAYBOOK.md) — how to change the app  
6. [`doc/ENGINEERING.md`](doc/ENGINEERING.md) — branch → PR → CI → merge (static is not live; edge functions are a hand deploy under a GO)  
7. Security work: [`doc/SECURITY.md`](doc/SECURITY.md)  
8. There is no React/Next app. Do not add a bundler.

If `doc/` is missing, stop. Do not invent product facts from `doc/archive/` or this `README.md` stub.

## Harness (required before production)

```bash
npm test
```

On GitHub this is the repo root. In the Kitchen planner workspace: `cd plentry && npm test`.

**Must exit 0** before any production ship: Vercel static, `supabase functions deploy`, or telling the founder it is live. See [`doc/TESTING.md`](doc/TESTING.md). If a change breaks a test, fix the app or update the test in the same change — never delete assertions to go green. If tests fail, **stop** — do not deploy.

## Branch and PR

Product changes go on `feat/…` or `fix/…`, then a pull request. Wait for GitHub Actions **test**. Do not push product work straight to `main`. Do not `vercel deploy` from a PR. Money / XSS / RLS / `pay` PRs: `/review-bugbot` and `/review-security` before merge. CI is the **merge** gate; local `npm test` is still the **production** gate. `git push` is never ship.

## After staging changes (required)

Update the vault in the same work:

1. `doc/CURRENT-STATE.md` — what is true now  
2. `doc/CHANGELOG.md` — append date, what, why  
3. `doc/ROADMAP.md` if next steps changed  
4. `doc/SECURITY.md` if you added or closed a risk  
5. MVP contract files if they moved: `REQUIREMENTS.md`, `INVARIANTS.md`, `FLOWS.md`  

In the Kitchen planner workspace, edit root `doc/` then `npm run vault` so this `doc/` stays identical.

## Deploy (only if the user asks)

**Edge functions are a hand deploy under a GO.** As of 26 Oct 2026 Accounts says the Supabase GitHub integration's Deploy to production is off. A merge to `main` does not deploy `supabase/functions/*`. Until that date the integration (Deploy to production ON) redeployed them about 40s after any push to `main`. Never create `supabase/migrations/`: files there auto-apply to prod on merge. Loose `supabase/*.sql` is not applied by that integration. `pay` was v33 after PR #10 (13 Oct 2026) and is v52 as of 25 Oct 2026 13:10:17 GMT. See [`doc/RUNBOOK.md`](doc/RUNBOOK.md).

Static does not auto-deploy. Since PR #12 (`4699353a`, 15 Oct 2026) `git.deploymentEnabled.main` is false. Other branches still get preview deployments. Production static is a Vercel REST create with `autoAssignCustomDomains: false`, then a promote. A push to `main` is not a static deploy and is not a functions deploy. A `git push` of any other branch is not production.

Do not run `supabase functions deploy` twice for the same SHA. A second deploy bumps the version again.

Always run tests first. Do not run a Vercel or functions deploy if `npm test` failed.

```bash
npm test
# static: REST create + promote in doc/RUNBOOK.md
# functions: hand deploy under a GO. Capture split: SQL first, then pay.
# supabase functions deploy is that hand deploy, and the rollback path.
```

## Never

- Put secrets in `index.html` or the vault  
- Capture more than the Stripe hold  
- Add a second front-end framework  
- Skip `npm test`, or ship to production while tests are red  
- Push product changes straight to `main`, or treat a merge as the static ship or the functions ship  
