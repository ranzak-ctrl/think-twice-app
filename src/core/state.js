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

    // Open forks (פיצולים לא-מוכרעים) — questions the STORY leaves open, keyed by id.
    // Each: { id, question, options[], settled }. Natali, 29.8.2026: a question the
    // story itself never resolved is a FACT OF THE CASE and not a gap in what we
    // know, so unlike `gaps` this IS shown to the person. See mergeOpenForks.
    openForks: {},

    // Map labels — the one- or two-word name the model gives a slot for the cube it
    // fills on the story map, keyed stageN.slot like `findings`. Sparse; a slot has
    // one, and the newest reported wins so a correction replaces what is drawn.
    // Naming the thing a cube stands for is a judgement, which is why it comes from
    // the model and not from truncating a finding. See setMapLabel.
    mapLabels: {},

    // Story edges — the relations BETWEEN the case's entities, keyed "from→to".
    // Ran, 5.9.2026: the edges are the interviewee's, not the system's. Each:
    // { id, from, to, kind, confirmed }. See mergeEdges.
    edges: {},

    // Containers (מכלים) — a group of nodes drawn as a box around them. Two kinds
    // only, both describing the WORLD: a community someone belongs to, and a
    // process that contains its own beats. See mergeGroups.
    groups: {},

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

// ── Map labels ──
// One short label per slot, replaced rather than accumulated: the map draws one
// cube per slot, so there is one name for it, and the latest is the current
// understanding. Over-long values are refused rather than trimmed — a label that
// needs cutting is not a label, and silently trimming it would put the sentence
// back in the cube this field exists to keep out.
export const MAP_LABEL_MAX = 24;

// Slots that may never be shown to the person: the wound (מוגלה) and the ADHD
// pattern. CLAUDE.md and Natali's ruling of 14.8 — he reaches the wound himself,
// and it is never reflected back at him as our reading of him.
//
// This lives HERE, at the bottom of the stack, and refuses the WRITE. It used to be
// enforced only in the projection that draws the map, which prompt-editor flagged
// on 4.9.2026 while adding `map_labels`: the prompt has no rule against naming a
// barred slot, so the model will report a two-word naming of the מוגלה as soon as
// stage 2 lands, and a single guard in a single consumer was the only thing between
// that and the person's own screen. A label that is never stored cannot be drawn by
// a consumer that forgets to check. story.js re-exports this as NEVER_MIRROR.
export const NEVER_SHOW_SLOTS = new Set(['wound', 'adhd_pattern']);

export function setMapLabel(state, stageKey, slot, raw) {
  if (NEVER_SHOW_SLOTS.has(slot)) return state;
  const label = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (!label || label.length > MAP_LABEL_MAX) return state;
  const byStage = state.mapLabels ?? {};
  return {
    ...state,
    mapLabels: { ...byStage, [stageKey]: { ...(byStage[stageKey] ?? {}), [slot]: label } },
  };
}

// ── Story edges (הקשתות) ──
// Ran's ruling, 5.9.2026: "the edges are part of the interviewee's story. When the
// system is not settled on the relation between the entities, it asks him."
//
// That settles a real objection rather than waving it away. An edge is a CLAIM —
// "this led to that" is a causal assertion about someone's life — and a model that
// invents one implants interpretation, which is exactly what the judge's `ownership`
// dimension exists to catch. The ruling makes the claim HIS: the model never infers
// an edge, it reports one it was told, and where there is none the clarification is
// the next question. So a drawn arrow is his account, not our inference.
//
// It also makes the drawing more honest than it is today, not less: the arrows now
// on screen come from a hardcoded order in storyMap.js (fact→thought→feeling→action)
// and assert "led to" with nothing behind them.
//
// This is the third instance of one pattern already in the system — an unclear actor
// (clear:false) blocks and forces a clarification; an unconfirmed slot (< 2) is not
// drawn and keeps being asked about; an unconfirmed edge now joins them.
//
// Endpoints are node ids as the map names them: "stageN.slot" for a beat,
// "actor:<id>" for a character, "fork:<id>" for an open fork.
export const EDGE_KINDS = new Set([
  'then',    // temporal succession — and then
  'because', // causal — that is why
  'agent',   // an actor did this beat
  // resemblance — this felt like that. Added 5.9.2026 after prompt-editor found a
  // relation the first three could not carry: "that is how I felt when teachers
  // said I do not try" relates the feeling to its past echo, and it is a relation
  // he STATED. `because` was the only near fit and it would have asserted that the
  // past CAUSED the feeling — a causal claim he never made, in the one dimension
  // (`ownership`) the judge exists to catch. A kind that says only "these resemble
  // each other" keeps the edge without inventing the cause. It never re-orders the
  // map: resemblance is not precedence.
  'echo',
]);

