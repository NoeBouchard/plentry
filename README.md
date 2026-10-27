# Plentry

**Your kitchen on autopilot.** A concierge grocery + meal-planning app (HelloFresh alternative). Customer pays Plentry via Stripe; Ops shops at Tesco / Sainsbury’s / Asda / Waitrose; **5% fee**.

- **Live:** https://getplentry.com
- **App:** `index.html` + `supabase/functions/` — no React, no Next, no bundler
- **Product truth:** [`doc/`](doc/README.md) (copied from the workspace vault). Start at [`doc/REQUIREMENTS.md`](doc/REQUIREMENTS.md).
- **Tests:** `npm test` must exit 0 before any production deploy. GitHub Actions **test** is the merge gate. Since PR #12 (15 Oct 2026) a merge to `main` does not auto-deploy static. Deploy to production is OFF, so a merge does not deploy edge functions either. Functions deploy only by hand with `supabase functions deploy <name>` or MCP, under a GO. If Deploy to production is ever re-enabled, every merge redeploys all functions. Production static is the REST create and promote in [`doc/RUNBOOK.md`](doc/RUNBOOK.md). See [`doc/ENGINEERING.md`](doc/ENGINEERING.md).
- **SQL:** Never create `supabase/migrations/`. Files there would auto-apply to prod on merge via the Supabase GitHub integration.

Do not implement from historical drafts. Those live in `doc/archive/` in the workspace vault.
