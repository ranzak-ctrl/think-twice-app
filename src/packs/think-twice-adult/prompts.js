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
// The judge's rubric is not here: it scores an interview, it is not part of one,
// and it stays out of the browser bundle (judge.js beside this file).

import persona from '../../content/prompts/persona.md?raw';
import resistance from '../../content/prompts/resistance.md?raw';
import evaluator from '../../content/prompts/evaluator.md?raw';
import registrar from '../../content/prompts/registrar.md?raw';
import summary from '../../content/prompts/summary.md?raw';
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

export const thinkTwiceAdultPrompts = {
  persona,
  resistance,
  evaluator,
  registrar,
  summary,
  opener,
  board,
  // Keyed by the pack's stage keys (pack.js), one agent per stage.
  stages: { stage1, stage2, stage3, stage4, stage5, stage6, stage7 },
  forbidden: FORBIDDEN_PATTERNS,
};
