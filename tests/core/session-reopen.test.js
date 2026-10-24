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

  // A question that strayed on the very turn that re-opens: the correction would
  // name the boundaries of the stage we just left (router-guard, 24.10.2026).
  it('clears a stray question recorded on the re-opening turn', async () => {
    const { nextState } = await runStage7Turn({ merge_attempt: 'real', asks: 'stage3.emotion' });
    expect(nextState.meta.currentStage).toBe(6);
    expect(nextState.meta.offStage).toBeNull();
  });

  it('resets the merge attempt and stage counters on re-open', async () => {
    const { nextState } = await runStage7Turn({ merge_attempt: 'real' });
    expect(nextState.meta.mergeAttempt).toBeNull();
    expect(nextState.meta.questionCount).toBe(0);
    expect(nextState.meta.saturationCount).toBe(0);
  });

  // Until 24.10.2026 re-open also zeroed `confirmationFloor`, the threshold the
  // summary-correction window set on questionCount. The confirmation step is
  // gone (Ran's ruling of that day: a stage ends with a summary and moves on), and
  // with it the floor; a re-opened stage must not carry the dead field back.
  it('carries no summary-correction floor into the re-opened stage', async () => {
    const { nextState } = await runStage7Turn({ merge_attempt: 'real' });
    expect(nextState.meta).not.toHaveProperty('confirmationFloor');
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
