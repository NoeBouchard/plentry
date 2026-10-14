# Engineering loop

How a small team (founder + agents) ships Plentry. Product contract: [REQUIREMENTS.md](REQUIREMENTS.md), [INVARIANTS.md](INVARIANTS.md), [FLOWS.md](FLOWS.md). How to edit code: [AGENT-PLAYBOOK.md](AGENT-PLAYBOOK.md).

Git repo is **`plentry/`** → [github.com/NoeBouchard/plentry](https://github.com/NoeBouchard/plentry). As of 13 Oct 2026, merging to `main` auto-deploys static to production through Vercel’s Git integration. `pay` is still a separate Supabase deploy. See [Shipping pay and static together](RUNBOOK.md#shipping-pay-and-static-together).

## Default path

1. Branch off `main`: `feat/…` or `fix/…` (not product work on `main`).
2. Implement the smallest diff. New behaviour gets a test with an invariant ID. Update the vault if behaviour changed (`npm run vault`).
3. Open a pull request. Fill the template (GitHub: `.github/PULL_REQUEST_TEMPLATE.md`; workspace: `plentry/.github/PULL_REQUEST_TEMPLATE.md`).
4. Wait for GitHub Actions **test** (`npm test`, Node 22). Red means do not merge.
5. Second look (you are the only human — this replaces a second reviewer):
   - Always: read the PR against REQUIREMENTS / FLOWS.
   - Money, XSS, RLS, `pay/`, `stripe-webhook`, capture: `/review-bugbot` and `/review-security` in Cursor before merge.
6. Merge when CI is green and the checklist is honest.
7. **Merge ships static.** Merging to `main` auto-deploys the static site to production (13 Oct 2026). `pay` does not ride along. When `_shared/portions.ts` or the basket block changes, follow [Shipping pay and static together](RUNBOOK.md#shipping-pay-and-static-together) before the merge — a manual `vercel deploy --prod` is not what puts static live while auto-deploy is on. Do not deploy from a PR branch. `npm test` has to be green before the merge, because the merge is the static ship.

```
feature branch → PR → CI npm test → Bugbot/security if money/XSS → merge main → static auto-deploys; pay separately (RUNBOOK)
```

## Agents

- Do not push product changes straight to `main`.
- Do not `vercel deploy` or `supabase functions deploy` from a PR, or while `npm test` is red.
- A merge to `main` already auto-deploys static. Do not follow that with a manual `vercel deploy --prod` and call that the static ship. Shared basket changes: [Shipping pay and static together](RUNBOOK.md#shipping-pay-and-static-together).
- Do not require a second GitHub human approval (solo founder).

## GitHub (founder, once)

Repo → **Settings → Rules → Rulesets → New branch ruleset** (not the old “Branches” page):

- Name: `require-test`. Enforcement: **Active**. Bypass list: empty.
- Target: include default branch (`main`).
- **Require a pull request before merging**, required approvals **0**.
- **Require status checks to pass**, add only **`test`**. Leave Supabase Preview and Vercel off that list. Merging to `main` still auto-deploys static (13 Oct 2026). `pay` does not. See [Shipping pay and static together](RUNBOOK.md#shipping-pay-and-static-together).
