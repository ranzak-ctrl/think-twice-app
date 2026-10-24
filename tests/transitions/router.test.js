import { describe, it, expect } from 'vitest';
import {
  route,
  Decision,
  evaluateStage,
  advanceStage,
} from '../../src/core/router.js';
import { createState } from '../../src/core/state.js';

// Helper: set all core slots for a stage to a given value
function fillStage(state, stage, value = 2) {
  const stageKey = `stage${stage}`;
  const cores = {
    1: ['trigger', 'timeline', 'actors', 'status', 'auto_reaction'],
    2: ['causal', 'meaning', 'wound', 'adhd_pattern'],
    3: ['emotion', 'intensity', 'past_echo'],
    4: ['auto_reaction', 'planned_reaction'],
    5: ['perspective', 'intention', 'alt_formulation', 're_emotion'],
    6: ['alternatives', 'zero_action', 'alt_from_transform'],
    7: ['goal', 'board_presented', 'sharp_decision', 'package_test'],
  };
  const slots = {};
  cores[stage].forEach((k) => (slots[k] = value));
  return {
    ...state,
    coverage: {
      ...state.coverage,
      [stageKey]: { ...state.coverage[stageKey], ...slots },
    },
  };
}

function withSaturation(state, count = 2) {
  return { ...state, meta: { ...state.meta, saturationCount: count } };
}

function withQuestionCount(state, count) {
  return { ...state, meta: { ...state.meta, questionCount: count } };
}


// ─── 0. An unknown stage fails loudly ───────────────────────────────────────
// Before the pack, CORE_SLOTS[n] was undefined and route() threw. Moving the
// slots into the pack briefly made an unknown stage read as "0 of 0 covered" —
// full coverage — and route it somewhere plausible (router-guard, F4). No code
// path produces these values; a hand-edited import could.
describe('Unknown stage', () => {
  for (const stage of [0, 8, 1.5, -1, '7', null, undefined, NaN]) {
    it(`throws on currentStage ${String(stage)}`, () => {
      const s = createState();
      expect(() => route({ ...s, meta: { ...s.meta, currentStage: stage } })).toThrow(/Unknown stage/);
    });
  }
});

// ─── 1. Entry: new state stays in stage 1 ───────────────────────────────────
describe('Entry', () => {
  it('fresh state stays in stage 1', () => {
    const s = createState();
    expect(route(s).decision).toBe(Decision.STAY);
  });
});

// ─── 2. Transition: stage 1 → 2 on exhaustion ───────────────────────────────
describe('Stage 1 → 2 transition', () => {
  it('requests confirmation when coverage + saturation met', () => {
    let s = createState();
    s = fillStage(s, 1);
    s = withSaturation(s);
    const r = route(s);
    expect(r.decision).toBe(Decision.REQUEST_CONFIRMATION);
    expect(r.nextStage).toBe(2);
  });

  it('advances on full coverage even without saturation', () => {
    let s = createState();
    s = fillStage(s, 1); // every core slot at 2 → stage is done
    const r = route(s);
    expect(r.decision).toBe(Decision.REQUEST_CONFIRMATION);
    expect(r.nextStage).toBe(2);
    expect(r.reason).toBe('full_coverage');
  });

  it('stays when coverage not met even with saturation', () => {
    let s = createState();
    s = withSaturation(s);
    expect(route(s).decision).toBe(Decision.STAY);
  });
});

