// Interview packs — the engine/pack contract (docs/interview-platform-plan.md).
//
// Two claims are tested here. That Think Twice's pack is valid and is DATA (the
// thing an interview editor will read and write). And that the Router routes by
// whatever pack it is handed — proved on a pack that is not Think Twice, because
// passing the old matrix with the old pack proves only that nothing broke.

import { describe, it, expect } from 'vitest';
import { thinkTwiceAdult } from '../../src/packs/think-twice-adult/pack.js';
import { validatePack, DEFAULT_PACK, stageWith } from '../../src/core/pack.js';
import { route, evaluateStage, rejectConfirmation, confirmAndAdvance, Decision } from '../../src/core/router.js';
import { createState, mergeActorMap } from '../../src/core/state.js';
import { signpostForStage } from '../../src/content/signposting.js';

const clone = (v) => JSON.parse(JSON.stringify(v));

describe('the Think Twice pack', () => {
  it('is valid', () => {
    expect(validatePack(thinkTwiceAdult)).toEqual({ ok: true, errors: [] });
  });

  it('is plain data — it survives JSON unchanged', () => {
    expect(clone(thinkTwiceAdult)).toEqual(thinkTwiceAdult);
  });

  it('is what the engine runs by default (phase 1, transitional)', () => {
    expect(DEFAULT_PACK).toBe(thinkTwiceAdult);
  });

  it('lays out the StateDocument coverage', () => {
    const cov = createState().coverage;
    expect(Object.keys(cov)).toEqual(thinkTwiceAdult.stages.map((s) => s.key));
    expect(Object.keys(cov.stage2)).toEqual(['causal', 'meaning', 'wound', 'adhd_pattern']);
  });
});

describe('validatePack refuses what the engine cannot run', () => {
  const broken = (mutate) => {
    const p = clone(thinkTwiceAdult);
    mutate(p);
    return validatePack(p);
  };
  const fails = (mutate, fragment) => {
    const r = broken(mutate);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' | ')).toContain(fragment);
  };

  it('a function inside the pack', () => fails((p) => { p.stages[0].label = () => 'x'; }, 'plain data'));
  it('a stage key out of order', () => fails((p) => { p.stages[1].key = 'stage9'; }, 'keys follow order'));
  it('a duplicate slot', () => fails((p) => { p.stages[2].slots.push({ id: 'emotion' }); }, 'unique'));
  it('a slot id the gap store cannot address', () => fails((p) => { p.stages[2].slots[0].id = 'Emotion-1'; }, 'lowercase'));
  it('a stage with no slots', () => fails((p) => { p.stages[3].slots = []; }, 'at least one slot'));
  it('a dependency on a later stage', () => fails((p) => { p.stages[1].requires = ['stage5']; }, 'earlier stage'));
  it('a dependency on no stage', () => fails((p) => { p.stages[4].requires = ['stage99']; }, 'unknown stage'));
  it('a component outside the catalog', () => fails((p) => { p.stages[0].components.push({ type: 'askTheModel' }); }, 'unknown component'));
  it('castClarity on a slot the stage lacks', () => fails((p) => { p.stages[0].components[0].slot = 'cast'; }, 'castClarity.slot'));
  it('a decision stage missing its slots', () => fails((p) => { p.stages[6].slots.pop(); }, 'package_test'));
  it('an interview that cannot close', () => fails((p) => { p.stages[6].components = []; }, 'last stage'));
  it('a threshold outside (0, 1]', () => fails((p) => { p.routing.softThreshold = 1.5; }, 'softThreshold'));
});

