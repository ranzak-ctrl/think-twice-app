// Interview packs — the engine/pack contract (docs/interview-platform-plan.md).
//
// Two claims are tested here. That Think Twice's pack is valid and is DATA (the
// thing an interview editor will read and write). And that the Router routes by
// whatever pack it is handed — proved on a pack that is not Think Twice, because
// passing the old matrix with the old pack proves only that nothing broke.

import { describe, it, expect } from 'vitest';
import { thinkTwiceAdult } from '../../src/packs/think-twice-adult/pack.js';
import {
  validatePack, DEFAULT_PACK, stageWith, parseSlotRef, barredSlots, mentalSlots, castOf,
  intensityStages, mapNarrative, mapTimeline,
} from '../../src/core/pack.js';
import { route, evaluateStage, rejectConfirmation, confirmAndAdvance, Decision } from '../../src/core/router.js';
import { createState, mergeActorMap } from '../../src/core/state.js';
import { signpostForStage } from '../../src/content/signposting.js';

const clone = (v) => JSON.parse(JSON.stringify(v));

describe('the Think Twice pack', () => {
  it('is valid, and runnable by this engine', () => {
    expect(validatePack(thinkTwiceAdult)).toEqual({ ok: true, errors: [], limits: [] });
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
  // Every export opens with which interview it was (Ran, 9.10.2026).
  it('an interview with no name', () => fails((p) => { delete p.name; }, 'pack.name'));
  it('an interview with no version', () => fails((p) => { p.version = 0; }, 'pack.version'));
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
  it('a threshold JSON cannot carry', () => fails((p) => { p.routing.softThreshold = NaN; }, 'plain data'));
  // The backstop must stay reachable — out of reach is the same as switched off.
  it('a load guard set out of reach', () => fails((p) => { p.routing.loadGuard = 1e9; }, 'loadGuard'));
  it('a stage load guard set out of reach', () => fails((p) => { p.stages[4].loadGuard = 1e15; }, 'loadGuard'));
  it('a decision with no collector before it', () => fails((p) => { p.stages[5].components = []; }, 'collector'));
  it('a collector on the decision stage itself', () => fails((p) => {
    p.stages[5].components = [];
    p.stages[6].components.push({ type: 'collector' });
  }, 'collector'));
});

// An editor hands validatePack whatever a person typed; it reports, it never throws.
describe('validatePack never throws on malformed input', () => {
  const shapes = {
    'requires as an object': (p) => { p.stages[4].requires = { stage2: true }; },
    'requires as a number': (p) => { p.stages[4].requires = 2; },
    'components as an object': (p) => { p.stages[0].components = { type: 'castClarity' }; },
    'components as a string': (p) => { p.stages[0].components = 'collector'; },
    'slots as a string': (p) => { p.stages[2].slots = 'emotion'; },
    'a null slot': (p) => { p.stages[2].slots.push(null); },
    'a null stage': (p) => { p.stages.splice(3, 0, null); },
    'a null component': (p) => { p.stages[0].components.push(null); },
    'routing missing': (p) => { delete p.routing; },
  };
  for (const [name, mutate] of Object.entries(shapes)) {
    it(name, () => {
      const p = clone(thinkTwiceAdult);
      mutate(p);
      let result;
      expect(() => { result = validatePack(p); }).not.toThrow();
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  }
  for (const v of [null, undefined, 7, 'pack', []]) {
    it(`a pack that is ${JSON.stringify(v) ?? 'undefined'}`, () => {
      expect(validatePack(v)).toMatchObject({ ok: false });
    });
  }
});

// Phase 1 slice 3 (10.10.2026) moved the turn loop onto the pack, and the two
// limits validatePack reported until then — exactly seven stages, and the cast gate
// only on stage 1 / actors — are gone. What a pack may now say about its slots, its
// cast and its map is validated instead.
describe('what slice 3 lifted, and what it validates instead', () => {
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

  it('runs a cast gate on any stage and slot', () => {
    expect(broken((p) => {
      p.stages[0].components = [];
      p.stages[2].components = [{ type: 'castClarity', slot: 'emotion' }, { type: 'intensity' }];
    })).toEqual({ ok: true, errors: [], limits: [] });
  });

  it('one cast gate per interview — there is one cast', () => fails((p) => {
    p.stages[2].components.push({ type: 'castClarity', slot: 'emotion' });
  }, 'only one stage may carry "castClarity"'));
  it('a slot flag that is not true or false', () => fails((p) => { p.stages[1].slots[2].barred = 'yes'; }, 'barred must be true or false'));
  // The guards match by name: barred here and not there would leak, or over-bar.
  it('one slot name with two sets of flags', () => fails((p) => { p.stages[3].slots[0].barred = true; }, 'different flags'));
  it('a stage name that is not text', () => fails((p) => { p.stages[0].name = 7; }, 'name must be text'));
  it('a map that is not an object', () => fails((p) => { p.map = []; }, 'map must be an object'));
  it('a map kind the drawing has no shape for', () => fails((p) => { p.map.narrative[0].kind = 'cloud'; }, 'kind must be one of'));
  it('a map row with no slots', () => fails((p) => { p.map.narrative[0].slots = []; }, 'at least one slot'));
  it('a map slot the pack does not have', () => fails((p) => { p.map.narrative[0].slots.push('stage1.weather'); }, 'not a slot of this pack'));
  it('a map slot past the last stage', () => fails((p) => { p.map.narrative[0].slots.push('stage8.trigger'); }, 'not a slot of this pack'));
  // The wound on the map is the failure every barred guard exists to prevent.
  it('a barred slot placed on the map', () => fails((p) => { p.map.narrative[1].slots.push('stage2.wound'); }, 'barred'));
  it('a slot placed twice', () => fails((p) => { p.map.narrative[5].slots.push('stage1.trigger'); }, 'already placed'));
  it('a timeline the pack does not have', () => fails((p) => { p.map.timeline = 'stage1.clock'; }, 'map.timeline'));
  it('a barred timeline', () => fails((p) => { p.map.timeline = 'stage2.adhd_pattern'; }, 'barred'));
  it('a map is optional', () => {
    expect(broken((p) => { delete p.map; }).ok).toBe(true);
  });

  // router-guard F1/F2, 10.10.2026 — what lifting the limits let through.
  it('a cast gate on the decision stage, which never reads the cast', () => fails((p) => {
    p.stages[0].components = [];
    p.stages[6].components.push({ type: 'castClarity', slot: 'sharp_decision' });
  }, 'castClarity cannot sit on the decision stage'));
  it('one component listed twice on a stage', () => fails((p) => {
    p.stages[0].components.push({ type: 'castClarity', slot: 'trigger' });
  }, '"castClarity" is listed twice'));
  // The closed fields. A typo here fails silently, and in `barred` that is the
  // wound drawn on the person's screen.
  it('a misspelled barred flag', () => fails((p) => { p.stages[1].slots[2] = { id: 'wound', bared: true }; }, 'unknown field "bared"'));
  it('a misspelled dependency', () => fails((p) => { p.stages[4].require = p.stages[4].requires; delete p.stages[4].requires; }, 'unknown field "require"'));
  it('a field a component does not take', () => fails((p) => { p.stages[5].components[0].slot = 'alternatives'; }, 'collector has an unknown field "slot"'));
  it('a misspelled routing number', () => fails((p) => { p.routing.saturationLimt = 3; }, 'unknown field "saturationLimt"'));
  it('a misspelled map field', () => fails((p) => { p.map.timelime = p.map.timeline; }, 'unknown field "timelime"'));
  it('an unknown field at the top', () => fails((p) => { p.mapp = p.map; }, 'pack: unknown field "mapp"'));
});

// Think Twice's own rules, written by hand. The flags, the cast gate, the intensity
// measure and the map moved from code into pack.js on 10.10.2026; a one-line edit
// there must fail here until it is made on purpose (router-guard F1 of 8.10.2026,
// the same contract tests/transitions/router.test.js keeps for the routing numbers).
describe("Think Twice's clinical rules, pinned", () => {
  it('bars exactly the wound and the ADHD pattern from display', () => {
    expect([...barredSlots(thinkTwiceAdult)].sort()).toEqual(['adhd_pattern', 'wound']);
  });

  it('counts exactly these slots as minds', () => {
    expect([...mentalSlots(thinkTwiceAdult)].sort()).toEqual([
      'adhd_pattern', 'alt_formulation', 'causal', 'emotion', 'goal', 'intention',
      'meaning', 'past_echo', 'perspective', 'planned_reaction', 're_emotion', 'wound',
    ]);
  });

  it('gates the cast on stage 1 and derives `actors`', () => {
    expect(castOf(thinkTwiceAdult)).toEqual({ stage: 1, key: 'stage1', slot: 'actors' });
  });

  it('measures intensity in stage 3 and again in stage 5', () => {
    expect(intensityStages(thinkTwiceAdult)).toEqual([3, 5]);
    expect(Object.keys(createState().meta.kpi).slice(0, 2)).toEqual(['emotionIntensityStage3', 'emotionIntensityStage5']);
  });

  it('lays the map out in the narrative it always had', () => {
    expect(mapNarrative(thinkTwiceAdult)).toEqual([
      { kind: 'fact', slots: [['stage1', 'trigger'], ['stage1', 'timeline'], ['stage1', 'status']] },
      { kind: 'thought', slots: [['stage2', 'causal'], ['stage2', 'meaning']] },
      { kind: 'feeling', slots: [['stage3', 'emotion'], ['stage3', 'past_echo']] },
      { kind: 'action', slots: [['stage1', 'auto_reaction'], ['stage4', 'auto_reaction']] },
      { kind: 'plan', slots: [['stage4', 'planned_reaction']] },
      { kind: 'other', slots: [['stage5', 'perspective'], ['stage5', 'intention'], ['stage5', 'alt_formulation']] },
    ]);
    expect(mapTimeline(thinkTwiceAdult)).toEqual({ stage: 1, key: 'stage1', slot: 'timeline' });
  });

  it('names its stages for the guide panel as the panel always did', () => {
    expect(thinkTwiceAdult.stages.map((s) => s.name)).toEqual([
      'עובדות', 'פרשנות', 'רגש', 'תגובה', 'פרשנות חלופית', 'חלופות', 'הכרעה',
    ]);
  });
});

// The reference grammar replaced /^stage([1-7])\.(.+)$/ in nine places. On Think
// Twice's seven stages it must accept and reject exactly what that did.
describe('a slot reference names a stage of the pack', () => {
  const OLD = /^stage([1-7])\.(.+)$/;
  const inputs = [
    'stage1.trigger', 'stage7.goal', 'stage2.wound', 'stage3.x.y', 'stage1.', 'stage0.x', 'stage8.x',
    'stage10.x', 'stage01.x', 'stage1x', 'Stage1.x', ' stage1.x', 'stage1.x ', 'stage1', 'trigger', '',
    'stage9999999999999999999.x', 'actor:wife', 'stage2.causal#2',
  ];
  for (const input of inputs) {
    it(`"${input}" reads as it always did`, () => {
      const m = OLD.exec(input);
      expect(parseSlotRef(thinkTwiceAdult, input)).toEqual(m ? { stage: Number(m[1]), key: `stage${m[1]}`, slot: m[2] } : null);
    });
  }
  it('follows the pack’s length — stage 3 of 3 is real, stage 4 is not', () => {
    expect(parseSlotRef(mini, 'stage3.goal')).toEqual({ stage: 3, key: 'stage3', slot: 'goal' });
    expect(parseSlotRef(mini, 'stage4.goal')).toBeNull();
  });
  it('is not fooled by a non-string', () => {
    for (const v of [null, undefined, 7, {}, ['stage1.x']]) expect(parseSlotRef(thinkTwiceAdult, v)).toBeNull();
  });
});

// ── A pack that is not Think Twice ──
// Three stages, different slot names, no cast gate, the dependency and the load
// guard in different places. If anything in the Router still assumed seven stages,
// stage 1's cast gate or stage 5's guard, one of these fails.
const mini = {
  id: 'mini',
  name: 'ראיון ניסיון',
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
  // The Router is pure and routes it fine — that is what this block proves. Since
  // slice 3 the turn loop runs it too: tests/core/pack-run.test.js takes a pack
  // like it through a whole interview.
  it('the mini pack keeps the contract, and this engine can run it', () => {
    expect(validatePack(mini)).toEqual({ ok: true, errors: [], limits: [] });
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
    expect(route({ ...at(mini, 3, { goal: 1 }), basket: [{ text: 'x' }] }, mini).decision).toBe(Decision.SHOW_BOARD);
    expect(route(at(mini, 3, { goal: 1 }), mini)).toMatchObject({ decision: Decision.REOPEN, reason: 'empty_basket', targetStage: 2 });
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
