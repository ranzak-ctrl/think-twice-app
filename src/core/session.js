// Session orchestration — one interview turn, as portable core (no UI).
// This is the heart of the loop: safety -> prompt -> model -> parse -> state
// update -> Router -> follow-up synthesis (summary / board). The UI is a thin
// wrapper around runTurn(); the same function runs headless in sims and, later,
// on a server. THE ROUTER DECIDES TRANSITIONS — runTurn only applies them.

import { route, Decision } from './router.js';
import {
  buildSystemPrompt,
  buildSummaryPrompt,
  buildBoardPrompt,
  formatHistory,
} from './promptBuilder.js';
import { complete } from '../adapters/model.js';
import { preCheck } from '../safety/index.js';

const PARSE_FALLBACK = 'שגיאה בעיבוד התשובה. נסה שוב.';

// Process a single user message against (state, history).
// Returns { nextState, reply, decision } — the caller owns the history array.
export async function runTurn(state, history, userText) {
  // Safety pre-check — an acute-distress mention stops the interview safely.
  const check = preCheck(userText);
  if (!check.safe) {
    return {
      nextState: { ...state, meta: { ...state.meta, safetyFlag: true } },
      reply: check.stopMessage,
      decision: Decision.SAFETY_STOP,
    };
  }

  const stage = state.meta.currentStage;
  const currentHistory = [...history, { role: 'user', content: userText }];
  const messages = formatHistory(currentHistory);
  const result = await complete({
    stage,
    systemPrompt: buildSystemPrompt({ stage, state }),
    messages,
  });

  let nextState = { ...state };
  const ev = result.evaluation ?? {};

  // Slot updates for the current stage.
  if (ev.slots) {
    const stageKey = `stage${stage}`;
    nextState = {
      ...nextState,
      coverage: {
        ...nextState.coverage,
        [stageKey]: { ...nextState.coverage[stageKey], ...ev.slots },
      },
    };
  }

  // Counters + per-turn signals.
  const newInfo = ev.newInfo !== false;
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
        contradiction: !!ev.flagContradiction,
      },
    },
  };

  // Stage 6: accumulate generated alternatives into the basket (deduped).
  if (ev.alternatives?.length) {
    const current = nextState.basket ?? [];
    const seen = new Set(current.map((b) => b.text));
    const added = ev.alternatives
      .filter((t) => typeof t === 'string' && t.trim() && !seen.has(t.trim()))
      .map((t) => ({ text: t.trim() }));
    if (added.length) nextState = { ...nextState, basket: [...current, ...added] };
  }

  // Stage 7: sharpness classification (KPI; a vague decision never closes).
  if (ev.decisionType) {
    nextState = {
      ...nextState,
      meta: { ...nextState.meta, kpi: { ...nextState.meta.kpi, decisionType: ev.decisionType } },
    };
  }

  // Emotion intensity (1-10) for the delta KPI: stage 3 baseline vs stage 5.
  if (typeof ev.emotionIntensity === 'number') {
    const kpiKey =
      nextState.meta.currentStage === 3
        ? 'emotionIntensityStage3'
        : nextState.meta.currentStage === 5
        ? 'emotionIntensityStage5'
        : null;
    if (kpiKey) {
      nextState = {
        ...nextState,
        meta: { ...nextState.meta, kpi: { ...nextState.meta.kpi, [kpiKey]: ev.emotionIntensity } },
      };
    }
  }

  // Stage 7: capture the chosen option and its package (gain/cost) into state.
  if (ev.decision) {
    nextState = { ...nextState, decision: { ...nextState.decision, ...ev.decision } };
  }

  // The code decides transitions, never the model.
  const decision = route(nextState);
  let reply = result.message ?? PARSE_FALLBACK;

  if (decision.decision === Decision.REQUEST_CONFIRMATION) {
    nextState = {
      ...nextState,
      meta: { ...nextState.meta, awaitingConfirmation: true, pendingNextStage: decision.nextStage },
    };
    const summaryResult = await complete({
      stage: nextState.meta.currentStage,
      systemPrompt: buildSummaryPrompt({ state: nextState }),
      messages,
      mode: 'summary',
    });
    reply =
      (summaryResult.ok && summaryResult.message) ||
      'בוא נוודא שהבנתי נכון — עברנו על מה שקרה עד כאן. זה מדויק?';
  }

  if (decision.decision === Decision.SHOW_BOARD) {
    const boardResult = await complete({
      stage: 7,
      systemPrompt: buildBoardPrompt({ state: nextState }),
      messages,
      mode: 'board',
    });
    nextState = {
      ...nextState,
      board: boardResult.evaluation?.board ?? [],
      coverage: {
        ...nextState.coverage,
        stage7: { ...nextState.coverage.stage7, board_presented: 2 },
      },
    };
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
        mergeAttempt: null,
      },
      coverage: {
        ...nextState.coverage,
        stage7: { ...nextState.coverage.stage7, board_presented: 0 },
      },
    };
  }

  if (decision.decision === Decision.SESSION_COMPLETE) {
    nextState = { ...nextState, meta: { ...nextState.meta, sessionComplete: true } };
  }

  return { nextState, reply, decision: decision.decision };
}
