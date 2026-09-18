// The event record — the registrar's ledger.
//
// Ran, 18.9.2026, after reading the entity decomposition: "the existing agents,
// the slots, the transition rules — all good, don't touch. I want all of them to
// rest on sharp, clear information that is collected and assembled into the story
// of THE EVENT by another agent acting as a kind of REGISTRAR, whose whole job is
// to assemble the story. That information feeds the probing agents and the Router
// and serves them in the decisions within their own domain of responsibility."
//
// So this module is a LEDGER, not an authority. It holds what the registrar
// assembled; derive.js turns it into the slot scores the Router already reads; the
// Router's rules do not change by one line. Nothing here decides anything.
//
// ── WHY IT EXISTS: the interviewer grades its own work ──
// session.js writes `ev.slots` straight into `coverage`. The model says "trigger =
// 2" and the code records 2. There is exactly one exception in the whole system,
// and it is the one that behaves: deriveActorsScore derives `actors` from the
// cast's clarity and OVERRIDES what the model reported — which CLAUDE.md blesses
// in those words ("הקוד גוזר את ציון actors מבהירות המפה — לא מהמספר שהמודל
// מדווח"). This record generalises that single exception to the rest.
//
// ── THE FINDING THAT SHAPED IT ──
// The chair was already here and empty. `createState` declares `facts`,
// `thoughts`, `feelings` and `reactions`; NOTHING in the system writes to any of
// them (updateFacts and its three siblings are unreferenced outside state.js), and
// all four ship to every prompt on every turn as `{}`. Someone intended exactly
// this ledger and it was never built, so the system compensated by having the
// interviewer report numbers. Those four fields are replaced by this module.
//
// ── WHAT THE REGISTRAR REPORTS, AND WHAT THE CODE COMPUTES ──
// This is engineering principle 1 applied one level lower than before. The model
// used to propose the CONCLUSION ("this slot is 2"). Now it reports OBSERVATIONS —
// is this beat something a camera would catch, is this emotion word specific, did
// he say this himself or did the interviewer offer it — and the code computes the
// conclusion from them (derive.js). Observations are auditable; a 2 is not.
//
// ── DISPLAY IS NOT THIS MODULE'S JOB, AND THE WOUND PROVES IT ──
// A first draft of the design said the store must refuse barred content at the
// write, by analogy with setMapLabel. That is WRONG here and would have broken the
// interview: the מוגלה is a `reading` stance of `self`, and `coverage.stage2.wound`
// cannot reach 2 unless the record holds the evidence for it. The existing system
// already draws this line correctly — `findings` stores wound material, and only
// the DISPLAY stores (mapLabels, nodes, edges, groups) refuse it.
//
// So: the ledger stores everything the Router needs, and every projection of it
// applies NEVER_SHOW_SLOTS. `displayable()` below is that guard, exported here so
// a future projection cannot forget to ask.

import { NEVER_SHOW_SLOTS } from './state.js';

// An entity names the slot it feeds. That reference is what makes derivation
// possible at all, and it is also what the display guard checks.
const SLOT_RE = /^stage([1-7])\.(.+)$/;

export const STANCE_TYPES = new Set(['want', 'goal', 'reading']);

// The three timescales of feeling, in Ran's own words (18.9.2026): "תחושות
// נסיבתיות, עמדה רגשית מוקדמת, עמדה רגשית סטטית שמאפיינת שחקן מסוים כקו לדמותו".
// They fall exactly onto the two clocks he already ruled for the map — situational
// is an `episode`, prior and trait are `ongoing` — which is why `paceScale` below
// can hand the map a scale without the registrar reporting one twice.
export const EMOTION_PACES = new Set(['situational', 'prior', 'trait']);

// Who claims this — the attribution axis. It is not bookkeeping: it IS the
// protocol's מבחן הבעלות ("the interpretation was formulated BY THE USER. If the
// agent had to offer one, the slot stays 1 until the user adopts it in his own
// words"), as a field instead of as a hope. derive.js reads it directly.
export const SOURCES = new Set(['stated', 'attributed', 'inferred', 'unknown']);

// Backstops, in the spirit of NODES_MAX: they should never be what stops anything,
// and they are here so a runaway report cannot grow the ledger without limit.
// A cube's name. Ran, 4.9–5.9.2026: the map holds "cubes, a word or two in each",
// and choosing WHAT a cube stands for is a judgement — "no amount of code turns a
// sentence into one". So the registrar names each entity, and a projection falls
// back to trimming `text` only so a cube is never empty, which is visibly not the
// same thing. Refused rather than trimmed when over-long, exactly as MAP_LABEL_MAX
// is: a label that needs cutting is not a label.
export const ENTITY_LABEL_MAX = 24;

export const BEATS_MAX = 60;
export const STANCES_MAX = 40;
export const EMOTIONS_MAX = 30;
export const CONDITIONS_MAX = 12;
const TEXT_MAX = 140;

