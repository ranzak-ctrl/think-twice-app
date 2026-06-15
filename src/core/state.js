// StateDocument — single source of truth for an interview session.
// No UI or platform dependencies; serializable to JSON for export/import.

export const SLOT_UNKNOWN = 'U';

export function createState() {
  return {
    facts: {},
    thoughts: {},   // includes wound (מוגלה) and ADHD pattern tag
    feelings: {},   // emotion name + intensity + past echo
    reactions: {},  // automatic + planned
    basket: [],     // alternative responses (stage 6)
    board: [],      // decision board rows (stage 7, built from basket)
    decision: {},   // { type, choice, rationale, package_gain, package_cost }

    coverage: {
      stage1: { trigger: 0, timeline: 0, actors: 0, status: 0, auto_reaction: 0 },
      stage2: { causal: 0, meaning: 0, wound: 0, adhd_pattern: 0 },
      stage3: { emotion: 0, intensity: 0, past_echo: 0 },
      stage4: { auto_reaction: 0, planned_reaction: 0 },
      stage5: { perspective: 0, intention: 0, alt_formulation: 0, re_emotion: 0 },
      stage6: { alternatives: 0, zero_action: 0, alt_from_transform: 0 },
      stage7: { goal: 0, board_presented: 0, sharp_decision: 0, package_test: 0 },
    },

    meta: {
      currentStage: 1,
      questionCount: 0,        // questions asked in current stage
      saturationCount: 0,      // consecutive turns with no new info
      questionAperture: 'open', // 'open' | 'closed'
      resistanceFlag: null,    // 'avoidance' | 'flight' | 'overflow' | 'cynicism'
      // Last-turn fatigue / engagement signals reported by the model. Display-only
      // for now — the Router does NOT read these (see docs/questions-for-natali.md §1).
      signals: { overflow: false, avoidance: false, flight: false, contradiction: false },
      savedThreads: [],        // topics user drifted to — may contain useful info
      mergeAttempt: null,      // stage-7 either-or: 'real' | 'avoidance' | null (transient)
      awaitingConfirmation: false,
      safetyFlag: false,
      sessionComplete: false,
      usage: { inputTokens: 0, outputTokens: 0, calls: 0 }, // real-API token tally
      kpi: {
        emotionIntensityStage3: null,
        emotionIntensityStage5: null,
        decisionType: null,    // 'sharp' | 'structured_deferral' | 'vague'
        differsFromAutomatic: null,
      },
    },
  };
}

// Immutable update helpers — always return a new state object.

export function setSlot(state, stageKey, slotKey, value) {
  return {
    ...state,
    coverage: {
      ...state.coverage,
      [stageKey]: {
        ...state.coverage[stageKey],
        [slotKey]: value,
      },
    },
  };
}

export function updateMeta(state, patch) {
  return { ...state, meta: { ...state.meta, ...patch } };
}

export function updateFacts(state, patch) {
  return { ...state, facts: { ...state.facts, ...patch } };
}

export function updateThoughts(state, patch) {
  return { ...state, thoughts: { ...state.thoughts, ...patch } };
}

export function updateFeelings(state, patch) {
  return { ...state, feelings: { ...state.feelings, ...patch } };
}

export function updateReactions(state, patch) {
  return { ...state, reactions: { ...state.reactions, ...patch } };
}

export function addToBasket(state, option) {
  return { ...state, basket: [...state.basket, option] };
}

export function setBoard(state, rows) {
  return { ...state, board: rows };
}

export function setDecision(state, decisionData) {
  return { ...state, decision: { ...state.decision, ...decisionData } };
}

// Re-open: drop a slot back to 1 when contradicting info arrives.
export function reopenSlot(state, stageKey, slotKey) {
  const current = state.coverage[stageKey]?.[slotKey] ?? 0;
  if (current <= 1) return state; // already open
  return setSlot(state, stageKey, slotKey, 1);
}

// Export / import (deep clone via JSON round-trip).
export function exportState(state) {
  return JSON.stringify(state, null, 2);
}

export function importState(json) {
  const parsed = JSON.parse(json);
  // Basic schema guard — must have coverage and meta.
  if (!parsed.coverage || !parsed.meta) {
    throw new Error('Invalid state document: missing coverage or meta');
  }
  return parsed;
}
