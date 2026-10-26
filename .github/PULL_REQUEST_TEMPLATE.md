## Summary

<!-- What changed and why. One or two sentences. -->

## Checks

- [ ] **Requirements** — fits [doc/REQUIREMENTS.md](doc/REQUIREMENTS.md) and [doc/FLOWS.md](doc/FLOWS.md). No new stack, fee model, or fulfilment path.
- [ ] **Invariants** — new behaviour has a test named with an ID (`I-M…` / `I-O…` / `I-S…` / `I-A…` / `I-X…` / `I-W…` / `I-C…`). No assertions deleted to go green.
- [ ] **Security** — if this touches `pay/`, `stripe-webhook`, RLS/SQL, capture, XSS, or the `index.html` money path: `/review-security` (and `/review-bugbot`) before merge. Secrets stay out of git and `doc/`.
- [ ] **Tests** — `npm test` exits 0 locally.
- [ ] **Vault** — if behaviour changed: `CURRENT-STATE.md`, `CHANGELOG.md`, and `npm run vault` (workspace `doc/` → `plentry/doc/`).
- [ ] **Deploy** — this PR does not ship static or `pay`. As of 26 Oct 2026 Accounts says Deploy to production is off, so edge functions are a hand deploy under a GO. Capture split: apply `orders_capture_split.sql` before `supabase functions deploy pay` ([doc/RUNBOOK.md](doc/RUNBOOK.md)). Do not add `supabase/migrations/`. Since PR #12 (15 Oct 2026) `git.deploymentEnabled.main` is false, so static does not auto-deploy (it did from 13 Oct until then).

## Test plan

<!-- How a human would click through, or “covered by I-…” -->