const edgeNode = (v) => (typeof v === 'string' ? v.trim() : '');

// The slot an endpoint refers to, or '' when it is not a beat. Used to keep a
// barred slot out of the graph entirely — a wound with an edge attached is still a
// wound on the drawing, and refusing it at the write is cheaper than trusting every
// future reader to check (the same reasoning as setMapLabel).
const endpointSlot = (node) => {
  const m = /^stage[1-7]\.(.+)$/.exec(node);
  return m ? m[1] : '';
};

export function mergeEdges(state, reported) {
  const byId = { ...(state.edges ?? {}) };
  for (const e of Array.isArray(reported) ? reported : []) {
    const from = edgeNode(e?.from);
    const to = edgeNode(e?.to);
    const kind = edgeNode(e?.kind);
    if (!from || !to || from === to) continue;        // a node cannot lead to itself
    if (!EDGE_KINDS.has(kind)) continue;              // unknown relation — dropped
    if (NEVER_SHOW_SLOTS.has(endpointSlot(from))) continue;
    if (NEVER_SHOW_SLOTS.has(endpointSlot(to))) continue;

    const id = `${from}→${to}`;
    const prev = byId[id];
    byId[id] = {
      id,
      from,
      to,
      kind,
      // Confirmed means HE said so. An omitted flag on a delta keeps what the edge
      // already had; a new edge is unconfirmed until he confirms it, never by
      // default — defaulting to true is how the system would start asserting
      // relations again through the back door.
      confirmed: typeof e?.confirmed === 'boolean' ? e.confirmed : (prev?.confirmed ?? false),
    };
  }
  return { ...state, edges: byId };
}

// ── Containers (מכלים) ──
// Ran, 5.9.2026: represent hierarchy between entities or processes as nested
// boxes, not only boxes and arrows. Two uses are implemented and a third is not.
//
//   community — a group someone belongs to. "העבודה" holding the manager, the new
//               product manager and the team, with the person inside it or outside.
//               In the run this came from that is not decoration: whether he is in
//               or out IS the story.
//   process   — a stretch that contains its own beats. The shift holding what
//               happened inside it, which separates "during the event" from
//               "after it".
//
//   perspective — what is inside someone's point of view. Ruled in by Ran on
//               5.9.2026, and in a better shape than the one I proposed: TWO
//               boxes, not one. "My point of view sits in my container, the
//               other's in his." That symmetry is what answers the objection that
//               stopped me — a box around HIM with everything else outside can be
//               read as "look how narrow your world is", and two boxes side by
//               side cannot. Stage 5 is יציאה מעצמי, and its move is not adding
//               information but CROSSING A LINE; until now the map drew the other
//               side as more boxes in the chain and the line was invisible.
//
// EVERY GROUP MUST BE CONFIRMED BEFORE IT IS DRAWN. Ran, same ruling: "the edges
// have to be clarified with the user, especially the ones touching point of view…
// I would be very careful about what I include inside it — checking with the
// interviewee." A box is a claim in every case, so `confirmed` gates all three
// kinds, not only perspective. It is the same contract the edges already run:
// report it unconfirmed, ask, and draw only once he has said so.
export const GROUP_KINDS = new Set(['community', 'process', 'perspective']);
export const GROUP_MEMBERS_MAX = 12;

