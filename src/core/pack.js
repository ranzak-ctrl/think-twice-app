// Interview packs — how the engine reads one, and what it refuses to run.
//
// docs/interview-platform-plan.md: the engine is the craft of interviewing and
// knows no topic; a pack is the professional model of one interview, as data.
// This module is the engine's side of that contract: accessors that ask a pack
// questions, and validatePack, which is the gate a pack passes before it runs —
// and, later, the save gate of the interview editor.
//
// ── THE CATALOG IS CLOSED ──
// A stage names components; it never carries logic. Each type below is behaviour
// the engine implements and the transition matrix tests. A pack that needs one
// that is not here is asking for an engine change (router-guard, and the matrices
// of every pack), never for an exception inside itself.
//
// ── THIS MODULE IMPORTS NOTHING FROM src/core, AND NEITHER DOES ANY PACK ──
// router.js and signposting.js read DEFAULT_PACK while they load. That is safe
// only because nothing below this file can import them back: an import from here
// (or from a pack) into core would make those reads a TDZ ReferenceError in one
// import order only — the trap vocabulary.js was made import-free to avoid.

// TRANSITIONAL — phase 1 of the plan. The engine must not know any pack, and this
// import is the one place it still does: every entry point defaults to Think Twice
// so that the 176 createState() and 41 route() call sites keep their meaning while
// the configuration moves out. Phase 2 removes the default and injects the pack.
import { thinkTwiceAdult } from '../packs/think-twice-adult/pack.js';

export const DEFAULT_PACK = thinkTwiceAdult;

export const COMPONENT_TYPES = new Set([
  'castClarity', // block advance while an actor is unclear; derive the named slot from the cast
  'collector',   // the production stage: options accumulate in the basket, never ranked
  'decision',    // board from the basket, sharpness, package test; a vague decision never closes
  'intensity',   // record the reported emotion intensity (1–10) while standing here — the delta KPI
]);

// What a slot may say about itself, beyond its id. Both are matched BY NAME,
// wherever the slot is referenced — see barredSlots below.
//   barred — never drawn or recited to the person: stored, scored, probed, and
//            refused by every display store and projection (plan §3.1). Think
//            Twice: the wound and the ADHD pattern (CLAUDE.md, Natali 14.8.2026).
//   mental — a mind: a reading, a want or a feeling. Only a mind can be "about"
//            something, and mergeEdges refuses an `about` edge from anything else.
export const SLOT_FLAGS = ['barred', 'mental'];

// The shapes the story map draws a slot's cube as. StoryMap.jsx places fact,
// action and plan in the events column and the rest in the meaning column. A pack
// puts its slots on the map by naming one of these; a new shape is a change to the
// map, not to a pack.
export const MAP_KINDS = new Set(['fact', 'thought', 'feeling', 'action', 'plan', 'other']);

// The decision component reads these slots by name — they are the engine's, not
// the pack's, for as long as the component is written against them.
export const DECISION_SLOTS = ['goal', 'board_presented', 'sharp_decision', 'package_test'];

// The load guard is the anti-deadlock backstop: the one guarantee that a stage
// can end when saturation never fires. A pack chooses its value; this bound only
// keeps a pack from switching the backstop off by setting it out of reach. It is
// an engine bound, not a clinical value — Think Twice runs at 20 and 15.
export const LOAD_GUARD_MAX = 50;

// ── Accessors. Stages are addressed by position, 1-based, as meta.currentStage is.
// Anything that is not a whole number names no stage — the engine never guesses.
// They expect a pack validatePack accepted, except where marked tolerant.
export const stageCount = (pack) => pack.stages.length;
export const stageAt = (pack, n) => (Number.isInteger(n) ? pack.stages[n - 1] : undefined);
export const stageKey = (n) => `stage${n}`;
// Tolerant of malformed stages, because validatePack calls them on one.
export const slotIds = (stage) => (Array.isArray(stage?.slots) ? stage.slots.map((s) => s?.id) : []);
export const componentOf = (stage, type) =>
  Array.isArray(stage?.components) ? stage.components.find((c) => c?.type === type) : undefined;
export const hasComponent = (stage, type) => !!componentOf(stage, type);

// Position of the first stage carrying a component, or null.
export function stageWith(pack, type) {
  const i = pack.stages.findIndex((s) => hasComponent(s, type));
  return i === -1 ? null : i + 1;
}

export function stageNumberOf(pack, key) {
  const i = pack.stages.findIndex((s) => s.key === key);
  return i === -1 ? null : i + 1;
}

