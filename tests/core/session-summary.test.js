import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createState } from '../../src/core/state.js';
import { runTurn } from '../helpers/engine.js';
import { buildSummaryMessages } from '../../src/core/promptBuilder.js';
import { prompts } from '../helpers/engine.js';

// The stage transition since 24.10.2026 (Ran): no confirmation. On the Router's
// decision the turn summarizes briefly, advances, and opens the next stage with a
// frame and one question — one message. A failed summary (rate limit) must NOT
// produce a content-free message: the stage stays and is decided again next turn.
// (docs/test-plan.md §א.3 and §א.1ב item 15; fix 5a68635.)
beforeEach(() => vi.stubEnv('VITE_USE_MOCK', 'true'));
afterEach(async () => {
  vi.unstubAllEnvs();
  const m = await import('../../src/adapters/model.js');
  m.setMockSummaryFailure(false);
});

// Stage 1 at full coverage → the Router requests summary-confirmation this turn.
function fullStage1() {
  const s = createState();
  return {
    ...s,
    coverage: { ...s.coverage, stage1: { trigger: 2, timeline: 2, actors: 2, status: 2, auto_reaction: 2 } },
  };
}

describe('session — the stage closes on its summary and moves on', () => {
  it('summarizes, advances and opens the next stage in one message', async () => {
    const { resetMockCounters, MOCK_SUMMARIES } = await import('../../src/adapters/model.js');
    resetMockCounters();
    const { nextState, reply, decision } = await runTurn(fullStage1(), [], 'מספיק לי');
    expect(decision).toBe('requestConfirmation');
    expect(nextState.meta.currentStage).toBe(2); // moved on at once
    expect(nextState.meta.questionCount).toBe(0);
    expect(nextState.meta).not.toHaveProperty('awaitingConfirmation');
    // The summary, then the opener of stage 2 — one message. The summary part ends
    // as a statement; the question is the opener's (the mock's opener is the static
    // signpost, so the count of question marks is the live run's to check).
    expect(reply.startsWith(MOCK_SUMMARIES[1])).toBe(true);
    expect(reply.length).toBeGreaterThan(MOCK_SUMMARIES[1].length + 2);
    expect(reply).not.toContain('זה מדויק?');
    expect((MOCK_SUMMARIES[1].match(/\?/g) ?? []).length).toBe(0);
    // The trail reads cause, then effect: the Router's decision, then the advance.
    expect(nextState.meta.decisionLog.at(-2)).toMatchObject({ decision: 'requestConfirmation', reason: 'full_coverage', stage: 1 });
    expect(nextState.meta.decisionLog.at(-1)).toMatchObject({ decision: 'advance', reason: 'summarized', stage: 1 });
  });

  it('stays — no content-free message — when the summary generation fails', async () => {
    const m = await import('../../src/adapters/model.js');
    m.resetMockCounters();
    m.setMockSummaryFailure(true);
    const { nextState, reply } = await runTurn(fullStage1(), [], 'מספיק לי');
    expect(nextState.meta.currentStage).toBe(1); // stayed; decided again next turn
    expect(reply.trim().length).toBeGreaterThan(0);
    // The person gets the interviewer's own question, not a notice — an interview
    // never stops for a technical hiccup (Ran, 24.10.2026); the trail names the
    // failure. (The mock's failure carries no report object; the live adapter's does.)
    expect(reply).toBe(m.MOCK_RESPONSES['1:0'].message);
    expect(nextState.meta.decisionLog.at(-1)).toMatchObject({ decision: 'requestConfirmation', reason: 'summary_failed', stage: 1 });
  });
});

// Summary mode reused the live conversation and the model CONTINUED it (a fresh
// probe) instead of summarizing (the dissonance Ran hit). The summary call is now
// anchored with the model's probe + an explicit "summarize now" user turn.
describe('buildSummaryMessages', () => {
  const convo = [
    { role: 'user', content: 'מה שקרה' },
    { role: 'assistant', content: 'ומה אחרי?' },
    { role: 'user', content: '3 ימים' },
  ];

  it('appends the probe as assistant + an explicit summarize instruction', () => {
    const out = buildSummaryMessages(convo, 'שלושה ימים של שקט. איך זה יושב עליך?', prompts);
    expect(out.length).toBe(convo.length + 2);
    expect(out[out.length - 2]).toEqual({
      role: 'assistant',
      content: 'שלושה ימים של שקט. איך זה יושב עליך?',
    });
    expect(out[out.length - 1]).toEqual({ role: 'user', content: prompts.summaryNudge.trim() });
  });

  it('keeps valid role alternation (last turn is user)', () => {
    const out = buildSummaryMessages(convo, 'probe', prompts);
    expect(out[out.length - 1].role).toBe('user');
    expect(out[out.length - 2].role).toBe('assistant');
  });

  it('leaves messages unchanged when there is no probe to anchor', () => {
    expect(buildSummaryMessages(convo, '', prompts)).toBe(convo);
    expect(buildSummaryMessages(convo, null, prompts)).toBe(convo);
  });
});
