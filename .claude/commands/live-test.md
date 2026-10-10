---
description: "Turn an exported live run into a diagnosis and a faithful golden-script fixture"
argument-hint: "[path to export json]"
allowed-tools: Bash(ls:*), Bash(npx vitest run:*), Read, Write, Edit, Glob, Grep
---

Take a real run and make it permanent. Every bug that mattered here was found live and would have been found again if the run had been captured the first time.

Source: `$ARGUMENTS` if given, otherwise the most recently modified `~/Downloads/think-twice-session-*.json`. If none exists, say so and stop — tell Ran to open מדריך and press "ייצוא קריא לבדיקה" in the app first (the header's שמירה writes the encrypted file, which is not readable here).

Hand the file to the `live-run-analyst` agent and let it do the analysis in its own context. The transcripts are long, and reading one inline is what fills a session's context window.

Expect back: the stall diagnosis, the §ב checklist verdict, the fixture path, and a call on whether this is a bug, prompt calibration, a clinical question, or working as designed.

Then, based on that call:

- **Bug** — write the failing case into `docs/test-plan.md` §א with a named guard, and say which module owns it.
- **Prompt calibration** — hand it to `prompt-editor`. Do not edit prompts here.
- **Clinical question** — hand it to `clinical-triage`. Do not resolve it.
- **Working as designed** — record the run in §ה anyway. A clean run is evidence too, and the acceptance bar counts golden scripts that actually reached a sharp close.

Never let a run pass through without landing somewhere. An analysed run that produces no artifact has been read, not captured, and next month it will be a vague memory of "something got stuck around stage 3".