// ── Slot references. "stageN.slot" is how the StateDocument, the model's reports
// and every store address a slot. A reference names a stage of THIS pack or it is
// not a reference: N is a whole number from 1 to the pack's stage count, written
// without a leading zero. For Think Twice's seven stages that is exactly the
// /^stage([1-7])\.(.+)$/ that nine places in the core used to repeat.
const SLOT_REF = /^stage([1-9]\d*)\.(.+)$/;

export function parseSlotRef(pack, ref) {
  const m = typeof ref === 'string' ? SLOT_REF.exec(ref) : null;
  if (!m) return null;
  const stage = Number(m[1]);
  if (stage > stageCount(pack)) return null;
  return { stage, key: stageKey(stage), slot: m[2] };
}

// A reference to a slot the pack actually has.
export function isSlotOf(pack, ref) {
  const r = parseSlotRef(pack, ref);
  return !!r && slotIds(stageAt(pack, r.stage)).includes(r.slot);
}

// Slot ids carrying a flag anywhere in the pack. Matched by NAME, as the guards
// always matched them: "stage3.wound" is refused although stage 3 has no such
// slot, which is the safe direction for a rule whose failure is the wound drawn on
// someone's screen. validatePack holds a name to the same flags in every stage
// that uses it, so matching by name is never ambiguous.
const flagged = (pack, flag) =>
  new Set(
    pack.stages.flatMap((s) =>
      (Array.isArray(s?.slots) ? s.slots : []).filter((x) => x?.[flag] === true).map((x) => x.id)
    )
  );
export const barredSlots = (pack) => flagged(pack, 'barred');
export const mentalSlots = (pack) => flagged(pack, 'mental');

// The castClarity component: the stage it gates, and the slot the code derives
// from the cast's clarity instead of taking the model's number. One per pack
// (validatePack) — an interview has one cast.
export function castOf(pack) {
  const n = stageWith(pack, 'castClarity');
  return n == null ? null : { stage: n, key: stageKey(n), slot: componentOf(stageAt(pack, n), 'castClarity').slot };
}

// The stages carrying the intensity component, in order, and the KPI key each one
// records into. The first is the baseline, the last the re-measure; the delta
// between them is the KPI. Think Twice: stage 3 against stage 5.
export const intensityStages = (pack) =>
  pack.stages.flatMap((s, i) => (hasComponent(s, 'intensity') ? [i + 1] : []));
export const intensityKey = (n) => `emotionIntensityStage${n}`;

// The story map's fallback order, as [stageKey, slot] pairs per kind — the shape
// storyMap.js lays out. Only for a validated pack: every reference parses.
export function mapNarrative(pack) {
  const rows = Array.isArray(pack.map?.narrative) ? pack.map.narrative : [];
  return rows.map(({ kind, slots }) => ({
    kind,
    slots: slots.map((ref) => {
      const r = parseSlotRef(pack, ref);
      return [r.key, r.slot];
    }),
  }));
}

// The slot whose certainty turns the map from a scene into a journey, or null.
export const mapTimeline = (pack) => parseSlotRef(pack, pack.map?.timeline);

// ── Validation ──
// Returns { ok, errors, limits }, and never throws: an editor hands this whatever
// a person typed. Every entry is a sentence a pack author can act on.
//
//   errors — the pack breaks the contract. No engine could run it as written.
//   limits — the contract allows it, but THIS engine cannot run it yet. Each limit
//            names what lifts it. A pack is runnable only when both are empty.
//            None stands today: the two that did (exactly seven stages; the cast
//            gate only on stage 1) were lifted by phase 1, slice 3 (10.10.2026),
//            when the turn loop moved onto the pack. The channel stays for the next
//            thing the contract allows before the engine can do it.
const SLOT_ID = /^[a-z_]+$/; // gap targets are normalised against this shape (state.js normalizeTarget)
const isPosInt = (v) => Number.isInteger(v) && v >= 1;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isGuard = (v) => isPosInt(v) && v <= LOAD_GUARD_MAX;

// THE FIELDS ARE CLOSED. A field the engine does not read is an error, not an
// extra: the realistic one is a typo, and a typo in this file fails silently —
// `bared: true` leaves a slot unbarred and the wound on the person's screen,
// `require` drops a dependency (router-guard F2, 10.10.2026). A new field is an
// engine change, so it is added here on purpose.
const FIELDS = {
  pack: ['id', 'name', 'version', 'routing', 'stages', 'map'],
  routing: ['softThreshold', 'saturationLimit', 'loadGuard', 'rejectGrace'],
  stage: ['key', 'name', 'label', 'signpost', 'slots', 'requires', 'loadGuard', 'components'],
  slot: ['id', ...SLOT_FLAGS],
  map: ['narrative', 'timeline'],
  mapRow: ['kind', 'slots'],
};
const COMPONENT_FIELDS = { castClarity: ['type', 'slot'], collector: ['type'], decision: ['type'], intensity: ['type'] };
const unknownFields = (obj, allowed) => Object.keys(obj).filter((k) => !allowed.includes(k));

