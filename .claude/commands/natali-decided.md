---
description: "Apply a clinical ruling from Natali — update the question doc, change the prompt, re-run the quality gates, sync the board"
argument-hint: "<section number> <her ruling>"
allowed-tools: Bash(npx vitest run:*), Bash(git diff:*), Read, Edit, Grep, Glob
---

The return leg of the clinical loop. A ruling that lands in a chat and not in the repo will be re-litigated in six weeks.

`$ARGUMENTS` carries the section number and what she decided. If either is unclear, ask before touching anything — a misapplied clinical ruling is worse than an unapplied one.

## Sequence

**1 · Record it.** In `docs/questions-for-natali.md`, change the section's status from `פתוח` to `הוכרע · <date>`, and add her ruling verbatim under a `**הכרעה (נטלי):**` heading. Keep the original question — the reasoning matters later. Do not delete a resolved section.

**2 · Work out what changes.** A ruling usually touches one of three places: prompt wording (content), a Router threshold or gate (code), or the judge rubric (content). Say which before editing. If it touches the Router, `router-guard` reviews the change afterwards.

**3 · Apply it.** Prompt or rubric changes go to `prompt-editor` — that agent owns `src/content/prompts/**` and nobody else edits it. Code changes are made here and reviewed by `router-guard`.

**4 · Re-run the gates.** Prompt change: golden scripts plus `RUN_JUDGE=1` on the judge suite. Router change: the full transition matrix. Report the judge scores per dimension; a ruling that fixes one dimension and drops another is a finding, not a success.

**5 · Sync.** If this cleared a release blocker, update `docs/task-board.html` — move the card out of blockers — and note it in `docs/test-plan.md` if it changed expected behaviour. Then run `/sync-board`.

## Report

The section resolved, what changed and where, the gate results, and whether a release blocker cleared. If her ruling raised a new question — it often does — file that one through `/ask-natali` before finishing.
