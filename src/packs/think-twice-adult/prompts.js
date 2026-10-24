// Think Twice for adults — the pack's texts, loaded for the browser build.
//
// The engine imports no prompt (principle 4, src/core/promptBuilder.js): it is
// handed these strings by whoever composes it. `?raw` is Vite turning a .md file
// into a string at build time, and that is why this file lives with the pack and
// not in the core — it is the one place the texts meet the bundler. A server or a
// Node script would read the same files from disk and hand over the same object.
//
// The files themselves stay in src/content/prompts/, owned by prompt-editor; this
// only says which file is which part of the interview. That mapping is prompt
// content all the same — pointing a stage at a different agent changes what the
// model reads — so only prompt-editor changes this file (Ran, 9.10.2026; CLAUDE.md).
// What catches a wrong mapping is tests/core/prompt-fingerprint.test.js, which
// pins the assembled prompts byte for byte. The golden scripts run against the
// mock model and the judge scores a fixed transcript, so neither would notice two
// stages' agents swapped.
//
// The interviewer's guidelines are two texts, not one: the super file every Think
// Twice interviewer shares, and this interview's specific file, which overrides it
// block by block (Ran, 9.10.2026). They are handed over separately because which
// block wins — and what the super file locks or requires — is decided in code, by
// src/core/guidelines.js, not by whoever loads the files. They replaced persona.md
// (prompt-editor, 9.10.2026): a split with no wording change, which composes back
// to persona.md byte for byte.
//
// Headers (prompt-editor, 24.10.2026). Every text opens with an HTML comment the
// model must never read — its version line and history (evaluator.md's runs to 57
// lines). Until today they were handed over intact, while the parents' mapping
// stripped its own; `text()` (src/packs/text.js, shared by both packs) now strips
// the header of every text here, and tests/core/prompt-fingerprint.test.js asserts
// that no `<!--` reaches any assembled prompt. The guidelines are the exception:
// their `<!-- @key -->` markers are parsed by guidelines.js, which strips its own
// notes, so they are handed over as they are.
//
// The summary nudge (prompt-editor, 24.10.2026). The user turn that anchors the
// summary call was a constant in src/core/promptBuilder.js (SUMMARY_NUDGE) — the
// one text the model read that lived in code. It is a pack text now
// (summary-nudge.md, `summaryNudge` below), rewritten for Ran's ruling of
// 24.10.2026 that a stage ends on a brief summary and not on a confirmation.
//
// The judge's rubric is not here: it scores an interview, it is not part of one,
// and it stays out of the browser bundle (judge.js beside this file).

import guidelinesSuper from '../../content/prompts/guidelines/super.md?raw';
import guidelinesSpecific from '../../content/prompts/guidelines/think-twice-adult.md?raw';
import resistance from '../../content/prompts/resistance.md?raw';
import evaluator from '../../content/prompts/evaluator.md?raw';
import registrar from '../../content/prompts/registrar.md?raw';
import summary from '../../content/prompts/summary.md?raw';
import summaryNudge from '../../content/prompts/summary-nudge.md?raw';
import opener from '../../content/prompts/opener.md?raw';
import board from '../../content/prompts/board.md?raw';
import stage1 from '../../content/prompts/agents/stage1-intake.md?raw';
import stage2 from '../../content/prompts/agents/stage2-interpretation.md?raw';
import stage3 from '../../content/prompts/agents/stage3-feel.md?raw';
import stage4 from '../../content/prompts/agents/stage4-react.md?raw';
import stage5 from '../../content/prompts/agents/stage5-transform.md?raw';
import stage6 from '../../content/prompts/agents/stage6-alternatives.md?raw';
import stage7 from '../../content/prompts/agents/stage7-decision.md?raw';
import { FORBIDDEN_PATTERNS } from '../../content/forbidden.js';
import { text } from '../text.js';

export const thinkTwiceAdultPrompts = {
  // Not through text(): guidelines.js parses the markers and strips the notes.
  guidelines: { super: guidelinesSuper, specific: guidelinesSpecific },
  resistance: text(resistance),
  evaluator: text(evaluator),
  registrar: text(registrar),
  summary: text(summary),
  // The user turn that anchors the summary call (summary-nudge.md). Until
  // 24.10.2026 it was a constant in src/core/promptBuilder.js (SUMMARY_NUDGE):
  // prompt content living in code. The engine reads it from here (prompt-editor,
  // 24.10.2026, Ran's ruling on the end-of-stage summary).
  summaryNudge: text(summaryNudge),
  opener: text(opener),
  board: text(board),
  // Keyed by the pack's stage keys (pack.js), one agent per stage.
  stages: {
    stage1: text(stage1),
    stage2: text(stage2),
    stage3: text(stage3),
    stage4: text(stage4),
    stage5: text(stage5),
    stage6: text(stage6),
    stage7: text(stage7),
  },
  forbidden: FORBIDDEN_PATTERNS,
};
