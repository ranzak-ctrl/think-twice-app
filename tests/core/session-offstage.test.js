// A question that strayed outside the stage — Ran, 24.10.2026 (test-plan §א.1ב,
// items 13 and 14): "להציג את השאלה למשתמש; בפנייה הבאה למודל לשקף את החריגה
// ולהחזיר את הראיון למסלול. בכל מקרה לא לחדול את הראיון." And: reflected to the
// MODEL only, never to the person. Run through the four-stage pack with a scripted
// model, the way the shell runs an interview.

import { describe, it, expect } from 'vitest';
import { createEngine } from '../../src/core/engine.js';
import { parseResponse } from '../../src/core/responseParser.js';
import { buildSystemPrompt, buildSummaryPrompt, buildOpenerPrompt, buildRegistrarPrompt } from '../../src/core/promptBuilder.js';
import { four, prompts as fourPrompts } from '../helpers/four-stage.js';

const texts = { ...fourPrompts, stages: Object.fromEntries(four.stages.map((st) => [st.key, `[${st.key}]`])) };

function scripted(script) {
  const seen = [];
  const complete = async (req) => {
    seen.push(req);
    if (req.mode === 'registrar') return { ok: true, raw: '{}', message: null, evaluation: null, usage: null };
    if (req.mode === 'summary') return { ok: true, message: 'אז הבנתי ש…', evaluation: null, usage: null };
    if (req.mode === 'opener') return { ok: true, message: 'ומה חשבת?', evaluation: null, usage: null };
    const step = script.shift() ?? { message: 'ומה עוד?', evaluation: {} };
    return { ...parseResponse(JSON.stringify({ message: step.message, evaluation: { new_info: true, ...step.evaluation } })), usage: null };
  };
  return { complete, seen };
}

