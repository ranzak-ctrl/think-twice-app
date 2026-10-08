import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createState } from '../../src/core/state.js';
import { runTurn } from '../helpers/engine.js';

// Integration: the model reports a resolved actor map (מפת שחקנים); the code stores
// it and DERIVES the stage-1 `actors` score from its clarity — a muddled cast can't
// reach 2 (so the Router won't advance on it). No map reported → reported score stands.
beforeEach(() => vi.stubEnv('VITE_USE_MOCK', 'true'));
afterEach(() => vi.unstubAllEnvs());

async function runWithEval(evaluation) {
  const { MOCK_RESPONSES, resetMockCounters } = await import('../../src/adapters/model.js');
  resetMockCounters();
  const saved = MOCK_RESPONSES['1:0'];
  MOCK_RESPONSES['1:0'] = { message: 'שאלה.', evaluation: { new_info: true, ...evaluation } };
  const result = await runTurn(createState(), [], 'תשובה');
  MOCK_RESPONSES['1:0'] = saved;
  return result;
}

describe('session — actor map → derived actors score', () => {
  it('stores the resolved cast keyed by id', async () => {
    const { nextState } = await runWithEval({
      actor_map: [
        { id: 'user', label: 'המשתמש', role: 'המספר', relation: 'עצמו', clear: true },
        { id: 'romi', label: 'רומי', role: 'הבת הגדולה', relation: 'בת', clear: true },
      ],
    });
    expect(Object.keys(nextState.actorMap)).toEqual(['user', 'romi']);
    expect(nextState.actorMap.romi.role).toBe('הבת הגדולה');
  });

  it('carries each actor’s own actions through (attribution)', async () => {
    const { nextState } = await runWithEval({
      actor_map: [
        { id: 'user', label: 'המשתמש', clear: true, actions: ['עזב את המקום'] },
        { id: 'sister', label: 'נורית', clear: true, actions: ['לא ענתה להודעות'] },
      ],
    });
    expect(nextState.actorMap.user.actions).toEqual(['עזב את המקום']);
    expect(nextState.actorMap.sister.actions).toEqual(['לא ענתה להודעות']);
  });

  it('derives actors=2 when every character is clear', async () => {
    const { nextState } = await runWithEval({
      actor_map: [{ id: 'user', label: 'המשתמש', clear: true }],
    });
    expect(nextState.coverage.stage1.actors).toBe(2);
  });

  it('caps actors at 1 on a muddled cast, overriding a reported 2', async () => {
    const { nextState } = await runWithEval({
      slots: { actors: 2 }, // model over-reports the score
      actor_map: [
        { id: 'user', label: 'המשתמש', clear: true },
        { id: 'father', label: 'אבא', clear: false }, // same-as-user? unresolved
      ],
    });
    expect(nextState.coverage.stage1.actors).toBe(1);
  });

  it('leaves the reported actors score untouched when no map is reported (back-compat)', async () => {
    const { nextState } = await runWithEval({ slots: { actors: 2 } });
    expect(nextState.coverage.stage1.actors).toBe(2);
    expect(nextState.actorMap).toEqual({});
  });
});