export function mergeGroups(state, reported) {
  const byId = { ...(state.groups ?? {}) };
  for (const g of Array.isArray(reported) ? reported : []) {
    const label = typeof g?.label === 'string' ? g.label.replace(/\s+/g, ' ').trim() : '';
    const id = typeof g?.id === 'string' && g.id.trim() ? g.id.trim() : label;
    const kind = typeof g?.kind === 'string' ? g.kind.trim() : '';
    if (!id || !GROUP_KINDS.has(kind)) continue;

    // A perspective belongs to someone: 'self', or an actor. Without an owner
    // there is no whose-view to draw, so it is not a perspective.
    const owner = typeof g?.owner === 'string' ? g.owner.trim() : '';
    if (kind === 'perspective' && !owner) continue;

    const prev = byId[id] ?? { id, label: '', kind, owner, members: [], confirmed: false };
    const members = [...prev.members];
    for (const raw of Array.isArray(g?.members) ? g.members : []) {
      const m = typeof raw === 'string' ? raw.trim() : '';
      // A barred slot cannot be a member for the same reason it cannot be an edge
      // endpoint: a box drawn around the wound still puts the wound on the paper.
      if (!m || members.includes(m)) continue;
      const slot = /^stage[1-7]\.(.+)$/.exec(m)?.[1] ?? '';
      if (NEVER_SHOW_SLOTS.has(slot)) continue;
      members.push(m);
    }
    // A container of one contains nothing — it is just that node with a box on it.
    if (members.length < 2) continue;
    byId[id] = {
      id,
      label: label || prev.label,
      kind,
      owner: owner || prev.owner,
      members: members.slice(0, GROUP_MEMBERS_MAX),
      // Never true by default. A container the system decided on is the system
      // drawing a boundary around someone's story on its own authority.
      confirmed: typeof g?.confirmed === 'boolean' ? g.confirmed : prev.confirmed,
    };
  }
  return { ...state, groups: byId };
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

// ── Open forks (פיצולים לא-מוכרעים) ──
// Natali's ruling, 29.8.2026, from a live run: a question the STORY ITSELF leaves
// open is a fact of the case, not a gap in the system's knowledge. Three role
// configurations were live and undecided when a job ad went out; there is no single
// right answer, and the unresolvedness is the story — probably the injury in it.
//
// THE DISTINCTION THIS TYPE EXISTS TO HOLD, and the reason it is not folded into
// `gaps`, which is structurally similar and would have been the lazy home for it:
//
//   gaps      an inconsistency in the TELLING — the person contradicted themselves
//             or was vague. System-side intelligence. NEVER surfaced to them
//             (gap-management.md §1). Closed by the interviewer asking.
//
//   openForks a fact about the WORLD — the situation genuinely was not settled.
//             The person's own material, and it is DRAWN for them. Closed only by
//             something happening in their life; sometimes never.
//
// The model reports DELTAS keyed by a stable id, like actorMap; the CODE merges,
// unions the options, and owns `settled`. A fork needs two or more branches — one
// possibility is not a fork, it is a fact — so single-option reports are dropped.
export const FORK_OPTIONS_MAX = 6;
const FORK_TEXT_MAX = 90;

const forkText = (v) => {
  const t = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  return t.length > FORK_TEXT_MAX ? t.slice(0, FORK_TEXT_MAX).trim() : t;
};

export function mergeOpenForks(state, reported) {
  const byId = { ...(state.openForks ?? {}) };
  for (const f of Array.isArray(reported) ? reported : []) {
    const question = forkText(f?.question);
    const id = typeof f?.id === 'string' && f.id.trim() ? f.id.trim() : question;
    if (!id) continue;
    const prev = byId[id] ?? { id, question: '', options: [], settled: false };

    const options = [...prev.options];
    for (const raw of Array.isArray(f?.options) ? f.options : []) {
      const opt = forkText(raw);
      if (opt && !options.includes(opt)) options.push(opt);
    }
    const merged = {
      id,
      question: question || prev.question,
      options: options.slice(0, FORK_OPTIONS_MAX),
      // Only an explicit boolean moves it; an omitted field on a delta keeps
      // whatever the fork already carried.
      settled: typeof f?.settled === 'boolean' ? f.settled : prev.settled,
    };
    // A fork must have a question and at least two branches to mean anything.
    // Reports that never reach that are not stored at all, so a half-formed one
    // cannot sit in state waiting to be drawn the moment a second option lands.
    if (!merged.question || merged.options.length < 2) continue;
    byId[id] = merged;
  }
  return { ...state, openForks: byId };
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
    openForks: state.openForks ?? {},
    mapLabels: state.mapLabels ?? {},
    edges: state.edges ?? {},
    groups: state.groups ?? {},
  };
}
