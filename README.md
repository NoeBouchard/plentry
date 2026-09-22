# Plentry

**Your kitchen on autopilot.** A concierge grocery + meal-planning app (HelloFresh alternative). Customer pays Plentry via Stripe; Ops shops at Tesco / Sainsbury’s / Asda / Waitrose; **5% fee**.

- **Live:** https://plentry.vercel.app
- **App:** `index.html` + `supabase/functions/` — no React, no Next, no bundler
- **Product truth:** [`doc/`](doc/README.md) (copied from the workspace vault). Start at [`doc/REQUIREMENTS.md`](doc/REQUIREMENTS.md).
- **Tests:** `npm test` must exit 0 before any production deploy. GitHub Actions **test** is the merge gate. Vercel is not git-connected; `git push` / merge does not ship the site. See [`doc/ENGINEERING.md`](doc/ENGINEERING.md).

Do not implement from historical drafts. Those live in `doc/archive/` in the workspace vault.
