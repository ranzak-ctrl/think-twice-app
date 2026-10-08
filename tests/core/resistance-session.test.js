import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createState } from '../../src/core/state.js';
import { runTurn } from '../helpers/engine.js';
import { exportState, importState } from '../../src/core/state.js';

// Integration tests: resistance flags flow through the full pipeline
// (model → parser → session → resolveResistance → state).
// Uses vitest env-stub to force the mock path, then patches MOCK_RESPONSES.

beforeEach(() => vi.stubEnv('VITE_USE_MOCK', 'true'));
afterEach(() => vi.unstubAllEnvs());

// Helper: inject a custom mock response for a specific stage:turn.
async function runWithMockEvaluation(state, evaluation) {
  const { MOCK_RESPONSES, resetMockCounters } = await import('../../src/adapters/model.js');
  const stage = state.meta.currentStage;
  const key = `${stage}:${state.meta.questionCount}`;
  const saved = MOCK_RESPONSES[key];
  MOCK_RESPONSES[key] = {
    message: 'שאלה מהמוק.',
    evaluation: { slots: {}, new_info: true, ...evaluation },
  };
  resetMockCounters();
  // Set the mock counter to the correct position
  const { default: modelModule } = await import('../../src/adapters/model.js');
  const result = await runTurn(state, [], 'תשובה');
  MOCK_RESPONSES[key] = saved; // restore
  return result;
}

// ─── הנמנע: avoidance → open aperture ────────────────────────────────────────

describe('Persona: הנמנע (Avoidant)', () => {
  it('avoidance flag sets aperture to open and resistanceFlag to avoidance', async () => {
    const { MOCK_RESPONSES, resetMockCounters } = await import('../../src/adapters/model.js');
    resetMockCounters();
    const key = '1:0';
    const saved = MOCK_RESPONSES[key];
    MOCK_RESPONSES[key] = {
      message: 'ספר לי עוד על הרגע הזה.',
      evaluation: { slots: {}, flag_avoidance: true, new_info: false, question_aperture: 'closed' },
    };

    const state = createState();
    const { nextState } = await runTurn(state, [], 'לא יודע');

    expect(nextState.meta.signals.avoidance).toBe(true);
    expect(nextState.meta.resistanceFlag).toBe('avoidance');
    // Router overrides model's 'closed' recommendation → 'open' for avoidance
    expect(nextState.meta.questionAperture).toBe('open');

    MOCK_RESPONSES[key] = saved;
  });
});

// ─── הבורח: flight → closed aperture + saved threads ─────────────────────────

describe('Persona: הבורח (Flight)', () => {
  it('flight flag sets aperture to closed and saves drifted topic', async () => {
    const { MOCK_RESPONSES, resetMockCounters } = await import('../../src/adapters/model.js');
    resetMockCounters();
    const key = '1:0';
    const saved = MOCK_RESPONSES[key];
    MOCK_RESPONSES[key] = {
      message: 'זה היה לפני או אחרי?',
      evaluation: {
        slots: {},
        flag_flight: true,
        drifted_topic: 'ילדות',
        new_info: false,
        question_aperture: 'open',
      },
    };

    const state = createState();
    const { nextState } = await runTurn(state, [], 'זה מזכיר לי את הילדות שלי');

    expect(nextState.meta.signals.flight).toBe(true);
    expect(nextState.meta.resistanceFlag).toBe('flight');
    expect(nextState.meta.questionAperture).toBe('closed');
    expect(nextState.meta.savedThreads).toEqual([{ topic: 'ילדות', stage: 1 }]);

    MOCK_RESPONSES[key] = saved;
  });

  it('does not duplicate saved threads', async () => {
    const { MOCK_RESPONSES, resetMockCounters } = await import('../../src/adapters/model.js');
    resetMockCounters();
    const key = '1:0';
    const saved = MOCK_RESPONSES[key];
    MOCK_RESPONSES[key] = {
      message: 'נחזור לזה.',
      evaluation: { slots: {}, flag_flight: true, drifted_topic: 'עבודה', new_info: false },
    };

    let state = createState();
    state = {
      ...state,
      meta: { ...state.meta, savedThreads: [{ topic: 'עבודה', stage: 1 }] },
    };
    const { nextState } = await runTurn(state, [], 'בעבודה גם ככה');

    expect(nextState.meta.savedThreads).toHaveLength(1);

    MOCK_RESPONSES[key] = saved;
  });
});

