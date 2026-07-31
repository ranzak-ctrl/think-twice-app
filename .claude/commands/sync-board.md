---
description: "Regenerate the task board and workspace chips from real repo state so the dashboards stop drifting"
allowed-tools: Bash(git log:*), Bash(git branch:*), Bash(git describe:*), Bash(git status:*), Bash(npx vitest run:*), Read, Edit, Grep, Glob
---

The dashboards are hand-maintained and drift. This command makes them agree with the repo again.

## Gather truth

- Branch, last commit, last tag, commits since tag
- Test count — from an actual run, not from the last number written down
- Open sections in `docs/questions-for-natali.md`, and which carry the release-blocker mark
- Regression statuses in `docs/test-plan.md` §א, and whether §ה still has no captured live script
- Deployment reality from `DEPLOY-STATUS.md` and, if reachable, the live commit

## Update

**`docs/task-board.html`** — the four status tiles and the five columns. A card moves out of blockers only when the repo shows it resolved: a test guarding it, a commit, or a recorded ruling from Natali. Never move a card because it feels done.

**`docs/workspace.html`** — the hero chips: branch, version, test count, blocker count.

Preserve the existing structure, styling, and Hebrew. This is an update, not a redesign.

## Report

Every value that changed, old to new. Then anything the repo shows that the board does not represent at all — a drifted board is a symptom, and a missing card is worth more attention than a stale number.
