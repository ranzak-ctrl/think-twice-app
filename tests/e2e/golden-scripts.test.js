import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createState } from '../../src/core/state.js';
import { confirmAndAdvance } from '../../src/core/router.js';
import { runTurn } from '../../src/core/session.js';
import { resetMockCounters, setMockScenario } from '../../src/adapters/model.js';

// Headless end-to-end of the remaining golden scripts (dev-plan §131). Together
// with meat-golden, this covers 4/4 scripts reaching a valid close through the
// real pipeline (session.runTurn + the summary-confirm gate), each exercising a
// different closure path: sharp, structured-deferral, and vague→sharp.

async function runScenario(name) {
  setMockScenario(name);
  resetMockCounters();

  let state = createState();
  let history = [];
  let turns = 0;
  const MAX = 80;

  while (!state.meta.sessionComplete && turns < MAX) {
    turns++;
    if (state.meta.awaitingConfirmation) {
      state = confirmAndAdvance(state);
      continue;
    }
    const userText = 'אני לא יודע מה לעשות';
    const { nextState, reply } = await runTurn(state, history, userText);
    history = [
      ...history,
      { role: 'user', content: userText },
      { role: 'assistant', content: reply },
    ];
    state = nextState;
  }
  return state;
}

describe('Golden scripts — end to end', () => {
  beforeEach(() => vi.stubEnv('VITE_ANTHROPIC_API_KEY', ''));
  afterEach(() => {
    vi.unstubAllEnvs();
    setMockScenario('meat');
    resetMockCounters();
  });

  it('friend ("חבר בא להתייעץ") closes sharp', async () => {
    const state = await runScenario('friend');

    expect(state.meta.sessionComplete).toBe(true);
    expect(state.meta.currentStage).toBe(7);
    expect(state.meta.kpi.decisionType).toBe('sharp');
    expect(state.meta.kpi.differsFromAutomatic).toBe(true);
    expect(state.meta.kpi.emotionIntensityStage3).toBe(6);
    expect(state.meta.kpi.emotionIntensityStage5).toBe(3);
    // The scenario's own board was synthesised (not meat's).
    expect(state.board[0].option).toContain('להקשיב');
  });

  it('teacher ("המורה אמר שאני בעייתי") closes via structured deferral', async () => {
    const state = await runScenario('teacher');

    expect(state.meta.sessionComplete).toBe(true);
    expect(state.meta.kpi.decisionType).toBe('structured_deferral');
    expect(state.meta.kpi.differsFromAutomatic).toBe(true);
    expect(state.board.some((r) => r.option.includes('מורה'))).toBe(true);
  });

  it('busy friend ("חברה אמרה שאין לה זמן") holds on vague, then closes sharp', async () => {
    const state = await runScenario('busyFriend');

    expect(state.meta.sessionComplete).toBe(true);
    // Final decision is sharp — the vague turns did NOT close the session.
    expect(state.meta.kpi.decisionType).toBe('sharp');
    expect(state.meta.kpi.differsFromAutomatic).toBe(true);
    expect(state.meta.kpi.emotionIntensityStage3).toBe(9);
    expect(state.meta.kpi.emotionIntensityStage5).toBe(5);
    expect(state.board[0].option).toContain('פגע');
  });
});