// ─── המוצף: overflow → open aperture (regulation) ────────────────────────────

describe('Persona: המוצף (Overflow)', () => {
  it('overflow flag sets resistanceFlag and keeps open aperture', async () => {
    const { MOCK_RESPONSES, resetMockCounters } = await import('../../src/adapters/model.js');
    resetMockCounters();
    const key = '1:0';
    const saved = MOCK_RESPONSES[key];
    MOCK_RESPONSES[key] = {
      message: 'אני שומע שזה נוגע. ניקח רגע.',
      evaluation: { slots: {}, flag_overflow: true, new_info: false },
    };

    const state = createState();
    const { nextState } = await runTurn(state, [], '...');

    expect(nextState.meta.signals.overflow).toBe(true);
    expect(nextState.meta.resistanceFlag).toBe('overflow');
    expect(nextState.meta.questionAperture).toBe('open');

    MOCK_RESPONSES[key] = saved;
  });

  it('overflow takes priority over flight', async () => {
    const { MOCK_RESPONSES, resetMockCounters } = await import('../../src/adapters/model.js');
    resetMockCounters();
    const key = '1:0';
    const saved = MOCK_RESPONSES[key];
    MOCK_RESPONSES[key] = {
      message: 'ניקח רגע.',
      evaluation: { slots: {}, flag_overflow: true, flag_flight: true, new_info: false },
    };

    const state = createState();
    const { nextState } = await runTurn(state, [], '...');

    expect(nextState.meta.resistanceFlag).toBe('overflow');

    MOCK_RESPONSES[key] = saved;
  });
});

// ─── הציני: cynicism → no aperture override ──────────────────────────────────

describe('Persona: הציני (Cynicism)', () => {
  it('cynicism flag sets resistanceFlag, aperture follows model', async () => {
    const { MOCK_RESPONSES, resetMockCounters } = await import('../../src/adapters/model.js');
    resetMockCounters();
    const key = '1:0';
    const saved = MOCK_RESPONSES[key];
    MOCK_RESPONSES[key] = {
      message: 'אני שומע שזה מרגיש מיותר.',
      evaluation: { slots: {}, flag_cynicism: true, new_info: false, question_aperture: 'closed' },
    };

    const state = createState();
    const { nextState } = await runTurn(state, [], 'מה זה בכלל הדבר הזה');

    expect(nextState.meta.signals.cynicism).toBe(true);
    expect(nextState.meta.resistanceFlag).toBe('cynicism');
    // No override — model's 'closed' stands
    expect(nextState.meta.questionAperture).toBe('closed');

    MOCK_RESPONSES[key] = saved;
  });
});

// ─── Resistance clears when flags are absent ─────────────────────────────────

describe('Resistance clears', () => {
  it('no flags → resistance clears, aperture follows model', async () => {
    const { MOCK_RESPONSES, resetMockCounters } = await import('../../src/adapters/model.js');
    resetMockCounters();
    const key = '1:0';
    const saved = MOCK_RESPONSES[key];
    MOCK_RESPONSES[key] = {
      message: 'ספר לי עוד.',
      evaluation: { slots: { trigger: 1 }, new_info: true, question_aperture: 'open' },
    };

    let state = createState();
    // Pre-set resistance from a previous turn
    state = { ...state, meta: { ...state.meta, resistanceFlag: 'flight', questionAperture: 'closed' } };
    const { nextState } = await runTurn(state, [], 'הוא אמר לי...');

    expect(nextState.meta.resistanceFlag).toBeNull();
    expect(nextState.meta.questionAperture).toBe('open');

    MOCK_RESPONSES[key] = saved;
  });
});

// ─── Re-entry preserves resistance state ─────────────────────────────────────

describe('Re-entry (export/import) preserves resistance state', () => {
  it('savedThreads survive round-trip', () => {
    let state = createState();
    state = {
      ...state,
      meta: {
        ...state.meta,
        savedThreads: [{ topic: 'ילדות', stage: 1 }, { topic: 'עבודה', stage: 2 }],
        resistanceFlag: 'flight',
        questionAperture: 'closed',
      },
    };

    const json = exportState(state);
    const restored = importState(json);

    expect(restored.meta.savedThreads).toEqual(state.meta.savedThreads);
    expect(restored.meta.resistanceFlag).toBe('flight');
    expect(restored.meta.questionAperture).toBe('closed');
  });
});
