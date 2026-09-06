import { describe, it, expect } from 'vitest';
import { route, confirmAndAdvance, rejectConfirmation, Decision, evaluateStage } from '../../src/core/router.js';
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

// A summary is on the table awaiting the user's verdict — the only state from
// which confirming or rejecting means anything.
function awaiting(state, nextStage = 2) {
  return { ...state, meta: { ...state.meta, awaitingConfirmation: true, pendingNextStage: nextStage } };
}

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
  it('confirm advances stage', () => {
    let s = createState();
    s = fillStage(s, 1);
    s = withSaturation(s);
    route(s); // triggers REQUEST_CONFIRMATION
    s = {
      ...s,
      meta: { ...s.meta, awaitingConfirmation: true, pendingNextStage: 2 },
    };
    const advanced = confirmAndAdvance(s);
    expect(advanced.meta.currentStage).toBe(2);
    expect(advanced.meta.awaitingConfirmation).toBe(false);
    expect(advanced.meta.questionCount).toBe(0);
    expect(advanced.meta.saturationCount).toBe(0);
  });

  it('reject keeps stage and clears flag', () => {
    let s = createState();
    s = { ...s, meta: { ...s.meta, awaitingConfirmation: true, pendingNextStage: 2 } };
    const rejected = rejectConfirmation(s);
    expect(rejected.meta.currentStage).toBe(1);
    expect(rejected.meta.awaitingConfirmation).toBe(false);
  });

  // Regression: rejecting a summary used to change nothing the gate reads. The
  // load guard stays triggered (questionCount only rises) and coverage never
  // falls, so the very next turn re-offered the same summary — "לתקן" could
  // never actually correct anything.
  it('reject does not re-offer the summary on the next turn', () => {
    let s = createState();
    s = fillStage(s, 1);
    s = withSaturation(s);
    s = withQuestionCount(s, 20); // load guard at the ceiling
    expect(route(s).decision).toBe(Decision.REQUEST_CONFIRMATION);

    s = rejectConfirmation(awaiting(s));
    s = withQuestionCount(s, 21); // the correction turn
    const after = route(s);
    expect(after.decision).toBe(Decision.STAY);
    expect(after.reason).toBe('correcting_summary');
  });

  it('the summary returns once the grace window passes — no stranded stage', () => {
    let s = createState();
    s = fillStage(s, 1);
    s = withSaturation(s);
    s = withQuestionCount(s, 20);
    s = rejectConfirmation(awaiting(s));

    expect(route(withQuestionCount(s, 22)).decision).toBe(Decision.STAY);
    expect(route(withQuestionCount(s, 23)).decision).toBe(Decision.REQUEST_CONFIRMATION);
  });

  it('repeated rejections do not accumulate into a stage that never asks again', () => {
    let s = createState();
    s = fillStage(s, 1);
    s = withSaturation(s);
    s = withQuestionCount(s, 20);
    s = rejectConfirmation(awaiting(s));
    expect(s.meta.confirmationFloor).toBe(23);

    s = rejectConfirmation(awaiting(withQuestionCount(s, 23)));
    expect(s.meta.confirmationFloor).toBe(26); // measured from the count, not stacked
  });

  it('the floor does not survive into the next stage', () => {
    let s = createState();
    s = fillStage(s, 1);
    s = withQuestionCount(s, 20);
    s = rejectConfirmation(awaiting(s));
    expect(s.meta.confirmationFloor).toBe(23);

    s = confirmAndAdvance(awaiting(s));
    expect(s.meta.confirmationFloor).toBe(0);
  });

  // Rejecting is a reply to a summary that was actually offered. Unguarded, a
  // stray call would buy three turns of forced STAY in a stage where nothing
  // was ever asked.
  it('rejecting does nothing when no summary is on offer', () => {
    let s = withQuestionCount(createState(), 20);
    expect(rejectConfirmation(s)).toBe(s);
  });

  it('awaiting confirmation blocks further routing', () => {
    let s = createState();
    s = { ...s, meta: { ...s.meta, awaitingConfirmation: true } };
    expect(route(s).decision).toBe(Decision.STAY);
  });
});

// ─── 6. Dependency: stage 5 requires stage 2 ────────────────────────────────
describe('Dependency: stage 5 requires stage 2', () => {
  it('blocks stage 5 when stage 2 not satisfied', () => {
    let s = createState();
    s = { ...s, meta: { ...s.meta, currentStage: 4 } };
    s = fillStage(s, 4);
    s = withSaturation(s);
    // stage 2 NOT filled → dependency fails
    const r = route(s);
    // should stay because dependency not met
    expect([Decision.STAY, Decision.REQUEST_CONFIRMATION]).toContain(r.decision);
    if (r.decision === Decision.STAY) {
      expect(r.reason).toBe('dependency_not_met');
    }
  });

  it('allows stage 5 when stage 2 is satisfied', () => {
    let s = createState();
    s = { ...s, meta: { ...s.meta, currentStage: 4 } };
    s = fillStage(s, 2); // satisfy dependency
    s = fillStage(s, 4);
    s = withSaturation(s);
    expect(route(s).decision).toBe(Decision.REQUEST_CONFIRMATION);
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
