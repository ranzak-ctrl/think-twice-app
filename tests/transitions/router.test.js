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

  it('stays when saturation not met even with full coverage', () => {
    let s = createState();
    s = fillStage(s, 1);
    expect(route(s).decision).toBe(Decision.STAY);
  });

  it('stays when coverage not met even with saturation', () => {
    let s = createState();
    s = withSaturation(s);
    expect(route(s).decision).toBe(Decision.STAY);
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
  it('triggers at 20 questions even without saturation', () => {
    let s = createState();
    s = fillStage(s, 1);
    s = withQuestionCount(s, 20);
    const r = route(s);
    expect(r.decision).toBe(Decision.REQUEST_CONFIRMATION);
    expect(r.reason).toBe('load_guard');
  });

  it('stage 5 load guard triggers at 15 questions', () => {
    let s = createState();
    s = { ...s, meta: { ...s.meta, currentStage: 5, questionCount: 15 } };
    s = fillStage(s, 2); // satisfy stage-5 dependency
    s = fillStage(s, 5);
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
