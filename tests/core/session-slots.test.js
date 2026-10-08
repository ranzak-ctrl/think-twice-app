import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createState } from '../../src/core/state.js';
import { runTurn } from '../helpers/engine.js';

// Integration: slot routing in runTurn — bare names → current stage; "stageN.slot"
// keys capture later-stage info, pre-seeded to level 1 only (Ran, 21.6). Mirrors the
// mock harness in resistance-session.test.js.
beforeEach(() => vi.stubEnv('VITE_USE_MOCK', 'true'));
afterEach(() => vi.unstubAllEnvs());

async function runWithSlots(slots) {
  const { MOCK_RESPONSES, resetMockCounters } = await import('../../src/adapters/model.js');
  resetMockCounters();
  const saved = MOCK_RESPONSES['1:0'];
  MOCK_RESPONSES['1:0'] = { message: 'שאלה.', evaluation: { slots, new_info: true } };
  const result = await runTurn(createState(), [], 'תשובה');
  MOCK_RESPONSES['1:0'] = saved;
  return result;
}

describe('session — slot routing', () => {
  it('sets current-stage slots as reported', async () => {
    const { nextState } = await runWithSlots({ trigger: 2, timeline: 1 });
    expect(nextState.coverage.stage1).toMatchObject({ trigger: 2, timeline: 1 });
  });

  it('pre-seeds a later-stage slot to level 1, capping a reported 2', async () => {
    const { nextState } = await runWithSlots({ trigger: 2, 'stage3.emotion': 2 });
    expect(nextState.coverage.stage1.trigger).toBe(2);
    expect(nextState.coverage.stage3.emotion).toBe(1); // captured but not "fully covered"
  });

  it('ignores cross-stage 0 / U / unknown slots', async () => {
    const { nextState } = await runWithSlots({
      'stage3.emotion': 0,
      'stage2.causal': 'U',
      'stage5.bogus': 2,
    });
    expect(nextState.coverage.stage3.emotion).toBe(0);
    expect(nextState.coverage.stage2.causal).toBe(0);
    expect(nextState.coverage.stage5).not.toHaveProperty('bogus');
  });
});

describe('session — saturation from slot progress', () => {
  // The mock harness reports new_info:true; saturation must still count up when no
  // current-stage slot actually advanced (the bug Ran hit: saturation stuck at 0).
  it('increments saturation when no current-stage slot advances', async () => {
    const { nextState } = await runWithSlots({});
    expect(nextState.meta.saturationCount).toBe(1);
  });

  it('resets saturation when a current-stage slot advances', async () => {
    const { nextState } = await runWithSlots({ trigger: 2 });
    expect(nextState.meta.saturationCount).toBe(0);
  });

  it('cross-stage-only progress still counts toward saturation', async () => {
    const { nextState } = await runWithSlots({ 'stage3.emotion': 2 });
    expect(nextState.coverage.stage3.emotion).toBe(1);
    expect(nextState.meta.saturationCount).toBe(1);
  });
});
