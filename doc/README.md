# Plentry vault

Single source of truth for product, architecture, what is live, and how agents ship. Code can lag a chat; this folder must not.

**Human review:** open **[Plentry-review.docx](Plentry-review.docx)** in this folder — one Word file with the live contract (not the 77-dinner catalog, not the archive). Regenerate with `python3 doc/build-review.py` from the workspace root.

**App code:** `plentry/` (`index.html` + Supabase Edge Functions).  
**Workspace:** `/Users/noebouchard/work/EVERYTHING/Claude/Projects/Kitchen planner`  
The same markdown is copied to `plentry/doc/` for GitHub (`cd plentry && npm run vault`). Edit **this** `doc/`, then copy.

Live: https://plentry.vercel.app · Admin: `noyouchka.bouchard@gmail.com` · Last ship: **19 Sep 2026** (`pay` v19 + static).

---

## Read in this order

### 1 — Product contract (locked)

| File | What |
|---|---|
| [PRODUCT.md](PRODUCT.md) | Who it is for, pitch, money |
| [REQUIREMENTS.md](REQUIREMENTS.md) | **Locked MVP** — in, out, fee, hold |
| [FLOWS.md](FLOWS.md) | Checkout, Ops, Meals — do not invent a second path |
| [INVARIANTS.md](INVARIANTS.md) | Test IDs `I-M01`… — do not delete assertions to go green |

### 2 — What is true now

| File | What |
|---|---|
| [CURRENT-STATE.md](CURRENT-STATE.md) | What actually works in production |
| [ROADMAP.md](ROADMAP.md) | Next steps, in order |
| [CHANGELOG.md](CHANGELOG.md) | Functional history — append on every staged change |

### 3 — How to change it

| File | What |
|---|---|
| [AGENT-PLAYBOOK.md](AGENT-PLAYBOOK.md) | Harness, tests, vault updates, deploy |
| [ENGINEERING.md](ENGINEERING.md) | Branch → PR → CI → Bugbot/security → merge → founder deploy |
| [TESTING.md](TESTING.md) | `cd plentry && npm test` (CI = merge gate; local = production gate) |
| [RUNBOOK.md](RUNBOOK.md) | Deploy, secrets, Ops, Stripe float |
| [SECURITY.md](SECURITY.md) | Threat model and closed findings |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the pieces fit |

### 4 — Catalog

| File | What |
|---|---|
| [TAGS.md](TAGS.md) | Closed meal tag set |
| [NEWCOMING-MEALS.md](NEWCOMING-MEALS.md) | Unreviewed AI dinners |
| [MEAL-INGREDIENTS-REVIEW.md](MEAL-INGREDIENTS-REVIEW.md) | All 77 dinners (ingredients + method, applied 8 Sep) — too long for the Word pack |

### 5 — History (do not build from)

[archive/](archive/README.md) — June/July PLAN, Pepesto SPEC, old README, Forq prototype, acquisition drafts.

New agent order: **REQUIREMENTS → INVARIANTS → FLOWS → CURRENT-STATE → playbook → ENGINEERING**. Do not restructure `index.html` into a framework. `npm test` must be green before production. Product changes use a PR; merge is not live.