// ─── Actor-map gate: stage 1 must not advance on a muddled cast ──────────────
describe('Actor-map gate (stage 1)', () => {
  const withActorMap = (state, actorMap) => ({ ...state, actorMap });

  it('holds at stage 1 when a character is unclear, even on full coverage', () => {
    let s = fillStage(createState(), 1); // all slots at 2
    s = withActorMap(s, { user: { clear: true }, father: { clear: false } });
    const r = route(s);
    expect(r.decision).toBe(Decision.STAY);
    expect(r.reason).toBe('actors_unclear');
  });

  it('advances when every character is clear', () => {
    let s = fillStage(createState(), 1);
    s = withActorMap(s, { user: { clear: true }, father: { clear: true } });
    expect(route(s).decision).toBe(Decision.REQUEST_CONFIRMATION);
  });

  it('is stage-1 only — an unclear map does not block a later stage', () => {
    let s = { ...createState(), meta: { ...createState().meta, currentStage: 2 } };
    s = fillStage(s, 2);
    s = withActorMap(s, { x: { clear: false } });
    expect(route(s).decision).toBe(Decision.REQUEST_CONFIRMATION);
  });

  it('the load guard still forces through an unclear cast (anti-deadlock)', () => {
    let s = fillStage(createState(), 1);
    s = withActorMap(s, { x: { clear: false } });
    s = withQuestionCount(s, 20);
    const r = route(s);
    expect(r.decision).toBe(Decision.REQUEST_CONFIRMATION);
    expect(r.reason).toBe('load_guard');
  });
});

// ─── 3. Soft threshold: ~80% at 2 is enough ─────────────────────────────────
describe('Soft threshold', () => {
  it('advances when 4/5 slots at 2 and 1 at 1', () => {
    let s = createState();
    s = fillStage(s, 1, 2);
    // Drop one to 1 — still 80%
    s = { ...s, coverage: { ...s.coverage, stage1: { ...s.coverage.stage1, timeline: 1 } } };
    s = withSaturation(s);
    expect(route(s).decision).toBe(Decision.REQUEST_CONFIRMATION);
  });

  it('needs two quiet turns, not one', () => {
    let s = createState();
    s = fillStage(s, 1, 2);
    s = { ...s, coverage: { ...s.coverage, stage1: { ...s.coverage.stage1, timeline: 1 } } };
    expect(route(withSaturation(s, 1)).decision).toBe(Decision.STAY);
  });

  it('3/4 is under the threshold on a four-slot stage', () => {
    let s = createState();
    s = { ...s, meta: { ...s.meta, currentStage: 2 } };
    s = { ...s, coverage: { ...s.coverage, stage2: { causal: 2, meaning: 2, wound: 1, adhd_pattern: 2 } } };
    expect(route(withSaturation(s)).decision).toBe(Decision.STAY);
  });

  it('stays when only 60% at 2', () => {
    let s = createState();
    // 3/5 at 2, 2/5 at 1 → 60% < 80%
    s = { ...s, coverage: { ...s.coverage, stage1: {
      trigger: 2, timeline: 2, actors: 2, status: 1, auto_reaction: 1
    }}};
    s = withSaturation(s);
    expect(route(s).decision).toBe(Decision.STAY);
  });
});

// ─── 4. Load guard ───────────────────────────────────────────────────────────
describe('Load guard', () => {
  it('triggers at 20 questions on incomplete, unsaturated coverage', () => {
    let s = createState();
    // Partial coverage (not full, not saturated) so only the load guard can fire.
    s = { ...s, coverage: { ...s.coverage, stage1: { ...s.coverage.stage1, trigger: 1 } } };
    s = withQuestionCount(s, 20);
    const r = route(s);
    expect(r.decision).toBe(Decision.REQUEST_CONFIRMATION);
    expect(r.reason).toBe('load_guard');
  });

  // The limit is the number, not "some number": one question short still holds.
  // Hard-coded on purpose — Think Twice's values live in its pack now, and a test
  // that read them back from the pack would follow any edit (questions-for-natali §1).
  it('holds at 19 questions', () => {
    let s = createState();
    s = { ...s, coverage: { ...s.coverage, stage1: { ...s.coverage.stage1, trigger: 1 } } };
    expect(route(withQuestionCount(s, 19)).decision).toBe(Decision.STAY);
  });

  it('stage 5 holds at 14 questions', () => {
    let s = createState();
    s = { ...s, meta: { ...s.meta, currentStage: 5, questionCount: 14 } };
    s = fillStage(s, 2);
    s = { ...s, coverage: { ...s.coverage, stage5: { ...s.coverage.stage5, perspective: 1 } } };
    expect(route(s).decision).toBe(Decision.STAY);
  });

  it('stage 5 load guard triggers at 15 questions', () => {
    let s = createState();
    s = { ...s, meta: { ...s.meta, currentStage: 5, questionCount: 15 } };
    s = fillStage(s, 2); // satisfy stage-5 dependency
    // Partial stage-5 coverage so only the load guard can fire (not full coverage).
    s = { ...s, coverage: { ...s.coverage, stage5: { ...s.coverage.stage5, perspective: 1 } } };
    const r = route(s);
    expect(r.decision).toBe(Decision.REQUEST_CONFIRMATION);
    expect(r.reason).toBe('load_guard');
  });
});

