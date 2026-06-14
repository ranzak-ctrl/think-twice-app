import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createState } from '../../src/core/state.js';
import { confirmAndAdvance } from '../../src/core/router.js';
import { runTurn } from '../../src/core/session.js';
import { resetMockCounters } from '../../src/adapters/model.js';

// Headless end-to-end of the "meat" golden script through the mock adapter.
// Drives the real pipeline (session.runTurn) plus the summary-confirm gate, and
// asserts the interview reaches a sharp close — the stage-4 exit criterion.
describe('Meat golden script — end to end', () => {
  // Force the mock path (a real VITE_ANTHROPIC_API_KEY in the env would send
  // runTurn down the network path, which has no connectivity under test).
  beforeEach(() => {
    vi.stubEnv('VITE_ANTHROPIC_API_KEY', '');
    resetMockCounters();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('runs from stage 1 to SESSION_COMPLETE with a sharp decision + board', async () => {
    let state = createState();
    let history = [];
    let turns = 0;
    const MAX = 60;

    while (!state.meta.sessionComplete && turns < MAX) {
      turns++;
      if (state.meta.awaitingConfirmation) {
        // Simulate the user clicking "מדויק" on the interim summary.
        state = confirmAndAdvance(state);
        continue;
      }
      const { nextState, reply } = await runTurn(state, history, 'ok');
      history = [
        ...history,
        { role: 'user', content: 'ok' },
        { role: 'assistant', content: reply },
      ];
      state = nextState;
    }

    expect(state.meta.sessionComplete).toBe(true);
    expect(state.meta.currentStage).toBe(7);
    expect(state.coverage.stage7.board_presented).toBe(2);
    expect(state.coverage.stage7.sharp_decision).toBe(2);
    expect(state.coverage.stage7.package_test).toBe(2);
    // The board was synthesised and stored by code (not printed by the model).
    expect(state.board.length).toBeGreaterThan(0);
  });
});
