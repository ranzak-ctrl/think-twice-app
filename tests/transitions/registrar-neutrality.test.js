import { describe, it, expect } from 'vitest';
import { route } from '../../src/core/router.js';
import { createState, mergeActorMap } from '../../src/core/state.js';
import { applyRegistrar, parseRegistrarResponse } from '../../src/core/registrar.js';

// The exit bar docs/event-model.md §8 states — "החלטות ה-Router זהות בית-בבית עם
// הרשם ובלעדיו" — with no test enforcing it. router-guard flagged that gap: the
// 34-case matrix exercises route() directly and never asks what the registrar does
// to it. This file is that guard, and it is the gate on REGISTRAR_ENABLED.
//
// The claim under test is NOT "the registrar changes nothing" — it writes exactly
// one Router-visible cell, `coverage.stage1.actors`, and does so through
// deriveActorsScore, i.e. the code deriving a score from the cast's clarity rather
// than a model reporting one. That is the pre-existing, CLAUDE.md-blessed contract
// that session.js already ran. The claim is that it writes NOTHING ELSE the Router
// can see, ever — no meta field, and no other coverage cell.

const CORES = {
  1: ['trigger', 'timeline', 'actors', 'status', 'auto_reaction'],
  2: ['causal', 'meaning', 'wound', 'adhd_pattern'],
  3: ['emotion', 'intensity', 'past_echo'],
  4: ['auto_reaction', 'planned_reaction'],
  5: ['perspective', 'intention', 'alt_formulation', 're_emotion'],
  6: ['alternatives', 'zero_action', 'alt_from_transform'],
  7: ['goal', 'board_presented', 'sharp_decision', 'package_test'],
};

function fill(state, stage, value) {
  const key = `stage${stage}`;
  const slots = Object.fromEntries(CORES[stage].map((k) => [k, value]));
  return { ...state, coverage: { ...state.coverage, [key]: { ...state.coverage[key], ...slots } } };
}

// A spread of states wide enough that a Router-visible side effect would have to
// hide in all of them to survive: every stage, at every coverage level, saturated
// and not, mid-confirmation, inside a rejection grace window, and at the guard.
function states() {
  const out = [];
  for (let stage = 1; stage <= 7; stage++) {
    for (const level of [0, 1, 2]) {
      for (const sat of [0, 2]) {
        let s = createState();
        s = { ...s, meta: { ...s.meta, currentStage: stage, saturationCount: sat } };
        for (let n = 1; n <= stage; n++) s = fill(s, n, n < stage ? 2 : level);
        out.push({ label: `stage${stage} lvl${level} sat${sat}`, state: s });
      }
    }
  }
  const base = createState();
  out.push({ label: 'full coverage, mid-stage', state: { ...fill(base, 1, 2), meta: { ...base.meta, questionCount: 4 } } });
  out.push({ label: 'at the load guard', state: { ...base, meta: { ...base.meta, questionCount: 25 } } });
  out.push({ label: 'safety stop', state: { ...base, meta: { ...base.meta, safetyFlag: true } } });
  out.push({ label: 'session complete', state: { ...base, meta: { ...base.meta, sessionComplete: true } } });
  return out;
}

// Everything the registrar can report EXCEPT the cast — the material that must be
// invisible to the Router no matter how much of it arrives.
const FULL_REPORT = parseRegistrarResponse(JSON.stringify({
  setting: { place: 'בסלון', time: 'בערב', precedent: 'פעם שלישית', conditions: ['גב תפוס', 'אין שותפות'] },
  beats: [
    { id: 'b1', slot: 'stage1.trigger', actor: 'self', text: 'עברת בסלון', label: 'עברת', camera: true, phase: 'during' },
    { id: 'b2', slot: 'stage4.auto_reaction', actor: 'self', text: 'יצאת מהחדר', label: 'יצאת', camera: true, phase: 'after' },
    { id: 'b3', slot: 'stage2.wound', actor: 'self', text: 'אני לא שווה', label: 'לא שווה', camera: false },
  ],
  stances: [
    { id: 's1', slot: 'stage2.causal', type: 'reading', actor: 'self', text: 'החליטו בלעדיי', source: 'stated' },
    { id: 's2', slot: 'stage5.intention', type: 'want', actor: 'wife', text: 'רגע נעים', source: 'attributed', third_person: true },
    { id: 's3', slot: 'stage7.goal', type: 'goal', actor: 'self', text: 'שיראו בי שותף', source: 'stated' },
  ],
  emotions: [{ id: 'e1', slot: 'stage3.emotion', actor: 'self', name: 'עלבון', granular: true, intensity: 8 }],
  edges: [{ from: 'stage1.trigger', to: 'stage2.causal', kind: 'because', confirmed: true }],
  groups: [{ id: 'g1', label: 'המשפחה', kind: 'community', members: ['actor:wife', 'actor:romi'], confirmed: true }],
  open_forks: [{ id: 'f1', question: 'מי מחליט על חופשות', options: ['אתה', 'היא'] }],
  gap_observations: [
    { target: 'stage1.timeline', dimension: 'factual', level: 1, note: 'שתי גרסאות לתאריך' },
    { target: 'stage2.causal', dimension: 'cognitive', level: 2, note: 'סתירה' },
  ],
})).deltas;

