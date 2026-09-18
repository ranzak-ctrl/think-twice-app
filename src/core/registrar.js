// The registrar — the model call that assembles the event, and nothing else.
//
// Ran's three roles, 18.9.2026:
//   הרשם     — ממוקד בבנייה של סיפור שלם ומדויק
//   המראיין  — ממוקד בבחירת השאלה האפקטיבית ביותר לקידום בניית הסיפור
//   ה-Router — ממוקד בניתוב הראיון בין המראיינים + זיהוי הפערים מול slots
//
// And the purpose behind all three: THE INTERVIEW EXISTS TO BUILD THE EVENT, not
// to leave it scattered across the accumulated insights of seven interviewers.
//
// ── WHAT THIS IS NOT ──
// It gives no scores. `coverage` stays the interviewer's, exactly as before — Ran:
// "מה רמת הכיסוי, הכל כרגיל". It has no `message` field, which is not a rule to
// remember but a structural fact: there is no channel through which it could
// address the person even if a prompt told it to. And it never decides a
// transition: the Router reads `coverage` and `meta`, neither of which this writes.
//
// The one exception is the one that already existed and that CLAUDE.md blesses:
// the code derives `actors` from the cast's clarity (deriveActorsScore) and the
// Router refuses to advance stage 1 on a muddled cast. The registrar now holds the
// cast, so it feeds that gate — the model still does not score it, the code does.
//
// ── RAW MATERIAL: THE TRANSCRIPT, NOT THE INTERVIEWER'S EXTRACTION ──
// Settled 18.9.2026. Extract-then-assemble is a lossy relay — a graph built from a
// summary of a summary — and it leaves the interviewer carrying exactly the load
// that drove evaluator.md to v6 and v7. The material is still what the INTERVIEW
// produced: without the question the interviewer chose, the sentence would not
// have been said. The registrar reads it at the source instead of through a relay.
//
// It reads a TURN PAIR, not an answer alone: "מה היא אמרה כשענתה לך?" → "שזה כבר
// סוכם" needs the question to resolve what "זה" refers to.
//
// ── THE LOOP IS SERIAL ──
//   registrar folds the answer → interviewer reads the updated story → asks
// Parallel would hand the interviewer the story as of the PREVIOUS turn. Ran's
// cycle is explicit that it gets the updated one, and he is right: the next
// question should be asked about the picture that includes what was just said.
// The cost is that the person's wait adds instead of being absorbed by max(), and
// that cost is clinical as well as technical — design/brief.md:33 has them
// arriving overwhelmed. Mitigated by the registrar writing nothing for the person:
// its output is a short JSON delta, so its call is the cheap one.
//
// ── PORTABILITY (CLAUDE.md principle 4) ──
// `completeImpl` is injected rather than imported, following judge.js, which
// CLAUDE.md names as the pattern to copy. So this module has no platform
// dependency and runs under plain Node.

import {
  mergeBeats,
  mergeStances,
  mergeEmotions,
  mergeSetting,
  createEventRecord,
} from './eventRecord.js';
import {
  mergeActorMap,
  mergeEdges,
  mergeGroups,
  mergeOpenForks,
  deriveActorsScore,
  recordGapObservation,
} from './state.js';

// Parse the registrar's reply. Deliberately NOT responseParser.parseResponse: that
// one requires a `message` field and fails without one. The registrar has no
// message by design, so its envelope is different and so is its parser.
export function parseRegistrarResponse(raw) {
  const text = String(raw ?? '')
    .trim()
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { ok: false, error: 'no_json' };

  let obj;
  try {
    obj = JSON.parse(match[0]);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }

  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    ok: true,
    deltas: {
      setting: obj.setting && typeof obj.setting === 'object' ? obj.setting : null,
      beats: arr(obj.beats),
      stances: arr(obj.stances),
      emotions: arr(obj.emotions),
      actors: arr(obj.actors),
      edges: arr(obj.edges),
      groups: arr(obj.groups),
      openForks: arr(obj.open_forks),
      gapObservations: arr(obj.gap_observations),
    },
  };
}

// Fold one registrar report into the StateDocument. Every store it writes already
// owns its own validation — this routes, it does not re-validate.
export function applyRegistrar(state, deltas, turn = 0) {
  if (!deltas) return state;
  let record = state.eventRecord ?? createEventRecord();
  if (deltas.setting) record = mergeSetting(record, deltas.setting);
  if (deltas.beats?.length) record = mergeBeats(record, deltas.beats);
  if (deltas.stances?.length) record = mergeStances(record, deltas.stances);
  if (deltas.emotions?.length) record = mergeEmotions(record, deltas.emotions);

  let next = { ...state, eventRecord: record };

  // The cast, AT ANY STAGE. session.js gated this on `stage === 1`, which froze the
  // cast at the end of stage 1 — and stage5-transform.md then "picks a character
  // from the map" and learns the most significant thing the interview learns about
  // anyone, with nowhere to write it back. The registrar holds the cast for the
  // whole interview, so the freeze goes.
  //
  // The derivation stays code-side and unchanged: `actors` comes from the cast's
  // clarity, never from a number a model reported. Deriving it outside stage 1 is
  // harmless — the Router reads a stage's coverage only while standing in it — and
  // is correct if a Re-open ever brings the interview back to stage 1.
  if (deltas.actors?.length) {
    next = mergeActorMap(next, deltas.actors);
    next = {
      ...next,
      coverage: {
        ...next.coverage,
        stage1: { ...next.coverage.stage1, actors: deriveActorsScore(next.actorMap) },
      },
    };
  }

  if (deltas.edges?.length) next = mergeEdges(next, deltas.edges);
  if (deltas.groups?.length) next = mergeGroups(next, deltas.groups);
  if (deltas.openForks?.length) next = mergeOpenForks(next, deltas.openForks);

  // Contradiction against past versions of the story. Ran raised this as a Router
  // job; it is the registrar's, because the registrar is the only component that
  // holds version N against version N-1 — the interviewing model that reports these
  // today has no stable picture to compare against. It lands in `gaps`, which is
  // hidden intelligence and never surfaced (gap-management §1), and which the
  // Router does not read. Whether it ever should is questions-for-natali §14.
  for (const obs of deltas.gapObservations ?? []) {
    next = recordGapObservation(next, obs, turn);
  }
  return next;
}

// Run one registrar pass. Returns { state, usage, error } — never throws, and on
// any failure returns the state untouched.
//
// A registrar failure MUST NOT cost the person their turn. The interview can run
// without an assembled story — that is precisely how it runs today — so a bad
// parse, a network error or a missing prompt degrades to the current behaviour
// instead of stopping the interview. The error is returned for the guide trail.
export async function runRegistrar({ state, messages, systemPrompt, completeImpl, turn = 0 }) {
  if (!systemPrompt || !messages?.length || typeof completeImpl !== 'function') {
    return { state, usage: null, error: 'not_configured' };
  }
  let result;
  try {
    result = await completeImpl({ systemPrompt, messages, mode: 'registrar' });
  } catch (err) {
    return { state, usage: null, error: err?.message ?? 'call_failed' };
  }
  if (!result?.ok) return { state, usage: result?.usage ?? null, error: result?.error ?? 'call_failed' };

  const parsed = parseRegistrarResponse(result.raw ?? result.message ?? '');
  if (!parsed.ok) return { state, usage: result.usage ?? null, error: parsed.error };

  return { state: applyRegistrar(state, parsed.deltas, turn), usage: result.usage ?? null, error: null };
}
