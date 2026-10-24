// ResponseParser — validates and parses the JSON returned by the model.
// Expected format: { message: string, evaluation: { slots, flags } }
// On malformed JSON: returns a parse error result (caller decides retry logic).

export function parseResponse(raw) {
  // Strip markdown code fences the model sometimes adds
  let text = (raw ?? '').trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  // Extract the first JSON object — handles leading prose
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { ok: false, error: 'no_json', raw, message: null };

  let obj;
  try {
    obj = JSON.parse(match[0]);
  } catch {
    return { ok: false, error: 'invalid_json', raw, message: null };
  }

  if (typeof obj.message !== 'string' || !obj.message.trim()) {
    return { ok: false, error: 'missing_message', raw };
  }

  const evaluation = obj.evaluation ?? {};

  return {
    ok: true,
    message: obj.message.trim(),
    evaluation: {
      slots: evaluation.slots ?? {},
      slotFindings: parseSlotFindings(evaluation),
      actorMap: parseActorMap(evaluation),
      flagAvoidance: !!evaluation.flag_avoidance,
      flagFlight: !!evaluation.flag_flight,
      flagOverflow: !!evaluation.flag_overflow,
      flagCynicism: !!evaluation.flag_cynicism,
      flagContradiction: !!evaluation.flag_contradiction,
      driftedTopic:
        typeof evaluation.drifted_topic === 'string' ? evaluation.drifted_topic.trim() || null : null,
      exhausted: !!evaluation.exhausted,
      newInfo: evaluation.new_info !== false, // default true
      questionAperture: evaluation.question_aperture ?? null,
      alternatives: Array.isArray(evaluation.alternatives) ? evaluation.alternatives : [],
      board: Array.isArray(evaluation.board) ? evaluation.board : [],
      decisionType: evaluation.decision_type ?? null, // 'sharp' | 'structured_deferral' | 'vague'
      differsFromAutomatic:
        typeof evaluation.differs_from_automatic === 'boolean'
          ? evaluation.differs_from_automatic
          : null, // stage 7 — does the chosen decision differ from the automatic reaction?
      mergeAttempt: evaluation.merge_attempt ?? null, // 'real' | 'avoidance' | null (stage 7)
      emotionIntensity:
        typeof evaluation.emotion_intensity === 'number' ? evaluation.emotion_intensity : null,
      decision:
        evaluation.decision && typeof evaluation.decision === 'object' ? evaluation.decision : null,
      gapObservations: parseGapObservations(evaluation),
      // Which slot the question aims at ("stageN.slot"), the model's own account of
      // its question. The code compares it with the current stage (session.js) —
      // the model proposes, the code decides what to do about a question that
      // strayed (Ran, 24.10.2026). Absent or malformed → null, never a guess.
      asks: typeof evaluation.asks === 'string' && evaluation.asks.trim() ? evaluation.asks.trim().slice(0, 40) : null,
      openForks: parseOpenForks(evaluation),
      mapLabels: parseMapLabels(evaluation),
      nodes: parseNodes(evaluation),
      edges: parseEdges(evaluation),
      groups: parseGroups(evaluation),
    },
  };
}

// Parse the model's actor map (מפת שחקנים) — the resolved stage-1 cast. Each entry:
// { id, label, role, relation, clear, actions }. `actions` is what THAT character did
// in the story (attribution — keeps other actors' actions out of the user's slots).
// Entries without a label are dropped; `clear` defaults to true unless explicitly
// false. Returns null when absent/empty/non-array (back-compat — actors score stands).
const ACTOR_ACTIONS_MAX = 12;

function parseActorMap(evaluation) {
  const raw = evaluation.actor_map;
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const a of raw) {
    const label = typeof a?.label === 'string' ? a.label.trim() : '';
    const id = typeof a?.id === 'string' && a.id.trim() ? a.id.trim() : label;
    if (!id) continue; // need an id or a label (a delta may carry id-only)
    out.push({
      id,
      label,
      role: typeof a?.role === 'string' ? a.role.trim() : '',
      relation: typeof a?.relation === 'string' ? a.relation.trim() : '',
      // null = the model didn't specify clarity this turn → the merge keeps the
      // existing value (delta reports). New actors default to clear in the merge.
      clear: typeof a?.clear === 'boolean' ? a.clear : null,
      actions: Array.isArray(a?.actions)
        ? a.actions
            .map((s) => (typeof s === 'string' ? s.trim() : ''))
            .filter(Boolean)
            .slice(0, ACTOR_ACTIONS_MAX)
        : [],
    });
  }
  return out.length ? out : null;
}

// Parse the model's per-slot findings — short textual info items for guide-mode
// display. Map of slotKey → string[]; non-array values and empty strings dropped.
// Keys (bare "slot" or cross-stage "stageN.slot") are routed by the session, the
// same way slots are. Observability only — findings never affect the Router.
function parseSlotFindings(evaluation) {
  const raw = evaluation.slot_findings;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!Array.isArray(val)) continue;
    const items = val.map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean);
    if (items.length) out[key] = items;
  }
  return out;
}