describe('a question outside the stage (topic-frame breach)', () => {
  it('is shown as it is, moves no stage, and is reflected to the model on the next call only', async () => {
    const strayed = 'מה חשבת באותו רגע?';
    const { complete, seen } = scripted([
      { message: strayed, evaluation: { slots: { event: 1 }, asks: 'stage2.reading' } },
      { message: 'ומתי זה קרה?', evaluation: { slots: { when: 1 }, asks: 'stage1.when' } },
    ]);
    const e = createEngine({ pack: four, prompts: texts, complete });
    const s0 = e.createState();

    const t1 = await e.runTurn(s0, [], 'קרה משהו');
    expect(t1.reply).toBe(strayed);                       // the person sees the question as it was
    expect(t1.failure).toBeNull();                        // a deviation is not a failure
    expect(t1.nextState.meta.currentStage).toBe(1);       // the Router moved nothing
    expect(t1.nextState.meta.offStage).toEqual({ asked: 'stage2.reading', stage: 'stage1' });

    // The next call carries the stage's boundaries — in the hidden prompt, and only
    // on the interviewer's turn prompt.
    const next = buildSystemPrompt({ stage: 1, state: t1.nextState, prompts: texts, pack: four });
    expect(next).toContain('תיקון מסלול');
    expect(next).toContain('stage2.reading');
    expect(next).toContain('event · when');
    expect(next).toContain('אל תאמר למרואיין דבר על החריגה');
    expect(buildSummaryPrompt({ state: t1.nextState, prompts: texts, pack: four })).not.toContain('תיקון מסלול');
    expect(buildOpenerPrompt({ stage: 2, state: t1.nextState, prompts: texts, pack: four })).not.toContain('תיקון מסלול');
    // The registrar's prompt is unredacted too, but it answers in JSON only — a
    // "now ask one question" block there is an instruction to speak in a call that
    // must not (router-guard, 24.10.2026).
    expect(buildRegistrarPrompt({ state: t1.nextState, prompts: texts, pack: four }).volatile).not.toContain('תיקון מסלול');

    // Back on track: the deviation clears, the interview went on.
    const history = [{ role: 'user', content: 'קרה משהו' }, { role: 'assistant', content: strayed }];
    const t2 = await e.runTurn(t1.nextState, history, 'חשבתי שזה לא הוגן');
    expect(t2.nextState.meta.offStage).toBeNull();
    expect(t2.nextState.meta.currentStage).toBe(1);
    expect(buildSystemPrompt({ stage: 1, state: t2.nextState, prompts: texts, pack: four })).not.toContain('תיקון מסלול');
    expect(seen.filter((r) => (r.mode ?? 'turn') === 'turn').length).toBe(2);
  });

  // The stray question lands on the turn that closes the stage: the interview
  // moves on, and the next stage's interviewer is not told it is still in the old
  // one (router-guard, 24.10.2026).
  it('does not outlive the stage it strayed from', async () => {
    const { complete } = scripted([
      { message: 'ומה חשבת על זה?', evaluation: { slots: { event: 2, when: 2 }, asks: 'stage2.reading' } },
    ]);
    const e = createEngine({ pack: four, prompts: texts, complete });
    const t1 = await e.runTurn(e.createState(), [], 'קרה משהו, ואז נגמר');
    expect(t1.nextState.meta.currentStage).toBe(2);            // the stage closed on its summary
    expect(t1.nextState.meta.offStage).toBeNull();
    expect(buildSystemPrompt({ stage: 2, state: t1.nextState, prompts: texts, pack: four })).not.toContain('תיקון מסלול');
    expect(t1.reply.startsWith('אז הבנתי ש…')).toBe(true);
  });

  it('a stale flag with the interview already elsewhere renders nothing', () => {
    const e = createEngine({ pack: four, prompts: texts, complete: async () => ({ ok: false }) });
    const s = e.createState();
    const stale = { ...s, meta: { ...s.meta, currentStage: 2, offStage: { asked: 'stage2.reading', stage: 'stage1' } } };
    const prompt = buildSystemPrompt({ stage: 2, state: stale, prompts: texts, pack: four });
    expect(prompt).not.toContain('תיקון מסלול');
    expect(prompt).not.toContain('השלב לא השתנה');
  });

  it('a question on the stage, or no account of it, is no deviation', async () => {
    const { complete } = scripted([
      { message: 'ומתי?', evaluation: { slots: { when: 1 }, asks: 'stage1.when' } },
      { message: 'ואז?', evaluation: { slots: { when: 1 } } },
      { message: 'ואז?', evaluation: { slots: { when: 1 }, asks: 'nonsense' } },
    ]);
    const e = createEngine({ pack: four, prompts: texts, complete });
    let s = e.createState();
    for (const text of ['א', 'ב', 'ג']) {
      const r = await e.runTurn(s, [], text);
      expect(r.nextState.meta.offStage).toBeNull();
      s = r.nextState;
    }
  });
});

describe('the model acting as if it moved a stage (gate breach)', () => {
  it('the gate holds: the stage stays, a later stage scores at most 1, and the next call says so', async () => {
    const { complete } = scripted([
      {
        message: 'בוא נעבור לדבר על מה שחשבת. מה עבר לך בראש?',
        evaluation: { slots: { event: 2, 'stage2.reading': 2, 'stage2.people': 2 }, asks: 'stage2.reading' },
      },
    ]);
    const e = createEngine({ pack: four, prompts: texts, complete });
    const r = await e.runTurn(e.createState(), [], 'קרה משהו');
    expect(r.nextState.meta.currentStage).toBe(1);
    expect(r.decision).not.toBe('advance');
    expect(r.nextState.coverage.stage2.reading).toBeLessThanOrEqual(1);
    expect(r.nextState.coverage.stage2.people).toBeLessThanOrEqual(1);
    expect(r.nextState.meta.offStage).toEqual({ asked: 'stage2.reading', stage: 'stage1' });
    const next = buildSystemPrompt({ stage: 1, state: r.nextState, prompts: texts, pack: four });
    expect(next).toContain('השלב לא השתנה');
    expect(r.failure).toBeNull();
    expect(r.nextState.meta.sessionComplete).toBe(false);
  });
});
