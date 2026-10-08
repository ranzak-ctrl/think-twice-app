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
]);

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

// ── Validation ──
// Returns { ok, errors, limits }, and never throws: an editor hands this whatever
// a person typed. Every entry is a sentence a pack author can act on.
//
//   errors — the pack breaks the contract. No engine could run it as written.
//   limits — the contract allows it, but THIS engine cannot run it yet: parts of
//            the turn loop (session.js) are still written for Think Twice's seven
//            stages. Each limit names what lifts it; phase 1 removes them as the
//            loop moves onto the pack. A pack is runnable only when both are empty.
const SLOT_ID = /^[a-z_]+$/; // gap targets are normalised against this shape (state.js normalizeTarget)
const isPosInt = (v) => Number.isInteger(v) && v >= 1;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isGuard = (v) => isPosInt(v) && v <= LOAD_GUARD_MAX;

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

  if (typeof pack.id !== 'string' || !pack.id.trim()) err('pack.id is required');

  const r = isObj(pack.routing) ? pack.routing : {};
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
    if (stage.key !== stageKey(n)) err(`${where}: key must be "${stageKey(n)}" (keys follow order)`);
    if (typeof stage.label !== 'string' || !stage.label.trim()) err(`${where}: label is required`);
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
    for (const c of Array.isArray(stage.components) ? stage.components : []) {
      if (!isObj(c) || !COMPONENT_TYPES.has(c.type)) {
        err(`${where}: unknown component "${isObj(c) ? c.type : c}"`);
        continue;
      }
      if (c.type === 'castClarity' && !ids.includes(c.slot)) err(`${where}: castClarity.slot must be one of this stage's slots`);
      if (c.type === 'decision') {
        for (const s of DECISION_SLOTS) if (!ids.includes(s)) err(`${where}: the decision component needs slot "${s}"`);
      }
    }
  });

  const carriers = (type) => stages.map((s, i) => (hasComponent(s, type) ? i + 1 : null)).filter(Boolean);
  const collectors = carriers('collector');
  const decisions = carriers('decision');
  for (const [type, at] of [['collector', collectors], ['decision', decisions]]) {
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

  // ── Engine limits (phase 1). session.js still routes material by
  // /^stage([1-7])\./, derives `stage1.actors` from the cast, and writes the board
  // and the session's close into `coverage.stage7`. Lifted by phase 1, slice 2.
  if (stages.length !== 7) {
    limits.push('the turn loop still assumes exactly 7 stages (session.js, until phase 1 slice 2)');
  }
  const cast = stages.flatMap((s, i) => (hasComponent(s, 'castClarity') ? [[i + 1, componentOf(s, 'castClarity')]] : []));
  if (cast.some(([n, c]) => n !== 1 || c.slot !== 'actors')) {
    limits.push('castClarity can only sit on stage 1 with slot "actors" (session.js, until phase 1 slice 2)');
  }

  return done();
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