// Parse the model's containers — a group of nodes drawn as a box around them.
// Shape only; the kind whitelist, the two-member minimum and the barred-slot
// refusal are the store's rules (state.mergeGroups).
function parseGroups(evaluation) {
  const raw = evaluation.groups;
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const g of raw) {
    const label = typeof g?.label === 'string' ? g.label.trim() : '';
    const id = typeof g?.id === 'string' && g.id.trim() ? g.id.trim() : label;
    if (!id) continue;
    out.push({
      id,
      label,
      kind: typeof g?.kind === 'string' ? g.kind.trim() : '',
      owner: typeof g?.owner === 'string' ? g.owner.trim() : '',
      confirmed: typeof g?.confirmed === 'boolean' ? g.confirmed : null,
      members: Array.isArray(g?.members)
        ? g.members.map((m) => (typeof m === 'string' ? m.trim() : '')).filter(Boolean)
        : [],
    });
  }
  return out.length ? out : null;
}

// Parse the model's story nodes — the things the map draws. Each: { id, label,
// slot, scale }. Everything else about them (the slot must exist, the barred slots,
// the label length, the per-slot budget) is the store's rule, enforced in
// mergeNodes; this only gets the shapes right. Absent → null, so a model that has
// not been updated to report nodes leaves the store alone rather than clearing it.
function parseNodes(evaluation) {
  const raw = evaluation.nodes;
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const n of raw) {
    const id = typeof n?.id === 'string' ? n.id.trim() : '';
    if (!id) continue;
    out.push({
      id,
      label: typeof n?.label === 'string' ? n.label.trim() : '',
      slot: typeof n?.slot === 'string' ? n.slot.trim() : '',
      scale: typeof n?.scale === 'string' ? n.scale.trim() : '',
    });
  }
  return out.length ? out : null;
}

// Parse the model's story edges — the relations between the case's entities, which
// per Ran's ruling of 5.9.2026 belong to the interviewee and are never inferred by
// the system. Shape only here; the kind whitelist, the barred-slot refusal and the
// confirmed default are the store's rules (state.mergeEdges).
function parseEdges(evaluation) {
  const raw = evaluation.edges;
  if (!Array.isArray(raw)) return null; // absent → nothing to merge (back-compat)
  const out = [];
  for (const e of raw) {
    const from = typeof e?.from === 'string' ? e.from.trim() : '';
    const to = typeof e?.to === 'string' ? e.to.trim() : '';
    if (!from || !to) continue;
    out.push({
      from,
      to,
      kind: typeof e?.kind === 'string' ? e.kind.trim() : '',
      confirmed: typeof e?.confirmed === 'boolean' ? e.confirmed : null,
    });
  }
  return out.length ? out : null;
}

// Parse the model's map labels — the one or two words that name a slot's cube on
// the story map. Map of slotKey → string, routed by the session exactly like
// slot_findings. Non-strings and blanks dropped; the length rule is the store's.
function parseMapLabels(evaluation) {
  const raw = evaluation.map_labels;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, val] of Object.entries(raw)) {
    if (typeof val !== 'string') continue;
    const label = val.trim();
    if (label) out[key] = label;
  }
  return out;
}

// Parse the model's open forks — questions the STORY leaves undecided. Each entry:
// { id, question, options[], settled }. Deltas, keyed by a stable id, merged by the
// code (state.mergeOpenForks). Distinct from gap_observations in the one way that
// matters: a gap is an inconsistency in the telling and is never surfaced, a fork is
// a fact about the world and is drawn for the person. Natali, 29.8.2026.
// Shape only here; the two-branch minimum is the store's rule, not the parser's, so
// a delta carrying one new option can still reach a fork that already has others.
function parseOpenForks(evaluation) {
  const raw = evaluation.open_forks;
  if (!Array.isArray(raw)) return null; // absent → nothing to merge (back-compat)
  const out = [];
  for (const f of raw) {
    const question = typeof f?.question === 'string' ? f.question.trim() : '';
    const id = typeof f?.id === 'string' && f.id.trim() ? f.id.trim() : question;
    if (!id) continue;
    out.push({
      id,
      question,
      options: Array.isArray(f?.options)
        ? f.options.map((o) => (typeof o === 'string' ? o.trim() : '')).filter(Boolean)
        : [],
      settled: typeof f?.settled === 'boolean' ? f.settled : null,
    });
  }
  return out.length ? out : null;
}

// Parse the model's gap observations (consistency measure). Each entry:
// { target, dimension, level 1..10, note }. Under-specified entries are dropped;
// level is clamped. docs/gap-management-implementation.md §3.2.
function parseGapObservations(evaluation) {
  const raw = evaluation.gap_observations;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (o) =>
        o &&
        typeof o.target === 'string' &&
        o.target.trim() &&
        typeof o.level === 'number' &&
        !Number.isNaN(o.level),
    )
    .map((o) => ({
      target: o.target.trim(),
      dimension: typeof o.dimension === 'string' ? o.dimension : 'factual',
      level: Math.min(10, Math.max(1, Math.round(o.level))),
      note: typeof o.note === 'string' ? o.note.trim() : '',
    }));
}