export function validatePack(pack) {
  const errors = [];
  const limits = [];
  const err = (m) => errors.push(m);
  const done = () => ({ ok: errors.length === 0 && limits.length === 0, errors, limits });

  if (!isObj(pack)) {
    err('pack is not an object');
    return done();
  }

  // Data, not code: anything JSON cannot carry (a function, undefined, a Set) is
  // either lost or changed by the round trip.
  try {
    if (hasNonJson(pack) || JSON.stringify(JSON.parse(JSON.stringify(pack))) !== JSON.stringify(pack)) {
      err('pack must be plain data — it holds something JSON cannot carry');
    }
  } catch {
    err('pack must be plain data — it does not serialise');
  }

  for (const k of unknownFields(pack, FIELDS.pack)) err(`pack: unknown field "${k}"`);
  if (typeof pack.id !== 'string' || !pack.id.trim()) err('pack.id is required');
  // Every export opens with which interview it was (Ran, 9.10.2026), so an
  // interview without a name or a version cannot say what it is.
  if (typeof pack.name !== 'string' || !pack.name.trim()) err('pack.name is required');
  if (!isPosInt(pack.version)) err('pack.version must be a positive integer');

  const r = isObj(pack.routing) ? pack.routing : {};
  for (const k of unknownFields(r, FIELDS.routing)) err(`routing: unknown field "${k}"`);
  if (!(typeof r.softThreshold === 'number' && r.softThreshold > 0 && r.softThreshold <= 1)) {
    err('routing.softThreshold must be a number in (0, 1]');
  }
  if (!isPosInt(r.saturationLimit)) err('routing.saturationLimit must be a positive integer');
  if (!isGuard(r.loadGuard)) err(`routing.loadGuard must be a whole number from 1 to ${LOAD_GUARD_MAX}`);
  if (!(Number.isInteger(r.rejectGrace) && r.rejectGrace >= 0)) err('routing.rejectGrace must be a non-negative integer');

  if (!Array.isArray(pack.stages) || !pack.stages.length) {
    err('pack.stages must list at least one stage');
    return done();
  }
  const stages = pack.stages;
  if (!stages.every(isObj)) {
    err('every stage must be an object');
    return done();
  }

  // Stage key → position, for `requires`, read only from well-formed keys.
  const position = new Map(stages.map((s, i) => [s.key, i + 1]));

  stages.forEach((stage, i) => {
    const n = i + 1;
    const where = `stage ${n}`;
    for (const k of unknownFields(stage, FIELDS.stage)) err(`${where}: unknown field "${k}"`);
    if (stage.key !== stageKey(n)) err(`${where}: key must be "${stageKey(n)}" (keys follow order)`);
    if (typeof stage.label !== 'string' || !stage.label.trim()) err(`${where}: label is required`);
    if (stage.name !== undefined && (typeof stage.name !== 'string' || !stage.name.trim())) {
      err(`${where}: name must be text`);
    }
    if (stage.signpost !== undefined && typeof stage.signpost !== 'string') err(`${where}: signpost must be text`);
    if (stage.loadGuard !== undefined && !isGuard(stage.loadGuard)) {
      err(`${where}: loadGuard must be a whole number from 1 to ${LOAD_GUARD_MAX}`);
    }

    if (!Array.isArray(stage.slots) || !stage.slots.length) {
      err(`${where}: slots must list at least one slot`);
    } else if (!stage.slots.every((s) => isObj(s) && typeof s.id === 'string' && SLOT_ID.test(s.id))) {
      err(`${where}: every slot needs an id of lowercase letters and _`);
    } else if (new Set(slotIds(stage)).size !== stage.slots.length) {
      err(`${where}: slot ids must be unique`);
    }
    const ids = Array.isArray(stage.slots) ? stage.slots.filter(isObj).map((s) => s.id) : [];
    for (const s of Array.isArray(stage.slots) ? stage.slots.filter(isObj) : []) {
      for (const k of unknownFields(s, FIELDS.slot)) {
        err(`${where}: slot "${s.id}" has an unknown field "${k}" — a slot carries only ${FIELDS.slot.join(', ')}`);
      }
      for (const flag of SLOT_FLAGS) {
        if (s[flag] !== undefined && typeof s[flag] !== 'boolean') err(`${where}: slot "${s.id}" — ${flag} must be true or false`);
      }
    }

    if (stage.requires !== undefined && !Array.isArray(stage.requires)) {
      err(`${where}: requires must be a list of stage keys`);
    }
    for (const req of Array.isArray(stage.requires) ? stage.requires : []) {
      const m = position.get(req);
      if (m == null) err(`${where}: requires unknown stage "${req}"`);
      else if (m >= n) err(`${where}: may only require an earlier stage, not "${req}"`);
    }

    if (stage.components !== undefined && !Array.isArray(stage.components)) {
      err(`${where}: components must be a list`);
    }
    const listed = new Set();
    for (const c of Array.isArray(stage.components) ? stage.components : []) {
      if (!isObj(c) || !COMPONENT_TYPES.has(c.type)) {
        err(`${where}: unknown component "${isObj(c) ? c.type : c}"`);
        continue;
      }
      // The engine reads the first of a type (componentOf), so a second is ignored
      // in silence — two cast gates on one stage would gate on only one of them.
      if (listed.has(c.type)) err(`${where}: "${c.type}" is listed twice`);
      listed.add(c.type);
      for (const k of unknownFields(c, COMPONENT_FIELDS[c.type])) err(`${where}: ${c.type} has an unknown field "${k}"`);
      if (c.type === 'castClarity' && !ids.includes(c.slot)) err(`${where}: castClarity.slot must be one of this stage's slots`);
      if (c.type === 'decision') {
        for (const s of DECISION_SLOTS) if (!ids.includes(s)) err(`${where}: the decision component needs slot "${s}"`);
      }
    }
    // The decision stage routes by its own rules (board, sharpness, close) and the
    // Router returns before it reads the cast, so a cast gate there would never
    // gate — and deriving a decision slot from the cast would let the cast close
    // the session (router-guard F1, 10.10.2026).
    if (hasComponent(stage, 'castClarity') && hasComponent(stage, 'decision')) {
      err(`${where}: castClarity cannot sit on the decision stage — the decision never reads the cast`);
    }
  });

  const carriers = (type) => stages.map((s, i) => (hasComponent(s, type) ? i + 1 : null)).filter(Boolean);
  const collectors = carriers('collector');
  const decisions = carriers('decision');
  // One cast per interview, so one gate on it: the derived slot is the cast's one
  // score, and two stages deriving it would be two scores of the same thing.
  for (const [type, at] of [['castClarity', carriers('castClarity')], ['collector', collectors], ['decision', decisions]]) {
    if (at.length > 1) err(`only one stage may carry "${type}"`);
  }
  // Today the decision is the only way an interview closes, so it must be last.
  // A pack that ends otherwise needs a closure component the engine does not have.
  if (!hasComponent(stages[stages.length - 1], 'decision')) {
    err('the last stage must carry the "decision" component (the only closure the engine has)');
  }
  // The board is built from the basket, and an either-or merge re-opens the stage
  // that filled it. Without a collector before it the board is empty and a merge
  // goes nowhere; on the same stage a merge would re-open the stage it is in.
  if (decisions.length === 1 && !(collectors.length === 1 && collectors[0] < decisions[0])) {
    err('the decision component needs a "collector" stage before it');
  }

  // A slot name means one thing. The barred and mental guards match by name (see
  // barredSlots), so a name barred in one stage and not in another would be barred
  // in both — or, read the other way, unbarred where someone meant it barred.
  const flagsOf = new Map();
  for (const s of stages.flatMap((st) => (Array.isArray(st.slots) ? st.slots.filter(isObj) : []))) {
    const sig = SLOT_FLAGS.map((f) => s[f] === true).join();
    if (flagsOf.has(s.id) && flagsOf.get(s.id) !== sig) {
      err(`slot "${s.id}" appears in two stages with different flags — the guards match slots by name`);
    }
    flagsOf.set(s.id, sig);
  }

  validateMap(pack, err);
  return done();
}

