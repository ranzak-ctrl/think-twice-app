// Think Twice for adults, as the browser runs it — for the tests.
//
// The core imports no prompt and no model adapter (principle 4 — see
// src/core/engine.js), so whoever runs it composes it. The tests use the very
// object the browser build composes (src/ui/interview.js) rather than a copy of
// that composition, so the two cannot drift apart while every test stays green
// (router-guard, 8.10.2026). Its adapter's mock is what the tests drive
// (MOCK_RESPONSES, a stubbed fetch), and both are read when a call is made, so a
// composition made at import time changes nothing about how a test steers it.
//
// The bound builders and the bound runTurn keep every test's call sites exactly as
// they were: a test that called runTurn(state, history, text) still does.

import { interview } from '../../src/ui/interview.js';
import * as builders from '../../src/core/promptBuilder.js';
import * as judgeCore from '../../src/core/judge.js';
import { thinkTwiceAdultJudge } from '../../src/packs/think-twice-adult/judge.js';

export const engine = interview;
export const { pack, prompts, runTurn, generateStageOpener } = engine;

const withPrompts = (fn) => (args = {}) => fn({ prompts, ...args });
export const buildSystemPromptParts = withPrompts(builders.buildSystemPromptParts);
export const buildSystemPrompt = withPrompts(builders.buildSystemPrompt);
export const buildRegistrarPrompt = withPrompts(builders.buildRegistrarPrompt);
export const buildSummaryPrompt = withPrompts(builders.buildSummaryPrompt);
export const buildOpenerPrompt = withPrompts(builders.buildOpenerPrompt);
export const buildBoardPrompt = withPrompts(builders.buildBoardPrompt);

// The rubric is the harness's, not the interview's — it is merged in here and
// nowhere in the browser build.
const harness = { ...prompts, judge: thinkTwiceAdultJudge };
export const buildJudgePrompt = () => judgeCore.buildJudgePrompt(harness);
export const judgeTranscript = (args = {}) => judgeCore.judgeTranscript({ prompts: harness, ...args });