// ─── 5. Confirmation flow ────────────────────────────────────────────────────
describe('Confirmation flow', () => {
  // Since 24.10.2026 (Ran) nobody confirms a summary: the turn that decides a
  // transition carries it out — advanceStage, with the Router's own decision.
  it('advanceStage moves to the decided stage and resets the counters', () => {
    let s = createState();
    s = fillStage(s, 1);
    s = withSaturation(s);
    const d = route(s);
    expect(d.decision).toBe(Decision.REQUEST_CONFIRMATION);
    const advanced = advanceStage(s, d);
    expect(advanced.meta.currentStage).toBe(2);
    expect(advanced.meta.questionCount).toBe(0);
    expect(advanced.meta.saturationCount).toBe(0);
    expect(advanced.meta.kpi.questionsPerStage.stage1).toBe(s.meta.questionCount);
    expect(advanced.meta.decisionLog.at(-1)).toMatchObject({ decision: Decision.ADVANCE, reason: 'summarized', stage: 1 });
    expect(advanced.meta).not.toHaveProperty('awaitingConfirmation');
  });

  it('a file saved while the old shell waited for a confirmation is simply decided again', () => {
    let s = createState();
    s = fillStage(s, 1);
    s = withSaturation(s);
    s = { ...s, meta: { ...s.meta, awaitingConfirmation: true, pendingNextStage: 2 } };
    expect(route(s).decision).toBe(Decision.REQUEST_CONFIRMATION);
  });

  // The exported function keeps its own promise: never past the last stage, never
  // backwards (that is REOPEN's job). route() hands over no such stage today.
  it('advanceStage honours nextStage only inside the pack and ahead of the current stage', () => {
    const at = (n) => { const s = createState(); return { ...s, meta: { ...s.meta, currentStage: n } }; };
    expect(advanceStage(at(2), { nextStage: 9 }).meta.currentStage).toBe(3);
    expect(advanceStage(at(3), { nextStage: 2 }).meta.currentStage).toBe(4);
    expect(advanceStage(at(2), { nextStage: 5 }).meta.currentStage).toBe(5);
    const last = advanceStage(at(7), { nextStage: 9 });
    expect(last.meta.currentStage).toBe(7);
    expect(last.meta.sessionComplete).toBe(true);
  });

  // A question that strayed on the very turn that closes the stage: kept, the
  // correction would tell the next stage's interviewer it is still in the old one.
  it('advanceStage clears a stray question recorded on the closing turn', () => {
    let s = createState();
    s = fillStage(s, 1);
    s = { ...s, meta: { ...s.meta, offStage: { asked: 'stage2.causal', stage: 'stage1' } } };
    const d = route(s);
    expect(d.decision).toBe(Decision.REQUEST_CONFIRMATION);
    expect(advanceStage(s, d).meta.offStage).toBeNull();
    const closing = { ...s, meta: { ...s.meta, currentStage: 7 } };
    expect(advanceStage(closing, { nextStage: null }).meta.offStage).toBeNull();
  });
});