// ── A pack that is not Think Twice ──
// Three stages, different slot names, no cast gate, the dependency and the load
// guard in different places. If anything in the Router still assumed seven stages,
// stage 1's cast gate or stage 5's guard, one of these fails.
const mini = {
  id: 'mini',
  version: 1,
  routing: { softThreshold: 0.5, saturationLimit: 1, loadGuard: 6, rejectGrace: 2 },
  stages: [
    { key: 'stage1', label: 'מה היה', slots: [{ id: 'what' }, { id: 'who' }] },
    { key: 'stage2', label: 'מה אפשר', slots: [{ id: 'options' }], loadGuard: 3, components: [{ type: 'collector' }] },
    {
      key: 'stage3',
      label: 'מה בוחרים',
      requires: ['stage1'],
      slots: [{ id: 'goal' }, { id: 'board_presented' }, { id: 'sharp_decision' }, { id: 'package_test' }],
      components: [{ type: 'decision' }],
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

describe('the Router routes by the pack it is handed', () => {
  it('the mini pack is valid', () => {
    expect(validatePack(mini)).toEqual({ ok: true, errors: [] });
  });

  it('coverage is laid out from that pack', () => {
    expect(createState(mini).coverage).toEqual({
      stage1: { what: 0, who: 0 },
      stage2: { options: 0 },
      stage3: { goal: 0, board_presented: 0, sharp_decision: 0, package_test: 0 },
    });
  });

  it('uses the pack’s threshold and saturation limit', () => {
    // 1 of 2 at 2 meets a 0.5 threshold; one quiet turn saturates at limit 1.
    expect(evaluateStage(at(mini, 1, { what: 2, who: 1 }).coverage, 1, mini).softThresholdMet).toBe(true);
    const r = route(at(mini, 1, { what: 2, who: 1 }, { saturationCount: 1 }), mini);
    expect(r).toMatchObject({ decision: Decision.REQUEST_CONFIRMATION, nextStage: 2, reason: 'exhausted' });
    // Think Twice's 0.8 would not have let that through.
    expect(evaluateStage({ stage1: { trigger: 2, timeline: 1, actors: 1, status: 1, auto_reaction: 1 } }, 1).softThresholdMet).toBe(false);
  });

  it('has no cast gate where the pack declares none', () => {
    const s = mergeActorMap(at(mini, 1, { what: 2, who: 2 }), [{ id: 'x', label: 'מישהו', clear: false }]);
    expect(route(s, mini)).toMatchObject({ decision: Decision.REQUEST_CONFIRMATION, nextStage: 2 });
  });

  it('takes the stage’s own load guard, else the pack’s', () => {
    // Stage 3 requires stage 1, so stage 1 is filled to let the guard be what moves.
    const s2 = at(mini, 2, {}, { questionCount: 3 });
    const ready = { ...s2, coverage: { ...s2.coverage, stage1: { what: 2, who: 2 } } };
    expect(route(ready, mini)).toMatchObject({ reason: 'load_guard', nextStage: 3 });
    expect(route(at(mini, 1, {}, { questionCount: 5 }), mini).decision).toBe(Decision.STAY);
    expect(route(at(mini, 1, {}, { questionCount: 6 }), mini)).toMatchObject({ reason: 'load_guard' });
  });

  it('holds the dependency the pack declares', () => {
    // Stage 2 exhausted by the guard, but stage 3 requires stage 1, which is empty.
    const s = at(mini, 2, {}, { questionCount: 3 });
    expect(route({ ...s, coverage: { ...s.coverage, stage1: { what: 0, who: 0 } } }, mini)).toMatchObject({
      decision: Decision.STAY,
      reason: 'dependency_not_met',
    });
  });

  it('runs the decision component on the last stage, whatever its number', () => {
    expect(route(at(mini, 3, { goal: 1 }), mini).decision).toBe(Decision.SHOW_BOARD);
    expect(
      route(at(mini, 3, { goal: 2, board_presented: 2, sharp_decision: 2, package_test: 2 }), mini).decision
    ).toBe(Decision.SESSION_COMPLETE);
    expect(route(at(mini, 3, { goal: 2, board_presented: 2 }, { mergeAttempt: 'real' }), mini)).toMatchObject({
      decision: Decision.REOPEN,
      targetStage: stageWith(mini, 'collector'),
    });
  });

  it('never advances past the last stage', () => {
    const s = at(mini, 3, { goal: 2, board_presented: 2 }, { questionCount: 99 });
    expect(route(s, mini).decision).toBe(Decision.STAY);
  });

  it('buys the pack’s rejection grace', () => {
    const s = at(mini, 1, {}, { questionCount: 4, awaitingConfirmation: true, pendingNextStage: 2 });
    expect(rejectConfirmation(s, mini).meta.confirmationFloor).toBe(6);
    expect(confirmAndAdvance(s).meta.currentStage).toBe(2);
  });

  it('falls back to the plain signpost for a stage without one', () => {
    expect(signpostForStage(2, mini)).toBe('נמשיך.');
  });
});
