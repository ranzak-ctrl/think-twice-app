// The closing stage — an interview that goes on after the decision.
//
// Until 16.10.2026 the decision was the only way an interview ended, so it had to
// be the last stage. The parents' interview (src/packs/think-twice-parents/pack.js)
// chooses a response and THEN practises it for next time — Natali's step 7 — so
// the engine gained a second closure: the `closing` component, on the last stage,
// which ends the interview when that stage is covered and its summary confirmed.
//
// What must hold: the decision, when a closing stage follows it, summarises and
// hands over instead of ending; the closing stage ends only on a confirmed
// summary, never on its own; a rejected summary buys the same grace as anywhere;
// and an interview may run without the registrar only by saying so (null).

import { describe, it, expect } from 'vitest';
import { validatePack } from '../../src/core/pack.js';
import { route, confirmAndAdvance, rejectConfirmation, Decision } from '../../src/core/router.js';
import { createState } from '../../src/core/state.js';
import { createEngine } from '../../src/core/engine.js';
import { thinkTwiceParents } from '../../src/packs/think-twice-parents/pack.js';
import { prompts as fourPrompts } from '../helpers/four-stage.js';

const clone = (v) => JSON.parse(JSON.stringify(v));

// Facts, options, the decision, and practice after it.
const after = {
  id: 'after-test',
  name: 'ראיון עם תרגול',
  version: 1,
  routing: { softThreshold: 0.8, saturationLimit: 2, loadGuard: 12, rejectGrace: 2 },
  stages: [
    { key: 'stage1', label: 'מה קרה', slots: [{ id: 'what' }] },
    { key: 'stage2', label: 'מה אפשר', slots: [{ id: 'alternatives' }], components: [{ type: 'collector' }] },
    {
      key: 'stage3',
      label: 'מה בוחרים',
      requires: ['stage2'],
      slots: [{ id: 'goal' }, { id: 'board_presented' }, { id: 'sharp_decision' }, { id: 'package_test' }],
      components: [{ type: 'decision' }],
    },
    {
      key: 'stage4',
      label: 'מה מתרגלים',
      slots: [{ id: 'step' }, { id: 'when' }],
      loadGuard: 5,
      components: [{ type: 'closing' }],
    },
  ],
};

const at = (pack, stage, patch = {}, meta = {}) => {
  const s = createState(pack);
  return {
    ...s,
    coverage: { ...s.coverage, [`stage${stage}`]: { ...s.coverage[`stage${stage}`], ...patch } },
    meta: { ...s.meta, currentStage: stage, ...meta },
  };
};
const DECIDED = { goal: 2, board_presented: 2, sharp_decision: 2, package_test: 2 };

describe('validatePack: how an interview may end', () => {
  const fails = (pack, fragment) => {
    const r = validatePack(pack);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' | ')).toContain(fragment);
  };

  it('accepts a closing stage after the decision — and the parents’ pack', () => {
    expect(validatePack(after)).toEqual({ ok: true, errors: [], limits: [] });
    expect(validatePack(thinkTwiceParents)).toEqual({ ok: true, errors: [], limits: [] });
  });

  it('refuses a closing stage that is not the last', () => {
    const p = clone(after);
    p.stages[0].components = [{ type: 'closing' }];
    p.stages[3].components = [];
    fails(p, '"closing" must sit on the last stage');
    p.stages[3].components = [{ type: 'closing' }];
    fails(p, 'only one stage may carry "closing"');
  });

  it('refuses two closures on one stage', () => {
    const p = clone(after);
    p.stages[2].components.push({ type: 'closing' });
    fails(p, 'closing cannot sit on the decision stage');
  });

  it('refuses an interview with no way to end', () => {
    const p = clone(after);
    p.stages[3].components = [];
    fails(p, 'last stage must carry "decision" or "closing"');
  });

  it('refuses a closing component with a field it does not read', () => {
    const p = clone(after);
    p.stages[3].components = [{ type: 'closing', when: 'always' }];
    fails(p, 'closing has an unknown field "when"');
  });
});

describe('the Router: a decision that hands over, and a stage that closes', () => {
  it('a decided decision with a stage after it asks for its summary to be confirmed', () => {
    expect(route(at(after, 3, DECIDED), after)).toMatchObject({
      decision: Decision.REQUEST_CONFIRMATION,
      nextStage: 4,
      reason: 'decided',
    });
  });

  it('a vague decision still never moves on', () => {
    const s = at(after, 3, DECIDED, { kpi: { decisionType: 'vague' } });
    expect(route(s, after).decision).toBe(Decision.STAY);
  });

  it('a rejected decision summary buys the grace before it is offered again', () => {
    const s = at(after, 3, DECIDED, { questionCount: 1, confirmationFloor: 3 });
    expect(route(s, after)).toMatchObject({ decision: Decision.STAY, reason: 'correcting_summary' });
  });

  it('the closing stage, covered, asks for its summary — and does not close by itself', () => {
    const r = route(at(after, 4, { step: 2, when: 2 }), after);
    expect(r).toMatchObject({ decision: Decision.REQUEST_CONFIRMATION, nextStage: null, closes: true });
    expect(route(at(after, 4, { step: 2, when: 1 }), after).decision).toBe(Decision.STAY);
  });

  it('the closing stage’s load guard asks for the summary too', () => {
    expect(route(at(after, 4, {}, { questionCount: 5 }), after)).toMatchObject({
      closes: true,
      reason: 'load_guard',
    });
  });

  it('confirming the closing summary ends the interview where it stands', () => {
    const s = at(after, 4, { step: 2, when: 2 }, { awaitingConfirmation: true, pendingClose: true, questionCount: 3 });
    const done = confirmAndAdvance(s);
    expect(done.meta).toMatchObject({ sessionComplete: true, currentStage: 4, awaitingConfirmation: false, pendingClose: false });
    expect(done.meta.kpi.questionsPerStage.stage4).toBe(3);
    expect(done.meta.decisionLog.at(-1)).toMatchObject({ decision: Decision.SESSION_COMPLETE, reason: 'confirmed' });
    expect(route(done, after).decision).toBe(Decision.SESSION_COMPLETE);
  });

  it('rejecting it keeps the interview open and buys the grace', () => {
    const s = at(after, 4, {}, { awaitingConfirmation: true, pendingClose: true, questionCount: 4 });
    const back = rejectConfirmation(s, after);
    expect(back.meta).toMatchObject({ sessionComplete: false, pendingClose: false, confirmationFloor: 6 });
  });
});