// ─── 6. Dependency: stage 5 requires stage 2 ────────────────────────────────
describe('Dependency: stage 5 requires stage 2', () => {
  it('blocks stage 5 when stage 2 not satisfied', () => {
    let s = createState();
    s = { ...s, meta: { ...s.meta, currentStage: 4 } };
    s = fillStage(s, 4);
    s = withSaturation(s);
    // stage 2 NOT filled → dependency fails. Strict: this test used to accept
    // REQUEST_CONFIRMATION as well, so deleting the dependency could never fail it.
    const r = route(s);
    expect(r).toEqual({ decision: Decision.STAY, reason: 'dependency_not_met' });
  });

  it('allows stage 5 when stage 2 is satisfied', () => {
    let s = createState();
    s = { ...s, meta: { ...s.meta, currentStage: 4 } };
    s = fillStage(s, 2); // satisfy dependency
    s = fillStage(s, 4);
    s = withSaturation(s);
    expect(route(s).decision).toBe(Decision.REQUEST_CONFIRMATION);
  });

  // Stage 7 requires stage 6 exhausted (transition protocol: "שלב 7 דורש את שלב 6").
  // The load guard cannot buy past it: 2/3 at 2 is under 0.8.
  // NOTE: with a legitimate U in stage 6 this is a dead end — the guard never
  // overrides a dependency. Known as docs/next-version-changes.md ‏D; this test pins
  // the dependency, and changes deliberately when D is fixed.
  it('blocks stage 7 while stage 6 falls short, even at the load guard', () => {
    let s = createState();
    s = { ...s, meta: { ...s.meta, currentStage: 6, questionCount: 20 } };
    s = { ...s, coverage: { ...s.coverage, stage6: { alternatives: 2, zero_action: 2, alt_from_transform: 1 } } };
    expect(route(s)).toEqual({ decision: Decision.STAY, reason: 'dependency_not_met' });
  });

  it('stage 6 → 7 does not require a goal (goal gates the board, not entry)', () => {
    let s = createState();
    s = { ...s, meta: { ...s.meta, currentStage: 6 } };
    s = fillStage(s, 6);
    s = withSaturation(s);
    const r = route(s);
    expect(r.decision).toBe(Decision.REQUEST_CONFIRMATION);
    expect(r.nextStage).toBe(7);
  });
});

// ─── 7. Unidirectional 6→7 (board shown, no revert to production) ───────────
describe('Unidirectional 6→7', () => {
  it('once in stage 7, router does not go back to 6', () => {
    let s = createState();
    s = { ...s, meta: { ...s.meta, currentStage: 7 } };
    s = { ...s, coverage: { ...s.coverage, stage7: { goal: 0, board_presented: 0, sharp_decision: 0, package_test: 0 } } };
    const r = route(s);
    // Should show board or stay — never advance backwards
    expect([Decision.SHOW_BOARD, Decision.STAY]).toContain(r.decision);
  });
});

// ─── 8. Re-open: dropping a slot ────────────────────────────────────────────
describe('Re-open', () => {
  it('evaluateStage soft threshold fails when 2 slots drop to 1 (3/5 = 60%)', () => {
    let s = createState();
    s = fillStage(s, 1, 2);
    // Drop two slots — 3/5 = 60% < 80% threshold
    s = { ...s, coverage: { ...s.coverage, stage1: {
      ...s.coverage.stage1, trigger: 1, timeline: 1
    }}};
    const { softThresholdMet } = evaluateStage(s.coverage, 1);
    expect(softThresholdMet).toBe(false);
  });

  it('evaluateStage soft threshold passes at exactly 80% (4/5)', () => {
    let s = createState();
    s = fillStage(s, 1, 2);
    // Drop one slot — 4/5 = 80% = exactly at threshold
    s = { ...s, coverage: { ...s.coverage, stage1: { ...s.coverage.stage1, trigger: 1 } } };
    const { softThresholdMet } = evaluateStage(s.coverage, 1);
    expect(softThresholdMet).toBe(true); // 4/5 meets the >= 0.8 threshold
  });
});

// ─── 9. Safety stop ─────────────────────────────────────────────────────────
describe('Safety stop', () => {
  it('safety flag overrides everything', () => {
    let s = createState();
    s = fillStage(s, 1);
    s = withSaturation(s);
    s = { ...s, meta: { ...s.meta, safetyFlag: true } };
    expect(route(s).decision).toBe(Decision.SAFETY_STOP);
  });
});

