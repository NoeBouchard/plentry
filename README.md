# Plentry

**Your kitchen on autopilot.** A concierge grocery + meal-planning app (HelloFresh alternative). Customer pays Plentry via Stripe; Ops shops at Tesco / Sainsbury’s / Asda / Waitrose; **5% fee**.

- **Live:** https://getplentry.com
- **App:** `index.html` + `supabase/functions/` — no React, no Next, no bundler
- **Product truth:** [`doc/`](doc/README.md) (copied from the workspace vault). Start at [`doc/REQUIREMENTS.md`](doc/REQUIREMENTS.md).
- **Tests:** `npm test` must exit 0 before any production deploy. GitHub Actions **test** is the merge gate. Since PR #12 (15 Oct 2026) a merge to `main` does not auto-deploy production. Production static is the REST create and promote in [`doc/RUNBOOK.md`](doc/RUNBOOK.md). See [`doc/ENGINEERING.md`](doc/ENGINEERING.md).

Do not implement from historical drafts. Those live in `doc/archive/` in the workspace vault.
