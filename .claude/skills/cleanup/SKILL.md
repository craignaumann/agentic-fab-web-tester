---
name: cleanup
description: Tear down the current worktree, delete the branch locally and remotely, then return to main and pull. Use after a PR is merged or a branch is no longer needed.
---

## Step 1 — Confirm

Ask the user to confirm the branch name and that they're ready to delete it. Show them:
- Current branch name
- Current worktree path

Run `git branch --show-current` and `git worktree list` to get this information. Do not proceed until confirmed.

---

## Step 2 — Exit the worktree

Call `ExitWorktree` with `action: "keep"` to return to the main working directory without removing the worktree yet (we'll remove it manually to control the branch deletion order).

---

## Step 3 — Remove the worktree

From the project root, run:

```
git worktree remove .worktrees/<branch-name> --force
```

---

## Step 4 — Delete the local branch

```
git branch -d <branch-name>
```

If `-d` is rejected because the branch is unmerged, tell the user and ask whether to force-delete with `-D`. Do not force-delete without explicit confirmation.

---

## Step 5 — Delete the remote branch

```
git push origin --delete <branch-name>
```

If the remote branch doesn't exist (already deleted), that's fine — continue.

---

## Step 6 — Checkout main and pull

```
git checkout main
git pull
```

---

## Step 7 — Confirm to the user

Report:
- Worktree removed
- Local branch deleted
- Remote branch deleted
- Now on `main` at the latest commit (show the short SHA and message from `git log --oneline -1`)