describe('the registrar is invisible to the Router — everything except the cast', () => {
  for (const { label, state } of states()) {
    it(`decides identically · ${label}`, () => {
      expect(route(applyRegistrar(state, FULL_REPORT, 3))).toEqual(route(state));
    });
  }

  it('writes no meta field at all — the Router reads meta and coverage only', () => {
    for (const { state } of states()) {
      expect(applyRegistrar(state, FULL_REPORT, 3).meta).toEqual(state.meta);
    }
  });

  it('leaves every coverage cell untouched', () => {
    for (const { state } of states()) {
      expect(applyRegistrar(state, FULL_REPORT, 3).coverage).toEqual(state.coverage);
    }
  });

  it('records the contradictions it found, and the Router still cannot see them', () => {
    const s = createState();
    const after = applyRegistrar(s, FULL_REPORT, 3);
    expect(Object.keys(after.gaps.byTarget)).toHaveLength(2); // it really did record them
    expect(route(after)).toEqual(route(s));                   // and they reach nothing
  });
});

describe('the cast is the one documented exception, and it behaves exactly as before', () => {
  const cast = (actors) => parseRegistrarResponse(JSON.stringify({ actors })).deltas;

  it('moves stage1.actors and nothing else in coverage', () => {
    const s = createState();
    const after = applyRegistrar(s, cast([{ id: 'wife', label: 'אשתך', clear: false }]));
    expect(after.coverage.stage1.actors).toBe(1);
    expect({ ...after.coverage, stage1: { ...after.coverage.stage1, actors: s.coverage.stage1.actors } })
      .toEqual(s.coverage);
    expect(after.meta).toEqual(s.meta);
  });

  it('produces the same gate session.js already produced from the same cast', () => {
    const viaRegistrar = applyRegistrar(createState(), cast([{ id: 'w', label: 'אשתך', clear: false }]));
    // What the pre-registrar path did: merge the cast, derive the score. Same input,
    // same code, so the Router must not be able to tell which path wrote it.
    let viaSession = mergeActorMap(createState(), [{ id: 'w', label: 'אשתך', clear: false }]);
    viaSession = {
      ...viaSession,
      coverage: { ...viaSession.coverage, stage1: { ...viaSession.coverage.stage1, actors: 1 } },
    };
    expect(route(viaRegistrar)).toEqual(route(viaSession));
    expect(viaRegistrar.actorMap).toEqual(viaSession.actorMap);
  });

  it('a clear cast reaches 2 and an unclear one holds stage 1 shut', () => {
    let s = fill(createState(), 1, 2);
    s = applyRegistrar(s, cast([{ id: 'a', label: 'אשתך', clear: true }, { id: 'b', label: 'רומי', clear: false }]));
    expect(route({ ...s, meta: { ...s.meta, saturationCount: 2 } }).reason).toBe('actors_unclear');
    s = applyRegistrar(s, cast([{ id: 'b', clear: true }]));
    expect(route({ ...s, meta: { ...s.meta, saturationCount: 2 } }).decision).toBe('requestConfirmation');
  });

  it('a cast change outside stage 1 cannot move the current stage decision', () => {
    let s = createState();
    s = { ...s, meta: { ...s.meta, currentStage: 5, saturationCount: 2 } };
    for (const n of [1, 2, 3, 4]) s = fill(s, n, 2);
    s = fill(s, 5, 2);
    const after = applyRegistrar(s, cast([{ id: 'late', label: 'דמות חדשה', clear: false }]));
    expect(after.coverage.stage1.actors).toBe(1); // it did write
    expect(route(after)).toEqual(route(s));       // and stage 5 did not notice
  });
});
