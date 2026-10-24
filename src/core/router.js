// Router — deterministic state machine.
// Input: StateDocument. Output: RouterDecision.
// THE LLM NEVER CALLS THIS. This module decides all stage transitions.

import { appendDecisionLog, hasUnclearActor } from './state.js';
import {
  DEFAULT_PACK,
  stageAt,
  stageCount,
  stageKey,
  slotIds,
  stageWith,
  stageNumberOf,
  hasComponent,
} from './pack.js';

export const Decision = {
  STAY: 'stay',
  // A transition is decided. Until 24.10.2026 the shell showed the summary and
  // waited for the person to confirm it; since Ran's ruling of that day the
  // session summarizes, advances (advanceStage) and opens the next stage in the
  // same message — nobody waits. The name is kept so decision logs and exports
  // from before read the same.
  REQUEST_CONFIRMATION: 'requestConfirmation',
  ADVANCE: 'advance',                          // the stage closed on its summary — moved on
  REOPEN: 'reopen',                            // contradicting info — drop slot
  SHOW_BOARD: 'showBoard',                     // decision stage: present the board
  SAFETY_STOP: 'safetyStop',
  SESSION_COMPLETE: 'sessionComplete',
};

// The numbers this module routes by — the soft threshold, the saturation limit
// and the load guard — are the PACK's (pack.routing, and a stage's own
// `loadGuard`); Think Twice's values are in src/packs/think-twice-adult/pack.js.
// What the load guard means, and why it exists at all, stays here with the code
// that acts on it:
//
// LOAD GUARD — a TEMPORARY BACKSTOP, not the real mechanism. Counting questions is
// the wrong proxy for user load (see docs/questions-for-natali.md §1): it can't
// tell a long rich story from an overwhelmed user. To be replaced by a fatigue
// detector that weighs story complexity + engagement. Kept numeric (not emptied)
// because it is currently the ONLY guarantee a stage can transition when
// saturation never fires; removing it would strand stages. Set deliberately high
// so it rarely fires — do not treat Think Twice's 20/15 as clinically validated.
//
// (The rejection grace — turns bought by rejecting a summary — went with the
// confirmation step on 24.10.2026; docs/questions-for-natali.md §13 records it.)

// Returns { allAtLeastOne, softThresholdMet, missingSlots }
export function evaluateStage(coverage, stage, pack = DEFAULT_PACK) {
  const def = stageAt(pack, stage);
  // An unknown stage is a bug upstream, never a stage with nothing left to cover:
  // with no slots, 0 of 0 at 2 would read as full coverage and wave the interview
  // on. It threw before the pack existed (CORE_SLOTS[n] was undefined), and it
  // still does — loudly, rather than routing somewhere plausible.
  if (!def) throw new Error(`Unknown stage: ${String(stage)}`);
  const slots = coverage[stageKey(stage)] ?? {};
  const cores = slotIds(def);

  const missingSlots = cores.filter(
    (k) => (slots[k] ?? 0) === 0
  );
  const allAtLeastOne = missingSlots.length === 0;

  const atTwo = cores.filter((k) => slots[k] === 2).length;
  const softThresholdMet = allAtLeastOne && atTwo / cores.length >= pack.routing.softThreshold;
  const fullCoverage = atTwo === cores.length;

  return { allAtLeastOne, softThresholdMet, fullCoverage, missingSlots };
}

// A stage may require earlier stages to be exhausted (the pack's `requires`).
// Think Twice: stage 5 needs stage 2, and the decision stage needs stage 6 — the
// goal gates the BOARD (see SHOW_BOARD below), not entry into the decision stage;
// it is elicited as that stage's first question, so it cannot be a precondition
// for getting there.
function dependenciesMet(coverage, targetStage, pack) {
  return (stageAt(pack, targetStage)?.requires ?? []).every(
    (key) => evaluateStage(coverage, stageNumberOf(pack, key), pack).softThresholdMet
  );
}