// The story map: where each slot's cube goes until the person relates the pieces
// himself, and which slot turns the scene into a journey. Optional — a pack with
// no map still draws what the model reports, every cube as 'other', in report order.
function validateMap(pack, err) {
  if (pack.map === undefined) return;
  if (!isObj(pack.map)) {
    err('map must be an object');
    return;
  }
  const barred = barredSlots(pack);
  // A reference the map can draw: a real slot, and never a barred one — a barred
  // slot listed here would be drawn by the one consumer told where to put it.
  const drawable = (at, ref) => {
    if (!isSlotOf(pack, ref)) {
      err(`${at}: "${ref}" is not a slot of this pack`);
      return false;
    }
    if (barred.has(parseSlotRef(pack, ref).slot)) {
      err(`${at}: "${ref}" is barred and is never drawn`);
      return false;
    }
    return true;
  };

  for (const k of unknownFields(pack.map, FIELDS.map)) err(`map: unknown field "${k}"`);
  const { narrative, timeline } = pack.map;
  if (narrative !== undefined && !Array.isArray(narrative)) err('map.narrative must be a list');
  const seen = new Set();
  (Array.isArray(narrative) ? narrative : []).forEach((row, i) => {
    const at = `map.narrative[${i}]`;
    if (!isObj(row) || !MAP_KINDS.has(row.kind)) {
      err(`${at}: kind must be one of ${[...MAP_KINDS].join(', ')}`);
      return;
    }
    for (const k of unknownFields(row, FIELDS.mapRow)) err(`${at}: unknown field "${k}"`);
    if (!Array.isArray(row.slots) || !row.slots.length) {
      err(`${at}: slots must list at least one slot`);
      return;
    }
    for (const ref of row.slots) {
      if (!drawable(at, ref)) continue;
      // One place per cube: listed twice, the later rank would silently win.
      if (seen.has(ref)) err(`${at}: "${ref}" is already placed on the map`);
      seen.add(ref);
    }
  });
  if (timeline !== undefined) drawable('map.timeline', timeline);
}

