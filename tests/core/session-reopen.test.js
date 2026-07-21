import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createState } from '../../src/core/state.js';
import { runTurn } from '../../src/core/session.js';
import { signpostForStage } from '../../src/content/signposting.js';

// Re-open: a stage-8 "real" merge sends production back to stage 7 (alternatives). The
// reply must be an anchored Re-open opener (core-assumptions §2), not the raw stage-8
// probe. Offline the opener falls back to the static signpost for the re-opened stage.
beforeEach(() => vi.stubEnv('VITE_ANTHROPIC_API_KEY', ''));
afterEach(() => vi.unstubAllEnvs());

async function runStage8Turn(evaluation) {
  const { MOCK_RESPONSES, resetMockCounters } = await import('../../src/adapters/model.js');
  resetMockCounters();
  const saved = MOCK_RESPONSES['8:0'];
  MOCK_RESPONSES['8:0'] = { message: 'תגובת שלב 8', evaluation };
  const base = createState();
  const state8 = { ...base, meta: { ...base.meta, currentStage: 8 } };
  const result = await runTurn(state8, [], 'אני אדבר איתו וגם אחכה כמה ימים');
  MOCK_RESPONSES['8:0'] = saved;
  return result;
}

describe('session — Re-open opener (stage 8 → 7 merge)', () => {
  it('returns to stage 7 and replies with the anchored opener', async () => {
    const { nextState, reply, decision } = await runStage8Turn({ merge_attempt: 'real' });
    expect(decision).toBe('reopen');
    expect(nextState.meta.currentStage).toBe(7);
    // Mock opener falls back to the signpost for the re-opened stage (deterministic).
    expect(reply).toBe(signpostForStage(7));
  });

  it('does not reply with the raw stage-8 probe on re-open', async () => {
    const { reply } = await runStage8Turn({ merge_attempt: 'real' });
    expect(reply).not.toBe('תגובת שלב 8');
  });

  it('resets the merge attempt and stage counters on re-open', async () => {
    const { nextState } = await runStage8Turn({ merge_attempt: 'real' });
    expect(nextState.meta.mergeAttempt).toBeNull();
    expect(nextState.meta.questionCount).toBe(0);
    expect(nextState.meta.saturationCount).toBe(0);
  });
});
