// Router — deterministic state machine.
// Input: StateDocument. Output: RouterDecision.
// THE LLM NEVER CALLS THIS. This module decides all stage transitions.

import { appendDecisionLog, hasUnclearActor } from './state.js';

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
// Turns bought by rejecting a summary. Without it the gate that produced the
// summary is still open on the next turn — questionCount only rises, coverage
// never falls — so "לתקן" re-offered the same summary immediately and the user
// could never correct anything. Bounded on purpose: questionCount always
// climbs, so the floor is always crossed and no stage can strand behind it.
// INTERIM VALUE — how long a correction takes is interview pace, and the
// transition protocol has no rejection branch to read it off: it defines the
// confirmation gate and says nothing about what follows "לתקן". Filed as
// docs/questions-for-natali.md §13. Same family as the load guard (§1) but not
// covered by it. Not clinically validated; changing it is this one line.
const REJECT_GRACE = 3;

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
  const fullCoverage = atTwo === cores.length;

  return { allAtLeastOne, softThresholdMet, fullCoverage, missingSlots };
}

function dependenciesMet(coverage, targetStage) {
  if (targetStage === 5) {
    return evaluateStage(coverage, 2).softThresholdMet;
  }
  if (targetStage === 7) {
    // Stage 6 must be exhausted. The goal gates the BOARD (see SHOW_BOARD below),
    // not entry into stage 7 — it is elicited as the first stage-7 question, so it
    // cannot be a precondition for getting there.
    return evaluateStage(coverage, 6).softThresholdMet;
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
    // Either-or: a real (actionable) merge is the only path back from convergence
    // to production — re-open stage 6 (Transition Protocol §7ה, §5).
    if (meta.mergeAttempt === 'real') {
      return { decision: Decision.REOPEN, targetStage: 6, reason: 'merge' };
    }
    if (!s7.board_presented && (s7.goal ?? 0) >= 1) {
      return { decision: Decision.SHOW_BOARD };
    }
    // Session complete when sharp decision + package test both at 2
    // A vague decision never closes the session (Transition Protocol §7, מבחן החדות).
    const vague = meta.kpi?.decisionType === 'vague';
    if (!vague && s7.sharp_decision === 2 && s7.package_test === 2) {
      return { decision: Decision.SESSION_COMPLETE };
    }
    return { decision: Decision.STAY };
  }

  // Load guard
  const limit = currentStage === 5 ? LOAD_GUARD_STAGE5 : LOAD_GUARD_DEFAULT;
  const loadGuardTriggered = questionCount >= limit;

  // Saturation
  const saturated = saturationCount >= SATURATION_LIMIT;

  // Evaluate stage coverage. Full coverage (every core slot at 2) advances on its
  // own — the stage's job is done, so we don't wait for a saturation signal that a
  // rich, detailed story may never produce (see docs/questions-for-natali.md §1).
  const { softThresholdMet, fullCoverage } = evaluateStage(coverage, currentStage);

  // Actor-map gate (stage 1): never advance on a muddled cast. While any character
  // is unclear/contradicted, the normal coverage paths are blocked — only the load
  // guard (anti-deadlock backstop) can still force through. transition-protocol §1
  // ("מפת שחקנים — לכל דמות תפקיד ברור"); Ran's principle: no advance on unclear facts.
  const actorsClearEnough = !(currentStage === 1 && hasUnclearActor(state.actorMap));
  const coverageReady = fullCoverage || (softThresholdMet && saturated);

  const readyToAdvance = (coverageReady && actorsClearEnough) || loadGuardTriggered;

  if (readyToAdvance && currentStage < 7) {
    const nextStage = currentStage + 1;
    // Checked before the floor: both produce STAY, but a missing dependency is a
    // structural fact and the floor is a transient one. Reporting the transient
    // reason would hide the durable blocker from the guide trail.
    if (!dependenciesMet(coverage, nextStage)) {
      return { decision: Decision.STAY, reason: 'dependency_not_met' };
    }
    // The user rejected the last summary and is still inside the grace window —
    // hold whatever reopened the gate (load guard, full coverage or saturation)
    // and let the correction land first.
    if (questionCount < (meta.confirmationFloor ?? 0)) {
      return { decision: Decision.STAY, reason: 'correcting_summary' };
    }
    return {
      decision: Decision.REQUEST_CONFIRMATION,
      nextStage,
      reason: loadGuardTriggered ? 'load_guard' : saturated ? 'exhausted' : 'full_coverage',
    };
  }

  // Coverage was ready but the cast is unclear — hold and keep clarifying (guide trail).
  if (currentStage === 1 && coverageReady && !actorsClearEnough && !loadGuardTriggered) {
    return { decision: Decision.STAY, reason: 'actors_unclear' };
  }

  return { decision: Decision.STAY };
}

// Resistance protocol — the Router sets the question aperture based on detected
// resistance signals (principle-zero §4.3). Priority: overflow > flight > avoidance
// > cynicism. Returns { resistanceFlag, questionAperture } where questionAperture
// is null when no override is needed (model's own recommendation stands).
export function resolveResistance(signals) {
  if (signals.overflow) {
    return { resistanceFlag: 'overflow', questionAperture: 'open' };
  }
  if (signals.flight) {
    return { resistanceFlag: 'flight', questionAperture: 'closed' };
  }
  if (signals.avoidance) {
    return { resistanceFlag: 'avoidance', questionAperture: 'open' };
  }
  if (signals.cynicism) {
    return { resistanceFlag: 'cynicism', questionAperture: null };
  }
  return { resistanceFlag: null, questionAperture: null };
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
      // The new stage starts from zero, so a floor left over from a rejection in
      // the stage that just closed would silently suppress its first summary.
      confirmationFloor: 0,
      // KPI: record the closing stage's question count before it resets.
      kpi: {
        ...meta.kpi,
        questionsPerStage: {
          ...(meta.kpi?.questionsPerStage ?? {}),
          [`stage${meta.currentStage}`]: meta.questionCount,
        },
      },
      decisionLog: appendDecisionLog(meta.decisionLog, {
        decision: Decision.ADVANCE,
        reason: 'confirmed',
        stage: meta.currentStage,
      }),
    },
  };
}

// Called when user clicks "לתקן" (fix summary)
export function rejectConfirmation(state) {
  const { meta } = state;
  // Same guard as confirmAndAdvance. Harmless while this only cleared two
  // already-false flags; now that it writes routing state, a stray call would
  // buy three turns of forced STAY in a stage that never offered a summary.
  if (!meta.awaitingConfirmation) return state;
  return {
    ...state,
    meta: {
      ...meta,
      awaitingConfirmation: false,
      pendingNextStage: null,
      // Push the gate out past the correction. Measured from the current count
      // rather than added to any previous floor, so repeated rejections cannot
      // accumulate into a stage that never offers a summary again.
      confirmationFloor: meta.questionCount + REJECT_GRACE,
      decisionLog: appendDecisionLog(meta.decisionLog, {
        decision: Decision.STAY,
        reason: 'summary_rejected',
        stage: meta.currentStage,
      }),
    },
  };
}
