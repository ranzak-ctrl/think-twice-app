// Session orchestration — one interview turn, as portable core (no UI).
// This is the heart of the loop: safety -> prompt -> model -> parse -> state
// update -> Router -> follow-up synthesis (summary / board). The UI is a thin
// wrapper around runTurn(); the same function runs headless in sims and, later,
// on a server. THE ROUTER DECIDES TRANSITIONS — runTurn only applies them.

import { route, Decision, resolveResistance } from './router.js';
import { runRegistrar } from './registrar.js';
import {
  buildSystemPromptParts,
  buildRegistrarPrompt,
  buildSummaryPrompt,
  buildSummaryMessages,
  buildOpenerPrompt,
  buildOpenerMessages,
  buildBoardPrompt,
  formatHistory,
} from './promptBuilder.js';
import { signpostForStage } from '../content/signposting.js';
import { countSelfOther } from './kpi.js';
// Everything this loop knows about the interview's shape — which "stageN.slot"
// references are real, where the cast is gated, which stage decides, where
// intensity is measured — it asks the pack. Until 10.10.2026 it was written for
// Think Twice's seven stages (plan, phase 1 slice 3).
import { stageAt, stageWith, hasComponent, slotIds, parseSlotRef, castOf, intensityKey } from './pack.js';
import {
  appendDecisionLog,
  recordGapObservation,
  addFindings,
  setMapLabel,
  mergeActorMap,
  mergeOpenForks,
  mergeEdges,
  mergeGroups,
  mergeNodes,
  deriveActorsScore,
} from './state.js';
import { preCheck } from '../safety/index.js';

const PARSE_FALLBACK = 'שגיאה בעיבוד התשובה. נסה שוב.';

const EMPTY_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  calls: 0,
};

// Coverage level as a number for progress comparison ('U' is a terminal value).
function slotLevel(v) {
  if (v === 'U') return 2;
  return typeof v === 'number' ? v : 0;
}

