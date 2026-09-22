## Summary

<!-- What changed and why. One or two sentences. -->

## Checks

- [ ] **Requirements** — fits [doc/REQUIREMENTS.md](doc/REQUIREMENTS.md) and [doc/FLOWS.md](doc/FLOWS.md). No new stack, fee model, or fulfilment path.
- [ ] **Invariants** — new behaviour has a test named with an ID (`I-M…` / `I-O…` / `I-S…` / `I-A…` / `I-X…` / `I-W…` / `I-C…`). No assertions deleted to go green.
- [ ] **Security** — if this touches `pay/`, `stripe-webhook`, RLS/SQL, capture, XSS, or the `index.html` money path: `/review-security` (and `/review-bugbot`) before merge. Secrets stay out of git and `doc/`.
- [ ] **Tests** — `npm test` exits 0 locally.
- [ ] **Vault** — if behaviour changed: `CURRENT-STATE.md`, `CHANGELOG.md`, and `npm run vault` (workspace `doc/` → `plentry/doc/`).
- [ ] **Deploy** — this PR does **not** ship production. `git push` / merge is not Vercel. Founder asks after merge: `npm test && vercel deploy --prod` (and functions only if they changed).

## Test plan

<!-- How a human would click through, or “covered by I-…” -->
