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

// ── Accessors. Stages are addressed by position, 1-based, as meta.currentStage is.
export const stageCount = (pack) => pack.stages.length;
export const stageAt = (pack, n) => pack.stages[n - 1];
export const stageKey = (n) => `stage${n}`;
export const slotIds = (stage) => (stage?.slots ?? []).map((s) => s.id);
export const componentOf = (stage, type) => (stage?.components ?? []).find((c) => c.type === type);
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
// Returns { ok, errors }. Every error is a sentence a pack author can act on.
const SLOT_ID = /^[a-z_]+$/; // gap targets are normalised against this shape (state.js normalizeTarget)
const isPosInt = (v) => Number.isInteger(v) && v >= 1;

export function validatePack(pack) {
  const errors = [];
  const err = (m) => errors.push(m);

  if (!pack || typeof pack !== 'object') return { ok: false, errors: ['pack is not an object'] };

  // Data, not code: anything JSON cannot carry (a function, undefined, a Set) is
  // either lost or changed by the round trip.
  try {
    if (JSON.stringify(JSON.parse(JSON.stringify(pack))) !== JSON.stringify(pack) || hasNonJson(pack)) {
      err('pack must be plain data — it holds something JSON cannot carry');
    }
  } catch {
    err('pack must be plain data — it does not serialise');
  }

  if (typeof pack.id !== 'string' || !pack.id.trim()) err('pack.id is required');

  const r = pack.routing ?? {};
  if (!(typeof r.softThreshold === 'number' && r.softThreshold > 0 && r.softThreshold <= 1)) {
    err('routing.softThreshold must be a number in (0, 1]');
  }
  if (!isPosInt(r.saturationLimit)) err('routing.saturationLimit must be a positive integer');
  if (!isPosInt(r.loadGuard)) err('routing.loadGuard must be a positive integer');
  if (!(Number.isInteger(r.rejectGrace) && r.rejectGrace >= 0)) err('routing.rejectGrace must be a non-negative integer');

  const stages = Array.isArray(pack.stages) ? pack.stages : [];
  if (!stages.length) err('pack.stages must list at least one stage');

  stages.forEach((stage, i) => {
    const n = i + 1;
    const where = `stage ${n}`;
    if (stage?.key !== stageKey(n)) err(`${where}: key must be "${stageKey(n)}" (keys follow order)`);
    if (typeof stage?.label !== 'string' || !stage.label.trim()) err(`${where}: label is required`);
    if (stage?.signpost !== undefined && typeof stage.signpost !== 'string') err(`${where}: signpost must be text`);
    if (stage?.loadGuard !== undefined && !isPosInt(stage.loadGuard)) err(`${where}: loadGuard must be a positive integer`);

    const ids = slotIds(stage);
    if (!ids.length) err(`${where}: at least one slot is required`);
    for (const id of ids) if (typeof id !== 'string' || !SLOT_ID.test(id)) err(`${where}: slot id "${id}" must be lowercase letters and _`);
    if (new Set(ids).size !== ids.length) err(`${where}: slot ids must be unique`);

    for (const req of stage?.requires ?? []) {
      const m = stageNumberOf(pack, req);
      if (m == null) err(`${where}: requires unknown stage "${req}"`);
      else if (m >= n) err(`${where}: may only require an earlier stage, not "${req}"`);
    }

    for (const c of stage?.components ?? []) {
      if (!COMPONENT_TYPES.has(c?.type)) err(`${where}: unknown component "${c?.type}"`);
      if (c?.type === 'castClarity' && !ids.includes(c.slot)) err(`${where}: castClarity.slot must be one of this stage's slots`);
      if (c?.type === 'decision') {
        for (const s of DECISION_SLOTS) if (!ids.includes(s)) err(`${where}: the decision component needs slot "${s}"`);
      }
    }
  });

  for (const type of ['collector', 'decision']) {
    if (stages.filter((s) => hasComponent(s, type)).length > 1) err(`only one stage may carry "${type}"`);
  }
  // Today the decision is the only way an interview closes, so it must be last.
  // A pack that ends otherwise needs a closure component the engine does not have.
  if (stages.length && !hasComponent(stages[stages.length - 1], 'decision')) {
    err('the last stage must carry the "decision" component (the only closure the engine has)');
  }

  return { ok: errors.length === 0, errors };
}

function hasNonJson(v) {
  if (v === null) return false;
  const t = typeof v;
  if (t === 'function' || t === 'undefined' || t === 'symbol' || t === 'bigint') return true;
  if (t !== 'object') return false;
  if (Array.isArray(v)) return v.some(hasNonJson);
  if (Object.getPrototypeOf(v) !== Object.prototype) return true; // Set, Map, Date, class instances
  return Object.values(v).some(hasNonJson);
}
