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

    // Gap-management (Build 1): graded consistency records keyed by target.
    // 1..10 measure (10 consistent / 5 ambiguous / 1 contradiction); behind the
    // scenes — never surfaced to the user. docs/gap-management-implementation.md.
    gaps: { byTarget: {}, log: [] },

    coverage: {
      stage1: { trigger: 0, timeline: 0, actors: 0, status: 0, auto_reaction: 0 },
      stage2: { causal: 0, meaning: 0, wound: 0, adhd_pattern: 0 },
      stage3: { emotion: 0, intensity: 0, past_echo: 0 },
      stage4: { auto_reaction: 0, planned_reaction: 0 },
      stage5: { perspective: 0, intention: 0, alt_formulation: 0, re_emotion: 0 },
      stage6: { alternatives: 0, zero_action: 0, alt_from_transform: 0 },
      stage7: { goal: 0, board_presented: 0, sharp_decision: 0, package_test: 0 },
    },

    // Per-slot findings (guide-mode display) — short textual info items the model
    // extracts per slot, accumulated parallel to coverage and keyed stageN.slot.
    // Sparse: a slot appears only once it has findings. Observability ONLY — the
    // model proposes content; the Router still decides transitions from coverage
    // scores, never from findings. See addFindings below.
    findings: {},

    // Actor map (מפת שחקנים) — stage-1 resolved cast, keyed by id. Each entry:
    // { label, role, relation, clear }. The model maintains one coherent cast; the
    // CODE derives the `actors` slot score from its clarity and the Router refuses
    // to advance stage 1 while any actor is unclear (transition-protocol §1: "מפת
    // שחקנים — לכל דמות תפקיד ברור"). See setActorMap / deriveActorsScore below.
    actorMap: {},

    meta: {
      currentStage: 1,
      questionCount: 0,        // questions asked in current stage
      saturationCount: 0,      // consecutive turns with no new info
      questionAperture: 'open', // 'open' | 'closed'
      resistanceFlag: null,    // 'avoidance' | 'flight' | 'overflow' | 'cynicism'
      // Last-turn fatigue / engagement signals reported by the model. Display-only
      // for now — the Router does NOT read these (see docs/questions-for-natali.md §1).
      signals: { overflow: false, avoidance: false, flight: false, cynicism: false, contradiction: false },
      savedThreads: [],        // topics user drifted to — may contain useful info
      decisionLog: [],         // recent Router decisions (guide mode) — capped
      mergeAttempt: null,      // stage-7 either-or: 'real' | 'avoidance' | null (transient)
      awaitingConfirmation: false,
      safetyFlag: false,
      sessionComplete: false,
      // Real-API token tally. `inputTokens` is the UNCACHED remainder once prompt
      // caching is on; cache buckets bill at different rates and are kept apart.
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        calls: 0,
      },
      kpi: {
        emotionIntensityStage3: null,
        emotionIntensityStage5: null,
        decisionType: null,    // 'sharp' | 'structured_deferral' | 'vague'
        differsFromAutomatic: null, // does the decision differ from the gut reaction?
        selfRefs: 0,           // running count of first-person markers (יחס אני/הוא)
        otherRefs: 0,          // running count of third-person markers
        questionsPerStage: {}, // { stage1: n, ... } recorded as stages close
      },
    },
  };
}

// Router decision log (guide mode) — keep the last few decisions for the panel.
export const DECISION_LOG_MAX = 8;
export function appendDecisionLog(log, entry) {
  return [...(log ?? []), entry].slice(-DECISION_LOG_MAX);
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

// ── Per-slot findings (guide-mode display) ──
// The model reports short textual findings per slot; the CODE accumulates them
// parallel to coverage. Append + dedupe, capped and length-limited. Findings are
// observability only — they NEVER drive the Router (transitions read coverage
// scores). Keep the most recent when the cap is reached.
export const FINDINGS_PER_SLOT_MAX = 12;
const FINDING_MAX_LEN = 140;

export function addFindings(state, stageKey, slotKey, items) {
  const incoming = (Array.isArray(items) ? items : [])
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean)
    .map((s) => (s.length > FINDING_MAX_LEN ? s.slice(0, FINDING_MAX_LEN) : s));
  if (!incoming.length) return state;

  const findings = state.findings ?? {};
  const stageFindings = findings[stageKey] ?? {};
  const existing = stageFindings[slotKey] ?? [];
  const seen = new Set(existing);
  const merged = [...existing];
  for (const item of incoming) {
    if (!seen.has(item)) {
      seen.add(item);
      merged.push(item);
    }
  }
  if (merged.length === existing.length) return state; // nothing new
  return {
    ...state,
    findings: {
      ...findings,
      [stageKey]: { ...stageFindings, [slotKey]: merged.slice(-FINDINGS_PER_SLOT_MAX) },
    },
  };
}

// ── Actor map (מפת שחקנים) — stage-1 resolved cast ──
// The model reports DELTAS (new/changed characters this turn), not the full cast —
// re-emitting the whole cast every turn was the main latency cost. The CODE MERGES
// by id and derives the `actors` slot score from clarity (the gate). A character that
// is ambiguous or contradicted (clear:false) keeps actors below 2, and the Router
// refuses to advance stage 1 while it stands. Model proposes; the code owns the gate.
export const ACTOR_ACTIONS_MAX = 12;

