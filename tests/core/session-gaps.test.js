import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createState } from '../../src/core/state.js';
import { runTurn } from '../../src/core/session.js';

// Integration: model gap_observations → parser → runTurn → state.gaps.byTarget.
// Mirrors the mock harness in resistance-session.test.js (env stub forces the
// mock model path; MOCK_RESPONSES is keyed by `stage:questionCount`).
beforeEach(() => vi.stubEnv('VITE_USE_MOCK', 'true'));
afterEach(() => vi.unstubAllEnvs());

async function runWithEval(evaluation, userText = 'תשובה') {
  const { MOCK_RESPONSES, resetMockCounters } = await import('../../src/adapters/model.js');
  resetMockCounters();
  const key = '1:0';
  const saved = MOCK_RESPONSES[key];
  MOCK_RESPONSES[key] = {
    message: 'שאלה מהמוק.',
    evaluation: { slots: {}, new_info: true, ...evaluation },
  };
  const result = await runTurn(createState(), [], userText);
  MOCK_RESPONSES[key] = saved;
  return result;
}

describe('session — gap observations wiring', () => {
  it('records a reported gap into state.gaps.byTarget', async () => {
    const { nextState } = await runWithEval({
      gap_observations: [{ target: 'stage1.timeline', dimension: 'factual', level: 2, note: 'סדר הפוך' }],
    });
    const rec = nextState.gaps.byTarget['stage1.timeline'];
    expect(rec).toMatchObject({ status: 'starred', level: 2, dimension: 'factual' });
    expect(rec.history).toEqual([{ turn: 1, level: 2 }]);
    expect(nextState.gaps.log).toHaveLength(1);
  });

  it('ignores a consistent observation (no record created)', async () => {
    const { nextState } = await runWithEval({
      gap_observations: [{ target: 'stage1.timeline', level: 9 }],
    });
    expect(nextState.gaps.byTarget).toEqual({});
  });

  it('leaves gaps empty when the model reports none', async () => {
    const { nextState } = await runWithEval({ slots: { trigger: 1 } });
    expect(nextState.gaps).toEqual({ byTarget: {}, log: [] });
  });
});
