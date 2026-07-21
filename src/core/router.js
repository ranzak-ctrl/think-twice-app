// Router — deterministic state machine.
// Input: StateDocument. Output: RouterDecision.
// THE LLM NEVER CALLS THIS. This module decides all stage transitions.

import { appendDecisionLog, hasUnclearActor } from './state.js';

export const Decision = {
  STAY: 'stay',
  REQUEST_CONFIRMATION: 'requestConfirmation', // show summary, wait for user
  ADVANCE: 'advance',                          // confirmed — move to next stage
  REOPEN: 'reopen',                            // contradicting info — drop slot
  SHOW_BOARD: 'showBoard',                     // stage 8: present decision board
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
// The two "change work" stages that touch the self-image (Insight, stage 5) and
// require perspective-taking (Transform, stage 6) get a lower guard — the sensitive
// pair where a slower pace and an earlier exit are clinically preferred.
const LOAD_GUARD_SENSITIVE = 15;

const CORE_SLOTS = {
  1: ['trigger', 'timeline', 'actors', 'status', 'auto_reaction'],
  2: ['causal', 'meaning'],
  3: ['emotion', 'intensity', 'past_echo'],
  4: ['auto_reaction', 'planned_reaction'],
  5: ['wound', 'adhd_pattern'],                                  // Insight ("מה זה אומר עליי")
  6: ['perspective', 'intention', 'alt_formulation', 're_emotion'], // Transform
  7: ['alternatives', 'zero_action', 'alt_from_transform'],       // Alternatives (divergence)
  8: ['goal', 'board_presented', 'sharp_decision', 'package_test'], // Decision (convergence)
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
  // "מיפוי לפני שינוי" — entry to the change work (Insight, stage 5) requires the
  // interpretation to be mapped. Stages 1–4 are guaranteed complete by the sequential
  // advance; the interpretation gate is the explicit precondition for looking inward.
  if (targetStage === 5) {
    return evaluateStage(coverage, 2).softThresholdMet;
  }
  // Transform (stage 6, "יציאה מעצמי") leans on the wound uncovered in Insight —
  // "זה שהבשר לא בסדר לא אומר שאני לא בסדר". No alternative perspective without it.
  if (targetStage === 6) {
    return evaluateStage(coverage, 5).softThresholdMet;
  }
  if (targetStage === 8) {
    // Stage 7 (alternatives) must be exhausted. The goal gates the BOARD (see
    // SHOW_BOARD below), not entry into stage 8 — it is elicited as the first stage-8
    // question, so it cannot be a precondition for getting there.
    return evaluateStage(coverage, 7).softThresholdMet;
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

  // Stage 8: show board as soon as goal is known and board not yet shown
  if (currentStage === 8) {
    const s8 = coverage.stage8 ?? {};
    // Either-or: a real (actionable) merge is the only path back from convergence
    // to production — re-open stage 7 (alternatives) (Transition Protocol §7ה, §5).
    if (meta.mergeAttempt === 'real') {
      return { decision: Decision.REOPEN, targetStage: 7, reason: 'merge' };
    }
    if (!s8.board_presented && (s8.goal ?? 0) >= 1) {
      return { decision: Decision.SHOW_BOARD };
    }
    // Session complete when sharp decision + package test both at 2
    // A vague decision never closes the session (Transition Protocol §7, מבחן החדות).
    const vague = meta.kpi?.decisionType === 'vague';
    if (!vague && s8.sharp_decision === 2 && s8.package_test === 2) {
      return { decision: Decision.SESSION_COMPLETE };
    }
    return { decision: Decision.STAY };
  }

  // Load guard — lower ceiling on the sensitive change-work pair (Insight 5, Transform 6).
  const limit =
    currentStage === 5 || currentStage === 6 ? LOAD_GUARD_SENSITIVE : LOAD_GUARD_DEFAULT;
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

  if (readyToAdvance && currentStage < 8) {
    const nextStage = currentStage + 1;
    // Dependencies gate the NORMAL, coverage-driven advance. The load guard is an
    // anti-deadlock backstop that must always be able to transition — otherwise a
    // stage whose next-stage dependency is its OWN coverage (6←5: Transform needs the
    // wound) could strand forever, since the guard fires precisely when that coverage
    // is still incomplete. A forced load-guard advance therefore bypasses the gate.
    if (!loadGuardTriggered && !dependenciesMet(coverage, nextStage)) {
      return { decision: Decision.STAY, reason: 'dependency_not_met' };
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
  return {
    ...state,
    meta: {
      ...state.meta,
      awaitingConfirmation: false,
      pendingNextStage: null,
    },
  };
}
