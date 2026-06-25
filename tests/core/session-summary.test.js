import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createState } from '../../src/core/state.js';
import { runTurn } from '../../src/core/session.js';

// The summary-confirmation flow: on a stage transition the Router asks for a
// summary; a failed generation (rate limit) must NOT show a content-free
// confirmation. (docs/test-plan.md §א.3; fix 5a68635.)
beforeEach(() => vi.stubEnv('VITE_ANTHROPIC_API_KEY', ''));
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