// Accumulate a model call's token usage (real API only; the mock returns none).
// `inputTokens` is the uncached remainder once prompt caching is on; the cache
// buckets are billed at different multipliers, so they are tallied separately
// rather than folded into the input total.
function addUsage(acc, u) {
  if (!u) return acc;
  return {
    inputTokens: acc.inputTokens + (u.input_tokens ?? 0),
    outputTokens: acc.outputTokens + (u.output_tokens ?? 0),
    cacheWriteTokens:
      (acc.cacheWriteTokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    cacheReadTokens: (acc.cacheReadTokens ?? 0) + (u.cache_read_input_tokens ?? 0),
    calls: acc.calls + 1,
  };
}

// The engine's three dependencies, injected rather than imported (principle 4):
// the interview's pack, its texts, and the model call. This module used to import
// the browser's model adapter, which reads Vite's import.meta.env, and that tied
// the turn loop to the bundler. createEngine (engine.js) validates them once and
// binds them; this only stops a direct caller that forgot one.
function requireDeps(deps, who) {
  const { pack, prompts, complete } = deps ?? {};
  if (!pack || !prompts || typeof complete !== 'function') {
    throw new Error(`${who} needs { pack, prompts, complete } — compose an engine with createEngine`);
  }
  return { pack, prompts, complete };
}

// Process a single user message against (state, history).
// Returns { nextState, reply, decision } — the caller owns the history array.
// `deps` is { pack, prompts, complete }; a shell gets it bound by createEngine.
export async function runTurn(state, history, userText, deps) {
  // Safety pre-check — an acute-distress mention stops the interview safely.
  const check = preCheck(userText);
  if (!check.safe) {
    return {
      nextState: {
        ...state,
        meta: {
          ...state.meta,
          safetyFlag: true,
          decisionLog: appendDecisionLog(state.meta.decisionLog, {
            decision: Decision.SAFETY_STOP,
            reason: 'acute_distress',
            stage: state.meta.currentStage,
          }),
        },
      },
      reply: check.stopMessage,
      decision: Decision.SAFETY_STOP,
    };
  }

  // After the safety check, never before it: the stop needs nothing injected, and
  // an acute-distress message must reach it even from a caller that composed the
  // engine wrong (router-guard, 8.10.2026).
  const { pack, prompts, complete } = requireDeps(deps, 'runTurn');

  const stage = state.meta.currentStage;
  const currentHistory = [...history, { role: 'user', content: userText }];
  const turn = currentHistory.filter((m) => m.role === 'user').length; // monotonic turn index
  const messages = formatHistory(currentHistory);
  let usage = state.meta.usage ?? EMPTY_USAGE;

  // ── THE REGISTRAR GOES FIRST, AND THAT ORDER IS THE POINT ──
  // Ran's cycle, 18.9.2026: "the registrar hands the story to the interviewer › the
  // interviewer decides the next question › the new information goes back to the
  // registrar › the registrar hands over the UPDATED story". So the fold happens
  // before the probe, and the interviewer's prompt is built from the state the
  // registrar just wrote. Running the two in parallel would hand the interviewer
  // the story as of the previous turn — cheaper by one call's latency, and wrong:
  // the next question should be asked about the picture that includes what the
  // person just said.
  //
  // Switched on (REGISTRAR_ENABLED in promptBuilder.js); buildRegistrarPrompt
  // returns '' when it is off, and this call is then a no-op. A registrar failure
  // never costs the person their turn — runRegistrar returns the state untouched
  // and the interview proceeds without the assembled story.
  const registrar = await runRegistrar({
    state,
    stage,
    messages,
    systemPrompt: buildRegistrarPrompt({ state, prompts, pack }),
    completeImpl: complete,
    turn,
    pack,
  });
  usage = addUsage(usage, registrar.usage);
  const probeState = registrar.state;

  const result = await complete({
    stage,
    // Built from the registrar's state, not the turn's opening state — this is
    // where the serial order actually pays.
    // The split form, so the adapter can cache the unchanging half. buildSystemPrompt
    // still returns the joined text for anything that wants one string.
    systemPrompt: buildSystemPromptParts({ stage, state: probeState, prompts, pack }),
    messages,
  });
  usage = addUsage(usage, result.usage);

  // The proxy rejected the shared access password. Nothing about the interview
  // happened, so nothing in the StateDocument moves — no counters, no saturation,
  // no question count. The turn is handed back for the UI to ask for the password
  // and retry, and the person's own message is not consumed by a locked door.
  if (result.unauthorized) {
    return {
      nextState: { ...state, meta: { ...state.meta, usage: usage ?? state.meta.usage } },
      reply: result.message,
      unauthorized: true,
      decision: null,
    };
  }

  // Everything below builds on what the registrar wrote, not on the turn's opening
  // state. While inert the two are the same object's contents, so nothing moves.
  let nextState = { ...probeState };
  const ev = result.evaluation ?? {};

  // Slot updates. Bare slot names → the current stage (set as reported). Cross-stage
  // keys ("stageN.slot", N a stage of this pack) let the model capture info that
  // belongs to a later stage as it surfaces — pre-seeded to level 1 only; the owning
  // stage still explores it to 2 (Ran, 21.6). A slot the stage does not have is
  // ignored, here or in another stage (test-plan §א item 4). It used to be written
  // into the current stage as a key of its own — a hallucinated "stage8.x", or with
  // fewer stages any reference past the last one — and, read as progress, it reset
  // the saturation count (router-guard F4, 10.10.2026).
  const currentKey = stageAt(pack, stage).key;
  const currentSlots = slotIds(stageAt(pack, stage));
  if (ev.slots && Object.keys(ev.slots).length) {
    let coverage = nextState.coverage;
    for (const [rawKey, value] of Object.entries(ev.slots)) {
      const ref = parseSlotRef(pack, rawKey);
      const stageKey = ref ? ref.key : currentKey;
      const slot = ref ? ref.slot : rawKey;
      if (stageKey === currentKey) {
        if (!currentSlots.includes(slot)) continue; // unknown slot — ignore
        coverage = { ...coverage, [stageKey]: { ...coverage[stageKey], [slot]: value } };
      } else {
        const stageSlots = coverage[stageKey];
        if (!stageSlots || !(slot in stageSlots)) continue; // unknown slot — ignore
        if (typeof value !== 'number' || value < 1) continue; // ignore 0 / 'U' / junk
        coverage = {
          ...coverage,
          [stageKey]: { ...stageSlots, [slot]: Math.max(stageSlots[slot] ?? 0, 1) },
        };
      }
    }
    nextState = { ...nextState, coverage };
  }

  // Per-slot findings (guide-mode display): fold the model's textual findings into
  // state, parallel to slots. Bare names → current stage; "stageN.slot" → that stage.
  // Guarded to known slots. Observability only — findings never affect the Router.
  if (ev.slotFindings && Object.keys(ev.slotFindings).length) {
    for (const [rawKey, items] of Object.entries(ev.slotFindings)) {
      const ref = parseSlotRef(pack, rawKey);
      const stageKey = ref ? ref.key : currentKey;
      const slot = ref ? ref.slot : rawKey;
      if (!nextState.coverage[stageKey] || !(slot in nextState.coverage[stageKey])) continue;
      nextState = addFindings(nextState, stageKey, slot, items);
    }
  }

  // Map labels: the short name for each slot's cube on the story map. Routed the
  // same way as findings — bare names to the current stage, "stageN.slot" to that
  // stage — and guarded to known slots. Display only; the Router never reads them.
  if (ev.mapLabels && Object.keys(ev.mapLabels).length) {
    for (const [rawKey, label] of Object.entries(ev.mapLabels)) {
      const ref = parseSlotRef(pack, rawKey);
      const stageKey = ref ? ref.key : currentKey;
      const slot = ref ? ref.slot : rawKey;
      if (!nextState.coverage[stageKey] || !(slot in nextState.coverage[stageKey])) continue;
      nextState = setMapLabel(nextState, stageKey, slot, label, pack);
    }
  }

  // Actor map (מפת שחקנים): the model reports the full resolved cast; the code
  // replaces the stored map and DERIVES the cast's slot from its clarity (overriding
  // whatever the model put in that slot). A muddled cast can't reach 2, so the
  // Router won't advance the gated stage on it. The stage and the slot are the
  // pack's castClarity component — stage 1 and `actors` in Think Twice. The
  // interviewer's map is merged only on that stage; the derivation below runs on
  // every turn. The code decides.
  // The cast is the REGISTRAR's (applyRegistrar merges it at any stage, which is
  // what unfreezes it past the gated stage). This path stays for as long as the
  // interviewer still reports a cast too; once `actor_map` leaves evaluator.md,
  // this block goes with it.
  const cast = castOf(pack);
  if (cast && stage === cast.stage && ev.actorMap) nextState = mergeActorMap(nextState, ev.actorMap);

  // The derivation runs on EVERY turn once a cast exists, whoever reported it and
  // whatever the stage — not only on a turn that carried an actor_map. The model
  // scores the cast slot every turn (evaluator.md) and the slot loop above writes
  // that number, so a turn with no actor_map used to leave the model's number
  // standing over the cast, even over what the registrar derived this very turn
  // (router-guard F5a, 10.10.2026). CLAUDE.md: "לא מהמספר שהמודל מדווח".
  // An EMPTY cast is the one exception, and it is open: the model's number stands
  // until someone is on the map — questions-for-natali §15.
  if (cast && Object.keys(nextState.actorMap ?? {}).length) {
    nextState = {
      ...nextState,
      coverage: {
        ...nextState.coverage,
        [cast.key]: { ...nextState.coverage[cast.key], [cast.slot]: deriveActorsScore(nextState.actorMap) },
      },
    };
  }

  // Story nodes: the things the map draws. Merged at any stage and NOT routed to
  // the current stage the way findings are — each node names its own slot, because
  // material belonging to stage 3 routinely surfaces in stage 1 and the map draws
  // it where it belongs rather than where the interview happens to be standing.
  if (ev.nodes) nextState = mergeNodes(nextState, ev.nodes, pack);

  // Story edges: the relations between the case's entities. Merged at any stage —
  // an edge routinely joins a beat in one stage to a beat in another, which is also
  // why gating on them is not the same problem as gating on the actor map
  // (questions-for-natali §10). Display only; the Router never reads them.
  if (ev.edges) nextState = mergeEdges(nextState, ev.edges, pack);

  // Containers: groups of nodes drawn as a box around them. Display only, like
  // the edges — the Router never reads them.
  if (ev.groups) nextState = mergeGroups(nextState, ev.groups, pack);

  // Open forks (פיצולים לא-מוכרעים): what the STORY left undecided. Merged in at any
  // stage — unlike the actor map this is not stage-1 only, because a story can leave
  // something open anywhere in it. Observability + display; the Router never reads
  // these, so a fork can never stall or advance a stage. Natali, 29.8.2026.
  if (ev.openForks) nextState = mergeOpenForks(nextState, ev.openForks);

  // Counters + per-turn signals. Saturation tracks real coverage progress, not the
  // model's "new_info" self-report (which over-reports — Ran, live testing: saturation
  // stuck at 0). A turn that raised no current-stage slot counts toward saturation —
  // the stage's own slots, as the pack lists them, and nothing else.
  const beforeCov = state.coverage[currentKey] ?? {};
  const afterCov = nextState.coverage[currentKey] ?? {};
  const newInfo = currentSlots.some((k) => slotLevel(afterCov[k]) > slotLevel(beforeCov[k]));
  nextState = {
    ...nextState,
    meta: {
      ...nextState.meta,
      questionCount: nextState.meta.questionCount + 1,
      saturationCount: newInfo ? 0 : nextState.meta.saturationCount + 1,
      mergeAttempt: ev.mergeAttempt ?? null,
      signals: {
        overflow: !!ev.flagOverflow,
        avoidance: !!ev.flagAvoidance,
        flight: !!ev.flagFlight,
        cynicism: !!ev.flagCynicism,
        contradiction: !!ev.flagContradiction,
      },
    },
  };

  // Gap-management: fold each consistency observation into the gap records
  // (behind the scenes — the user never sees this). state.js owns the lifecycle.
  for (const obs of ev.gapObservations ?? []) {
    nextState = recordGapObservation(nextState, obs, turn);
  }

  // Self/other reference ratio KPI — accumulate over the user's words this turn.
  const refs = countSelfOther(userText);
  nextState = {
    ...nextState,
    meta: {
      ...nextState.meta,
      kpi: {
        ...nextState.meta.kpi,
        selfRefs: (nextState.meta.kpi.selfRefs ?? 0) + refs.self,
        otherRefs: (nextState.meta.kpi.otherRefs ?? 0) + refs.other,
      },
    },
  };

  // Resistance protocol: Router sets aperture based on detected signals.
  const resistance = resolveResistance(nextState.meta.signals);
  const modelAperture = ev.questionAperture ?? 'open';
  nextState = {
    ...nextState,
    meta: {
      ...nextState.meta,
      resistanceFlag: resistance.resistanceFlag,
      questionAperture: resistance.questionAperture ?? modelAperture,
    },
  };

  // Save drifted topics when flight is detected (may contain useful info).
  if (ev.flagFlight && ev.driftedTopic) {
    const threads = nextState.meta.savedThreads ?? [];
    const already = threads.some((t) => t.topic === ev.driftedTopic);
    if (!already) {
      nextState = {
        ...nextState,
        meta: {
          ...nextState.meta,
          savedThreads: [...threads, { topic: ev.driftedTopic, stage }],
        },
      };
    }
  }

  // The collector (Think Twice: stage 6): accumulate generated alternatives into
  // the basket (deduped).
  if (ev.alternatives?.length) {
    const current = nextState.basket ?? [];
    const seen = new Set(current.map((b) => b.text));
    const added = ev.alternatives
      .filter((t) => typeof t === 'string' && t.trim() && !seen.has(t.trim()))
      .map((t) => ({ text: t.trim() }));
    if (added.length) nextState = { ...nextState, basket: [...current, ...added] };
  }

  // The decision (Think Twice: stage 7): sharpness classification (KPI; a vague
  // decision never closes).
  if (ev.decisionType) {
    nextState = {
      ...nextState,
      meta: { ...nextState.meta, kpi: { ...nextState.meta.kpi, decisionType: ev.decisionType } },
    };
  }

  // The decision: change measure (מדד שינוי) — did it diverge from the gut reaction?
  if (typeof ev.differsFromAutomatic === 'boolean') {
    nextState = {
      ...nextState,
      meta: {
        ...nextState.meta,
        kpi: { ...nextState.meta.kpi, differsFromAutomatic: ev.differsFromAutomatic },
      },
    };
  }

  // Emotion intensity (1-10) for the delta KPI, recorded only while standing in a
  // stage that carries the intensity component — Think Twice: stage 3 baseline
  // against stage 5.
  const measuring = nextState.meta.currentStage;
  if (typeof ev.emotionIntensity === 'number' && hasComponent(stageAt(pack, measuring), 'intensity')) {
    nextState = {
      ...nextState,
      meta: { ...nextState.meta, kpi: { ...nextState.meta.kpi, [intensityKey(measuring)]: ev.emotionIntensity } },
    };
  }

  // The decision: capture the chosen option and its package (gain/cost) into state.
  if (ev.decision) {
    nextState = { ...nextState, decision: { ...nextState.decision, ...ev.decision } };
  }

  // The code decides transitions, never the model.
  const decision = route(nextState, pack);
  let reply = result.message ?? PARSE_FALLBACK;
  // The stage that decides — where the board is shown and the session closes. One
  // per pack, and always the last (validatePack). Think Twice: stage 7.
  const decisionStage = stageWith(pack, 'decision');
  const decisionKey = stageAt(pack, decisionStage).key;

  if (decision.decision === Decision.REQUEST_CONFIRMATION) {
    const summaryResult = await complete({
      stage: nextState.meta.currentStage,
      systemPrompt: buildSummaryPrompt({ state: nextState, prompts, pack }),
      // Anchor with the model's probe + an explicit "summarize now" turn so the reply
      // is a recap, not a continuation of the dialogue (the dissonance Ran hit).
      messages: buildSummaryMessages(messages, result.message),
      mode: 'summary',
    });
    usage = addUsage(usage, summaryResult.usage);
    if (summaryResult.ok && summaryResult.message) {
      nextState = {
        ...nextState,
        meta: { ...nextState.meta, awaitingConfirmation: true, pendingNextStage: decision.nextStage },
      };
      reply = summaryResult.message;
    } else {
      // Summary generation failed (e.g., rate limit). Don't enter a content-free
      // confirmation — stay; the Router re-requests the summary next turn. (Ran.)
      reply = summaryResult.message || 'רגע — לא הצלחתי לסכם כרגע, ננסה שוב עוד מעט.';
    }
  }

  if (decision.decision === Decision.SHOW_BOARD) {
    const boardResult = await complete({
      stage: decisionStage,
      systemPrompt: buildBoardPrompt({ state: nextState, prompts, pack }),
      messages,
      mode: 'board',
    });
    nextState = {
      ...nextState,
      board: boardResult.evaluation?.board ?? [],
      coverage: {
        ...nextState.coverage,
        [decisionKey]: { ...nextState.coverage[decisionKey], board_presented: 2 },
      },
    };
    usage = addUsage(usage, boardResult.usage);
    reply = (boardResult.ok && boardResult.message) || 'הנה האפשרויות שאספנו. במה אתה בוחר?';
  }

  if (decision.decision === Decision.REOPEN) {
    nextState = {
      ...nextState,
      meta: {
        ...nextState.meta,
        currentStage: decision.targetStage ?? nextState.meta.currentStage,
        questionCount: 0,
        saturationCount: 0,
        // The floor is a threshold ON questionCount, so the two only mean
        // anything as a pair — zeroing one without the other would pin the
        // reopened stage in STAY for a full grace window, past the load guard,
        // which could not fire because the floor sits above it.
        confirmationFloor: 0,
        mergeAttempt: null,
      },
      coverage: {
        ...nextState.coverage,
        [decisionKey]: { ...nextState.coverage[decisionKey], board_presented: 0 },
      },
    };
    // Anchored Re-open opener: the question must explain why we returned and tie to
    // what the user just raised (core-assumptions §2). currentHistory already ends on
    // the user's turn, so no confirmation nudge is appended.
    const opener = await completeStageOpener(nextState, currentHistory, {
      situation: reopenSituation(decision),
    }, deps);
    usage = addUsage(usage, opener.usage);
    reply = opener.message;
  }

  if (decision.decision === Decision.SESSION_COMPLETE) {
    nextState = {
      ...nextState,
      meta: {
        ...nextState.meta,
        sessionComplete: true,
        kpi: {
          ...nextState.meta.kpi,
          questionsPerStage: {
            ...nextState.meta.kpi.questionsPerStage,
            [decisionKey]: nextState.meta.questionCount,
          },
        },
      },
    };
  }

  // Record the decision for the guide-mode trail.
  nextState = {
    ...nextState,
    meta: {
      ...nextState.meta,
      decisionLog: appendDecisionLog(nextState.meta.decisionLog, {
        decision: decision.decision,
        reason: decision.reason ?? '',
        stage,
      }),
    },
  };

  nextState = { ...nextState, meta: { ...nextState.meta, usage } };
  // `failure` is technical metadata for the error report (null on a good turn).
  // The adapter builds it and carries no interview content in it — see
  // describeUpstream in model.js and principle 6.
  return { nextState, reply, decision: decision.decision, failure: result.failure ?? null };
}

// Low-level opener: produce the opening message + the raw usage of the call. The
// first question of the (re-)opened stage must DEPART FROM the user's own words
// (anchored in the story just told), not a generic prompt. `opts.situation` frames a
// Re-open. Falls back to the static signpost if generation is unavailable (mock / no
// key / API error). The code still owns the transition; this only phrases the question.
async function completeStageOpener(state, history, opts = {}, deps) {
  const { pack, prompts, complete } = requireDeps(deps, 'completeStageOpener');
  const stage = state.meta.currentStage;
  const result = await complete({
    stage,
    systemPrompt: buildOpenerPrompt({ stage, state, situation: opts.situation, prompts, pack }),
    // Must end with a user turn (no assistant prefill); buildOpenerMessages appends
    // the user's confirmation only when the history ends on an assistant turn.
    messages: buildOpenerMessages(formatHistory(history)),
    mode: 'opener',
  });
  const message = result.ok && result.message ? result.message : signpostForStage(stage, pack);
  // A failed opener falls back to the static signpost, which looks like a normal
  // turn on screen. Without this the degradation is invisible — exactly the class
  // of silent failure the error report exists to catch.
  return { message, usage: result.usage, failure: result.failure ?? null };
}

// Forward-transition opener (called by the UI on confirm) — folds the call's usage
// into state and returns the opening message.
export async function generateStageOpener(state, history, opts = {}, deps) {
  const { message, usage, failure } = await completeStageOpener(state, history, opts ?? {}, deps);
  return {
    nextState: {
      ...state,
      meta: { ...state.meta, usage: addUsage(state.meta.usage ?? EMPTY_USAGE, usage) },
    },
    message,
    failure: failure ?? null,
  };
}

// Frame a Re-open so the opener explains why we returned to an earlier stage and
// anchors in what the user just raised. A merge always re-opens the collector
// stage (router.js), so its number is the decision's target — 6 in Think Twice.
function reopenSituation(decision) {
  if (decision.reason === 'merge') {
    return `חזרה לשלב החלופות (${decision.targetStage}): המשתמש העלה פעולת "גם וגם" ממשית וברת-ביצוע. עגן את הפתיח בפעולה שהוא העלה — הוסף אותה לסל האפשרויות והזמן אותו להמשיך לבחון חלופות. אל תתייחס לזה כסגירה.`;
  }
  return `חזרה לשלב ${decision.targetStage} כדי להשלים מידע שהתברר כחסר או סותר. עגן את הפתיח במה שעלה זה עתה, והבהר מה נשלים כאן.`;
}