// ── The pack's texts ──
// What the engine needs from `prompts` to run an interview of this pack (the shape
// is documented in promptBuilder.js). Two texts are conditional and checked where
// they are used: `registrar` only while the registrar is switched on (engine.js
// knows the switch; this module must import nothing from core), and `judge`, which
// belongs to the acceptance harness and not to the interview (judge.js).
export const REQUIRED_PROMPTS = ['resistance', 'evaluator', 'summary', 'opener', 'board'];

export function validatePrompts(pack, prompts) {
  const errors = [];
  if (!isObj(prompts)) return { ok: false, errors: ['prompts is not an object'] };
  for (const k of REQUIRED_PROMPTS) {
    if (typeof prompts[k] !== 'string' || !prompts[k].trim()) errors.push(`prompts.${k} is missing`);
  }
  // The interviewer's guidelines: the shared super file and this interview's own.
  // Only the shape is checked here; how the two compose (locked and required
  // blocks) is checked by createEngine through guidelines.js — this module imports
  // nothing from core.
  const g = prompts.guidelines;
  if (!isObj(g) || typeof g.super !== 'string' || !g.super.trim() || typeof g.specific !== 'string' || !g.specific.trim()) {
    errors.push('prompts.guidelines must be { super, specific }, both non-empty');
  }
  // At least one real line: every prompt prints this list under its own heading.
  if (
    !Array.isArray(prompts.forbidden) ||
    !prompts.forbidden.every((l) => typeof l === 'string') ||
    !prompts.forbidden.some((l) => l.trim())
  ) {
    errors.push('prompts.forbidden must be a non-empty list of lines');
  }
  if (!isObj(prompts.stages)) {
    errors.push('prompts.stages is missing');
  } else {
    const keys = Array.isArray(pack?.stages) ? pack.stages.filter(isObj).map((s) => s.key) : [];
    for (const key of keys) {
      if (typeof prompts.stages[key] !== 'string' || !prompts.stages[key].trim()) {
        errors.push(`prompts.stages.${key} is missing — every stage needs its agent`);
      }
    }
    // A text for a stage the pack does not have would never run — almost always a
    // typo in a key, which is worth hearing about before an interview starts.
    for (const key of Object.keys(prompts.stages)) {
      if (!keys.includes(key)) errors.push(`prompts.stages.${key} names no stage of this pack`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function hasNonJson(v) {
  if (v === null) return false;
  const t = typeof v;
  if (t === 'function' || t === 'undefined' || t === 'symbol' || t === 'bigint') return true;
  if (t === 'number') return !Number.isFinite(v); // JSON turns NaN and Infinity into null
  if (t !== 'object') return false;
  if (Array.isArray(v)) return v.some(hasNonJson);
  if (Object.getPrototypeOf(v) !== Object.prototype) return true; // Set, Map, Date, class instances
  return Object.values(v).some(hasNonJson);
}

// Fail at load, not mid-interview. The pack the engine runs by default is checked
// once, when this module first loads, and a broken one stops the app before the
// first turn instead of mis-routing a real person's interview. At the bottom on
// purpose: everything validatePack reads is initialised by now.
const check = validatePack(DEFAULT_PACK);
if (!check.ok) {
  throw new Error(`The default interview pack cannot run: ${[...check.errors, ...check.limits].join('; ')}`);
}
