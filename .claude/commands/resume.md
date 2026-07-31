---
description: "איפה עצרנו — reconstructs the exact resume point from repo state, not from memory"
allowed-tools: Bash(git log:*), Bash(git status:*), Bash(git branch:*), Bash(git describe:*), Read, Grep, Glob
---

Reconstruct where this project actually stands and what the next move is. Read the repo; do not rely on recollection or on the dashboards, which drift.

## Gather

- Branch and position: !`git branch --show-current` · !`git log --oneline -12` · !`git status --short`
- Last tag and distance: !`git describe --tags --abbrev=0` and how many commits since
- @docs/task-board.html — the five columns, especially blockers
- @docs/test-plan.md — §א regression statuses and §ה, whether a live golden script has been captured yet
- @docs/questions-for-natali.md — every section's status line, which are open, which are marked release blockers
- @DEPLOY-STATUS.md — the deployment stopping point and whether it still applies

## Report

**Position** — branch, last commit, last tag, uncommitted work if any.

**Deployment** — what is live, at which commit, how far behind, and whether the `/api/*` 404 blocker is still open. Say plainly if production is stale.

**Release blockers** — each one, its owner (Ran / Natali / dev), and what specifically unblocks it. Three are open as of the last board sync: the fatigue detector (§1), contradiction wiring (§2), and the Router reject-loop bug.

**Waiting on Natali** — the open sections by number and title, and which of them block sign-off versus which are refinements.

**Next move** — one concrete action, chosen by what is actually blocked rather than by what is easiest. If the board and the repo disagree, say so and trust the repo.

Where a claim comes from a document that has not been updated recently, mark it as such. A confidently reported stale fact is the failure mode this command exists to prevent.
