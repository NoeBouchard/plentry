# Plentry — agent instructions

You are working on **Plentry**, a concierge grocery + meal-planning app (HelloFresh alternative). Treat this like a SaaS product: do not ship untested behaviour, and keep the vault current.

## Read first

1. [`doc/README.md`](doc/README.md) — vault index  
2. [`doc/CURRENT-STATE.md`](doc/CURRENT-STATE.md) — what is live  
3. [`doc/AGENT-PLAYBOOK.md`](doc/AGENT-PLAYBOOK.md) — how to change the app  
4. Security work: [`doc/SECURITY.md`](doc/SECURITY.md)  
5. App code is in **`plentry/`** (`index.html` + Supabase Edge Functions). There is no React/Next app.

If `doc/` is missing, stop and recreate it at the **workspace root** (this folder: `/Users/noebouchard/work/EVERYTHING/Claude/Projects/Kitchen planner`). Do not invent product facts from `plentry/README.md` or `plentry/SPEC.md` — those files are historical.

## Harness (required before staging)

```bash
cd plentry
npm test
```

Must exit 0. See [`doc/TESTING.md`](doc/TESTING.md). If your change breaks a test, fix the app or update the test in the same change — never delete assertions to go green.

## After staging changes (required)

Update the vault in the same work:

1. `doc/CURRENT-STATE.md` — what is true now  
2. `doc/CHANGELOG.md` — append date, what, why  
3. `doc/ROADMAP.md` if next steps changed  
4. `doc/SECURITY.md` if you added or closed a risk  

Copy the same files into `plentry/doc/` when committing the git repo (the GitHub repo is `plentry/`).

## Deploy (only if the user asks)

Vercel is **not** git-connected. `git push` does not update production.

```bash
cd plentry && npm test && vercel deploy --prod --yes --scope team_QHpJBQejbrxZ2PhEZQlmbuhj
# if functions changed:
supabase functions deploy pay ai newcoming
```

## Never

- Put secrets in `index.html` or the vault  
- Capture more than the Stripe hold  
- Add a second front-end framework  
- Skip `npm test` on UI, money, orders, or XSS-related edits  
