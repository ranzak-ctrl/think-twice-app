// Think Twice for parents — the pack's texts, loaded for the browser build.
//
// DRAFT FOR QA, AWAITING NATALI'S APPROVAL (prompt-editor, 16.10.2026, at Ran's
// request: bring the parents' interview up on the QA link). Nothing here is for a
// real parent before she signs off — see the header of pack.js beside this file.
//
// Same contract as src/packs/think-twice-adult/prompts.js, which says why this
// file exists and why only prompt-editor changes it: it says which text is which
// part of the interview, and that mapping is prompt content (Ran, 9.10.2026). What
// catches a wrong mapping is tests/core/prompt-fingerprint-parents.test.js.
//
// What differs from the adult mapping, and why:
//
//   guidelines  The super file every Think Twice interviewer shares, unchanged,
//               with this interview's own file over it (guidelines/think-twice-
//               parents.md: who it serves, how it addresses a parent whose gender
//               it does not know yet, and Ran's ruling that with parents
//               professional terms are allowed).
//   registrar   The parents' own (parents/registrar.md, prompt-editor, 16.10.2026),
//               after Ran approved the parents registrar model that day
//               (docs/parent-app/registrar-model.html). Until then this was null:
//               the interview ran without the registrar, and the interviewer saw
//               the evaluator's findings instead (promptBuilder.js renderFindings,
//               which now stays silent here). Same JSON contract and field names as
//               the adult registrar.md — the code that reads it is the same — with
//               the parents' slots, minds and cast, and the parents' rules on what
//               is never a fact. The pack's drawing is made from what it records
//               (pack.js `map`), and engine.js refuses that drawing without it.
//   summary, opener, board
//               Parents copies, not the shared files: those address the person in
//               the masculine ("במה אתה בוחר?") and ban jargon, and editing them
//               would move every adult fingerprint.
//   catalog     The trait → need → tool table has no key of its own in the
//               engine's prompt shape, so it is composed here into the agents that
//               use it — stages 3, 4, 6 and 8 — from ONE file Natali corrects.
//   forbidden   The shared list less the adult jargon ban, plus the parents'
//               additions (parents/forbidden.js says why).
//
// Author notes. Every parents text opens with one-line notes, `<!-- # … -->` — the
// same syntax the guidelines use, and for the same reason: a version line or a
// "draft" note the model can read changes what it reads. guidelines.js strips them
// from the guidelines; `text()` below strips them from everything else. The test
// asserts that no "<!--" reaches any parents prompt.
//
// The judge's rubric is not here, and this interview has none yet: the parents'
// additions to the rubric (interview-model.md §8) are Natali's (§3), and the
// harness's, never the browser's.

import guidelinesSuper from '../../content/prompts/guidelines/super.md?raw';
import guidelinesSpecific from '../../content/prompts/guidelines/think-twice-parents.md?raw';
import resistance from '../../content/prompts/parents/resistance.md?raw';
import evaluator from '../../content/prompts/parents/evaluator.md?raw';
import registrar from '../../content/prompts/parents/registrar.md?raw';
import summary from '../../content/prompts/parents/summary.md?raw';
import opener from '../../content/prompts/parents/opener.md?raw';
import board from '../../content/prompts/parents/board.md?raw';
import catalog from '../../content/prompts/parents/catalog.md?raw';
import stage1 from '../../content/prompts/parents/agents/stage1-event.md?raw';
import stage2 from '../../content/prompts/parents/agents/stage2-behavior.md?raw';
import stage3 from '../../content/prompts/parents/agents/stage3-trait.md?raw';
import stage4 from '../../content/prompts/parents/agents/stage4-need.md?raw';
import stage5 from '../../content/prompts/parents/agents/stage5-parent.md?raw';
import stage6 from '../../content/prompts/parents/agents/stage6-alternatives.md?raw';
import stage7 from '../../content/prompts/parents/agents/stage7-decision.md?raw';
import stage8 from '../../content/prompts/parents/agents/stage8-practice.md?raw';
import { PARENTS_FORBIDDEN } from '../../content/prompts/parents/forbidden.js';

// One line, by itself — guidelines.js's NOTE, repeated rather than imported: a pack
// imports nothing from src/core (src/core/pack.js says why). A lookahead, not a
// lookbehind: this runs while the app loads, and Safari before 16.4 cannot parse a
// lookbehind (tests/core/browser-support.test.js).
const NOTE = /^<!--\s*#(?:(?!-->).)*-->$/;

// A text as the model reads it: the author notes out, and the blank lines they
// leave at the top with them.
const text = (md) =>
  md
    .split('\n')
    .filter((line) => !NOTE.test(line.trim()))
    .join('\n')
    .replace(/^\n+/, '');

const CATALOG = text(catalog);
const withCatalog = (agent) => `${text(agent).trimEnd()}\n\n${CATALOG}`;

export const thinkTwiceParentsPrompts = {
  guidelines: { super: guidelinesSuper, specific: guidelinesSpecific },
  resistance: text(resistance),
  evaluator: text(evaluator),
  // The parents' own registrar (see above).
  registrar: text(registrar),
  summary: text(summary),
  opener: text(opener),
  board: text(board),
  // Keyed by the pack's stage keys (pack.js), one agent per stage.
  stages: {
    stage1: text(stage1),
    stage2: text(stage2),
    stage3: withCatalog(stage3),
    stage4: withCatalog(stage4),
    stage5: text(stage5),
    stage6: withCatalog(stage6),
    stage7: text(stage7),
    stage8: withCatalog(stage8),
  },
  forbidden: PARENTS_FORBIDDEN,
};