// A whole interview through createEngine, the way the shell runs one, with the
// registrar switched off on purpose.
describe('an interview with a closing stage runs to its end', () => {
  const calls = [];
  let probe = {};
  const complete = async (req) => {
    calls.push(req.mode ?? 'probe');
    switch (req.mode) {
      case 'summary':
        return { ok: true, message: 'בוא נוודא שהבנתי נכון — זה מדויק?' };
      case 'opener':
        return { ok: true, message: 'נמשיך. מה עוד?' };
      case 'board':
        return { ok: true, message: 'הנה מה שאספנו. במה את בוחרת?', evaluation: { board: [{ option: 'לשבת לידו' }] } };
      default:
        return { ok: true, message: 'ומה אז?', evaluation: { slots: {}, ...probe } };
    }
  };
  const textsWithout = { ...fourPrompts, registrar: null, stages: { stage1: '[s1]', stage2: '[s2]', stage3: '[s3]', stage4: '[s4]' } };

  it('refuses a missing registrar text, and accepts an explicit null', () => {
    const { registrar, ...missing } = textsWithout;
    expect(() => createEngine({ pack: after, prompts: missing, complete })).toThrow(/registrar/);
    expect(() => createEngine({ pack: after, prompts: textsWithout, complete })).not.toThrow();
  });

  it('decides, hands over, practises, and ends only on the confirmed closing summary', async () => {
    const interview = createEngine({ pack: after, prompts: textsWithout, complete });
    let state = interview.createState();
    let history = [];
    const turn = async (text, report) => {
      probe = report;
      const r = await interview.runTurn(state, history, text);
      state = r.nextState;
      history = [...history, { role: 'user', content: text }, { role: 'assistant', content: r.reply }];
      return r.decision;
    };
    const confirm = async () => {
      state = interview.confirmAndAdvance(state);
      if (state.meta.sessionComplete) return;
      const r = await interview.generateStageOpener(state, history);
      state = r.nextState;
    };

    expect(await turn('הוא נתן פליק לאח', { slots: { what: 2 } })).toBe(Decision.REQUEST_CONFIRMATION);
    await confirm();
    expect(await turn('אפשר לשבת לידו', { slots: { alternatives: 2 }, alternatives: ['לשבת לידו'] })).toBe(
      Decision.REQUEST_CONFIRMATION
    );
    await confirm();
    expect(state.meta.currentStage).toBe(3);
    expect(await turn('שיעשה שיעורים בשקט', { slots: { goal: 2 } })).toBe(Decision.SHOW_BOARD);
    expect(
      await turn('אשב לידו. אני מרוויחה שקט ומשלמת בזמן', {
        slots: { sharp_decision: 2, package_test: 2 },
        decision_type: 'sharp',
      })
    ).toBe(Decision.REQUEST_CONFIRMATION);
    expect(state.meta.sessionComplete).toBe(false);
    await confirm();
    expect(state.meta.currentStage).toBe(4);

    expect(await turn('מחר בארבע אכין אותו מראש', { slots: { step: 2, when: 2 } })).toBe(Decision.REQUEST_CONFIRMATION);
    expect(state.meta).toMatchObject({ awaitingConfirmation: true, pendingClose: true, sessionComplete: false });
    await confirm();
    expect(state.meta.sessionComplete).toBe(true);
    expect(state.meta.currentStage).toBe(4);

    // The registrar never ran: the interview said it has none.
    expect(calls).not.toContain('registrar');
  });
});

// router-guard's review of 16.10.2026, findings 6 and 10.
describe('the hand-over keeps the rules every hand-over keeps', () => {
  it('waits for a dependency of the stage after the decision', () => {
    const p = clone(after);
    p.stages[3].requires = ['stage1'];
    expect(route(at(p, 3, DECIDED), p)).toMatchObject({ decision: Decision.STAY, reason: 'dependency_not_met' });
  });

  it('refuses a load guard on the decision stage, which would never fire', () => {
    const p = clone(after);
    p.stages[2].loadGuard = 4;
    expect(validatePack(p).errors.join(' | ')).toContain('loadGuard has no effect on the decision stage');
  });

  it('never advances past the last stage, even when the closing flag is missing', () => {
    const s = at(after, 4, {}, { awaitingConfirmation: true, pendingNextStage: null });
    const done = confirmAndAdvance(s, after);
    expect(done.meta).toMatchObject({ sessionComplete: true, currentStage: 4 });
  });
});
