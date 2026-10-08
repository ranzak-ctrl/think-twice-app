// Think Twice for adults, composed for the tests.
//
// The core imports no prompt and no model adapter (principle 4 — see
// src/core/engine.js), so whoever runs it has to compose it: the browser build
// does in src/ui/interview.js, and the tests do here, the same way and with the
// same adapter. Its mock is what the tests drive (MOCK_RESPONSES, a stubbed
// fetch), and both are read when a call is made, so binding `complete` here
// changes nothing about how a test steers it.
//
// The bound builders and the bound runTurn keep every test's call sites exactly as
// they were: a test that called runTurn(state, history, text) still does.

import { createEngine } from '../../src/core/engine.js';
import * as builders from '../../src/core/promptBuilder.js';
import * as judgeCore from '../../src/core/judge.js';
import { complete } from '../../src/adapters/model.js';
import { thinkTwiceAdult as pack } from '../../src/packs/think-twice-adult/pack.js';
import { thinkTwiceAdultPrompts as prompts } from '../../src/packs/think-twice-adult/prompts.js';

export { pack, prompts };

export const engine = createEngine({ pack, prompts, complete });
export const { runTurn, generateStageOpener } = engine;

const withPrompts = (fn) => (args = {}) => fn({ prompts, ...args });
export const buildSystemPromptParts = withPrompts(builders.buildSystemPromptParts);
export const buildSystemPrompt = withPrompts(builders.buildSystemPrompt);
export const buildRegistrarPrompt = withPrompts(builders.buildRegistrarPrompt);
export const buildSummaryPrompt = withPrompts(builders.buildSummaryPrompt);
export const buildOpenerPrompt = withPrompts(builders.buildOpenerPrompt);
export const buildBoardPrompt = withPrompts(builders.buildBoardPrompt);
export const buildJudgePrompt = () => judgeCore.buildJudgePrompt(prompts);
export const judgeTranscript = withPrompts(judgeCore.judgeTranscript);