export function route(state, pack = DEFAULT_PACK) {
  const { meta, coverage } = state;
  const {
    currentStage,
    saturationCount,
    questionCount,
    safetyFlag,
    sessionComplete,
  } = meta;

  if (safetyFlag) return { decision: Decision.SAFETY_STOP };
  if (sessionComplete) return { decision: Decision.SESSION_COMPLETE };
  // (A file saved while the old shell waited for a confirmation carries
  // `awaitingConfirmation: true`; nothing reads it any more, and the next turn
  // decides the transition again — the stage is still covered.)

  // The decision stage: show the board as soon as the goal is known and the board
  // not yet shown.
  if (hasComponent(stageAt(pack, currentStage), 'decision')) {
    const decided = coverage[stageKey(currentStage)] ?? {};
    // Either-or: a real (actionable) merge is the only path back from convergence
    // to production — re-open the collector stage (Transition Protocol §7ה, §5).
    const production = stageWith(pack, 'collector');
    if (meta.mergeAttempt === 'real' && production != null) {
      return { decision: Decision.REOPEN, targetStage: production, reason: 'merge' };
    }
    if (!decided.board_presented && (decided.goal ?? 0) >= 1) {
      // A board is built from the basket; with nothing collected there is nothing
      // to choose from, and the decision stage has no load guard to leave it by.
      // When nothing guaranteed the options were gathered — the decision stage
      // does not `require` the collector's — an empty basket sends the person
      // back to gathering instead. The parents' interview is that case: its
      // options stage can end on its guard (router-guard, 16.10.2026). Think
      // Twice requires stage 6, so its routing is unchanged.
      const gathered =
        production != null && (stageAt(pack, currentStage).requires ?? []).includes(stageKey(production));
      if (!gathered && production != null && !(state.basket ?? []).length) {
        return { decision: Decision.REOPEN, targetStage: production, reason: 'empty_basket' };
      }
      return { decision: Decision.SHOW_BOARD };
    }
    // Decided: a sharp decision (or a structured deferral) with the package test
    // passed. A vague decision never decides (Transition Protocol §7, מבחן החדות).
    const vague = meta.kpi?.decisionType === 'vague';
    if (!vague && decided.sharp_decision === 2 && decided.package_test === 2) {
      // The last stage: the decision ends the interview, as in Think Twice.
      if (currentStage === stageCount(pack)) return { decision: Decision.SESSION_COMPLETE };
      // A closing stage follows (validatePack): the decision is summarised and
      // confirmed like any stage that ends, and the interview moves on to it —
      // under the same dependency rule as every other hand-over.
      if (!dependenciesMet(coverage, currentStage + 1, pack)) {
        return { decision: Decision.STAY, reason: 'dependency_not_met' };
      }
      return { decision: Decision.REQUEST_CONFIRMATION, nextStage: currentStage + 1, reason: 'decided' };
    }
    return { decision: Decision.STAY };
  }

  // Load guard — the stage's own limit, else the pack's.
  const limit = stageAt(pack, currentStage)?.loadGuard ?? pack.routing.loadGuard;
  const loadGuardTriggered = questionCount >= limit;

  // Saturation
  const saturated = saturationCount >= pack.routing.saturationLimit;

  // Evaluate stage coverage. Full coverage (every core slot at 2) advances on its
  // own — the stage's job is done, so we don't wait for a saturation signal that a
  // rich, detailed story may never produce (see docs/questions-for-natali.md §1).
  const { softThresholdMet, fullCoverage } = evaluateStage(coverage, currentStage, pack);

  // Actor-map gate (castClarity): never advance on a muddled cast. While any character
  // is unclear/contradicted, the normal coverage paths are blocked — only the load
  // guard (anti-deadlock backstop) can still force through. transition-protocol §1
  // ("מפת שחקנים — לכל דמות תפקיד ברור"); Ran's principle: no advance on unclear facts.
  const castGated = hasComponent(stageAt(pack, currentStage), 'castClarity');
  const actorsClearEnough = !(castGated && hasUnclearActor(state.actorMap));
  const coverageReady = fullCoverage || (softThresholdMet && saturated);

  const readyToAdvance = (coverageReady && actorsClearEnough) || loadGuardTriggered;

  if (readyToAdvance && currentStage < stageCount(pack)) {
    const nextStage = currentStage + 1;
    // Checked before the floor: both produce STAY, but a missing dependency is a
    // structural fact and the floor is a transient one. Reporting the transient
    // reason would hide the durable blocker from the guide trail.
    if (!dependenciesMet(coverage, nextStage, pack)) {
      return { decision: Decision.STAY, reason: 'dependency_not_met' };
    }
    return {
      decision: Decision.REQUEST_CONFIRMATION,
      nextStage,
      reason: loadGuardTriggered ? 'load_guard' : saturated ? 'exhausted' : 'full_coverage',
    };
  }

  // The closing stage (the last one, after the decision): ready by the same
  // paths as any stage, its summary ends the interview instead of opening a
  // next stage (advanceStage, `closes`).
  if (readyToAdvance && hasComponent(stageAt(pack, currentStage), 'closing')) {
    return {
      decision: Decision.REQUEST_CONFIRMATION,
      nextStage: null,
      closes: true,
      reason: loadGuardTriggered ? 'load_guard' : saturated ? 'exhausted' : 'full_coverage',
    };
  }

  // Coverage was ready but the cast is unclear — hold and keep clarifying (guide trail).
  if (castGated && coverageReady && !actorsClearEnough && !loadGuardTriggered) {
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

// The transition the Router decided, carried out. Ran, 24.10.2026: no confirmation
// at the end of a stage — the session summarizes briefly, moves on, and the next
// stage opens with a frame and a question in the same message. So this takes the
// Router's decision ({ nextStage, closes }) directly; there is no pending state
// and nothing for the person to press. A correction from the person is an
// ordinary turn: contradicting information lowers a slot and re-opens the stage
// (Decision.REOPEN), with an opener that says why we came back.
//
// `closes` (the closing stage, after the decision) ends the interview where it
// stands. Also when there is nowhere to advance to — the interview never moves
// past its last stage: `nextStage` is honoured only inside the pack and ahead of
// the current stage; anything else means the next stage by one, or the end when
// this is the last. `route()` never hands over an out-of-range stage today, and
// an exported function keeps its own promise.
//
// A question that strayed on the closing turn (meta.offStage) is cleared: the
// correction names the stage's boundaries, and the stage has just changed — kept,
// it would tell the next stage's interviewer it is still in the old one.
export function advanceStage(state, decision = {}, pack = DEFAULT_PACK) {
  const { meta } = state;
  const n = decision.nextStage;
  const nextStage = Number.isInteger(n) && n > meta.currentStage && n <= stageCount(pack) ? n : null;
  const nowhereNext = nextStage == null && meta.currentStage >= stageCount(pack);
  if (decision.closes || nowhereNext) {
    return {
      ...state,
      meta: {
        ...meta,
        sessionComplete: true,
        offStage: null,
        kpi: {
          ...meta.kpi,
          questionsPerStage: {
            ...(meta.kpi?.questionsPerStage ?? {}),
            [`stage${meta.currentStage}`]: meta.questionCount,
          },
        },
        decisionLog: appendDecisionLog(meta.decisionLog, {
          decision: Decision.SESSION_COMPLETE,
          reason: 'summarized',
          stage: meta.currentStage,
        }),
      },
    };
  }
  return {
    ...state,
    meta: {
      ...meta,
      currentStage: nextStage ?? meta.currentStage + 1,
      questionCount: 0,
      saturationCount: 0,
      offStage: null,
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
        reason: 'summarized',
        stage: meta.currentStage,
      }),
    },
  };
}