export function createEventRecord() {
  return {
    // The stage (הבמה): where, when, whether this belongs to a run of events, and
    // what was standing true throughout. `place` and `precedent` have no slot of
    // their own in the protocol — they are held for the probing agent and for the
    // map, and derive.js does not score them. See docs/event-model.md §2.
    setting: { place: '', time: '', precedent: '', conditions: [] },
    beats: {},     // what someone did
    stances: {},   // what someone wanted, was after, or understood
    emotions: {},  // what someone felt
  };
}

// The model's name for this entity's cube, or '' when it did not give a usable one.
// Over-long is refused, never trimmed — see ENTITY_LABEL_MAX.
const entityLabel = (raw, prev) => {
  const l = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  return l && l.length <= ENTITY_LABEL_MAX ? l : (prev ?? '');
};

const clean = (v, max = TEXT_MAX) => {
  const t = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  return t.length > max ? t.slice(0, max).trim() : t;
};

// The slot an entity feeds, or '' when it names none. An entity with no valid slot
// is not stored: it has no way to be scored and no way to be display-checked, which
// is the same contract mergeNodes runs.
function slotOf(raw) {
  const s = clean(raw, 40);
  const m = SLOT_RE.exec(s);
  return m ? s : '';
}

// The one guard every projection of this ledger must call. The wound and the ADHD
// pattern are stored (the Router needs them) and never drawn.
export function displayable(entity) {
  const m = SLOT_RE.exec(entity?.slot ?? '');
  return !!m && !NEVER_SHOW_SLOTS.has(m[2]);
}

// Shared merge: delta-reported, keyed by a stable id, first-in keeps its seq.
// `build` returns the stored shape or null to refuse the entry.
function mergeInto(store, reported, cap, build) {
  const byId = { ...(store ?? {}) };
  let seq = Math.max(0, ...Object.values(byId).map((e) => e.seq ?? 0));
  for (const raw of Array.isArray(reported) ? reported : []) {
    const id = clean(raw?.id, 60);
    if (!id) continue;
    const prev = byId[id];
    if (!prev && Object.keys(byId).length >= cap) continue;
    const next = build(raw, prev);
    if (!next) continue;
    byId[id] = { ...next, id, seq: prev?.seq ?? ++seq };
  }
  return byId;
}

// ── Beats (פעולות) ──
// A beat is promoted to a first-class entity here, and that is the most expensive
// change in the decomposition. The reason is a dead end in the current model:
// evaluator.md:203 routes another actor's actions into actorMap[].actions, whose
// only consumers are GuidePanel and the prompt's own state summary. buildCast
// returns names only, and the edge store knows four endpoint shapes, none of which
// is a string inside an actor record. So "she didn't give up and started giving
// advice" can never be a station on the map and can never be the end of an arrow —
// in a case that is entirely a sequence of who-did-what-to-whom.
//
// `camera` is the protocol's מבחן המצלמה as a field: true when the content is
// something a camera would have caught ("he said X on the phone"), false when it is
// a generalisation or a reading ("he had a go at me"). The registrar judges it;
// derive.js is what acts on it. An omission IS a beat — "she didn't answer the
// messages" is a step taken, and it is already the example in evaluator.md.
export function mergeBeats(record, reported) {
  return {
    ...record,
    beats: mergeInto(record.beats, reported, BEATS_MAX, (b, prev) => {
      const slot = slotOf(b?.slot) || prev?.slot || '';
      const text = clean(b?.text);
      if (!slot || (!text && !prev)) return null;
      return {
        slot,
        actor: clean(b?.actor, 60) || prev?.actor || '',
        text: text || prev.text,
        // Unreported keeps what it had; a NEW beat defaults to false. Never true by
        // default — defaulting a truth test to "passed" is how the camera test
        // would quietly stop being a test.
        camera: typeof b?.camera === 'boolean' ? b.camera : (prev?.camera ?? false),
        scale: b?.scale === 'ongoing' ? 'ongoing' : (prev?.scale ?? 'episode'),
        // Where in the incident this sits: 'before' | 'during' | 'after'. This is
        // the protocol's שלמות ציר זמן ("a beginning, a middle and an end exist"),
        // which is a property of the SEQUENCE and cannot be read off one beat's
        // text. '' when the registrar could not place it.
        phase: ['before', 'during', 'after'].includes(b?.phase) ? b.phase : (prev?.phase ?? ''),
        toward: clean(b?.toward, 60) || prev?.toward || '',
        label: entityLabel(b?.label, prev?.label),
      };
    }),
  };
}