export function mergeActorMap(state, reported) {
  const byId = { ...(state.actorMap ?? {}) };
  for (const a of Array.isArray(reported) ? reported : []) {
    const label = typeof a?.label === 'string' ? a.label.trim() : '';
    const id = typeof a?.id === 'string' && a.id.trim() ? a.id.trim() : label;
    if (!id) continue;
    const prev = byId[id] ?? { label: '', role: '', relation: '', clear: true, actions: [] };
    // Append only this turn's new actions (deduped) — the model sends deltas.
    const incoming = Array.isArray(a?.actions)
      ? a.actions.map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean)
      : [];
    const actions = [...prev.actions];
    for (const act of incoming) if (!actions.includes(act)) actions.push(act);
    byId[id] = {
      label: label || prev.label,
      role: typeof a?.role === 'string' && a.role.trim() ? a.role.trim() : prev.role,
      relation: typeof a?.relation === 'string' && a.relation.trim() ? a.relation.trim() : prev.relation,
      // null (unspecified this turn) keeps the prior value; new actors default to clear.
      clear: typeof a?.clear === 'boolean' ? a.clear : prev.clear,
      actions: actions.slice(0, ACTOR_ACTIONS_MAX),
    };
  }
  return { ...state, actorMap: byId };
}

// Derive the `actors` slot score from the cast: empty → 0 (untouched), any unclear
// character → 1 (partial), every character clear → 2. Honest coverage that also
// makes fullCoverage fail on a muddled cast.
export function deriveActorsScore(actorMap) {
  const entries = Object.values(actorMap ?? {});
  if (entries.length === 0) return 0;
  return entries.every((a) => a.clear) ? 2 : 1;
}

// True when at least one character is explicitly unclear/contradicted — the Router
// reads this to refuse a stage-1 advance.
export function hasUnclearActor(actorMap) {
  return Object.values(actorMap ?? {}).some((a) => a && a.clear === false);
}

// ── Gap-management (Build 1): consistency measure + asterisk (כוכבית) ──
// The model reports a point observation { target, dimension, level, note }; the
// CODE owns the record (status, counters, history). Build 1 scope = record + star
// + resolve + re-open of a resolved target. Escalation / goal-gate is Build 2.
// docs/gap-management-implementation.md §2, §4.

export const GAP_DEFAULTS = { T_star: 5, T_resolved: 8 };

function clampLevel(level) {
  if (typeof level !== 'number' || Number.isNaN(level)) return null;
  return Math.min(10, Math.max(1, Math.round(level)));
}

// Normalize a reported target into a stable key + descriptor.
// slot → "stage{N}.{slot}" · topic/entity → "topic:{label}" / "entity:{label}".
export function normalizeTarget(rawTarget) {
  const t = String(rawTarget ?? '').trim();
  if (!t) return null;
  const slot = t.match(/^stage(\d+)\.([a-z_]+)$/i);
  if (slot) {
    const key = `stage${slot[1]}.${slot[2]}`;
    return { key, target: { kind: 'slot', stage: Number(slot[1]), slot: slot[2], label: key } };
  }
  const tagged = t.match(/^(topic|entity):(.+)$/);
  if (tagged) {
    const label = tagged[2].trim();
    if (!label) return null;
    return { key: `${tagged[1]}:${label}`, target: { kind: tagged[1], label } };
  }
  return { key: `topic:${t}`, target: { kind: 'topic', label: t } }; // bare label → topic
}

function withGap(state, gaps, key, record, logEntry) {
  return {
    ...state,
    gaps: {
      byTarget: { ...gaps.byTarget, [key]: record },
      log: [...gaps.log, { targetKey: key, ...logEntry }],
    },
  };
}

// Apply one model observation to the gap records. Returns a new state.
// One record per targetKey — a new observation always updates, never duplicates.
export function recordGapObservation(state, observation, turn, thresholds) {
  const { T_star, T_resolved } = { ...GAP_DEFAULTS, ...thresholds };
  const level = clampLevel(observation?.level);
  const norm = normalizeTarget(observation?.target);
  if (level == null || !norm) return state; // unusable observation

  const { key, target } = norm;
  const dimension = observation?.dimension ?? 'factual';
  const note = typeof observation?.note === 'string' ? observation.note.trim() : '';
  const gaps = state.gaps ?? { byTarget: {}, log: [] };
  const existing = gaps.byTarget[key];

  // First sighting: only open a record if it is actually a gap (≤ T_star).
  if (!existing) {
    if (level > T_star) return state; // consistent enough — ignore
    const record = {
      target, dimension, level, status: 'starred',
      firstTurn: turn, lastTurn: turn, touches: 0,
      history: [{ turn, level }], note,
    };
    return withGap(state, gaps, key, record, { turn, level, delta: null, action: 'star' });
  }

  // Re-touch of an existing record.
  let status = existing.status;
  let action = 'update';
  if (level >= T_resolved) {
    if (existing.status !== 'resolved') action = 'resolve';
    status = 'resolved';
  } else if (existing.status === 'resolved' && level <= T_star) {
    status = 'starred'; // re-open — contradicting info on a settled target
    action = 'reopen';
  }
  const record = {
    ...existing,
    level, status,
    lastTurn: turn,
    touches: existing.touches + 1,
    history: [...existing.history, { turn, level }],
    note: note || existing.note,
  };
  return withGap(state, gaps, key, record, { turn, level, delta: level - existing.level, action });
}

// Export / import (deep clone via JSON round-trip).
export function exportState(state) {
  return JSON.stringify(state, null, 2);
}

export function importState(json) {
  const parsed = JSON.parse(json);
  // New exports wrap the document as { exportedAt, history, state }; older
  // exports are the StateDocument itself.
  const state = parsed.state ?? parsed;
  if (!state.coverage || !state.meta) {
    throw new Error('Invalid state document: missing coverage or meta');
  }
  // Back-compat: older exports predate gap-management / findings / actor map.
  return {
    ...state,
    gaps: state.gaps ?? { byTarget: {}, log: [] },
    findings: state.findings ?? {},
    actorMap: state.actorMap ?? {},
  };
}
