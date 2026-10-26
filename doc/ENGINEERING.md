# Engineering loop

How a small team (founder + agents) ships Plentry. Product contract: [REQUIREMENTS.md](REQUIREMENTS.md), [INVARIANTS.md](INVARIANTS.md), [FLOWS.md](FLOWS.md). How to edit code: [AGENT-PLAYBOOK.md](AGENT-PLAYBOOK.md).

Git repo is **`plentry/`** → [github.com/NoeBouchard/plentry](https://github.com/NoeBouchard/plentry). From 13 Oct 2026 until PR #12 (`4699353a`, 15 Oct 2026), merging to `main` auto-deployed static to production through Vercel’s Git integration. Production static after that is the REST create and promote in [RUNBOOK.md](RUNBOOK.md). `vercel.json` now sets `git.deploymentEnabled` to `{ "main": false }`, so a merge does not deploy static from `main`. Other branches still get preview deployments. Until 26 Oct 2026 that merge redeployed every edge function (Supabase GitHub integration, Deploy to production on). Accounts says that switch is now off, so edge functions are a hand deploy under a GO. See [Functions](RUNBOOK.md#functions) and [Capture split (pending)](RUNBOOK.md#capture-split-pending).

## Default path

1. Branch off `main`: `feat/…` or `fix/…` (not product work on `main`).
2. Implement the smallest diff. New behaviour gets a test with an invariant ID. Update the vault if behaviour changed (`npm run vault`).
3. Open a pull request. Fill the template (GitHub: `.github/PULL_REQUEST_TEMPLATE.md`; workspace: `plentry/.github/PULL_REQUEST_TEMPLATE.md`).
4. Wait for GitHub Actions **test** (`npm test`, Node 22). Red means do not merge. **claude-review** runs only when someone adds the `claude-review` label. It is not a required check, so a pull request does not wait on it. See [Claude review gate](RUNBOOK.md#claude-review-gate).
5. Second look (you are the only human — this replaces a second reviewer):
   - Always: read the PR against REQUIREMENTS / FLOWS.
   - Money, XSS, RLS, `pay/`, `stripe-webhook`, capture: `/review-bugbot` and `/review-security` in Cursor before merge.
6. Merge when CI is green and the checklist is honest.
7. **Merge does not ship static or edge functions.** From 13 Oct 2026 until PR #12 (`4699353a`, 15 Oct 2026), merging to `main` auto-deployed static. `git.deploymentEnabled.main` is now false, so the merge does not deploy static. Until 26 Oct 2026 the Supabase GitHub integration redeployed every edge function about 40s later. Accounts says Deploy to production is now off, so functions are a hand deploy under a GO. Production static is the REST create (`autoAssignCustomDomains: false`) and a promote in [RUNBOOK.md](RUNBOOK.md). A logged-in founder CLI is `vercel deploy --prod --yes --skip-domain`, then `vercel promote`. When `_shared/portions.ts` or the basket block changes, follow [Shipping pay and static together](RUNBOOK.md#shipping-pay-and-static-together) after the merge: hand-deploy the functions, build the merge SHA, confirm the function version, then promote. Do not deploy from a PR branch. `npm test` has to be green before the merge and again on the merge SHA before the static ship.

```
feature branch → PR → CI npm test → Bugbot/security if money/XSS → merge main (does not deploy) → hand-deploy functions under a GO, then static ship per RUNBOOK
```

## Agents

- Do not push product changes straight to `main`.
- Never create `supabase/migrations/`. Files there would auto-apply to prod on merge via the Supabase GitHub integration.
- Do not `vercel deploy` or `supabase functions deploy` from a PR, or while `npm test` is red.
- A merge to `main` does not auto-deploy static. It did, from 13 Oct 2026 until `git.deploymentEnabled.main` was set false. It also does not deploy edge functions. Until 26 Oct 2026 the merge did redeploy every edge function; Accounts says Deploy to production is now off, so that is a hand deploy under a GO. Do not treat the merge as the static ship, and do not follow it with a one-shot `vercel deploy --prod` that aliases getplentry.com. Do not run `supabase functions deploy` from a PR. Shared basket changes: [Shipping pay and static together](RUNBOOK.md#shipping-pay-and-static-together).
- Do not require a second GitHub human approval (solo founder).

## GitHub (founder, once)

Repo → **Settings → Rules → Rulesets → New branch ruleset** (not the old “Branches” page):

- Name: `require-test`. Enforcement: **Active**. Bypass list: empty.
- Target: include default branch (`main`).
- **Require a pull request before merging**, required approvals **0**.
- **Require status checks to pass.** The ruleset lists **`test`**. **claude-review** stays off that list. It runs when the `claude-review` label is added. The plan is to run it once as a full check after onboarding, cupboard pictures, and Modify are done. See [Claude review gate](RUNBOOK.md#claude-review-gate). Leave Supabase Preview and Vercel off that list. Supabase Preview was the GitHub check for the edge-function redeploy while Deploy to production was on. Merging to `main` auto-deployed static from 13 Oct 2026 until PR #12. Static does not auto-deploy now. Edge functions are a hand deploy under a GO. Production static is the REST create and promote. See [Shipping pay and static together](RUNBOOK.md#shipping-pay-and-static-together).
