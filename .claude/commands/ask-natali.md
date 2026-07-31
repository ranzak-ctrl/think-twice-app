---
description: "File a new clinical question for Natali, and render the current open questions as a briefing she can answer"
argument-hint: "[the question or observation]"
allowed-tools: Read, Edit, Grep, Glob
---

Two jobs. Which one runs depends on whether `$ARGUMENTS` is present.

## With arguments — file it

Hand the observation to the `clinical-triage` agent. It decides whether this extends an existing section or opens a new one, and writes it in the document's format. It does not answer it, and neither do you.

Return the section number and the open questions verbatim.

## Without arguments — brief her

Read `docs/questions-for-natali.md` and render every open section as something Natali can actually respond to. She is a clinician, not a maintainer of this repo: she should not have to hold code paths, slot names, or commit hashes to answer.

For each open section:

- the decision in one sentence
- the concrete observation behind it, with the real example where one exists — the meat case, the stage 2/5 drift, the judge's variance on natural Hebrew
- the specific questions, unchanged
- what changes in the tool depending on her answer
- whether it blocks release

Order by what is blocking. §1 (fatigue detector) and §2 (contradiction handling) block sign-off; §3, §4 and §5 refine quality. Say which is which, so she can spend her time where it moves the project.

Strip the engineering scaffolding. `LOAD_GUARD_DEFAULT=20` means "the interview currently forces a move after twenty questions, which is a crude stand-in we know is wrong" — write it that way.

End with the shortest possible list of what you need from her. If two questions can be answered together, present them together.
