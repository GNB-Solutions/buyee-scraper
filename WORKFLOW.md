# GNB Solutions — Git Workflow Rules

These rules apply to every repo in the GNB-Solutions org and must be followed in every session.

---

## Branching — always, no exceptions

**Never commit or push directly to `main`.** Every change, no matter how small, goes through a branch and a PR that a human merges.

### Before making any change

1. Check the current branch: `git branch --show-current`
2. If you are on `main`, create and switch to a new branch before touching any file
3. Name the branch based on what you're doing:
   - New feature → `feature/short-description` (e.g. `feature/recent-orders-panel`)
   - Bug fix → `fix/short-description` (e.g. `fix/button-alignment`)
   - Content/copy update → `update/short-description`
4. If the task is ambiguous, ask the user: *"Branch name — want me to call it `feature/X` or do you have a name in mind?"*

### After making changes

1. Commit on the branch using the commit style below
2. Push the branch to origin
3. Open a PR — title in the same style as the commit, body 2-3 casual lines max
4. Tell the user the PR is ready to review and merge — **do not merge it yourself**

---

## Commit style

- **Title Case, past tense, semicolon for detail**
- Single change: `Fixed Header Button Alignment; All four buttons now inline`
- New feature: `Recent Orders Panel Added; Shows last 7 days of eBay sales, auto-refreshes after sync`
- Multi-file: `Files Changed; LotSheet.tsx updated for X, sync route updated for Y`
- PR title: same style as the commit subject line
- **No bullet point lists** in commit bodies
- **No Co-Authored-By lines** — ever

---

## Quick reference

```
git checkout -b feature/my-feature
# make changes
git add <files>
git commit -m "Feature Name Added; brief detail"
git push -u origin feature/my-feature
gh pr create --title "Feature Name Added" --body "casual 2-3 line description"
```
