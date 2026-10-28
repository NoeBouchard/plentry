## Summary

<!-- What changed and why. One or two sentences. -->

## Checks

- [ ] **Requirements** — fits [doc/REQUIREMENTS.md](doc/REQUIREMENTS.md) and [doc/FLOWS.md](doc/FLOWS.md). No new stack, fee model, or fulfilment path.
- [ ] **Invariants** — new behaviour has a test named with an ID (`I-M…` / `I-O…` / `I-S…` / `I-A…` / `I-X…` / `I-W…` / `I-C…`). No assertions deleted to go green.
- [ ] **Security** — if this touches `pay/`, `stripe-webhook`, RLS/SQL, capture, XSS, or the `index.html` money path: `/review-security` (and `/review-bugbot`) before merge. Secrets stay out of git and `doc/`.
- [ ] **Tests** — `npm test` exits 0 locally.
- [ ] **Vault** — if behaviour changed: `CURRENT-STATE.md`, `CHANGELOG.md`, and `npm run vault` (workspace `doc/` → `plentry/doc/`).
- [ ] **Deploy** — this PR does not ship static or edge functions. Deploy to production is OFF. Functions deploy only by hand with `supabase functions deploy <name>` or MCP, under a GO. If Deploy to production is ever re-enabled, every merge redeploys all functions. Capture split shipped 28 Oct 2026 (`orders_capture_split.sql` applied, `notify-order` v46, `pay` v53). See [doc/RUNBOOK.md](doc/RUNBOOK.md). Static stays on the REST create (`autoAssignCustomDomains: false`) and promote in [doc/RUNBOOK.md](doc/RUNBOOK.md). Do not add `supabase/migrations/`. Since PR #12 (15 Oct 2026) `git.deploymentEnabled.main` is false, so static does not auto-deploy (it did from 13 Oct until then).

## Test plan

<!-- How a human would click through, or “covered by I-…” -->
