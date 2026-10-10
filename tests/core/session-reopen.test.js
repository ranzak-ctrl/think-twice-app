import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createState } from '../../src/core/state.js';
import { runTurn } from '../helpers/engine.js';
import { signpostForStage } from '../../src/content/signposting.js';
import { createEngine } from '../../src/core/engine.js';
import { pack, prompts } from '../helpers/engine.js';

// Re-open: a stage-7 "real" merge sends production back to stage 6. The reply must be
// an anchored Re-open opener (core-assumptions §2), not the raw stage-7 probe. Offline
// the opener falls back to the static signpost for the re-opened stage.
beforeEach(() => vi.stubEnv('VITE_USE_MOCK', 'true'));
afterEach(() => vi.unstubAllEnvs());

async function runStage7Turn(evaluation) {
  const { MOCK_RESPONSES, resetMockCounters } = await import('../../src/adapters/model.js');
  resetMockCounters();
  const saved = MOCK_RESPONSES['7:0'];
  MOCK_RESPONSES['7:0'] = { message: 'תגובת שלב 7', evaluation };
  const base = createState();
  const state7 = { ...base, meta: { ...base.meta, currentStage: 7 } };
  const result = await runTurn(state7, [], 'אני אדבר איתו וגם אחכה כמה ימים');
  MOCK_RESPONSES['7:0'] = saved;
  return result;
}

describe('session — Re-open opener (stage 7 → 6 merge)', () => {
  it('returns to stage 6 and replies with the anchored opener', async () => {
    const { nextState, reply, decision } = await runStage7Turn({ merge_attempt: 'real' });
    expect(decision).toBe('reopen');
    expect(nextState.meta.currentStage).toBe(6);
    // Mock opener falls back to the signpost for the re-opened stage (deterministic).
    expect(reply).toBe(signpostForStage(6));
  });

  it('does not reply with the raw stage-7 probe on re-open', async () => {
    const { reply } = await runStage7Turn({ merge_attempt: 'real' });
    expect(reply).not.toBe('תגובת שלב 7');
  });

  it('resets the merge attempt and stage counters on re-open', async () => {
    const { nextState } = await runStage7Turn({ merge_attempt: 'real' });
    expect(nextState.meta.mergeAttempt).toBeNull();
    expect(nextState.meta.questionCount).toBe(0);
    expect(nextState.meta.saturationCount).toBe(0);
  });

  // Re-open is the other path that changes stage, and confirmationFloor is a
  // threshold ON questionCount — zeroing one without the other would pin the
  // reopened stage in STAY for a whole grace window, past the load guard, which
  // could not fire because the floor would sit above it. Asserted by name
  // rather than by "the counters", because the counters are what the sibling
  // assertions above already enumerate: a fifth field added later needs its own
  // line here, and a silent omission is exactly what this guards.
  it('clears the summary-correction floor on re-open', async () => {
    const { nextState } = await runStage7Turn({ merge_attempt: 'real' });
    expect(nextState.meta.confirmationFloor).toBe(0);
  });

  // The framing the opener is written from, word for word. Its stage number comes
  // from the pack since 10.10.2026 (the collector's position — 6 here), and the
  // prompt fingerprints pin the opener with a fixed situation, not this one, so
  // this is the line that would catch it drifting (router-guard F3).
  it('frames the re-open as a return to the alternatives stage, 6', async () => {
    const calls = [];
    const complete = async (req) => {
      calls.push(req);
      if (req.mode === 'registrar') return { ok: true, raw: '{}' };
      if (req.mode === 'opener') return { ok: true, message: 'פתיח' };
      return { ok: true, message: 'תגובת שלב 7', evaluation: { mergeAttempt: 'real' } };
    };
    const engine = createEngine({ pack, prompts, complete });
    const base = engine.createState();
    await engine.runTurn({ ...base, meta: { ...base.meta, currentStage: 7 } }, [], 'גם וגם');
    const opener = calls.find((c) => c.mode === 'opener');
    expect(opener.stage).toBe(6);
    expect(opener.systemPrompt).toContain(
      '## הקשר המעבר\nחזרה לשלב החלופות (6): המשתמש העלה פעולת "גם וגם" ממשית וברת-ביצוע. עגן את הפתיח בפעולה שהוא העלה — הוסף אותה לסל האפשרויות והזמן אותו להמשיך לבחון חלופות. אל תתייחס לזה כסגירה.'
    );
  });
});
