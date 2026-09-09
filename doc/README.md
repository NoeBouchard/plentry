# Plentry vault

This folder is the **source of truth** for product, architecture, current behaviour, testing, and how agents ship work. Treat it like an internal SaaS wiki: code can lag a chat; the vault must not.

**App code lives in `plentry/`.** This `doc/` folder sits at the Kitchen planner Cursor workspace root:

`/Users/noebouchard/work/EVERYTHING/Claude/Projects/Kitchen planner`

The same files are copied to `plentry/doc/` so the GitHub repo carries the vault. **Edit this folder, then copy to `plentry/doc/` when committing.** Do not use the old `Documents/EVERYTHING/…` path.

| Read this | When |
|---|---|
| [PRODUCT.md](PRODUCT.md) | What we are building and for whom |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the system is put together |
| [CURRENT-STATE.md](CURRENT-STATE.md) | What actually works today (Sep 2026) |
| [ROADMAP.md](ROADMAP.md) | Next steps, in order |
| [AGENT-PLAYBOOK.md](AGENT-PLAYBOOK.md) | How any agent must work (harness, tests, vault updates) |
| [TESTING.md](TESTING.md) | How to run the suite; what “green” means |
| [SECURITY.md](SECURITY.md) | Threat model and audit starting points |
| [RUNBOOK.md](RUNBOOK.md) | Deploy, secrets, Ops |
| [CHANGELOG.md](CHANGELOG.md) | Functional history — **update on every staged change** |
| [MEAL-INGREDIENTS-REVIEW.md](MEAL-INGREDIENTS-REVIEW.md) | All 77 dinners: ingredients + method (applied to Postgres 8 Sep 2026) |
| [TAGS.md](TAGS.md) | Closed meal tag set (diet, nutrition, context, use case) |
| [NEWCOMING-MEALS.md](NEWCOMING-MEALS.md) | Unreviewed AI dinners; Ops + fortnight Telegram |

Stale copies: `plentry/README.md`, `plentry/SPEC.md`, `plentry/PLAN.md` are historical. If they disagree with this vault, **this vault wins**. After a change, update the vault rather than only those files.

Live site: https://plentry.vercel.app  
Supabase project: `ucciqthwxnlkjalwlhvh` (eu-west-1)  
Admin / Ops email: `noyouchka.bouchard@gmail.com`  
Last ship: 9 Sep 2026 (tags + newcoming). Next: [ROADMAP.md](ROADMAP.md).