// ── Stances (עמדות) ──
// What an actor wanted, was after, or understood — per actor, per context. The
// current model can hold this only for the interviewee, and only as slots: two
// other characters in a story collide in one stage5.perspective.
//
// `source` carries the ownership test. A `reading` the INTERVIEWER offered is
// `inferred` and stays worth 1 until he adopts it in his own words, at which point
// the registrar re-reports the same id as `stated`. That is the protocol's rule,
// executed rather than hoped for.
export function mergeStances(record, reported) {
  return {
    ...record,
    stances: mergeInto(record.stances, reported, STANCES_MAX, (s, prev) => {
      const slot = slotOf(s?.slot) || prev?.slot || '';
      const type = STANCE_TYPES.has(s?.type) ? s.type : prev?.type;
      const text = clean(s?.text);
      if (!slot || !type || (!text && !prev)) return null;
      return {
        slot,
        type,
        actor: clean(s?.actor, 60) || prev?.actor || '',
        text: text || prev.text,
        source: SOURCES.has(s?.source) ? s.source : (prev?.source ?? 'unknown'),
        // Third-person phrasing — the protocol's מבחן הגוף השלישי for stage 5,
        // which passes only on a sentence that starts "he/she". Judged by the
        // registrar because it is a reading of the wording, not a regex over
        // Hebrew; false by default for the same reason `camera` is.
        thirdPerson: typeof s?.third_person === 'boolean' ? s.third_person : (prev?.thirdPerson ?? false),
        context: clean(s?.context, 60) || prev?.context || '',
        // Ran's two clocks apply to a stance as much as to a beat: "I thought she
        // was ignoring me right then" is an episode, "I never get a say in this
        // house" is the ground it ran on. Reported, never guessed.
        scale: s?.scale === 'ongoing' ? 'ongoing' : (prev?.scale ?? 'episode'),
        label: entityLabel(s?.label, prev?.label),
      };
    }),
  };
}

// ── Emotions (רגשות) ──
// `granular` is the protocol's מבחן הגרנולריות: a specific feeling word (עלבון,
// בושה, כעס) passes, a generic one ("רע לי") does not. `pace` is Ran's three
// timescales. `intensity` is the 1–10 scale that stage 5's delta is measured
// against — the same entity read at two points in time, instead of two slots
// somebody has to remember to compare.
export function mergeEmotions(record, reported) {
  return {
    ...record,
    emotions: mergeInto(record.emotions, reported, EMOTIONS_MAX, (e, prev) => {
      const slot = slotOf(e?.slot) || prev?.slot || '';
      const name = clean(e?.name, 40);
      if (!slot || (!name && !prev)) return null;
      const n = Number(e?.intensity);
      return {
        slot,
        actor: clean(e?.actor, 60) || prev?.actor || '',
        name: name || prev.name,
        granular: typeof e?.granular === 'boolean' ? e.granular : (prev?.granular ?? false),
        intensity: Number.isFinite(n) ? Math.min(10, Math.max(1, Math.round(n))) : (prev?.intensity ?? null),
        pace: EMOTION_PACES.has(e?.pace) ? e.pace : (prev?.pace ?? 'situational'),
        source: SOURCES.has(e?.source) ? e.source : (prev?.source ?? 'unknown'),
        context: clean(e?.context, 60) || prev?.context || '',
        label: entityLabel(e?.label, prev?.label),
      };
    }),
  };
}

// ── Setting (הזירה) ──
// Replaced wholesale rather than merged by id: there is one stage, and a correction
// to it is a correction, not a second stage. Empty strings leave what was there, so
// a delta that only names the place does not erase the time.
export function mergeSetting(record, reported) {
  if (!reported || typeof reported !== 'object') return record;
  const prev = record.setting ?? createEventRecord().setting;
  const conditions = [...(prev.conditions ?? [])];
  for (const raw of Array.isArray(reported.conditions) ? reported.conditions : []) {
    const c = clean(raw);
    if (c && !conditions.includes(c)) conditions.push(c);
  }
  return {
    ...record,
    setting: {
      place: clean(reported.place, 60) || prev.place,
      time: clean(reported.time, 60) || prev.time,
      precedent: clean(reported.precedent) || prev.precedent,
      conditions: conditions.slice(0, CONDITIONS_MAX),
    },
  };
}

// Every entity in the ledger that feeds one slot. Used by derive.js and by any
// projection; `displayable` still has to be applied by whoever draws.
export const bySlot = (store, slot) => Object.values(store ?? {}).filter((e) => e.slot === slot);

// Entities belonging to the interviewee. The registrar is told to use 'self' for
// him, and models reach for the system's own vocabulary anyway, so the aliases are
// accepted rather than silently dropping his entire mind-layer.
const SELF_IDS = new Set(['self', 'אני', 'המשתמש', 'המרואיין', 'user', 'me']);
export const isSelf = (actor) => SELF_IDS.has(String(actor ?? '').trim());

// Ran's two clocks, from the three paces. See EMOTION_PACES.
export const paceScale = (pace) => (pace === 'situational' ? 'episode' : 'ongoing');
