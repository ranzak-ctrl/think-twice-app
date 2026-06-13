// Router — deterministic state machine.
// Input: StateDocument. Output: RouterDecision.
// THE LLM NEVER CALLS THIS. This module decides all stage transitions.

export const Decision = {
  STAY: 'stay',
  REQUEST_CONFIRMATION: 'requestConfirmation', // show summary, wait for user
  ADVANCE: 'advance',                          // confirmed — move to next stage
  REOPEN: 'reopen',                            // contradicting info — drop slot
  SHOW_BOARD: 'showBoard',                     // stage 7: present decision board
  SAFETY_STOP: 'safetyStop',
  SESSION_COMPLETE: 'sessionComplete',
};

const SOFT_THRESHOLD = 0.8;
const SATURATION_LIMIT = 2;
// TEMPORARY BACKSTOP — not the real mechanism. Counting questions is the wrong
// proxy for user load (see docs/questions-for-natali.md §1): it can't tell a long
// rich story from an overwhelmed user. To be replaced by a fatigue detector that
// weighs story complexity + engagement. Kept numeric (not emptied) because it is
// currently the ONLY guarantee a stage can transition when saturation never fires;
// removing it would strand stages. Set deliberately high so it rarely fires —
// do not treat 20/15 as clinically validated.
const LOAD_GUARD_DEFAULT = 20;
const LOAD_GUARD_STAGE5 = 15;

const CORE_SLOTS = {
  1: ['trigger', 'timeline', 'actors', 'status', 'auto_reaction'],
  2: ['causal', 'meaning', 'wound', 'adhd_pattern'],
  3: ['emotion', 'intensity', 'past_echo'],
  4: ['auto_reaction', 'planned_reaction'],
  5: ['perspective', 'intention', 'alt_formulation', 're_emotion'],
  6: ['alternatives', 'zero_action', 'alt_from_transform'],
  7: ['goal', 'board_presented', 'sharp_decision', 'package_test'],
};

const STAGE_KEY = (n) => `stage${n}`;

// Returns { allAtLeastOne, softThresholdMet, missingSlots }
export function evaluateStage(coverage, stage) {
  const slots = coverage[STAGE_KEY(stage)] ?? {};
  const cores = CORE_SLOTS[stage];

  const missingSlots = cores.filter(
    (k) => (slots[k] ?? 0) === 0
  );
  const allAtLeastOne = missingSlots.length === 0;

  const atTwo = cores.filter((k) => slots[k] === 2).length;
  const softThresholdMet = allAtLeastOne && atTwo / cores.length >= SOFT_THRESHOLD;

  return { allAtLeastOne, softThresholdMet, missingSlots };
}

function dependenciesMet(coverage, targetStage) {
  if (targetStage === 5) {
    return evaluateStage(coverage, 2).softThresholdMet;
  }
  if (targetStage === 7) {
    const stage6ok = evaluateStage(coverage, 6).softThresholdMet;
    const hasGoal = (coverage.stage7?.goal ?? 0) >= 1;
    return stage6ok && hasGoal;
  }
  return true;
}

export function route(state) {
  const { meta, coverage } = state;
  const {
    currentStage,
    saturationCount,
    questionCount,
    awaitingConfirmation,
    safetyFlag,
    sessionComplete,
  } = meta;

  if (safetyFlag) return { decision: Decision.SAFETY_STOP };
  if (sessionComplete) return { decision: Decision.SESSION_COMPLETE };

  // Hold until user confirms summary
  if (awaitingConfirmation) {
    return { decision: Decision.STAY, reason: 'awaiting_confirmation' };
  }

  // Stage 7: show board as soon as goal is known and board not yet shown
  if (currentStage === 7) {
    const s7 = coverage.stage7 ?? {};
    if (!s7.board_presented && (s7.goal ?? 0) >= 1) {
      return { decision: Decision.SHOW_BOARD };
    }
    // Session complete when sharp decision + package test both at 2
    if (s7.sharp_decision === 2 && s7.package_test === 2) {
      return { decision: Decision.SESSION_COMPLETE };
    }
    return { decision: Decision.STAY };
  }

  // Load guard
  const limit = currentStage === 5 ? LOAD_GUARD_STAGE5 : LOAD_GUARD_DEFAULT;
  const loadGuardTriggered = questionCount >= limit;

  // Saturation
  const saturated = saturationCount >= SATURATION_LIMIT;

  // Evaluate stage coverage
  const { softThresholdMet } = evaluateStage(coverage, currentStage);

  const readyToAdvance =
    (softThresholdMet && saturated) || loadGuardTriggered;

  if (readyToAdvance && currentStage < 7) {
    const nextStage = currentStage + 1;
    if (!dependenciesMet(coverage, nextStage)) {
      return { decision: Decision.STAY, reason: 'dependency_not_met' };
    }
    return {
      decision: Decision.REQUEST_CONFIRMATION,
      nextStage,
      reason: loadGuardTriggered ? 'load_guard' : 'exhausted',
    };
  }

  return { decision: Decision.STAY };
}

// Called when user clicks "מדויק" (confirm summary)
export function confirmAndAdvance(state) {
  const { meta } = state;
  if (!meta.awaitingConfirmation) return state;
  return {
    ...state,
    meta: {
      ...meta,
      currentStage: meta.pendingNextStage ?? meta.currentStage + 1,
      pendingNextStage: null,
      awaitingConfirmation: false,
      questionCount: 0,
      saturationCount: 0,
    },
  };
}

// Called when user clicks "לתקן" (fix summary)
export function rejectConfirmation(state) {
  return {
    ...state,
    meta: {
      ...state.meta,
      awaitingConfirmation: false,
      pendingNextStage: null,
    },
  };
}
