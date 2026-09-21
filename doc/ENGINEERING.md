# Engineering loop

How a small team (founder + agents) ships Plentry. Product contract: [REQUIREMENTS.md](REQUIREMENTS.md), [INVARIANTS.md](INVARIANTS.md), [FLOWS.md](FLOWS.md). How to edit code: [AGENT-PLAYBOOK.md](AGENT-PLAYBOOK.md).

Git repo is **`plentry/`** → [github.com/NoeBouchard/plentry](https://github.com/NoeBouchard/plentry). Vercel is **not** git-connected. Merge is not live.

## Default path

1. Branch off `main`: `feat/…` or `fix/…` (not product work on `main`).
2. Implement the smallest diff. New behaviour gets a test with an invariant ID. Update the vault if behaviour changed (`npm run vault`).
3. Open a pull request. Fill the template (GitHub: `.github/PULL_REQUEST_TEMPLATE.md`; workspace: `plentry/.github/PULL_REQUEST_TEMPLATE.md`).
4. Wait for GitHub Actions **test** (`npm test`, Node 22). Red means do not merge.
5. Second look (you are the only human — this replaces a second reviewer):
   - Always: read the PR against REQUIREMENTS / FLOWS.
   - Money, XSS, RLS, `pay/`, `stripe-webhook`, capture: `/review-bugbot` and `/review-security` in Cursor before merge.
6. Merge when CI is green and the checklist is honest.
7. **Production only if the founder asks:** `cd plentry && npm test && vercel deploy --prod --yes --scope team_QHpJBQejbrxZ2PhEZQlmbuhj`. Deploy functions only if those files changed. Do not deploy from a PR branch.

```
feature branch → PR → CI npm test → Bugbot/security if money/XSS → merge main → founder asks + npm test → Vercel / functions
```

## Agents

- Do not push product changes straight to `main`.
- Do not `vercel deploy` or `supabase functions deploy` from a PR, or while `npm test` is red.
- Do not connect Vercel to GitHub.
- Do not require a second GitHub human approval (solo founder).

## GitHub (founder, once)

Settings → Branches → protect `main`:

- Require status check **test**
- Do **not** require a second reviewer
- Do **not** enable Vercel git integration
