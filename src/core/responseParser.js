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
    },
  };
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
