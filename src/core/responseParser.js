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
      flagAvoidance: !!evaluation.flag_avoidance,
      flagFlight: !!evaluation.flag_flight,
      flagOverflow: !!evaluation.flag_overflow,
      flagContradiction: !!evaluation.flag_contradiction,
      exhausted: !!evaluation.exhausted,
      newInfo: evaluation.new_info !== false, // default true
      questionAperture: evaluation.question_aperture ?? null,
      alternatives: Array.isArray(evaluation.alternatives) ? evaluation.alternatives : [],
      board: Array.isArray(evaluation.board) ? evaluation.board : [],
      decisionType: evaluation.decision_type ?? null, // 'sharp' | 'structured_deferral' | 'vague'
    },
  };
}
