import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createState } from '../../src/core/state.js';
import { runTurn } from '../../src/core/session.js';
import { buildSummaryMessages, SUMMARY_NUDGE } from '../../src/core/promptBuilder.js';

// The summary-confirmation flow: on a stage transition the Router asks for a
// summary; a failed generation (rate limit) must NOT show a content-free
// confirmation. (docs/test-plan.md §א.3; fix 5a68635.)
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

describe('session — summary-confirmation resilience', () => {
  it('enters confirmation with the summary when generation succeeds', async () => {
    const { resetMockCounters } = await import('../../src/adapters/model.js');
    resetMockCounters();
    const { nextState, reply } = await runTurn(fullStage1(), [], 'מספיק לי');
    expect(nextState.meta.awaitingConfirmation).toBe(true);
    expect(reply).toContain('זה מדויק?');
  });

  it('stays — no content-free confirmation — when the summary generation fails', async () => {
    const m = await import('../../src/adapters/model.js');
    m.resetMockCounters();
    m.setMockSummaryFailure(true);
    const { nextState } = await runTurn(fullStage1(), [], 'מספיק לי');
    expect(nextState.meta.awaitingConfirmation).toBe(false); // did NOT enter confirmation
    expect(nextState.meta.currentStage).toBe(1); // stayed
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
    const out = buildSummaryMessages(convo, 'שלושה ימים של שקט. איך זה יושב עליך?');
    expect(out.length).toBe(convo.length + 2);
    expect(out[out.length - 2]).toEqual({
      role: 'assistant',
      content: 'שלושה ימים של שקט. איך זה יושב עליך?',
    });
    expect(out[out.length - 1]).toEqual({ role: 'user', content: SUMMARY_NUDGE });
  });

  it('keeps valid role alternation (last turn is user)', () => {
    const out = buildSummaryMessages(convo, 'probe');
    expect(out[out.length - 1].role).toBe('user');
    expect(out[out.length - 2].role).toBe('assistant');
  });

  it('leaves messages unchanged when there is no probe to anchor', () => {
    expect(buildSummaryMessages(convo, '')).toBe(convo);
    expect(buildSummaryMessages(convo, null)).toBe(convo);
  });
});