// ─── 10. Stage 7 board and session complete ──────────────────────────────────
describe('Stage 7 closure', () => {
  it('shows board when goal known and board not yet presented', () => {
    let s = createState();
    s = { ...s, basket: [{ text: 'לדבר איתו מחר' }], meta: { ...s.meta, currentStage: 7 } };
    s = { ...s, coverage: { ...s.coverage, stage7: { goal: 2, board_presented: 0, sharp_decision: 0, package_test: 0 } } };
    expect(route(s).decision).toBe(Decision.SHOW_BOARD);
  });

  // router-guard, 16.10.2026: an empty basket sends the person back to gathering
  // only where nothing guaranteed the options were gathered. Think Twice's stage 7
  // requires stage 6, so its routing is what it always was.
  it('still shows the board in Think Twice, whose decision requires the options stage', () => {
    let s = createState();
    s = { ...s, meta: { ...s.meta, currentStage: 7 } };
    s = { ...s, coverage: { ...s.coverage, stage7: { goal: 2, board_presented: 0, sharp_decision: 0, package_test: 0 } } };
    expect(route(s).decision).toBe(Decision.SHOW_BOARD);
  });

  it('returns session complete when sharp decision + package test at 2', () => {
    let s = createState();
    s = { ...s, meta: { ...s.meta, currentStage: 7 } };
    s = { ...s, coverage: { ...s.coverage, stage7: { goal: 2, board_presented: 2, sharp_decision: 2, package_test: 2 } } };
    expect(route(s).decision).toBe(Decision.SESSION_COMPLETE);
  });

  it('does not complete on a vague decision even with slots at 2', () => {
    let s = createState();
    s = { ...s, meta: { ...s.meta, currentStage: 7, kpi: { ...s.meta.kpi, decisionType: 'vague' } } };
    s = { ...s, coverage: { ...s.coverage, stage7: { goal: 2, board_presented: 2, sharp_decision: 2, package_test: 2 } } };
    expect(route(s).decision).not.toBe(Decision.SESSION_COMPLETE);
  });

  it('completes on a structured deferral with slots at 2', () => {
    let s = createState();
    s = { ...s, meta: { ...s.meta, currentStage: 7, kpi: { ...s.meta.kpi, decisionType: 'structured_deferral' } } };
    s = { ...s, coverage: { ...s.coverage, stage7: { goal: 2, board_presented: 2, sharp_decision: 2, package_test: 2 } } };
    expect(route(s).decision).toBe(Decision.SESSION_COMPLETE);
  });
});

// ─── 12. Either-or merge: stage 7 → 6 re-open ───────────────────────────────
describe('Either-or merge', () => {
  it('a real merge re-opens production (stage 6)', () => {
    let s = createState();
    s = { ...s, meta: { ...s.meta, currentStage: 7, mergeAttempt: 'real' } };
    s = { ...s, coverage: { ...s.coverage, stage7: { goal: 2, board_presented: 2, sharp_decision: 0, package_test: 0 } } };
    const r = route(s);
    expect(r.decision).toBe(Decision.REOPEN);
    expect(r.targetStage).toBe(6);
  });

  it('an avoidance merge does not re-open — model reflects exclusivity', () => {
    let s = createState();
    s = { ...s, meta: { ...s.meta, currentStage: 7, mergeAttempt: 'avoidance' } };
    s = { ...s, coverage: { ...s.coverage, stage7: { goal: 2, board_presented: 2, sharp_decision: 0, package_test: 0 } } };
    expect(route(s).decision).toBe(Decision.STAY);
  });
});

// ─── 11. State integrity: facts never lost ───────────────────────────────────
describe('State integrity', () => {
  it('slot updates do not erase other slots', () => {
    let s = createState();
    s = { ...s, coverage: { ...s.coverage, stage1: { ...s.coverage.stage1, trigger: 2 } } };
    s = { ...s, coverage: { ...s.coverage, stage1: { ...s.coverage.stage1, timeline: 2 } } };
    expect(s.coverage.stage1.trigger).toBe(2);
    expect(s.coverage.stage1.timeline).toBe(2);
  });
});
